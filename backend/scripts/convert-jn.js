// Converts the "JN (29)" sheet of the Masterfile-2025-2026.xlsx into a clean,
// normalized CSV for import.
//
// Reads an already-extracted xlsx folder (the workbook as a zip expanded to disk):
//   <extracted>/xl/sharedStrings.xml
//   <extracted>/xl/worksheets/sheet1.xml   (first sheet = JN)
//
// Output columns (one row per student):
//   student_id, full_name, gender, dob, email, joining_year,
//   father_name, father_phone, father_email, father_education, father_profession, father_employer, marital_status,
//   mother_name, mother_phone, mother_email, mother_education, mother_profession, mother_employer, address
//
// Numeric-only cells in text columns (cross-sheet reference numbers like "26", "37")
// are dropped. Excel serial birthdays are converted to YYYY-MM-DD.
//
// Usage: node convert-jn.js <extracted-dir> [out.csv]

const fs = require('fs');
const path = require('path');

const EXTRACTED = process.argv[2];
const OUT_PATH = process.argv[3] || path.join(__dirname, '..', '..', 'docs', 'junior-nursery.csv');

if (!EXTRACTED) { console.error('usage: node convert-jn.js <extracted-dir> [out.csv]'); process.exit(1); }

function readXml(rel) {
  const p = path.join(EXTRACTED, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

const sstXml = readXml('xl/sharedStrings.xml');
const sst = [];
if (sstXml) {
  for (const m of sstXml.matchAll(/<si>(.*?)<\/si>/gs)) {
    let t = '';
    for (const r of m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)) t += r[1];
    sst.push(t);
  }
}

const sheetXml = readXml('xl/worksheets/sheet1.xml');
if (!sheetXml) { console.error('sheet1.xml not found'); process.exit(1); }

// Unescape XML entities
function unx(v) { return v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

// parse rows/cells
const rows = [];
for (const rm of sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
  const rn = parseInt(rm[1], 10);
  if (rn <= 2) continue; // row1 stray title, row2 header
  const cells = {};
  for (const cm of rm[2].matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/gs)) {
    const ref = cm[1];
    const isShared = /t="s"/.test(cm[2]);
    const typ = (cm[2].match(/t="([^"]+)"/) || [])[1] || 'n';
    const vm = (cm[3] || '').match(/<v>(.*?)<\/v>/);
    let val = vm ? vm[1] : '';
    if (isShared && val !== '' && sst[parseInt(val, 10)] !== undefined) val = sst[parseInt(val, 10)];
    cells[ref] = { val: unx(val).trim(), type: isShared ? 's' : typ };
  }
  rows.push({ rn, cells });
}
rows.sort((a, b) => a.rn - b.rn);

function cell(row, col) { const c = row.cells[col]; return c ? c.val : ''; }
function isNumericCell(row, col) { const c = row.cells[col]; return c && c.type === 'n'; }

function drop(row, col) {
  const c = row.cells[col];
  if (!c) return null;
  let v = c.val;
  // drop pure cross-sheet reference numbers in text columns
  if (c.type === 'n' && /^\d+$/.test(v)) return null;
  return v === '' ? null : v;
}
function phoneNum(row, col) {
  const c = row.cells[col];
  if (!c) return null;
  let v = c.val;
  if (/^\+?\d[\d ]*$/.test(v)) v = v.replace(/\s+/g, '');
  if (v === '') return null;
  return v;
}

// Excel serial date -> YYYY-MM-DD (epoch 1899-12-30)
function excelDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial)) * 86400000);
  return d.toISOString().slice(0, 10);
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function parseDob(v) {
  v = (v || '').trim();
  if (/^\d+(\.\d+)?$/.test(v)) return excelDate(Number(v));
  const m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    const yy = 2000 + parseInt(m[3], 10);
    const mo = MONTHS[m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
    return `${yy}-${String(mo).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;
  }
  return v || null;
}

function normName(v) { if (!v) return null; v = v.replace(/\s+/g, ' ').trim(); return v === '' ? null : v; }
function normGender(g) { const u = String(g || '').trim().toUpperCase(); if (u === 'M' || u === 'MALE') return 'Male'; if (u === 'F' || u === 'FEMALE') return 'Female'; return null; }

const out = [];
for (const row of rows) {
  const name = normName(cell(row, 'C'));
  let sid = String(cell(row, 'B')).trim();
  if (/:$|\s/.test(sid) || !/^\d+$/.test(sid)) sid = '';
  if (/^\d+$/.test(sid)) sid = String(parseInt(sid, 10)).padStart(5, '0');
  if (!name && !sid) continue;

  out.push({
    student_id: sid || null,
    full_name: name,
    gender: normGender(drop(row, 'F')),
    dob: parseDob(cell(row, 'G')),
    email: drop(row, 'I'),
    joining_year: drop(row, 'E') || '2025',
    address: drop(row, 'K'),
    father_name: normName(drop(row, 'R')),
    father_phone: phoneNum(row, 'S'),
    father_email: drop(row, 'T'),
    father_education: drop(row, 'U'),
    father_profession: drop(row, 'V'),
    father_employer: drop(row, 'W'),
    marital_status: drop(row, 'X'),
    mother_name: normName(drop(row, 'L')),
    mother_phone: phoneNum(row, 'M'),
    mother_email: drop(row, 'N'),
    mother_education: drop(row, 'O'),
    mother_profession: drop(row, 'P'),
    mother_employer: drop(row, 'Q')
  });
}

function esc(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
const cols = ['student_id', 'full_name', 'gender', 'dob', 'email', 'joining_year',
  'father_name', 'father_phone', 'father_email', 'father_education', 'father_profession', 'father_employer', 'marital_status',
  'mother_name', 'mother_phone', 'mother_email', 'mother_education', 'mother_profession', 'mother_employer', 'address'];
let csv = cols.join(',') + '\n';
for (const r of out) csv += cols.map(c => esc(r[c])).join(',') + '\n';
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, csv, 'utf8');
console.log('wrote', OUT_PATH, 'records=' + out.length, '\n');
console.log(csv);