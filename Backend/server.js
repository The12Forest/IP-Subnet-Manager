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

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const authMiddleware = require('./middleware/auth');
const adminMiddleware = require('./middleware/admin');
const editorMiddleware = require('./middleware/editor');

// API Routes
app.use('/api/v1/setup', require('./routes/setup'));
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/users', authMiddleware, adminMiddleware, require('./routes/users'));
app.use('/api/v1/settings', authMiddleware, adminMiddleware, require('./routes/settings'));
app.use('/api/v1/status', authMiddleware, require('./routes/status'));

const subnetsRouter = require('./routes/subnets');
const hostsRouter = require('./routes/hosts');

// Subnets can be viewed by any authenticated user
// Mutations require editor or admin
subnetsRouter.post('/', editorMiddleware);
subnetsRouter.put('/:id', editorMiddleware);
subnetsRouter.delete('/:id', adminMiddleware); // Delete is admin-only

// Hosts can be viewed by any authenticated user
// Mutations require editor or admin
hostsRouter.post('/', editorMiddleware);
hostsRouter.put('/:id', editorMiddleware);
hostsRouter.delete('/:id', editorMiddleware);

// Nest hosts router under subnets for creation/listing
subnetsRouter.use('/:subnet_id/hosts', hostsRouter);

app.use('/api/v1/subnets', authMiddleware, subnetsRouter);
app.use('/api/v1/hosts', authMiddleware, hostsRouter); // for top-level host updates


// Serve Frontend
const frontendPath = path.resolve(__dirname, '../Frontend');
app.use(express.static(frontendPath));

// Default catch-all route to serve index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
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
      // TODO: Check for certificate expiration
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

    // Main App Server
    const mainServer = credentials ? https.createServer(credentials, app) : http.createServer(app);
    mainServer.listen(config.port, () => {
      console.log(`Subnet Manager UI listening on ${protocol}://localhost:${config.port}`);
    });

    // MCP Server
    const mcpServer = credentials ? https.createServer(credentials, mcpServerApp) : http.createServer(mcpServerApp);
    mcpServer.listen(config.mcpPort, () => {
      console.log(`MCP Server listening on ${protocol}://localhost:${config.mcpPort}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
