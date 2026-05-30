'use strict';

const express     = require('express');
const db          = require('../db/schema');
const audit       = require('../lib/audit');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');
const { isValidIPv4, ipInSubnet, getFreeIPs } = require('../lib/ipUtils');

const router = express.Router({ mergeParams: true });

const getSubnet    = db.prepare('SELECT * FROM subnets WHERE id = ?');
const listHosts    = db.prepare('SELECT * FROM hosts WHERE subnet_id = ? ORDER BY ip ASC');
const usedIPs      = db.prepare('SELECT ip FROM hosts WHERE subnet_id = ?');
const serverIPs    = db.prepare("SELECT ip FROM hosts WHERE subnet_id = ? AND type = 'server'");
const getHostById  = db.prepare('SELECT * FROM hosts WHERE id = ?');
const getHostByIP  = db.prepare('SELECT * FROM hosts WHERE ip = ?');
const insertHost   = db.prepare(`
  INSERT INTO hosts (subnet_id, ip, name, description, notes, type, check_port, check_enabled, last_status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown', datetime('now'))
`);
const updateHost   = db.prepare(`
  UPDATE hosts
  SET name = ?, description = ?, notes = ?, type = ?, check_port = ?, check_enabled = ?, updated_at = datetime('now')
  WHERE id = ?
`);
const deleteHost   = db.prepare('DELETE FROM hosts WHERE id = ?');

// GET /api/v1/subnets/:subnetId/hosts
router.get('/', requireAuth, (req, res) => {
  const subnetId = parseInt(req.params.subnetId, 10);
  const subnet = getSubnet.get(subnetId);
  if (!subnet) return res.status(404).json({ error: 'Subnet not found' });

  const hosts     = listHosts.all(subnetId);
  const used      = usedIPs.all(subnetId).map(r => r.ip);
  const servers   = new Set(serverIPs.all(subnetId).map(r => r.ip));
  const free      = getFreeIPs(subnet.network, subnet.cidr, used);
  // Exclude server IPs from the clickable free-IP list (they're the host machine)
  const freeForContainers = free.filter(ip => !servers.has(ip));

  res.json({
    hosts,
    free_ips:   freeForContainers.slice(0, 50),
    free_count: free.length,
  });
});

// POST /api/v1/subnets/:subnetId/hosts
router.post('/', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const subnetId = parseInt(req.params.subnetId, 10);
  const subnet = getSubnet.get(subnetId);
  if (!subnet) return res.status(404).json({ error: 'Subnet not found' });

  const { ip, name, description, notes, type, check_port, check_enabled } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  if (!isValidIPv4(ip)) return res.status(400).json({ error: 'Invalid IP address' });
  if (!ipInSubnet(ip, subnet.network, subnet.cidr)) {
    return res.status(400).json({ error: 'IP address is not within subnet range' });
  }

  try {
    const result = insertHost.run(
      subnetId, ip,
      name || null, description || null, notes || null,
      type || 'container',
      check_port ? parseInt(check_port, 10) : null,
      check_enabled === false || check_enabled === 0 ? 0 : 1
    );
    const host = getHostById.get(result.lastInsertRowid);
    audit(req.user, 'create', 'host', host.id, { after: host });
    res.status(201).json(host);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'IP address already in use' });
    }
    console.error('[hosts] insert error:', err.message);
    res.status(500).json({ error: 'Failed to create host' });
  }
});

// PUT /api/v1/hosts/:id
router.put('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getHostById.get(id);
  if (!existing) return res.status(404).json({ error: 'Host not found' });

  const { name, description, notes, type, check_port, check_enabled } = req.body || {};
  updateHost.run(
    name        !== undefined ? name        : existing.name,
    description !== undefined ? description : existing.description,
    notes       !== undefined ? notes       : existing.notes,
    type        !== undefined ? type        : existing.type,
    check_port  !== undefined ? (check_port ? parseInt(check_port, 10) : null) : existing.check_port,
    check_enabled !== undefined ? (check_enabled ? 1 : 0) : existing.check_enabled,
    id
  );
  const updated = getHostById.get(id);
  audit(req.user, 'update', 'host', id, { before: existing, after: updated });
  res.json(updated);
});

// DELETE /api/v1/hosts/:id
router.delete('/:id', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = getHostById.get(id);
  if (!existing) return res.status(404).json({ error: 'Host not found' });

  deleteHost.run(id);
  audit(req.user, 'delete', 'host', id, { before: existing });
  res.json({ ok: true });
});

// POST /api/v1/hosts/:id/check
router.post('/:id/check', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const host = getHostById.get(id);
  if (!host) return res.status(404).json({ error: 'Host not found' });

  try {
    const { checkHost } = require('../lib/checker');
    const status = await checkHost(host);
    res.json({ status, host: getHostById.get(id) });
  } catch (err) {
    console.error('[hosts] check error:', err.message);
    res.status(500).json({ error: 'Check failed' });
  }
});

// Export helper for use in subnets router
module.exports = router;
module.exports.getHostByIP = getHostByIP;
