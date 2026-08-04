const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const router = express.Router();
const { db } = require('../db/schema');
const config = require('../config');
const { signAccessToken, signRefreshToken, requireAuth, loadUser, getRoleName } = require('../middleware/auth');
const { ok, fail, audit } = require('../utils/helpers');
const storage = require('../services/storageService');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  }
});

// Login with brute-force protection
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 'Username and password are required');

  const user = await db.prepare(
    `SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ?`
  ).get(String(username).trim());

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    if (user) {
      await db.prepare('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?').run(user.id);
    }
    audit(null, 'failed_login', 'user', user ? user.id : null, { username }, req.ip);
    return fail(res, 'Invalid username or password', 401);
  }

  if (user.status === 'locked') return fail(res, 'Account locked due to too many attempts', 403);
  if (user.status !== 'active') return fail(res, 'Account is disabled', 403);

  await db.prepare("UPDATE users SET failed_attempts = 0, last_login_at = datetime('now') WHERE id = ?").run(user.id);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86400000).toISOString();
  await db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, refreshToken, expiresAt);

  audit(user, 'login', 'user', user.id, { role: user.role_name }, req.ip);
  ok(res, { accessToken, refreshToken, user: publicUser(user) });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return fail(res, 'Refresh token required', 400);
  const row = await db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND revoked = 0').get(refreshToken);
  if (!row) return fail(res, 'Invalid refresh token', 401);
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(row.id);
    return fail(res, 'Refresh token expired', 401);
  }
  const user = await loadUser(row.user_id);
  if (!user || user.status !== 'active') return fail(res, 'User not found', 401);
  const accessToken = signAccessToken(user);
  ok(res, { accessToken, user: publicUser(user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').run(refreshToken);
  }
  audit(req.user, 'logout', 'user', req.user.id, null, req.ip);
  ok(res, { message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res) => {
  const full = await db.prepare(
    `SELECT u.*, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
  ).get(req.user.id);
  const person = await loadPerson(req.user.person_type, req.user.person_id);
  ok(res, { user: { ...publicUser(full), permissions: parsePerms(full.permissions), person } });
});

// Update own profile details (email / password)
router.put('/me', requireAuth, async (req, res) => {
  const { email, password, currentPassword } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return fail(res, 'User not found', 404);
  if (currentPassword && password) {
    if (!bcrypt.compareSync(String(currentPassword), user.password_hash)) return fail(res, 'Current password is incorrect', 400);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), user.id);
  }
  if (email !== undefined) await db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, user.id);
  audit(req.user, 'update_profile', 'user', user.id, null, req.ip);
  const updated = await db.prepare(
    `SELECT u.*, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
  ).get(user.id);
  ok(res, { user: { ...publicUser(updated), permissions: parsePerms(updated.permissions) } });
});

// Upload own profile picture (avatar)
router.put('/me/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  const user = await db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
  if (!req.file) return fail(res, 'No image file provided', 400);
  const avatar = await storage.uploadBuffer({ buffer: req.file.buffer, folder: 'avatars', originalname: req.file.originalname, mimetype: req.file.mimetype });
  if (user && user.avatar) await storage.deleteUpload(user.avatar);
  await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  audit(req.user, 'update_avatar', 'user', req.user.id, null, req.ip);
  ok(res, { user: { ...publicUser(req.user), avatar } });
});

function parsePerms(p) {
  try { return JSON.parse(p); } catch { return []; }
}

async function loadPerson(type, id) {
  if (!id) return null;
  if (type === 'student') return await db.prepare('SELECT id, full_name, class_id, section_id FROM students WHERE id = ?').get(id);
  if (type === 'employee') return await db.prepare('SELECT id, full_name, designation, department_id FROM employees WHERE id = ?').get(id);
  return null;
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    avatar: u.avatar || null,
    role: u.role_name,
    personType: u.person_type,
    personId: u.person_id,
    status: u.status
  };
}

module.exports = router;
