'use strict';

const crypto = require('crypto');

if (!process.env.JWT_SECRET) {
  console.error('[config] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

function parseExpiryMs(str) {
  const n = parseInt(str, 10);
  if (!n) return 7 * 86400000;
  if (str.endsWith('d')) return n * 86400000;
  if (str.endsWith('h')) return n * 3600000;
  if (str.endsWith('m')) return n * 60000;
  return n * 1000;
}

let mcpToken = process.env.MCP_TOKEN;
if (!mcpToken) {
  mcpToken = crypto.randomUUID();
  console.log(`[config] MCP_TOKEN not set — generated token: ${mcpToken}`);
  console.log('[config] Add MCP_TOKEN to your .env to make this persistent.');
}

const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  MCP_PORT: parseInt(process.env.MCP_PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  JWT_SECRET:    process.env.JWT_SECRET,
  JWT_EXPIRY:    process.env.JWT_EXPIRY || '7d',
  JWT_EXPIRY_MS: parseExpiryMs(process.env.JWT_EXPIRY || '7d'),

  MCP_TOKEN: mcpToken,

  HTTPS_MODE: process.env.HTTPS_MODE || 'off',
  SSL_CERT_PATH: process.env.SSL_CERT_PATH || '',
  SSL_KEY_PATH: process.env.SSL_KEY_PATH || '',
  HOSTNAME: process.env.HOSTNAME || 'localhost',

  CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL || '60', 10),
  CHECK_TIMEOUT: parseInt(process.env.CHECK_TIMEOUT || '2000', 10),
  CHECK_ENABLED: process.env.CHECK_ENABLED !== 'false',

  SETUP_WIZARD: process.env.SETUP_WIZARD || 'auto',
  MAX_USERS: parseInt(process.env.MAX_USERS || '0', 10),
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT || '3600', 10),

  DATA_DIR:  process.env.DATA_DIR  || './data',
  BIND_HOST: process.env.BIND_HOST || '0.0.0.0',

  // OAuth for claude.ai web integration
  MCP_OAUTH_CLIENT_ID:     process.env.MCP_OAUTH_CLIENT_ID     || 'claude-client',
  MCP_OAUTH_CLIENT_SECRET: process.env.MCP_OAUTH_CLIENT_SECRET || '',
};

module.exports = config;
