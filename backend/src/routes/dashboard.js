const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { ok, fail, todayStr } = require('../utils/helpers');

router.use(requireAuth);

async function statusCounts(personType, date) {
  const rows = await db.prepare(
    'SELECT status, COUNT(*) AS c FROM attendance_summary WHERE person_type = ? AND date = ? GROUP BY status'
  ).all(personType, date);
  const map = { present: 0, late: 0, absent: 0, half_day: 0, early_exit: 0, overtime: 0 };
  for (const r of rows) if (map[r.status] !== undefined) map[r.status] = r.c;
  return map;
}

// Full dashboard
router.get('/', async (req, res) => {
  const date = todayStr();
  const totalStudents = (await db.prepare("SELECT COUNT(*) AS c FROM students WHERE status = 'active'").get()).c;
  const totalEmployees = (await db.prepare("SELECT COUNT(*) AS c FROM employees WHERE status = 'active'").get()).c;
  const scannedStudents = (await db.prepare("SELECT COUNT(*) AS c FROM attendance_summary WHERE person_type='student' AND date = ?").get(date)).c;
  const scannedEmployees = (await db.prepare("SELECT COUNT(*) AS c FROM attendance_summary WHERE person_type='employee' AND date = ?").get(date)).c;

  const studentStatus = await statusCounts('student', date);
  const employeeStatus = await statusCounts('employee', date);

  const recentScans = await db.prepare(
    `SELECT l.*, CASE WHEN l.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name
     FROM attendance_logs l
     LEFT JOIN students st ON st.id = l.person_id AND l.person_type='student'
     LEFT JOIN employees em ON em.id = l.person_id AND l.person_type='employee'
     WHERE l.date = ? ORDER BY l.id DESC LIMIT 15`
  ).all(date);

  const unreadNotifications = (await db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE read = 0").get()).c;

  const timeline = await db.prepare(
    `SELECT a.*, CASE WHEN a.person_type='student' THEN st.full_name ELSE em.full_name END AS full_name
     FROM attendance_summary a
     LEFT JOIN students st ON st.id = a.person_id AND a.person_type='student'
     LEFT JOIN employees em ON em.id = a.person_id AND a.person_type='employee'
     WHERE a.date = ? AND a.in_time IS NOT NULL ORDER BY a.in_time LIMIT 20`
  ).all(date);

  // Notification feed for the current user
  const { role_name, person_type, person_id } = req.user;
  const notifWhere = ['n.recipient_type IN (?)'];
  const notifParams = [role_name === 'parent' ? 'parent' : role_name === 'teacher' || role_name === 'employee' ? 'employee' : 'admin'];
  if ((role_name === 'teacher' || role_name === 'employee' || role_name === 'parent') && person_id) {
    notifWhere.push('(n.recipient_id = ? OR n.recipient_id IS NULL)');
    notifParams.push(person_id);
  }
  const notificationFeed = await db.prepare(
    `SELECT * FROM notifications n WHERE ${notifWhere.join(' AND ')} ORDER BY n.id DESC LIMIT 10`
  ).all(...notifParams);

  // Weekly trend (last 7 days)
  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const s = await statusCounts('student', ds);
    const e = await statusCounts('employee', ds);
    const present = s.present + s.late + s.half_day + e.present + e.late + e.half_day + e.overtime + e.early_exit;
    weekly.push({
      date: ds,
      present,
      studentsPresent: s.present + s.late + s.half_day,
      employeesPresent: e.present + e.late + e.half_day + e.overtime + e.early_exit
    });
  }

  ok(res, {
    date,
    students: { total: totalStudents, presentToday: scannedStudents, ...studentStatus },
    employees: { total: totalEmployees, presentToday: scannedEmployees, ...employeeStatus },
    system: { recentScans, unreadNotifications },
    timeline,
    weekly,
    notificationFeed
  });
});

module.exports = router;
