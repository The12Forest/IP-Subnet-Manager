const express = require('express');
const mcpApp = express();

mcpApp.get('/', (req, res) => {
    res.status(200).send('MCP Server is running.');
});

// TODO: Implement MCP protocol over SSE transport
// GET /tools
// POST /conversations

module.exports = mcpApp;
