# Deployment Guide — The Ivy School

There are four supported ways to run The Ivy School. Pick the one that fits
your audience:

| Option | Best for | Runtime needed on target |
|--------|----------|--------------------------|
| **A. Portable client** | Client evaluation / a single school PC with no Node.js | none (self-contained exe) |
| **B. Docker** | Production server / multi-user hosting | Docker |
| **C. Bare metal (Node)** | On-prem server with Node available | Node.js >= 24 |
| **D. Vercel serverless** | Cloud-hosted, zero-maintenance, multi-instance | none (managed) |

---

## Option A — Portable client (recommended for client testing)

The app is bundled into a single self-contained Windows executable — no
installation and no Node.js on the target machine.

### Build the release

From `backend/`:

```bash
npm.cmd run dist        # = build:frontend -> bundle -> package (one step)
```

Or step by step:

```bash
npm.cmd run build:frontend   # build frontend/dist
npm.cmd run bundle           # bun build --compile -> build/TheIvySchool.exe
npm.cmd run package          # assemble build/release/ + build/TheIvySchool-Portable.zip
```

Prerequisites:
- Bun CLI (for `bundle`); the binary used is `C:\Users\owais\AppData\Local\Temp\opencode\bun\bun-windows-x64\bun.exe`
- 7-Zip at `C:\Program Files\7-Zip\7z.exe` (for `package`)

### Output

```
build/
├── TheIvySchool.exe              # standalone server (backend + DB driver)
├── app/                          # frontend static build (served by the exe)
├── release/TheIvySchool/         # unpacked client folder
│   ├── TheIvySchool.exe
│   ├── app/
│   ├── Start The Ivy School.bat  # launches server + opens browser
│   ├── Stop The Ivy School.bat
│   └── README.txt                # demo logins + instructions
└── TheIvySchool-Portable.zip     # send THIS to the client
```

### Deliver to the client

1. Send `TheIvySchool-Portable.zip` (≈35 MB).
2. Client unzips anywhere (Desktop, Documents, Program Files).
3. Double-click **"Start The Ivy School.bat"** — browser opens at
   `http://localhost:5000`.
4. Log in with a demo account (`admin` / `Admin@123`). Full list in `README.txt`.
5. Double-click **"Stop The Ivy School.bat"** to shut down.

### How the exe works (behind the scenes)

- Built with `bun build --compile` + `--define "process.env.IVY_PACKAGED='1'"`.
- First run: if the database is empty, the server auto-seeds sample data
  (no manual seed step). See `src/db/seed.js` and the auto-seed check in
  `src/index.js`.
- Data lives in `%LOCALAPPDATA%\TheIvySchool\` (`school.db` + `uploads/`),
  independent of where the exe is placed.
- In packaged mode the server logs to `<dataDir>\server.log` (it runs hidden).
- Port: `5000` by default. Override with the `PORT` env var if busy.

### Update an existing client install

Replace the two files (`TheIvySchool.exe` + `app/`) in the client's folder.
The database in `%LOCALAPPDATA%\TheIvySchool` is preserved. Do **not** ship a
`school.db` file in the zip — the exe seeds its own.

---

## Option B — Docker (recommended for production)

```bash
# 1. Set secrets (once)
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"

# 2. Build and start
docker compose up --build -d

# 3. Verify
curl http://localhost/api/health        # backend via nginx proxy
open http://localhost                   # frontend
```

Logs:
```bash
docker compose logs -f backend frontend
```

The SQLite database and uploaded files persist in Docker named volumes
(`school-data`, `school-uploads`) and survive container restarts.

`frontend/nginx.conf` is used by the frontend image: it serves the static
build and reverse-proxies `/api` and `/uploads` to the backend service.

---

## Option C — Bare metal (Node.js >= 24)

1. **Backend**
   ```bash
   cd backend
   npm ci --omit=dev
   node src/index.js         # auto-seeds on first run (empty DB)
   ```
   For a long-running service use a process manager:
   ```bash
   npm i -g pm2
   pm2 start src/index.js --name ivy-school
   pm2 save && pm2 startup
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm ci
   npm run build             # outputs dist/
   ```
   Serve `dist/` with nginx and proxy `/api` and `/uploads` to the backend
   (see `frontend/nginx.conf`).

---

## Option D — Vercel serverless (cloud)

The app deploys to Vercel as one Node function (`api/index.js`) plus the
static `frontend/dist` build. Data lives in **Turso** (libSQL over HTTPS) and
uploads in **Vercel Blob**, so there is no local disk — functions scale to
multiple instances safely.

### What the deploy looks like

```
repo root/
├── api/index.js          # serverless entry -> exports the Express app
├── vercel.json           # build + rewrites (/api/*, /uploads/* -> api/index.js)
├── package.json          # root build script (installs + builds frontend)
├── backend/              # Express app + routes (unchanged from local mode)
└── frontend/dist/        # static build served by Vercel's CDN
```

Routing in `vercel.json`:
- `/api/*`  -> `api/index.js` function
- `/uploads/*` -> `api/index.js` (resolves Vercel Blob URLs / redirects)
- everything else -> `/index.html` (SPA fallback)

### 1. Provision the serverless DB (Turso)

```bash
turso db create ivy-school
turso db show ivy-school --url          # -> TURSO_DATABASE_URL
turso db tokens create ivy-school       # -> TURSO_AUTH_TOKEN
```

### 2. Provision Vercel Blob

From the Vercel dashboard: Storage -> Create Blob store -> copy
`BLOB_READ_WRITE_TOKEN`.

### 3. Deploy

Push the repo to GitHub/GitLab and import it in Vercel, or deploy from the
repo root with the Vercel CLI:

```bash
vercel --prod
```

Vercel runs the root `build` script (`npm --prefix backend install` +
`npm --prefix frontend install` + `vite build`), publishes `frontend/dist`,
and bundles `api/index.js` with the traced backend dependencies.

### 4. Environment variables (Vercel)

| Variable | Description |
|----------|-------------|
| `TURSO_DATABASE_URL` | Turso database URL from step 1 |
| `TURSO_AUTH_TOKEN` | Turso auth token from step 1 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token from step 2 |
| `JWT_SECRET` | Access-token signing secret (random long string) |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret (random long string) |
| `FRONTEND_URL` | `https://<your-project>.vercel.app` (CORS origin) |

`VERCEL=1` is set automatically by Vercel; it switches the backend into
serverless mode (Blob uploads, no `app.listen`, no local static serving).

### 5. First run

The first request on each warm instance waits for the readiness gate
(schema + auto-seed if `users` is empty + Phase-2 reference data), so an empty
Turso DB seeds itself. Verify:

```bash
curl https://<your-project>.vercel.app/api/health
```

### Local preview against a Turso database

You can run the backend locally against a Turso file DB to simulate the
serverless data layer:

```bash
# PowerShell
$env:TURSO_DATABASE_URL = "file:C:\Users\you\AppData\Local\Temp\turso-dev.db"
cd backend
node src/index.js
```

### Notes & limits

- Vercel's function body limit (~4.5 MB) bounds multipart uploads; fine for
  photos/PDFs.
- First cold start pays the seed/init cost; the readiness gate is memoized per
  warm instance, so subsequent requests are fast.
- Do not point `TURSO_DATABASE_URL` at a `file:` URL in production — use the
  managed `https://` endpoint from `turso db show --url`.

---

## Environment variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | API port |
| `JWT_SECRET` | dev-only | Access-token signing secret (set in prod!) |
| `JWT_REFRESH_SECRET` | dev-only | Refresh-token signing secret (set in prod!) |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh token lifetime |
| `DB_FILE` | `backend/data/school.db` | SQLite database path |
| `UPLOAD_DIR` | `backend/uploads` | Photo/document upload folder |
| `DUPLICATE_SCAN_WINDOW_SEC` | `30` | Duplicate scan window |
| `FRONTEND_URL` | `http://localhost:5000` | CORS origin (set to the `https://` origin in prod) |
| `TURSO_DATABASE_URL` | *(unset = local SQLite)* | libSQL/Turso DB URL — serverless mode |
| `TURSO_AUTH_TOKEN` | *(unset)* | Turso auth token |
| `BLOB_READ_WRITE_TOKEN` | *(unset = disk uploads)* | Vercel Blob token — blob mode |
| `VERCEL` | `1` on Vercel | Serverless mode (set by platform) |

## HTTPS

Terminate TLS at the reverse proxy (nginx/caddy) in front of the frontend
service. Set `FRONTEND_URL` to the `https://` origin so CORS allows it.

## Backups

- **Portable / bare metal:** stop the server, copy `%LOCALAPPDATA%\TheIvySchool\school.db*`
  (or `backend/data/school.db*`) + `uploads/`, restart. WAL mode keeps the DB consistent.
- **Docker:** copy the named volume:
  ```bash
  docker run --rm -v ivy_school-data:/data -v "$PWD":/backup alpine tar czf /backup/school-backup.tgz -C /data .
  ```
- Schedule daily backups with cron / Watchtower.

## Scaling & cloud deployment

- **Vercel (recommended cloud path):** the data layer already swaps to Turso
  (libSQL) and uploads to Vercel Blob when `TURSO_DATABASE_URL` /
  `BLOB_READ_WRITE_TOKEN` are set — see **Option D**. The REST contract is
  unchanged; only `backend/src/db/client.js` (and `storageService.js`) select
  the backend.
- **Moving to another managed DB:** replace the Turso branch in
  `backend/src/db/client.js` (e.g. with the Supabase JS client or Postgres) —
  no route changes needed.
- Serve the frontend from a CDN (Vercel already does); scale the API
  horizontally once the DB is off local SQLite.
