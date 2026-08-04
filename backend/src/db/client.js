// Unified async DB facade.
//
// Backends:
//  - Turso (Vercel/serverless): uses @libsql/client over HTTP. Selected when
//    TURSO_DATABASE_URL is set. Persistent, multi-instance safe.
//  - Local (dev / packaged exe): node:sqlite (or bun:sqlite in the exe) via
//    driver.js. Preserves the original file-based behaviour.
//
// The facade exposes a node:sqlite-compatible surface:
//   db.prepare(sql).get(...args) / .all(...args) / .run(...args)
//   db.exec(sql)
//   db.batch(stmts, mode)
//   db.close()
// Every method returns a Promise. `db.prepare` itself stays synchronous so the
// existing `await db.prepare(...).get(...)` call sites keep working unchanged.

const fs = require('fs');
const config = require('../config');
const { SCHEMA, SCHEMA_PG, MIGRATIONS } = require('./schema-ddl');

const TURSO = !!process.env.TURSO_DATABASE_URL;
const PG = !TURSO && !!process.env.DATABASE_URL;

let impl = null;
let schemaPromise = null;
let readyPromise = null;

function normalize(v) {
  if (typeof v === 'bigint') return Number(v);
  return v;
}

// Split a SQL script into individual statements on top-level semicolons,
// ignoring semicolons inside single-quoted string literals.
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { cur += sql[++i]; }
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === ';') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Convert SQLite positional ? placeholders to Postgres $1..$n, skipping '?'
// characters inside single-quoted string literals.
function pgParams(sql) {
  let n = 0;
  let out = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { out += sql[++i]; }
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; out += ch; continue; }
    if (ch === '?') { out += '$' + (++n); continue; }
    out += ch;
  }
  return { sql: out, count: n };
}

// Translate SQLite-flavoured statements for Postgres:
//   - INSERT OR IGNORE INTO ... -> INSERT INTO ... ON CONFLICT DO NOTHING
//   - positional ? -> $1..$n
// `datetime('now')` needs no translation because the PG schema creates a
// `datetime()` shim function that returns the same UTC timestamp string.
function translatePg(sql) {
  const ignore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  let s = ignore ? sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO') : sql;
  const { sql: out, count } = pgParams(s);
  return { sql: ignore ? `${out} ON CONFLICT DO NOTHING` : out, count };
}

function postgresDriver() {
  const pg = require('pg');
  // int8 (bigint) is returned as a string by node-postgres; the app expects JS
  // numbers (ids, counts). Precision loss beyond 2^53 is irrelevant here.
  pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', (e) => console.error('PostgreSQL pool error:', e.message));
  return { pool };
}

function localDriver() {
  const { DatabaseSync, driverName } = require('./driver');
  const db = new DatabaseSync(config.dbFile);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return { db, driverName };
}

function initImpl() {
  if (impl) return impl;
  if (TURSO) {
    const { createClient } = require('@libsql/client');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined
    });
    impl = {
      type: 'turso',
      client,
      tx: null,
      async exec(sql) {
        const s = String(sql).trim();
        if (/^BEGIN\b/i.test(s)) {
          if (this.tx) await this.tx.commit().catch(() => {});
          this.tx = await client.transaction('write').catch(() => null);
          return;
        }
        if (/^COMMIT\b/i.test(s)) {
          if (this.tx) {
            const t = this.tx;
            this.tx = null;
            await t.commit().catch(() => {});
          }
          return;
        }
        if (/^ROLLBACK\b/i.test(s)) {
          if (this.tx) {
            const t = this.tx;
            this.tx = null;
            await t.rollback().catch(() => {});
          }
          return;
        }
        if (this.tx) {
          // libsql transactions only run a single statement per execute(), so
          // split multi-statement payloads (e.g. the full schema DDL) up.
          for (const stmt of splitStatements(s)) {
            if (stmt) await this.tx.execute(stmt);
          }
        } else {
          await client.executeMultiple(sql);
        }
      },
      async run(sql, args) {
        const r = this.tx
          ? await this.tx.execute({ sql, args })
          : await client.execute({ sql, args });
        const rows = (r.rows || []).map((row) => {
          const o = {};
          for (const k of Object.keys(row)) o[k] = normalize(row[k]);
          return o;
        });
        return {
          rows,
          rowsAffected: normalize(r.rowsAffected ?? 0),
          lastInsertRowid: normalize(r.lastInsertRowid ?? 0)
        };
      },
      async get(sql, args) {
        const r = await this.run(sql, args);
        return r.rows[0];
      },
      async all(sql, args) {
        const r = await this.run(sql, args);
        return r.rows;
      }
    };
  } else if (PG) {
    const { pool } = postgresDriver();
    impl = {
      type: 'postgres',
      pool,
      tx: null,
      idTables: null,
      async hasId(table) {
        if (!this.idTables) {
          const sql = "SELECT table_name FROM information_schema.columns WHERE column_name = 'id' AND table_schema = current_schema()";
          const r = this.tx
            ? await this.tx.query(sql)
            : await pool.query(sql);
          this.idTables = new Set(r.rows.map((x) => x.table_name));
        }
        return this.idTables.has(table);
      },
      async exec(sql) {
        const s = String(sql).trim();
        if (/^BEGIN\b/i.test(s)) {
          if (this.tx) return;
          const c = await pool.connect();
          await c.query('BEGIN');
          this.tx = c;
          return;
        }
        if (/^COMMIT\b/i.test(s)) {
          if (this.tx) {
            const t = this.tx;
            this.tx = null;
            try { await t.query('COMMIT'); } finally { t.release(); }
          }
          return;
        }
        if (/^ROLLBACK\b/i.test(s)) {
          if (this.tx) {
            const t = this.tx;
            this.tx = null;
            try { await t.query('ROLLBACK'); } finally { t.release(); }
          }
          return;
        }
        const c = this.tx || await pool.connect();
        try {
          for (const stmt of splitStatements(s)) {
            if (stmt) await c.query(stmt);
          }
        } finally {
          if (!this.tx) c.release();
        }
      },
      async run(sql, args) {
        const isInsert = /^\s*INSERT/i.test(String(sql).trim());
        const t = translatePg(sql);
        let q = t.sql;
        let returningId = false;
        if (isInsert) {
          const m = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(q);
          if (m && await this.hasId(m[1])) {
            q = `${q} RETURNING id`;
            returningId = true;
          }
        }
        const c = this.tx || await pool.connect();
        try {
          const r = await c.query(q, Array.from(args).slice(0, t.count));
          return {
            rows: [],
            rowsAffected: normalize(r.rowCount ?? 0),
            lastInsertRowid: returningId ? normalize((r.rows && r.rows[0] && r.rows[0].id) ?? 0) : 0
          };
        } finally {
          if (!this.tx) c.release();
        }
      },
      async get(sql, args) {
        const t = translatePg(sql);
        const c = this.tx || await pool.connect();
        try {
          const r = await c.query(t.sql, Array.from(args).slice(0, t.count));
          return r.rows[0];
        } finally {
          if (!this.tx) c.release();
        }
      },
      async all(sql, args) {
        const t = translatePg(sql);
        const c = this.tx || await pool.connect();
        try {
          const r = await c.query(t.sql, Array.from(args).slice(0, t.count));
          return r.rows;
        } finally {
          if (!this.tx) c.release();
        }
      }
    };
  } else {
    const { db } = localDriver();
    impl = {
      type: 'local',
      db,
      exec(sql) {
        db.exec(sql);
      },
      run(sql, args) {
        const stmt = db.prepare(sql);
        const r = args.length ? stmt.run(...args) : stmt.run();
        return {
          rows: [],
          rowsAffected: normalize(r.changes ?? 0),
          lastInsertRowid: normalize(r.lastInsertRowid ?? 0)
        };
      },
      get(sql, args) {
        const stmt = db.prepare(sql);
        return args.length ? stmt.get(...args) : stmt.get();
      },
      all(sql, args) {
        const stmt = db.prepare(sql);
        return args.length ? stmt.all(...args) : stmt.all();
      }
    };
  }
  return impl;
}

// Applies the full schema + additive migrations. Memoized; safe to call many times.
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const i = initImpl();
      await i.exec(i.type === 'postgres' ? SCHEMA_PG : SCHEMA);
      for (const m of MIGRATIONS) {
        try {
          const cols = i.type === 'postgres'
            ? await i.all('SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?', [m.table])
            : await i.all(`PRAGMA table_info(${m.table})`, []);
          if (!cols.some((c) => c && c.name === m.column)) {
            await i.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.ddl};`);
          }
        } catch (e) {
          // ignore concurrent / duplicate errors
        }
      }
    })().catch((e) => {
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}

// Schema + auto-seed (if the users table is empty) + Phase-2 reference data.
// Memoized so concurrent first requests only seed once.
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await ensureSchema();
      const timezone = require('../utils/timezone');
      await timezone.initTimezone();
      const row = await impl.get('SELECT COUNT(*) AS c FROM users', []);
      const seed = require('./seed');
      if (!row || Number(row.c) === 0) {
        console.log('Empty database detected — seeding...');
        try {
          await seed();
        } catch (e) {
          // Roll back any open transaction (PG leaves the tx client checked out
          // otherwise). Harmless no-op for SQLite/Turso.
          try { await db.exec('ROLLBACK'); } catch (_) {}
          throw e;
        }
      } else {
        await seed.ensurePhase2ReferenceData();
        await seed.ensureRoleModel();
      }
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

function makeStatement(sql) {
  const i = initImpl();
  if (i.type === 'turso') {
    return {
      get: async (...args) => {
        await ensureSchema();
        const r = await i.run(sql, Array.from(args));
        return r.rows[0];
      },
      all: async (...args) => {
        await ensureSchema();
        const r = await i.run(sql, Array.from(args));
        return r.rows;
      },
      run: async (...args) => {
        await ensureSchema();
        const r = await i.run(sql, Array.from(args));
        return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
      }
    };
  }
  return {
    get: async (...args) => {
      await ensureSchema();
      return i.get(sql, Array.from(args));
    },
    all: async (...args) => {
      await ensureSchema();
      return i.all(sql, Array.from(args));
    },
    run: async (...args) => {
      await ensureSchema();
      const r = await i.run(sql, Array.from(args));
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid };
    }
  };
}

const db = {
  prepare(sql) {
    return makeStatement(sql);
  },
  exec(sql) {
    return initImpl().exec(sql);
  },
  async batch(stmts, mode) {
    await ensureSchema();
    const i = initImpl();
    if (i.type === 'turso') {
      const list = stmts.map((s) =>
        typeof s === 'string' ? s : { sql: s.sql, args: s.args || [] }
      );
      return i.client.batch(list, mode || 'write');
    }
    i.exec('BEGIN');
    try {
      for (const s of stmts) {
        if (typeof s === 'string') await i.exec(s);
        else await i.run(s.sql, s.args || []);
      }
      await i.exec('COMMIT');
    } catch (e) {
      await i.exec('ROLLBACK');
      throw e;
    }
  },
  close() {
    if (!impl) return;
    if (impl.type === 'turso') impl.client.close();
    else if (impl.type === 'postgres') impl.pool.end();
    else impl.db.close();
  },
  backend: () => (impl ? impl.type : TURSO ? 'turso' : PG ? 'postgres' : 'local')
};

module.exports = { db, ensureReady, ensureSchema };
