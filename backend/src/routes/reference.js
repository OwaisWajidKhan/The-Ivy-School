const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth, requirePermission, requireRole } = require('../middleware/auth');
const { ok, fail, audit } = require('../utils/helpers');

router.use(requireAuth);

// --- Classes ---
router.get('/classes', async (req, res) => {
  const rows = await db.prepare(`
    SELECT c.id, c.name, c.description,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
    FROM classes c ORDER BY c.name
  `).all();
  ok(res, rows);
});

router.post('/classes', requirePermission('manage_settings'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return fail(res, 'Name required');
  try {
    const info = await db.prepare('INSERT INTO classes (name, description) VALUES (?,?)').run(name, description || null);
    audit(req.user, 'create_class', 'class', info.lastInsertRowid, { name }, req.ip);
    ok(res, await db.prepare('SELECT * FROM classes WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) return fail(res, 'Class already exists');
    throw e;
  }
});

router.delete('/classes/:id', requirePermission('manage_settings'), async (req, res) => {
  await db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// --- Sections ---
router.get('/sections', async (req, res) => {
  const { class_id } = req.query;
  const rows = class_id
    ? await db.prepare('SELECT * FROM sections WHERE class_id = ? ORDER BY name').all(class_id)
    : await db.prepare('SELECT s.*, c.name AS class_name FROM sections s JOIN classes c ON c.id = s.class_id ORDER BY c.name, s.name').all();
  ok(res, rows);
});

router.post('/sections', requirePermission('manage_settings'), async (req, res) => {
  const { class_id, name } = req.body;
  if (!class_id || !name) return fail(res, 'class_id and name required');
  try {
    const info = await db.prepare('INSERT INTO sections (class_id, name) VALUES (?,?)').run(class_id, name);
    ok(res, await db.prepare('SELECT * FROM sections WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) return fail(res, 'Section already exists for this class');
    throw e;
  }
});

router.delete('/sections/:id', requirePermission('manage_settings'), async (req, res) => {
  await db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// --- Departments ---
router.get('/departments', async (req, res) => {
  const rows = await db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS employee_count
    FROM departments d ORDER BY d.name
  `).all();
  ok(res, rows);
});

router.post('/departments', requirePermission('manage_settings'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return fail(res, 'Name required');
  try {
    const info = await db.prepare('INSERT INTO departments (name, description) VALUES (?,?)').run(name, description || null);
    ok(res, await db.prepare('SELECT * FROM departments WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) return fail(res, 'Department already exists');
    throw e;
  }
});

router.delete('/departments/:id', requirePermission('manage_settings'), async (req, res) => {
  await db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// --- Shifts ---
router.get('/shifts', async (req, res) => {
  ok(res, await db.prepare('SELECT * FROM shifts ORDER BY start_time').all());
});

router.post('/shifts', requirePermission('manage_settings'), async (req, res) => {
  const { name, start_time, end_time, grace_minutes, half_day_threshold_hours, description } = req.body;
  if (!name || !start_time || !end_time) return fail(res, 'name, start_time, end_time required');
  try {
    const info = await db.prepare(
      'INSERT INTO shifts (name, start_time, end_time, grace_minutes, half_day_threshold_hours, description) VALUES (?,?,?,?,?,?)'
    ).run(name, start_time, end_time, parseInt(grace_minutes) || 0, parseFloat(half_day_threshold_hours) || 4, description || null);
    ok(res, await db.prepare('SELECT * FROM shifts WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) return fail(res, 'Shift already exists');
    throw e;
  }
});

router.put('/shifts/:id', requirePermission('manage_settings'), async (req, res) => {
  const existing = await db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Shift not found', 404);
  const b = req.body;
  await db.prepare('UPDATE shifts SET name=?, start_time=?, end_time=?, grace_minutes=?, half_day_threshold_hours=?, description=? WHERE id=?')
    .run(b.name || existing.name, b.start_time || existing.start_time, b.end_time || existing.end_time,
      b.grace_minutes !== undefined ? parseInt(b.grace_minutes) : existing.grace_minutes,
      b.half_day_threshold_hours !== undefined ? parseFloat(b.half_day_threshold_hours) : existing.half_day_threshold_hours,
      b.description !== undefined ? b.description : existing.description, existing.id);
  ok(res, await db.prepare('SELECT * FROM shifts WHERE id = ?').get(existing.id));
});

router.delete('/shifts/:id', requirePermission('manage_settings'), async (req, res) => {
  await db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// --- Holidays ---
router.get('/holidays', async (req, res) => {
  const { year } = req.query;
  const rows = year
    ? await db.prepare("SELECT * FROM holidays WHERE date LIKE ? ORDER BY date").all(`${year}%`)
    : await db.prepare('SELECT * FROM holidays ORDER BY date DESC').all();
  ok(res, rows);
});

router.post('/holidays', requirePermission('manage_holidays'), async (req, res) => {
  const { name, date, type, description } = req.body;
  if (!name || !date) return fail(res, 'name and date required');
  try {
    const info = await db.prepare('INSERT INTO holidays (name, date, type, description) VALUES (?,?,?,?)')
      .run(name, date, type || 'Public', description || null);
    audit(req.user, 'create_holiday', 'holiday', info.lastInsertRowid, { name, date }, req.ip);
    ok(res, await db.prepare('SELECT * FROM holidays WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unique')) return fail(res, 'Holiday already exists for this date');
    throw e;
  }
});

router.delete('/holidays/:id', requirePermission('manage_holidays'), async (req, res) => {
  await db.prepare('DELETE FROM holidays WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// --- Roles (for admin management) ---
router.get('/roles', requireRole('admin'), async (req, res) => {
  ok(res, await db.prepare('SELECT id, name, description, permissions FROM roles').all());
});

module.exports = router;
