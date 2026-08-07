// Canonical list of all permissions exposed to the UI for role assignment.
// Single source of truth: keep keys in sync with the requirePermission(...)
// guards used across backend routes.
const PERMISSIONS = [
  { group: 'School', items: [
    { key: 'manage_schools', label: 'Manage schools' },
    { key: 'manage_licenses', label: 'Manage licenses' },
    { key: 'create_admins', label: 'Create admins' }
  ]},
  { group: 'Students', items: [
    { key: 'manage_students', label: 'Manage students' },
    { key: 'view_students', label: 'View students' }
  ]},
  { group: 'Employees', items: [
    { key: 'manage_employees', label: 'Manage employees' },
    { key: 'view_employees', label: 'View employees' }
  ]},
  { group: 'Attendance', items: [
    { key: 'manage_attendance', label: 'Manage attendance' },
    { key: 'view_attendance', label: 'View attendance' },
    { key: 'kiosk_scan', label: 'RFID kiosk scanning' },
    { key: 'manage_shifts', label: 'Manage shifts' }
  ]},
  { group: 'Leave', items: [
    { key: 'manage_leave', label: 'Manage leave' },
    { key: 'approve_leave', label: 'Approve leave' }
  ]},
  { group: 'Payroll', items: [
    { key: 'manage_payroll', label: 'Manage payroll' },
    { key: 'generate_payroll', label: 'Generate payroll' }
  ]},
  { group: 'Reports', items: [
    { key: 'view_reports', label: 'View reports' },
    { key: 'view_all_reports', label: 'View all reports' },
    { key: 'export_reports', label: 'Export reports' },
    { key: 'view_audit_logs', label: 'View audit logs' }
  ]},
  { group: 'Devices & Cards', items: [
    { key: 'manage_devices', label: 'Manage devices & cards' }
  ]},
  { group: 'Holidays', items: [
    { key: 'manage_holidays', label: 'Manage holidays' }
  ]},
  { group: 'Settings', items: [
    { key: 'manage_settings', label: 'Manage settings' }
  ]}
];

const ALL_PERMISSION_KEYS = PERMISSIONS.flatMap(g => g.items.map(i => i.key));

module.exports = { PERMISSIONS, ALL_PERMISSION_KEYS };