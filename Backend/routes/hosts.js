const express = require('express');
const router = express.Router({ mergeParams: true }); // Enable passing params from parent routers
const db = require('../db');

// This router handles:
// GET /api/v1/subnets/:subnet_id/hosts
// POST /api/v1/subnets/:subnet_id/hosts
// PUT /api/v1/hosts/:id
// DELETE /api/v1/hosts/:id

// GET all hosts for a subnet
router.get('/', (req, res) => {
    const { subnet_id } = req.params;
    if (!subnet_id) {
        return res.status(400).json({ error: 'Subnet ID is required to list hosts.' });
    }
    db.all('SELECT * FROM hosts WHERE subnet_id = ? ORDER BY ip', [subnet_id], (err, rows) => {
        if (err) {
            console.error(`Error fetching hosts for subnet ${subnet_id}:`, err);
            return res.status(500).json({ error: 'Database error fetching hosts.' });
        }
        res.json(rows);
    });
});

// POST a new host to a subnet
router.post('/', (req, res) => {
    const { subnet_id } = req.params;
    const { ip, name, description, notes, type } = req.body;
    if (!ip || !name) {
        return res.status(400).json({ error: 'IP address and name are required.' });
    }

    const sql = `INSERT INTO hosts (subnet_id, ip, name, description, notes, type) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [subnet_id, ip, name, description, notes, type], function(err) {
        if (err) {
            console.error('Error creating host:', err);
            return res.status(500).json({ error: 'Failed to create host. IP may already exist.' });
        }
        res.status(201).json({ id: this.lastID, subnet_id, ...req.body });
    });
});

// PUT (update) a host by its own ID
router.put('/:id', (req, res) => {
    res.status(501).json({ message: 'Host update not fully implemented yet.' });
});

// DELETE a host by its own ID
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM hosts WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            console.error('Error deleting host:', err);
            return res.status(500).json({ error: 'Failed to delete host.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Host not found.' });
        }
        res.status(200).json({ message: 'Host deleted successfully.' });
    });
});

module.exports = router;
