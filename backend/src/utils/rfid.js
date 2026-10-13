const { db } = require('../db/schema');

// Resolve which person currently owns an RFID UID. The management records
// (students/employees rfid_uid + rfid_uid_2) are checked first because that is
// what the UI edits; the rfid_cards index is checked last so already-issued
// cards are still protected from being claimed by someone else.
//
// Pass `except = { type, id }` to ignore the person currently being edited
// (their own UID should never count as a conflict).
//
// Returns { type: 'student'|'employee', id, name, code } or null when free.
async function findRfidOwner(uid, except = {}) {
  if (!uid) return null;
  uid = String(uid);
  const skip = (type, id) => except && except.type === type && Number(except.id) === Number(id);

  const student = await db.prepare(
    'SELECT id, full_name, student_id AS code FROM students WHERE rfid_uid = ? OR rfid_uid_2 = ?'
  ).get(uid, uid);
  if (student && !skip('student', student.id)) {
    return { type: 'student', id: student.id, name: student.full_name, code: student.code };
  }

  const employee = await db.prepare(
    'SELECT id, full_name, employee_id AS code FROM employees WHERE rfid_uid = ? OR rfid_uid_2 = ?'
  ).get(uid, uid);
  if (employee && !skip('employee', employee.id)) {
    return { type: 'employee', id: employee.id, name: employee.full_name, code: employee.code };
  }

  const card = await db.prepare('SELECT card_type, person_id FROM rfid_cards WHERE uid = ?').get(uid);
  if (card && !skip(card.card_type, card.person_id)) {
    const person = await db.prepare(
      card.card_type === 'student'
        ? 'SELECT full_name, student_id AS code FROM students WHERE id = ?'
        : 'SELECT full_name, employee_id AS code FROM employees WHERE id = ?'
    ).get(card.person_id);
    return {
      type: card.card_type,
      id: card.person_id,
      name: person ? person.full_name : null,
      code: person ? person.code : null
    };
  }

  return null;
}

// Human-readable owner, for error messages.
function ownerLabel(owner) {
  if (!owner) return '';
  const kind = owner.type === 'student' ? 'student' : 'employee';
  if (owner.name) return `${kind} ${owner.name}${owner.code ? ` (${owner.code})` : ''}`;
  return `${kind} #${owner.id}`;
}

// Ensure the rfid_cards index has a row for `uid` pointing at this person.
// Repoints a stale/mis-assigned row; inserts when missing. A row that already
// belongs to this person is left untouched (its blocked/lost status is kept).
async function syncCardForPerson(uid, type, personId) {
  if (!uid) return;
  uid = String(uid);
  const existing = await db.prepare('SELECT id, card_type, person_id FROM rfid_cards WHERE uid = ?').get(uid);
  if (existing) {
    if (existing.card_type !== type || Number(existing.person_id) !== Number(personId)) {
      await db.prepare('UPDATE rfid_cards SET card_type = ?, person_id = ? WHERE id = ?').run(type, personId, existing.id);
    }
    return;
  }
  await db.prepare(
    "INSERT INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?, 'active')"
  ).run(uid, type, personId, new Date().toISOString());
}

module.exports = { findRfidOwner, ownerLabel, syncCardForPerson };
