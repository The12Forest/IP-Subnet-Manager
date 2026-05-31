'use strict';

const https  = require('https');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const db     = require('../db/schema');
const config = require('../config');

const iconDir = path.join(path.resolve(config.DATA_DIR), 'uploads', 'icons');

// Inline default — no file-path dependency, always works
const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1e1e1e"/>
  <rect x="8"  y="28" width="10" height="8" rx="2" fill="#2496ed"/>
  <rect x="21" y="22" width="10" height="14" rx="2" fill="#2496ed"/>
  <rect x="34" y="26" width="10" height="10" rx="2" fill="#2496ed"/>
  <rect x="47" y="20" width="10" height="16" rx="2" fill="#2496ed"/>
  <path d="M6 38 Q16 34 26 38 Q36 34 46 38 Q56 34 60 38" stroke="#2496ed" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M54 20 Q60 16 62 22 Q60 26 56 24 Z" fill="#2496ed"/>
</svg>`;

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

const MAX_ICON_BYTES = 4 * 1024 * 1024; // 4 MB

// Block private / loopback / link-local IP ranges (SSRF prevention)
function isSafeHost(hostname) {
  // Block obvious local targets
  if (/^localhost$/i.test(hostname)) return false;
  if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^::1$/.test(hostname)) return false;
  return true;
}

// Download a URL and save to disk. Resolves with local file path, rejects on failure.
function download(url, destBase, hops = 0) {
  return new Promise((resolve, reject) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      reject(new Error('Not a valid http/https URL')); return;
    }
    let parsed;
    try { parsed = new URL(url); } catch { reject(new Error('Malformed URL')); return; }
    if (!isSafeHost(parsed.hostname)) {
      reject(new Error('Private/local addresses are not allowed')); return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 8000 }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && hops < 2) {
        const loc = res.headers.location;
        res.resume();
        if (!loc || !/^https?:\/\//i.test(loc)) { reject(new Error('Bad redirect')); return; }
        download(loc, destBase, hops + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return;
      }
      const ct  = (res.headers['content-type'] || 'image/png').split(';')[0].trim();
      const extMap = {
        'image/png':'png','image/jpeg':'jpg','image/gif':'gif',
        'image/svg+xml':'svg','image/webp':'webp','image/x-icon':'ico',
        'image/vnd.microsoft.icon':'ico',
      };
      const ext  = extMap[ct] || 'png';
      const dest = `${destBase}.${ext}`;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_ICON_BYTES) {
          req.destroy();
          file.destroy();
          fs.unlink(dest, () => {});
          reject(new Error('Image exceeds 4 MB limit'));
        }
      });
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

// Express handler: serve cached icon → or inline default
function serveIcon(composeId, res) {
  const local = cachedPath(composeId);
  if (local && fs.existsSync(local)) {
    return res.sendFile(local);
  }
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-store'); // don't cache the default so it updates once downloaded
  res.send(DEFAULT_SVG);
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
