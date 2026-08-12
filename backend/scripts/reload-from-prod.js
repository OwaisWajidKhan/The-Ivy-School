// Full reload: wipe the local data tables and re-import every data table
// from the production PostgreSQL database (over SSH) so local == production.
//
// Preserved (local-only config / auth): users, roles, refresh_tokens, settings,
// audit_logs. Everything else is replaced with prod's current rows, preserving
// prod ids so attendance/cards/parent links line up.
//
// Run (from backend/):
//   npm.cmd run reload:prod
//   IVY_SYNC_NO_EXPORT=1 npm.cmd run reload:prod   (import only, reuse CSVs)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const HOST = process.env.IVY_PROD_HOST || '31.97.189.215';
const USER = process.env.IVY_PROD_USER || 'root';
const KEY = process.env.IVY_PROD_SSH_KEY || path.join(os.homedir(), '.ssh', 'id_ed25519');
const SYNC_DIR = process.env.IVY_SYNC_CSV_DIR || path.join(__dirname, '..', 'data', 'sync');
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'school.db');

const TABLES = [
  { file: 'classes.csv',        table: 'classes',        cols: ['id', 'name', 'description', 'created_at'] },
  { file: 'sections.csv',       table: 'sections',       cols: ['id', 'class_id', 'name'] },
  { file: 'departments.csv',    table: 'departments',    cols: ['id', 'name', 'description', 'created_at'] },
  { file: 'designations.csv',   table: 'designations',   cols: ['id', 'name', 'department_id', 'description', 'created_at'] },
  { file: 'shifts.csv',         table: 'shifts',         cols: ['id', 'name', 'start_time', 'end_time', 'grace_minutes', 'half_day_threshold_hours', 'description'] },
  { file: 'holidays.csv',       table: 'holidays',       cols: ['id', 'name', 'date', 'type', 'description', 'created_at'] },
  { file: 'students.csv',       table: 'students',       cols: ['id', 'student_id', 'admission_number', 'rfid_uid', 'rfid_uid_2', 'full_name', 'father_name', 'class_id', 'section_id', 'roll_number', 'dob', 'gender', 'phone', 'parent_contact', 'address', 'status', 'photo', 'family_id', 'email', 'created_at'] },
  { file: 'employees.csv',      table: 'employees',      cols: ['id', 'employee_id', 'rfid_uid', 'rfid_uid_2', 'full_name', 'cnic', 'mobile', 'department_id', 'designation', 'joining_date', 'salary', 'shift_id', 'working_hours', 'overtime_rate', 'leave_balance', 'status', 'photo', 'designation_id', 'created_at'] },
  { file: 'rfid_cards.csv',     table: 'rfid_cards',     cols: ['id', 'uid', 'card_type', 'person_id', 'assigned_at', 'status', 'created_at'] },
  { file: 'devices.csv',        table: 'devices',        cols: ['id', 'device_name', 'device_id', 'location', 'status', 'last_sync_time', 'created_at'] },
  { file: 'attendance_logs.csv', table: 'attendance_logs', cols: ['id', 'person_type', 'person_id', 'device_id', 'location', 'direction', 'scan_time', 'date', 'raw_uid', 'gate_pass_id', 'created_at'] },
  { file: 'attendance_summary.csv', table: 'attendance_summary', cols: ['id', 'person_type', 'person_id', 'date', 'in_time', 'out_time', 'status', 'working_hours', 'overtime_hours', 'late_minutes', 'early_exit_minutes', 'is_working_day'] },
  { file: 'notifications.csv',  table: 'notifications',  cols: ['id', 'recipient_type', 'recipient_id', 'channel', 'type', 'title', 'message', 'read', 'created_at'] },
  { file: 'parents.csv',        table: 'parents',        cols: ['id', 'student_id', 'relation', 'full_name', 'phone', 'email', 'education', 'profession', 'employer', 'marital_status', 'address', 'created_at'] },
  { file: 'gate_passes.csv',    table: 'gate_passes',    cols: ['id', 'student_id', 'pass_no', 'reason', 'reason_note', 'guardian_name', 'guardian_cnic', 'guardian_relation', 'guardian_contact', 'exit_date', 'status', 'requested_by', 'approved_by', 'approved_at', 'used_at', 'verified_by', 'qr_token', 'created_at'] }
];

// Wipe order respects local FKs (children before parents).
const WIPE = [
  'attendance_logs', 'attendance_summary', 'notifications',
  'rfid_cards', 'parents', 'gate_passes', 'payroll',
  'teacher_assignments', 'employee_documents',
  'students', 'employees',
  'sections', 'designations', 'devices', 'shifts', 'holidays', 'departments', 'classes'
];

function runRemote(script) {
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  return execFileSync('ssh',
    ['-i', KEY, '-o', 'StrictHostKeyChecking=no', `${USER}@${HOST}`, `echo ${b64} | base64 -d | bash`],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

function exportProd() {
  fs.mkdirSync(SYNC_DIR, { recursive: true });
  for (const t of TABLES) {
    const cols = t.cols.join(', ');
    const script = `sudo -u postgres psql -d ivy_school -c "COPY (SELECT ${cols} FROM ${t.table} ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true)"`;
    const out = runRemote(script);
    fs.writeFileSync(path.join(SYNC_DIR, t.file), out);
    console.log(`Exported ${t.file} (${(out.match(/\r?\n/g) || []).length} lines)`);
  }
}

// Minimal RFC-4180-ish CSV parser: quoted fields, doubled quotes, embedded newlines.
function parseCsv(text) {
  const out = [];
  let row = [], field = '', inQ = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\r') {
      // ignore (handled by the following \n)
    } else if (ch === '\n') {
      row.push(field); field = '';
      out.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); out.push(row); }
  return out;
}

function readCsv(file) {
  const text = fs.readFileSync(path.join(SYNC_DIR, file), 'utf8');
  const raw = parseCsv(text);
  const header = raw[0].map(h => String(h).trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    if (!cells.length) continue;
    const o = {};
    header.forEach((h, j) => { o[h] = (cells[j] ?? '').trim(); });
    rows.push(o);
  }
  return { header, idx, rows };
}

function presentColumns(db, table) {
  const cols = {};
  for (const row of db.prepare(`PRAGMA table_info(${table})`).all()) cols[row.name] = true;
  return cols;
}

function importAll() {
  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('BEGIN');

  // 1. Wipe all data tables (preserved tables excluded).
  for (const t of WIPE) {
    const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if (has) db.exec(`DELETE FROM ${t}`);
  }
  console.log('Wiped data tables:', WIPE.length);

  let totalImported = 0;
  for (const t of TABLES) {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t.table);
    if (!hasTable) { console.log(`SKIP ${t.table}: no such table locally`); continue; }
    const file = path.join(SYNC_DIR, t.file);
    if (!fs.existsSync(file)) { console.log(`SKIP ${t.table}: ${t.file} missing`); continue; }

    // Only import columns that actually exist on the local table.
    const localCols = presentColumns(db, t.table);
    const cols = t.cols.filter(c => localCols[c]);
    if (!cols.includes('id')) cols.unshift('id');

    const { rows } = readCsv(t.file);
    const ins = db.prepare(
      `INSERT OR REPLACE INTO ${t.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    let ok = 0, skip = 0;
    for (const r of rows) {
      const values = cols.map(c => r[c] === '' || r[c] === null || r[c] === undefined ? null : r[c]);
      try { ins.run(...values); ok++; }
      catch (e) { skip++; console.log(`  ${t.table} row id=${r.id} failed: ${e.message}`); }
    }
    console.log(`${t.table}: imported ${ok} row(s)` + (skip ? `, skipped ${skip}` : ''));
    totalImported += ok;
  }

  // Reset AUTOINCREMENT sequences to prod max ids.
  for (const t of TABLES) {
    const m = db.prepare(`SELECT MAX(id) AS m FROM ${t.table}`).get().m;
    if (m) {
      try { db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ?").run(m, t.table); }
      catch (e) { /* no sqlite_sequence entry */ }
    }
  }

  db.exec('COMMIT');
  db.close();

  console.log(`\n=== Reload complete === total rows imported: ${totalImported}`);
}

if (process.env.IVY_SYNC_NO_EXPORT || process.argv.includes('--import-only')) {
  importAll();
} else {
  exportProd();
  importAll();
}