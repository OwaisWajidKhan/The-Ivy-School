const { db, getSetting } = require('../db/schema');
const { todayStr, nowStr, minutesBetween, hhmmToMinutes } = require('../utils/helpers');

async function getStartEnd(personType, personId) {
  // employees use their shift; students use school timings
  if (personType === 'employee') {
    const emp = await db.prepare(
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
    start: await getSetting('school_start_time', '08:00'),
    end: await getSetting('school_end_time', '15:00'),
    grace: parseInt(await getSetting('late_grace_minutes', '15'), 10),
    halfDayThreshold: parseFloat(await getSetting('half_day_threshold_hours', '4')),
    workingHours: 8
  };
}

// Load an active person by their database id (chip id stays numeric; scan uses
// the same row). Returns undefined when the person does not exist.
async function loadPerson(personType, personId) {
  if (personType === 'student') {
    return db.prepare(
      `SELECT id, full_name, status, class_id, section_id, photo, student_id
       FROM students WHERE id = ?`
    ).get(personId);
  }
  return db.prepare(
    `SELECT id, full_name, status, photo, employee_id FROM employees WHERE id = ?`
  ).get(personId);
}

// Resolve a UID straight from the person records (students/employees
// rfid_uid + rfid_uid_2). This is the source the card UI keeps in sync, so it
// catches valid cards whose rfid_cards mapping is missing or points at a ghost.
async function lookupByPersonRecord(uid) {
  const student = await db.prepare(
    `SELECT id, full_name, status, class_id, section_id, photo, student_id
     FROM students WHERE rfid_uid = ? OR rfid_uid_2 = ?`
  ).get(uid, uid);
  if (student) {
    return {
      found: student.status === 'active',
      personType: 'student',
      personId: student.id,
      name: student.full_name,
      code: student.student_id,
      photo: student.photo,
      person: student,
      inactive: student.status !== 'active'
    };
  }
  const emp = await db.prepare(
    `SELECT id, full_name, status, photo, employee_id
     FROM employees WHERE rfid_uid = ? OR rfid_uid_2 = ?`
  ).get(uid, uid);
  if (emp) {
    return {
      found: emp.status === 'active',
      personType: 'employee',
      personId: emp.id,
      name: emp.full_name,
      code: emp.employee_id,
      photo: emp.photo,
      person: emp,
      inactive: emp.status !== 'active'
    };
  }
  return null;
}

// Self-heal the rfid_cards mapping once we know the real owner, so future
// scans hit the card row directly. Creates the row when missing, repoints it
// when it pointed at a ghost person.
async function healCard(uid, personType, personId, existingCard) {
  try {
    if (existingCard) {
      await db.prepare(
        'UPDATE rfid_cards SET card_type = ?, person_id = ?, status = ? WHERE id = ?'
      ).run(personType, personId, existingCard.card_status === 'active' ? 'active' : existingCard.card_status, existingCard.id);
    } else {
      await db.prepare(
        "INSERT INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,datetime('now'),'active')"
      ).run(uid, personType, personId);
    }
  } catch (e) {
    // heal is best-effort; never fail a valid scan because of it
  }
}

async function lookupPerson(uid) {
  const card = await db.prepare(
    `SELECT c.id, c.uid, c.card_type, c.person_id, c.status AS card_status
     FROM rfid_cards c WHERE c.uid = ?`
  ).get(uid);

  // 1) Card row exists and the person it points at exists and is active.
  if (card) {
    if (card.card_status === 'active') {
      const person = await loadPerson(card.card_type, card.person_id);
      if (person && person.status === 'active') {
        return {
          found: true,
          personType: card.card_type,
          personId: person.id,
          name: person.full_name,
          code: card.card_type === 'student' ? person.student_id : person.employee_id,
          photo: person.photo,
          card,
          person
        };
      }
      if (person && person.status !== 'active') return { found: false, reason: 'PERSON_INACTIVE', card };
    } else {
      // Explicitly blocked/lost/revoked card: honor the block absolutely.
      // A re-issued card has a new UID (the assign flow updates the person
      // record), so an old UID never leaks back in through the fallback.
      return { found: false, reason: 'CARD_INACTIVE', card };
    }
  }

  // 2) Card row missing or points at a ghost person -> fall back to the
  //    person record, which the card UI keeps in sync, and re-pair the card.
  const byRecord = await lookupByPersonRecord(uid);
  if (byRecord && byRecord.found) {
    await healCard(uid, byRecord.personType, byRecord.personId, card);
    return { ...byRecord, card: card || null };
  }
  if (byRecord && byRecord.inactive) return { found: false, reason: 'PERSON_INACTIVE' };
  if (card) return { found: false, reason: 'PERSON_NOT_FOUND', card };
  return { found: false, reason: 'UNKNOWN_CARD' };
}

async function closeSummary(summary, outTime, timing) {
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

  await db.prepare(
    `UPDATE attendance_summary
     SET out_time = ?, status = ?, working_hours = ?, overtime_hours = ?, late_minutes = ?, early_exit_minutes = ?
     WHERE id = ?`
  ).run(outTime, status, Math.round(workingHours * 100) / 100, Math.round(overtimeHours * 100) / 100, lateMinutes, Math.max(0, earlyExit), summary.id);

  return { ...summary, out_time: outTime, status, working_hours: Math.round(workingHours * 100) / 100 };
}

/**
 * Core RFID processing. Returns the attendance action result.
 */
async function processScan({ uid, deviceId = null, deviceName = null, location = null, scanTime = nowStr() }) {
  if (deviceId) {
    const dev = await db.prepare('SELECT id FROM devices WHERE device_id = ?').get(deviceId);
    if (!dev) {
      const info = await db.prepare(
        'INSERT INTO devices (device_name, device_id, location, status, last_sync_time) VALUES (?,?,?,?,?)'
      ).run(deviceName || deviceId, deviceId, location, 'online', nowStr());
      deviceId = info.lastInsertRowid;
    } else {
      deviceId = dev.id;
    }
    await db.prepare("UPDATE devices SET last_sync_time = ?, status = 'online' WHERE id = ?").run(nowStr(), deviceId);
  }

  const person = await lookupPerson(uid);
  if (!person.found) {
    await db.prepare(
      'INSERT INTO attendance_logs (person_type, person_id, direction, scan_time, date, raw_uid, device_id, location) VALUES (?,?,?,?,?,?,?,?)'
    ).run('employee', 0, 'IN', scanTime, scanTime.slice(0, 10), uid, deviceId, location);
    return { ok: false, code: person.reason, message: `Card not recognized or not active (${person.reason})` };
  }

  const date = scanTime.slice(0, 10);
  let summary = await db.prepare(
    `SELECT * FROM attendance_summary WHERE person_type = ? AND person_id = ? AND date = ?`
  ).get(person.personType, person.personId, date);

  const timing = await getStartEnd(person.personType, person.personId);

  if (!summary) {
    const inTime = scanTime.slice(11, 16);
    const lateMinutes = Math.max(0, hhmmToMinutes(inTime) - (hhmmToMinutes(timing.start) + timing.grace));
    const status = lateMinutes > 0 ? 'late' : 'present';
    const info = await db.prepare(
      `INSERT INTO attendance_summary (person_type, person_id, date, in_time, status, late_minutes)
       VALUES (?,?,?,?,?,?)`
    ).run(person.personType, person.personId, date, inTime, status, lateMinutes);
    summary = await db.prepare('SELECT * FROM attendance_summary WHERE id = ?').get(info.lastInsertRowid);
    await db.prepare(
      'INSERT INTO attendance_logs (person_type, person_id, device_id, location, direction, scan_time, date, raw_uid) VALUES (?,?,?,?,?,?,?,?)'
    ).run(person.personType, person.personId, deviceId, location, 'IN', scanTime, date, uid);
    await notifyAttendance(person, 'IN', inTime);
    return { ok: true, direction: 'IN', summary, person: { name: person.name, type: person.personType, id: person.personId, code: person.code, photo: person.photo }, message: `IN recorded for ${person.name}` };
  }

  const outTime = scanTime.slice(11, 16);
  const updated = await closeSummary(summary, outTime, timing);
  await db.prepare(
    'INSERT INTO attendance_logs (person_type, person_id, device_id, location, direction, scan_time, date, raw_uid) VALUES (?,?,?,?,?,?,?,?)'
  ).run(person.personType, person.personId, deviceId, location, 'OUT', scanTime, date, uid);
  await notifyAttendance(person, 'OUT', outTime);
  return { ok: true, direction: 'OUT', summary: updated, person: { name: person.name, type: person.personType, id: person.personId, code: person.code, photo: person.photo }, message: `Checkout updated to ${outTime} for ${person.name}` };
}

async function notifyAttendance(person, direction, time) {
  const recipientType = person.personType === 'student' ? 'parent' : 'employee';
  const title = direction === 'IN' ? 'Attendance recorded' : 'Attendance exit recorded';
  const message = `${person.name} ${direction === 'IN' ? 'entered' : 'exited'} the school at ${time}.`;
  try {
    await db.prepare(
      'INSERT INTO notifications (recipient_type, recipient_id, channel, type, title, message) VALUES (?,?,?,?,?,?)'
    ).run(recipientType, person.personId, 'email', 'attendance', title, message);
  } catch (e) {
    // ignore notification failures
  }
}

module.exports = { processScan, lookupPerson, getStartEnd, closeSummary };
