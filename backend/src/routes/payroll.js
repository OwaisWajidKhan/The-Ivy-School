const express = require('express');
const router = express.Router();
const { db } = require('../db/schema');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { ok, fail, audit } = require('../utils/helpers');
const { generateForMonth, getReport, countWorkingDays, approveRecord, approveMonth, departmentSummary } = require('../services/payrollService');
const { notifyInApp, notifyEmail } = require('../services/notifyService');

router.use(requireAuth);

// List payroll records
router.get('/', requirePermission('manage_payroll'), async (req, res) => {
  const { month, year } = req.query;
  const rows = await getReport(parseInt(month) || new Date().getMonth() + 1, parseInt(year) || new Date().getFullYear());
  ok(res, rows);
});

// Generate payroll for a month (creates DRAFT records)
router.post('/generate', requirePermission('generate_payroll'), async (req, res) => {
  const { month, year } = req.body;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const workingDays = await countWorkingDays(m, y);
  const results = await generateForMonth(m, y);
  audit(req.user, 'generate_payroll', 'payroll', null, { month: m, year: y, employees: results.length }, req.ip);
  ok(res, { month: m, year: y, workingDays, generated: results.length, results });
});

// Approve a single payroll record (HR review step)
router.put('/:id/approve', requirePermission('manage_payroll'), async (req, res) => {
  const result = await approveRecord(req.params.id, req.user.id);
  if (!result.ok) return fail(res, result.message, 404);
  const row = result.row;
  const emp = await db.prepare('SELECT e.*, u.email FROM employees e LEFT JOIN users u ON u.person_type=? AND u.person_id=e.id WHERE e.id=?')
    .get('employee', row.employee_id);
  if (emp) {
    const title = 'Payroll approved';
    const message = `Your salary for ${row.month}/${row.year} has been approved (${row.net_salary}).`;
    await notifyInApp({ recipientType: 'employee', recipientId: row.employee_id, type: 'payroll', title, message });
    if (emp.email) await notifyEmail({ to: emp.email, recipientType: 'employee', recipientId: row.employee_id, type: 'payroll', title, message });
  }
  audit(req.user, 'approve_payroll', 'payroll', row.id, { month: row.month, year: row.year, net: row.net_salary }, req.ip);
  ok(res, row);
});

// Approve all draft records for a month
router.post('/approve-month', requirePermission('manage_payroll'), async (req, res) => {
  const { month, year } = req.body;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  const changes = await approveMonth(m, y, req.user.id);
  audit(req.user, 'approve_payroll_month', 'payroll', null, { month: m, year: y, changes }, req.ip);
  ok(res, { approved: changes });
});

// Payroll report: department summary for a month
router.get('/report', requirePermission('view_reports'), async (req, res) => {
  const { month, year } = req.query;
  const m = parseInt(month) || new Date().getMonth() + 1;
  const y = parseInt(year) || new Date().getFullYear();
  ok(res, {
    month: m,
    year: y,
    departments: await departmentSummary(m, y),
    records: await getReport(m, y)
  });
});

// Employee payroll (for employee self-service)
router.get('/me', async (req, res) => {
  const { person_id: personId, person_type: personType } = req.user;
  if (!personId || personType !== 'employee') return fail(res, 'No payroll access for this account');
  const rows = await db.prepare(
    'SELECT * FROM payroll WHERE employee_id = ? ORDER BY year DESC, month DESC LIMIT 12'
  ).all(personId);
  ok(res, rows);
});

module.exports = router;
