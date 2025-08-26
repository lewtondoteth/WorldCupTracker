// competitor_db.js
// Handles player and competitor tables for the snooker competition

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'snooker_cache.db');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
export function initTables() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS player (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS competitor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS competitor_assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      FOREIGN KEY (competitor_id) REFERENCES competitor(id),
      FOREIGN KEY (player_id) REFERENCES player(id)
    )`);
  });
}

// Add a competitor
export function addCompetitor(name, cb) {
  db.run('INSERT INTO competitor (name) VALUES (?)', [name], function(err) {
    cb(err, this ? this.lastID : null);
  });
}

// Assign a player to a competitor for a year
export function assignPlayer(competitor_id, player_id, year, cb) {
  db.run('INSERT INTO competitor_assignment (competitor_id, player_id, year) VALUES (?, ?, ?)', [competitor_id, player_id, year], cb);
}

// Get all players assigned to a competitor for a year
export function getCompetitorPlayers(competitor_id, year, cb) {
  db.all('SELECT player_id FROM competitor_assignment WHERE competitor_id = ? AND year = ?', [competitor_id, year], cb);
}

// Get all competitors and their players for a year
export function getAllAssignments(year, cb) {
  db.all(`SELECT c.name as competitor, p.name as player, ca.year FROM competitor_assignment ca
    JOIN competitor c ON ca.competitor_id = c.id
    JOIN player p ON ca.player_id = p.id
    WHERE ca.year = ?`, [year], cb);
}
