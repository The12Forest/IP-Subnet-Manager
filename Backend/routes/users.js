const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// GET /api/v1/users - List all users
router.get('/', (req, res) => {
    db.all('SELECT id, username, role, created_at, last_login FROM users ORDER BY username', [], (err, rows) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ error: 'Database error fetching users.' });
        }
        res.json(rows);
    });
});

// POST /api/v1/users - Create a new user
router.post('/', async (req, res) => {
    const { username, password, role = 'viewer' } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!['admin', 'editor', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`;
        db.run(sql, [username, passwordHash, role], function(err) {
            if (err) {
                console.error('Error creating user:', err);
                return res.status(500).json({ error: 'Failed to create user. Username may already exist.' });
            }
            res.status(201).json({ id: this.lastID, username, role });
        });
    } catch (error) {
        console.error('Error hashing password for new user:', error);
        res.status(500).json({ error: 'An error occurred while creating the user.' });
    }
});

// PUT /api/v1/users/:id - Update a user
router.put('/:id', (req, res) => {
    // Not fully implemented yet as per plan
    const { id } = req.params;
    const { username, role } = req.body;

    if(!username && !role) {
        return res.status(400).json({ error: 'No fields to update.' });
    }
    
    // In a real implementation, you'd build a dynamic SQL query
    // and also handle password changes separately.
    res.status(501).json({ message: 'User update not fully implemented yet.' });
});

// DELETE /api/v1/users/:id - Delete a user
router.delete('/:id', (req, res) => {
    const idToDelete = parseInt(req.params.id, 10);
    if (req.user.id === idToDelete) {
        return res.status(400).json({ error: 'You cannot delete yourself.' });
    }

    db.run('DELETE FROM users WHERE id = ?', [idToDelete], function(err) {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: 'Failed to delete user.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.status(200).json({ message: 'User deleted successfully.' });
    });
});

module.exports = router;
