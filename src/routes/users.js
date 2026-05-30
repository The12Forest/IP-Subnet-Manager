'use strict';

const express     = require('express');
const bcrypt      = require('bcryptjs');
const db          = require('../db/schema');
const audit       = require('../lib/audit');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/admin');
const config      = require('../config');

const router = express.Router();

const listUsers  = db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY id ASC');
const getUser    = db.prepare('SELECT id, username, role, created_at, last_login FROM users WHERE id = ?');
const countUsers = db.prepare('SELECT COUNT(*) AS n FROM users');
const countAdmins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
const insertUser = db.prepare(
  "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, datetime('now'))"
);
const updateUser = db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?');
const updatePass = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  res.json(listUsers.all());
});

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, editor, or viewer' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const maxUsers = config.MAX_USERS;
  if (maxUsers > 0 && countUsers.get().n >= maxUsers) {
    return res.status(403).json({ error: `Maximum user limit (${maxUsers}) reached` });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = insertUser.run(username.trim(), hash, role);
    const user = getUser.get(result.lastInsertRowid);
    audit(req.user, 'create', 'user', user.id, { after: { username: user.username, role: user.role } });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('[users] insert error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { username, role, password } = req.body || {};

  // Prevent admin from demoting themselves and leaving no admins
  if (role && role !== 'admin' && id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }
  if (role === 'admin' || role) {
    if (existing.role === 'admin' && role !== 'admin') {
      const adminCount = countAdmins.get().n;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin' });
      }
    }
  }

  updateUser.run(
    username ? username.trim() : existing.username,
    role || existing.role,
    id
  );

  if (password) {
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    updatePass.run(bcrypt.hashSync(password, 10), id);
  }

  const updated = getUser.get(id);
  audit(req.user, 'update', 'user', id, {
    before: { username: existing.username, role: existing.role },
    after:  { username: updated.username, role: updated.role },
  });
  res.json(updated);
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (existing.role === 'admin' && countAdmins.get().n <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin' });
  }

  deleteUser.run(id);
  audit(req.user, 'delete', 'user', id, { before: { username: existing.username, role: existing.role } });
  res.json({ ok: true });
});

module.exports = router;
