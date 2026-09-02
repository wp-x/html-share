'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * 初始化数据目录与 SQLite 数据库。
 * 目录结构：DATA_DIR/html-share.db、DATA_DIR/sites/<shareId>/、DATA_DIR/tmp/
 */
function initDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'sites'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'tmp'), { recursive: true });

  const db = new Database(path.join(dataDir, 'html-share.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      owner_key_id INTEGER NOT NULL REFERENCES keys(id),
      type TEXT NOT NULL CHECK (type IN ('html','markdown','json','site')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT,
      password_hash TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      key_id INTEGER NOT NULL REFERENCES keys(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_key_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(key_id);
  `);

  const shareColumns = db.prepare('PRAGMA table_info(shares)').all();
  if (!shareColumns.some((column) => column.name === 'password_hash')) {
    db.exec('ALTER TABLE shares ADD COLUMN password_hash TEXT');
  }

  return db;
}

module.exports = { initDb };
