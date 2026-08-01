# API Documentation

Base URL: `http://localhost:5000/api`

All endpoints except `POST /auth/login` and `POST /auth/refresh` require an `Authorization: Bearer <token>` header.

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login with `{username, password}`. Returns `accessToken`, `refreshToken`, `user`. Rate-limited (20/15min), brute-force locks after 5 failures. |
| POST | `/auth/refresh` | Exchange `{refreshToken}` for a new access token. |
| POST | `/auth/logout` | Revoke `{refreshToken}`. |
| GET | `/auth/me` | Current user with role, permissions and linked person. |

## Students

| Method | Path | Description |
|--------|------|-------------|
| GET | `/students` | List (filters: `q`, `class_id`, `section_id`, `status`; pagination `page`, `limit`) |
| GET | `/students/:id` | Detail + last 30 attendance records |
| POST | `/students` | Create (multipart, optional `photo`) |
| PUT | `/students/:id` | Update |
| DELETE | `/students/:id` | Delete |
| GET | `/students/search` | Quick lookup `?q=` → name/id/admission/rfid, incl. card status + last activity |
| POST | `/students/import` | Bulk import students via CSV |
| POST | `/students/promote` | Promote students to next class |
| POST | `/students/link-siblings` | Link siblings by shared `family_id` |

## Gate Passes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gate-passes` | List (filters: `status`, `q`; role-scoped for students/parents) |
| POST | `/gate-passes` | Request `{student_id, reason, exit_date, guardian_name, ...}` → generates `pass_no` + `qr_token` |
| PUT | `/gate-passes/:id/status` | Review `{status: approved\|rejected\|cancelled}` |
| POST | `/gate-passes/verify-exit` | RFID exit verification `{uid}` — marks today's approved pass used, records early-exit attendance |
| GET | `/gate-passes/:id/slip` | Printable HTML gate pass slip (with QR) |
| GET | `/gate-passes/:id/qr` | QR code image (PNG) |
| GET | `/gate-passes/report` | Gate pass report `{from, to, status}` |

## Cards (RFID)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cards/dashboard` | Card status counts (active/blocked/unassigned/total) |
| GET | `/cards` | List cards with linked person + class (filters: `status`, `card_type`, `q`) |
| GET | `/cards/pool` | Students & employees without an active card (assignment pool) |
| POST | `/cards/assign` | Assign `{uid, card_type, person_id}` (marks old card if re-assigning) |
| POST | `/cards/:id/reissue` | Reissue a lost card `{new_uid}` (optional; auto-generates if omitted) |
| PUT | `/cards/:id/status` | Block/activate `{status: active\|inactive\|lost\|revoked}` |
| POST | `/cards/bulk` | Bulk CSV import `{csv}` or multipart `file` — columns `uid,card_type,person_code` |

## Human Resource

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/hr/designations` | List / create designations |
| PUT/DELETE | `/hr/designations/:id` | Update / delete designation |
| GET/POST | `/hr/subjects` | List / create subjects |
| PUT/DELETE | `/hr/subjects/:id` | Update / delete subject |
| GET/POST | `/hr/assignments` | List / create teacher-class-section-subject assignments |
| DELETE | `/hr/assignments/:id` | Remove assignment |
| GET | `/hr/employees/:id/documents` | List employee documents |
| POST | `/hr/employees/:id/documents` | Upload document (multipart) |
| DELETE | `/hr/documents/:id` | Delete document |
| GET | `/hr/teachers` | Employees flagged as teachers |

## Employees

| Method | Path | Description |
|--------|------|-------------|
| GET | `/employees` | List (filters: `q`, `department_id`, `designation`, `status`) |
| GET | `/employees/:id` | Detail + attendance |
| POST | `/employees` | Create (multipart, optional `photo`) |
| PUT | `/employees/:id` | Update |
| DELETE | `/employees/:id` | Delete |

## Attendance

| Method | Path | Description |
|--------|------|-------------|
| POST | `/attendance/scan` | RFID scan `{uid, device_id, device_name, location, timestamp}`. Toggles IN/OUT, dedupes within window, applies rules. |
| POST | `/attendance/manual` | Manual override `{person_type, person_id, date, in_time, out_time, status}` |
| GET | `/attendance/today` | Today's rows for students and employees |
| GET | `/attendance/summary` | Summaries (filters: `date`, `from`, `to`, `person_type`, `status`, `person_id`, `class_id`) |
| GET | `/attendance/logs` | Raw scan logs (filters: `date`, `person_type`, `direction`) |
| GET | `/attendance/me` | Current user's own attendance history |

## Leaves

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leaves` | List (filters: `status`, `leave_type`; role-scoped) |
| POST | `/leaves` | Request (multipart, optional `document`) |
| PUT | `/leaves/:id/status` | Review `{status: approved\|rejected\|cancelled}` |

Leave types: `Casual`, `Sick`, `Annual`, `Emergency`, `Without Pay`.

## Payroll

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payroll` | Payroll records for `{month, year}` |
| POST | `/payroll/generate` | Generate payroll for `{month, year}` — creates **draft** records (status `draft`) |
| PUT | `/payroll/:id/approve` | Approve a single draft record (HR review) |
| POST | `/payroll/approve-month` | Approve all draft records for `{month, year}` |
| GET | `/payroll/report` | Monthly payroll report: department summary + records |
| GET | `/payroll/me` | Employee's own payslips |

## Reports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/daily` | Daily report for `{date}` |
| GET | `/reports/monthly` | Per-person summary for `{month, year, person_type}` |
| GET | `/reports/shift` | Shift staff report `{from, to}` |
| GET | `/reports/overtime` | Overtime report `{from, to}` |
| GET | `/reports/late` | Late arrivals `{from, to, person_type}` |
| GET | `/reports/early-exit` | Early exit report `{from, to, person_type}` |
| GET | `/reports/export/csv` | Monthly CSV export `{month, year, person_type}` |
| GET | `/reports/export/daily-csv` | Daily CSV export `{date}` |
| GET | `/reports/export/generic` | CSV export `{report: gate_passes\|leaves\|payroll}` |
| GET | `/reports/gate-passes` | Gate pass report `{from, to, status}` |
| GET | `/reports/attendance-summary` | Per-student monthly attendance % `{month, year}` |
| GET | `/reports/leaves` | Leave report `{from, to, status}` |

## Devices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/devices` | List all RFID readers |
| POST | `/devices` | Register (or heartbeat update) a device |
| PUT | `/devices/:id` | Update name/location/status |
| DELETE | `/devices/:id` | Remove device |

## Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Today's stats, weekly trend, timeline, recent scans, pending tasks |

## Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List notifications for the current role/person (returns `unread` count) |
| PUT | `/notifications/:id/read` | Mark as read |
| PUT | `/notifications/read-all` | Mark all as read |

## Reference data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reference/classes` / `/reference/sections` | Classes and sections |
| GET | `/reference/departments` | Departments |
| GET | `/reference/shifts` | Shift definitions |
| GET | `/reference/holidays` | Holidays (`?year=`) |
| POST | `/reference/classes`, `/sections`, `/departments`, `/shifts`, `/holidays` | Create |
| DELETE | `/reference/.../:id` | Delete |
| GET | `/reference/roles` | Roles with permissions |

## Admin (Super Admin / School Admin)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/admin/users` | List / create user accounts |
| PUT/DELETE | `/admin/users/:id` | Update / delete user |
| GET/PUT | `/admin/settings` | Read / update school settings |
| GET | `/admin/branding` | Single-school branding settings (logo, address, contact, footer, timezone) |
| GET | `/admin/audit` | Audit log entries (filters: `q`, `action`) |

## Errors

All responses use the shape `{ success, data | message }`. Errors use appropriate HTTP status codes: `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `429` rate limited, `500` server error.
