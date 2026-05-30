const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/v1/settings
router.get('/', (req, res) => {
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
        if (err) {
            console.error('Error fetching settings:', err);
            return res.status(500).json({ error: 'Database error fetching settings.' });
        }
        // Convert array of {key, value} to a single object
        const settings = rows.reduce((acc, row) => {
            try {
                // Attempt to parse JSON strings
                acc[row.key] = JSON.parse(row.value);
            } catch (e) {
                acc[row.key] = row.value;
            }
            return acc;
        }, {});
        res.json(settings);
    });
});

// PUT /api/v1/settings
router.put('/', (req, res) => {
    const settings = req.body;
    // Use INSERT OR REPLACE (UPSERT) to update existing or create new settings
    const sql = `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`;
    
    db.serialize(() => {
        const stmt = db.prepare(sql);
        Object.entries(settings).forEach(([key, value]) => {
            // Storing all values as JSON strings for consistency
            stmt.run(key, JSON.stringify(value));
        });
        stmt.finalize((err) => {
            if (err) {
                console.error('Error updating settings:', err);
                return res.status(500).json({ error: 'Failed to update settings.' });
            }
            res.status(200).json({ message: 'Settings updated successfully.' });
        });
    });
});

module.exports = router;
