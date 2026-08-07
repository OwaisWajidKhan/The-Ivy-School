const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { getSetting } = require('./db/schema');
const { ensureReady } = require('./db/client');
const storageService = require('./services/storageService');
const errorHandler = require('./middleware/errorHandler');

const VERCEL = process.env.VERCEL === '1';

// In packaged (hidden-window) mode, mirror console output to a log file for support.
if (config.packaged) {
  const logFile = require('fs').createWriteStream(require('path').join(config.dataDir, 'server.log'), { flags: 'a' });
  const write = (line) => { const s = `[${new Date().toISOString()}] ${line}\n`; try { logFile.write(s); } catch (e) {} };
  ['log', 'info', 'warn', 'error'].forEach((m) => {
    const orig = console[m].bind(console);
    console[m] = (...args) => { write(args.map(String).join(' ')); orig(...args); };
  });
}

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Async readiness gate: waits for schema + auto-seed + Phase-2 reference data
// before handling requests. Local mode also awaits ensureReady() before
// app.listen(), so here it resolves instantly; serverless cold starts (Vercel)
// rely on this middleware to avoid racing the one-time init. /api/health is
// exempt so it can always report the DB backend / errors instead of 500ing.
app.use(async (req, res, next) => {
  if (req.path === '/api/health') return next();
  try {
    await ensureReady();
    next();
  } catch (e) {
    next(e);
  }
});

if (!VERCEL) {
  app.use('/uploads', express.static(config.uploadDir));
} else {
  app.get('/uploads/*splat', async (req, res, next) => {
    try {
      await storageService.serveUpload(req, res, `/uploads/${req.params.splat || ''}`);
    } catch (e) {
      next(e);
    }
  });
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' }
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later' }
});

const routes = {
  '/api/auth': require('./routes/auth'),
  '/api/students': require('./routes/students'),
  '/api/employees': require('./routes/employees'),
  '/api/attendance': require('./routes/attendance'),
  '/api/reports': require('./routes/reports'),
  '/api/dashboard': require('./routes/dashboard'),
  '/api/notifications': require('./routes/notifications'),
  '/api/admin': require('./routes/admin'),
  '/api/reference': require('./routes/reference'),
  '/api/cards': require('./routes/cards'),
  '/api/access': require('./routes/access')
};

// Fail loudly when a serverless deployment has no serverless DB: Vercel's
// function filesystem is read-only, so the local node:sqlite backend cannot
// create its file there and every DB request would 500 with a generic error.
if (VERCEL && !process.env.TURSO_DATABASE_URL) {
  console.error('[CONFIG] VERCEL=1 but TURSO_DATABASE_URL is not set — ' +
    'the local SQLite backend cannot write on Vercel. Set TURSO_DATABASE_URL ' +
    'and TURSO_AUTH_TOKEN to a Turso (libsql) database, or /api/* will 500.');
}

for (const [mount, router] of Object.entries(routes)) {
  app.use(mount, mount.includes('auth') ? authLimiter : (req, res, next) => next(), router);
}

app.get('/api/health', async (req, res) => {
  const { db, ensureReady } = require('./db/client');
  const backend = db.backend();
  let ready = false;
  let school = null;
  let dbError = null;
  try {
    await ensureReady();
    ready = true;
    school = await getSetting('school_name', 'School Attendance System');
  } catch (e) {
    dbError = String((e && e.message) || e);
  }
  const configError =
    VERCEL && backend === 'local'
      ? 'VERCEL=1 but TURSO_DATABASE_URL is not set — the local SQLite backend cannot write on Vercel. Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.'
      : null;
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    school,
    db: backend,
    vercel: VERCEL,
    ...(configError ? { configError } : {}),
    ...(dbError ? { dbError } : {})
  });
});

// Serve the built frontend (single-process app) when dist exists.
// Not used on Vercel — the static build is served by Vercel's CDN instead.
if (!VERCEL && fs.existsSync(config.frontendDir)) {
  app.use(express.static(config.frontendDir, { maxAge: '1d', index: false }));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(config.frontendDir, 'index.html'));
  });
  console.log(`Serving frontend from ${config.frontendDir}`);
}

app.use(errorHandler.notFound);
app.use(errorHandler);

// Long-running processes (dev, Docker, packaged exe) start the HTTP server here.
// Vercel ignores this branch; the api/ serverless entry awaits ensureReady() itself.
if (!VERCEL) {
  ensureReady().then(() => {
    app.listen(config.port, () => {
      console.log(`School Attendance API running on http://localhost:${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/api/health`);
    });
  }).catch((e) => {
    console.error('Startup failed:', e);
    process.exit(1);
  });
}

module.exports = app;
