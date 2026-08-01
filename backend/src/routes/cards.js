const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate } = require('../utils/helpers');
const { notifyInApp } = require('../services/notifyService');

router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Card status dashboard
router.get('/dashboard', requirePermission('manage_devices'), async (req, res) => {
  const active = (await db.prepare("SELECT COUNT(*) AS c FROM rfid_cards WHERE status='active'").get()).c;
  const blocked = (await db.prepare("SELECT COUNT(*) AS c FROM rfid_cards WHERE status IN ('inactive','lost','revoked')").get()).c;
  const totalPeople = (await db.prepare(
    "SELECT (SELECT COUNT(*) FROM students WHERE status='active') + (SELECT COUNT(*) FROM employees WHERE status='active') AS c"
  ).get()).c;
  const assigned = (await db.prepare("SELECT COUNT(*) AS c FROM rfid_cards WHERE status='active'").get()).c;
  ok(res, {
    active,
    blocked,
    unassigned: Math.max(0, totalPeople - assigned),
    total: (await db.prepare('SELECT COUNT(*) AS c FROM rfid_cards').get()).c,
    peopleWithoutCard: totalPeople - assigned
  });
});

// List cards with linked person
router.get('/', requirePermission('manage_devices'), async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.status) { where.push('c.status = ?'); params.push(req.query.status); }
  if (req.query.card_type) { where.push('c.card_type = ?'); params.push(req.query.card_type); }
  if (req.query.q) {
    where.push('(c.uid LIKE ? OR st.full_name LIKE ? OR em.full_name LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM rfid_cards c ${whereSql}`).get(...params)).c;
  const rows = await db.prepare(
    `SELECT c.*,
       CASE WHEN c.card_type='student' THEN st.full_name ELSE em.full_name END AS person_name,
       CASE WHEN c.card_type='student' THEN st.student_id ELSE em.employee_id END AS person_code,
       cl.name AS class_name
     FROM rfid_cards c
     LEFT JOIN students st ON st.id = c.person_id AND c.card_type='student'
     LEFT JOIN employees em ON em.id = c.person_id AND c.card_type='employee'
     LEFT JOIN classes cl ON cl.id = st.class_id
     ${whereSql} ORDER BY c.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// People without an active card (assignment pool)
router.get('/pool', requirePermission('manage_devices'), async (req, res) => {
  const students = await db.prepare(
    `SELECT s.id, s.full_name AS name, s.student_id AS code
     FROM students s
     LEFT JOIN rfid_cards c ON c.person_id = s.id AND c.card_type='student' AND c.status='active'
     WHERE s.status='active' AND c.id IS NULL ORDER BY s.full_name`
  ).all();
  const employees = await db.prepare(
    `SELECT e.id, e.full_name AS name, e.employee_id AS code
     FROM employees e
     LEFT JOIN rfid_cards c ON c.person_id = e.id AND c.card_type='employee' AND c.status='active'
     WHERE e.status='active' AND c.id IS NULL ORDER BY e.full_name`
  ).all();
  ok(res, { students, employees });
});

// Assign a card to a person (new issue)
router.post('/assign', requirePermission('manage_devices'), async (req, res) => {
  const { uid, card_type, person_id } = req.body;
  if (!uid || !card_type || !person_id) return fail(res, 'uid, card_type and person_id required');
  if (!['student', 'employee'].includes(card_type)) return fail(res, 'card_type must be student or employee');
  const exists = await db.prepare('SELECT * FROM rfid_cards WHERE uid = ?').get(String(uid));
  if (exists) return fail(res, 'RFID UID already assigned to another card');
  const person = card_type === 'student'
    ? await db.prepare('SELECT * FROM students WHERE id = ?').get(person_id)
    : await db.prepare('SELECT * FROM employees WHERE id = ?').get(person_id);
  if (!person) return fail(res, 'Person not found', 404);

  const info = await db.prepare(
    "INSERT INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,datetime('now'),'active')"
  ).run(String(uid), card_type, person.id);
  await db.prepare('UPDATE students SET rfid_uid = ? WHERE id = ?').run(String(uid), person.id);
  audit(req.user, 'assign_card', 'rfid_card', info.lastInsertRowid, { uid, card_type, person: person.full_name }, req.ip);
  ok(res, await db.prepare('SELECT * FROM rfid_cards WHERE id = ?').get(info.lastInsertRowid), 201);
});

// Reissue a lost card (new UID, marks old one lost)
router.post('/:id/reissue', requirePermission('manage_devices'), async (req, res) => {
  const card = await db.prepare('SELECT * FROM rfid_cards WHERE id = ?').get(req.params.id);
  if (!card) return fail(res, 'Card not found', 404);
  const new_uid = req.body?.new_uid || (card.card_type === 'student' ? `STU${Date.now()}` : `EMP${Date.now()}`);
  const exists = await db.prepare('SELECT * FROM rfid_cards WHERE uid = ?').get(String(new_uid));
  if (exists) return fail(res, 'New UID already in use');
  await db.prepare("UPDATE rfid_cards SET status='lost' WHERE id = ?").run(card.id);
  const info = await db.prepare(
    "INSERT INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,datetime('now'),'active')"
  ).run(String(new_uid), card.card_type, card.person_id);
  if (card.card_type === 'student') {
    await db.prepare('UPDATE students SET rfid_uid = ? WHERE id = ?').run(String(new_uid), card.person_id);
  } else {
    await db.prepare('UPDATE employees SET rfid_uid = ? WHERE id = ?').run(String(new_uid), card.person_id);
  }
  audit(req.user, 'reissue_card', 'rfid_card', card.id, { old_uid: card.uid, new_uid }, req.ip);
  ok(res, { old: await db.prepare('SELECT * FROM rfid_cards WHERE id = ?').get(card.id), new: await db.prepare('SELECT * FROM rfid_cards WHERE id = ?').get(info.lastInsertRowid) });
});

// Block / activate a card
router.put('/:id/status', requirePermission('manage_devices'), async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive', 'lost', 'revoked'].includes(status)) return fail(res, 'Invalid status');
  const card = await db.prepare('SELECT * FROM rfid_cards WHERE id = ?').get(req.params.id);
  if (!card) return fail(res, 'Card not found', 404);
  await db.prepare('UPDATE rfid_cards SET status = ? WHERE id = ?').run(status, card.id);
  audit(req.user, 'card_status_change', 'rfid_card', card.id, { uid: card.uid, status }, req.ip);
  ok(res, await db.prepare('SELECT * FROM rfid_cards WHERE id = ?').get(card.id));
});

// Bulk CSV upload: columns: uid,card_type,person_code (student_id or employee_id)
// Accepts either multipart file (field 'file') or JSON body { csv: "..." }
router.post('/bulk', requirePermission('manage_devices'), upload.single('file'), async (req, res) => {
  let text = req.body?.csv || (req.file && req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (!text) return fail(res, 'CSV file or csv text required');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return fail(res, 'CSV needs a header row plus data rows');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const uidIdx = header.indexOf('uid');
  const typeIdx = header.indexOf('card_type');
  const codeIdx = header.indexOf('person_code') >= 0 ? header.indexOf('person_code') : header.indexOf('student_id') >= 0 ? header.indexOf('student_id') : header.indexOf('employee_id');
  if (uidIdx < 0 || typeIdx < 0 || codeIdx < 0) return fail(res, 'CSV must have columns: uid, card_type, person_code');

  const results = { assigned: 0, skipped: 0, errors: [] };
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const uid = (cols[uidIdx] || '').trim();
    const cardType = (cols[typeIdx] || '').trim();
    const code = (cols[codeIdx] || '').trim();
    if (!uid || !cardType || !code) { results.skipped++; continue; }
    const person = cardType === 'student'
      ? await db.prepare('SELECT * FROM students WHERE student_id = ?').get(code)
      : await db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(code);
    if (!person) { results.errors.push(`Row ${i}: no ${cardType} with code ${code}`); results.skipped++; continue; }
    try {
      await db.prepare("INSERT INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,datetime('now'),'active')")
        .run(uid, cardType, person.id);
      if (cardType === 'student') await db.prepare('UPDATE students SET rfid_uid = ? WHERE id = ?').run(uid, person.id);
      else await db.prepare('UPDATE employees SET rfid_uid = ? WHERE id = ?').run(uid, person.id);
      results.assigned++;
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) { results.errors.push(`Row ${i}: UID ${uid} already assigned`); results.skipped++; }
      else throw e;
    }
  }
  audit(req.user, 'bulk_assign_cards', 'rfid_card', null, { assigned: results.assigned, skipped: results.skipped }, req.ip);
  ok(res, results);
});

module.exports = router;
