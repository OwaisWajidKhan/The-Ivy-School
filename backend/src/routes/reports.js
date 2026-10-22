const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail } = require('../utils/helpers');
const { todayStr } = require('../utils/helpers');
const { toExcel } = require('../utils/helpers');
const ExcelJS = require('exceljs');

router.use(requireAuth);

function dayName(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Excel sheet names: max 31 chars, no : \ / ? * [ ], must be unique.
function sheetName(name, fallback, used) {
  let base = String(name || fallback || 'Employee').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) base = String(fallback || 'Employee');
  let candidate = base.slice(0, 31);
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  row.alignment = { vertical: 'middle' };
}

// Employee daily-hours report: per employee, every date in the month with the
// check-in / check-out times and hours worked that day, plus month totals.
async function buildEmployeeHours(month, year) {
  const m = String(parseInt(month, 10) || new Date().getMonth() + 1).padStart(2, '0');
  const y = parseInt(year, 10) || new Date().getFullYear();
  const from = `${y}-${m}-01`;
  const to = `${y}-${m}-31`;

  const rows = await db.prepare(
    `SELECT em.id, em.employee_id, em.full_name, em.designation,
       d.name AS department,
       a.date, a.in_time, a.out_time, a.working_hours, a.overtime_hours, a.status
     FROM employees em
     LEFT JOIN departments d ON d.id = em.department_id
     LEFT JOIN attendance_summary a
       ON a.person_type='employee' AND a.person_id = em.id AND a.date BETWEEN ? AND ?
     ORDER BY em.full_name, a.date`
  ).all(from, to);

  const employees = [];
  const byId = new Map();
  for (const r of rows) {
    let emp = byId.get(r.id);
    if (!emp) {
      emp = {
        id: r.id,
        employee_id: r.employee_id,
        full_name: r.full_name,
        designation: r.designation,
        department: r.department,
        present_days: 0,
        working_days: 0,
        total_hours: 0,
        overtime_hours: 0,
        days: []
      };
      byId.set(r.id, emp);
      employees.push(emp);
    }
    if (!r.date) continue;
    const hours = Number(r.working_hours) || 0;
    const overtime = Number(r.overtime_hours) || 0;
    emp.days.push({
      date: r.date,
      day: dayName(r.date),
      in_time: r.in_time || null,
      out_time: r.out_time || null,
      working_hours: round2(hours),
      overtime_hours: round2(overtime),
      status: r.status
    });
    emp.working_days += 1;
    emp.total_hours += hours;
    emp.overtime_hours += overtime;
    if (['present', 'late', 'half_day', 'early_exit', 'overtime'].includes(r.status)) emp.present_days += 1;
  }
  for (const emp of employees) {
    emp.total_hours = round2(emp.total_hours);
    emp.overtime_hours = round2(emp.overtime_hours);
  }
  return { month: m, year: y, from, to, employees };
}

// Build a generic summary list for a date range
async function buildRows({ personType, from, to }) {
  // Note: dynamic WHERE instead of `(? IS NULL OR col = ?)`. Postgres cannot
  // infer the type of a parameter that only appears in `IS NULL` (error 42P18),
  // so conditional predicates are appended only when a filter is present.
  const args = [from, to];
  let where = 'WHERE a.date BETWEEN ? AND ?';
  if (personType) {
    where += ' AND a.person_type = ?';
    args.push(personType);
  }
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
     ${where}
     ORDER BY a.date, a.person_type, full_name`
  ).all(...args);
}

function parseRange(q) {
  const from = q.from || todayStr();
  const to = q.to || todayStr();
  const personType = ['student', 'employee'].includes(q.person_type) ? q.person_type : null;
  return { from, to, personType };
}

// Daily report
router.get('/daily', requirePermission('view_reports'), async (req, res) => {
  const { date } = req.query;
  const d = date || todayStr();
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
  const args = [from, to];
  let where = 'WHERE a.date BETWEEN ? AND ?';
  if (personType) {
    where += ' AND a.person_type = ?';
    args.push(personType);
  }

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
       ROUND(CAST(SUM(a.working_hours) AS NUMERIC),2) AS total_working_hours,
       ROUND(CAST(SUM(a.overtime_hours) AS NUMERIC),2) AS overtime_hours
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     LEFT JOIN classes c ON c.id = st.class_id
     LEFT JOIN sections sec ON sec.id = st.section_id
     LEFT JOIN departments d ON d.id = em.department_id
     ${where}
     GROUP BY a.person_type, a.person_id, st.full_name, st.student_id, c.name, sec.name,
              em.full_name, em.employee_id, em.designation, d.name
     ORDER BY a.person_type, full_name`
  ).all(...args);

  ok(res, { month, year, from, to, rows });
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
       COUNT(a.id) AS overtime_days, ROUND(CAST(SUM(a.overtime_hours) AS NUMERIC),2) AS overtime_hours
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
  const xls = toExcel(rows, [
    ['date', 'Date'], ['person_type', 'Type'], ['full_name', 'Name'],
    ['class_name', 'Class'], ['section_name', 'Section'], ['department', 'Department'],
    ['in_time', 'Check In'], ['out_time', 'Check Out'], ['working_hours', 'Hours'], ['status', 'Status']
  ]);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${y}-${m}.xls"`);
  res.send(xls);
});

// Export a daily report as CSV
router.get('/export/daily-csv', requirePermission('export_reports'), async (req, res) => {
  const d = req.query.date || todayStr();
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
  const xls = toExcel([...students, ...employees], [
    ['type', 'Type'], ['id', 'ID'], ['full_name', 'Name'], ['class', 'Class/Dept'],
    ['in_time', 'Check In'], ['out_time', 'Check Out'], ['status', 'Status'], ['working_hours', 'Hours']
  ]);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="daily-attendance-${d}.xls"`);
  res.send(xls);
});

// ---- Phase 2 reports ----

// Monthly Attendance Summary (student-wise and class-wise %)
router.get('/attendance-summary', requirePermission('view_reports'), async (req, res) => {
  const month = String(parseInt(req.query.month) || new Date().getMonth() + 1).padStart(2, '0');
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const classId = req.query.class_id ? parseInt(req.query.class_id, 10) : null;
  const from = `${year}-${month}-01`;
  const to = `${year}-${month}-31`;

  const classArgs = [from, to];
  let classWhere = '';
  if (classId) { classWhere = 'WHERE c.id = ?'; classArgs.push(classId); }
  const classRows = await db.prepare(
    `SELECT c.id AS class_id, c.name AS class_name,
       COUNT(DISTINCT s.id) AS total_students,
       ROUND(100.0 * SUM(CASE WHEN a.status IN ('present','late','half_day') THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT a.date) * COUNT(DISTINCT s.id), 0), 1) AS attendance_pct
     FROM classes c
     LEFT JOIN students s ON s.class_id = c.id AND s.status='active'
     LEFT JOIN attendance_summary a ON a.person_type='student' AND a.person_id = s.id AND a.date BETWEEN ? AND ?
     ${classWhere}
     GROUP BY c.id, c.name
     ORDER BY c.name`
  ).all(...classArgs);

  const studentArgs = [from, to];
  let studentWhere = "WHERE s.status='active'";
  if (classId) { studentWhere += ' AND s.class_id = ?'; studentArgs.push(classId); }
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
     ${studentWhere}
     GROUP BY s.id, s.full_name, s.student_id, c.name, sec.name
     ORDER BY c.name, s.full_name`
  ).all(...studentArgs);

  ok(res, { month, year, from, to, classes: classRows, students: studentRows });
});

// Employee daily hours for a month (per employee, per date: in/out/hours)
router.get('/employee-hours', requirePermission('view_reports'), async (req, res) => {
  ok(res, await buildEmployeeHours(req.query.month, req.query.year));
});

// Excel export of the employee daily-hours report (for salary calculation).
// One sheet per employee + a Summary sheet with month totals.
router.get('/export/employee-hours', requirePermission('export_reports'), async (req, res) => {
  const { month, year, employees } = await buildEmployeeHours(req.query.month, req.query.year);
  const monthLabel = new Date(year, Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Ivy School';
  wb.created = new Date();

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Employee ID', key: 'employee_id', width: 16 },
    { header: 'Employee Name', key: 'full_name', width: 30 },
    { header: 'Designation', key: 'designation', width: 22 },
    { header: 'Department', key: 'department', width: 22 },
    { header: 'Present Days', key: 'present_days', width: 14 },
    { header: 'Month Total Hours', key: 'total_hours', width: 18 },
    { header: 'Month Overtime Hours', key: 'overtime_hours', width: 20 }
  ];
  summary.spliceRows(1, 1, [`Employee Hours — ${monthLabel} ${year}`]);
  summary.mergeCells('A1:G1');
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.addRow(['Employee ID', 'Employee Name', 'Designation', 'Department', 'Present Days', 'Month Total Hours', 'Month Overtime Hours']);
  styleHeader(summary.getRow(2));
  for (const emp of employees) {
    summary.addRow([emp.employee_id, emp.full_name, emp.designation || '', emp.department || '', emp.present_days, emp.total_hours, emp.overtime_hours]);
  }
  const totalsRow = summary.addRow(['', 'Total', '', '', employees.reduce((s, e) => s + e.present_days, 0),
    round2(employees.reduce((s, e) => s + e.total_hours, 0)), round2(employees.reduce((s, e) => s + e.overtime_hours, 0))]);
  totalsRow.font = { bold: true };
  summary.views = [{ state: 'frozen', ySplit: 2 }];

  const used = new Set(['summary']);
  for (const emp of employees) {
    const ws = wb.addWorksheet(sheetName(emp.full_name, emp.employee_id, used));
    ws.columns = [
      { key: 'date', width: 14 },
      { key: 'day', width: 8 },
      { key: 'in_time', width: 12 },
      { key: 'out_time', width: 12 },
      { key: 'working_hours', width: 12 },
      { key: 'overtime_hours', width: 15 },
      { key: 'status', width: 14 }
    ];
    ws.addRow([`${emp.full_name} — ${monthLabel} ${year}`]).font = { bold: true, size: 14 };
    ws.addRow([`${emp.employee_id}${emp.designation ? ` · ${emp.designation}` : ''}${emp.department ? ` · ${emp.department}` : ''}`]);
    ws.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
    ws.addRow([]);
    const header = ws.addRow(['Date', 'Day', 'Check In', 'Check Out', 'Day Hours', 'Overtime Hours', 'Status']);
    styleHeader(header);
    for (const d of emp.days) {
      ws.addRow([d.date, d.day, d.in_time || '', d.out_time || '', d.working_hours, d.overtime_hours || 0, d.status]);
    }
    if (!emp.days.length) {
      const empty = ws.addRow(['No attendance records for this month']);
      ws.mergeCells(empty.number, 1, empty.number, 7);
      empty.font = { italic: true, color: { argb: 'FF64748B' } };
    }
    const total = ws.addRow(['Total', '', '', '', emp.total_hours, emp.overtime_hours, `${emp.present_days} day(s)`]);
    total.font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="employee-hours-${year}-${month}.xlsx"`);
  res.send(Buffer.from(buf));
});

module.exports = router;
