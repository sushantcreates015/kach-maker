const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'secure-access.db');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    max_devices INTEGER NOT NULL DEFAULT 1,
    duration_hours INTEGER NOT NULL DEFAULT 24,
    duration_value INTEGER NOT NULL DEFAULT 24,
    duration_unit TEXT NOT NULL DEFAULT 'hour',
    duration_minutes INTEGER NOT NULL DEFAULT 1440,
    first_login_at INTEGER,
    expires_at INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    user_agent TEXT,
    ip_hash TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    UNIQUE(user_id, device_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER,
    is_admin INTEGER NOT NULL DEFAULT 0,
    admin_username TEXT,
    device_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
if (!userColumns.includes('duration_value')) db.exec("ALTER TABLE users ADD COLUMN duration_value INTEGER NOT NULL DEFAULT 24");
if (!userColumns.includes('duration_unit')) db.exec("ALTER TABLE users ADD COLUMN duration_unit TEXT NOT NULL DEFAULT 'hour'");
if (!userColumns.includes('duration_minutes')) db.exec("ALTER TABLE users ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 1440");

db.exec(`
  UPDATE users
  SET duration_value = COALESCE(duration_value, duration_hours, 24),
      duration_unit = COALESCE(duration_unit, 'hour'),
      duration_minutes = COALESCE(duration_minutes, duration_hours * 60, 1440)
  WHERE duration_value IS NULL OR duration_unit IS NULL OR duration_minutes IS NULL;
`);

function seedAdmin(username, password) {
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (!existing) {
    db.prepare('INSERT INTO admins (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(username, bcrypt.hashSync(password, 12), now, now);
  }
}

module.exports = { db, seedAdmin };
