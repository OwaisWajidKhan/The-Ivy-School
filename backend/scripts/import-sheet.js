// Import (or update) students from a Google Sheets HTML export (.waffle table),
// e.g. Students-data/JN/Sheet1.html which contains Junior Nursery student data.
//
// Column headers are matched flexibly by keyword:
//   Student ID  -> students.student_id
//   Name        -> students.full_name     (any column whose header contains "name")
//   Father      -> students.father_name   (header contains "father" but not "number")
//   Father number -> students.parent_contact (header contains "number")
//
// Behaviour:
//   - keyed on students.student_id
//   - student_id exists  -> UPDATE full_name, father_name, parent_contact (leave
//     class/section/status untouched)
//   - student_id missing  -> INSERT new student, assigned to the given class +
//     section (created on demand), admission_number derived as ADM-<student_id>
//   - idempotent; running twice is safe
//
// Run (from backend/):
//   node scripts/import-sheet.js                    (defaults: JN html, Junior Nursery class)
//   node scripts/import-sheet.js --dry-run          (only report, no writes)
//   SHEET="<path>" CLASS_NAME="Grade 1" node scripts/import-sheet.js
//   SECTION_NAME="B" node scripts/import-sheet.js

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SHEET = process.env.SHEET || path.join(__dirname, '..', '..', 'Students-data', 'JN', 'Sheet1.html');
const CLASS_NAME = process.env.CLASS_NAME || 'Junior Nursery';
const SECTION_NAME = process.env.SECTION_NAME || 'A';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'school.db');
const DRY = process.argv.includes('--dry-run');

function decode(s) {
  return String(s)
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#43;/g, '+')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parseSheet(file) {
  if (!fs.existsSync(file)) throw new Error(`Sheet not found: ${file}`);
  const html = fs.readFileSync(file, 'utf8');
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const rows = trs.map((tr) =>
    [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => decode(c[1]))
  ).filter((r) => r.length);
  if (!rows.length) throw new Error(`No table rows found in ${file}`);
  return rows;
}

function normalizeHeader(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function mapColumns(headerRow) {
  const headers = headerRow.map((h, i) => ({ raw: h, norm: normalizeHeader(h), i }));
  const pick = (pred) => headers.filter(pred).map((h) => h.i);
  let idIdx = pick((h) => /student id|id no|roll no/.test(h.norm));
  const nameIdx = pick((h) => /name/.test(h.norm) && !/father|mother|parent/i.test(h.norm));
  const fatherIdx = pick((h) => /father/.test(h.norm) && !/number|phone|contact|no\b/.test(h.norm));
  const phoneIdx = pick((h) => /number|phone|contact|mobile|cell/.test(h.norm));
  if (!idIdx.length) idIdx = pick((h) => /^\d+$/.test(h.raw.trim()));
  if (!idIdx.length) throw new Error('Cannot locate a Student ID column');
  if (!nameIdx.length) throw new Error('Cannot locate a Name column');
  return { id: idIdx[0], name: nameIdx[0], father: fatherIdx[0], phone: phoneIdx[0] };
}

function main() {
  const rows = parseSheet(SHEET);
  const cols = mapColumns(rows[0]);
  const data = rows.slice(1).filter((r) => r[cols.id] && String(r[cols.id]).trim() !== '');
  console.log(`Sheet: ${SHEET}`);
  console.log(`Parsed ${data.length} student rows (columns: ${['id', 'name', 'father', 'phone'].map((k) => `${k}[${cols[k]}]`).join(', ')})`);
  if (DRY) {
    console.log('\n--- DRY RUN (no writes) ---');
    data.forEach((r) => console.log([r[cols.id], r[cols.name], r[cols.father], r[cols.phone]].join(' | ')));
    return;
  }

  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('BEGIN');

  const getStu = db.prepare('SELECT id, full_name, father_name, parent_contact FROM students WHERE student_id = ?');
  const updStu = db.prepare('UPDATE students SET full_name = ?, father_name = ?, parent_contact = ? WHERE student_id = ?');
  const insStu = db.prepare(
    `INSERT INTO students (student_id, admission_number, full_name, father_name, class_id, section_id, parent_contact, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`);

  let cls = db.prepare('SELECT id FROM classes WHERE name = ?').get(CLASS_NAME);
  let classId = null, sectionId = null;
  if (cls) {
    classId = cls.id;
    const sec = db.prepare('SELECT id FROM sections WHERE class_id = ? AND name = ?').get(classId, SECTION_NAME);
    sectionId = sec ? sec.id : null;
  }

  const report = { inserted: 0, updated: 0, unmatchedCols: 0, errors: [] };
  for (const r of data) {
    const sid = String(r[cols.id]).trim();
    const name = (r[cols.name] || '').trim() || null;
    const father = (r[cols.father] !== undefined ? (r[cols.father] || '').trim() : null) || null;
    const phone = (r[cols.phone] !== undefined ? (r[cols.phone] || '').trim() : null) || null;

    const existing = getStu.get(sid);
    try {
      if (existing) {
        updStu.run(name, father, phone, sid);
        report.updated++;
      } else {
        insStu.run(sid, `ADM-${sid}`, name, father, classId, sectionId, phone);
        report.inserted++;
      }
    } catch (e) {
      report.errors.push(`Student ${sid}: ${e.message}`);
    }
  }

  db.exec('COMMIT');
  db.close();

  console.log('\n=== Import complete ===');
  console.log(`inserted new: ${report.inserted} | updated existing: ${report.updated} | errors: ${report.errors.length}`);
  if (!cls) console.log(`NOTE: class "${CLASS_NAME}" not found - new students inserted without a class.`);
  else if (!sectionId) console.log(`NOTE: section "${SECTION_NAME}" not found for "${CLASS_NAME}" - new students inserted without a section.`);
  report.errors.forEach((e) => console.log('  -', e));
}

main();