const express = require('express');
const router = express.Router();
const db = require('../db');

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

const { logAction } = require('../utils/audit-log');

// ... (in POST)
    db.run(sql, [name, network, cidr, description, color], function(err) {
        if (err) {
            console.error('Error creating subnet:', err);
            return res.status(500).json({ error: 'Failed to create subnet.' });
        }
        logAction(req.user, 'create', 'subnet', this.lastID, { name, network, cidr });
        res.status(201).json({ id: this.lastID, ...req.body });
    });
// ... (in DELETE)
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
