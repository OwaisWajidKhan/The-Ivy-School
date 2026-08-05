const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db/schema');
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { ok, fail, audit, paginate, todayStr } = require('../utils/helpers');
const storage = require('../services/storageService');

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  }
});

router.use(requireAuth);

const selectBase = `
  SELECT s.*, c.name AS class_name, sec.name AS section_name
  FROM students s
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN sections sec ON sec.id = s.section_id
`;

// List students with filters
router.get('/', requireAnyPermission('manage_students', 'view_students'), async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.q) {
    where.push('(s.full_name LIKE ? OR s.student_id LIKE ? OR s.admission_number LIKE ? OR s.rfid_uid LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q, q);
  }
  if (req.query.class_id) { where.push('s.class_id = ?'); params.push(req.query.class_id); }
  if (req.query.section_id) { where.push('s.section_id = ?'); params.push(req.query.section_id); }
  if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM students s ${whereSql}`).get(...params)).c;
  const rows = await db.prepare(`${selectBase} ${whereSql} ORDER BY s.full_name LIMIT ? OFFSET ?`).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// Quick lookup (as-you-type) with live results + last gate activity
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !String(q).trim()) return ok(res, { items: [] });
  const term = `%${String(q).trim()}%`;
  const rows = await db.prepare(
    `SELECT s.id, s.full_name, s.student_id, s.rfid_uid, s.rfid_uid_2, s.photo, s.class_id, s.status,
       c.name AS class_name, sec.name AS section_name,
       (SELECT status FROM rfid_cards rc WHERE rc.uid = s.rfid_uid) AS card_status,
       (SELECT direction FROM attendance_logs l WHERE l.person_type='student' AND l.person_id=s.id ORDER BY l.id DESC LIMIT 1) AS last_direction,
       (SELECT scan_time FROM attendance_logs l WHERE l.person_type='student' AND l.person_id=s.id ORDER BY l.id DESC LIMIT 1) AS last_activity
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN sections sec ON sec.id = s.section_id
     WHERE s.full_name LIKE ? OR s.student_id LIKE ? OR s.admission_number LIKE ? OR s.rfid_uid LIKE ? OR s.rfid_uid_2 LIKE ? OR s.parent_contact LIKE ?
     ORDER BY s.full_name LIMIT 12`
  ).all(term, term, term, term, term, term);
  ok(res, { items: rows });
});

// Bulk import students via CSV (headers: full_name,father_name,student_id,class_name,section_name,rfid_uid,gender,parent_contact)
router.post('/import', requirePermission('manage_students'), csvUpload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, 'CSV file required');
  const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return fail(res, 'CSV needs a header row plus data rows');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = (names) => header.findIndex(h => names.includes(h));
  const cFull = idx(['full_name', 'name']);
  const cFather = idx(['father_name', 'father']);
  const cSid = idx(['student_id', 'roll_no']);
  const cClass = idx(['class_name', 'class']);
  const cSec = idx(['section_name', 'section']);
  const cUid = idx(['rfid_uid', 'uid']);
  const cGender = idx(['gender']);
  const cParent = idx(['parent_contact', 'parent_phone']);
  const cPhone = idx(['phone', 'contact']);
  if (cFull < 0 || cSid < 0) return fail(res, 'CSV must include at least full_name and student_id columns');

  const results = { imported: 0, skipped: 0, errors: [] };
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const get = (idx) => idx >= 0 ? (cols[idx] || '').trim() : '';
    const fullName = get(cFull);
    const studentId = get(cSid);
    if (!fullName || !studentId) { results.skipped++; continue; }
    if (await db.prepare('SELECT id FROM students WHERE student_id = ?').get(studentId)) { results.errors.push(`Row ${i + 1}: student_id ${studentId} already exists`); results.skipped++; continue; }
    let classId = null, sectionId = null;
    const className = get(cClass);
    if (className) {
      const cls = await db.prepare('SELECT id FROM classes WHERE name = ?').get(className);
      if (cls) {
        classId = cls.id;
        const secName = get(cSec);
        if (secName) {
          const sec = await db.prepare('SELECT id FROM sections WHERE class_id = ? AND name = ?').get(classId, secName);
          if (sec) sectionId = sec.id;
        }
      }
    }
    try {
      const info = await db.prepare(
        'INSERT INTO students (student_id, admission_number, rfid_uid, full_name, father_name, class_id, section_id, gender, phone, parent_contact, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).run(studentId, `ADM-${String(Date.now()).slice(-7)}-${i}`, get(cUid) || null, fullName, get(cFather) || null,
        classId, sectionId, get(cGender) || null, get(cPhone) || null, get(cParent) || null, 'active');
      if (get(cUid)) {
        await db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
          .run(get(cUid), 'student', info.lastInsertRowid, new Date().toISOString(), 'active');
      }
      results.imported++;
    } catch (e) {
      results.errors.push(`Row ${i + 1}: ${e.message}`);
      results.skipped++;
    }
  }
  audit(req.user, 'bulk_import_students', 'student', null, { imported: results.imported, skipped: results.skipped }, req.ip);
  ok(res, results);
});

// Promote / transfer students between classes at year-end
router.post('/promote', requirePermission('manage_students'), async (req, res) => {
  const { from_class_id, to_class_id, student_ids, new_section_id } = req.body;
  if ((!from_class_id && !student_ids) || !to_class_id) return fail(res, 'Provide from_class_id (or student_ids) and to_class_id');
  const ids = student_ids && student_ids.length
    ? student_ids
    : (await db.prepare('SELECT id FROM students WHERE class_id = ?').all(from_class_id)).map(r => r.id);
  if (!ids.length) return fail(res, 'No students to promote');
  const stmt = await db.prepare('UPDATE students SET class_id = ?, section_id = ?, status = ? WHERE id = ?');
  const targetStatus = req.body.promote ? 'active' : (req.body.status || 'active');
  for (const id of ids) await stmt.run(to_class_id, new_section_id || null, targetStatus, id);
  audit(req.user, 'promote_students', 'student', null, { count: ids.length, to_class_id }, req.ip);
  ok(res, { promoted: ids.length, student_ids: ids });
});

// Link siblings under one family id
router.post('/link-siblings', requirePermission('manage_students'), async (req, res) => {
  const { student_ids, family_id } = req.body;
  if (!student_ids || !student_ids.length) return fail(res, 'student_ids required');
  const fid = family_id || `FAM-${Date.now().toString().slice(-6)}`;
  const stmt = await db.prepare('UPDATE students SET family_id = ? WHERE id = ?');
  for (const id of student_ids) await stmt.run(fid, id);
  audit(req.user, 'link_siblings', 'student', null, { family_id: fid, count: student_ids.length }, req.ip);
  ok(res, { family_id: fid, linked: student_ids.length });
});

// Junior Nursery registry: the full intake with mother/father family profiles
router.get('/jn', requirePermission('manage_students'), async (req, res) => {
  const rows = await db.prepare(`
    SELECT s.id, s.student_id, s.full_name, s.gender, s.dob, s.email, s.roll_number,
           s.address, s.parent_contact, s.status, s.photo,
           c.name AS class_name, sec.name AS section_name
    FROM students s
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN sections sec ON sec.id = s.section_id
    WHERE LOWER(c.name) LIKE '%junior nursery%'
    ORDER BY s.student_id
  `).all();
  // attach parents per student
  const students = [];
  for (const s of rows) {
    const parents = await db.prepare(
      'SELECT relation, full_name, phone, email, education, profession, employer, marital_status, address FROM parents WHERE student_id = ? ORDER BY relation'
    ).all(s.id);
    students.push({ ...s, dob: s.dob || '', parents });
  }
  ok(res, { items: students, total: students.length });
});

// Student detail + attendance
router.get('/:id', requireAnyPermission('manage_students', 'view_students'), async (req, res) => {
  const s = await db.prepare(`${selectBase} WHERE s.id = ?`).get(req.params.id);
  if (!s) return fail(res, 'Student not found', 404);
  const attendance = await db.prepare(
    'SELECT * FROM attendance_summary WHERE person_type = ? AND person_id = ? ORDER BY date DESC LIMIT 30'
  ).all('student', s.id);
  ok(res, { ...s, attendance });
});

// Create student
router.post('/', upload.single('photo'), requirePermission('manage_students'), async (req, res) => {
  const b = req.body;
  if (!b.full_name) return fail(res, 'Full name is required');
  const studentId = b.student_id || `S-${Date.now().toString().slice(-6)}`;
  const admissionNumber = b.admission_number || `ADM-${Date.now().toString().slice(-7)}`;
  const photo = req.file
    ? await storage.uploadBuffer({ buffer: req.file.buffer, folder: 'photos', originalname: req.file.originalname, mimetype: req.file.mimetype })
    : b.photo || null;

  const insert = await db.prepare(`
    INSERT INTO students (student_id, admission_number, rfid_uid, rfid_uid_2, full_name, father_name, class_id, section_id, roll_number, dob, gender, phone, parent_contact, address, status, photo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const registerCard = (uid, personId) => {
    if (uid) {
      return db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
        .run(String(uid), 'student', personId, new Date().toISOString(), 'active');
    }
    return Promise.resolve();
  };
  const cardOwner = async (uid) => db.prepare('SELECT id FROM students WHERE rfid_uid = ? OR rfid_uid_2 = ?').get(String(uid), String(uid));
  try {
    for (const uid of [b.rfid_uid, b.rfid_uid_2]) {
      if (uid && await cardOwner(uid)) return fail(res, 'Duplicate record (RFID card already assigned to another student)');
    }
    const info = await insert.run(
      studentId, admissionNumber, b.rfid_uid || null, b.rfid_uid_2 || null, b.full_name, b.father_name || null,
      b.class_id || null, b.section_id || null, b.roll_number || null, b.dob || null,
      b.gender || null, b.phone || null, b.parent_contact || null, b.address || null,
      b.status || 'active', photo
    );
    await registerCard(b.rfid_uid, info.lastInsertRowid);
    await registerCard(b.rfid_uid_2, info.lastInsertRowid);
    audit(req.user, 'create_student', 'student', info.lastInsertRowid, { name: b.full_name }, req.ip);
    const created = await db.prepare(`${selectBase} WHERE s.id = ?`).get(info.lastInsertRowid);
    ok(res, created, 201);
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) return fail(res, 'Duplicate record (student id, admission number or RFID UID already exists)');
    throw e;
  }
});

// Update student
router.put('/:id', upload.single('photo'), requirePermission('manage_students'), async (req, res) => {
  const existing = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Student not found', 404);
  const b = req.body;
  const photo = req.file
    ? await storage.uploadBuffer({ buffer: req.file.buffer, folder: 'photos', originalname: req.file.originalname, mimetype: req.file.mimetype })
    : (b.photo !== undefined ? b.photo : existing.photo);
  if (req.file && existing.photo) await storage.deleteUpload(existing.photo);

  const cardOwner = async (uid) => db.prepare('SELECT id FROM students WHERE id != ? AND (rfid_uid = ? OR rfid_uid_2 = ?)').get(existing.id, String(uid), String(uid));
  for (const uid of [b.rfid_uid !== undefined ? b.rfid_uid : existing.rfid_uid, b.rfid_uid_2 !== undefined ? b.rfid_uid_2 : existing.rfid_uid_2]) {
    if (uid && await cardOwner(uid)) return fail(res, 'Duplicate record (RFID card already assigned to another student)');
  }

  await db.prepare(`
    UPDATE students SET student_id=?, admission_number=?, rfid_uid=?, rfid_uid_2=?, full_name=?, father_name=?,
      class_id=?, section_id=?, roll_number=?, dob=?, gender=?, phone=?, parent_contact=?, address=?, status=?, photo=?
    WHERE id=?
  `).run(
    b.student_id || existing.student_id, b.admission_number || existing.admission_number,
    b.rfid_uid !== undefined ? b.rfid_uid : existing.rfid_uid,
    b.rfid_uid_2 !== undefined ? b.rfid_uid_2 : existing.rfid_uid_2,
    b.full_name || existing.full_name, b.father_name !== undefined ? b.father_name : existing.father_name,
    b.class_id !== undefined ? b.class_id : existing.class_id,
    b.section_id !== undefined ? b.section_id : existing.section_id,
    b.roll_number !== undefined ? b.roll_number : existing.roll_number,
    b.dob !== undefined ? b.dob : existing.dob, b.gender !== undefined ? b.gender : existing.gender,
    b.phone !== undefined ? b.phone : existing.phone,
    b.parent_contact !== undefined ? b.parent_contact : existing.parent_contact,
    b.address !== undefined ? b.address : existing.address,
    b.status || existing.status, photo,
    existing.id
  );
  if (b.rfid_uid && b.rfid_uid !== existing.rfid_uid) {
    await db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
      .run(b.rfid_uid, 'student', existing.id, new Date().toISOString(), 'active');
  }
  if (b.rfid_uid_2 && b.rfid_uid_2 !== existing.rfid_uid_2) {
    await db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
      .run(String(b.rfid_uid_2), 'student', existing.id, new Date().toISOString(), 'active');
  }
  audit(req.user, 'update_student', 'student', existing.id, { name: b.full_name }, req.ip);
  ok(res, await db.prepare(`${selectBase} WHERE s.id = ?`).get(existing.id));
});

// Delete student
router.delete('/:id', requirePermission('manage_students'), async (req, res) => {
  const existing = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Student not found', 404);
  await db.prepare('DELETE FROM students WHERE id = ?').run(existing.id);
  if (existing.photo) await storage.deleteUpload(existing.photo);
  audit(req.user, 'delete_student', 'student', existing.id, { name: existing.full_name }, req.ip);
  ok(res, { message: 'Student deleted' });
});

module.exports = router;
