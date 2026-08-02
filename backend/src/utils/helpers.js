const { db } = require('../db/schema');
const timezone = require('./timezone');

function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, message = 'Something went wrong', status = 400, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

function todayStr() {
  return timezone.todayStr();
}

function nowStr() {
  return timezone.nowStr();
}

function parseDateTime(s) {
  // 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD HH:MM'
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}

function minutesBetween(a, b) {
  const ta = parseDateTime(a);
  const tb = parseDateTime(b);
  if (!ta || !tb) return 0;
  return Math.round((tb - ta) / 60000);
}

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

async function audit(user, action, entityType = null, entityId = null, details = null, ip = null) {
  try {
    await db.prepare(
      'INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)'
    ).run(
      user ? user.id : null,
      user ? user.username : 'anonymous',
      action,
      entityType,
      entityId,
      details ? JSON.stringify(details) : null,
      ip
    );
  } catch (e) {
    // audit must never crash the request
  }
}

function paginate(page = 1, limit = 25) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
  return { page: p, limit: l, offset: (p - 1) * l };
}

module.exports = {
  ok,
  fail,
  todayStr,
  nowStr,
  parseDateTime,
  minutesBetween,
  hhmmToMinutes,
  audit,
  paginate
};
