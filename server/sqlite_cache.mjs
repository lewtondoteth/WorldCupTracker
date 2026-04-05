import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'snooker_cache.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS last32 (
  year INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_players (
  year INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);


export function cacheLast32(year, data) {
  console.log('[cacheLast32] called for year', year, 'data.length:', Array.isArray(data) ? data.length : typeof data);
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO last32 (year, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    stmt.run(year, JSON.stringify(data));
    console.log('[cacheLast32] success for year', year);
  } catch (e) {
    console.error('[cacheLast32] error:', e);
  }
}


export function getCachedLast32(year) {
  try {
    const row = db.prepare('SELECT data FROM last32 WHERE year = ?').get(year);
    if (row) {
      console.log('[getCachedLast32] cache hit for year', year);
      return JSON.parse(row.data);
    } else {
      console.log('[getCachedLast32] cache miss for year', year);
      return null;
    }
  } catch (e) {
    console.error('[getCachedLast32] error:', e);
    return null;
  }
}

export function cacheEventPlayers(year, data) {
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO event_players (year, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
    stmt.run(year, JSON.stringify(data));
  } catch (e) {
    console.error("[cacheEventPlayers] error:", e);
  }
}

export function getCachedEventPlayers(year) {
  try {
    const row = db.prepare("SELECT data FROM event_players WHERE year = ?").get(year);
    return row ? JSON.parse(row.data) : null;
  } catch (e) {
    console.error("[getCachedEventPlayers] error:", e);
    return null;
  }
}

export { db };
