const crypto = require('crypto');
require('dotenv').config();

const config = {
  // Server
  port: process.env.PORT || 3000,
  mcpPort: process.env.MCP_PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Security
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  mcpToken: process.env.MCP_TOKEN || crypto.randomBytes(32).toString('hex'),

  // HTTPS
  httpsMode: process.env.HTTPS_MODE || 'off', // off | self-signed | custom
  sslCertPath: process.env.SSL_CERT_PATH || 'Certs/server.cert',
  sslKeyPath: process.env.SSL_KEY_PATH || 'Certs/server.key',
  hostname: process.env.HOSTNAME || 'localhost',

  // Status Checks
  checkInterval: parseInt(process.env.CHECK_INTERVAL, 10) || 60,
  checkTimeout: parseInt(process.env.CHECK_TIMEOUT, 10) || 2000,
  checkEnabled: process.env.CHECK_ENABLED ? process.env.CHECK_ENABLED === 'true' : true,

  // App Behaviour
  setupWizard: process.env.SETUP_WIZARD || 'auto', // auto | force | skip
  maxUsers: parseInt(process.env.MAX_USERS, 10) || 0,
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT, 10) || 3600,

  // Database
  dbPath: 'Backend/data/subnet-manager.db',
};

// Validate required config
if (!config.jwtSecret) {
  throw new Error('FATAL ERROR: JWT_SECRET is not defined.');
}

// Log the auto-generated MCP token if it wasn't provided by the user
if (!process.env.MCP_TOKEN) {
    console.log(`
-------------------------------------------------------------------
[CONFIG] No MCP_TOKEN provided. A secure token has been generated.
This token is required for authenticating with the MCP server.
You can set it permanently in your .env or docker-compose file.
MCP Token: ${config.mcpToken}
-------------------------------------------------------------------
    `);
}

module.exports = config;
