const { db } = require('../db/schema');
const { todayStr } = require('../utils/helpers');

async function countWorkingDays(month, year) {
  const holidays = (await db.prepare('SELECT date FROM holidays WHERE strftime(\'%m\', date) = ? AND strftime(\'%Y\', date) = ?')
    .all(String(month).padStart(2, '0'), String(year))).map(r => r.date);
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (holidays.includes(dateStr)) continue;
    count++;
  }
  return count;
}

async function approvedLeaveDays(employeeId, month, year) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = await db.prepare(
    `SELECT leave_type, start_date, end_date FROM leaves
     WHERE person_type = 'employee' AND person_id = ? AND status = 'approved'
       AND start_date <= ? AND end_date >= ?`
  ).all(employeeId, end, start);
  let total = 0;
  let withoutPay = 0;
  const startDt = new Date(year, month - 1, 1);
  const endDt = new Date(year, month, 0);
  for (const l of rows) {
    const s = new Date(l.start_date);
    const e = new Date(l.end_date);
    const from = new Date(Math.max(s.getTime(), startDt.getTime()));
    const to = new Date(Math.min(e.getTime(), endDt.getTime()));
    let days = 0;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      days++;
    }
    total += days;
    if (l.leave_type === 'Without Pay') withoutPay += days;
  }
  return { total, withoutPay, paid: total - withoutPay };
}

async function generateForMonth(month, year) {
  const workingDays = await countWorkingDays(month, year);
  const employees = await db.prepare(
    `SELECT e.*, s.name AS shift_name
     FROM employees e LEFT JOIN shifts s ON s.id = e.shift_id
     WHERE e.status = 'active'`
  ).all();

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-31`;

  const upsert = await db.prepare(`
    INSERT INTO payroll (
      employee_id, month, year, working_days, present_days, absent_days, late_days, half_days,
      leave_days, overtime_hours, total_working_hours, base_salary, overtime_pay, leave_adjustment,
      deductions, bonuses, net_salary, notes, generated_at, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'), 'draft')
    ON CONFLICT(employee_id, month, year) DO UPDATE SET
      working_days = excluded.working_days, present_days = excluded.present_days,
      absent_days = excluded.absent_days, late_days = excluded.late_days,
      half_days = excluded.half_days, leave_days = excluded.leave_days,
      overtime_hours = excluded.overtime_hours, total_working_hours = excluded.total_working_hours,
      base_salary = excluded.base_salary, overtime_pay = excluded.overtime_pay,
      leave_adjustment = excluded.leave_adjustment, deductions = excluded.deductions,
      bonuses = excluded.bonuses, net_salary = excluded.net_salary, notes = excluded.notes,
      generated_at = datetime('now'), status = 'draft'
  `);

  const results = [];
  for (const emp of employees) {
    const summary = await db.prepare(
      `SELECT status, working_hours, overtime_hours FROM attendance_summary
       WHERE person_type = 'employee' AND person_id = ? AND date BETWEEN ? AND ?`
    ).all(emp.id, periodStart, periodEnd);

    const presentDays = summary.length;
    const lateDays = summary.filter(r => r.status === 'late').length;
    const halfDays = summary.filter(r => r.status === 'half_day').length;
    const totalWorkingHours = Math.round(summary.reduce((a, r) => a + r.working_hours, 0) * 100) / 100;
    const overtimeHours = Math.round(summary.reduce((a, r) => a + r.overtime_hours, 0) * 100) / 100;

    const leaves = await approvedLeaveDays(emp.id, month, year);
    const absentDays = Math.max(0, workingDays - presentDays - leaves.total);

    const hourlyRate = workingDays > 0 && (emp.working_hours || 8) > 0
      ? emp.salary / (workingDays * (emp.working_hours || 8))
      : emp.salary / 160;

    const overtimePay = Math.round(overtimeHours * hourlyRate * (emp.overtime_rate || 1.5) * 100) / 100;
    const dayRate = workingDays > 0 ? emp.salary / workingDays : emp.salary / 26;
    const absentDeduction = absentDays * dayRate;
    const halfDayDeduction = halfDays * dayRate * 0.5;
    const withoutPayDeduction = leaves.withoutPay * dayRate;
    const deductions = Math.round((absentDeduction + halfDayDeduction + withoutPayDeduction) * 100) / 100;

    const netSalary = Math.round((emp.salary - deductions + overtimePay) * 100) / 100;

    await upsert.run(
      emp.id, month, year, workingDays, presentDays, absentDays, lateDays, halfDays,
      leaves.total, overtimeHours, totalWorkingHours, emp.salary, overtimePay,
      leaves.withoutPay * dayRate, deductions, 0, netSalary,
      `Generated ${todayStr()}`
    );
    results.push({
      employeeId: emp.id,
      name: emp.full_name,
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      halfDays,
      leaveDays: leaves.total,
      overtimeHours,
      totalWorkingHours,
      baseSalary: emp.salary,
      deductions,
      overtimePay,
      netSalary
    });
  }
  return results;
}

async function getReport(month, year) {
  return await db.prepare(
    `SELECT p.*, e.full_name, e.employee_id, e.designation, d.name AS department,
            e.salary AS current_salary
     FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE p.month = ? AND p.year = ?
     ORDER BY e.full_name`
  ).all(month, year);
}

// Approve a generated payroll record (HR review step). Returns the record.
async function approveRecord(id, userId) {
  const row = await db.prepare('SELECT * FROM payroll WHERE id = ?').get(id);
  if (!row) return { ok: false, message: 'Payroll record not found' };
  await db.prepare("UPDATE payroll SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?")
    .run(userId, id);
  return { ok: true, row: await db.prepare('SELECT * FROM payroll WHERE id = ?').get(id) };
}

// Approve all draft records for a month/year.
async function approveMonth(month, year, userId) {
  const info = await db.prepare(
    "UPDATE payroll SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE month = ? AND year = ? AND status = 'draft'"
  ).run(userId, month, year);
  return info.changes;
}

// Monthly payroll summary per department (for the payroll report).
async function departmentSummary(month, year) {
  return await db.prepare(
    `SELECT d.name AS department,
       COUNT(p.id) AS employees,
       ROUND(SUM(p.base_salary), 2) AS total_base,
       ROUND(SUM(p.deductions), 2) AS total_deductions,
       ROUND(SUM(p.overtime_pay), 2) AS total_overtime,
       ROUND(SUM(p.bonuses), 2) AS total_bonuses,
       ROUND(SUM(p.net_salary), 2) AS total_net,
       SUM(CASE WHEN p.status='approved' THEN 1 ELSE 0 END) AS approved_count
     FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE p.month = ? AND p.year = ?
     GROUP BY d.name ORDER BY d.name`
  ).all(month, year);
}

module.exports = { generateForMonth, getReport, countWorkingDays, approveRecord, approveMonth, departmentSummary };
