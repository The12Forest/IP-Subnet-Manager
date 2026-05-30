const crypto = require('crypto');

const mcpAuth = (req, res, next) => {
    const config = require('../config'); 
    
    if (!config.mcpToken) {
        return res.status(503).json({ error: 'MCP server is not configured with a token.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('[MCP] Missing or malformed Authorization header');
        return res.status(401).json({ error: 'Authorization header in the format "Bearer <token>" is required.' });
    }

    const providedToken = authHeader.split(' ')[1];
    const actualToken = config.mcpToken;
    
    // timingSafeEqual requires buffers of the same length.
    // We check length first to avoid an error.
    if (providedToken.length !== actualToken.length) {
        console.warn('[MCP] Invalid token length provided');
        return res.status(403).json({ error: 'Invalid MCP token.' });
    }

    try {
        const a = Buffer.from(providedToken);
        const b = Buffer.from(actualToken);
        if (!crypto.timingSafeEqual(a, b)) {
            console.warn('[MCP] Token mismatch');
            return res.status(403).json({ error: 'Invalid MCP token.' });
        }
    } catch (err) {
        console.error('[MCP] Auth error:', err.message);
        return res.status(403).json({ error: 'Authorization failed.' });
    }

    next();
};
module.exports = mcpAuth;
