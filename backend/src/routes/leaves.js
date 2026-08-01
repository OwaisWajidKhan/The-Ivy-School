const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate } = require('../utils/helpers');
const storage = require('../services/storageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(requireAuth);

const TYPES = ['Casual', 'Sick', 'Annual', 'Emergency', 'Without Pay'];

router.get('/', async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  const { role_name } = req.user;
  if (role_name === 'teacher' || role_name === 'employee' || role_name === 'parent' || role_name === 'student') {
    where.push('l.person_type = ?'); params.push(req.user.person_type === 'student' ? 'student' : 'employee');
    where.push('l.person_id = ?'); params.push(req.user.person_id);
  }
  if (req.query.status) { where.push('l.status = ?'); params.push(req.query.status); }
  if (req.query.leave_type) { where.push('l.leave_type = ?'); params.push(req.query.leave_type); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM leaves l ${whereSql}`).get(...params)).c;
  const rows = await db.prepare(
    `SELECT l.*, u.username AS reviewer,
       CASE WHEN l.person_type='employee' THEN e.full_name ELSE st.full_name END AS full_name
     FROM leaves l
     LEFT JOIN users u ON u.id = l.approved_by
     LEFT JOIN employees e ON e.id = l.person_id AND l.person_type='employee'
     LEFT JOIN students st ON st.id = l.person_id AND l.person_type='student'
     ${whereSql} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

router.post('/', upload.single('document'), async (req, res) => {
  const b = req.body;
  if (!b.leave_type || !TYPES.includes(b.leave_type)) return fail(res, `leave_type must be one of ${TYPES.join(', ')}`);
  if (!b.start_date || !b.end_date) return fail(res, 'start_date and end_date required');

  let personType = b.person_type;
  let personId = b.person_id;
  const { role_name } = req.user;
  if (role_name === 'teacher' || role_name === 'employee') {
    personType = 'employee';
    personId = req.user.person_id;
  } else if (role_name === 'parent' || role_name === 'student') {
    personType = 'student';
    personId = req.user.person_id;
  }
  if (!personId) return fail(res, 'No linked person for this account');

  const start = new Date(b.start_date);
  const end = new Date(b.end_date);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const document = req.file
    ? await storage.uploadBuffer({ buffer: req.file.buffer, folder: 'documents', originalname: req.file.originalname, mimetype: req.file.mimetype })
    : b.document || null;

  const info = await db.prepare(
    'INSERT INTO leaves (person_type, person_id, leave_type, start_date, end_date, days, reason, document, status) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(personType, personId, b.leave_type, b.start_date, b.end_date, days, b.reason || null, document, 'pending');

  audit(req.user, 'request_leave', 'leave', info.lastInsertRowid, { type: b.leave_type, start_date: b.start_date }, req.ip);
  await db.prepare('INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)')
    .run('admin', null, 'email', 'leave', 'New leave request', `${req.user.username} requested ${b.leave_type} leave from ${b.start_date} to ${b.end_date}.`);
  ok(res, await db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid), 201);
});

// Approve / reject / cancel
router.put('/:id/status', requirePermission('approve_leave'), async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'cancelled'].includes(status)) return fail(res, 'Invalid status');
  const leaf = await db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!leaf) return fail(res, 'Leave not found', 404);

  await db.prepare('UPDATE leaves SET status = ?, approved_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?')
    .run(status, req.user.id, leaf.id);

  if (status === 'approved') {
    // deduct from employee leave balance
    if (leaf.person_type === 'employee') {
      const emp = await db.prepare('SELECT leave_balance FROM employees WHERE id = ?').get(leaf.person_id);
      if (emp) {
        await db.prepare('UPDATE employees SET leave_balance = MAX(0, leave_balance - ?) WHERE id = ?').run(leaf.days, leaf.person_id);
      }
    }
  } else if (status === 'rejected' || status === 'cancelled') {
    // restore balance if previously approved
    const wasApproved = leaf.status === 'approved';
    if (wasApproved && leaf.person_type === 'employee') {
      await db.prepare('UPDATE employees SET leave_balance = leave_balance + ? WHERE id = ?').run(leaf.days, leaf.person_id);
    }
  }

  audit(req.user, 'review_leave', 'leave', leaf.id, { status }, req.ip);
  await db.prepare('INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)')
    .run(leaf.person_type === 'student' ? 'parent' : 'employee', leaf.person_id, 'email', 'leave',
      `Leave ${status}`, `Your ${leaf.leave_type} leave request (${leaf.start_date} to ${leaf.end_date}) was ${status}.`);
  ok(res, await db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaf.id));
});

module.exports = router;
