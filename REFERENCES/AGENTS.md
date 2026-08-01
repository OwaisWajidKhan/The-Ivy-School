# AGENTS.md — Instructions for AI Agents

## Before You Start

Always read these files first:
- `CLAUDE.md` — full project state, architecture, schema
- `PLAN.md` — phased execution plan
- `scope.md` — original client requirements

## Project Identity

- **Name:** The Hunger Zone POS
- **Stack:** Electron + React 19 + TypeScript 6 + Prisma 7 (SQLite) + Zustand
- **Theme:** `#C82625` (primary), `#010202` (dark), `#FFFFFF` (white)
- **Auth:** `owaiswajidkhan@gmail.com` / `Abc123@@`

## Architecture Rules

1. **No routing library** — page switching via `currentPage` state in AppShell
2. **All DB access** goes through IPC controllers (`src/main/ipc/controllers/`)
3. **Renderer never imports from main** — uses `window.api` (exposed via preload)
4. **Zustand** for renderer state only (auth, cart, UI)
5. **Prisma 7 adapter pattern** — use `@prisma/adapter-better-sqlite3`, NOT `datasourceUrl` in constructor
6. **Soft delete** — all entities have `deletedAt`, use `update({ deletedAt: new Date() })`

## IPC Pattern

To add a new feature:
1. Add channel constant in `src/shared/interfaces/ipc-channels.ts`
2. Create controller in `src/main/ipc/controllers/`
3. Register in `src/main/ipc/index.ts`
4. Add method to `src/preload/index.ts`
5. Create page in `src/renderer/pages/`
6. Add route in `src/renderer/components/AppShell.tsx`
7. Add nav item in `src/renderer/components/Sidebar.tsx`

## Code Style

- No comments in production code
- Single quotes, semicolons, trailing commas
- Inline styles only (no CSS modules or styled-components)
- TypeScript strict mode
- Functions over classes

## DB Changes

After modifying `prisma/schema.prisma`:
1. `npx prisma generate` — regenerate client
2. `npx prisma db push` — apply to SQLite
3. `$env:DATABASE_URL='file:./prisma/seed.db'; npx prisma db push --accept-data-loss` — update seed DB
4. Check `npx tsc --noEmit` — verify types

## Build & Test

```bash
start.bat             # Windows — double-click to install deps, push schema, and launch dev
npm run dev            # Launch Electron dev mode
npm run build          # Production build (verifies all 3 targets: main, preload, renderer)
npx tsc --noEmit       # TypeScript check
```

### Windows First-Time Setup

1. `npm.cmd install` — installs dependencies (npm v11 blocks install scripts by default)
2. `npm.cmd install-scripts approve @prisma/engines better-sqlite3 esbuild prisma electron-winstaller`
3. `npx.cmd @electron/rebuild` — rebuilds native modules (`better-sqlite3`) for Electron
4. `npx.cmd prisma generate` — generates Prisma client

On first launch, `ensureSchema()` in `src/main/index.ts` copies `prisma/seed.db` (bundled as an `extraResource`) to `app.getPath('userData')/pos.db`. No runtime `npx` dependency.
After modifying `prisma/schema.prisma`, regenerate the seed DB via step 3 in **DB Changes** above.

## New Feature Checklist

When adding a new page:
1. Add channel constant in `src/shared/interfaces/ipc-channels.ts`
2. Create controller in `src/main/ipc/controllers/`
3. Register in `src/main/ipc/index.ts`
4. Add method to `src/preload/index.ts`
5. Create page in `src/renderer/pages/`
6. Add route in `src/renderer/components/AppShell.tsx`
7. Add nav item in `src/renderer/components/Sidebar.tsx`

## Validation & Audit

- Use `validate(schema, data)` from `src/main/validation/validate.ts` in IPC handlers
- Add Zod schemas in `src/main/validation/schemas.ts`
- Use `logAudit(action, entity, entityId, userId, metadata)` for all CRUD operations

## Menu Seeding

The menu is seeded from `menu.md` in `src/main/database/seed.ts`. To update:
1. Edit `menu.md` with new items/prices
2. Update the `productsByCategory` map in `seed.ts`
3. Delete `%APPDATA%\the-hunger-zone-pos\pos.db` so it re-seeds on next launch

Current categories: Burgers, Broast, Fries, Sandwiches, Hunger Kid's Special, Deals, Beverages.
Add-ons: Cheese (100, linked to Burgers), Pepperoni (100, linked to Pizza Fries).
Tables: 10 tables (1–10, capacity 4) auto-created on seed.

## Recent Changes (Session: Jul 16 2026)

### Order Edit Feature
- Added **Edit button** (pencil icon) on pending orders in OrdersPage — matches View/Print button style
- Created `src/renderer/components/EditOrderModal.tsx` — full-featured order edit modal with:
  - Order type & table selection (dine-in tables filtered to free + current)
  - Category-filtered product picker (sidebar layout matching POS Terminal)
  - Product customizer modal for variant, add-on, quantity, and notes selection (same UX as POS)
  - Item list with quantity controls and remove
  - Discount toggle between **%** and **Amount** mode
  - Discount shown on receipt with calculated percentage only when applied (> 0)
- Added `ORDER.UPDATE` IPC channel, update handler in `src/main/ipc/controllers/order.controller.ts`, and `order.update` in preload
- Backend validates only **pending** orders can be edited; replaces old items/add-ons via delete+recreate
- Discount display in receipt shows percentage via runtime calculation (`discount / subtotal * 100`)
- Affected files:
  - `src/shared/interfaces/ipc-channels.ts` — added `UPDATE: 'order:update'`
  - `src/main/ipc/controllers/order.controller.ts` — added `ORDER.UPDATE` handler
  - `src/preload/index.ts` — added `order.update(id, data)`
  - `src/renderer/components/EditOrderModal.tsx` — new file
  - `src/renderer/pages/OrdersPage.tsx` — Edit button, handleEdit, modal wiring
  - `src/main/services/receipt.service.ts` — discount percentage in thermal & A4 receipts

### Build Note
- Dev mode HMR (`npm run dev`) has intermittent issues detecting renderer changes on this Windows setup
- Workaround: run `npm run build && npm run dev` to ensure changes are picked up

## Recent Changes (Session: Jul 8 2026)

### Silent Startup Crash Fix (No Node.js on target PC)
- Root cause: `ensureSchema()` called `npx prisma db push` at runtime, but `npx` doesn't exist on clean Windows PCs without Node.js
- Fix: `prisma/seed.db` is now bundled as an `extraResource` in `electron-builder.yml`
- `ensureSchema()` now copies the seed DB file instead of running `npx prisma db push`
- Added `dialog.showMessageBox()` on init failure so errors are visible to the user (not just console)
- Updated `.gitignore` to track `prisma/seed.db`
- Affected files: `src/main/index.ts`, `electron-builder.yml`, `.gitignore`

## Recent Changes (Session: Jul 4 2026)

### Sidebar Cleanup
- Removed **Customers**, **Employees**, **Inventory** from sidebar nav and AppShell routing
- Affected files: `src/renderer/components/Sidebar.tsx`, `src/renderer/components/AppShell.tsx`

### Product Price Ordering
- Products now sort by `price: 'asc'` in both `PRODUCT.LIST` and `PRODUCT.SEARCH`
- Affected file: `src/main/ipc/controllers/product.controller.ts`

### Receipt UI Uplift
- Complete redesign of receipt HTML in `src/main/services/receipt.service.ts`
- **Thermal (58mm/80mm)**: Brand header, meta info rows, dashed dividers, styled item table, grand total with accent color
- **A4**: Full layout with brand header + divider line, gray meta info panel, styled item table, right-aligned totals with red total box, payments section, notes styling, footer
- Both sizes include add-on items with proper indentation, payment breakdown with change due

### Printer Controller Fix
- Fixed `Object has been destroyed` error in `src/main/ipc/controllers/printer.controller.ts`
- Added `once()` instead of `on()` for events, `safeClose()` helper, settled flag to prevent double-resolve, proper timer cleanup

### Browser Mode Polyfill
- Added `src/renderer/api/browserPolyfill.ts` — in-memory mock of all IPC APIs for browser dev
- Auto-login as admin (`owaiswajidkhan@gmail.com` / `Abc123@@`)
- Receipt preview opens in new browser tab
- Loaded in `src/renderer/main.tsx` (guard: only applies when `window.api` is undefined)

### electron-builder Config Fix
- Found duplicate config files: `electron-builder.yml` had `!node_modules/**/*` excluding ALL node_modules, and `asar: false`
- Rewrote `electron-builder.yml` with `asar: true` + `asarUnpack: ['node_modules/better-sqlite3/**/*']`, removed blanket exclusion
- Deleted the conflicting `electron-builder.json5` file
- Root cause: `better-sqlite3` was never included in the packaged app

### Auto-Print on Order Complete (OrdersPage)
- `src/renderer/pages/OrdersPage.tsx` — `handleStatusChange` now reads `auto_print` setting when status is `'completed'`
- `'silent'` → calls `window.api.printer.print(id, paperSize)` then shows "Order completed & receipt printed"
- `'preview'` → calls `window.api.printer.preview(id, paperSize)` then shows "Order completed"
- `'none'` (default if unset) → just shows "Order completed"

## Known Issues

- Browser mode data resets on page refresh (in-memory only)
- Print preview (Electron) opens system dialog; in browser opens new tab

## Future Work (Not in Scope)

- Recipe-based inventory deduction (requires product-ingredient linking model)
- Product image upload (schema has `image` field, no upload UI yet)
- Unit test architecture (Vitest ready)
