'use strict';

const express     = require('express');
const db          = require('../db/schema');
const audit       = require('../lib/audit');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');

const router = express.Router();

const ENV_KEY_MAP = {
  check_interval:  'CHECK_INTERVAL',
  check_enabled:   'CHECK_ENABLED',
  check_timeout:   'CHECK_TIMEOUT',
  max_users:       'MAX_USERS',
  session_timeout: 'SESSION_TIMEOUT',
};

function isLockedByEnv(key) {
  const envKey = ENV_KEY_MAP[key] || key.toUpperCase();
  return envKey in process.env;
}

const listSettings = db.prepare('SELECT * FROM settings ORDER BY key ASC');
const getSetting   = db.prepare('SELECT * FROM settings WHERE key = ?');
const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

router.get('/', requireAuth, (req, res) => {
  const rows = listSettings.all();
  const result = rows.map(r => ({
    ...r,
    locked: isLockedByEnv(r.key),
  }));
  res.json(result);
});

router.get('/:key', requireAuth, (req, res) => {
  const row = getSetting.get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Setting not found' });
  res.json({ ...row, locked: isLockedByEnv(row.key) });
});

router.put('/:key', requireAuth, requireRole('admin'), (req, res) => {
  const { key } = req.params;
  const { value } = req.body || {};

  if (value === undefined) {
    return res.status(400).json({ error: 'value is required' });
  }

  if (isLockedByEnv(key)) {
    return res.status(403).json({ error: 'This setting is locked by an environment variable' });
  }

  const existing = getSetting.get(key);
  upsertSetting.run(key, String(value));
  const updated = getSetting.get(key);

  audit(req.user, 'update', 'setting', key, {
    before: existing ? existing.value : null,
    after: String(value),
  });

  res.json(updated);
});

// Bulk update
router.put('/', requireAuth, requireRole('admin'), (req, res) => {
  const updates = req.body || {};
  const results = {};
  const bulkUpdate = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (isLockedByEnv(key)) continue;
      upsertSetting.run(key, String(value));
      audit(req.user, 'update', 'setting', key, { after: String(value) });
      results[key] = String(value);
    }
  });
  bulkUpdate();
  res.json({ ok: true, updated: results });
});

module.exports = router;
