const path = require('path');
const bcrypt = require('bcryptjs');
const { db, setSetting } = require('./schema');
const { ensureSchema } = require('./client');
const config = require('../config');

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function iso(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

// Idempotent Phase 2 reference data (designations, subjects, teacher assignments,
// branding settings). Safe to run on every startup so existing DBs get upgraded too.
async function ensurePhase2ReferenceData() {
  const deptIds = {};
  for (const d of await db.prepare('SELECT * FROM departments').all()) deptIds[d.name] = d.id;

  const branding = {
    school_logo: '', school_address: '', school_contact_email: '',
    school_contact_phone: '', school_footer_text: '© The Ivy School', school_timezone: require('../utils/timezone').effectiveTz()
  };
  for (const [k, v] of Object.entries(branding)) {
    if (!await db.prepare('SELECT key FROM settings WHERE key = ?').get(k)) await setSetting(k, v);
  }

  const insertDesignation = await db.prepare('INSERT OR IGNORE INTO designations (name, department_id, description) VALUES (?,?,?)');
  const teachDept = deptIds['Teaching Staff'];
  await insertDesignation.run('Senior Teacher', teachDept, 'Lead teacher');
  await insertDesignation.run('Teacher', teachDept, 'Class teacher');
  await insertDesignation.run('Subject Specialist', teachDept, 'Subject expert');
  await insertDesignation.run('Office Manager', deptIds['Administration'], 'Office administration');
  await insertDesignation.run('Security Guard', deptIds['Security Staff'], 'Security staff');
  await insertDesignation.run('Housekeeper', deptIds['Domestic Staff'], 'Domestic staff');
  await insertDesignation.run('Bus Driver', deptIds['Transport'], 'Transport staff');
  const designations = {};
  for (const d of await db.prepare('SELECT * FROM designations').all()) designations[d.name] = d.id;

  const insertSubject = await db.prepare('INSERT OR IGNORE INTO subjects (name, code, description) VALUES (?,?,?)');
  const subjectsList = [['English', 'ENG', 'English language and literature'], ['Mathematics', 'MATH', 'Mathematics'], ['Science', 'SCI', 'General science'], ['Urdu', 'URD', 'Urdu'], ['Islamic Studies', 'ISL', 'Islamic studies'], ['Computer Science', 'CS', 'Computer science']];
  for (const s of subjectsList) await insertSubject.run(s[0], s[1], s[2]);
  const subjectIds = {};
  for (const s of await db.prepare('SELECT * FROM subjects').all()) subjectIds[s.name] = s.id;

  const assignInsert = await db.prepare('INSERT OR IGNORE INTO teacher_assignments (teacher_id, subject_id, class_id, section_id) VALUES (?,?,?,?)');
  const teachRows = await db.prepare("SELECT * FROM employees WHERE designation LIKE '%Teacher%'").all();
  const allClasses = await db.prepare('SELECT * FROM classes ORDER BY id LIMIT 6').all();
  const allSections = await db.prepare('SELECT * FROM sections').all();
  for (let ti = 0; ti < teachRows.length; ti++) {
    const t = teachRows[ti];
    const subjectName = subjectsList[ti % subjectsList.length][0];
    const cls = allClasses[ti % allClasses.length];
    const sec = allSections.find(s => s.class_id === cls.id) || allSections[0];
    await assignInsert.run(t.id, subjectIds[subjectName], cls.id, sec ? sec.id : null);
  }

  for (const t of teachRows) {
    const ds = designations[t.designation === 'Senior Teacher' ? 'Senior Teacher' : 'Teacher'];
    if (ds) await db.prepare('UPDATE employees SET designation_id = ? WHERE id = ?').run(ds, t.id);
  }
}

const perm = {
  super_admin: [
    'manage_schools', 'create_admins', 'manage_licenses', 'view_all_reports',
    'manage_students', 'manage_employees', 'manage_attendance', 'view_attendance',
    'manage_leave', 'manage_payroll', 'generate_payroll', 'manage_devices',
    'manage_settings', 'manage_holidays', 'approve_leave', 'export_reports',
    'view_reports', 'view_audit_logs'
  ],
  school_admin: [
    'manage_students', 'manage_employees', 'manage_attendance', 'view_attendance',
    'manage_leave', 'approve_leave', 'manage_payroll', 'generate_payroll',
    'manage_devices', 'manage_settings', 'manage_holidays', 'view_reports', 'export_reports'
  ],
  hr: [
    'view_attendance', 'manage_leave', 'manage_payroll', 'view_reports',
    'generate_payroll', 'approve_leave', 'manage_shifts', 'export_reports'
  ],
  teacher: ['view_own_attendance', 'view_assigned_students', 'request_leave'],
  employee: ['view_own_attendance', 'view_working_hours', 'request_leave'],
  parent: ['view_student_attendance']
};

async function seed() {
  console.log('Seeding database...');

  // Ensure the schema exists BEFORE opening the transaction: on Postgres the
  // schema DDL must not run inside a transaction that may later roll back (and
  // an error there would abort the whole tx). Idempotent + memoized.
  await ensureSchema();

  await db.exec('BEGIN');

  const insertRole = await db.prepare('INSERT OR IGNORE INTO roles (name, description, permissions) VALUES (?, ?, ?)');
  for (const [name, perms] of Object.entries(perm)) {
    await insertRole.run(name, `${name} role`, JSON.stringify(perms));
  }
  const roles = {};
  for (const r of await db.prepare('SELECT * FROM roles').all()) roles[r.name] = r.id;

  // Departments
  const insertDept = await db.prepare('INSERT OR IGNORE INTO departments (name, description) VALUES (?, ?)');
  const depts = [
    ['Teaching Staff', 'Teachers and academic staff'],
    ['Administration', 'School administration and management'],
    ['Domestic Staff', 'Housekeeping and kitchen staff'],
    ['Security Staff', 'Security guards'],
    ['Transport', 'Drivers and transport staff']
  ];
  for (const d of depts) await insertDept.run(d[0], d[1]);
  const deptIds = {};
  for (const d of await db.prepare('SELECT * FROM departments').all()) deptIds[d.name] = d.id;

  // Classes & sections
  const insertClass = await db.prepare('INSERT OR IGNORE INTO classes (name, description) VALUES (?, ?)');
  for (let c = 1; c <= 10; c++) await insertClass.run(`Class ${c}`, `Grade ${c}`);
  const classes = {};
  for (const c of await db.prepare('SELECT * FROM classes').all()) classes[c.name] = c.id;

  const insertSection = await db.prepare('INSERT OR IGNORE INTO sections (class_id, name) VALUES (?, ?)');
  for (const c of Object.values(classes)) {
    await insertSection.run(c, 'A');
    await insertSection.run(c, 'B');
  }

  // Shifts
  await db.prepare('INSERT OR IGNORE INTO shifts (name, start_time, end_time, grace_minutes, half_day_threshold_hours) VALUES (?,?,?,?,?)')
    .run('Morning', '08:00', '15:00', 15, 4);
  await db.prepare('INSERT OR IGNORE INTO shifts (name, start_time, end_time, grace_minutes, half_day_threshold_hours) VALUES (?,?,?,?,?)')
    .run('Evening', '14:00', '22:00', 15, 4);
  const shifts = {};
  for (const s of await db.prepare('SELECT * FROM shifts').all()) shifts[s.name] = s.id;

  // Devices
  const insertDevice = await db.prepare('INSERT OR IGNORE INTO devices (device_name, device_id, location, status, last_sync_time) VALUES (?,?,?,?,?)');
  await insertDevice.run('Main Gate Reader', 'DEV-MAIN-01', 'Main Entrance', 'online', iso(new Date()));
  await insertDevice.run('Staff Gate Reader', 'DEV-STAFF-01', 'Staff Entrance', 'online', iso(new Date()));
  await insertDevice.run('Transport Depot', 'DEV-BUS-01', 'Bus Stand', 'offline', iso(new Date(Date.now() - 86400000)));
  const mainDevId = (await db.prepare("SELECT id FROM devices WHERE device_id = 'DEV-MAIN-01'").get()).id;
  const staffDevId = (await db.prepare("SELECT id FROM devices WHERE device_id = 'DEV-STAFF-01'").get()).id;

  // Users (create admins first)
  const insertUser = await db.prepare('INSERT INTO users (username, email, password_hash, role_id, person_type, person_id) VALUES (?,?,?,?,?,?)');
  const adminPw = hashPassword('Admin@123');
  const superAdminId = (await insertUser.run('superadmin', 'superadmin@school.com', adminPw, roles.super_admin, 'admin', null)).lastInsertRowid;
  const schoolAdminId = (await insertUser.run('admin', 'admin@school.com', adminPw, roles.school_admin, 'admin', null)).lastInsertRowid;
  const hrUserId = (await insertUser.run('hr', 'hr@school.com', adminPw, roles.hr, 'admin', null)).lastInsertRowid;

  // Students
  const insertStudent = await db.prepare(`
    INSERT INTO students (student_id, admission_number, rfid_uid, full_name, father_name, class_id, section_id, roll_number, dob, gender, phone, parent_contact, address, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const firstNames = ['Ayesha', 'Bilal', 'Fatima', 'Hamza', 'Zainab', 'Ali', 'Hina', 'Usman', 'Mariam', 'Omar', 'Sara', 'Imran', 'Nadia', 'Kashif', 'Rabia', 'Tariq', 'Sana', 'Faisal', 'Hafsa', 'Danish'];
  const lastNames = ['Khan', 'Ahmed', 'Malik', 'Sheikh', 'Raza', 'Qureshi', 'Butt', 'Chaudhry', 'Baig', 'Farooq'];
  const studentCount = 40;
  const studentIds = [];
  let sId = 1;
  for (let i = 0; i < studentCount; i++) {
    const cls = `Class ${(i % 10) + 1}`;
    const section = i % 2 === 0 ? 'A' : 'B';
    const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    const gender = i % 2 === 0 ? 'Female' : 'Male';
    const uid = `STU${String(sId).padStart(6, '0')}`;
    const info = await insertStudent.run(
      `S-${String(sId).padStart(4, '0')}`,
      `ADM-${String(sId).padStart(5, '0')}`,
      uid,
      name,
      `${lastNames[i % lastNames.length]} ${firstNames[(i + 3) % firstNames.length]}`,
      classes[cls],
      null,
      (i % 30) + 1,
      `2008-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      gender,
      `03${String(0).padStart(1, '0')}${String(10000000 + i * 731)}`,
      `03${String(10000000 + i * 457)}`,
      'Street 12, Model Town',
      'active'
    );
    // fix section properly
    const sec = await db.prepare('SELECT id FROM sections WHERE class_id = ? AND name = ?').get(classes[cls], section);
    await db.prepare('UPDATE students SET section_id = ? WHERE id = ?').run(sec.id, info.lastInsertRowid);
    await db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
      .run(uid, 'student', info.lastInsertRowid, iso(new Date()), 'active');
    studentIds.push(info.lastInsertRowid);
    sId++;
  }

  // Employees
  const insertEmployee = await db.prepare(`
    INSERT INTO employees (employee_id, rfid_uid, full_name, cnic, mobile, department_id, designation, joining_date, salary, shift_id, working_hours, overtime_rate, leave_balance, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const empDefs = [
    ['T-001', 'EMP000001', 'Dr. Naveed Iqbal', '35201-1234567-1', '03001234561', 'Teaching Staff', 'Senior Teacher', 85000, 'Morning', 8, 1.5, 12],
    ['T-002', 'EMP000002', 'Ms. Saira Tariq', '35202-2345678-2', '03001234562', 'Teaching Staff', 'Teacher', 65000, 'Morning', 8, 1.5, 10],
    ['T-003', 'EMP000003', 'Mr. Fahad Jamil', '35203-3456789-3', '03001234563', 'Teaching Staff', 'Teacher', 60000, 'Morning', 8, 1.5, 8],
    ['ADM-001', 'EMP000004', 'Mrs. Shazia Raza', '35204-4567890-4', '03001234564', 'Administration', 'Office Manager', 70000, 'Morning', 8, 1.5, 14],
    ['SEC-001', 'EMP000005', 'Mr. Imran Yousaf', '35205-5678901-5', '03001234565', 'Security Staff', 'Security Guard', 35000, 'Evening', 8, 1.25, 6],
    ['SEC-002', 'EMP000006', 'Mr. Akram Pervaiz', '35206-6789012-6', '03001234566', 'Security Staff', 'Security Guard', 32000, 'Evening', 8, 1.25, 4],
    ['DOM-001', 'EMP000007', 'Mrs. Rukhsana Bibi', '35207-7890123-7', '03001234567', 'Domestic Staff', 'Housekeeper', 28000, 'Morning', 8, 1.25, 5],
    ['DRV-001', 'EMP000008', 'Mr. Javed Akhtar', '35208-8901234-8', '03001234568', 'Transport', 'Bus Driver', 40000, 'Morning', 8, 1.5, 9],
    ['T-004', 'EMP000009', 'Ms. Areeba Shahid', '35209-9012345-9', '03001234569', 'Teaching Staff', 'Teacher', 55000, 'Morning', 8, 1.5, 7]
  ];
  const employeeIds = [];
  for (const e of empDefs) {
    const deptId = deptIds[e[5]];
    const shiftId = shifts[e[8]];
    const info = await insertEmployee.run(e[0], e[1], e[2], e[3], e[4], deptId, e[6], '2019-01-15', e[7], shiftId, e[9], e[10], e[11], 'active');
    await db.prepare('INSERT OR IGNORE INTO rfid_cards (uid, card_type, person_id, assigned_at, status) VALUES (?,?,?,?,?)')
      .run(e[1], 'employee', info.lastInsertRowid, iso(new Date()), 'active');
    employeeIds.push(info.lastInsertRowid);
  }

  // Teacher users with linked person
  const teachers = await db.prepare('SELECT * FROM employees WHERE designation LIKE ?').all('%Teacher%');
  for (const t of teachers.slice(0, 3)) {
    const uname = `teacher_${t.id}`;
    if (!await db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
      await insertUser.run(uname, `${uname}@school.com`, hashPassword('Teacher@123'), roles.teacher, 'employee', t.id);
    }
  }
  // One generic employee user
  const someEmp = await db.prepare('SELECT * FROM employees WHERE designation = ?').get('Security Guard');
  await insertUser.run('emp1', 'emp1@school.com', hashPassword('Emp@123'), roles.employee, 'employee', someEmp.id);
  // Parent user
  const someStudent = await db.prepare('SELECT * FROM students ORDER BY id LIMIT 1').get();
  await insertUser.run('parent1', 'parent1@school.com', hashPassword('Parent@123'), roles.parent, 'student', someStudent.id);

  // Holidays for this & next month
  const insertHoliday = await db.prepare('INSERT OR IGNORE INTO holidays (name, date, type, description) VALUES (?,?,?,?)');
  const now = new Date();
  await insertHoliday.run('Independence Day', dateStr(new Date(now.getFullYear(), 7, 14)), 'Public', 'National holiday');
  await insertHoliday.run('Labour Day', dateStr(new Date(now.getFullYear(), 4, 1)), 'Public', 'International workers day');

  // Settings
  await setSetting('school_name', 'The Ivy School');
  await setSetting('school_tagline', 'Excellence in Education');
  await setSetting('school_logo', '');
  await setSetting('school_address', '');
  await setSetting('school_contact_email', '');
  await setSetting('school_contact_phone', '');
  await setSetting('school_footer_text', '© The Ivy School');
  await setSetting('school_timezone', require('../utils/timezone').effectiveTz());
  await setSetting('duplicate_scan_window_sec', String(config.duplicateScanWindowSec));
  await setSetting('school_start_time', '08:00');
  await setSetting('school_end_time', '15:00');
  await setSetting('half_day_threshold_hours', '4');
  await setSetting('late_grace_minutes', '15');

  // Phase 2: designations, subjects, teacher assignments
  await ensurePhase2ReferenceData();

  // Sample attendance for last 20 working days + today
  const personPool = [
    ...studentIds.map(id => ['student', id]),
    ...employeeIds.map(id => ['employee', id])
  ];
  const nowIso = iso(new Date());

  const insertSummary = await db.prepare(`
    INSERT OR IGNORE INTO attendance_summary (person_type, person_id, date, in_time, out_time, status, working_hours, overtime_hours, late_minutes, early_exit_minutes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  const insertLog = await db.prepare(`
    INSERT INTO attendance_logs (person_type, person_id, device_id, location, direction, scan_time, date, raw_uid)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  for (let back = 45; back >= 0; back--) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
    const ds = dateStr(d);
    for (const [ptype, pid] of personPool) {
      const r = Math.random();
      if (r < 0.08) continue; // absent
      const isHalf = r > 0.88;
      const isLate = r > 0.72 && r <= 0.82;
      const inH = 7 + Math.floor(Math.random() * 2); // 07:xx - 08:xx
      const inM = Math.floor(Math.random() * 60);
      const inTime = `${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}`;
      let outH = 14 + Math.floor(Math.random() * 2);
      let outM = Math.floor(Math.random() * 60);
      if (isHalf) { outH = 11; outM = 0 + Math.floor(Math.random() * 45); }
      const outTime = `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
      const inHr = inH + inM / 60;
      const outHr = outH + outM / 60;
      let wh = Math.round((outHr - inHr) * 100) / 100;
      if (wh < 0) wh += 24;
      let status = 'present';
      if (isLate) status = 'late';
      if (isHalf) status = 'half_day';
      const lateMin = isLate ? Math.max(0, Math.floor((inHr - 8.0) * 60)) : 0;
      await insertSummary.run(ptype, pid, ds, inTime, outTime, status, wh, 0, lateMin, 0);
      await insertLog.run(ptype, pid, ptype === 'student' ? mainDevId : staffDevId, ptype === 'student' ? 'Main Entrance' : 'Staff Entrance', 'IN', `${ds} ${inTime}:00`, ds, ptype === 'student' ? `STU${String(pid).padStart(6, '0')}` : `EMP${String(pid).padStart(6, '0')}`);
      await insertLog.run(ptype, pid, ptype === 'student' ? mainDevId : staffDevId, ptype === 'student' ? 'Main Entrance' : 'Staff Entrance', 'OUT', `${ds} ${outTime}:00`, ds, ptype === 'student' ? `STU${String(pid).padStart(6, '0')}` : `EMP${String(pid).padStart(6, '0')}`);
    }
  }

  // Today's "in" scans only (so current day shows present but no out yet)
  const today = dateStr(now);
  const todayPool = [
    ...studentIds.slice(0, 26).map(id => ['student', id]),
    ...employeeIds.slice(0, 7).map(id => ['employee', id])
  ];
  for (const [ptype, pid] of todayPool) {
    const r = Math.random();
    if (r < 0.12) continue;
    const inH = 7 + Math.floor(Math.random() * 2);
    const inM = Math.floor(Math.random() * 60);
    const inTime = `${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}`;
    const lateMin = inH >= 8 ? (inH - 8) * 60 + inM : 0;
    const status = lateMin > 15 ? 'late' : 'present';
    await insertSummary.run(ptype, pid, today, inTime, null, status, 0, 0, lateMin, 0);
    await insertLog.run(ptype, pid, ptype === 'student' ? mainDevId : staffDevId, ptype === 'student' ? 'Main Entrance' : 'Staff Entrance', 'IN', `${today} ${inTime}:00`, today, ptype === 'student' ? `STU${String(pid).padStart(6, '0')}` : `EMP${String(pid).padStart(6, '0')}`);
  }

  await db.exec('COMMIT');
  console.log('Seed complete.');
  console.log('Super Admin : superadmin / Admin@123');
  console.log('School Admin: admin / Admin@123');
  console.log('HR          : hr / Admin@123');
  console.log('Teacher     : teacher_2 / Teacher@123');
  console.log('Employee    : emp1 / Emp@123');
  console.log('Parent      : parent1 / Parent@123');
}

module.exports = seed;
module.exports.ensurePhase2ReferenceData = ensurePhase2ReferenceData;

if (require.main === module) {
  seed().catch(e => { console.error(e); process.exit(1); });
}
