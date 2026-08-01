# The Hunger Zone POS — Handoff Document

## Project State

A complete offline-first Electron POS system for restaurants. **All 10 phases are implemented.** Build produces 3 clean targets.

## Tech Stack

- **Electron** + **React 19** + **TypeScript 6**
- **Vite 8** + vite-plugin-electron for build
- **Prisma 7** + **SQLite** (better-sqlite3 via `@prisma/adapter-better-sqlite3`)
- **Zustand** for state management
- **bcryptjs** for password hashing
- **electron-store** for persistent sessions
- **Zod 4** for input validation
- **Lucide React** for icons

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window creation
│   ├── database/
│   │   ├── client.ts        # PrismaClient init (adapter pattern)
│   │   └── seed.ts          # Seed admin + default data
│   ├── ipc/
│   │   ├── index.ts         # Registers all handlers
│   │   └── controllers/     # One file per domain (15 handlers)
│   ├── services/
│   │   ├── receipt.service.ts  # HTML receipt generation (58mm/80mm/A4)
│   │   ├── audit.service.ts    # Centralized audit logging
│   │   └── sync/               # SyncService stub (future cloud)
│   ├── validation/
│   │   ├── schemas.ts          # Zod validation schemas
│   │   └── validate.ts         # Validation helper
│   └── repositories/        # Base repository pattern
├── preload/
│   └── index.ts             # contextBridge API exposure
├── renderer/
│   ├── main.tsx
│   ├── App.tsx              # Auth gating
│   ├── components/
│   │   ├── AppShell.tsx     # Main layout + routing
│   │   ├── Sidebar.tsx      # Navigation with Lucide icons
│   │   ├── ToastContainer.tsx  # Toast notification system
│   │   └── ChangePasswordModal.tsx
│   ├── pages/               # 12 route pages
│   ├── stores/              # Zustand stores (auth, cart, toast, UI)
│   └── styles/global.css
└── shared/
    ├── types/
    ├── interfaces/          # IPC_CHANNELS, IRepository
    └── constants/theme.ts   # #C82625, #010202, #FFFFFF
```

## Database — 18 Tables (Prisma schema in `prisma/schema.prisma`)

| Table | Key Relationships |
|-------|------------------|
| User | belongsTo Role, hasMany Order |
| Role | hasMany User |
| DineTable | hasMany Order |
| Customer | hasMany Order |
| Category | hasMany Product |
| Product | belongsTo Category, hasMany ProductVariant, many-to-many AddOn via ProductAddOn |
| ProductVariant | belongsTo Product |
| AddOn | many-to-many Product via ProductAddOn |
| ProductAddOn | junction (composite PK) |
| Order | belongsTo User, Customer?, DineTable?; hasMany OrderItem, Payment |
| OrderItem | belongsTo Order, Product; optional belongsTo ProductVariant; many-to-many AddOn via OrderItemAddOn |
| OrderItemAddOn | junction (composite PK) |
| Payment | belongsTo Order |
| InventoryItem | hasMany StockTransaction |
| StockTransaction | belongsTo InventoryItem |
| Setting | key-value store |
| Printer | standalone (CRUD) |
| AuditLog | standalone |

All entities have: `id` (UUID), `createdAt`, `updatedAt`, `deletedAt` (soft delete).

## Auth

- Default admin: `owaiswajidkhan@gmail.com` / `Abc123@@` (bcrypt-hashed)
- Persistent session via `electron-store` (encrypted)
- Roles: Admin, Manager, Cashier
- Password change supported

## IPC Channels (all exposed via `window.api`)

| Module | Channels |
|--------|----------|
| auth | login, logout, getSession, changePassword |
| category | list, get, create, update, delete |
| product | list, get, create, update, delete, search |
| variant | list, create, update, delete |
| addon | list, create, update, delete |
| table | list, create, update, delete, updateStatus |
| order | create, get, list, updateStatus, recent |
| payment | create, list |
| customer | list, get, create, update |
| employee | list, create, update, delete |
| roles | list |
| settings | getAll, get, set |
| printer | list, create, update, delete, print, test, preview |
| backup | create, restore, list |
| report | sales, productSales, categorySales, exportCsv, exportPdf |
| dashboard | getStats |
| inventory | list, create, stockIn, stockOut |

## Pages / Routes

| Route | Status | Key Features |
|-------|--------|-------------|
| Dashboard | ✅ | Stats cards (today/month sales, orders), recent orders table |
| POS Terminal | ✅ | Product grid, category filter, search, product modal (variant+addon), cart, table picker, checkout, auto-print, keyboard shortcuts (F1-F6) |
| Tables | ✅ | Grid view, add/delete, toggle free/reserved, immediate refresh |
| Orders | ✅ | List with status, detail modal, status actions, print/preview receipt |
| Menu | ✅ | 7 categories, 45+ products, Cheese/Pepperoni add-ons, product-addon linking |
| Categories | ✅ | CRUD with inline editing, toast error handling |
| Products | ✅ | List + create/edit form (ProductFormPage) + VariantsManager |
| Add-ons | ✅ | CRUD |
| Customers | ✅ | Add, list, view purchase history |
| Employees | ✅ | Add with role, list, delete |
| Inventory | ✅ | Add items, stock in/out, low-stock alerts (AlertTriangle icon) |
| Reports | ✅ | Date range filter, sales overview, product sales, CSV/PDF export |
| Settings | ✅ | Restaurant profile, tax, currency, paper size, auto-print, receipt footer, printer config, backup/restore |

## Implemented Phases (All 10 Complete)

| Phase | Features |
|-------|----------|
| **1. Foundation** | Electron + React + Vite + Prisma 7, Clean Architecture, typed IPC bridge |
| **2. Auth & Shell** | Login, bcrypt, persistent session, password change, sidebar with 12 routes |
| **3. Menu** | Categories, Products, Variants, Add-ons, product-addon linking |
| **4. POS & Orders** | Product grid, category filter, search, cart, variant+addon selection, checkout, order list |
| **5. Billing & Printer** | Receipt service (58mm/80mm/A4 HTML templates), printer CRUD, silent print, print preview, reprint, auto-print on checkout, test print |
| **6. Customers & Employees** | Customer CRUD + purchase history, Employee CRUD with roles |
| **7. Inventory** | Items CRUD, stock in/out, low-stock alerts |
| **8. Dashboard & Reports** | Stats cards, recent orders, sales/product reports, CSV + PDF export |
| **9. Settings & Backup** | Restaurant profile, paper size, auto-print, printer config, backup/restore database |
| **10. Security & Polish** | Zod validation on critical inputs, centralized audit logging (logAudit service), keyboard shortcuts (F1-F6 on POS), touch-friendly buttons, purchase history per customer |

## Color Theme
- Primary: `#C82625`
- Dark: `#010202`
- White: `#FFFFFF`

## Running

### First-time setup (Windows):
```powershell
npm.cmd install
npm.cmd install-scripts approve @prisma/engines better-sqlite3 esbuild prisma electron-winstaller
npx.cmd @electron/rebuild
npx.cmd prisma generate
```

### Dev:
```bash
start.bat              # Windows (double-click) — handles install + schema push + launch
npm run dev             # Dev mode (Vite + Electron)
```

### Build & check:
```bash
npm run build            # Production build (3 targets)
npm run dist             # Package with electron-builder
npm run typecheck        # tsc --noEmit
```

Login: `owaiswajidkhan@gmail.com` / `Abc123@@`

## Key Env

- `.env` — `DATABASE_URL="file:./pos.db"` (used only by Prisma studio)
- Runtime DB: `app.getPath('userData')/pos.db` (e.g. `%APPDATA%\the-hunger-zone-pos\pos.db` on Windows)
- index.html at project root, script src points to `./src/renderer/main.tsx`

## Important Notes

1. **Prisma 7 adapter pattern** — uses `@prisma/adapter-better-sqlite3` with constructor option
2. **No routing library** — simple page switching via `currentPage` state
3. **DineTable auto-management** — placing order with tableId marks table "occupied"; completing/cancelling marks "free"
4. **SyncService** is a stub — ready for future cloud sync
5. **Soft delete** — `@unique` removed from `DineTable.number`, `Category.name`, `InventoryItem.name` so deleted records don't block reuse
6. **No emojis** — all replaced with Lucide React icons
7. **Form fields** — all have visible `<label>` elements
8. **Errors** — shown as toasts (top-right, auto-dismiss, colored by type), never `alert()`
9. **Session validation** — startup checks `userId` exists in DB; clears if stale
10. **Tax = 0 by default** — set in Settings page
11. **Windows native modules** — `better-sqlite3` must be rebuilt for Electron via `npx @electron/rebuild` after `npm install`
12. **Auto schema push** — `src/main/index.ts` calls `ensureSchema()` on startup which auto-runs `prisma db push` if the database file doesn't exist (dev only)
13. **npm install-scripts** — npm v11 on Windows requires explicitly approving install scripts for native packages (`better-sqlite3`, `@prisma/engines`, `esbuild`, `prisma`)

## New Files Added This Session

| File | Purpose |
|------|---------|
| `src/main/services/receipt.service.ts` | Generate HTML receipts for 58mm/80mm/A4 |
| `src/main/services/audit.service.ts` | Centralized audit log helper |
| `src/main/validation/schemas.ts` | Zod validation schemas for all inputs |
| `src/main/validation/validate.ts` | Validation wrapper with error formatting |
| `src/main/ipc/controllers/printer.controller.ts` | Printer CRUD + print/test/preview IPC |
| `src/main/ipc/controllers/backup.controller.ts` | Database backup/restore IPC |
| `start.bat` | Windows launcher — installs deps, pushes schema, starts dev |
| `menu.md` | Full restaurant menu — categories, products, prices, add-ons |

## Remaining / Future

- Recipe-based inventory deduction (requires product-ingredient linking)
- Product image upload (schema has `image` field, no upload UI yet)
