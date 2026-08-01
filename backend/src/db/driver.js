// Unified SQLite driver.
// - Under plain Node: uses the built-in node:sqlite (DatabaseSync).
// - Under a Bun-compiled executable: uses bun:sqlite (Database).
// Both expose a compatible statement API (.run/.get/.all) and lastInsertRowid.

let DatabaseImpl = null;
let driverName = null;

try {
  const { DatabaseSync } = require('node:sqlite');
  DatabaseImpl = DatabaseSync;
  driverName = 'node:sqlite';
} catch (e) {
  try {
    const { Database } = require('bun:sqlite');
    DatabaseImpl = Database;
    driverName = 'bun:sqlite';
  } catch (e2) {
    throw new Error('No SQLite driver available (tried node:sqlite and bun:sqlite)');
  }
}

module.exports = { DatabaseSync: DatabaseImpl, driverName };
