// Push local SQLite students UP to the production PostgreSQL database.
//
// Exports local students (backend/data/school.db) to a CSV, ships it to the
// prod VPS, and applies an upsert keyed on students.student_id:
//   - existing student  -> update full_name, father_name, parent_contact,
//                          class_id, section_id, phone, status
//   - missing student   -> insert (admission_number = ADM-<student_id>)
// Class/section are matched by NAME (ids differ between environments). Grade 9
// and its section "A" are created on the fly if missing.
//
// Run (from backend/):
//   npm.cmd run sync:to-prod                 -- full run (exports + uploads)
//   npm.cmd run sync:to-prod --dry-run       -- report only, no writes

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
const DRY = process.argv.includes('--dry-run');
const CSV = path.join(SYNC_DIR, 'students_local.csv');

function runRemote(script) {
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  return execFileSync('ssh',
    ['-i', KEY, '-o', 'StrictHostKeyChecking=no', `${USER}@${HOST}`, `echo ${b64} | base64 -d | bash`],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  return '"' + String(v).replace(/"/g, '""') + '"';
}

const HEADER = ['student_id', 'admission_number', 'full_name', 'father_name',
  'parent_contact', 'phone', 'status', 'class_name', 'section_name'];

function exportLocal() {
  fs.mkdirSync(SYNC_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  const rows = db.prepare(`
    SELECT s.student_id, s.admission_number, s.full_name, s.father_name,
           s.parent_contact, s.phone, s.status,
           c.name AS class_name, sec.name AS section_name
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN sections sec ON sec.id = s.section_id
    ORDER BY s.id`).all();
  const lines = [HEADER.join(',')];
  for (const r of rows) lines.push(HEADER.map((h) => csvEscape(r[h])).join(','));
  fs.writeFileSync(CSV, lines.join('\r\n'));
  console.log(`Exported ${rows.length} local students -> ${CSV}`);
  return rows.length;
}

const SQL = `
INSERT INTO classes (name) SELECT 'Grade 9' WHERE NOT EXISTS (SELECT 1 FROM classes WHERE name = 'Grade 9');
INSERT INTO sections (class_id, name)
SELECT c.id, 'A' FROM classes c WHERE c.name = 'Grade 9'
  AND NOT EXISTS (SELECT 1 FROM sections s WHERE s.class_id = c.id AND s.name = 'A');

DROP TABLE IF EXISTS sync_local_students;
CREATE TEMP TABLE sync_local_students (
  student_id text, admission_number text, full_name text, father_name text,
  parent_contact text, phone text, status text, class_name text, section_name text
);
\\copy sync_local_students FROM '/tmp/ivy_local_students.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO students (student_id, admission_number, full_name, father_name,
                      class_id, section_id, parent_contact, phone, status)
SELECT t.student_id,
       COALESCE(e.admission_number, 'ADM-' || t.student_id),
       t.full_name,
       NULLIF(t.father_name, ''),
       c.id,
       sec.id,
       NULLIF(t.parent_contact, ''),
       NULLIF(t.phone, ''),
       COALESCE(NULLIF(t.status, ''), 'active')
FROM sync_local_students t
LEFT JOIN students e ON e.student_id = t.student_id
LEFT JOIN classes  c  ON c.name  = t.class_name
LEFT JOIN sections sec ON sec.class_id = c.id AND sec.name = t.section_name
ON CONFLICT (student_id) DO UPDATE SET
  full_name       = EXCLUDED.full_name,
  father_name     = EXCLUDED.father_name,
  class_id        = EXCLUDED.class_id,
  section_id      = EXCLUDED.section_id,
  parent_contact  = EXCLUDED.parent_contact,
  phone           = EXCLUDED.phone,
  status          = EXCLUDED.status;

SELECT 'students_now=' || COUNT(*) FROM students;
SELECT 'with_class=' || COUNT(class_id) FROM students;
SELECT 'unassigned=' || COUNT(*) FROM students WHERE class_id IS NULL;
`;

function upload() {
  execFileSync('scp', ['-i', KEY, '-o', 'StrictHostKeyChecking=no', CSV,
    `${USER}@${HOST}:/tmp/ivy_local_students.csv`], { encoding: 'utf8' });
  console.log('Uploaded CSV to /tmp/ivy_local_students.csv');
  if (DRY) { console.log('DRY-RUN: SQL not applied.'); return; }
  const out = runRemote(
    'chmod 644 /tmp/ivy_local_students.csv\n' +
    'cat > /tmp/ivy_sync_local.sql <<\'SQLEOF\'\n' + SQL + 'SQLEOF\n' +
    'sudo -u postgres psql -d ivy_school -v ON_ERROR_STOP=1 -f /tmp/ivy_sync_local.sql');
  console.log(out);
}

const n = exportLocal();
if (n === 0) { console.log('No local students to sync.'); process.exit(1); }
console.log(`dry-run: ${DRY ? 'yes' : 'no'}`);
upload();