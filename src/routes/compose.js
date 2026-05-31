'use strict';

const path        = require('path');
const fs          = require('fs');
const express     = require('express');
const db          = require('../db/schema');
const config      = require('../config');
const audit       = require('../lib/audit');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');

const router  = express.Router();
const iconDir = path.join(path.resolve(config.DATA_DIR), 'uploads', 'icons');

// ── Group statements ────────────────────────────────────────────────────────
const listGroups   = db.prepare('SELECT * FROM compose_groups ORDER BY display_order ASC, name ASC');
const getGroup     = db.prepare('SELECT * FROM compose_groups WHERE id = ?');
const insertGroup  = db.prepare(`INSERT INTO compose_groups (name, color, display_order, created_at) VALUES (?, ?, (SELECT COALESCE(MAX(display_order),-1)+1 FROM compose_groups), datetime('now'))`);
const updateGroup  = db.prepare(`UPDATE compose_groups SET name=?, color=? WHERE id=?`);
const deleteGroup  = db.prepare('DELETE FROM compose_groups WHERE id = ?');
const unsetGroup   = db.prepare('UPDATE compose_projects SET group_id=NULL WHERE group_id=?');

// ── Project statements ──────────────────────────────────────────────────────
const listProjects = db.prepare(`
  SELECT cp.id, cp.name, cp.description, cp.icon, cp.group_id, cp.created_at, cp.updated_at,
         cg.name AS group_name, cg.color AS group_color,
         COUNT(DISTINCT CASE WHEN csl.host_id IS NOT NULL THEN csl.id END) AS linked_count,
         GROUP_CONCAT(DISTINCT s.name) AS subnet_names
  FROM compose_projects cp
  LEFT JOIN compose_groups        cg   ON cg.id           = cp.group_id
  LEFT JOIN compose_service_links csl  ON csl.compose_id  = cp.id
  LEFT JOIN compose_subnet_links  csnl ON csnl.compose_id = cp.id
  LEFT JOIN subnets               s    ON s.id            = csnl.subnet_id
  GROUP BY cp.id
  ORDER BY cg.display_order ASC, cg.name ASC, cp.updated_at DESC
`);
const getProject    = db.prepare('SELECT * FROM compose_projects WHERE id = ?');
const insertProject = db.prepare(`
  INSERT INTO compose_projects (name, description, content, icon, group_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);
const updateProject = db.prepare(`
  UPDATE compose_projects SET name=?, description=?, content=?, group_id=?, updated_at=datetime('now') WHERE id=?
`);
const updateIcon    = db.prepare("UPDATE compose_projects SET icon=?, updated_at=datetime('now') WHERE id=?");
const deleteProject = db.prepare('DELETE FROM compose_projects WHERE id = ?');

// ── Link statements ─────────────────────────────────────────────────────────
const getServiceLinks    = db.prepare(`SELECT csl.service_name, csl.host_id, h.ip, h.name AS host_name, h.last_status FROM compose_service_links csl LEFT JOIN hosts h ON h.id=csl.host_id WHERE csl.compose_id=? ORDER BY csl.service_name ASC`);
const deleteServiceLinks = db.prepare('DELETE FROM compose_service_links WHERE compose_id=?');
const insertServiceLink  = db.prepare(`INSERT OR REPLACE INTO compose_service_links (compose_id, service_name, host_id, created_at) VALUES (?,?,?,datetime('now'))`);

const getSubnetLinks    = db.prepare(`SELECT csnl.subnet_id, s.name, s.network, s.cidr FROM compose_subnet_links csnl JOIN subnets s ON s.id=csnl.subnet_id WHERE csnl.compose_id=? ORDER BY s.name ASC`);
const deleteSubnetLinks = db.prepare('DELETE FROM compose_subnet_links WHERE compose_id=?');
const insertSubnetLink  = db.prepare('INSERT OR IGNORE INTO compose_subnet_links (compose_id, subnet_id) VALUES (?,?)');

const getHostLinks    = db.prepare(`SELECT chl.host_id, h.ip, h.name AS host_name, h.last_status, s.name AS subnet_name FROM compose_host_links chl JOIN hosts h ON h.id=chl.host_id JOIN subnets s ON s.id=h.subnet_id WHERE chl.compose_id=? ORDER BY h.ip ASC`);
const deleteHostLinks = db.prepare('DELETE FROM compose_host_links WHERE compose_id=?');
const insertHostLink  = db.prepare('INSERT OR IGNORE INTO compose_host_links (compose_id, host_id) VALUES (?,?)');

function fullProject(id) {
  const p = getProject.get(id);
  if (!p) return null;
  return { ...p, links: getServiceLinks.all(id), subnet_links: getSubnetLinks.all(id), host_links: getHostLinks.all(id) };
}

// ── Group routes (MUST be before /:id) ──────────────────────────────────────

router.get('/groups', requireAuth, (req, res) => res.json(listGroups.all()));

router.post('/groups', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const r = insertGroup.run(name.trim(), color || null);
  res.status(201).json(getGroup.get(r.lastInsertRowid));
});

router.put('/groups/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const g  = getGroup.get(id);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  const { name, color } = req.body || {};
  updateGroup.run(name ? name.trim() : g.name, color !== undefined ? color : g.color, id);
  res.json(getGroup.get(id));
});

router.delete('/groups/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getGroup.get(id)) return res.status(404).json({ error: 'Group not found' });
  unsetGroup.run(id);   // detach projects before deleting group
  deleteGroup.run(id);
  res.json({ ok: true });
});

// ── Project routes ───────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => res.json(listProjects.all()));

router.post('/', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const { name, description, content, icon, group_id } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
  const r = insertProject.run(name.trim(), description || null, content, icon || null, group_id || null);
  const project = getProject.get(r.lastInsertRowid);
  audit(req.user, 'create', 'compose', project.id, { after: { name: project.name } });
  res.status(201).json(project);
});

router.get('/:id', requireAuth, (req, res) => {
  const project = fullProject(parseInt(req.params.id, 10));
  if (!project) return res.status(404).json({ error: 'Compose project not found' });
  res.json(project);
});

router.put('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p  = getProject.get(id);
  if (!p) return res.status(404).json({ error: 'Compose project not found' });
  const { name, description, content, icon, group_id } = req.body || {};
  updateProject.run(
    name        ? name.trim()               : p.name,
    description !== undefined ? description : p.description,
    content     || p.content,
    group_id    !== undefined ? (group_id || null) : p.group_id,
    id
  );
  if (icon !== undefined) updateIcon.run(icon || null, id);
  audit(req.user, 'update', 'compose', id, { after: { name: name || p.name } });
  res.json(getProject.get(id));
});

router.delete('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p  = getProject.get(id);
  if (!p) return res.status(404).json({ error: 'Compose project not found' });
  if (p.icon?.startsWith('/uploads/')) {
    try { fs.unlinkSync(path.join(path.resolve(config.DATA_DIR), p.icon.slice(1))); } catch {}
  }
  deleteProject.run(id);
  audit(req.user, 'delete', 'compose', id, { before: { name: p.name } });
  res.json({ ok: true });
});

router.put('/:id/links', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getProject.get(id)) return res.status(404).json({ error: 'Compose project not found' });
  const links = Array.isArray(req.body) ? req.body : [];
  db.transaction(() => { deleteServiceLinks.run(id); for (const l of links) { if (l.service_name) insertServiceLink.run(id, l.service_name, l.host_id || null); } })();
  res.json({ ok: true, links: getServiceLinks.all(id) });
});

router.put('/:id/subnets', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getProject.get(id)) return res.status(404).json({ error: 'Compose project not found' });
  const ids = Array.isArray(req.body) ? req.body.map(Number).filter(Boolean) : [];
  db.transaction(() => { deleteSubnetLinks.run(id); for (const s of ids) insertSubnetLink.run(id, s); })();
  res.json({ ok: true, subnet_links: getSubnetLinks.all(id) });
});

router.put('/:id/hosts', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getProject.get(id)) return res.status(404).json({ error: 'Compose project not found' });
  const ids = Array.isArray(req.body) ? req.body.map(Number).filter(Boolean) : [];
  db.transaction(() => { deleteHostLinks.run(id); for (const h of ids) insertHostLink.run(id, h); })();
  res.json({ ok: true, host_links: getHostLinks.all(id) });
});

router.post(
  '/:id/icon',
  requireAuth,
  requireRole('admin', 'editor'),
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: '2mb' }),
  (req, res) => {
    const id = parseInt(req.params.id, 10);
    const p  = getProject.get(id);
    if (!p) return res.status(404).json({ error: 'Compose project not found' });
    const ct  = req.headers['content-type'] || '';
    const ext = ct.split('/')[1]?.split(';')[0] || 'png';
    const allowed = new Set(['png','jpg','jpeg','gif','svg','webp','ico']);
    if (!allowed.has(ext)) return res.status(400).json({ error: 'Unsupported image type' });
    fs.mkdirSync(iconDir, { recursive: true });
    const filename = `compose-${id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(iconDir, filename), req.body);
    if (p.icon?.startsWith('/uploads/icons/compose-')) {
      try { fs.unlinkSync(path.join(path.resolve(config.DATA_DIR), p.icon.slice(1))); } catch {}
    }
    const iconPath = `/uploads/icons/${filename}`;
    updateIcon.run(iconPath, id);
    res.json({ ok: true, icon: iconPath });
  }
);

module.exports = router;
