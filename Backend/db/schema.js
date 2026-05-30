const db = require('./index');

const createSchema = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',   -- 'admin' | 'editor' | 'viewer'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS subnets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      network TEXT NOT NULL,                 -- e.g. "10.10.1.0"
      cidr INTEGER NOT NULL DEFAULT 24,
      description TEXT,
      color TEXT,                            -- hex, used for a subtle accent (NOT left border)
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subnet_id INTEGER NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
      ip TEXT NOT NULL UNIQUE,
      name TEXT,
      description TEXT,
      notes TEXT,                            -- markdown, shown as expandable tooltip
      type TEXT DEFAULT 'container',         -- 'server' | 'container' | 'reserved' | 'other'
      check_port INTEGER,
      check_enabled INTEGER DEFAULT 1,
      last_seen DATETIME,
      last_status TEXT DEFAULT 'unknown',    -- 'online' | 'offline' | 'unknown'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      action TEXT NOT NULL,                  -- 'create' | 'update' | 'delete'
      target_type TEXT,                      -- 'host' | 'subnet' | 'user' | 'setting'
      target_id TEXT,
      details TEXT,                          -- JSON string with before/after
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        console.error('Error creating schema:', err);
        reject(err);
      } else {
        console.log('Database schema checked/created successfully.');
        resolve();
      }
    });
  });
};

module.exports = createSchema;
