'use strict';

const express     = require('express');
const db          = require('../db/schema');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');
const { clients, broadcast } = require('../lib/sseHub');

const router = express.Router();

const allHostsWithSubnet = db.prepare(`
  SELECT h.*, s.name AS subnet_name, s.network AS subnet_network, s.cidr AS subnet_cidr
  FROM hosts h
  JOIN subnets s ON s.id = h.subnet_id
  ORDER BY s.display_order ASC, h.ip ASC
`);

router.get('/', requireAuth, (req, res) => {
  res.json(allHostsWithSubnet.all());
});

router.post('/check-all', requireAuth, requireRole('admin', 'editor'), (req, res) => {
  setImmediate(async () => {
    try {
      const { startCheckerCycle } = require('../lib/checker');
      await startCheckerCycle();
    } catch (err) {
      console.error('[status] check-all error:', err.message);
    }
  });
  res.json({ queued: true });
});

router.get('/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const client = { res, userId: req.user.id };
  clients.add(client);

  // Keepalive ping every 25 seconds
  const ping = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      clearInterval(ping);
      clients.delete(client);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
});

module.exports = router;
