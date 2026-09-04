'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { initDb } = require('../src/db');

test('initDb upgrades legacy shares without losing data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'html-share-migration-'));
  const dbPath = path.join(root, 'html-share.db');
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE TABLE shares (
      id TEXT PRIMARY KEY,
      owner_key_id INTEGER NOT NULL REFERENCES keys(id),
      type TEXT NOT NULL CHECK (type IN ('html','markdown','json','site')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      key_id INTEGER NOT NULL REFERENCES keys(id),
      created_at TEXT NOT NULL
    );
  `);
  legacy.prepare('INSERT INTO keys (key, created_at) VALUES (?, ?)').run('legacy-key', '2026-01-01T00:00:00.000Z');
  legacy.prepare("INSERT INTO shares (id, owner_key_id, type, title, content, created_at) VALUES ('legacy-id', 1, 'html', 'Legacy', '<p>kept</p>', '2026-01-01T00:00:00.000Z')").run();
  legacy.close();

  const upgraded = initDb(root);
  const columns = upgraded.prepare('PRAGMA table_info(shares)').all().map((column) => column.name);
  assert.ok(columns.includes('password_hash'));
  assert.deepEqual(
    upgraded.prepare('SELECT id, title, content, password_hash FROM shares WHERE id = ?').get('legacy-id'),
    { id: 'legacy-id', title: 'Legacy', content: '<p>kept</p>', password_hash: null }
  );
  // 旧库的 CHECK 约束已升级：text / csv 类型可以写入
  upgraded.prepare("INSERT INTO shares (id, owner_key_id, type, title, content, created_at) VALUES ('text-id', 1, 'text', 'Snippet', 'const x = 1;', '2026-01-02T00:00:00.000Z')").run();
  upgraded.prepare("INSERT INTO shares (id, owner_key_id, type, title, content, created_at) VALUES ('csv-id', 1, 'csv', 'Table', 'a,b', '2026-01-02T00:00:00.000Z')").run();
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS c FROM shares').get().c, 3);
  upgraded.close();
  fs.rmSync(root, { recursive: true, force: true });
});
