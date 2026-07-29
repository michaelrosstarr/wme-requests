'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

/**
 * Initialise (or reuse) the SQLite database connection and run migrations.
 * @param {string} [dbPath] - Override the database file path (useful for tests).
 * @returns {Database.Database}
 */
function getDb(dbPath) {
  if (db) return db;

  const filePath = dbPath || process.env.DATABASE_PATH || path.join(__dirname, '../../data/wme-requests.db');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  return db;
}

/**
 * Close the database connection (mainly used in tests).
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run all schema migrations in order.
 * @param {Database.Database} database
 */
function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS countries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      code       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      country_id  INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      label       TEXT    NOT NULL,
      platform    TEXT    NOT NULL CHECK(platform IN ('slack', 'discord', 'telegram')),
      event_type  TEXT    NOT NULL CHECK(event_type IN ('global', 'downlock', 'imagery')),
      webhook_url TEXT,
      bot_token   TEXT,
      chat_id     TEXT,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS requests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      country_id   INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      type         TEXT    NOT NULL CHECK(type IN ('downlock', 'imagery')),
      permalink    TEXT    NOT NULL,
      lock_level   INTEGER,
      status       TEXT    NOT NULL DEFAULT 'pending'
                           CHECK(status IN ('pending', 'in_progress', 'completed', 'rejected')),
      notes        TEXT,
      submitted_by TEXT,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_requests_country_id ON requests(country_id);
    CREATE INDEX IF NOT EXISTS idx_requests_type       ON requests(type);
    CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(status);
    CREATE INDEX IF NOT EXISTS idx_channels_country_id ON notification_channels(country_id);
  `);
}

module.exports = { getDb, closeDb };
