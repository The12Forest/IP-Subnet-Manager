'use strict';

const path           = require('path');
const fs             = require('fs');
const express        = require('express');
const db             = require('../db/schema');
const config         = require('../config');
const audit          = require('../lib/audit');
const requireAuth    = require('../middleware/auth');
const requireRole    = require('../middleware/admin');
const { cacheIcon, serveIcon } = require('../lib/iconCache');

const router  = express.Router();
const iconDir = path.join(path.resolve(config.DATA_DIR), 'uploads', 'icons');

// ── Statements ────────────────────────────────────────────────────────────────
const listProjects = db.prepare(`
  SELECT cp.id, cp.name, cp.description, cp.icon, cp.icon_url, cp.display_subnet_id,
         cp.created_at, cp.updated_at,
         s.name  AS display_subnet_name,
         s.color AS display_subnet_color,
         COUNT(DISTINCT CASE WHEN csl.host_id IS NOT NULL THEN csl.id END) AS linked_count
  FROM compose_projects cp
  LEFT JOIN subnets               s    ON s.id           = cp.display_subnet_id
  LEFT JOIN compose_service_links csl  ON csl.compose_id = cp.id
  GROUP BY cp.id
  ORDER BY s.display_order ASC, s.name ASC, cp.updated_at DESC
`);
const getProject    = db.prepare('SELECT * FROM compose_projects WHERE id = ?');
const insertProject = db.prepare(`
  INSERT INTO compose_projects (name, description, content, icon_url, display_subnet_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);
const updateProject = db.prepare(`
  UPDATE compose_projects
  SET name=?, description=?, content=?, icon_url=?, display_subnet_id=?, updated_at=datetime('now')
  WHERE id=?
`);
const clearIcon     = db.prepare("UPDATE compose_projects SET icon=NULL, icon_url=NULL, updated_at=datetime('now') WHERE id=?");
const deleteProject = db.prepare('DELETE FROM compose_projects WHERE id = ?');

const getServiceLinks    = db.prepare(`SELECT csl.service_name, csl.host_id, h.ip, h.name AS host_name, h.last_status FROM compose_service_links csl LEFT JOIN hosts h ON h.id=csl.host_id WHERE csl.compose_id=? ORDER BY csl.service_name ASC`);
const deleteServiceLinks = db.prepare('DELETE FROM compose_service_links WHERE compose_id=?');
const insertServiceLink  = db.prepare(`INSERT OR REPLACE INTO compose_service_links (compose_id, service_name, host_id, created_at) VALUES (?,?,?,datetime('now'))`);

const getHostLinks    = db.prepare(`SELECT chl.host_id, h.ip, h.name AS host_name, h.last_status, s.name AS subnet_name FROM compose_host_links chl JOIN hosts h ON h.id=chl.host_id JOIN subnets s ON s.id=h.subnet_id WHERE chl.compose_id=? ORDER BY h.ip ASC`);
const deleteHostLinks = db.prepare('DELETE FROM compose_host_links WHERE compose_id=?');
const insertHostLink  = db.prepare('INSERT OR IGNORE INTO compose_host_links (compose_id, host_id) VALUES (?,?)');

function fullProject(id) {
  const p = getProject.get(id);
  if (!p) return null;
  return { ...p, links: getServiceLinks.all(id), host_links: getHostLinks.all(id) };
}

// Download and cache icon before responding so the client sees it immediately
async function awaitIconCache(id, iconUrl) {
  if (!iconUrl || !/^https?:\/\//i.test(iconUrl)) return;
  try { await cacheIcon(id, iconUrl); } catch { /* silent — broken URL serves default */ }
}

// ── Icon serving (must be before /:id) ───────────────────────────────────────

// GET /api/v1/compose/:id/icon  — always serves a valid image (cached → default)
router.get('/:id/icon', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).end();
  serveIcon(id, res);
});

// ── Project routes ────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => res.json(listProjects.all()));

router.post('/', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  const { name, description, content, icon_url, display_subnet_id } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
  const r = insertProject.run(name.trim(), description || null, content, icon_url || null, display_subnet_id || null);
  const project = getProject.get(r.lastInsertRowid);
  audit(req.user, 'create', 'compose', project.id, { after: { name: project.name } });
  await awaitIconCache(project.id, icon_url);
  res.status(201).json(getProject.get(project.id)); // re-fetch so icon path is included
});

router.get('/:id', requireAuth, (req, res) => {
  const project = fullProject(parseInt(req.params.id, 10));
  if (!project) return res.status(404).json({ error: 'Compose project not found' });
  res.json(project);
});

router.put('/:id', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p  = getProject.get(id);
  if (!p) return res.status(404).json({ error: 'Compose project not found' });
  const { name, description, content, icon_url, display_subnet_id } = req.body || {};

  const newIconUrl = icon_url !== undefined ? (icon_url || null) : p.icon_url;
  updateProject.run(
    name        ? name.trim()               : p.name,
    description !== undefined ? description : p.description,
    content     || p.content,
    newIconUrl,
    display_subnet_id !== undefined ? (display_subnet_id || null) : p.display_subnet_id,
    id
  );

  // Re-download only if the URL actually changed — await so icon is ready on response
  if (newIconUrl && newIconUrl !== p.icon_url) await awaitIconCache(id, newIconUrl);

  audit(req.user, 'update', 'compose', id, { after: { name: name || p.name } });
  res.json(getProject.get(id));
});

router.delete('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p  = getProject.get(id);
  if (!p) return res.status(404).json({ error: 'Compose project not found' });
  // Delete any locally cached icon files for this project
  try {
    fs.readdirSync(iconDir)
      .filter(f => f.startsWith(`cmp-${id}-cached.`))
      .forEach(f => { try { fs.unlinkSync(path.join(iconDir, f)); } catch {} });
    // Also delete user-uploaded icons
    if (p.icon?.startsWith('/uploads/icons/compose-')) {
      fs.unlinkSync(path.join(path.resolve(config.DATA_DIR), p.icon.slice(1)));
    }
  } catch {}
  deleteProject.run(id);
  audit(req.user, 'delete', 'compose', id, { before: { name: p.name } });
  res.json({ ok: true });
});

// DELETE icon — remove cached icon and URL
router.delete('/:id/icon', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getProject.get(id)) return res.status(404).json({ error: 'Compose project not found' });
  try {
    fs.readdirSync(iconDir)
      .filter(f => f.startsWith(`cmp-${id}-cached.`))
      .forEach(f => { try { fs.unlinkSync(path.join(iconDir, f)); } catch {} });
  } catch {}
  clearIcon.run(id);
  res.json({ ok: true });
});

// POST /:id/icon — direct file upload (skips URL download)
router.post(
  '/:id/icon',
  requireAuth,
  requireRole('admin', 'editor'),
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: '4mb' }),
  (req, res) => {
    const id = parseInt(req.params.id, 10);
    const p  = getProject.get(id);
    if (!p) return res.status(404).json({ error: 'Compose project not found' });
    const ct  = req.headers['content-type'] || '';
    const extMap = { 'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/svg+xml':'svg','image/webp':'webp' };
    const ext = extMap[ct.split(';')[0].trim()] || 'png';
    fs.mkdirSync(iconDir, { recursive: true });
    // Remove old cached files
    try {
      fs.readdirSync(iconDir)
        .filter(f => f.startsWith(`cmp-${id}-cached.`))
        .forEach(f => { try { fs.unlinkSync(path.join(iconDir, f)); } catch {} });
    } catch {}
    const filename = `cmp-${id}-cached.${ext}`;
    fs.writeFileSync(path.join(iconDir, filename), req.body);
    // Store local path; clear icon_url since this is now a manual upload
    db.prepare("UPDATE compose_projects SET icon=?, icon_url=NULL, updated_at=datetime('now') WHERE id=?")
      .run(`/uploads/icons/${filename}`, id);
    res.json({ ok: true });
  }
);

router.put('/:id/links', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getProject.get(id)) return res.status(404).json({ error: 'Compose project not found' });
  const links = Array.isArray(req.body) ? req.body : [];
  db.transaction(() => {
    deleteServiceLinks.run(id);
    for (const l of links) { if (l.service_name) insertServiceLink.run(id, l.service_name, l.host_id || null); }
  })();
  res.json({ ok: true, links: getServiceLinks.all(id) });
});

router.put('/:id/hosts', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getProject.get(id)) return res.status(404).json({ error: 'Compose project not found' });
  const ids = Array.isArray(req.body) ? req.body.map(Number).filter(Boolean) : [];
  db.transaction(() => { deleteHostLinks.run(id); for (const h of ids) insertHostLink.run(id, h); })();
  res.json({ ok: true, host_links: getHostLinks.all(id) });
});

module.exports = router;
