'use strict';

const express     = require('express');
const db          = require('../db/schema');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');
const audit       = require('../lib/audit');

const router = express.Router();

router.get('/json', requireAuth, (req, res) => {
  const subnets = db.prepare('SELECT * FROM subnets ORDER BY display_order ASC').all();
  const hosts   = db.prepare('SELECT * FROM hosts ORDER BY subnet_id ASC, ip ASC').all();
  const exported = {
    version: '1',
    exported_at: new Date().toISOString(),
    subnets,
    hosts,
  };
  res.setHeader('Content-Disposition', 'attachment; filename="subnet-manager-export.json"');
  res.json(exported);
});

router.get('/markdown', requireAuth, (req, res) => {
  const subnets = db.prepare('SELECT * FROM subnets ORDER BY display_order ASC').all();
  const hosts   = db.prepare('SELECT * FROM hosts ORDER BY subnet_id ASC, ip ASC').all();

  const hostsBySubnet = {};
  for (const h of hosts) {
    if (!hostsBySubnet[h.subnet_id]) hostsBySubnet[h.subnet_id] = [];
    hostsBySubnet[h.subnet_id].push(h);
  }

  let md = '# Subnet Manager Export\n\n';
  md += `_Exported: ${new Date().toISOString()}_\n\n`;

  for (const s of subnets) {
    md += `## ${s.name} — ${s.network}/${s.cidr}\n\n`;
    if (s.description) md += `> ${s.description}\n\n`;
    md += '| IP | Name | Type | Status | Port | Description |\n';
    md += '|----|------|------|--------|------|-------------|\n';
    const sHosts = hostsBySubnet[s.id] || [];
    for (const h of sHosts) {
      md += `| \`${h.ip}\` | ${h.name || ''} | ${h.type} | ${h.last_status} | ${h.check_port || ''} | ${h.description || ''} |\n`;
    }
    md += '\n';
  }

  res.setHeader('Content-Disposition', 'attachment; filename="subnet-manager-export.md"');
  res.setHeader('Content-Type', 'text/markdown');
  res.send(md);
});

router.post('/import/json', requireAuth, requireRole('admin'), (req, res) => {
  const { subnets, hosts } = req.body || {};
  if (!Array.isArray(subnets)) {
    return res.status(400).json({ error: 'subnets array is required' });
  }

  const insertSubnet = db.prepare(`
    INSERT OR IGNORE INTO subnets (name, network, cidr, description, color, display_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHost = db.prepare(`
    INSERT OR IGNORE INTO hosts (subnet_id, ip, name, description, notes, type, check_port, check_enabled, last_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?)
  `);
  const getSubnetByNetwork = db.prepare('SELECT id FROM subnets WHERE network = ? AND cidr = ?');

  let imported = { subnets: 0, hosts: 0 };

  const doImport = db.transaction(() => {
    for (const s of subnets) {
      insertSubnet.run(s.name, s.network, s.cidr || 24, s.description || '', s.color || null, s.display_order || 0, s.created_at || new Date().toISOString());
      imported.subnets++;
    }

    if (Array.isArray(hosts)) {
      for (const h of hosts) {
        // Resolve subnet_id by network+cidr if the ID has changed
        let subnetId = h.subnet_id;
        const subnetRow = getSubnetByNetwork.get(h.subnet_network || '', h.subnet_cidr || 24);
        if (subnetRow) subnetId = subnetRow.id;

        if (!subnetId) continue;
        insertHost.run(
          subnetId, h.ip, h.name || null, h.description || null, h.notes || null,
          h.type || 'container', h.check_port || null, h.check_enabled !== 0 ? 1 : 0,
          h.created_at || new Date().toISOString()
        );
        imported.hosts++;
      }
    }
  });

  try {
    doImport();
    audit(req.user, 'import', 'bulk', 'json', imported);
    res.json({ ok: true, imported });
  } catch (err) {
    console.error('[import] error:', err.message);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

module.exports = router;
