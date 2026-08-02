// Imports the Junior Nursery intake from docs/junior-nursery.csv.
//
// Creates:
//   - a "Junior Nursery" class + "A" section (idempotent)
//   - one student per CSV row (student_id from the file, e.g. 25001)
//   - mother and father rows in the `parents` table (full profile)
//   - a parent login account per student (role=parent, person_type=student)
//
// Parent login username = `parent_<student_id>` e.g. parent_25001, password
// defaults to Parent@123 (override with PASSWORD env). Re-running is safe: it
// skips students whose student_id already exists.
//
// Run: npm.cmd run import:jn        (from backend/)

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, getSetting } = require('../src/db/schema');

const CSV = process.env.CSV || path.join(__dirname, '..', '..', 'docs', 'junior-nursery.csv');
const PASSWORD = process.env.PASSWORD || 'Parent@123';

async function parseCsv() {
  const text = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const idx = {};
  header.forEach((h, i) => idx[h] = i);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // proper CSV field split respecting quoted commas
    const fields = splitCsvLine(lines[i]);
    if (fields.length !== header.length) {
      // pad/trim gracefully
      while (fields.length < header.length) fields.push('');
    }
    const o = {};
    header.forEach((h, j) => o[h] = (fields[j] || '').trim());
    if (!o.full_name) continue;
    rows.push(o);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function ensureClass() {
  let cls = await db.prepare("SELECT * FROM classes WHERE name = 'Junior Nursery'").get();
  if (!cls) {
    const info = await db.prepare("INSERT INTO classes (name, description) VALUES (?, ?)").run('Junior Nursery', 'Playgroup / Junior Nursery intake 2025-2026');
    cls = await db.prepare('SELECT * FROM classes WHERE id = ?').get(info.lastInsertRowid);
  }
  let sec = await db.prepare('SELECT * FROM sections WHERE class_id = ? AND name = ?').get(cls.id, 'A');
  if (!sec) {
    const info = await db.prepare('INSERT INTO sections (class_id, name) VALUES (?, ?)').run(cls.id, 'A');
    sec = await db.prepare('SELECT * FROM sections WHERE id = ?').get(info.lastInsertRowid);
  }
  return { classId: cls.id, sectionId: sec.id };
}

async function importJN() {
  const rows = await parseCsv();
  console.log(`Parsed ${rows.length} Junior Nursery records from ${CSV}`);

  const { classId, sectionId } = await ensureClass();
  const parentRole = await db.prepare("SELECT id FROM roles WHERE name = 'parent'").get();
  if (!parentRole) throw new Error('parent role missing - run seed first');
  const hash = bcrypt.hashSync(PASSWORD, 10);

  const insertStudent = await db.prepare(`
    INSERT INTO students (student_id, admission_number, rfid_uid, full_name, father_name, class_id, section_id, roll_number, dob, gender, phone, parent_contact, address, status, email)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertParent = await db.prepare(`
    INSERT INTO parents (student_id, relation, full_name, phone, email, education, profession, employer, marital_status, address)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const insertUser = await db.prepare(
    "INSERT INTO users (username, email, password_hash, role_id, person_type, person_id) VALUES (?,?,?,?,?,?)"
  );

  const report = { added: 0, existing: 0, parents: 0, logins: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sid = r.student_id;

    const existingStudent = await db.prepare('SELECT id FROM students WHERE student_id = ?').get(sid);
    let studentDbId;
    if (existingStudent) {
      studentDbId = existingStudent.id;
      report.existing++;
    } else {
      try {
        const info = await insertStudent.run(
          sid,
          `ADM-JN-${String(sid).slice(-5)}`,
          null, // no rfid uid provided
          r.full_name,
          r.father_name || null,
          classId, sectionId,
          i + 1, // roll number
          r.dob || null,
          r.gender || null,
          null, // phone (student's own phone not in data)
          r.father_phone || r.mother_phone || null, // parent_contact
          r.address || null,
          'active',
          r.email || null
        );
        studentDbId = info.lastInsertRowid;
        report.added++;
      } catch (e) {
        report.errors.push(`Student ${sid}: ${e.message}`);
        continue;
      }
    }

    // parents (father + mother)
    const parentRows = [];
    if (r.father_name) parentRows.push(['father', r]);
    if (r.mother_name) parentRows.push(['mother', r]);
    for (const [relation, pr] of parentRows) {
      const prefix = relation === 'father' ? '' : 'mother';
      const existing = await db.prepare('SELECT id FROM parents WHERE student_id = ? AND relation = ?').get(studentDbId, relation);
      if (existing) continue;
      await insertParent.run(
        studentDbId, relation,
        pr[`${prefix}_name`] || null,
        pr[`${prefix}_phone`] || null,
        pr[`${prefix}_email`] || null,
        pr[`${prefix}_education`] || null,
        pr[`${prefix}_profession`] || null,
        pr[`${prefix}_employer`] || null,
        relation === 'father' ? (pr.marital_status || null) : null,
        pr.address || null
      );
      report.parents++;
    }

    // parent login
    const uname = `parent_${sid}`;
    const existingUser = await db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
    if (!existingUser) {
      await insertUser.run(uname, (r.father_email || r.mother_email || null), hash, parentRole.id, 'student', studentDbId);
      report.logins++;
    }
  }

  console.log('\n=== Junior Nursery import complete ===');
  console.log('students added:', report.added, '| already existed:', report.existing);
  console.log('parent rows:', report.parents);
  console.log('parent logins created:', report.logins);
  if (report.errors.length) {
    console.log('errors:');
    for (const e of report.errors) console.log('  -', e);
  }
}

importJN().catch(e => { console.error(e); process.exit(1); });