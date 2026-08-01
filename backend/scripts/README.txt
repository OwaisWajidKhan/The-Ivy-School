The Ivy School - Attendance Management System
Cloud-Based | Self-Hosted Web App | v2.0

HOW TO RUN (no installation, no Node.js needed)
------------------------------------------------
1. Double-click  "Start The Ivy School.bat"
2. Wait a few seconds - your browser opens automatically.
   If not, go to:  http://localhost:5000
3. Log in using one of the demo accounts below.
4. To shut the app down, double-click  "Stop The Ivy School.bat"
   (or close the black server window).

WHAT IS THIS
------------------------------------------------
This is the full School Attendance Management System running locally
on this PC. It includes the backend server, database, and web interface
all in one. The data (attendance, students, payroll, etc.) is stored on
this computer in:  %LOCALAPPDATA%\TheIvySchool\school.db

DEMO LOGIN ACCOUNTS
------------------------------------------------
Role          | Username      | Password
--------------|---------------|-----------
Super Admin   | superadmin    | Admin@123
School Admin  | admin         | Admin@123
HR            | hr            | Admin@123
Teacher       | teacher_2     | Teacher@123
Employee      | emp1          | Emp@123
Parent        | parent1       | Parent@123

FIRST-TIME SETUP (automatic)
------------------------------------------------
The first time the server starts it creates the database and loads
sample data automatically. No manual setup is required.

TRY THIS
------------------------------------------------
- Dashboard: live attendance, pending gate passes, notification feed.
- Attendance > Scan Simulator: enter an RFID UID (e.g. STU000001)
  to record an IN/OUT scan. See the list of UIDs on the Students page.
- Gate Passes: request a student gate pass, approve it, then scan the
  student's RFID card under "Exit Verification" to mark the exit.
- RFID Cards: assign / reissue / block cards, or bulk-import a CSV.
- HR Management: designations, subjects, teacher-class assignments,
  and employee document uploads.
- Payroll: generate the month, then approve each record (HR workflow).
- Leave > Request: submit a leave request (upload a document).
- Reports: daily/monthly attendance, gate passes, payroll, CSV export.

NOTE
------------------------------------------------
- Works fully offline - no internet connection needed after install.
- Backend port: 5000. If that port is busy on your machine, set the
  PORT environment variable before starting the server.
