const { db, getSetting } = require('../db/schema');
const { todayStr, nowStr, parseDateTime, minutesBetween, hhmmToMinutes } = require('../utils/helpers');

function getStartEnd(personType, personId) {
  // employees use their shift; students use school timings
  if (personType === 'employee') {
    const emp = db.prepare(
      `SELECT e.*, s.start_time, s.end_time, s.grace_minutes, s.half_day_threshold_hours
       FROM employees e LEFT JOIN shifts s ON s.id = e.shift_id WHERE e.id = ?`
    ).get(personId);
    if (emp && emp.start_time) {
      return {
        start: emp.start_time,
        end: emp.end_time,
        grace: emp.grace_minutes || 0,
        halfDayThreshold: emp.half_day_threshold_hours || 4,
        workingHours: emp.working_hours || 8
      };
    }
  }
  return {
    start: getSetting('school_start_time', '08:00'),
    end: getSetting('school_end_time', '15:00'),
    grace: parseInt(getSetting('late_grace_minutes', '15'), 10),
    halfDayThreshold: parseFloat(getSetting('half_day_threshold_hours', '4')),
    workingHours: 8
  };
}

function lookupPerson(uid) {
  const card = db.prepare(
    `SELECT c.uid, c.card_type, c.person_id, c.status AS card_status
     FROM rfid_cards c WHERE c.uid = ?`
  ).get(uid);
  if (!card) return { found: false, reason: 'UNKNOWN_CARD' };
  if (card.card_status !== 'active') return { found: false, reason: 'CARD_INACTIVE', card };

  if (card.card_type === 'student') {
    const student = db.prepare(
      `SELECT s.id, s.full_name, s.status, s.class_id, s.section_id
       FROM students s WHERE s.id = ?`
    ).get(card.person_id);
    if (!student) return { found: false, reason: 'PERSON_NOT_FOUND' };
    if (student.status !== 'active') return { found: false, reason: 'PERSON_INACTIVE' };
    return {
      found: true,
      personType: 'student',
      personId: student.id,
      name: student.full_name,
      card: card,
      person: student
    };
  }

  const emp = db.prepare(
    `SELECT e.id, e.full_name, e.status FROM employees e WHERE e.id = ?`
  ).get(card.person_id);
  if (!emp) return { found: false, reason: 'PERSON_NOT_FOUND' };
  if (emp.status !== 'active') return { found: false, reason: 'PERSON_INACTIVE' };
  return {
    found: true,
    personType: 'employee',
    personId: emp.id,
    name: emp.full_name,
    card: card,
    person: emp
  };
}

function isDuplicate(personType, personId, scanTime) {
  const windowSec = parseInt(getSetting('duplicate_scan_window_sec', '30'), 10);
  const row = db.prepare(
    `SELECT scan_time FROM attendance_logs
     WHERE person_type = ? AND person_id = ?
     ORDER BY id DESC LIMIT 1`
  ).get(personType, personId);
  if (!row) return false;
  const last = parseDateTime(row.scan_time);
  const current = parseDateTime(scanTime);
  if (!last || !current) return false;
  return (current - last) / 1000 < windowSec;
}

function closeSummary(summary, outTime, timing) {
  const inMinutes = hhmmToMinutes(summary.in_time);
  const outMinutes = hhmmToMinutes(outTime);
  let workingHours = (outMinutes - inMinutes) / 60;
  if (workingHours < 0) workingHours += 24;

  const startMin = hhmmToMinutes(timing.start);
  const endMin = hhmmToMinutes(timing.end);
  const lateMinutes = Math.max(0, inMinutes - (startMin + timing.grace));
  const earlyExit = endMin - outMinutes;

  let status = 'present';
  if (workingHours < timing.halfDayThreshold) {
    status = 'half_day';
  } else if (summary.person_type === 'employee' && workingHours > timing.workingHours) {
    status = 'overtime';
  } else if (lateMinutes > 0) {
    status = 'late';
  } else if (summary.person_type === 'employee' && earlyExit > timing.grace) {
    status = 'early_exit';
  }

  const overtimeHours = summary.person_type === 'employee'
    ? Math.max(0, workingHours - timing.workingHours)
    : 0;

  db.prepare(
    `UPDATE attendance_summary
     SET out_time = ?, status = ?, working_hours = ?, overtime_hours = ?, late_minutes = ?, early_exit_minutes = ?
     WHERE id = ?`
  ).run(outTime, status, Math.round(workingHours * 100) / 100, Math.round(overtimeHours * 100) / 100, lateMinutes, Math.max(0, earlyExit), summary.id);

  return { ...summary, out_time: outTime, status, working_hours: Math.round(workingHours * 100) / 100 };
}

/**
 * Core RFID processing. Returns the attendance action result.
 */
function processScan({ uid, deviceId = null, deviceName = null, location = null, scanTime = nowStr() }) {
  const person = lookupPerson(uid);
  if (!person.found) {
    db.prepare(
      'INSERT INTO attendance_logs (person_type, person_id, direction, scan_time, date, raw_uid, device_id, location) VALUES (?,?,?,?,?,?,?,?)'
    ).run('employee', 0, 'IN', scanTime, scanTime.slice(0, 10), uid, deviceId, location);
    return { ok: false, code: person.reason, message: `Card not recognized or not active (${person.reason})` };
  }

  const date = scanTime.slice(0, 10);
  if (isDuplicate(person.personType, person.personId, scanTime)) {
    return { ok: false, code: 'DUPLICATE', message: 'Duplicate scan ignored', person: { name: person.name, type: person.personType } };
  }

  // Ensure device exists (create on the fly if deviceId provided)
  if (deviceId) {
    const dev = db.prepare('SELECT id FROM devices WHERE device_id = ?').get(deviceId);
    if (!dev) {
      const info = db.prepare(
        'INSERT INTO devices (device_name, device_id, location, status, last_sync_time) VALUES (?,?,?,?,?)'
      ).run(deviceName || deviceId, deviceId, location, 'online', nowStr());
      deviceId = info.lastInsertRowid;
    } else {
      deviceId = dev.id;
    }
    db.prepare("UPDATE devices SET last_sync_time = ?, status = 'online' WHERE id = ?").run(nowStr(), deviceId);
  }

  let summary = db.prepare(
    `SELECT * FROM attendance_summary WHERE person_type = ? AND person_id = ? AND date = ?`
  ).get(person.personType, person.personId, date);

  const timing = getStartEnd(person.personType, person.personId);
  const direction = summary && summary.out_time ? 'IN' : summary ? 'OUT' : 'IN';

  db.prepare(
    'INSERT INTO attendance_logs (person_type, person_id, device_id, location, direction, scan_time, date, raw_uid) VALUES (?,?,?,?,?,?,?,?)'
  ).run(person.personType, person.personId, deviceId, location, direction, scanTime, date, uid);

  if (!summary) {
    const inTime = scanTime.slice(11, 16);
    const lateMinutes = Math.max(0, hhmmToMinutes(inTime) - (hhmmToMinutes(timing.start) + timing.grace));
    const status = lateMinutes > 0 ? 'late' : 'present';
    const info = db.prepare(
      `INSERT INTO attendance_summary (person_type, person_id, date, in_time, status, late_minutes)
       VALUES (?,?,?,?,?,?)`
    ).run(person.personType, person.personId, date, inTime, status, lateMinutes);
    summary = db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(info.lastInsertRowid);
    notifyAttendance(person, 'IN', inTime);
    return { ok: true, direction: 'IN', summary, person: { name: person.name, type: person.personType, id: person.personId }, message: `IN recorded for ${person.name}` };
  }

  if (summary.out_time) {
    // Already checked out - this is a new entry (person re-entered)
    const inTime = scanTime.slice(11, 16);
    const lateMinutes = Math.max(0, hhmmToMinutes(inTime) - (hhmmToMinutes(timing.start) + timing.grace));
    const status = lateMinutes > 0 ? 'late' : 'present';
    const info = db.prepare(
      `INSERT INTO attendance_summary (person_type, person_id, date, in_time, status, late_minutes)
       VALUES (?,?,?,?,?,?)`
    ).run(person.personType, person.personId, date, inTime, status, lateMinutes);
    const newSummary = db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(info.lastInsertRowid);
    notifyAttendance(person, 'IN', inTime);
    return { ok: true, direction: 'IN', summary: newSummary, person: { name: person.name, type: person.personType, id: person.personId }, message: `IN recorded for ${person.name}` };
  }

  const outTime = scanTime.slice(11, 16);
  const updated = closeSummary(summary, outTime, timing);
  notifyAttendance(person, 'OUT', outTime);
  const gatePass = autoCompleteGatePass(person, date);
  return { ok: true, direction: 'OUT', summary: updated, person: { name: person.name, type: person.personType, id: person.personId }, gatePass: gatePass ? { passNo: gatePass.pass_no, status: 'used' } : null, message: `OUT recorded for ${person.name}` };
}

// If a student has an approved gate pass today and is scanning OUT, auto-mark it used.
function autoCompleteGatePass(person, date) {
  if (person.personType !== 'student') return null;
  try {
    const pass = db.prepare(
      `SELECT * FROM gate_passes WHERE student_id = ? AND status = 'approved' AND exit_date = ? ORDER BY id DESC LIMIT 1`
    ).get(person.personId, date);
    if (pass) {
      db.prepare("UPDATE gate_passes SET status='used', used_at = datetime('now') WHERE id = ?").run(pass.id);
      const lastLog = db.prepare(
        'SELECT id FROM attendance_logs WHERE person_type=? AND person_id=? AND date=? ORDER BY id DESC LIMIT 1'
      ).get('student', person.personId, date);
      if (lastLog) {
        db.prepare('UPDATE attendance_logs SET gate_pass_id = ? WHERE id = ?').run(pass.id, lastLog.id);
      }
      return pass;
    }
  } catch (e) {
    // table may not exist on very old DBs
  }
  return null;
}

function notifyAttendance(person, direction, time) {
  const recipientType = person.personType === 'student' ? 'parent' : 'employee';
  const title = direction === 'IN' ? 'Attendance recorded' : 'Attendance exit recorded';
  const message = `${person.name} ${direction === 'IN' ? 'entered' : 'exited'} the school at ${time}.`;
  try {
    db.prepare(
      'INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)'
    ).run(recipientType, person.personId, 'email', 'attendance', title, message);
  } catch (e) {
    // ignore notification failures
  }
}

module.exports = { processScan, lookupPerson, getStartEnd, closeSummary };
