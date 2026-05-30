const db = require('../db');

/**
 * Logs an action to the audit_log table.
 * @param {object} user - The user object performing the action (can be null).
 * @param {string} action - The action performed ('create', 'update', 'delete').
 * @param {string} targetType - The type of object being modified ('host', 'subnet', 'user', etc.).
 * @param {string|number} targetId - The ID of the object being modified.
 * @param {object} details - A JSON object with before/after states or other info.
 */
const logAction = (user, action, targetType, targetId, details = {}) => {
    // Defer execution to not block the main request handler
    process.nextTick(() => {
        const { id: userId, username } = user || { id: null, username: 'system' };
        const detailsJson = JSON.stringify(details);
        const sql = `INSERT INTO audit_log (user_id, username, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`;
        
        db.run(sql, [userId, username, action, targetType, targetId, detailsJson], (err) => {
            if (err) {
                console.error('FATAL: Failed to write to audit log:', err);
            }
        });
    });
};

module.exports = { logAction };
