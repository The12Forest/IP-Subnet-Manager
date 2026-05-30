'use strict';

const express     = require('express');
const db          = require('../db/schema');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit  = Math.min(200, parseInt(req.query.limit || '50', 10));
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];

  if (req.query.user) {
    where += ' AND username = ?';
    params.push(req.query.user);
  }
  if (req.query.action) {
    where += ' AND action = ?';
    params.push(req.query.action);
  }
  if (req.query.target_type) {
    where += ' AND target_type = ?';
    params.push(req.query.target_type);
  }

  const rows  = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${where}`).get(...params).n;

  res.json({ rows, total, page, limit });
});

module.exports = router;
