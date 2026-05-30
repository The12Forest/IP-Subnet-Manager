const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAction } = require('../utils/audit-log');

// GET /api/v1/subnets - List all subnets
router.get('/', (req, res) => {
    db.all('SELECT * FROM subnets ORDER BY display_order, name', [], (err, rows) => {
        if (err) {
            console.error('Error fetching subnets:', err);
            return res.status(500).json({ error: 'Database error fetching subnets.' });
        }
        res.json(rows);
    });
});

// POST /api/v1/subnets - Create a new subnet
router.post('/', (req, res) => {
    const { name, network, cidr = 24, description, color } = req.body;
    if (!name || !network) {
        return res.status(400).json({ error: 'Subnet name and network are required.' });
    }
    const sql = `INSERT INTO subnets (name, network, cidr, description, color) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [name, network, cidr, description, color], function(err) {
        if (err) {
            console.error('Error creating subnet:', err);
            return res.status(500).json({ error: 'Failed to create subnet.' });
        }
        logAction(req.user, 'create', 'subnet', this.lastID, { name, network, cidr });
        res.status(201).json({ id: this.lastID, ...req.body });
    });
});

// PUT /api/v1/subnets/:id - Update a subnet
router.put('/:id', (req, res) => {
    res.status(501).json({ message: 'Subnet update not fully implemented yet.' });
});

// DELETE /api/v1/subnets/:id - Delete a subnet (admin only)
router.delete('/:id', (req, res) => {
    const idToDelete = req.params.id;
    db.run('DELETE FROM subnets WHERE id = ?', [idToDelete], function(err) {
        if (err) {
            console.error('Error deleting subnet:', err);
            return res.status(500).json({ error: 'Failed to delete subnet.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Subnet not found.' });
        }
        logAction(req.user, 'delete', 'subnet', idToDelete, {});
        res.status(200).json({ message: 'Subnet deleted successfully.' });
    });
});

module.exports = router;
