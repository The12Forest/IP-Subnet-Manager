const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkHostStatus } = require('../utils/status-checker');

// GET /api/v1/status - Get last known status for all hosts
router.get('/', (req, res) => {
    db.all('SELECT id, ip, name, last_status, last_seen FROM hosts', [], (err, rows) => {
        if (err) {
            console.error('Error fetching all host statuses:', err);
            return res.status(500).json({ error: 'Database error fetching statuses.' });
        }
        res.json(rows);
    });
});

// POST /api/v1/status/check-all - Trigger a manual scan for all enabled hosts
router.post('/check-all', (req, res) => {
    db.all('SELECT * FROM hosts WHERE check_enabled = 1', [], async (err, hosts) => {
        if (err) {
            console.error('Error fetching hosts for check-all:', err);
            return res.status(500).json({ error: 'Database error fetching hosts.' });
        }
        
        try {
            const results = await Promise.all(hosts.map(checkHostStatus));
            res.json({ message: `${results.length} hosts checked.`, results });
        } catch (error) {
            console.error('Error during check-all scan:', error);
            res.status(500).json({ error: 'An error occurred while checking hosts.' });
        }
    });
});

module.exports = router;
