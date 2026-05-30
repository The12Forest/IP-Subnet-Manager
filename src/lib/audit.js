'use strict';

const db = require('../db/schema');

const stmt = db.prepare(`
  INSERT INTO audit_log (user_id, username, action, target_type, target_id, details, created_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);

function audit(user, action, targetType, targetId, details = {}) {
  try {
    stmt.run(
      user ? user.id : null,
      user ? user.username : 'system',
      action,
      targetType,
      String(targetId),
      JSON.stringify(details)
    );
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

module.exports = audit;
