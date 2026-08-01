const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate } = require('../utils/helpers');

fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || '.jpg'}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only images allowed')))
});

router.use(requireAuth);

const selectBase = `
  SELECT e.*, d.name AS department, s.name AS shift_name, s.start_time, s.end_time
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN shifts s ON s.id = e.shift_id
`;

router.get('/', requirePermission('manage_employees'), (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.q) {
    where.push('(e.full_name LIKE ? OR e.employee_id LIKE ? OR e.cnic LIKE ? OR e.rfid_uid LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q, q);
  }
  if (req.query.department_id) { where.push('e.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.designation) { where.push('e.designation LIKE ?'); params.push(`%${req.query.designation}%`); }
  if (req.query.status) { where.push('e.status = ?'); params.push(req.query.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM employees e ${whereSql}`).get(...params).c;
  const rows = db.prepare(`${selectBase} ${whereSql} ORDER BY e.full_name LIMIT ? OFFSET ?`).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

router.get('/:id', requirePermission('manage_employees'), (req, res) => {
  const e = db.prepare(`${selectBase} WHERE e.id = ?`).get(req.params.id);
  if (!e) return fail(res, 'Employee not found', 404);
  const attendance = db.prepare(
    'SELECT * FROM attendance_summary WHERE person_type = ? AND person_id = ? ORDER BY date DESC LIMIT 30'
  ).all('employee', e.id);
  ok(res, { ...e, attendance });
});

router.post('/', upload.single('photo'), requirePermission('manage_employees'), (req, res) => {
  const b = req.body;
  if (!b.full_name) return fail(res, 'Full name is required');
  const employeeId = b.employee_id || `E-${Date.now().toString().slice(-6)}`;
  const photo = req.file ? `/uploads/${req.file.filename}` : b.photo || null;
  const insert = db.prepare(`
    INSERT INTO employees (employee_id, rfid_uid, full_name, cnic, mobile, department_id, designation, joining_date, salary, shift_id, working_hours, overtime_rate, leave_balance, status, photo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  try {
    const info = insert.run(
      employeeId, b.rfid_uid || null, b.full_name, b.cnic || null, b.mobile || null,
      b.department_id || null, b.designation || null, b.joining_date || null,
      parseFloat(b.salary) || 0, b.shift_id || null,
      parseFloat(b.working_hours) || 8, parseFloat(b.overtime_rate) || 1.5,
      parseFloat(b.leave_balance) || 0, b.status || 'active', photo
    );
    if (b.rfid_uid) {
      db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
        .run(b.rfid_uid, 'employee', info.lastInsertRowid, new Date().toISOString(), 'active');
    }
    audit(req.user, 'create_employee', 'employee', info.lastInsertRowid, { name: b.full_name }, req.ip);
    ok(res, db.prepare(`${selectBase} WHERE e.id = ?`).get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return fail(res, 'Duplicate record (employee id or RFID UID already exists)');
    throw e;
  }
});

router.put('/:id', upload.single('photo'), requirePermission('manage_employees'), (req, res) => {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Employee not found', 404);
  const b = req.body;
  const photo = req.file ? `/uploads/${req.file.filename}` : (b.photo !== undefined ? b.photo : existing.photo);
  db.prepare(`
    UPDATE employees SET employee_id=?, rfid_uid=?, full_name=?, cnic=?, mobile=?, department_id=?, designation=?,
      joining_date=?, salary=?, shift_id=?, working_hours=?, overtime_rate=?, leave_balance=?, status=?, photo=?
    WHERE id=?
  `).run(
    b.employee_id || existing.employee_id, b.rfid_uid !== undefined ? b.rfid_uid : existing.rfid_uid,
    b.full_name || existing.full_name, b.cnic !== undefined ? b.cnic : existing.cnic,
    b.mobile !== undefined ? b.mobile : existing.mobile,
    b.department_id !== undefined ? b.department_id : existing.department_id,
    b.designation !== undefined ? b.designation : existing.designation,
    b.joining_date !== undefined ? b.joining_date : existing.joining_date,
    b.salary !== undefined ? parseFloat(b.salary) : existing.salary,
    b.shift_id !== undefined ? b.shift_id : existing.shift_id,
    b.working_hours !== undefined ? parseFloat(b.working_hours) : existing.working_hours,
    b.overtime_rate !== undefined ? parseFloat(b.overtime_rate) : existing.overtime_rate,
    b.leave_balance !== undefined ? parseFloat(b.leave_balance) : existing.leave_balance,
    b.status || existing.status, photo,
    existing.id
  );
  if (b.rfid_uid && b.rfid_uid !== existing.rfid_uid) {
    db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
      .run(b.rfid_uid, 'employee', existing.id, new Date().toISOString(), 'active');
  }
  audit(req.user, 'update_employee', 'employee', existing.id, { name: b.full_name }, req.ip);
  ok(res, db.prepare(`${selectBase} WHERE e.id = ?`).get(existing.id));
});

router.delete('/:id', requirePermission('manage_employees'), (req, res) => {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Employee not found', 404);
  db.prepare('DELETE FROM employees WHERE id = ?').run(existing.id);
  audit(req.user, 'delete_employee', 'employee', existing.id, { name: existing.full_name }, req.ip);
  ok(res, { message: 'Employee deleted' });
});

module.exports = router;
