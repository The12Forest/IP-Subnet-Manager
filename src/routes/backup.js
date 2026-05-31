'use strict';

const express = require('express');
const fs      = require('fs');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');
const audit       = require('../lib/audit');
const {
  createBackup, listBackups, pruneBackups, deleteBackup, backupPath
} = require('../lib/backup');
const db = require('../db/schema');

const router = express.Router();

const SAFE_NAME = /^backup-[\dT-]+\.db$/;

const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

// List backups
router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  res.json(listBackups());
});

// Trigger manual backup
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const maxCount = parseInt(
    db.prepare("SELECT value FROM settings WHERE key='backup_max_count'").get()?.value || '7', 10
  );
  try {
    const dest = await createBackup();
    pruneBackups(maxCount);
    upsertSetting.run('backup_last_run', new Date().toISOString());
    const backups = listBackups();
    audit(req.user, 'create', 'backup', null, { file: require('path').basename(dest) });
    res.json({ ok: true, count: backups.length, latest: require('path').basename(dest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download a backup
router.get('/:name', requireAuth, requireRole('admin'), (req, res) => {
  const { name } = req.params;
  if (!SAFE_NAME.test(name)) return res.status(400).json({ error: 'Invalid backup name' });
  const file = backupPath(name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.download(file, name);
});

// Delete a backup
router.delete('/:name', requireAuth, requireRole('admin'), (req, res) => {
  const { name } = req.params;
  if (!SAFE_NAME.test(name)) return res.status(400).json({ error: 'Invalid backup name' });
  try {
    deleteBackup(name);
    audit(req.user, 'delete', 'backup', null, { file: name });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;
