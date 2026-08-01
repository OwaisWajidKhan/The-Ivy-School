School Attendance Management System
Requirement 2 — Phase 2 Development

This document extends the original Phase 1 requirement specification. It is based on the live dashboard UI (attached reference screenshot, "The Ivy School" instance) which reflects how Phase 1 was actually delivered, and defines the features and refinements to be built in Phase 2.

The Phase 1 navigation is organized into the following top-level menu groups, which Phase 2 will retain and expand:

Administration
Human Resource
Academics
Student Management
RFID Management
Reports
1. Objective of Phase 2

Phase 1 delivered the core structure: authentication, user roles, student/employee/teacher records, RFID card assignment, and basic gate/attendance reporting. Phase 2 focuses on:

Completing the Student Gate Pass workflow (visible in the sidebar but not detailed in Phase 1 spec).
Formalizing Gate Report and Employee Gate Report into full attendance/salary-linked reporting (per original Phase 1 spec, not yet implemented against the live UI).
Enhancing the Search Student utility into a full quick-lookup + action panel.
Adding multi-school / multi-branch white-labeling, since the dashboard shows a mismatch between the header logo ("The Ivy School") and footer branding ("Cedar College") — indicating the system must support multiple school identities under one deployment.
Filling in the modules named in Phase 1 but not yet visible in the current UI: Payroll, Leave Management, Holidays, Shifts, Notifications, and Dashboard analytics widgets.
2. Navigation Structure (as-built, to be extended)
2.1 Administration

Existing: User Management Phase 2 additions:

Role & Permission Management (create/edit custom roles beyond the 6 defined in Phase 1)
School/Branch Management (multi-school support — add, edit, switch active school; each school has its own logo, name, and address used across the UI and printed reports)
License Management (for Super Admin — activate/renew/deactivate school licenses)
Audit Log Viewer (searchable log of all create/update/delete actions by user)
System Settings (attendance grace period, late-mark threshold, duplicate-scan window, timezone)
2.2 Human Resource

Existing: Employee Management Phase 2 additions:

Department & Designation Management
Shift Management (define shift start/end, grace period, assign to employees)
Leave Management (apply, approve/reject, leave balance, leave types: Casual, Sick, Annual, Emergency, Without Pay)
Payroll Module (auto-calculate present/absent/late/overtime → net salary; monthly payroll report; export PDF/Excel)
Employee Document Storage (CNIC copy, contract, certificates)
2.3 Academics

Existing: Teacher Management Phase 2 additions:

Class & Section Management
Subject Management
Teacher–Class–Section assignment
Teacher own-attendance and timetable view
2.4 Student Management

Existing: Search Student, Student Management, Student Gate Pass Phase 2 additions:

Search Student — enhancement:
Extend current single search field (Student ID / Name / Cell Number) to show live filtered results as-you-type
Result card should show photo, class/section, RFID UID status, last gate activity (IN/OUT), and quick actions (View Profile, Issue Gate Pass, View Attendance)
Student Gate Pass — full workflow (new module, not detailed in Phase 1):
Request gate pass (reason: early pickup, medical, event, other)
Parent/guardian confirmation field (name, CNIC, relation, contact number of person picking up the student)
Approval flow: Class Teacher/Admin approves before pass is generated
Printable/QR-based gate pass slip shown to security staff at exit
Security staff scans QR or manually verifies and marks pass as "Used" with exit timestamp
Gate Pass history log per student
Student Management — enhancement:
Bulk import students via Excel/CSV
Promote/transfer students between classes at year-end
Sibling linking (link records of siblings under one parent contact)
2.5 RFID Management

Existing: Students Card, Employee Card Phase 2 additions:

Card issuance workflow: assign, reissue (lost card), block/deactivate a UID
Card status dashboard (Active / Blocked / Unassigned cards count)
Bulk card assignment via CSV upload (UID ↔ Student/Employee ID mapping)
Device Management screen (register RFID readers: Device Name, Device ID, Location, Online/Offline status, Last Sync Time) — required per Phase 1 spec but not present in current sidebar
2.6 Reports

Existing: Employee Gate Report, Gate Report Phase 2 additions:

Gate Report — enhancement: filter by date range, class/section, individual student; show IN/OUT time pairs and computed status (Present/Late/Absent/Half Day); export PDF/Excel/CSV
Employee Gate Report — enhancement: filter by department/shift; show IN/OUT, late arrival, early exit, overtime hours; export PDF/Excel/CSV
New: Student Gate Pass Report (all passes issued/used in a date range)
New: Monthly Attendance Summary Report (student-wise and class-wise %)
New: Payroll/Salary Report (per employee and department-wise)
New: Leave Report (approved/rejected/pending by employee)
2.7 Dashboard (home screen)

Currently a blank landing page. Phase 2 adds live widgets:

Students: Present today / Absent / Late / Total
Staff: Present / Absent / Late / Overtime
Active RFID readers (online/offline count)
Recent scans feed (real-time, last 20 scans)
Today's attendance timeline (visual)
Pending gate pass approvals (count + quick link)
Notification feed
3. Multi-School / Branding Requirement (new)

The reference screenshot shows the header logo as "The Ivy School" while the footer reads "Cedar College," implying the current build already mixes branding elements. Phase 2 must resolve this by introducing:

A School Profile entity: school name, logo, address, contact info, timezone, footer/copyright text
All UI chrome (header logo, footer text, printed reports, gate pass slips, email/SMS templates) must pull from the active School Profile, not hardcoded values
Super Admin can manage multiple School Profiles; School Admin is scoped to their own school only
4. Notifications (carried over from Phase 1, not yet visible in UI)
Email notification on student gate pass approval and usage
Email/SMS/WhatsApp (optional, configurable per school) to parents on student entry/exit
Email to employees on attendance confirmation, leave approval, payroll generation
In-app notification bell (already present in header) to be wired to real events
5. Non-Functional Additions for Phase 2
Real-time dashboard updates via WebSocket/Supabase Realtime
Role-based visibility: sidebar menu items should render conditionally based on logged-in user's role/permissions
Printable templates (Gate Pass slip, Payroll slip, Attendance report) as PDF using consistent school branding
Offline scan caching at device level with auto-sync (per original Phase 1 spec — confirm implementation status)
6. Deliverables for Phase 2
Updated ERD reflecting new tables: school_profiles, gate_passes, devices, shifts, leaves, payroll, notifications, audit_logs
Updated REST API documentation for all new/extended endpoints
Updated frontend screens matching the modules above, consistent with existing sidebar structure
Test cases covering: gate pass approval flow, multi-school data isolation, payroll calculation accuracy, report export formats
Migration/deployment notes for moving from Phase 1 to Phase 2 schema
7. Open Questions to Confirm Before Development
Is multi-school support required now, or should the logo/footer mismatch simply be fixed as a single-school branding bug?
Should Student Gate Pass require photo verification at exit, or is QR/manual confirmation by security sufficient?
Which notification channels (Email/SMS/WhatsApp) should be enabled by default vs. optional per school?
Should payroll be fully automated or require HR review/approval before finalizing each month?