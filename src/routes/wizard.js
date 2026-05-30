'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db/schema');
const config  = require('../config');

const router = express.Router();

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');

router.get('/status', (req, res) => {
  if (config.SETUP_WIZARD === 'skip') {
    return res.json({ needed: false });
  }
  if (config.SETUP_WIZARD === 'force') {
    return res.json({ needed: true });
  }
  // auto
  const row = getSetting.get('setup_complete');
  const needed = !row || row.value !== 'true';
  res.json({ needed });
});

const insertUser   = db.prepare(
  "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', datetime('now'))"
);
const insertSubnet = db.prepare(
  "INSERT INTO subnets (name, network, cidr, description, display_order, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
);
const setSetting   = db.prepare(
  "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
);

const completeWizard = db.transaction((data) => {
  // Create admin user
  const hash = bcrypt.hashSync(data.password, 10);
  const userResult = insertUser.run(data.username, hash);

  // Create first subnet if provided
  if (data.network && data.subnet_name) {
    insertSubnet.run(
      data.subnet_name,
      data.network,
      data.cidr || 24,
      data.subnet_description || ''
    );
  }

  // Store network settings
  setSetting.run('setup_complete', 'true');
  setSetting.run('base_network',   data.network    || '');
  setSetting.run('base_cidr',      String(data.cidr || 24));
  setSetting.run('network_mode',   data.network_mode || 'bridge');

  return userResult.lastInsertRowid;
});

router.post('/complete', (req, res) => {
  const row = getSetting.get('setup_complete');
  if (row && row.value === 'true' && config.SETUP_WIZARD !== 'force') {
    return res.status(409).json({ error: 'Setup already completed' });
  }

  const { username, password, network, cidr, subnet_name, subnet_description, network_mode } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const userId = completeWizard({ username, password, network, cidr, subnet_name, subnet_description, network_mode });

    const token = jwt.sign(
      { id: userId, username, role: 'admin' },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRY }
    );

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.HTTPS_MODE !== 'off',
      maxAge: config.JWT_EXPIRY_MS,
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('[wizard] Error completing setup:', err);
    res.status(500).json({ error: 'Setup failed' });
  }
});

module.exports = router;
