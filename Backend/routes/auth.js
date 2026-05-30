const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

// POST /api/v1/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const sql = `SELECT * FROM users WHERE username = ?`;
    db.get(sql, [username], async (err, user) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ error: 'Database error during login.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        // Update last_login
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const payload = { id: user.id, username: user.username, role: user.role };
        const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry });

        res.cookie('token', token, {
            httpOnly: true,
            secure: config.nodeEnv === 'production',
            sameSite: 'strict',
            maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
        });

        res.json({ id: user.id, username: user.username, role: user.role });
    });
});

// POST /api/v1/auth/logout
router.post('/logout', (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0),
    });
    res.status(200).json({ message: 'Logout successful.' });
});


// GET /api/v1/auth/me
router.get('/me', authMiddleware, (req, res) => {
    // The user object (id, username, role) is attached to the request by the auth middleware
    res.json(req.user);
});


module.exports = router;
