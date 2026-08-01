const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { db } = require('../db/schema');
const { fail, audit } = require('../utils/helpers');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role_name },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    config.jwtRefreshSecret,
    { expiresIn: `${config.refreshTokenTtlDays}d`, jwtid: crypto.randomUUID() }
  );
}

async function getRoleName(userId) {
  const row = await db.prepare(
    `SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
  ).get(userId);
  return row ? row.name : null;
}

async function getPermissions(roleName) {
  const row = await db.prepare('SELECT permissions FROM roles WHERE name = ?').get(roleName);
  if (!row) return [];
  try {
    return JSON.parse(row.permissions);
  } catch {
    return [];
  }
}

async function loadUser(userId) {
  return await db.prepare(
    `SELECT u.id, u.username, u.email, u.person_type, u.person_id, u.status, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
  ).get(userId);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 'Authentication required', 401);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await loadUser(payload.sub);
    if (!user) return fail(res, 'User not found', 401);
    if (user.status !== 'active') return fail(res, 'Account is not active', 403);
    req.user = { ...user, permissions: await getPermissions(user.role_name) };
    return next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return fail(res, 'Token expired', 401, { code: 'TOKEN_EXPIRED' });
    return fail(res, 'Invalid token', 401);
  }
}

function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) return fail(res, 'Authentication required', 401);
    const perms = req.user.permissions || [];
    if (perms.includes(permission)) return next();
    audit(req.user, 'denied_permission', null, null, { permission });
    return fail(res, 'You do not have permission to perform this action', 403);
  };
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) return fail(res, 'Authentication required', 401);
    if (roles.includes(req.user.role_name)) return next();
    audit(req.user, 'denied_role', null, null, { required: roles });
    return fail(res, 'You do not have permission to perform this action', 403);
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  requireAuth,
  requirePermission,
  requireRole,
  getRoleName,
  getPermissions,
  loadUser
};
