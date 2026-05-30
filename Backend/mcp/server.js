const express = require('express');
const mcpAuth = require('../middleware/mcp-auth');
const db = require('../db');

const mcpApp = express();
mcpApp.use(express.json());

// All MCP tool calls are POST requests and require auth
mcpApp.use(mcpAuth);

mcpApp.post('/tools/:tool_name', (req, res) => {
    const { tool_name } = req.params;
    const body = req.body || {};

    switch (tool_name) {
        case 'list_subnets':
            return db.all('SELECT * FROM subnets ORDER BY name', [], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            });

        case 'list_hosts':
            const { subnet_id } = body;
            const sql = subnet_id ? 'SELECT * FROM hosts WHERE subnet_id = ?' : 'SELECT * FROM hosts';
            const params = subnet_id ? [subnet_id] : [];
            return db.all(sql, params, (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            });
        
        case 'add_subnet':
            const { name, network, cidr } = body;
            if (!name || !network) {
                return res.status(400).json({ error: 'name and network are required' });
            }
            return db.run('INSERT INTO subnets (name, network, cidr) VALUES (?, ?, ?)', [name, network, cidr || 24], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: this.lastID, name, network, cidr });
            });

        case 'get_audit_log':
            const { limit = 20 } = body;
            return db.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            });

        default:
            return res.status(404).json({ error: `Tool '${tool_name}' not found.` });
    }
});

// Fallback for any other requests
mcpApp.all('*', (req, res) => {
    res.status(404).json({ error: 'MCP endpoint not found. All tool calls must be POST requests to /tools/<tool_name>.' });
});

module.exports = mcpApp;
