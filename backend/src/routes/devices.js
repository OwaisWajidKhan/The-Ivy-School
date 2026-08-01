const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail } = require('../utils/helpers');

router.use(requireAuth);

// List devices
router.get('/', requirePermission('manage_devices'), async (req, res) => {
  ok(res, await db.prepare('SELECT * FROM devices ORDER BY id DESC').all());
});

// Register / update device
router.post('/', requirePermission('manage_devices'), async (req, res) => {
  const { device_name, device_id, location } = req.body;
  if (!device_id) return fail(res, 'device_id required');
  const existing = await db.prepare('SELECT * FROM devices WHERE device_id = ?').get(device_id);
  if (existing) {
    await db.prepare("UPDATE devices SET device_name=?, location=?, status='online', last_sync_time=datetime('now') WHERE id=?")
      .run(device_name || existing.device_name, location || existing.location, existing.id);
    return ok(res, await db.prepare('SELECT * FROM devices WHERE id = ?').get(existing.id));
  }
  const info = await db.prepare(
    "INSERT INTO devices (device_name, device_id, location, status, last_sync_time) VALUES (?,?,?, 'online', datetime('now'))"
  ).run(device_name || device_id, device_id, location || null);
  ok(res, await db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid), 201);
});

// Update device
router.put('/:id', requirePermission('manage_devices'), async (req, res) => {
  const existing = await db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Device not found', 404);
  const b = req.body;
  await db.prepare('UPDATE devices SET device_name=?, location=?, status=? WHERE id=?')
    .run(b.device_name || existing.device_name, b.location !== undefined ? b.location : existing.location, b.status || existing.status, existing.id);
  ok(res, await db.prepare('SELECT * FROM devices WHERE id = ?').get(existing.id));
});

// Delete device
router.delete('/:id', requirePermission('manage_devices'), async (req, res) => {
  await db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

module.exports = router;
