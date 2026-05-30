const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

const { logAction } = require('../utils/audit-log');

// ... (in POST '/')
        db.run(sql, [username, passwordHash, role], function(err) {
            if (err) {
                console.error('Error creating user:', err);
                return res.status(500).json({ error: 'Failed to create user. Username may already exist.' });
            }
            logAction(req.user, 'create', 'user', this.lastID, { username, role });
            res.status(201).json({ id: this.lastID, username, role });
        });
// ... (in DELETE '/')
    db.run('DELETE FROM users WHERE id = ?', [idToDelete], function(err) {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: 'Failed to delete user.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        logAction(req.user, 'delete', 'user', idToDelete, {});
        res.status(200).json({ message: 'User deleted successfully.' });
    });

module.exports = router;
