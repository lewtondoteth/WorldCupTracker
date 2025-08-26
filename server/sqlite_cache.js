// SQLite schema and utility for caching last 32 players per year
// This script creates a table and provides a function to insert and fetch cached data

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'snooker_cache.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS last32 (
  year INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

function cacheLast32(year, data) {
  const stmt = db.prepare('INSERT OR REPLACE INTO last32 (year, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  stmt.run(year, JSON.stringify(data));
}

function getCachedLast32(year) {
  const row = db.prepare('SELECT data FROM last32 WHERE year = ?').get(year);
  return row ? JSON.parse(row.data) : null;
}

module.exports = {
  cacheLast32,
  getCachedLast32,
  db
};
