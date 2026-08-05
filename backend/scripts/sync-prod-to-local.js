// One-command production -> local sync for The Ivy School.
//
// Exports students, rfid_cards, classes and sections from the production
// PostgreSQL database (over SSH) as CSVs into backend/data/sync/, then imports
// them into the local SQLite database (backend/data/school.db).
//
// Design notes:
//   - Students keep their production IDs so future attendance / cards syncs
//     line up (local tables are expected to be empty of students).
//   - Class/section are matched by NAME, since ids can differ between
//     environments (prod currently uses 11-22 for classes).
//   - Re-runnable: existing student ids / card uids are skipped (INSERT OR
//     IGNORE). Fixes the AUTOINCREMENT sequence after import.
//
// Run:  npm.cmd run sync:prod                          (from backend/)
//       IVY_SYNC_NO_EXPORT=1 npm.cmd run sync:prod     (import only, reuse CSVs)
//       IVY_PROD_HOST=x IVY_PROD_USER=root IVY_PROD_SSH_KEY=... npm.cmd run sync:prod

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

const STUDENT_COLS = [
  'id', 'student_id', 'admission_number', 'rfid_uid', 'rfid_uid_2',
  'full_name', 'father_name', 'class_id', 'section_id', 'roll_number',
  'dob', 'gender', 'phone', 'parent_contact', 'address', 'status',
  'photo', 'family_id', 'email', 'created_at'
];

const STUDENT_QUERY = `
  SELECT s.id, s.student_id, s.admission_number, s.rfid_uid, s.rfid_uid_2,
         s.full_name, s.father_name, s.class_id, s.section_id, s.roll_number,
         s.dob, s.gender, s.phone, s.parent_contact, s.address, s.status,
         s.photo, s.family_id, s.email, s.created_at,
         c.name AS class_name, sec.name AS section_name
  FROM students s
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN sections sec ON sec.id = s.section_id
  ORDER BY s.id`;

const TABLES = [
  { file: 'students.csv', query: STUDENT_QUERY },
  { file: 'rfid_cards.csv', query: 'SELECT uid, card_type, person_id, assigned_at, status, created_at FROM rfid_cards ORDER BY id' },
  { file: 'classes.csv', query: 'SELECT id, name FROM classes ORDER BY id' },
  { file: 'sections.csv', query: 'SELECT id, class_id, name FROM sections ORDER BY id' }
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
    const script = `sudo -u postgres psql -d ivy_school -c "COPY (${t.query}) TO STDOUT WITH (FORMAT csv, HEADER true)"`;
    const out = runRemote(script);
    fs.writeFileSync(path.join(SYNC_DIR, t.file), out);
    console.log(`Exported ${t.file} (${(out.match(/\r?\n/g) || []).length} lines)`);
  }
}

// Minimal RFC-4180-ish CSV parser: quoted fields, doubled quotes, embedded
// newlines, CRLF. Returns an array of row arrays.
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
    if (o.id === '' && o.student_id === '' && o.uid === '' && o.name === '') continue;
    rows.push(o);
  }
  return { header, idx, rows };
}

function importProd() {
  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('BEGIN');

  const presentCols = {};
  for (const row of db.prepare('PRAGMA table_info(students)').all()) presentCols[row.name] = true;
  const cols = STUDENT_COLS.filter(c => presentCols[c]);
  const insStudent = db.prepare(
    `INSERT OR IGNORE INTO students (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);

  const classes = {};
  for (const r of db.prepare('SELECT id, name FROM classes').all()) classes[r.name] = r.id;
  const sections = {};
  for (const r of db.prepare('SELECT id, class_id, name FROM sections').all()) sections[`${r.class_id}:${r.name}`] = r.id;

  const { rows } = readCsv('students.csv');
  let added = 0, skipped = 0, unmapped = 0, noId = 0;
  for (const r of rows) {
    const prodId = r.id ? Number(r.id) : null;
    if (!prodId || !r.student_id) { noId++; continue; }
    let classId = null, sectionId = null;
    if (r.class_name) {
      const cid = classes[r.class_name];
      if (cid) {
        classId = cid;
        sectionId = (r.section_name && sections[`${cid}:${r.section_name}`]) || null;
      } else {
        unmapped++;
      }
    }
    const info = insStudent.run(
      prodId, r.student_id, r.admission_number || null, r.rfid_uid || null,
      r.rfid_uid_2 || null, r.full_name, r.father_name || null, classId, sectionId,
      r.roll_number ? Number(r.roll_number) : null, r.dob || null, r.gender || null,
      r.phone || null, r.parent_contact || null, r.address || null,
      r.status || 'active', r.photo || null, r.family_id || null, r.email || null,
      r.created_at || null);
    if (info.changes > 0) added++; else skipped++;
  }

  let cardsAdded = 0, cardsSkipped = 0, cardsOrphan = 0;
  const hasCardTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rfid_cards'").get();
  if (hasCardTable) {
    const insCard = db.prepare(
      'INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status, created_at) VALUES (?,?,?,?,?,?)');
    const cardRows = readCsv('rfid_cards.csv');
    for (const r of cardRows.rows) {
      const uid = r.uid;
      const pid = r.person_id ? Number(r.person_id) : null;
      if (!uid || !pid) continue;
      if (!db.prepare('SELECT id FROM students WHERE id = ?').get(pid)) { cardsOrphan++; continue; }
      const info = insCard.run(uid, r.card_type || 'student', pid, r.assigned_at || null, r.status || 'active', r.created_at || null);
      if (info.changes > 0) cardsAdded++; else cardsSkipped++;
    }
  }

  const maxId = db.prepare('SELECT MAX(id) AS m FROM students').get().m;
  if (maxId) db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'students'").run(maxId);

  db.exec('COMMIT');
  db.close();

  console.log('\n=== Sync complete ===');
  console.log(`students added: ${added} | skipped (already present): ${skipped} | rows w/o id: ${noId}`);
  console.log(`class lookups missing: ${unmapped}`);
  console.log(`rfid cards added: ${cardsAdded} | skipped: ${cardsSkipped} | orphan (no student): ${cardsOrphan}`);
  console.log(`local students now: ${maxId}`);
}

if (process.env.IVY_SYNC_NO_EXPORT || process.argv.includes('--import-only')) {
  importProd();
} else {
  exportProd();
  importProd();
}
