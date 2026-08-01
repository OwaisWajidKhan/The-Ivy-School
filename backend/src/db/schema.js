const fs = require('fs');
const config = require('../config');
const { db } = require('./client');

// Keep data/upload directories available for local (file-based) mode.
// Schema creation + migrations now live in client.js (ensureSchema).
if (!process.env.TURSO_DATABASE_URL) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

async function getSetting(key, def = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

async function setSetting(key, value) {
  await db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')'
  ).run(key, value);
}

module.exports = { db, getSetting, setSetting };
