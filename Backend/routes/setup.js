const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { logAction } = require('../utils/audit-log');

// GET /api/v1/setup/status
router.get('/status', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
            console.error('Failed to get setup status:', err);
            return res.status(500).json({ error: 'Database error checking setup status.' });
        }
        res.json({ needsSetup: row.count === 0 });
    });
});

// POST /api/v1/setup/run
router.post('/run', async (req, res) => {
    try {
        const userCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                if (err) return reject(new Error('Database error checking user count.'));
                resolve(row.count);
            });
        });

        if (userCount > 0) {
            return res.status(403).json({ error: 'Setup has already been completed.' });
        }

        const { username, password, settings } = req.body;
        if (!username || !password || !settings) {
            return res.status(400).json({ error: 'Username, password, and settings are required.' });
        }

        // Create admin user
        const passwordHash = await bcrypt.hash(password, 10);
        const userSql = `INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`;
        const { lastID: userId } = await new Promise((resolve, reject) => {
            db.run(userSql, [username, passwordHash], function(err) {
                if (err) return reject(new Error('Failed to create admin user.'));
                resolve(this);
            });
        });

        // Save settings
        const settingsSql = `INSERT INTO settings (key, value) VALUES (?, ?)`;
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                const stmt = db.prepare(settingsSql);
                Object.entries(settings).forEach(([key, value]) => stmt.run(key, JSON.stringify(value)));
                stmt.finalize((err) => {
                    if (err) return reject(new Error('Failed to save settings.'));
                    resolve();
                });
            });
        });
        
        logAction(null, 'create', 'user', userId, { username, role: 'admin' });
        logAction(null, 'update', 'settings', 'initial_setup', settings);

        res.status(201).json({ message: 'Setup completed successfully.' });

    } catch (error) {
        console.error("Error during setup:", error.message);
        res.status(500).json({ error: 'An error occurred during setup.' });
    }
});

module.exports = router;
