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

CREATE TABLE IF NOT EXISTS season_events (
  season INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS head_to_head (
  cache_key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_snapshots (
  year INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

function isFresh(updatedAt, maxAgeSeconds) {
  if (!updatedAt || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    return false;
  }

  const parsed = Date.parse(updatedAt.endsWith("Z") ? updatedAt : `${updatedAt}Z`);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return (Date.now() - parsed) / 1000 <= maxAgeSeconds;
}


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

export function cacheSeasonEvents(season, data) {
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO season_events (season, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
    stmt.run(season, JSON.stringify(data));
  } catch (e) {
    console.error("[cacheSeasonEvents] error:", e);
  }
}

export function getCachedSeasonEvents(season, maxAgeSeconds = 86400) {
  try {
    const row = db.prepare("SELECT data, updated_at FROM season_events WHERE season = ?").get(season);
    return row && isFresh(row.updated_at, maxAgeSeconds) ? JSON.parse(row.data) : null;
  } catch (e) {
    console.error("[getCachedSeasonEvents] error:", e);
    return null;
  }
}

export function cacheHeadToHead(cacheKey, data) {
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO head_to_head (cache_key, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
    stmt.run(cacheKey, JSON.stringify(data));
  } catch (e) {
    console.error("[cacheHeadToHead] error:", e);
  }
}

export function getCachedHeadToHead(cacheKey, maxAgeSeconds = 86400) {
  try {
    const row = db.prepare("SELECT data, updated_at FROM head_to_head WHERE cache_key = ?").get(cacheKey);
    return row && isFresh(row.updated_at, maxAgeSeconds) ? JSON.parse(row.data) : null;
  } catch (e) {
    console.error("[getCachedHeadToHead] error:", e);
    return null;
  }
}

export function cacheTournamentSnapshot(year, data) {
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO tournament_snapshots (year, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
    stmt.run(year, JSON.stringify(data));
  } catch (e) {
    console.error("[cacheTournamentSnapshot] error:", e);
  }
}

export function getCachedTournamentSnapshot(year, maxAgeSeconds = 300) {
  try {
    const row = db.prepare("SELECT data, updated_at FROM tournament_snapshots WHERE year = ?").get(year);
    return row && isFresh(row.updated_at, maxAgeSeconds) ? JSON.parse(row.data) : null;
  } catch (e) {
    console.error("[getCachedTournamentSnapshot] error:", e);
    return null;
  }
}

export { db };
