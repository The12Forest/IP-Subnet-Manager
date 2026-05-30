const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const selfsigned = require('selfsigned');

const config = require('./config');
const createSchema = require('./db/schema');
const mcpServerApp = require('./mcp/server');
const { sseMiddleware } = require('./utils/sse');
const { checkHostStatus } = require('./utils/status-checker');
const db = require('./db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');
const editorMiddleware = require('./middleware/editor');

// --- Standard MCP Discovery (at root) ---
app.get('/.well-known/mcp', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  res.json({
      mcp_endpoint: `${baseUrl}/mcp/sse`,
      authorization_servers: [baseUrl]
  });
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/mcp/authorize`,
      token_endpoint: `${baseUrl}/mcp/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic']
  });
});

// API Routes
app.use('/api/v1/setup', require('./routes/setup'));
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/users', authMiddleware, adminMiddleware, require('./routes/users'));
app.use('/api/v1/settings', authMiddleware, adminMiddleware, require('./routes/settings'));
app.use('/api/v1/status', authMiddleware, require('./routes/status'));
app.use('/api/v1/audit', authMiddleware, adminMiddleware, require('./routes/audit'));
app.use('/api/v1/export', authMiddleware, require('./routes/export'));
app.use('/api/v1/import', authMiddleware, adminMiddleware, require('./routes/import'));
app.use('/api/v1/events', authMiddleware, sseMiddleware);

// MCP Server (Merged on port 3000)
app.use('/mcp', mcpServerApp);

// Serve Frontend
const frontendPath = path.resolve(__dirname, '../Frontend');
app.use(express.static(frontendPath));

// Default catch-all route to serve index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/mcp/') || req.path.startsWith('/.well-known/')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const getSslCredentials = () => {
  if (config.httpsMode === 'off') {
    return null;
  }

  if (config.httpsMode === 'custom') {
    console.log('Using custom SSL certificates.');
    if (!fs.existsSync(config.sslKeyPath) || !fs.existsSync(config.sslCertPath)) {
      throw new Error(`Custom SSL certificate files not found. Please check paths:
- Key: ${config.sslKeyPath}
- Cert: ${config.sslCertPath}`);
    }
    return {
      key: fs.readFileSync(config.sslKeyPath),
      cert: fs.readFileSync(config.sslCertPath),
    };
  }

  if (config.httpsMode === 'self-signed') {
    console.log('Using self-signed SSL certificate.');
    const certDir = path.dirname(config.sslCertPath);
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

    if (fs.existsSync(config.sslKeyPath) && fs.existsSync(config.sslCertPath)) {
      console.log('Found existing self-signed certificate.');
      return {
        key: fs.readFileSync(config.sslKeyPath),
        cert: fs.readFileSync(config.sslCertPath),
      };
    }

    console.log('Generating new self-signed certificate...');
    const pems = selfsigned.generate([{ name: 'commonName', value: config.hostname }], {
      days: 825,
      algorithm: 'sha256',
      keySize: 2048,
    });

    fs.writeFileSync(config.sslKeyPath, pems.private);
    fs.writeFileSync(config.sslCertPath, pems.cert);
    console.log(`Self-signed certificate generated and saved to ${certDir}`);
    return { key: pems.private, cert: pems.cert };
  }

  return null;
};

const startServer = async () => {
  try {
    await createSchema();

    const credentials = getSslCredentials();
    const protocol = credentials ? 'https' : 'http';

    // Main App Server (UI + API + MCP)
    const mainServer = credentials ? https.createServer(credentials, app) : http.createServer(app);
    mainServer.listen(config.port, () => {
      console.log(`Subnet Manager listening on ${protocol}://localhost:${config.port}`);
      console.log(`MCP Discovery: ${protocol}://localhost:${config.port}/.well-known/mcp`);
    });

    // Start background status checker
    if (config.checkEnabled) {
        console.log(`Starting background status checker (interval: ${config.checkInterval}s)`);
        setInterval(() => {
            db.all('SELECT * FROM hosts WHERE check_enabled = 1', [], (err, hosts) => {
                if (err) {
                    console.error('Background check DB error:', err);
                    return;
                }
                hosts.forEach(checkHostStatus);
            });
        }, config.checkInterval * 1000);
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
