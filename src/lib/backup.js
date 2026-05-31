'use strict';

const path   = require('path');
const fs     = require('fs');
const db     = require('../db/schema');
const config = require('../config');

const backupDir = path.join(path.resolve(config.DATA_DIR), 'backups');

const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

async function createBackup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest  = path.join(backupDir, `backup-${stamp}.db`);
  await db.backup(dest);
  return dest;
}

function listBackups() {
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    return fs.readdirSync(backupDir)
      .filter(f => /^backup-[\dT-]+\.db$/.test(f))
      .map(f => {
        const full = path.join(backupDir, f);
        const stat = fs.statSync(full);
        return { name: f, size: stat.size, created_at: stat.mtimeMs };
      })
      .sort((a, b) => b.created_at - a.created_at) // newest first
      .map(b => ({ ...b, created_at: new Date(b.created_at).toISOString() }));
  } catch { return []; }
}

function pruneBackups(maxCount) {
  if (!maxCount || maxCount <= 0) return;
  const all = listBackups(); // newest first
  const toDelete = all.slice(maxCount);
  for (const b of toDelete) {
    try { fs.unlinkSync(path.join(backupDir, b.name)); } catch {}
  }
}

function deleteBackup(name) {
  fs.unlinkSync(path.join(backupDir, name));
}

function backupPath(name) {
  return path.join(backupDir, name);
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

function startBackupScheduler() {
  setInterval(async () => {
    if (getSetting('backup_enabled') !== 'true') return;

    const intervalHours = parseFloat(getSetting('backup_interval_hours') || '24');
    const lastRun       = getSetting('backup_last_run');
    if (lastRun) {
      const hoursSince = (Date.now() - new Date(lastRun).getTime()) / 3_600_000;
      if (hoursSince < intervalHours) return;
    }

    const maxCount = parseInt(getSetting('backup_max_count') || '7', 10);
    try {
      await createBackup();
      pruneBackups(maxCount);
      upsertSetting.run('backup_last_run', new Date().toISOString());
      console.log('[backup] Automatic backup complete');
    } catch (err) {
      console.error('[backup] Failed:', err.message);
    }
  }, 3_600_000); // evaluate once per hour
}

module.exports = { createBackup, listBackups, pruneBackups, deleteBackup, backupPath, startBackupScheduler };
