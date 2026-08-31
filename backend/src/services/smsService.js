// Attendance SMS via Branded SMS Pakistan (app.brandedsmspakistan.com).
//
// Sends a plain-text SMS to the guardian (students) / employee (employees)
// after an RFID check-in or check-out scan, using the school's branding mask.
// The message follows the configured template:
//   <NAME>, <DD-MM-YYYY>
//   Check in: <HH:MM AM/PM>
//   Check out: <pending | HH:MM AM/PM>      (only when known)
//   <school_name>
//   <school_contact_phone>
//
// Safely non-blocking: any failure is logged and never breaks the scan.

const config = require('../config');
const { db, getSetting } = require('../db/schema');

// Normalize a stored phone number to international Pakistan mobile format
// "923XXXXXXXXX" (92 + 03xx…). Accepts "+92 ...", "0 ...", "92...", "0092...",
// bare "3XXXXXXXXX". Returns null when it isn't a valid Pakistani mobile.
function normalizePkPhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  digits = digits.replace(/^0092/, '92');
  let base;
  if (digits.startsWith('92')) {
    base = digits;
  } else if (digits.startsWith('0')) {
    base = '92' + digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    base = '92' + digits;
  } else {
    return null;
  }
  return /^923\d{9}$/.test(base) ? base : null;
}

// Convert "08:00" / "16:18" to "08:00 AM" / "04:18 PM".
function formatTime(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

// "2026-08-31" -> "31-08-2026"
function formatDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Find the SMS destination for a person. Students go to their guardian (parents
// table, then students.parent_contact); employees go to their own mobile.
async function lookupRecipientPhone(personType, personId) {
  if (personType === 'employee') {
    const emp = await db.prepare('SELECT mobile FROM employees WHERE id = ?').get(personId);
    return emp ? normalizePkPhone(emp.mobile) : null;
  }
  // student: prefer the enrolled guardian (parents table)
  const guardian = await db.prepare(
    "SELECT phone FROM parents WHERE student_id = ? AND phone IS NOT NULL AND phone != '' ORDER BY (relation = 'father') DESC, id LIMIT 1"
  ).get(personId);
  if (guardian && guardian.phone) return normalizePkPhone(guardian.phone);
  const student = await db.prepare(
    "SELECT parent_contact, phone FROM students WHERE id = ?"
  ).get(personId);
  const raw = (student && (student.parent_contact || student.phone)) || null;
  return raw ? normalizePkPhone(raw) : null;
}

// Build the outgoing SMS text.
async function buildMessage({ name, date, checkIn, checkOut }) {
  const schoolName = await getSetting('school_name', 'The Ivy School');
  const schoolPhone = await getSetting('school_contact_phone', '');
  const lines = [
    `${name}, ${formatDate(date)}`,
    `Check in: ${formatTime(checkIn) || '—'}`,
    `Check out: ${checkOut ? formatTime(checkOut) : 'Pending'}`
  ];
  if (schoolName) lines.push(schoolName);
  if (schoolPhone) lines.push(schoolPhone);
  return lines.join('\n');
}

// Send one attendance SMS. Resolves true when delivered, false/throws when not.
// Never throws to the caller's flow — callers should .catch() or wrap try/catch.
async function sendAttendanceSms({ personType, personId, name, date, checkIn, checkOut }) {
  const phone = await lookupRecipientPhone(personType, personId);
  if (!phone) return false;
  return sendSms({ phone, message: await buildMessage({ name, date, checkIn, checkOut }) });
}

// Core send: GET the provider URL with the message; returns true on code "000".
async function sendSms({ phone, message }) {
  const cfg = config.sms;
  if (!cfg.enabled || !cfg.key || !cfg.email) return false;
  const params = new URLSearchParams({
    email: cfg.email,
    key: cfg.key,
    mask: cfg.mask,
    to: phone,
    message
  });
  const url = `${cfg.url}?${params.toString()}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    let ok = false;
    try {
      const j = JSON.parse(text);
      ok = !!(j && j.sms && String(j.sms.code) === '000');
    } catch (e) {
      ok = /Success|000/.test(text);
    }
    if (!ok) console.error(`[sms] send to ${phone} not confirmed: ${text}`);
    return ok;
  } catch (e) {
    console.error(`[sms] send to ${phone} failed: ${e.message}`);
    return false;
  }
}

module.exports = { sendAttendanceSms, sendSms, buildMessage, lookupRecipientPhone, normalizePkPhone, formatTime, formatDate };
