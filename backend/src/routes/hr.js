const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate } = require('../utils/helpers');

router.use(requireAuth);

const uploadDir = config.uploadDir;
fs.mkdirSync(uploadDir, { recursive: true });
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || ''}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ---- Designations ----
router.get('/designations', (req, res) => {
  const rows = db.prepare(
    `SELECT d.*, dep.name AS department, (SELECT COUNT(*) FROM employees e WHERE e.designation_id = d.id) AS employee_count
     FROM designations d LEFT JOIN departments dep ON dep.id = d.department_id ORDER BY d.name`
  ).all();
  ok(res, rows);
});

router.post('/designations', requirePermission('manage_settings'), (req, res) => {
  const { name, department_id, description } = req.body;
  if (!name) return fail(res, 'name required');
  try {
    const info = db.prepare('INSERT INTO designations (name, department_id, description) VALUES (?,?,?)')
      .run(name, department_id || null, description || null);
    audit(req.user, 'create_designation', 'designation', info.lastInsertRowid, { name }, req.ip);
    ok(res, db.prepare('SELECT * FROM designations WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return fail(res, 'Designation already exists');
    throw e;
  }
});

router.put('/designations/:id', requirePermission('manage_settings'), (req, res) => {
  const existing = db.prepare('SELECT * FROM designations WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Designation not found', 404);
  const b = req.body;
  db.prepare('UPDATE designations SET name=?, department_id=?, description=? WHERE id=?')
    .run(b.name || existing.name, b.department_id !== undefined ? b.department_id : existing.department_id,
      b.description !== undefined ? b.description : existing.description, existing.id);
  ok(res, db.prepare('SELECT * FROM designations WHERE id = ?').get(existing.id));
});

router.delete('/designations/:id', requirePermission('manage_settings'), (req, res) => {
  db.prepare('DELETE FROM designations WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// ---- Subjects ----
router.get('/subjects', (req, res) => {
  ok(res, db.prepare('SELECT * FROM subjects ORDER BY name').all());
});

router.post('/subjects', requirePermission('manage_settings'), (req, res) => {
  const { name, code, description } = req.body;
  if (!name) return fail(res, 'name required');
  try {
    const info = db.prepare('INSERT INTO subjects (name, code, description) VALUES (?,?,?)')
      .run(name, code || null, description || null);
    audit(req.user, 'create_subject', 'subject', info.lastInsertRowid, { name }, req.ip);
    ok(res, db.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return fail(res, 'Subject code already exists');
    throw e;
  }
});

router.put('/subjects/:id', requirePermission('manage_settings'), (req, res) => {
  const existing = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 'Subject not found', 404);
  const b = req.body;
  db.prepare('UPDATE subjects SET name=?, code=?, description=? WHERE id=?')
    .run(b.name || existing.name, b.code !== undefined ? b.code : existing.code, b.description !== undefined ? b.description : existing.description, existing.id);
  ok(res, db.prepare('SELECT * FROM subjects WHERE id = ?').get(existing.id));
});

router.delete('/subjects/:id', requirePermission('manage_settings'), (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// ---- Teacher - Class - Section - Subject assignments ----
router.get('/assignments', (req, res) => {
  const rows = db.prepare(
    `SELECT ta.*, e.full_name AS teacher_name, e.employee_id, s.name AS subject_name,
       c.name AS class_name, sec.name AS section_name
     FROM teacher_assignments ta
     JOIN employees e ON e.id = ta.teacher_id
     LEFT JOIN subjects s ON s.id = ta.subject_id
     LEFT JOIN classes c ON c.id = ta.class_id
     LEFT JOIN sections sec ON sec.id = ta.section_id
     ORDER BY c.name, sec.name, e.full_name`
  ).all();
  ok(res, rows);
});

router.post('/assignments', requirePermission('manage_settings'), (req, res) => {
  const { teacher_id, subject_id, class_id, section_id } = req.body;
  if (!teacher_id || !class_id) return fail(res, 'teacher_id and class_id required');
  try {
    const info = db.prepare(
      'INSERT INTO teacher_assignments (teacher_id, subject_id, class_id, section_id) VALUES (?,?,?,?)'
    ).run(teacher_id, subject_id || null, class_id, section_id || null);
    audit(req.user, 'assign_teacher', 'teacher_assignment', info.lastInsertRowid, { teacher_id, class_id }, req.ip);
    ok(res, db.prepare('SELECT * FROM teacher_assignments WHERE id = ?').get(info.lastInsertRowid), 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return fail(res, 'This assignment already exists');
    throw e;
  }
});

router.delete('/assignments/:id', requirePermission('manage_settings'), (req, res) => {
  db.prepare('DELETE FROM teacher_assignments WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// ---- Employee documents ----
router.get('/employees/:id/documents', (req, res) => {
  ok(res, db.prepare('SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC').all(req.params.id));
});

router.post('/employees/:id/documents', requirePermission('manage_employees'), docUpload.single('file'), (req, res) => {
  const { doc_type, title } = req.body;
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return fail(res, 'Employee not found', 404);
  if (!req.file) return fail(res, 'file required');
  const info = db.prepare(
    'INSERT INTO employee_documents (employee_id, doc_type, title, file_path, uploaded_by) VALUES (?,?,?,?,?)'
  ).run(emp.id, doc_type || 'Other', title || req.file.originalname, `/uploads/${req.file.filename}`, req.user.id);
  audit(req.user, 'upload_employee_doc', 'employee_document', info.lastInsertRowid, { employee: emp.full_name }, req.ip);
  ok(res, db.prepare('SELECT * FROM employee_documents WHERE id = ?').get(info.lastInsertRowid), 201);
});

router.delete('/documents/:id', requirePermission('manage_employees'), (req, res) => {
  db.prepare('DELETE FROM employee_documents WHERE id = ?').run(req.params.id);
  ok(res, { message: 'Deleted' });
});

// ---- Teachers list (employees flagged as teachers) ----
router.get('/teachers', (req, res) => {
  ok(res, db.prepare(`SELECT * FROM employees WHERE designation LIKE '%Teacher%' OR designation_id IN (SELECT id FROM designations WHERE name LIKE '%Teacher%') ORDER BY full_name`).all());
});

module.exports = router;
