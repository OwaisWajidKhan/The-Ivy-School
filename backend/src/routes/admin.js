const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('../db/schema');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate } = require('../utils/helpers');

router.use(requireAuth);

// --- User management ---
router.get('/users', requireRole('super_admin', 'school_admin'), (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const rows = db.prepare(
    `SELECT u.id, u.username, u.email, u.person_type, u.person_id, u.status, u.last_login_at, u.created_at,
       r.name AS role_name,
       CASE WHEN u.person_type='employee' THEN e.full_name WHEN u.person_type='student' THEN s.full_name ELSE NULL END AS linked_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN employees e ON e.id = u.person_id AND u.person_type='employee'
     LEFT JOIN students s ON s.id = u.person_id AND u.person_type='student'
     ORDER BY u.id LIMIT ? OFFSET ?`
  ).all(limit, offset);
  ok(res, { items: rows, total, page, limit });
});

router.post('/users', requireRole('super_admin', 'school_admin'), (req, res) => {
  const { username, email, password, role, person_type, person_id, status } = req.body;
  if (!username || !password || !role) return fail(res, 'username, password and role required');
  const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
  if (!roleRow) return fail(res, 'Invalid role');
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return fail(res, 'Username already exists');
  const info = db.prepare(
    'INSERT INTO users (username, email, password_hash, role_id, person_type, person_id, status) VALUES (?,?,?,?,?,?,?)'
  ).run(username, email || null, bcrypt.hashSync(password, 10), roleRow.id, person_type || 'admin', person_id || null, status || 'active');
  audit(req.user, 'create_user', 'user', info.lastInsertRowid, { username, role }, req.ip);
  ok(res, db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid), 201);
});

router.put('/users/:id', requireRole('super_admin', 'school_admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return fail(res, 'User not found', 404);
  const b = req.body;
  if (b.password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b.password, 10), user.id);
  }
  if (b.role) {
    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(b.role);
    if (roleRow) db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(roleRow.id, user.id);
  }
  db.prepare('UPDATE users SET email = COALESCE(?, email), status = COALESCE(?, status), person_type = COALESCE(?, person_type), person_id = COALESCE(?, person_id) WHERE id = ?')
    .run(b.email !== undefined ? b.email : null, b.status || null, b.person_type || null, b.person_id !== undefined ? b.person_id : null, user.id);
  audit(req.user, 'update_user', 'user', user.id, { username: user.username }, req.ip);
  ok(res, db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
});

router.delete('/users/:id', requireRole('super_admin', 'school_admin'), (req, res) => {
  if (req.params.id == req.user.id) return fail(res, 'You cannot delete your own account');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  ok(res, { message: 'User deleted' });
});

// --- Settings ---
router.get('/settings', requireRole('super_admin', 'school_admin'), (req, res) => {
  ok(res, db.prepare('SELECT key, value FROM settings ORDER BY key').all());
});

router.put('/settings', requireRole('super_admin', 'school_admin'), (req, res) => {
  const { key, value } = req.body;
  if (!key) return fail(res, 'key required');
  setSetting(key, value);
  audit(req.user, 'update_setting', 'setting', null, { key, value }, req.ip);
  ok(res, { key, value });
});

// --- Audit logs ---
router.get('/audit', requirePermission('view_audit_logs'), (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.q) { where.push('(username LIKE ? OR action LIKE ? OR entity_type LIKE ? OR details LIKE ?)'); const t = `%${req.query.q}%`; params.push(t, t, t, t); }
  if (req.query.action) { where.push('action = ?'); params.push(req.query.action); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// --- Branding (single-school) ---
router.get('/branding', (req, res) => {
  const keys = ['school_name', 'school_tagline', 'school_logo', 'school_address', 'school_contact_email', 'school_contact_phone', 'school_footer_text', 'school_timezone'];
  const obj = {};
  for (const k of keys) obj[k] = getSetting(k, null);
  ok(res, obj);
});

module.exports = router;
