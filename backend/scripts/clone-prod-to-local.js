// Full mirror: clone the ENTIRE production PostgreSQL database down to the
// local SQLite database (backend/data/school.db) so local == production.
//
// Exports every table from production over SSH (read-only COPY to STDOUT) as
// CSVs into backend/data/sync/, wipes the local data, and re-imports everything
// preserving production ids so attendance / parents / cards / payroll line up.
//
// SAFETY: this script performs NO writes to production. It only runs SELECT
// (COPY ... TO STDOUT) on the production database. Production is always the
// source; local is always the destination. Never run anything that writes to
// the production DB.
//
// Cloned tables (every table EXCEPT refresh_tokens, which holds ephemeral
// session tokens that are meaningless/sensitive to reuse):
//   roles, users, departments, classes, sections, designations, shifts,
//   devices, holidays, subjects, settings, students, employees, rfid_cards,
//   parents, gate_passes, payroll, teacher_assignments, employee_documents,
//   leaves, attendance_logs, attendance_summary, notifications, audit_logs
//
// Run (from backend/):
//   npm.cmd run clone:prod                       -- full run (export + import)
//   IVY_SYNC_NO_EXPORT=1 npm.cmd run clone:prod  -- import only, reuse CSVs
//   IVY_PROD_HOST=x IVY_PROD_USER=root IVY_PROD_SSH_KEY=... npm.cmd run clone:prod

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

// Every production table to clone, in FK-safe IMPORT order (parents first).
// `id` is the PK column used for AUTOINCREMENT restoration (settings uses 'key').
const TABLES = [
  { file: 'roles.csv',               table: 'roles',               id: 'id', cols: ['id', 'name', 'description', 'permissions', 'created_at'] },
  { file: 'users.csv',               table: 'users',               id: 'id', cols: ['id', 'username', 'email', 'password_hash', 'role_id', 'person_type', 'person_id', 'status', 'failed_attempts', 'last_login_at', 'created_at', 'avatar'] },
  { file: 'departments.csv',         table: 'departments',         id: 'id', cols: ['id', 'name', 'description', 'created_at'] },
  { file: 'classes.csv',             table: 'classes',             id: 'id', cols: ['id', 'name', 'description', 'created_at'] },
  { file: 'sections.csv',            table: 'sections',            id: 'id', cols: ['id', 'class_id', 'name'] },
  { file: 'designations.csv',        table: 'designations',        id: 'id', cols: ['id', 'name', 'department_id', 'description', 'created_at'] },
  { file: 'shifts.csv',              table: 'shifts',              id: 'id', cols: ['id', 'name', 'start_time', 'end_time', 'grace_minutes', 'half_day_threshold_hours', 'description'] },
  { file: 'devices.csv',             table: 'devices',             id: 'id', cols: ['id', 'device_name', 'device_id', 'location', 'status', 'last_sync_time', 'created_at'] },
  { file: 'holidays.csv',            table: 'holidays',            id: 'id', cols: ['id', 'name', 'date', 'type', 'description', 'created_at'] },
  { file: 'subjects.csv',            table: 'subjects',            id: 'id', cols: ['id', 'name', 'code', 'description', 'created_at'] },
  { file: 'settings.csv',            table: 'settings',            id: 'key', cols: ['key', 'value', 'updated_at'] },
  { file: 'employees.csv',           table: 'employees',           id: 'id', cols: ['id', 'employee_id', 'rfid_uid', 'full_name', 'cnic', 'mobile', 'department_id', 'designation', 'joining_date', 'salary', 'shift_id', 'working_hours', 'overtime_rate', 'leave_balance', 'status', 'photo', 'created_at', 'designation_id', 'rfid_uid_2'] },
  { file: 'students.csv',            table: 'students',            id: 'id', cols: ['id', 'student_id', 'admission_number', 'rfid_uid', 'full_name', 'father_name', 'class_id', 'section_id', 'roll_number', 'dob', 'gender', 'phone', 'parent_contact', 'address', 'status', 'photo', 'created_at', 'family_id', 'email', 'rfid_uid_2'] },
  { file: 'rfid_cards.csv',          table: 'rfid_cards',          id: 'id', cols: ['id', 'uid', 'card_type', 'person_id', 'assigned_at', 'status', 'created_at'] },
  { file: 'parents.csv',             table: 'parents',             id: 'id', cols: ['id', 'student_id', 'relation', 'full_name', 'phone', 'email', 'education', 'profession', 'employer', 'marital_status', 'address', 'created_at'] },
  { file: 'gate_passes.csv',         table: 'gate_passes',         id: 'id', cols: ['id', 'student_id', 'pass_no', 'reason', 'reason_note', 'guardian_name', 'guardian_cnic', 'guardian_relation', 'guardian_contact', 'exit_date', 'status', 'requested_by', 'approved_by', 'approved_at', 'used_at', 'verified_by', 'qr_token', 'created_at'] },
  { file: 'payroll.csv',             table: 'payroll',             id: 'id', cols: ['id', 'employee_id', 'month', 'year', 'working_days', 'present_days', 'absent_days', 'late_days', 'half_days', 'leave_days', 'overtime_hours', 'total_working_hours', 'base_salary', 'overtime_pay', 'leave_adjustment', 'deductions', 'bonuses', 'net_salary', 'notes', 'generated_at', 'status', 'approved_by', 'approved_at'] },
  { file: 'teacher_assignments.csv', table: 'teacher_assignments', id: 'id', cols: ['id', 'teacher_id', 'subject_id', 'class_id', 'section_id', 'created_at'] },
  { file: 'employee_documents.csv',  table: 'employee_documents',  id: 'id', cols: ['id', 'employee_id', 'doc_type', 'title', 'file_path', 'uploaded_by', 'created_at'] },
  { file: 'leaves.csv',              table: 'leaves',              id: 'id', cols: ['id', 'person_type', 'person_id', 'leave_type', 'start_date', 'end_date', 'days', 'reason', 'document', 'status', 'approved_by', 'reviewed_at', 'created_at'] },
  { file: 'attendance_logs.csv',     table: 'attendance_logs',     id: 'id', cols: ['id', 'person_type', 'person_id', 'device_id', 'location', 'direction', 'scan_time', 'date', 'raw_uid', 'created_at', 'gate_pass_id'] },
  { file: 'attendance_summary.csv',  table: 'attendance_summary',  id: 'id', cols: ['id', 'person_type', 'person_id', 'date', 'in_time', 'out_time', 'status', 'working_hours', 'overtime_hours', 'late_minutes', 'early_exit_minutes', 'is_working_day'] },
  { file: 'notifications.csv',       table: 'notifications',       id: 'id', cols: ['id', 'recipient_type', 'recipient_id', 'channel', 'type', 'title', 'message', 'read', 'created_at'] },
  { file: 'audit_logs.csv',          table: 'audit_logs',          id: 'id', cols: ['id', 'user_id', 'username', 'action', 'entity_type', 'entity_id', 'details', 'ip', 'created_at'] }
];

// Wipe order respects local FKs (children before parents). refresh_tokens is
// wiped but never re-imported (ephemeral session tokens).
const WIPE = [
  'refresh_tokens',
  'attendance_logs', 'attendance_summary', 'notifications',
  'teacher_assignments', 'employee_documents', 'leaves', 'rfid_cards',
  'parents', 'gate_passes', 'payroll', 'audit_logs',
  'students', 'employees',
  'sections', 'designations', 'subjects', 'devices', 'shifts', 'holidays',
  'departments', 'classes', 'users', 'roles', 'settings'
];

function runRemote(script) {
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  return execFileSync('ssh',
    ['-i', KEY, '-o', 'StrictHostKeyChecking=no', `${USER}@${HOST}`, `echo ${b64} | base64 -d | bash`],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

// Export each table from production with a read-only COPY ... TO STDOUT.
function exportProd() {
  fs.mkdirSync(SYNC_DIR, { recursive: true });
  for (const t of TABLES) {
    const cols = t.cols.join(', ');
    const script = `sudo -u postgres psql -d ivy_school -c "COPY (SELECT ${cols} FROM ${t.table} ORDER BY ${t.id}) TO STDOUT WITH (FORMAT csv, HEADER true)"`;
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
  const header = (raw[0] || []).map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    if (!cells.length) continue;
    const o = {};
    header.forEach((h, j) => { o[h] = (cells[j] ?? '').trim(); });
    // Skip fully-empty rows.
    if (header.every(h => o[h] === '')) continue;
    rows.push(o);
  }
  return rows;
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

  const before = {};
  for (const t of TABLES) {
    const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t.table);
    if (has) {
      try { before[t.table] = db.prepare(`SELECT COUNT(*) AS c FROM ${t.table}`).get().c; }
      catch (e) { before[t.table] = 0; }
    }
  }

  // 1. Wipe all cloned tables in FK-safe order.
  for (const t of WIPE) {
    const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if (has) db.exec(`DELETE FROM ${t}`);
  }
  console.log('Wiped local data tables:', WIPE.length);

  // 2. Import each table, filtering to columns that exist locally.
  let totalImported = 0;
  const verified = {};
  for (const t of TABLES) {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t.table);
    if (!hasTable) { console.log(`SKIP ${t.table}: no such table locally`); continue; }
    const file = path.join(SYNC_DIR, t.file);
    if (!fs.existsSync(file)) { console.log(`SKIP ${t.table}: ${t.file} missing`); continue; }

    const localCols = presentColumns(db, t.table);
    const cols = t.cols.filter(c => localCols[c]);

    const rows = readCsv(t.file);
    const ins = db.prepare(
      `INSERT OR REPLACE INTO ${t.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    let ok = 0, fail = 0;
    for (const r of rows) {
      const values = cols.map(c => (r[c] === '' || r[c] === null || r[c] === undefined) ? null : r[c]);
      try { ins.run(...values); ok++; }
      catch (e) { fail++; console.log(`  ${t.table} row id=${r[t.id]} failed: ${e.message}`); }
    }
    console.log(`${t.table}: imported ${ok} row(s)` + (fail ? `, failed ${fail}` : '') + (before[t.table] != null ? ` (was ${before[t.table]})` : ''));
    totalImported += ok;
    verified[t.table] = ok;
  }

  // 3. Restore AUTOINCREMENT sequences to production max ids. settings uses a
  //    text 'key' PK (no id sequence) and is skipped.
  for (const t of TABLES) {
    if (t.id !== 'id') continue;
    const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t.table);
    if (!has) continue;
    try {
      const m = db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM ${t.table}`).get().m;
      if (m) {
        try { db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ?").run(m, t.table); }
        catch (e) { /* no sqlite_sequence row yet */ }
      }
    } catch (e) { /* table has no id column */ }
  }

  db.exec('COMMIT');
  db.close();

  console.log(`\n=== Clone complete === total rows imported: ${totalImported}`);
}

if (process.env.IVY_SYNC_NO_EXPORT || process.argv.includes('--import-only')) {
  importAll();
} else {
  exportProd();
  importAll();
}
