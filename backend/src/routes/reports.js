const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail } = require('../utils/helpers');

router.use(requireAuth);

// Build a generic summary list for a date range
async function buildRows({ personType, from, to }) {
  return await db.prepare(
    `SELECT a.*,
       CASE WHEN a.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name,
       st.student_id, c.name AS class_name, sec.name AS section_name,
       em.employee_id, em.designation, d.name AS department
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     LEFT JOIN departments d ON d.id = em.department_id
     WHERE a.date BETWEEN ? AND ?
       AND (? IS NULL OR a.person_type = ?)
     ORDER BY a.date, a.person_type, full_name`
  ).all(from, to, personType || null, personType || null);
}

function parseRange(q) {
  const from = q.from || new Date().toISOString().slice(0, 10);
  const to = q.to || new Date().toISOString().slice(0, 10);
  const personType = ['student', 'employee'].includes(q.person_type) ? q.person_type : null;
  return { from, to, personType };
}

// Daily report
router.get('/daily', requirePermission('view_reports'), async (req, res) => {
  const { date } = req.query;
  const d = date || new Date().toISOString().slice(0, 10);
  const students = await db.prepare(
    `SELECT a.*, st.full_name, st.student_id, c.name AS class_name, sec.name AS section_name
     FROM attendance_summary a
     JOIN students st ON st.id = a.person_id
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     WHERE a.person_type='student' AND a.date = ?
     ORDER BY st.full_name`
  ).all(d);
  const employees = await db.prepare(
    `SELECT a.*, em.full_name, em.employee_id, em.designation
     FROM attendance_summary a
     JOIN employees em ON em.id = a.person_id
     WHERE a.person_type='employee' AND a.date = ?
     ORDER BY em.full_name`
  ).all(d);
  ok(res, { date: d, students, employees });
});

// Monthly summary (per person)
router.get('/monthly', requirePermission('view_reports'), async (req, res) => {
  const month = String(parseInt(req.query.month) || new Date().getMonth() + 1).padStart(2, '0');
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const personType = ['student', 'employee'].includes(req.query.person_type) ? req.query.person_type : null;
  const from = `${year}-${month}-01`;
  const to = `${year}-${month}-31`;

  const rows = await db.prepare(
    `SELECT
       a.person_type, a.person_id,
       CASE WHEN a.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name,
       st.student_id, c.name AS class_name, sec.name AS section_name,
       em.employee_id, em.designation, d.name AS department,
       COUNT(*) AS present_days,
       SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN a.status='half_day' THEN 1 ELSE 0 END) AS half_day,
       SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN a.status='early_exit' THEN 1 ELSE 0 END) AS early_exit,
       SUM(CASE WHEN a.status='overtime' THEN 1 ELSE 0 END) AS overtime,
       ROUND(SUM(a.working_hours),2) AS total_working_hours,
       ROUND(SUM(a.overtime_hours),2) AS overtime_hours
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     LEFT JOIN departments d ON d.id = em.department_id
     WHERE a.date BETWEEN ? AND ? AND (? IS NULL OR a.person_type = ?)
     GROUP BY a.person_type, a.person_id
     ORDER BY a.person_type, full_name`
  ).all(from, to, personType, personType);

  const holidays = (await db.prepare("SELECT COUNT(*) AS c FROM holidays WHERE date BETWEEN ? AND ?").get(from, to)).c;
  ok(res, { month, year, from, to, holidays, rows });
});

// Shift report (staff)
router.get('/shift', requirePermission('view_reports'), async (req, res) => {
  const { from, to } = parseRange(req.query);
  const rows = await db.prepare(
    `SELECT s.name AS shift_name, s.start_time, s.end_time,
       COUNT(e.id) AS staff_count,
       SUM(CASE WHEN a.status IS NOT NULL AND a.date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS present_days
     FROM shifts s
     LEFT JOIN employees e ON e.shift_id = s.id
     LEFT JOIN attendance_summary a ON a.person_id = e.id AND a.person_type='employee'
     GROUP BY s.id
     ORDER BY s.start_time`
  ).all(from, to);
  ok(res, { from, to, rows });
});

// Overtime report
router.get('/overtime', requirePermission('view_reports'), async (req, res) => {
  const { from, to } = parseRange(req.query);
  const rows = await db.prepare(
    `SELECT em.id, em.full_name, em.employee_id, em.designation,
       COUNT(a.id) AS overtime_days, ROUND(SUM(a.overtime_hours),2) AS overtime_hours
     FROM attendance_summary a
     JOIN employees em ON em.id = a.person_id
     WHERE a.person_type='employee' AND a.overtime_hours > 0 AND a.date BETWEEN ? AND ?
     GROUP BY em.id ORDER BY overtime_hours DESC`
  ).all(from, to);
  ok(res, { from, to, rows });
});

// Late arrivals report
router.get('/late', requirePermission('view_reports'), async (req, res) => {
  const { from, to } = parseRange(req.query);
  const rows = (await buildRows({ personType: req.query.person_type, from, to })).filter(r => r.late_minutes > 0);
  ok(res, { from, to, rows });
});

// Early exit report
router.get('/early-exit', requirePermission('view_reports'), async (req, res) => {
  const { from, to } = parseRange(req.query);
  const rows = (await buildRows({ personType: req.query.person_type, from, to })).filter(r => r.early_exit_minutes > 0);
  ok(res, { from, to, rows });
});

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] || {});
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

// Generic CSV export of a monthly report
router.get('/export/csv', requirePermission('export_reports'), async (req, res) => {
  const { month, year, person_type } = req.query;
  const m = String(parseInt(month) || new Date().getMonth() + 1).padStart(2, '0');
  const y = parseInt(year) || new Date().getFullYear();
  const from = `${y}-${m}-01`;
  const to = `${y}-${m}-31`;
  const rows = await buildRows({ personType: person_type || null, from, to });
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${y}-${m}.csv"`);
  res.send(csv);
});

// Export a daily report as CSV
router.get('/export/daily-csv', requirePermission('export_reports'), async (req, res) => {
  const d = req.query.date || new Date().toISOString().slice(0, 10);
  const students = await db.prepare(
    `SELECT 'Student' AS type, st.student_id AS id, st.full_name, c.name AS class, a.in_time, a.out_time, a.status, a.working_hours
     FROM attendance_summary a JOIN students st ON st.id = a.person_id
     LEFT JOIN classes c ON c.id = st.class_id WHERE a.date = ? AND a.person_type='student' ORDER BY st.full_name`
  ).all(d);
  const employees = await db.prepare(
    `SELECT 'Employee' AS type, em.employee_id AS id, em.full_name, em.designation AS class, a.in_time, a.out_time, a.status, a.working_hours
     FROM attendance_summary a JOIN employees em ON em.id = a.person_id
     WHERE a.date = ? AND a.person_type='employee' ORDER BY em.full_name`
  ).all(d);
  const csv = toCsv([...students, ...employees]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="daily-attendance-${d}.csv"`);
  res.send(csv);
});

// ---- Phase 2 reports ----

// Student Gate Pass report (all passes in a date range)
router.get('/gate-passes', requirePermission('view_reports'), async (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const rows = await db.prepare(
    `SELECT gp.pass_no, gp.reason, gp.exit_date, gp.status, gp.created_at AS requested_at, gp.used_at,
       s.full_name, s.student_id, c.name AS class_name, sec.name AS section_name
     FROM gate_passes gp
     JOIN students s ON s.id = gp.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN sections sec ON sec.id = s.section_id
     WHERE gp.exit_date BETWEEN ? AND ?
     ORDER BY gp.exit_date, s.full_name`
  ).all(from, to);
  ok(res, { from, to, rows });
});

// Monthly Attendance Summary (student-wise and class-wise %)
router.get('/attendance-summary', requirePermission('view_reports'), async (req, res) => {
  const month = String(parseInt(req.query.month) || new Date().getMonth() + 1).padStart(2, '0');
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const classId = req.query.class_id || null;
  const from = `${year}-${month}-01`;
  const to = `${year}-${month}-31`;

  const classRows = await db.prepare(
    `SELECT c.id AS class_id, c.name AS class_name,
       COUNT(s.id) AS total_students,
       ROUND(100.0 * SUM(CASE WHEN a.status IN ('present','late','half_day') THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT a.date) * COUNT(DISTINCT s.id), 0), 1) AS attendance_pct
     FROM classes c
     LEFT JOIN students s ON s.class_id = c.id AND s.status='active'
     LEFT JOIN attendance_summary a ON a.person_type='student' AND a.person_id = s.id AND a.date BETWEEN ? AND ?
     WHERE (? IS NULL OR c.id = ?)
     GROUP BY c.id, c.name
     ORDER BY c.name`
  ).all(from, to, classId, classId);

  const studentRows = await db.prepare(
    `SELECT s.id AS student_id, s.full_name, s.student_id, c.name AS class_name, sec.name AS section_name,
       COUNT(DISTINCT a.date) AS present_days,
       SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN a.status='half_day' THEN 1 ELSE 0 END) AS half_day,
       SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) AS absent,
       ROUND(100.0 * (SUM(CASE WHEN a.status IN ('present','late','half_day') THEN 1 ELSE 0 END) * 1.0) / NULLIF(COUNT(DISTINCT a.date), 0), 1) AS attendance_pct
     FROM students s
     LEFT JOIN attendance_summary a ON a.person_type='student' AND a.person_id = s.id AND a.date BETWEEN ? AND ?
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN sections sec ON sec.id = s.section_id
     WHERE s.status='active' AND (? IS NULL OR s.class_id = ?)
     GROUP BY s.id, s.full_name, s.student_id, c.name, sec.name
     ORDER BY c.name, s.full_name`
  ).all(from, to, classId, classId);

  ok(res, { month, year, from, to, classes: classRows, students: studentRows });
});

// Leave report (approved/rejected/pending by employee)
router.get('/leaves', requirePermission('view_reports'), async (req, res) => {
  const { from, to } = parseRange(req.query);
  const rows = await db.prepare(
    `SELECT l.*, e.full_name, e.employee_id, d.name AS department,
       u.username AS reviewer
     FROM leaves l
     JOIN employees e ON e.id = l.person_id AND l.person_type='employee'
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN users u ON u.id = l.approved_by
     WHERE l.start_date BETWEEN ? AND ?
     ORDER BY l.created_at DESC`
  ).all(from, to);
  ok(res, { from, to, rows });
});

// Export any report as CSV (generic): pass report=gate_passes|attendance_summary|leaves
router.get('/export/generic', requirePermission('export_reports'), async (req, res) => {
  const { report, from, to, month, year } = req.query;
  const f = from || new Date().toISOString().slice(0, 10);
  const t = to || f;
  let rows = [];
  let filename = 'report';
  if (report === 'gate_passes') {
    rows = await db.prepare(
      `SELECT gp.pass_no, s.full_name, s.student_id, c.name AS class_name, gp.reason, gp.exit_date, gp.status, gp.used_at
       FROM gate_passes gp JOIN students s ON s.id=gp.student_id LEFT JOIN classes c ON c.id=s.class_id
       WHERE gp.exit_date BETWEEN ? AND ? ORDER BY gp.exit_date`
    ).all(f, t);
    filename = `gate-passes-${f}-${t}`;
  } else if (report === 'leaves') {
    rows = await db.prepare(
      `SELECT e.full_name, e.employee_id, l.leave_type, l.start_date, l.end_date, l.days, l.status, l.reason
       FROM leaves l JOIN employees e ON e.id=l.person_id AND l.person_type='employee'
       WHERE l.start_date BETWEEN ? AND ? ORDER BY l.start_date`
    ).all(f, t);
    filename = `leaves-${f}-${t}`;
  } else if (report === 'payroll') {
    const m = String(parseInt(month) || new Date().getMonth() + 1).padStart(2, '0');
    const y = parseInt(year) || new Date().getFullYear();
    rows = await db.prepare(
      `SELECT e.full_name, e.employee_id, d.name AS department, p.base_salary, p.present_days, p.absent_days, p.deductions, p.overtime_pay, p.net_salary, p.status
       FROM payroll p JOIN employees e ON e.id=p.employee_id LEFT JOIN departments d ON d.id=e.department_id
       WHERE p.month=? AND p.year=? ORDER BY e.full_name`
    ).all(parseInt(m), y);
    filename = `payroll-${y}-${m}`;
  }
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
});

module.exports = router;
