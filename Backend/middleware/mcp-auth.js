const crypto = require('crypto');

const mcpAuth = (req, res, next) => {
    const config = require('../config'); 
    const actualToken = config.mcpToken;
    
    if (!actualToken) {
        return res.status(503).json({ error: 'MCP server is not configured with a token.' });
    }

    let providedToken = null;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedToken = authHeader.split(' ')[1];
        console.log('[MCP] Auth: Token provided via Header');
    } 
    // 2. Check query parameters (fallback for SSE/EventSource)
    else if (req.query.token) {
        providedToken = req.query.token;
        console.log('[MCP] Auth: Token provided via ?token= query param');
    }
    else if (req.query.apiKey) {
        providedToken = req.query.apiKey;
        console.log('[MCP] Auth: Token provided via ?apiKey= query param');
    }

    if (!providedToken) {
        console.warn(`[MCP] Auth Failed: No token provided in header or query string. Path: ${req.path}`);
        return res.status(401).json({ error: 'Authorization token is required (via Header or query param).' });
    }

    // timingSafeEqual requires buffers of the same length.
    if (providedToken.length !== actualToken.length) {
        console.warn('[MCP] Auth Failed: Token length mismatch');
        return res.status(403).json({ error: 'Invalid MCP token.' });
    }

    try {
        const a = Buffer.from(providedToken);
        const b = Buffer.from(actualToken);
        if (!crypto.timingSafeEqual(a, b)) {
            console.warn('[MCP] Auth Failed: Token content mismatch');
            return res.status(403).json({ error: 'Invalid MCP token.' });
        }
    } catch (err) {
        console.error('[MCP] Auth Error:', err.message);
        return res.status(403).json({ error: 'Authorization failed.' });
    }

    next();
};
module.exports = mcpAuth;
