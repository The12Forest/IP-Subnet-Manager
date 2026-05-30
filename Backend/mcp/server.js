const express = require('express');
const cors = require('cors');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const mcpAuth = require('../middleware/mcp-auth');
const db = require('../db');

const mcpApp = express();

// 1. Initialize the official MCP Server
const server = new McpServer({
    name: "subnet-manager",
    version: "1.0.0"
});

// 2. Define Tools using the SDK
server.tool(
    "list_subnets",
    {},
    async () => {
        return new Promise((resolve) => {
            db.all('SELECT * FROM subnets', [], (err, rows) => {
                if (err) resolve({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
                else resolve({ content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] });
            });
        });
    }
);

server.tool(
    "list_hosts",
    { subnet_id: z.number().optional() },
    async ({ subnet_id }) => {
        return new Promise((resolve) => {
            const sql = subnet_id ? 'SELECT * FROM hosts WHERE subnet_id = ?' : 'SELECT * FROM hosts';
            const params = subnet_id ? [subnet_id] : [];
            db.all(sql, params, (err, rows) => {
                if (err) resolve({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
                else resolve({ content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] });
            });
        });
    }
);

server.tool(
    "add_subnet",
    {
        name: z.string(),
        network: z.string().describe("e.g. 10.10.1.0"),
        cidr: z.number().default(24)
    },
    async ({ name, network, cidr }) => {
        return new Promise((resolve) => {
            db.run('INSERT INTO subnets (name, network, cidr) VALUES (?, ?, ?)', 
                [name, network, cidr], 
                function(err) {
                    if (err) resolve({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
                    else resolve({ content: [{ type: "text", text: `Subnet created with ID: ${this.lastID}` }] });
                }
            );
        });
    }
);

// 3. Web Setup (SSE Transport)
// Note: We need a way to map multiple connections. The SDK transport handles one connection.
// For simplicity in a multi-client web env, we can create a transport per request.
let transport;

mcpApp.get('/sse', mcpAuth, async (req, res) => {
    console.log('[MCP] New SSE connection');
    transport = new SSEServerTransport('/mcp/messages', res);
    await server.connect(transport);
});

mcpApp.post('/messages', mcpAuth, async (req, res) => {
    if (!transport) {
        return res.status(400).send('Session not initialized');
    }
    await transport.handlePostMessage(req, res);
});

// --- OAuth2 Stubs for Claude Web ---
mcpApp.get('/authorize', (req, res) => {
    const redirectUri = req.query.redirect_uri;
    const state = req.query.state;
    if (redirectUri) {
        const url = new URL(redirectUri);
        url.searchParams.set('code', 'dummy-code');
        if (state) url.searchParams.set('state', state);
        return res.redirect(url.toString());
    }
    res.status(200).send('Authorized. Please use your MCP token in Claude.');
});

mcpApp.post('/token', (req, res) => {
    res.json({
        access_token: require('../config').mcpToken,
        token_type: 'Bearer',
        expires_in: 3600
    });
});

module.exports = mcpApp;

module.exports = mcpApp;
