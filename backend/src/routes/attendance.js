const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate, todayStr, nowStr } = require('../utils/helpers');
const { processScan, lookupPerson } = require('../services/attendanceEngine');

router.use(requireAuth);

const personNameJoin = (personType) =>
  personType === 'student'
    ? `LEFT JOIN students st ON st.id = a.person_id`
    : `LEFT JOIN employees em ON em.id = a.person_id`;

// RFID scan endpoint (also callable by RFID devices with token)
router.post('/scan', (req, res) => {
  const { uid, device_id, device_name, location, timestamp } = req.body;
  if (!uid) return fail(res, 'RFID UID is required');
  const result = processScan({
    uid: String(uid),
    deviceId: device_id || null,
    deviceName: device_name || null,
    location: location || null,
    scanTime: timestamp || nowStr()
  });
  if (!result.ok) {
    return res.status(result.code === 'DUPLICATE' ? 200 : 404).json({ success: false, message: result.message, code: result.code });
  }
  audit(req.user, 'rfid_scan', result.person.type, result.person.id, { uid, direction: result.direction }, req.ip);
  ok(res, result);
});

// Manual attendance mark (admin override)
router.post('/manual', requirePermission('manage_attendance'), (req, res) => {
  const { person_type, person_id, date, in_time, out_time, status, note } = req.body;
  if (!person_type || !person_id) return fail(res, 'person_type and person_id required');
  const existing = db.prepare(
    'SELECT * FROM attendance_summary WHERE person_type = ? AND person_id = ? AND date = ?'
  ).get(person_type, person_id, date || todayStr());
  if (existing) {
    db.prepare('UPDATE attendance_summary SET in_time=?, out_time=?, status=? WHERE id=?')
      .run(in_time || existing.in_time, out_time !== undefined ? out_time : existing.out_time, status || existing.status, existing.id);
    audit(req.user, 'manual_attendance_update', person_type, person_id, { date, in_time, out_time, status }, req.ip);
    ok(res, db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(existing.id));
  } else {
    const info = db.prepare(
      'INSERT INTO attendance_summary (person_type, person_id, date, in_time, out_time, status, late_minutes) VALUES (?,?,?,?,?,?,?)'
    ).run(person_type, person_id, date || todayStr(), in_time || null, out_time || null, status || 'present', 0);
    audit(req.user, 'manual_attendance_create', person_type, person_id, { date, in_time, out_time, status }, req.ip);
    ok(res, db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(info.lastInsertRowid), 201);
  }
});

// Attendance summary list (filterable)
router.get('/summary', requirePermission('view_attendance'), (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.date) { where.push('a.date = ?'); params.push(req.query.date); }
  if (req.query.from) { where.push('a.date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('a.date <= ?'); params.push(req.query.to); }
  if (req.query.person_type) { where.push('a.person_type = ?'); params.push(req.query.person_type); }
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.person_id) { where.push('a.person_id = ?'); params.push(req.query.person_id); }
  if (req.query.class_id && req.query.person_type === 'student') {
    where.push('st.class_id = ?'); params.push(req.query.class_id);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const nameExpr = "CASE WHEN a.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name";
  const extra = "st.class_id AS class_id, c.name AS class_name, sec.name AS section_name, em.designation, d.name AS department";
  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     ${whereSql}`
  ).get(...params).c;
  const rows = db.prepare(
    `SELECT a.*, ${nameExpr}, ${extra}
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     LEFT JOIN departments d ON d.id = em.department_id
     ${whereSql} ORDER BY a.date DESC, a.person_type, ${nameExpr} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// Today's attendance (dashboard)
router.get('/today', requirePermission('view_attendance'), (req, res) => {
  const date = todayStr();
  const studentRows = db.prepare(
    `SELECT a.*, st.full_name, st.student_id, c.name AS class_name, sec.name AS section_name
     FROM attendance_summary a
     JOIN students st ON st.id = a.person_id
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     WHERE a.person_type='student' AND a.date = ?
     ORDER BY a.in_time IS NULL, a.in_time`
  ).all(date);
  const employeeRows = db.prepare(
    `SELECT a.*, em.full_name, em.employee_id, em.designation, d.name AS department
     FROM attendance_summary a
     JOIN employees em ON em.id = a.person_id
     LEFT JOIN departments d ON d.id = em.department_id
     WHERE a.person_type='employee' AND a.date = ?
     ORDER BY a.in_time IS NULL, a.in_time`
  ).all(date);
  ok(res, { date, students: studentRows, employees: employeeRows });
});

// Raw scan logs
router.get('/logs', requirePermission('view_attendance'), (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.date) { where.push('l.date = ?'); params.push(req.query.date); }
  if (req.query.person_type) { where.push('l.person_type = ?'); params.push(req.query.person_type); }
  if (req.query.direction) { where.push('l.direction = ?'); params.push(req.query.direction); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM attendance_logs l ${whereSql}`).get(...params).c;
  const rows = db.prepare(
    `SELECT l.*, CASE WHEN l.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name
     FROM attendance_logs l
     LEFT JOIN students st ON st.id = l.person_id AND l.person_type='student'
     LEFT JOIN employees em ON em.id = l.person_id AND l.person_type='employee'
     ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// Own attendance (teacher / employee / student / parent)
router.get('/me', (req, res) => {
  const { person_type: personType, person_id: personId } = req.user;
  if (!personId || !['student', 'employee'].includes(personType)) {
    return fail(res, 'No attendance record linked to this account');
  }
  const { from, to } = req.query;
  const where = ['a.person_type = ?', 'a.person_id = ?'];
  const params = [personType, personId];
  if (from) { where.push('a.date >= ?'); params.push(from); }
  if (to) { where.push('a.date <= ?'); params.push(to); }
  const rows = db.prepare(
    `SELECT * FROM attendance_summary a WHERE ${where.join(' AND ')} ORDER BY a.date DESC LIMIT 60`
  ).all(...params);
  ok(res, { personType, personId, rows });
});

module.exports = router;
