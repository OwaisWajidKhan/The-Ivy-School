const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { db, getSetting } = require('./db/schema');
const errorHandler = require('./middleware/errorHandler');

// In packaged (hidden-window) mode, mirror console output to a log file for support.
if (config.packaged) {
  const logFile = require('fs').createWriteStream(require('path').join(config.dataDir, 'server.log'), { flags: 'a' });
  const write = (line) => { const s = `[${new Date().toISOString()}] ${line}\n`; try { logFile.write(s); } catch (e) {} };
  ['log', 'info', 'warn', 'error'].forEach((m) => {
    const orig = console[m].bind(console);
    console[m] = (...args) => { write(args.map(String).join(' ')); orig(...args); };
  });
}

// Auto-seed on first run (empty database) so the packaged exe works with no seed step.
try {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (!row || row.c === 0) {
    console.log('Empty database detected — seeding...');
    require('./db/seed')();
  } else {
    // Upgrade existing databases with Phase 2 reference data (idempotent).
    require('./db/seed').ensurePhase2ReferenceData();
  }
} catch (e) {
  console.log('Seed check skipped:', e.message);
}

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(config.uploadDir));

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
  '/api/leaves': require('./routes/leaves'),
  '/api/payroll': require('./routes/payroll'),
  '/api/reports': require('./routes/reports'),
  '/api/devices': require('./routes/devices'),
  '/api/dashboard': require('./routes/dashboard'),
  '/api/notifications': require('./routes/notifications'),
  '/api/admin': require('./routes/admin'),
  '/api/reference': require('./routes/reference'),
  '/api/gate-passes': require('./routes/gatePasses'),
  '/api/cards': require('./routes/cards'),
  '/api/hr': require('./routes/hr')
};

for (const [path, router] of Object.entries(routes)) {
  app.use(path, path.includes('auth') ? authLimiter : (req, res, next) => next(), router);
}

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    time: new Date().toISOString(),
    school: getSetting('school_name', 'School Attendance System')
  });
});

// Serve the built frontend (single-process app) when dist exists.
// index.html is served WITHOUT cache so updates are picked up immediately;
// hashed assets (assets/*) get a long cache lifetime.
if (fs.existsSync(config.frontendDir)) {
  app.use(express.static(config.frontendDir, { maxAge: '1d', index: false }));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(config.frontendDir, 'index.html'));
  });
  console.log(`Serving frontend from ${config.frontendDir}`);
}

app.use(errorHandler.notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`School Attendance API running on http://localhost:${config.port}`);
  console.log(`School: ${getSetting('school_name', 'School Attendance System')}`);
  console.log(`Health check: http://localhost:${config.port}/api/health`);
});

module.exports = app;
