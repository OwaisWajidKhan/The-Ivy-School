const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'school.db');
const SYNC_DIR = path.join(__dirname, '..', 'data', 'sync');

fs.mkdirSync(SYNC_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(SYNC_DIR, `school.local-backup-${ts}.db`);
const db = new DatabaseSync(DB_FILE);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
console.log('Backup written:', out, `(${fs.statSync(out).size} bytes)`);