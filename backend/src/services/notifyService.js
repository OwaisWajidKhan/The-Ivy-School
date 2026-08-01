const nodemailer = require('nodemailer');
const { db, getSetting } = require('../db/schema');
const config = require('../config');

// Send an in-app notification (row in notifications table).
async function notifyInApp({ recipientType, recipientId = null, type, title, message }) {
  try {
    await db.prepare(
      'INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)'
    ).run(recipientType, recipientId || null, 'in_app', type, title, message);
  } catch (e) {
    // never let notification writing break the request
  }
}

// Send an email if SMTP is configured, always log to notifications as 'email' channel.
async function notifyEmail({ to, recipientType, recipientId = null, type, title, message }) {
  const school = await getSetting('school_name', 'School');
  const host = config.smtp.host;
  if (host && to) {
    try {
      const transport = nodemailer.createTransport({
        host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
      });
      transport.sendMail({
        from: `"${school}" <${config.smtp.user || 'noreply@school.local'}>`,
        to,
        subject: title,
        text: message
      }).catch(() => {});
    } catch (e) {
      // SMTP errors are non-fatal
    }
  }
  try {
    await db.prepare(
      'INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)'
    ).run(recipientType, recipientId || null, 'email', type, title, message);
  } catch (e) {
    // ignore
  }
}

// Convenience: lookup an employee/parent email and send in-app + email together.
async function notifyPerson({ personType, personId, type, title, message }) {
  await notifyInApp({ recipientType: personType === 'student' ? 'parent' : personType === 'employee' ? 'employee' : 'admin', recipientId: personId, type, title, message });

  if (personType === 'employee') {
    const emp = await db.prepare('SELECT e.full_name, u.email FROM employees e LEFT JOIN users u ON u.person_type=? AND u.person_id=e.id WHERE e.id=?')
      .get('employee', personId);
    if (emp && emp.email) await notifyEmail({ to: emp.email, recipientType: 'employee', recipientId: personId, type, title, message });
  } else if (personType === 'student') {
    const st = await db.prepare('SELECT s.full_name, s.parent_contact, u.email FROM students s LEFT JOIN users u ON u.person_type=? AND u.person_id=s.id WHERE s.id=?')
      .get('student', personId);
    if (st && st.email) await notifyEmail({ to: st.email, recipientType: 'parent', recipientId: personId, type, title, message });
  }
}

// Notify all active admins (school admin / super admin / hr).
async function notifyAdmins(type, title, message) {
  const admins = await db.prepare(
    `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status='active' AND r.name IN ('super_admin','school_admin','hr')`
  ).all();
  for (const a of admins) {
    await notifyInApp({ recipientType: 'admin', recipientId: a.id, type, title, message });
    if (a.email) await notifyEmail({ to: a.email, recipientType: 'admin', recipientId: a.id, type, title, message });
  }
}

module.exports = { notifyInApp, notifyEmail, notifyPerson, notifyAdmins };
