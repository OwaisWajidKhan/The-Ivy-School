// Rebuild local students + rfid_cards to be an exact mirror of the current
// production export CSVs (backend/data/sync/*.csv, produced by sync:prod).
//
// WARNING: this DELETES all local students and rfid cards first, then re-imports
// from prod keeping prod's primary-key ids, so any local-only students are lost.
// It backs up the local DB to backend/data/sync/ before touching it.
//
// Run (from backend/):
//   npm.cmd run sync:prod            -- export prod CSVs first (or reuse last)
//   node scripts/rebuild-local.js    -- rebuild from those CSVs

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SYNC_DIR = path.join(__dirname, '..', 'data', 'sync');
const DB_FILE = path.join(__dirname, '..', 'data', 'school.db');

const STUDENT_COLS = [
  'id', 'student_id', 'admission_number', 'rfid_uid', 'rfid_uid_2',
  'full_name', 'father_name', 'class_id', 'section_id', 'roll_number',
  'dob', 'gender', 'phone', 'parent_contact', 'address', 'status',
  'photo', 'family_id', 'email', 'created_at'
];

function parseCsv(text) {
  const out = [];
  let row = [], field = '', inQ = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') { inQ = true; }
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { }
    else if (ch === '\n') { row.push(field); field = ''; out.push(row); row = []; }
    else { field += ch; }
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
  return rows;
}

function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(SYNC_DIR, `school.local-backup-${stamp}.db`);
  fs.copyFileSync(DB_FILE, dest);
  console.log(`Backed up local DB -> ${dest}`);
}

function main() {
  if (!fs.existsSync(path.join(SYNC_DIR, 'students.csv'))) {
    throw new Error('data/sync/students.csv not found - run npm run sync:prod first');
  }
  backup();

  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN');

  const presentCols = {};
  for (const row of db.prepare('PRAGMA table_info(students)').all()) presentCols[row.name] = true;
  const cols = STUDENT_COLS.filter(c => presentCols[c]);
  const placeholders = cols.map(() => '?').join(',');

  const classes = {};
  for (const r of db.prepare('SELECT id, name FROM classes').all()) classes[r.name] = r.id;
  const sections = {};
  for (const r of db.prepare('SELECT id, class_id, name FROM sections').all()) sections[`${r.class_id}:${r.name}`] = r.id;

  // wipe student-linked data + students
  for (const t of ['parents', 'gate_passes', 'attendance_logs', 'attendance_summary', 'rfid_cards', 'students']) {
    db.exec(`DELETE FROM ${t}`);
  }
  console.log('Wiped local students, rfid_cards, parents, gate_passes, attendance');

  const insStudent = db.prepare(
    `INSERT INTO students (${cols.join(',')}) VALUES (${placeholders})`);

  const rows = readCsv('students.csv');
  let added = 0, noId = 0, unmapped = 0;
  for (const r of rows) {
    const prodId = r.id ? Number(r.id) : null;
    if (!prodId || !r.student_id) { noId++; continue; }
    let classId = null, sectionId = null;
    if (r.class_name) {
      const cid = classes[r.class_name];
      if (cid) {
        classId = cid;
        sectionId = (r.section_name && sections[`${cid}:${r.section_name}`]) || null;
      } else unmapped++;
    }
    insStudent.run(
      prodId, r.student_id, r.admission_number || null, r.rfid_uid || null,
      r.rfid_uid_2 || null, r.full_name, r.father_name || null, classId, sectionId,
      r.roll_number ? Number(r.roll_number) : null, r.dob || null, r.gender || null,
      r.phone || null, r.parent_contact || null, r.address || null,
      r.status || 'active', r.photo || null, r.family_id || null, r.email || null,
      r.created_at || null);
    added++;
  }

  let cardsAdded = 0;
  const hasCardTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rfid_cards'").get();
  if (hasCardTable && fs.existsSync(path.join(SYNC_DIR, 'rfid_cards.csv'))) {
    const insCard = db.prepare(
      'INSERT INTO rfid_cards (uid, card_type, person_id, assigned_at, status, created_at) VALUES (?,?,?,?,?,?)');
    for (const r of readCsv('rfid_cards.csv')) {
      const pid = r.person_id ? Number(r.person_id) : null;
      if (!r.uid || !pid) continue;
      insCard.run(r.uid, r.card_type || 'student', pid, r.assigned_at || null, r.status || 'active', r.created_at || null);
      cardsAdded++;
    }
  }

  const maxId = db.prepare('SELECT MAX(id) AS m FROM students').get().m;
  if (maxId) db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'students'").run(maxId);

  db.exec('COMMIT');
  db.close();

  console.log(`Rebuilt students: ${added} | rows w/o id: ${noId} | class lookup misses: ${unmapped}`);
  console.log(`rfid_cards imported: ${cardsAdded}`);
}

main();