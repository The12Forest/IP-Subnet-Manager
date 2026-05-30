const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// GET /api/v1/setup/status
// Checks if the application has been set up by looking for any users.
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
// Creates the first admin user and saves initial network settings.
router.post('/run', (req, res) => {
    // First, confirm that no users exist.
    db.get('SELECT COUNT(*) as count FROM users', [], async (err, row) => {
        if (err) {
            console.error('Failed to check user count during setup:', err);
            return res.status(500).json({ error: 'Database error during setup.' });
        }
        if (row.count > 0) {
            return res.status(403).json({ error: 'Setup has already been completed.' });
        }

        const { username, password, settings } = req.body;
        if (!username || !password || !settings) {
            return res.status(400).json({ error: 'Username, password, and settings are required.' });
        }

        try {
            // Create admin user
            const passwordHash = await bcrypt.hash(password, 10);
            const userSql = `INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`;
            
            db.run(userSql, [username, passwordHash], function(err) {
                if (err) {
                    console.error('Failed to create admin user during setup:', err);
                    return res.status(500).json({ error: 'Failed to create admin user.' });
                }

                // Save settings
                const settingsSql = `INSERT INTO settings (key, value) VALUES (?, ?)`;
                const settingEntries = Object.entries(settings);
                
                db.serialize(() => {
                    const stmt = db.prepare(settingsSql);
                    settingEntries.forEach(([key, value]) => {
                        stmt.run(key, value);
                    });
const { logAction } = require('../utils/audit-log');

// ... (inside router.post('/run'))
                    stmt.finalize((err) => {
                        if (err) {
                            console.error('Failed to save settings during setup:', err);
                            return res.status(500).json({ error: 'Failed to save settings.' });
                        }
                        // Log actions
                        logAction(null, 'create', 'user', this.lastID, { username, role: 'admin' });
                        logAction(null, 'update', 'settings', 'initial_setup', settings);

                        res.status(201).json({ message: 'Setup completed successfully.' });
                    });
// ...
                });
            });
        } catch (error) {
            console.error('An unexpected error occurred during setup:', error);
            res.status(500).json({ error: 'An unexpected error occurred during setup.' });
        }
    });
});

module.exports = router;
