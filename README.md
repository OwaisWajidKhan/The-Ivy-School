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
| Database | SQLite (`node:sqlite`, zero native deps) locally · Turso (libSQL) serverless on Vercel |
| Auth | JWT access + refresh tokens, bcrypt, rate limiting |
| Uploads | Local disk in dev/packaged mode · Vercel Blob on Vercel |
| Cloud | Vercel serverless (Turso + Blob) · Docker-compose ready |

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

## Deploy to Vercel (serverless)

The app deploys to Vercel as **two services in one project** (see
`docs/DEPLOYMENT.md` → "Option D").

1. **Create a Turso database** (serverless SQLite):
   - Web console (easiest): **https://app.turso.tech** → Create Database
     (`ivy-school`) → copy the URL + Generate Token. The console moved here —
     `console.turso.io` is retired. No Windows CLI exists (WSL only).
   - Or with the CLI (Linux/macOS):
   ```bash
   turso db create ivy-school
   turso db show ivy-school --url        # -> TURSO_DATABASE_URL
   turso db tokens create ivy-school     # -> TURSO_AUTH_TOKEN
   ```
2. **Create a Vercel Blob store** (for photo/document uploads) from the Vercel
   dashboard and copy `BLOB_READ_WRITE_TOKEN`.
3. **Push to a Git repo** and import it in Vercel (or run `vercel` from the
   repo root). `vercel.json` declares the frontend (Vite) and backend
   (Express) services and rewrites `/api/*` + `/uploads/*` to the backend.
4. **Set environment variables** in Vercel:
   ```
   TURSO_DATABASE_URL=<from step 1>
   TURSO_AUTH_TOKEN=<from step 1>
   BLOB_READ_WRITE_TOKEN=<from step 2>
   JWT_SECRET=<random long string>
   JWT_REFRESH_SECRET=<random long string>
   FRONTEND_URL=https://<your-project>.vercel.app
   ```
5. **First request auto-seeds** the empty Turso database (schema + demo data
   + Phase-2 reference data). Seeding an empty cloud DB is slow (~12 min over
   HTTPS) — seed once locally first if possible. Health check:
   `https://<your-project>.vercel.app/api/health` (reports `"db":"turso"`).

See `docs/DEPLOYMENT.md` → "Option D — Vercel serverless" for details,
including local preview with a Turso `file:` URL.

## Cloud notes

- **Local / packaged**: SQLite via Node's built-in `node:sqlite` — no native
  compilation, single-file DB under `backend/data/school.db`.
- **Serverless (Vercel)**: Turso (libSQL over HTTPS) is persistent and
  multi-instance safe; uploads go to Vercel Blob. The REST API contract in
  `backend/src/routes/*` is identical — the data layer is swapped in
  `backend/src/db/client.js` (Turso vs local) with no route changes.

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
