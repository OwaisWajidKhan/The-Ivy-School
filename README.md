# The Ivy School — Attendance Management System

A modern, cloud-ready School Attendance Management System with RFID card scanning, real-time attendance tracking, leave management, payroll automation, and reporting.

## Features

- **RFID attendance engine** — card scan toggles IN/OUT, 30s duplicate window, auto late/half-day/early-exit/overtime rules
- **Gate passes** — request/approve with QR slip, RFID exit verification at the gate, printable pass
- **RFID card management** — assign/reissue/block cards to students & staff, bulk CSV import, unassigned-person pool
- **HR module** — designations, subjects, teacher-class-section assignments, employee document storage
- **Role-based access control** — Super Admin, School Admin, HR, Teacher, Employee, Parent (sidebar hides inaccessible pages)
- **Student & staff management** — with photo upload and RFID card assignment
- **Leave management** — apply with document upload, approve/reject/cancel, balance deduction
- **Payroll engine** — draft generation → HR approval workflow, working days, deductions, overtime pay, net salary
- **Reports** — daily, monthly, shift, overtime, late, early-exit, gate passes, attendance summary, payroll with CSV export
- **Live dashboard** — today's attendance, 7-day trend, recent scans, pending gate passes, notification feed
- **Notifications** — in-app bell + email; unread badge, mark-all-read
- **Devices** — multiple RFID readers with online/offline status
- **Dark mode + mobile-responsive UI** — animated transitions, hover effects, success/error toast notifications

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Node.js + Express |
| Database | SQLite (built-in `node:sqlite`, zero native deps) |
| Auth | JWT access + refresh tokens, bcrypt, rate limiting |
| Cloud | Docker-compose ready; swap SQLite for Supabase/Postgres to scale |

## Quick start (local development)

### Prerequisites
- Node.js **24+** (uses built-in `node:sqlite` — no Python/build tools needed)
- npm

### 1. Backend
```bash
cd backend
npm install
npm run seed          # creates data/school.db with demo data
npm start             # http://localhost:5000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev           # http://localhost:5173 (proxies /api → :5000)
```

Open http://localhost:5173 and sign in with a demo account.

## Demo accounts

| Role | Username | Password |
|------|----------|----------|
| Super Admin | superadmin | Admin@123 |
| School Admin | admin | Admin@123 |
| HR | hr | Admin@123 |
| Teacher | teacher_2 | Teacher@123 |
| Employee | emp1 | Emp@123 |
| Parent | parent1 | Parent@123 |

## Trying the RFID scanner

In the **Attendance → RFID Scanner** tab, scan `STU000001` (student) or `EMP000001` (employee) to record IN/OUT. Direct API example:

```bash
curl -X POST http://localhost:5000/api/attendance/scan \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"uid":"STU000001","device_id":"DEV-MAIN-01","location":"Main Entrance"}'
```

## Docker deployment

```bash
docker compose up --build -d
# Frontend: http://localhost   Backend: http://localhost:5000/api/health
```

Set `JWT_SECRET` and `JWT_REFRESH_SECRET` in the environment. Database and uploads are stored in named volumes.

## Cloud / Supabase notes

This build uses SQLite via Node's built-in `node:sqlite` (no native compilation, ideal for single-node deploys). To scale to multi-campus with thousands of users, migrate the data layer to Supabase Postgres by replacing the queries in `backend/src/db/schema.js` with the Supabase JS client — the REST API contract in `backend/src/routes/*` stays unchanged. Uploads can be moved to Supabase Storage.

## Project structure

```
backend/
  src/
    index.js              # Express app + route wiring + rate limiting
    config.js             # environment config
    db/schema.js          # full normalized SQLite schema (17 tables)
    db/seed.js            # demo data
    middleware/auth.js    # JWT + role/permission guards
    routes/               # REST API endpoints
    services/             # attendance engine, payroll engine
frontend/
  src/
    components/           # layout, modal, badges, stats, spinner
    context/              # auth, theme, toast
    pages/                # all screens
    lib/                  # axios client, hooks, formatters
docker-compose.yml
```

## Documentation

- API endpoints: see `docs/API.md`
- Deployment guide: see `docs/DEPLOYMENT.md`
