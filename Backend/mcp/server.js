const express = require('express');
const crypto = require('crypto');
const mcpAuth = require('../middleware/mcp-auth');
const db = require('../db');

const mcpApp = express();
mcpApp.use(express.json());

// State for active SSE sessions
let sessions = new Map();

// --- Claude Web Compatibility (OAuth2 Stubs) ---

// Claude web might try to "Authorize" first
mcpApp.get('/authorize', (req, res) => {
    // Redirect back with a dummy code
    const redirectUri = req.query.redirect_uri;
    const state = req.query.state;
    if (redirectUri) {
        const url = new URL(redirectUri);
        url.searchParams.set('code', 'dummy-code');
        url.searchParams.set('state', state);
        return res.redirect(url.toString());
    }
    res.status(200).send('Subnet Manager MCP Authorization - Please use your MCP Token.');
});

// Claude web might try to exchange the code for a token
mcpApp.post('/token', (req, res) => {
    res.json({
        access_token: require('../config').mcpToken,
        token_type: 'Bearer',
        expires_in: 3600
    });
});

// --- SSE Endpoint ---
mcpApp.get('/sse', mcpAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sessionId = crypto.randomUUID();
    
    // The spec requires sending the endpoint URL where Claude should POST messages
    const messageUrl = new URL('/messages', `${req.protocol}://${req.get('host')}`);
    messageUrl.searchParams.set('sessionId', sessionId);

    sessions.set(sessionId, { res });

    // Send the endpoint event
    res.write(`event: endpoint\ndata: ${messageUrl.toString()}\n\n`);

    req.on('close', () => {
        sessions.delete(sessionId);
    });
});

// --- Messages Endpoint ---
mcpApp.post('/messages', mcpAuth, async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = sessions.get(sessionId);
    
    if (!sessionId || !session) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }

    const message = req.body;
    const { jsonrpc, id, method, params } = message;

    if (jsonrpc !== '2.0') {
        return res.status(400).json({ error: 'Invalid JSON-RPC version' });
    }

    // Handle MCP Methods
    switch (method) {
        case 'initialize':
            return sendResponse(session, id, {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: 'subnet-manager',
                    version: '1.0.0'
                }
            });

        case 'notifications/initialized':
            return res.status(202).end();

        case 'tools/list':
            return sendResponse(session, id, {
                tools: [
                    {
                        name: 'list_subnets',
                        description: 'List all configured subnets',
                        inputSchema: { type: 'object', properties: {} }
                    },
                    {
                        name: 'list_hosts',
                        description: 'List hosts, optionally filtered by subnet',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                subnet_id: { type: 'integer', description: 'Filter by subnet ID' }
                            }
                        }
                    },
                    {
                        name: 'add_subnet',
                        description: 'Create a new subnet',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                network: { type: 'string', description: 'e.g. 10.10.1.0' },
                                cidr: { type: 'integer', default: 24 }
                            },
                            required: ['name', 'network']
                        }
                    }
                ]
            });

        case 'tools/call':
            const toolResult = await handleToolCall(params.name, params.arguments);
            return sendResponse(session, id, {
                content: [{ type: 'text', text: JSON.stringify(toolResult) }]
            });

        default:
            return sendResponse(session, id, {
                error: { code: -32601, message: `Method not found: ${method}` }
            }, true);
    }
});

const sendResponse = (session, id, result, isError = false) => {
    const response = {
        jsonrpc: '2.0',
        id,
        [isError ? 'error' : 'result']: result
    };
    session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    return true;
};

async function handleToolCall(name, args) {
    return new Promise((resolve) => {
        switch (name) {
            case 'list_subnets':
                db.all('SELECT * FROM subnets', [], (err, rows) => {
                    resolve(err ? { error: err.message } : rows);
                });
                break;
            case 'list_hosts':
                const sql = args.subnet_id ? 'SELECT * FROM hosts WHERE subnet_id = ?' : 'SELECT * FROM hosts';
                const params = args.subnet_id ? [args.subnet_id] : [];
                db.all(sql, params, (err, rows) => {
                    resolve(err ? { error: err.message } : rows);
                });
                break;
            case 'add_subnet':
                db.run('INSERT INTO subnets (name, network, cidr) VALUES (?, ?, ?)', 
                    [args.name, args.network, args.cidr || 24], 
                    function(err) {
                        resolve(err ? { error: err.message } : { id: this.lastID, success: true });
                    }
                );
                break;
            default:
                resolve({ error: 'Unknown tool' });
        }
    });
}

module.exports = mcpApp;
