require('dotenv').config();
const path = require('path');
const os = require('os');

// Detect a Bun-compiled standalone executable (set via --define at compile time).
const PACKAGED = process.env.IVY_PACKAGED === '1';

function dataDir() {
  if (process.env.IVY_DATA_DIR) return process.env.IVY_DATA_DIR;
  if (PACKAGED) {
    return path.join(process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir(), 'TheIvySchool');
  }
  return path.join(__dirname, '..', 'data');
}

const exeDir = path.dirname(process.execPath);

module.exports = {
  env: process.env.NODE_ENV || 'development',
  packaged: PACKAGED,
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-super-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10),
  dataDir: dataDir(),
  dbFile: process.env.DB_FILE || path.join(dataDir(), 'school.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(dataDir(), 'uploads'),
  // Built frontend to serve from the same process (empty when not present).
  frontendDir: PACKAGED
    ? path.join(exeDir, 'app')
    : path.join(__dirname, '..', '..', 'frontend', 'dist'),
  duplicateScanWindowSec: parseInt(process.env.DUPLICATE_SCAN_WINDOW_SEC || '30', 10),
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  emailEnabled: process.env.EMAIL_ENABLED === 'true',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  sms: {
    // Attendance SMS (Branded SMS Pakistan / app.brandedsmspakistan.com).
    // Credentials come ONLY from env (never baked into source). When unset,
    // SMS is disabled. Set SMS_EMAIL/SMS_KEY/SMS_MASK on production .env.
    enabled: process.env.SMS_ENABLED === 'true',
    url: process.env.SMS_API_URL || 'https://app.brandedsmspakistan.com/api/send',
    email: process.env.SMS_EMAIL || '',
    key: process.env.SMS_KEY || '',
    mask: process.env.SMS_MASK || ''
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5000'
};

