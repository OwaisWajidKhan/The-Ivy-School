School Attendance Management System (Cloud-Based) - Complete Development Prompt

Build a modern, production-ready, cloud-based School Attendance Management System that supports RFID card scanning for students, teachers, domestic staff, security staff, drivers, and all other employees.

Objective

The system should automatically record attendance when an RFID card is scanned. Every scan should record the person's entry and exit time, attendance history, working hours, and generate attendance reports for salary calculations and student records.

Technology Requirements
Cloud-based architecture
Responsive web application
REST API
Secure authentication
Real-time synchronization
Database hosted on cloud
RFID reader integration
Role-based access control

Preferred Stack:

Frontend:

React.js or Next.js
Tailwind CSS

Backend:

Node.js (Express/NestJS)

Database:

Sqlite

Cloud:

Supabase

Storage:

Cloud file storage for documents/photos
User Roles
Super Admin

Can:

Manage schools (if multi-school)
Create admins
Manage licenses
View all reports
School Admin

Can:

Add students
Add teachers
Add domestic staff
Add security guards
Add drivers
Assign RFID cards
Manage attendance
Manage holidays
View reports
Export reports
Configure school timings
HR/Admin Staff

Can:

View attendance
Generate salary reports
Approve leaves
Manage shifts
Teacher

Can:

View own attendance
View assigned students
Request leave
Employee

Can:

View attendance history
View working hours
Request leave
Student Management

Store:

Student ID
RFID Card UID
Admission Number
Full Name
Father Name
Class
Section
Roll Number
Date of Birth
Gender
Phone Number
Parent Contact
Address
Status
Photo
Staff Management

Store:

Employee ID
RFID UID
Full Name
CNIC
Mobile Number
Department
Designation
Joining Date
Salary
Shift
Working Hours
Overtime Rate
Leave Balance
Status
Photo
RFID Attendance Module

Every RFID card has a unique UID.

When scanned:

If first scan of the day:

Record:

IN Time
Date
Device ID
Location

If scanned again:

Record:

OUT Time

If scanned multiple times:

Ignore duplicate scans within a configurable time window (e.g. 30 seconds).

Attendance should update instantly.

Attendance Rules

Students:

Present
Late
Absent
Half Day

Staff:

Present
Late
Half Day
Early Exit
Overtime
Absent
Salary Monitoring

Automatically calculate:

Working days
Present days
Absent days
Late arrivals
Half days
Overtime hours
Total working hours
Leave balance
Salary deductions
Net payable salary

Generate monthly payroll reports.

Leave Management

Employees can:

Apply for leave
Upload supporting documents
View leave balance

Admin can:

Approve
Reject
Cancel

Leave Types:

Casual
Sick
Annual
Emergency
Without Pay
Student Attendance Reports

Generate:

Daily report
Weekly report
Monthly report
Class-wise attendance
Student-wise attendance
Parent attendance summary

Export:

PDF
Excel
Employee Attendance Reports

Generate:

Daily attendance
Monthly attendance
Shift reports
Overtime report
Salary report
Late arrival report
Early exit report

Export:

Excel
PDF
CSV
RFID Devices

Support multiple RFID devices simultaneously.

Each device should have:

Device Name
Device ID
Location
Online/Offline Status
Last Sync Time
Dashboard

Display:

Students:

Present today
Absent
Late
Total Students

Staff:

Present
Absent
Late
Overtime

System:

Active RFID readers
Recent scans
Today's attendance timeline
Notifications
Notifications

Send notifications via:

SMS (optional)
WhatsApp (optional)
Email

Parents receive:

Student entered school
Student exited school

Employees receive:

Attendance confirmation
Leave approval
Payroll notifications
Security
JWT Authentication
Refresh Tokens
Password Hashing
HTTPS
Audit Logs
Role-Based Permissions
Rate Limiting
Data Encryption
API Features

Create REST APIs for:

Authentication
Students
Employees
RFID
Attendance
Leave
Payroll
Reports
Dashboard
Notifications
Database Design

Create normalized database tables for:

Users
Roles
Permissions
Students
Employees
RFID Cards
Attendance Logs
Attendance Summary
Leaves
Payroll
Departments
Classes
Sections
Holidays
Devices
Notifications

Include proper foreign keys, indexes, and constraints.

Additional Features
QR code support (future-ready)
Barcode support
Dark Mode
Multi-language support
Mobile-friendly UI
Audit Logs
Backup & Restore
Automatic daily backups
Cloud synchronization
Offline scan caching with automatic sync when internet is restored
Deliverables

Produce:

Complete database schema (ERD)
Backend API architecture
Frontend UI design
Admin Dashboard
RFID integration module
Authentication system
Attendance engine
Payroll engine
Reporting module
Deployment guide
Docker configuration
Production-ready source code
API documentation
Installation instructions
Test cases and sample data

The final system should be scalable, secure, modular, and suitable for deployment in schools with thousands of students and employees across multiple campuses.