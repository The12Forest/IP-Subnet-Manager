'use strict';

const express      = require('express');
const db           = require('../db/schema');
const audit        = require('../lib/audit');
const requireAuth  = require('../middleware/auth');
const requireRole  = require('../middleware/admin');

const router = express.Router();

const listSubnets = db.prepare(`
  SELECT s.*, COUNT(h.id) AS hosts_count
  FROM subnets s
  LEFT JOIN hosts h ON h.subnet_id = s.id
  GROUP BY s.id
  ORDER BY s.display_order ASC, s.created_at ASC
`);

const getSubnet    = db.prepare('SELECT * FROM subnets WHERE id = ?');
const insertSubnet = db.prepare(`
  INSERT INTO subnets (name, network, cidr, description, color, display_order, created_at)
  VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM subnets), datetime('now'))
`);
const updateSubnet = db.prepare(`
  UPDATE subnets SET name = ?, network = ?, cidr = ?, description = ?, color = ?, updated_at = datetime('now')
  WHERE id = ?
`);
const deleteSubnet = db.prepare('DELETE FROM subnets WHERE id = ?');
const updateOrder  = db.prepare('UPDATE subnets SET display_order = ? WHERE id = ?');

router.get('/', requireAuth, (req, res) => {
  res.json(listSubnets.all());
});

router.post('/', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const { name, network, cidr, description, color } = req.body || {};
  if (!name || !network) {
    return res.status(400).json({ error: 'name and network are required' });
  }
  try {
    const result = insertSubnet.run(name, network, cidr || 24, description || '', color || null);
    const subnet = getSubnet.get(result.lastInsertRowid);
    audit(req.user, 'create', 'subnet', subnet.id, { after: subnet });
    res.status(201).json(subnet);
  } catch (err) {
    console.error('[subnets] insert error:', err.message);
    res.status(500).json({ error: 'Failed to create subnet' });
  }
});

router.put('/reorder', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Expected array of { id, display_order }' });
  }
  const reorder = db.transaction(() => {
    for (const { id, display_order } of items) {
      updateOrder.run(display_order, id);
    }
  });
  reorder();
  res.json({ ok: true });
});

router.put('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getSubnet.get(id);
  if (!existing) return res.status(404).json({ error: 'Subnet not found' });

  const { name, network, cidr, description, color } = req.body || {};
  updateSubnet.run(
    name        ?? existing.name,
    network     ?? existing.network,
    cidr        ?? existing.cidr,
    description ?? existing.description,
    color       !== undefined ? color : existing.color,
    id
  );
  const updated = getSubnet.get(id);
  audit(req.user, 'update', 'subnet', id, { before: existing, after: updated });
  res.json(updated);
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getSubnet.get(id);
  if (!existing) return res.status(404).json({ error: 'Subnet not found' });

  deleteSubnet.run(id);
  audit(req.user, 'delete', 'subnet', id, { before: existing });
  res.json({ ok: true });
});

// Mount hosts sub-router: GET/POST /api/v1/subnets/:subnetId/hosts
const hostsRouter = require('./hosts');
router.use('/:subnetId/hosts', hostsRouter);

module.exports = router;
