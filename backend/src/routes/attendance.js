const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate, todayStr, nowStr } = require('../utils/helpers');
const { toDbString } = require('../utils/timezone');
const { processScan, lookupPerson } = require('../services/attendanceEngine');

router.use(requireAuth);

const personNameJoin = (personType) =>
  personType === 'student'
    ? `LEFT JOIN students st ON st.id = a.person_id`
    : `LEFT JOIN employees em ON em.id = a.person_id`;

// RFID scan endpoint (also callable by RFID devices with token)
router.post('/scan', async (req, res) => {
  const { uid, device_id, device_name, location, timestamp } = req.body;
  if (!uid) return fail(res, 'RFID UID is required');
  const result = await processScan({
    uid: String(uid),
    deviceId: device_id || null,
    deviceName: device_name || null,
    location: location || null,
    scanTime: timestamp ? toDbString(String(timestamp)) : nowStr()
  });
  if (!result.ok) {
    return res.status(result.code === 'DUPLICATE' ? 200 : 404).json({ success: false, message: result.message, code: result.code });
  }
  audit(req.user, 'rfid_scan', result.person.type, result.person.id, { uid, direction: result.direction }, req.ip);
  ok(res, result);
});

// Manual attendance mark (admin override)
// Accepts the student/employee numeric id OR the human Student ID / Employee ID (e.g. S-0001).
router.post('/manual', requirePermission('manage_attendance'), async (req, res) => {
  const { person_type, person_id, date, in_time, out_time, status, note } = req.body;
  if (!person_type || person_id === undefined || person_id === '') return fail(res, 'person_type and person_id required');
  const code = String(person_id).trim();
  const numeric = /^\d+$/.test(code) ? Number(code) : null;
  let resolved;
  if (person_type === 'student') {
    resolved = numeric
      ? (await db.prepare('SELECT id FROM students WHERE id = ?').get(numeric))?.id
      : (await db.prepare('SELECT id FROM students WHERE student_id = ?').get(code))?.id;
  } else if (person_type === 'employee') {
    resolved = numeric
      ? (await db.prepare('SELECT id FROM employees WHERE id = ?').get(numeric))?.id
      : (await db.prepare('SELECT id FROM employees WHERE employee_id = ?').get(code))?.id;
  }
  if (!resolved) return fail(res, `${person_type === 'student' ? 'Student' : 'Employee'} not found for ID "${code}"`);

  const existing = await db.prepare(
    'SELECT * FROM attendance_summary WHERE person_type = ? AND person_id = ? AND date = ?'
  ).get(person_type, resolved, date || todayStr());
  if (existing) {
    await db.prepare('UPDATE attendance_summary SET in_time=?, out_time=?, status=? WHERE id=?')
      .run(in_time || existing.in_time, out_time !== undefined ? out_time : existing.out_time, status || existing.status, existing.id);
    audit(req.user, 'manual_attendance_update', person_type, resolved, { date, in_time, out_time, status }, req.ip);
    ok(res, await db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(existing.id));
  } else {
    const info = await db.prepare(
      'INSERT INTO attendance_summary (person_type, person_id, date, in_time, out_time, status, late_minutes) VALUES (?,?,?,?,?,?,?)'
    ).run(person_type, resolved, date || todayStr(), in_time || null, out_time || null, status || 'present', 0);
    audit(req.user, 'manual_attendance_create', person_type, resolved, { date, in_time, out_time, status }, req.ip);
    ok(res, await db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(info.lastInsertRowid), 201);
  }
});

// Attendance summary list (filterable)
router.get('/summary', requirePermission('view_attendance'), async (req, res) => {
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
  const total = (await db.prepare(
    `SELECT COUNT(*) AS c FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     ${whereSql}`
  ).get(...params)).c;
  const rows = await db.prepare(
    `SELECT a.*, ${nameExpr}, ${extra}
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     LEFT JOIN departments d ON d.id = em.department_id
     ${whereSql} ORDER BY a.date DESC, a.person_type, full_name LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// Today's attendance (dashboard)
router.get('/today', requirePermission('view_attendance'), async (req, res) => {
  const date = todayStr();
  const studentRows = await db.prepare(
    `SELECT a.*, st.full_name, st.student_id, c.name AS class_name, sec.name AS section_name
     FROM attendance_summary a
     JOIN students st ON st.id = a.person_id
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     WHERE a.person_type='student' AND a.date = ?
     ORDER BY a.in_time IS NULL, a.in_time`
  ).all(date);
  const employeeRows = await db.prepare(
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
router.get('/logs', requirePermission('view_attendance'), async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.date) { where.push('l.date = ?'); params.push(req.query.date); }
  if (req.query.person_type) { where.push('l.person_type = ?'); params.push(req.query.person_type); }
  if (req.query.direction) { where.push('l.direction = ?'); params.push(req.query.direction); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM attendance_logs l ${whereSql}`).get(...params)).c;
  const rows = await db.prepare(
    `SELECT l.*, CASE WHEN l.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name
     FROM attendance_logs l
     LEFT JOIN students st ON st.id = l.person_id AND l.person_type='student'
     LEFT JOIN employees em ON em.id = l.person_id AND l.person_type='employee'
     ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// Export attendance summary as CSV (same filters as /summary)
router.get('/export', requirePermission('view_attendance'), async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page || 1, req.query.limit || 5000);
  const where = [];
  const params = [];
  if (req.query.date) { where.push('a.date = ?'); params.push(req.query.date); }
  if (req.query.from) { where.push('a.date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('a.date <= ?'); params.push(req.query.to); }
  if (req.query.person_type) { where.push('a.person_type = ?'); params.push(req.query.person_type); }
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.person_id) { where.push('a.person_id = ?'); params.push(req.query.person_id); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.prepare(
    `SELECT a.date, a.person_type,
       CASE WHEN a.person_type='student' THEN st.full_name ELSE em.full_name END AS name,
       CASE WHEN a.person_type='student' THEN st.student_id ELSE em.employee_id END AS code,
       c.name AS class_name, sec.name AS section_name, em.designation, d.name AS department,
       a.in_time, a.out_time, a.working_hours, a.overtime_hours, a.late_minutes, a.early_exit_minutes, a.status
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     LEFT JOIN departments d ON d.id = em.department_id
     ${whereSql} ORDER BY a.date DESC, a.person_type, name LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  const csv = toCsv(rows);
  const name = req.query.date ? req.query.date : `${req.query.from || 'start'}_${req.query.to || 'end'}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${name}.csv"`);
  res.send(csv);
});

// Export raw scan logs as CSV (filters matching /logs)
router.get('/export-logs', requirePermission('view_attendance'), async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page || 1, req.query.limit || 5000);
  const where = [];
  const params = [];
  if (req.query.date) { where.push('l.date = ?'); params.push(req.query.date); }
  if (req.query.person_type) { where.push('l.person_type = ?'); params.push(req.query.person_type); }
  if (req.query.direction) { where.push('l.direction = ?'); params.push(req.query.direction); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.prepare(
    `SELECT l.id, l.scan_time,
       CASE WHEN l.person_type='student' THEN st.full_name ELSE em.full_name END AS name,
       l.raw_uid AS card_uid, l.person_type, l.direction, dv.device_name, dv.location
     FROM attendance_logs l
     LEFT JOIN students st ON st.id = l.person_id AND l.person_type='student'
     LEFT JOIN employees em ON em.id = l.person_id AND l.person_type='employee'
     LEFT JOIN devices dv ON dv.id = l.device_id
     ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`
  )
    .all(...params, limit, offset);
  const csv = toCsv(rows);
  const name = req.query.date || 'logs';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="scan-logs-${name}.csv"`);
  res.send(csv);
});

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

// Own attendance (teacher / employee / student / parent)
router.get('/me', async (req, res) => {
  const { person_type: personType, person_id: personId } = req.user;
  if (!personId || !['student', 'employee'].includes(personType)) {
    return fail(res, 'No attendance record linked to this account');
  }
  const { from, to } = req.query;
  const where = ['a.person_type = ?', 'a.person_id = ?'];
  const params = [personType, personId];
  if (from) { where.push('a.date >= ?'); params.push(from); }
  if (to) { where.push('a.date <= ?'); params.push(to); }
  const rows = await db.prepare(
    `SELECT * FROM attendance_summary a WHERE ${where.join(' AND ')} ORDER BY a.date DESC LIMIT 60`
  ).all(...params);
  ok(res, { personType, personId, rows });
});

module.exports = router;
