const nodemailer = require('nodemailer');
const { db, getSetting } = require('../db/schema');
const config = require('../config');

// Send an in-app notification (row in notifications table).
function notifyInApp({ recipientType, recipientId = null, type, title, message }) {
  try {
    db.prepare(
      'INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)'
    ).run(recipientType, recipientId || null, 'in_app', type, title, message);
  } catch (e) {
    // never let notification writing break the request
  }
}

// Send an email if SMTP is configured, always log to notifications as 'email' channel.
function notifyEmail({ to, recipientType, recipientId = null, type, title, message }) {
  const school = getSetting('school_name', 'School');
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
    db.prepare(
      'INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)'
    ).run(recipientType, recipientId || null, 'email', type, title, message);
  } catch (e) {
    // ignore
  }
}

// Convenience: lookup an employee/parent email and send in-app + email together.
function notifyPerson({ personType, personId, type, title, message }) {
  notifyInApp({ recipientType: personType === 'student' ? 'parent' : personType === 'employee' ? 'employee' : 'admin', recipientId: personId, type, title, message });

  if (personType === 'employee') {
    const emp = db.prepare('SELECT e.full_name, u.email FROM employees e LEFT JOIN users u ON u.person_type=? AND u.person_id=e.id WHERE e.id=?')
      .get('employee', personId);
    if (emp && emp.email) notifyEmail({ to: emp.email, recipientType: 'employee', recipientId: personId, type, title, message });
  } else if (personType === 'student') {
    const st = db.prepare('SELECT s.full_name, s.parent_contact, u.email FROM students s LEFT JOIN users u ON u.person_type=? AND u.person_id=s.id WHERE s.id=?')
      .get('student', personId);
    if (st && st.email) notifyEmail({ to: st.email, recipientType: 'parent', recipientId: personId, type, title, message });
  }
}

// Notify all active admins (school admin / super admin / hr).
function notifyAdmins(type, title, message) {
  const admins = db.prepare(
    `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status='active' AND r.name IN ('super_admin','school_admin','hr')`
  ).all();
  for (const a of admins) {
    notifyInApp({ recipientType: 'admin', recipientId: a.id, type, title, message });
    if (a.email) notifyEmail({ to: a.email, recipientType: 'admin', recipientId: a.id, type, title, message });
  }
}

module.exports = { notifyInApp, notifyEmail, notifyPerson, notifyAdmins };
