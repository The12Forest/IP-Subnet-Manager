'use strict';

const express       = require('express');
const bcrypt        = require('bcryptjs');
const db            = require('../db/schema');
const audit         = require('../lib/audit');
const requireAuth   = require('../middleware/auth');
const requireRole   = require('../middleware/admin');
const config        = require('../config');
const { gravatarUrl } = require('../lib/gravatar');

const router = express.Router();

function withGravatar(u) {
  return { ...u, gravatar_url: gravatarUrl(u.email) };
}

const listUsers   = db.prepare('SELECT id, username, email, role, created_at, last_login FROM users ORDER BY id ASC');
const getUser     = db.prepare('SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?');
const countUsers  = db.prepare('SELECT COUNT(*) AS n FROM users');
const countAdmins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
const insertUser  = db.prepare(
  "INSERT INTO users (username, password_hash, email, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
);
const updateUser  = db.prepare('UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?');
const updateEmail = db.prepare('UPDATE users SET email = ? WHERE id = ?');
const updatePass  = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteUser  = db.prepare('DELETE FROM users WHERE id = ?');

router.get('/', requireAuth, requireRole('admin'), (req, res) => {
  res.json(listUsers.all().map(withGravatar));
});

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { username, password, role, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'role must be admin, editor, or viewer' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const maxUsers = config.MAX_USERS;
  if (maxUsers > 0 && countUsers.get().n >= maxUsers) {
    return res.status(403).json({ error: `Maximum user limit (${maxUsers}) reached` });
  }

  try {
    const hash   = bcrypt.hashSync(password, 10);
    const result = insertUser.run(username.trim(), hash, email || null, role);
    const user   = getUser.get(result.lastInsertRowid);
    audit(req.user, 'create', 'user', user.id, { after: { username: user.username, role: user.role } });
    res.status(201).json(withGravatar(user));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Username already taken' });
    console.error('[users] insert error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const id       = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const isAdmin  = req.user.role === 'admin';
  const isSelf   = req.user.id === id;

  // Non-admins can only update their own record, and only email + password
  if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });

  const { username, role, password, email } = req.body || {};

  if (isAdmin) {
    // Admin-only checks
    if (role && role !== 'admin' && id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }
    if (role && existing.role === 'admin' && role !== 'admin' && countAdmins.get().n <= 1) {
      return res.status(400).json({ error: 'Cannot demote the last admin' });
    }
  }

  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  db.transaction(() => {
    if (isAdmin) {
      updateUser.run(
        username ? username.trim() : existing.username,
        email    !== undefined ? (email || null) : existing.email,
        role     || existing.role,
        id
      );
    } else {
      // Non-admin can only update their own email
      updateEmail.run(email !== undefined ? (email || null) : existing.email, id);
    }
    if (password) updatePass.run(bcrypt.hashSync(password, 10), id);
  })();

  const updated = getUser.get(id);
  audit(req.user, 'update', 'user', id, {
    before: { username: existing.username, role: existing.role },
    after:  { username: updated.username,  role: updated.role },
  });
  res.json(withGravatar(updated));
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
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
