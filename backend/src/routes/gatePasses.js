const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { db, getSetting } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit, paginate, todayStr, nowStr } = require('../utils/helpers');
const { notifyInApp, notifyEmail, notifyPerson } = require('../services/notifyService');

router.use(requireAuth);

const REASONS = ['Early Pickup', 'Medical', 'Event', 'Other'];

const selectBase = `
  SELECT gp.*, s.full_name, s.student_id, s.class_id, s.rfid_uid, c.name AS class_name, sec.name AS section_name,
    requester.username AS requested_by_name, approver.username AS approved_by_name
  FROM gate_passes gp
  JOIN students s ON s.id = gp.student_id
  LEFT JOIN classes c ON c.id = s.class_id
  LEFT JOIN sections sec ON sec.id = s.section_id
  LEFT JOIN users requester ON requester.id = gp.requested_by
  LEFT JOIN users approver ON approver.id = gp.approved_by
`;

// List gate passes (filters: status, date, student, class)
router.get('/', async (req, res) => {
  const { page, limit, offset } = paginate(req.query.page, req.query.limit);
  const where = [];
  const params = [];
  if (req.query.status) { where.push('gp.status = ?'); params.push(req.query.status); }
  if (req.query.exit_date) { where.push('gp.exit_date = ?'); params.push(req.query.exit_date); }
  if (req.query.from) { where.push('gp.exit_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('gp.exit_date <= ?'); params.push(req.query.to); }
  if (req.query.student_id) { where.push('gp.student_id = ?'); params.push(req.query.student_id); }
  if (req.query.class_id) { where.push('s.class_id = ?'); params.push(req.query.class_id); }
  // Role scoping: teachers/parents only see their own students
  const { role_name, person_type, person_id } = req.user;
  if (role_name === 'teacher' || role_name === 'parent' || role_name === 'student') {
    if (person_type === 'student' && person_id) {
      where.push('gp.student_id = ?'); params.push(person_id);
    } else if (role_name === 'parent' && person_id) {
      where.push('gp.student_id = ?'); params.push(person_id);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.prepare(`SELECT COUNT(*) AS c FROM gate_passes gp JOIN students s ON s.id = gp.student_id ${whereSql}`).get(...params)).c;
  const rows = await db.prepare(`${selectBase} ${whereSql} ORDER BY gp.exit_date DESC, gp.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  ok(res, { items: rows, total, page, limit });
});

// Create a gate pass request
router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.student_id) return fail(res, 'student_id is required');
  if (!REASONS.includes(b.reason)) return fail(res, `reason must be one of ${REASONS.join(', ')}`);
  if (!b.exit_date) return fail(res, 'exit_date is required');

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(b.student_id);
  if (!student) return fail(res, 'Student not found', 404);

  const passNo = `GP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const qrToken = crypto.randomBytes(16).toString('hex');
  const info = await db.prepare(
    `INSERT INTO gate_passes
      (student_id, pass_no, reason, reason_note, guardian_name, guardian_cnic, guardian_relation, guardian_contact,
       exit_date, status, requested_by, qr_token)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    student.id, passNo, b.reason, b.reason_note || null,
    b.guardian_name || student.father_name || null, b.guardian_cnic || null,
    b.guardian_relation || 'Parent', b.guardian_contact || student.parent_contact || null,
    b.exit_date, 'pending', req.user.id, qrToken
  );

  audit(req.user, 'request_gate_pass', 'gate_pass', info.lastInsertRowid, { student: student.full_name, reason: b.reason, exit_date: b.exit_date }, req.ip);
  await notifyAdminsGatePass(student, b.reason, b.exit_date);
  ok(res, await db.prepare(`${selectBase} WHERE gp.id = ?`).get(info.lastInsertRowid), 201);
});

// Approve / reject / cancel
router.put('/:id/status', requirePermission('approve_leave'), async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'cancelled'].includes(status)) return fail(res, 'status must be approved, rejected or cancelled');
  const pass = await db.prepare('SELECT * FROM gate_passes WHERE id = ?').get(req.params.id);
  if (!pass) return fail(res, 'Gate pass not found', 404);
  if (pass.status === 'used') return fail(res, 'Cannot change a used gate pass');

  await db.prepare("UPDATE gate_passes SET status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?")
    .run(status, req.user.id, pass.id);

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(pass.student_id);
  const title = status === 'approved' ? 'Gate pass approved' : status === 'rejected' ? 'Gate pass rejected' : 'Gate pass cancelled';
  const message = `${student.full_name}'s gate pass (${pass.pass_no}) for ${pass.exit_date} was ${status}.`;
  await notifyPerson({ personType: 'student', personId: pass.student_id, type: 'gate_pass', title, message });
  if (student.parent_contact) {
    await notifyEmail({ to: student.parent_contact, recipientType: 'parent', recipientId: pass.student_id, type: 'gate_pass', title, message });
  }
  audit(req.user, 'review_gate_pass', 'gate_pass', pass.id, { status, student: student.full_name }, req.ip);
  ok(res, await db.prepare(`${selectBase} WHERE gp.id = ?`).get(pass.id));
});

// RFID exit verification: security scans the student's RFID card -> marks approved pass as used
router.post('/verify-exit', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return fail(res, 'RFID uid is required');
  const card = await db.prepare('SELECT * FROM rfid_cards WHERE uid = ? AND card_type = ?').get(String(uid), 'student');
  if (!card) return fail(res, 'Unknown student RFID card', 404);
  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(card.person_id);
  if (!student) return fail(res, 'Student not found', 404);

  const pass = await db.prepare(
    `SELECT * FROM gate_passes WHERE student_id = ? AND status = 'approved' AND exit_date = ? ORDER BY id DESC LIMIT 1`
  ).get(student.id, todayStr());
  if (!pass) return fail(res, `No approved gate pass for ${student.full_name} today`, 404);

  await db.prepare("UPDATE gate_passes SET status = 'used', used_at = datetime('now'), verified_by = ? WHERE id = ?")
    .run(req.user.id, pass.id);

  // Record an attendance OUT for the student today (early exit) if a summary exists
  const summary = await db.prepare("SELECT * FROM attendance_summary WHERE person_type='student' AND person_id=? AND date=?").get(student.id, todayStr());
  if (summary && !summary.out_time) {
    const utcHhmm = new Date().toISOString().slice(11, 16);
    await db.prepare("UPDATE attendance_summary SET out_time = ?, status='early_exit' WHERE id=?").run(utcHhmm, summary.id);
  }
  const nowT = nowStr().slice(11, 16);
  await db.prepare(
    "INSERT INTO attendance_logs (person_type, person_id, direction, scan_time, date, raw_uid, gate_pass_id) VALUES ('student', ?, 'OUT', datetime('now'), ?, ?, ?)"
  ).run(student.id, todayStr(), uid, pass.id);

  const message = `${student.full_name}'s gate pass (${pass.pass_no}) verified at ${nowT}.`;
  await notifyPerson({ personType: 'student', personId: student.id, type: 'gate_pass', title: 'Gate pass used', message });
  audit(req.user, 'use_gate_pass', 'gate_pass', pass.id, { student: student.full_name, uid }, req.ip);
  ok(res, { ...await db.prepare(`${selectBase} WHERE gp.id = ?`).get(pass.id), verifiedAt: nowT });
});

// Printable QR slip (HTML, printer friendly)
router.get('/:id/slip', async (req, res) => {
  const pass = await db.prepare(`${selectBase} WHERE gp.id = ?`).get(req.params.id);
  if (!pass) return fail(res, 'Gate pass not found', 404);
  res.send(await renderSlip(pass));
});

// QR code image for the slip
router.get('/:id/qr', async (req, res) => {
  const pass = await db.prepare('SELECT * FROM gate_passes WHERE id = ?').get(req.params.id);
  if (!pass) return fail(res, 'Gate pass not found', 404);
  try {
    const png = await QRCode.toBuffer(JSON.stringify({ token: pass.qr_token, passNo: pass.pass_no }));
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    fail(res, 'QR generation failed');
  }
});

// Gate pass report for a date range
router.get('/report', requirePermission('view_reports'), async (req, res) => {
  const from = req.query.from || todayStr();
  const to = req.query.to || todayStr();
  const rows = await db.prepare(
    `${selectBase} WHERE gp.exit_date BETWEEN ? AND ? ORDER BY gp.exit_date, gp.status`
  ).all(from, to);
  ok(res, { from, to, rows });
});

async function notifyAdminsGatePass(student, reason, exitDate) {
  const title = 'New gate pass request';
  const message = `${student.full_name} requested a ${reason} gate pass for ${exitDate}.`;
  const admins = await db.prepare(
    `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status='active' AND r.name IN ('super_admin','school_admin')`
  ).all();
  for (const a of admins) {
    await notifyInApp({ recipientType: 'admin', recipientId: a.id, type: 'gate_pass', title, message });
    if (a.email) await notifyEmail({ to: a.email, recipientType: 'admin', recipientId: a.id, type: 'gate_pass', title, message });
  }
}

async function renderSlip(pass) {
  const school = await getSetting('school_name', 'The Ivy School');
  const statusColor = pass.status === 'used' ? '#0d9488' : pass.status === 'approved' ? '#15803d' : '#b45309';
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Gate Pass ${pass.pass_no}</title>
<style>
  *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  body{background:#f1f5f9;display:flex;justify-content:center;padding:40px 12px}
  .pass{width:340px;background:#fff;border:2px dashed #63224a;border-radius:14px;padding:22px}
  .head{border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px;text-align:center}
  .head h1{margin:0;color:#521b3c;font-size:20px}
  .head p{margin:2px 0 0;color:#64748b;font-size:12px}
  .no{display:inline-block;background:#63224a;color:#fff;border-radius:999px;padding:4px 12px;font-size:12px;margin-top:6px;font-weight:600}
  .row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dotted #e2e8f0;font-size:13px}
  .row .k{color:#64748b}.row .v{font-weight:600;text-align:right}
  .status{text-align:center;margin:14px 0;padding:10px;border-radius:10px;background:${statusColor}15;color:${statusColor};font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:13px}
  .qr{text-align:center;margin-top:8px}
  .qr img{width:130px;height:130px}
  .foot{margin-top:12px;text-align:center;color:#94a3b8;font-size:10px}
  @media print{body{background:#fff;padding:0}.pass{border:2px solid #63224a}}
</style></head><body>
<div class="pass">
  <div class="head">
    <h1>${school}</h1><p>Student Gate Pass Slip</p>
    <span class="no">${pass.pass_no}</span>
  </div>
  <div class="status">${pass.status}</div>
  <div class="row"><span class="k">Student</span><span class="v">${pass.full_name}</span></div>
  <div class="row"><span class="k">Student ID</span><span class="v">${pass.student_id}</span></div>
  <div class="row"><span class="k">Class</span><span class="v">${pass.class_name || '—'} ${pass.section_name || ''}</span></div>
  <div class="row"><span class="k">Reason</span><span class="v">${pass.reason}</span></div>
  ${pass.reason_note ? `<div class="row"><span class="k">Note</span><span class="v">${pass.reason_note}</span></div>` : ''}
  <div class="row"><span class="k">Exit date</span><span class="v">${pass.exit_date}</span></div>
  ${pass.used_at ? `<div class="row"><span class="k">Verified at</span><span class="v">${pass.used_at}</span></div>` : ''}
  <div class="row"><span class="k">Guardian</span><span class="v">${pass.guardian_name || '—'}</span></div>
  ${pass.guardian_relation ? `<div class="row"><span class="k">Relation</span><span class="v">${pass.guardian_relation}</span></div>` : ''}
  ${pass.guardian_contact ? `<div class="row"><span class="k">Contact</span><span class="v">${pass.guardian_contact}</span></div>` : ''}
  <div class="qr"><img src="/api/gate-passes/${pass.id}/qr" alt="QR"/><p style="font-size:10px;color:#94a3b8">Security: scan QR or student RFID card to verify exit</p></div>
  <div class="foot">Show this slip to security staff at the gate</div>
</div>
<script>window.print()</script>
</body></html>`;
}

module.exports = router;
