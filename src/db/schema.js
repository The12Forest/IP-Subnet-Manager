'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dataDir = path.resolve(config.DATA_DIR);
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'subnet-manager.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    description TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer'
                  CHECK(role IN ('admin', 'editor', 'viewer')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS subnets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    network       TEXT    NOT NULL,
    cidr          INTEGER NOT NULL DEFAULT 24,
    description   TEXT,
    color         TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS hosts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    subnet_id     INTEGER NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
    ip            TEXT    NOT NULL UNIQUE,
    name          TEXT,
    description   TEXT,
    notes         TEXT,
    type          TEXT    NOT NULL DEFAULT 'container'
                  CHECK(type IN ('server', 'container', 'reserved', 'other')),
    check_port    INTEGER,
    check_enabled INTEGER NOT NULL DEFAULT 1,
    last_seen     TEXT,
    last_status   TEXT    NOT NULL DEFAULT 'unknown'
                  CHECK(last_status IN ('online', 'offline', 'unknown')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username    TEXT,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compose_projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    content     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compose_service_links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    compose_id   INTEGER NOT NULL REFERENCES compose_projects(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    host_id      INTEGER REFERENCES hosts(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(compose_id, service_name)
  );

  CREATE TABLE IF NOT EXISTS compose_subnet_links (
    compose_id INTEGER NOT NULL REFERENCES compose_projects(id) ON DELETE CASCADE,
    subnet_id  INTEGER NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
    PRIMARY KEY (compose_id, subnet_id)
  );
`);

module.exports = db;
