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
  mcpToken: process.env.MCP_TOKEN || null,

  // HTTPS
  httpsMode: process.env.HTTPS_MODE || 'off', // off | self-signed | custom
  sslCertPath: process.env.SSL_CERT_PATH || '/app/Certs/server.cert',
  sslKeyPath: process.env.SSL_KEY_PATH || '/app/Certs/server.key',
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

module.exports = config;
