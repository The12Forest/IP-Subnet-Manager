const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/v1/audit
router.get('/', (req, res) => {
    const { page = 1, limit = 50, userId, action, targetType } = req.query;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    const params = [];

    if (userId) {
        whereClauses.push('user_id = ?');
        params.push(userId);
    }
    if (action) {
        whereClauses.push('action = ?');
        params.push(action);
    }
    if (targetType) {
        whereClauses.push('target_type = ?');
        params.push(targetType);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as count FROM audit_log ${whereString}`;
    
    db.get(countSql, params, (err, countRow) => {
        if (err) {
            console.error('Error counting audit logs:', err);
            return res.status(500).json({ error: 'Database error counting audit logs.' });
        }

        const totalPages = Math.ceil(countRow.count / limit);
        const dataSql = `SELECT * FROM audit_log ${whereString} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        db.all(dataSql, params, (err, rows) => {
            if (err) {
                console.error('Error fetching audit logs:', err);
                return res.status(500).json({ error: 'Database error fetching audit logs.' });
            }
            res.json({
                data: rows,
                totalPages,
                currentPage: parseInt(page, 10),
            });
        });
    });
});

module.exports = router;
