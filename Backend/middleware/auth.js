const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const authMiddleware = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: 'No token, authorization denied.' });
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        
        // Check if user still exists
        const sql = `SELECT id, username, role FROM users WHERE id = ?`;
        db.get(sql, [decoded.id], (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Token is not valid.' });
            }
            req.user = user;
            next();
        });
    } catch (err) {
        res.status(401).json({ error: 'Token is not valid.' });
    }
};

module.exports = authMiddleware;
