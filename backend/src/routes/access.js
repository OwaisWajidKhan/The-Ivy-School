const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit } = require('../utils/helpers');
const { PERMISSIONS, ALL_PERMISSION_KEYS } = require('../constants/permissions');

router.use(requireAuth);

const PROTECTED_ROLES = ['admin'];

function sanitizePermissions(list) {
  const set = new Set(Array.isArray(list) ? list.map(String) : []);
  return ALL_PERMISSION_KEYS.filter(k => set.has(k));
}

// Permission catalog for the role editor
router.get('/permissions', requirePermission('manage_settings'), async (req, res) => {
  ok(res, PERMISSIONS);
});

// List roles with assigned user counts
router.get('/roles', requirePermission('manage_settings'), async (req, res) => {
  const rows = await db.prepare(
    `SELECT r.id, r.name, r.description, r.permissions, COUNT(u.id) AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id = r.id
     GROUP BY r.id ORDER BY r.name`
  ).all();
  for (const r of rows) {
    try { r.permissions = JSON.parse(r.permissions || '[]'); } catch { r.permissions = []; }
  }
  ok(res, rows);
});

// Create a role
router.post('/roles', requirePermission('manage_settings'), async (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name || !String(name).trim()) return fail(res, 'Role name is required');
  const clean = String(name).trim().toLowerCase().replace(/\s+/g, '_');
  const exists = await db.prepare('SELECT id FROM roles WHERE name = ?').get(clean);
  if (exists) return fail(res, `Role "${clean}" already exists`);
  const info = await db.prepare(
    'INSERT INTO roles (name, description, permissions) VALUES (?,?,?)'
  ).run(clean, description || null, JSON.stringify(sanitizePermissions(permissions)));
  audit(req.user, 'create_role', 'role', info.lastInsertRowid, { name: clean, permissions: sanitizePermissions(permissions) }, req.ip);
  ok(res, await db.prepare('SELECT * FROM roles WHERE id = ?').get(info.lastInsertRowid), 201);
});

// Update a role (name, description, permissions)
router.put('/roles/:id', requirePermission('manage_settings'), async (req, res) => {
  const role = await db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!role) return fail(res, 'Role not found', 404);
  const b = req.body;
  let name = role.name;
  if (b.name !== undefined) {
    name = String(b.name).trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) return fail(res, 'Role name cannot be empty');
    if (name !== role.name) {
      const clash = await db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
      if (clash) return fail(res, `Role "${name}" already exists`);
    }
  }
  const perms = b.permissions !== undefined ? sanitizePermissions(b.permissions) : role.permissions;
  await db.prepare('UPDATE roles SET name=?, description=?, permissions=? WHERE id=?')
    .run(name, b.description !== undefined ? b.description : role.description, JSON.stringify(perms), role.id);
  audit(req.user, 'update_role', 'role', role.id, { name, permissions: perms }, req.ip);
  ok(res, await db.prepare('SELECT * FROM roles WHERE id = ?').get(role.id));
});

// Delete a role (protected roles cannot be removed)
router.delete('/roles/:id', requirePermission('manage_settings'), async (req, res) => {
  const role = await db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!role) return fail(res, 'Role not found', 404);
  if (PROTECTED_ROLES.includes(role.name)) return fail(res, `The "${role.name}" role is protected and cannot be deleted`);
  const users = await db.prepare('SELECT COUNT(*) AS c FROM users WHERE role_id = ?').get(role.id);
  if (Number(users.c) > 0) return fail(res, `Cannot delete: ${users.c} user(s) are assigned to this role`);
  await db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
  audit(req.user, 'delete_role', 'role', role.id, { name: role.name }, req.ip);
  ok(res, { message: 'Role deleted' });
});

module.exports = router;