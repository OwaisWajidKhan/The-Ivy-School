// Schema DDL + additive migrations (shared by the local and Turso DB backends).
// Kept separate from the DB client so there is no circular require.

const SCHEMA = `
-- ============================================================
-- Roles & Permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Users (login accounts linked to a person)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  person_type TEXT CHECK(person_type IN ('student','employee','admin')) NOT NULL DEFAULT 'admin',
  person_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','locked')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_person ON users(person_type, person_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Organization structure
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(class_id, name)
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  half_day_threshold_hours REAL NOT NULL DEFAULT 4,
  description TEXT
);

-- ============================================================
-- Students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  admission_number TEXT NOT NULL UNIQUE,
  rfid_uid TEXT UNIQUE,
  rfid_uid_2 TEXT UNIQUE,
  full_name TEXT NOT NULL,
  father_name TEXT,
  class_id INTEGER REFERENCES classes(id),
  section_id INTEGER REFERENCES sections(id),
  roll_number INTEGER,
  dob TEXT,
  gender TEXT CHECK(gender IN ('Male','Female','Other')),
  phone TEXT,
  parent_contact TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','graduated','transferred')),
  photo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_students_rfid ON students(rfid_uid);

-- ============================================================
-- Employees (teachers, domestic staff, security, drivers, admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL UNIQUE,
  rfid_uid TEXT UNIQUE,
  full_name TEXT NOT NULL,
  cnic TEXT,
  mobile TEXT,
  department_id INTEGER REFERENCES departments(id),
  designation TEXT,
  joining_date TEXT,
  salary REAL NOT NULL DEFAULT 0,
  shift_id INTEGER REFERENCES shifts(id),
  working_hours REAL NOT NULL DEFAULT 8,
  overtime_rate REAL NOT NULL DEFAULT 1.5,
  leave_balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','resigned')),
  photo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_rfid ON employees(rfid_uid);

-- ============================================================
-- RFID cards
-- ============================================================
CREATE TABLE IF NOT EXISTS rfid_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  card_type TEXT NOT NULL CHECK(card_type IN ('student','employee')),
  person_id INTEGER NOT NULL,
  assigned_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','lost','revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rfid_person ON rfid_cards(card_type, person_id);

-- ============================================================
-- RFID Devices
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline')),
  last_sync_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_type TEXT NOT NULL CHECK(person_type IN ('student','employee')),
  person_id INTEGER NOT NULL,
  device_id INTEGER REFERENCES devices(id),
  location TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('IN','OUT')),
  scan_time TEXT NOT NULL,
  date TEXT NOT NULL,
  raw_uid TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_date ON attendance_logs(date, person_type, person_id);
CREATE INDEX IF NOT EXISTS idx_logs_person ON attendance_logs(person_type, person_id, date);

CREATE TABLE IF NOT EXISTS attendance_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_type TEXT NOT NULL CHECK(person_type IN ('student','employee')),
  person_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  in_time TEXT,
  out_time TEXT,
  status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','late','absent','half_day','early_exit','overtime')),
  working_hours REAL NOT NULL DEFAULT 0,
  overtime_hours REAL NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_exit_minutes INTEGER NOT NULL DEFAULT 0,
  is_working_day INTEGER NOT NULL DEFAULT 1,
  UNIQUE(person_type, person_id, date)
);
CREATE INDEX IF NOT EXISTS idx_summary_date ON attendance_summary(date, person_type);
CREATE INDEX IF NOT EXISTS idx_summary_person ON attendance_summary(person_type, person_id, date);

-- ============================================================
-- Leave management
-- ============================================================
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_type TEXT NOT NULL CHECK(person_type IN ('employee','student')),
  person_id INTEGER NOT NULL,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('Casual','Sick','Annual','Emergency','Without Pay')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL DEFAULT 1,
  reason TEXT,
  document TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  approved_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leaves_person ON leaves(person_type, person_id);

-- ============================================================
-- Payroll
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  working_days INTEGER NOT NULL DEFAULT 0,
  present_days INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  late_days INTEGER NOT NULL DEFAULT 0,
  half_days INTEGER NOT NULL DEFAULT 0,
  leave_days REAL NOT NULL DEFAULT 0,
  overtime_hours REAL NOT NULL DEFAULT 0,
  total_working_hours REAL NOT NULL DEFAULT 0,
  base_salary REAL NOT NULL DEFAULT 0,
  overtime_pay REAL NOT NULL DEFAULT 0,
  leave_adjustment REAL NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  bonuses REAL NOT NULL DEFAULT 0,
  net_salary REAL NOT NULL DEFAULT 0,
  notes TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(employee_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(month, year);

-- ============================================================
-- Holidays
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'Public' CHECK(type IN ('Public','Religious','School Event','Other')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('parent','student','employee','admin')),
  recipient_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'email' CHECK(channel IN ('email','sms','whatsapp','in_app')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_type, recipient_id, read);

-- ============================================================
-- Audit logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ============================================================
-- Settings / school config
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Phase 2 tables
-- ============================================================

CREATE TABLE IF NOT EXISTS designations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  department_id INTEGER REFERENCES departments(id),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id),
  class_id INTEGER REFERENCES classes(id),
  section_id INTEGER REFERENCES sections(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(teacher_id, subject_id, class_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_assign_teacher ON teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assign_class ON teacher_assignments(class_id, section_id);

CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('CNIC','Contract','Certificate','Other')),
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_empdocs_emp ON employee_documents(employee_id);

-- ============================================================
-- Parents / guardians (full profile from enrolment intake)
-- ============================================================
CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(relation IN ('mother','father','guardian')),
  full_name TEXT,
  phone TEXT,
  email TEXT,
  education TEXT,
  profession TEXT,
  employer TEXT,
  marital_status TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parents_student ON parents(student_id);
CREATE INDEX IF NOT EXISTS idx_parents_name ON parents(full_name);

CREATE TABLE IF NOT EXISTS gate_passes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  pass_no TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK(reason IN ('Early Pickup','Medical','Event','Other')),
  reason_note TEXT,
  guardian_name TEXT,
  guardian_cnic TEXT,
  guardian_relation TEXT,
  guardian_contact TEXT,
  exit_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','used','cancelled')),
  requested_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  used_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  qr_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gatepass_student ON gate_passes(student_id, exit_date);
CREATE INDEX IF NOT EXISTS idx_gatepass_status ON gate_passes(status, exit_date);
`;

// PostgreSQL schema variant, derived from the same SQLite SCHEMA so there is a
// single source of truth. Transformations:
//   - AUTOINCREMENT ids -> BIGINT GENERATED BY DEFAULT AS IDENTITY
//   - REAL -> DOUBLE PRECISION (8-byte float, avoids precision loss on salary)
//   - datetime('now') works on PG via the `datetime()` shim function created at
//     the top (returns the same UTC naive "YYYY-MM-DD HH:MM:SS" as SQLite).
const PG_SETUP = `
CREATE OR REPLACE FUNCTION datetime(p TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT CASE WHEN p = 'now' THEN to_char(timezone('UTC', clock_timestamp()), 'YYYY-MM-DD HH24:MI:SS') ELSE p END
$$;
`;

const SCHEMA_PG = PG_SETUP + SCHEMA
  .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
  .replace(/\bREAL\b/g, 'DOUBLE PRECISION');

const MIGRATIONS = [
  { table: 'users', column: 'avatar', ddl: 'TEXT' },
  { table: 'payroll', column: 'status', ddl: "TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paid'))" },
  { table: 'payroll', column: 'approved_by', ddl: 'INTEGER REFERENCES users(id)' },
  { table: 'payroll', column: 'approved_at', ddl: 'TEXT' },
  { table: 'students', column: 'family_id', ddl: 'TEXT' },
  { table: 'students', column: 'email', ddl: 'TEXT' },
  { table: 'students', column: 'rfid_uid_2', ddl: 'TEXT' },
  { table: 'employees', column: 'designation_id', ddl: 'INTEGER REFERENCES designations(id)' },
  { table: 'attendance_logs', column: 'gate_pass_id', ddl: 'INTEGER REFERENCES gate_passes(id)' }
];

module.exports = { SCHEMA, SCHEMA_PG, MIGRATIONS };
