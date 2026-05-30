'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db/schema');
const config  = require('../config');
const audit   = require('../lib/audit');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const findUser = db.prepare('SELECT * FROM users WHERE username = ?');
const updateLogin = db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?");

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = findUser.get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  updateLogin.run(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRY }
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.HTTPS_MODE !== 'off',
    maxAge: config.JWT_EXPIRY_MS,
  });

  audit({ id: user.id, username: user.username }, 'login', 'user', user.id, {});

  res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

module.exports = router;
