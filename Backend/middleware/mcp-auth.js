const crypto = require('crypto');

const mcpAuth = (req, res, next) => {
    // This token is generated on startup if not provided in config.
    const config = require('../config'); 
    
    if (!config.mcpToken) {
        console.warn('MCP authentication is disabled because no token is configured.');
        return res.status(503).json({ error: 'MCP server is not configured with a token.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header in the format "Bearer <token>" is required.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Use a constant-time comparison to prevent timing attacks
    const a = Buffer.from(token);
    const b = Buffer.from(config.mcpToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Invalid MCP token.' });
    }

    next();
};
module.exports = mcpAuth;
