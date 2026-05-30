const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/v1/export/json
router.get('/json', (req, res) => {
    const tables = ['settings', 'users', 'subnets', 'hosts'];
    const exportData = {};
    
    const promises = tables.map(table => {
        return new Promise((resolve, reject) => {
            // Exclude password hashes from the user export
            const columns = table === 'users' ? 'id, username, role, created_at, last_login' : '*';
            db.all(`SELECT ${columns} FROM ${table}`, [], (err, rows) => {
                if (err) return reject(err);
                exportData[table] = rows;
                resolve();
            });
        });
    });

    Promise.all(promises)
        .then(() => {
            res.header('Content-Disposition', 'attachment; filename="subnet-manager-export.json"');
            res.json(exportData);
        })
        .catch(err => {
            console.error('Error during JSON export:', err);
            res.status(500).json({ error: 'Failed to export data.' })
        });
});

// GET /api/v1/export/markdown
router.get('/markdown', (req, res) => {
    res.status(501).send('Markdown export not implemented yet.');
});

module.exports = router;
