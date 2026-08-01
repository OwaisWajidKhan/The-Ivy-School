# Deployment Guide — The Ivy School

There are three supported ways to run The Ivy School. Pick the one that fits
your audience:

| Option | Best for | Runtime needed on target |
|--------|----------|--------------------------|
| **A. Portable client** | Client evaluation / a single school PC with no Node.js | none (self-contained exe) |
| **B. Docker** | Production server / multi-user hosting | Docker |
| **C. Bare metal (Node)** | On-prem server with Node available | Node.js >= 24 |

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

## Scaling & moving off SQLite

- The REST contract is independent of the storage layer. To move to Supabase,
  replace `backend/src/db/schema.js` internals with the Supabase JS client
  (`@supabase/supabase-js`) — no route changes needed.
- Move `backend/uploads` to Supabase Storage buckets for off-host files.
- Serve the frontend from a CDN; the API container can be scaled horizontally
  behind a load balancer once the DB moves off local SQLite.
