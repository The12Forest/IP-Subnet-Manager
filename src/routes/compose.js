'use strict';

const express     = require('express');
const db          = require('../db/schema');
const audit       = require('../lib/audit');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');

const router = express.Router();

const listProjects = db.prepare(`
  SELECT cp.id, cp.name, cp.description, cp.created_at, cp.updated_at,
         COUNT(DISTINCT CASE WHEN csl.host_id IS NOT NULL THEN csl.id END) AS linked_count,
         GROUP_CONCAT(DISTINCT s.name)  AS subnet_names,
         GROUP_CONCAT(DISTINCT csnl.subnet_id) AS subnet_ids
  FROM compose_projects cp
  LEFT JOIN compose_service_links csl   ON csl.compose_id   = cp.id
  LEFT JOIN compose_subnet_links  csnl  ON csnl.compose_id  = cp.id
  LEFT JOIN subnets               s     ON s.id             = csnl.subnet_id
  GROUP BY cp.id
  ORDER BY cp.updated_at DESC
`);
const getProject    = db.prepare('SELECT * FROM compose_projects WHERE id = ?');
const insertProject = db.prepare(`
  INSERT INTO compose_projects (name, description, content, created_at, updated_at)
  VALUES (?, ?, ?, datetime('now'), datetime('now'))
`);
const updateProject = db.prepare(`
  UPDATE compose_projects SET name=?, description=?, content=?, updated_at=datetime('now') WHERE id=?
`);
const deleteProject = db.prepare('DELETE FROM compose_projects WHERE id = ?');

const getLinks = db.prepare(`
  SELECT csl.service_name, csl.host_id, h.ip, h.name AS host_name, h.last_status
  FROM compose_service_links csl
  LEFT JOIN hosts h ON h.id = csl.host_id
  WHERE csl.compose_id = ?
  ORDER BY csl.service_name ASC
`);
const deleteLinks = db.prepare('DELETE FROM compose_service_links WHERE compose_id = ?');
const insertLink  = db.prepare(`
  INSERT OR REPLACE INTO compose_service_links (compose_id, service_name, host_id, created_at)
  VALUES (?, ?, ?, datetime('now'))
`);

const getSubnetLinks    = db.prepare(`
  SELECT csnl.subnet_id, s.name, s.network, s.cidr
  FROM compose_subnet_links csnl
  JOIN subnets s ON s.id = csnl.subnet_id
  WHERE csnl.compose_id = ?
  ORDER BY s.name ASC
`);
const deleteSubnetLinks = db.prepare('DELETE FROM compose_subnet_links WHERE compose_id = ?');
const insertSubnetLink  = db.prepare(
  'INSERT OR IGNORE INTO compose_subnet_links (compose_id, subnet_id) VALUES (?, ?)'
);

function fullProject(id) {
  const project = getProject.get(id);
  if (!project) return null;
  return {
    ...project,
    links:        getLinks.all(id),
    subnet_links: getSubnetLinks.all(id),
  };
}

router.get('/', requireAuth, (req, res) => {
  res.json(listProjects.all());
});

router.post('/', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const { name, description, content } = req.body || {};
  if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
  const r = insertProject.run(name.trim(), description || null, content);
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
  const project = getProject.get(id);
  if (!project) return res.status(404).json({ error: 'Compose project not found' });
  const { name, description, content } = req.body || {};
  updateProject.run(
    name        ? name.trim()                   : project.name,
    description !== undefined ? description     : project.description,
    content     || project.content,
    id
  );
  audit(req.user, 'update', 'compose', id, { after: { name: name || project.name } });
  res.json(getProject.get(id));
});

router.delete('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const project = getProject.get(id);
  if (!project) return res.status(404).json({ error: 'Compose project not found' });
  deleteProject.run(id);
  audit(req.user, 'delete', 'compose', id, { before: { name: project.name } });
  res.json({ ok: true });
});

router.put('/:id/links', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const project = getProject.get(id);
  if (!project) return res.status(404).json({ error: 'Compose project not found' });
  const links = Array.isArray(req.body) ? req.body : [];

  db.transaction(() => {
    deleteLinks.run(id);
    for (const link of links) {
      if (!link.service_name) continue;
      insertLink.run(id, link.service_name, link.host_id || null);
    }
  })();

  res.json({ ok: true, links: getLinks.all(id) });
});

// PUT /api/v1/compose/:id/subnets — set linked subnets
router.put('/:id/subnets', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const project = getProject.get(id);
  if (!project) return res.status(404).json({ error: 'Compose project not found' });
  const subnetIds = Array.isArray(req.body) ? req.body.map(Number).filter(Boolean) : [];

  db.transaction(() => {
    deleteSubnetLinks.run(id);
    for (const sid of subnetIds) insertSubnetLink.run(id, sid);
  })();

  audit(req.user, 'update', 'compose', id, { subnets: subnetIds });
  res.json({ ok: true, subnet_links: getSubnetLinks.all(id) });
});

module.exports = router;
