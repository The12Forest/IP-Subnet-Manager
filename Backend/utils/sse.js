let clients = [];

/**
 * Sends an event to all connected SSE clients.
 * @param {object} data - The data to send.
 */
const sendEvent = (data) => {
    clients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}

`));
};

/**
 * Middleware to handle SSE connections.
 */
const sseMiddleware = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);
    console.log(`SSE client connected: ${clientId}`);

    // Send a welcome message
    res.write(`data: ${JSON.stringify({ type: 'hello' })}

`);

    req.on('close', () => {
        console.log(`SSE client disconnected: ${clientId}`);
        clients = clients.filter(client => client.id !== clientId);
    });
};

module.exports = {
    sseMiddleware,
    sendEvent,
};
