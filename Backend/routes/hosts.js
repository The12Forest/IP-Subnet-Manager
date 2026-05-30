const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const { logAction } = require('../utils/audit-log');
const { checkHostStatus } = require('../utils/status-checker');

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
        logAction(req.user, 'create', 'host', this.lastID, { ip, name, subnet_id });
        res.status(201).json({ id: this.lastID, subnet_id, ...req.body });
    });
});

// POST /api/v1/hosts/:id/check - Manual status check for a single host
router.post('/:id/check', (req, res) => {
    db.get('SELECT * FROM hosts WHERE id = ?', [req.params.id], async (err, host) => {
        if (err) {
            console.error(`Error finding host ${req.params.id} for check:`, err);
            return res.status(500).json({ error: 'Database error.' });
        }
        if (!host) {
            return res.status(404).json({ error: 'Host not found.' });
        }

        try {
            const result = await checkHostStatus(host);
            res.json(result);
        } catch (error) {
            console.error(`Error checking host ${req.params.id}:`, error);
            res.status(500).json({ error: 'An error occurred while checking host status.' });
        }
    });
});

// PUT (update) a host by its own ID
router.put('/:id', (req, res) => {
    res.status(501).json({ message: 'Host update not fully implemented yet.' });
});

// DELETE a host by its own ID
router.delete('/:id', (req, res) => {
    const idToDelete = req.params.id;
    db.run('DELETE FROM hosts WHERE id = ?', [idToDelete], function(err) {
        if (err) {
            console.error('Error deleting host:', err);
            return res.status(500).json({ error: 'Failed to delete host.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Host not found.' });
        }
        logAction(req.user, 'delete', 'host', idToDelete, {});
        res.status(200).json({ message: 'Host deleted successfully.' });
    });
});

module.exports = router;
