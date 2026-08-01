const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { ok, fail, paginate } = require('../utils/helpers');

router.use(requireAuth);

// List notifications for current user context
router.get('/', (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const { role_name, person_type, person_id } = req.user;
  const where = ['n.recipient_type IN (?)'];
  const params = [role_name === 'parent' ? 'parent' : role_name === 'teacher' || role_name === 'employee' ? 'employee' : 'admin'];
  if ((role_name === 'teacher' || role_name === 'employee' || role_name === 'parent') && person_id) {
    where.push('(n.recipient_id = ? OR n.recipient_id IS NULL)');
    params.push(person_id);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM notifications n ${whereSql}`).get(...params).c;
  const unread = db.prepare(`SELECT COUNT(*) AS c FROM notifications n ${whereSql} AND n.read = 0`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM notifications n ${whereSql} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  ok(res, { items: rows, total, unread, page, limit });
});

// Mark read
router.put('/:id/read', (req, res) => {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!n) return fail(res, 'Notification not found', 404);
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(n.id);
  ok(res, { message: 'Marked read' });
});

// Mark all as read for current user context
router.put('/read-all', (req, res) => {
  const { role_name, person_type, person_id } = req.user;
  const recipient = role_name === 'parent' ? 'parent' : role_name === 'teacher' || role_name === 'employee' ? 'employee' : 'admin';
  if (person_id) {
    db.prepare('UPDATE notifications SET read = 1 WHERE recipient_type = ? AND (recipient_id = ? OR recipient_id IS NULL)').run(recipient, person_id);
  } else {
    db.prepare('UPDATE notifications SET read = 1 WHERE recipient_type = ?').run(recipient);
  }
  ok(res, { message: 'All marked read' });
});

module.exports = router;
