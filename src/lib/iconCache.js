'use strict';

const https  = require('https');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const db     = require('../db/schema');
const config = require('../config');

const iconDir    = path.join(path.resolve(config.DATA_DIR), 'uploads', 'icons');
const defaultImg = path.join(__dirname, '../public/icons/icon-192.svg');

const updateIconStmt = db.prepare(
  "UPDATE compose_projects SET icon=?, updated_at=datetime('now') WHERE id=?"
);

// Return the absolute filesystem path of the cached icon for a project, or null
function cachedPath(composeId) {
  try {
    const files = fs.readdirSync(iconDir)
      .filter(f => f.startsWith(`cmp-${composeId}-cached.`));
    if (files.length) return path.join(iconDir, files[0]);
  } catch {}
  return null;
}

// Delete any previously cached icon for this project
function deleteCached(composeId) {
  try {
    fs.readdirSync(iconDir)
      .filter(f => f.startsWith(`cmp-${composeId}-cached.`))
      .forEach(f => { try { fs.unlinkSync(path.join(iconDir, f)); } catch {} });
  } catch {}
}

// Download a URL and save to disk. Resolves with local file path, rejects on failure.
function download(url, destBase) {
  return new Promise((resolve, reject) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      reject(new Error('Not a valid http/https URL'));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 8000 }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Single redirect follow
        download(res.headers.location, destBase).then(resolve).catch(reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const ct  = (res.headers['content-type'] || 'image/png').split(';')[0].trim();
      const extMap = {
        'image/png':    'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
        'image/svg+xml':'svg', 'image/webp': 'webp','image/x-icon':'ico',
        'image/vnd.microsoft.icon': 'ico',
      };
      const ext  = extMap[ct] || 'png';
      const dest = `${destBase}.${ext}`;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
  });
}

// Download icon_url for a compose project and cache it. Updates `icon` in DB.
async function cacheIcon(composeId, iconUrl) {
  const destBase = path.join(iconDir, `cmp-${composeId}-cached`);
  deleteCached(composeId);
  const dest = await download(iconUrl, destBase);
  const relativePath = `/uploads/icons/${path.basename(dest)}`;
  updateIconStmt.run(relativePath, composeId);
  return relativePath;
}

// Express handler: serve cached icon → or default image
function serveIcon(composeId, res) {
  const local = cachedPath(composeId);
  if (local && fs.existsSync(local)) {
    return res.sendFile(local);
  }
  // Fallback to built-in default
  res.sendFile(defaultImg);
}

// Background job: re-download all icon_url values and refresh the cache
async function refreshAllIcons() {
  const projects = db.prepare(
    "SELECT id, icon_url FROM compose_projects WHERE icon_url IS NOT NULL AND icon_url != ''"
  ).all();
  for (const p of projects) {
    try {
      await cacheIcon(p.id, p.icon_url);
    } catch (err) {
      // Failure is silent — serve the existing cached file (or default)
    }
  }
}

function startIconRefreshScheduler() {
  // Initial download 15 s after startup so it doesn't slow boot
  setTimeout(() => refreshAllIcons().catch(() => {}), 15_000);
  // Re-check every 6 hours
  setInterval(() => refreshAllIcons().catch(() => {}), 6 * 3_600_000);
}

module.exports = { cacheIcon, serveIcon, startIconRefreshScheduler };
