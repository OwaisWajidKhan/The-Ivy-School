# Deployment Guide — The Hunger Zone POS

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Prisma CLI** (`npx prisma`)

### For Windows builds (from macOS/Linux)
- [Wine](https://www.winehq.org/) — `brew install wine-stable`

### For Windows builds (from Windows)
- No extra tools needed (NSIS installer built-in)

---

## Build Steps

```bash
# 1. Install dependencies
npm install

# 2. Regenerate Prisma client
npx prisma generate

# 3. Build all 3 targets (main, preload, renderer)
npm run build

# 4. Package into installer
npm run dist
```

---

## Platform-Specific Commands

| Platform | Command | Output |
|----------|---------|--------|
| **Windows** | `npm run dist -- --win` | `release/*.exe` (NSIS installer) |
| **macOS** | `npm run dist -- --mac` | `release/*.dmg` |
| **Linux** | `npm run dist -- --linux` | `release/*.AppImage` |
| **Current OS** | `npm run dist` | Auto-detects current platform |

Build for all platforms at once:
```bash
npm run dist -- --win --mac --linux
```

---

## Quick Build (Unpacked)

Skip the installer and get a portable folder for testing:

```bash
npm run pack
```

Output in `release/` (platform-specific folder with the app binary).

---

## Database

- Dev database: `prisma/pos.db` (auto-seeded with default admin)
- Runtime database: created at `app.getPath('userData')/pos.db` on first launch
- Default login: `owaiswajidkhan@gmail.com` / `Abc123@@`
- The Prisma schema and SQLite adapter are bundled inside the build (`extraResources`)

### If database errors occur on first launch

```bash
npx prisma db push
npx @electron/rebuild
npm run build
npm run dist
```

---

## Native Module Rebuild

`better-sqlite3` must match the Electron Node.js version. Run after any Electron or Node upgrade:

```bash
npx @electron/rebuild
```

---

## Notes

- The app is offline-first — no network required after installation
- Receipt printing uses Electron's `webContents.print()` — no additional printer drivers needed
- Backup files from Settings → Backup are `.db` files you can restore on any machine
