'use strict';

const http    = require('http');
const https   = require('https');
const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const db      = require('../db/schema');
const config  = require('../config');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBase(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host  = req.get('x-forwarded-host')  || req.get('host');
  return `${proto}://${host}`;
}

// In-memory store for authorization codes (short-lived, single-server)
const authCodes = new Map();

// Clean up expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) authCodes.delete(code);
  }
}, 300000);

// ── OAuth Discovery endpoints (no auth required) ────────────────────────────

// Protected Resource Metadata — tells clients where the auth server lives
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const base = getBase(req);
  res.json({
    resource:                  `${base}/mcp`,
    authorization_servers:     [base],
    bearer_methods_supported:  ['header'],
    scopes_supported:          ['mcp'],
  });
});

// Authorization Server Metadata — describes our OAuth server capabilities
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = getBase(req);
  res.json({
    issuer:                                 base,
    authorization_endpoint:                `${base}/oauth/authorize`,
    token_endpoint:                        `${base}/oauth/token`,
    registration_endpoint:                 `${base}/oauth/register`,
    scopes_supported:                      ['mcp'],
    response_types_supported:              ['code'],
    grant_types_supported:                 ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported:      ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
  });
});

// Dynamic client registration — accept and echo back; we validate by matching
// the configured CLIENT_ID/SECRET at token time, not at registration time
app.post('/oauth/register', (req, res) => {
  const body = req.body || {};
  res.status(201).json({
    client_id:              config.MCP_OAUTH_CLIENT_ID,
    client_secret:          config.MCP_OAUTH_CLIENT_SECRET || undefined,
    client_id_issued_at:    Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    redirect_uris:          body.redirect_uris || [],
    token_endpoint_auth_method: body.token_endpoint_auth_method || 'client_secret_post',
    grant_types:            body.grant_types || ['authorization_code'],
    response_types:         body.response_types || ['code'],
  });
});

// Authorization endpoint — auto-approves (this is your personal server)
app.get('/oauth/authorize', (req, res) => {
  const {
    client_id,
    redirect_uri,
    response_type,
    state,
    code_challenge,
    code_challenge_method,
  } = req.query;

  if (!redirect_uri) {
    return res.status(400).send('<h2>Missing redirect_uri</h2>');
  }
  if (response_type !== 'code') {
    return res.status(400).send('<h2>Only response_type=code is supported</h2>');
  }

  // Generate a short-lived authorization code
  const code = crypto.randomBytes(32).toString('hex');
  authCodes.set(code, {
    clientId:            client_id,
    redirectUri:         redirect_uri,
    codeChallenge:       code_challenge       || null,
    codeChallengeMethod: code_challenge_method || null,
    expiresAt:           Date.now() + 60000,   // 1 minute
  });

  // Immediately redirect back — auto-approve, no consent page needed
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);

  res.redirect(url.toString());
});

// Token endpoint — exchange code or client credentials for an access token
app.post('/oauth/token', (req, res) => {
  const grantType = req.body.grant_type;

  // ── Client Credentials grant ─────────────────────────────────────────────
  if (grantType === 'client_credentials') {
    const { clientId, clientSecret } = extractClientCredentials(req);

    if (!validateClient(clientId, clientSecret)) {
      return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
    }

    const token = issueToken(clientId);
    return res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
  }

  // ── Authorization Code grant ─────────────────────────────────────────────
  if (grantType === 'authorization_code') {
    const { code, redirect_uri, code_verifier } = req.body;
    const { clientId } = extractClientCredentials(req);

    const stored = authCodes.get(code);
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired or not found' });
    }
    authCodes.delete(code);

    // Verify redirect_uri matches
    if (redirect_uri && redirect_uri !== stored.redirectUri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }

    // Verify PKCE if code_challenge was provided
    if (stored.codeChallenge) {
      if (!code_verifier) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'code_verifier required' });
      }
      const hash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
      if (hash !== stored.codeChallenge) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }
    }

    const sub = clientId || stored.clientId;
    const token = issueToken(sub);
    return res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
});

function extractClientCredentials(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const sep     = decoded.indexOf(':');
    return {
      clientId:     decodeURIComponent(decoded.slice(0, sep)),
      clientSecret: decodeURIComponent(decoded.slice(sep + 1)),
    };
  }
  return { clientId: req.body.client_id, clientSecret: req.body.client_secret };
}

function getOAuthCredentials() {
  // DB settings take priority over env/config (live-editable from the UI)
  const idRow     = db.prepare("SELECT value FROM settings WHERE key='mcp_oauth_client_id'").get();
  const secretRow = db.prepare("SELECT value FROM settings WHERE key='mcp_oauth_client_secret'").get();
  return {
    clientId:     (idRow     && idRow.value)     || config.MCP_OAUTH_CLIENT_ID,
    clientSecret: (secretRow && secretRow.value) || config.MCP_OAUTH_CLIENT_SECRET,
  };
}

function validateClient(clientId, clientSecret) {
  const creds = getOAuthCredentials();
  const okId     = clientId === creds.clientId;
  const okSecret = !creds.clientSecret || clientSecret === creds.clientSecret;
  return okId && okSecret;
}

function issueToken(sub) {
  return jwt.sign({ sub, scope: 'mcp' }, config.JWT_SECRET, { expiresIn: '1h' });
}

// Health check — no auth
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'subnet-manager-mcp', version: '1.0.0' });
});

// ── Bearer token auth middleware (runs AFTER public endpoints above) ─────────

app.use((req, res, next) => {
  const auth = (req.headers['authorization'] || '').trim();
  if (!auth.startsWith('Bearer ')) {
    return res
      .status(401)
      .setHeader('WWW-Authenticate', `Bearer realm="${getBase(req)}/mcp"`)
      .json({ error: 'Unauthorized — provide Authorization: Bearer <token>' });
  }

  const token = auth.slice(7);

  // Accept the static MCP_TOKEN (Claude Desktop / manual curl)
  if (token === config.MCP_TOKEN) return next();

  // Accept JWT access tokens issued by our OAuth server
  try {
    jwt.verify(token, config.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized — token invalid or expired' });
  }
});

// ── MCP session management ───────────────────────────────────────────────────

const sessions = new Map(); // sessionId -> { sseRes: res | null }

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_subnets',
    description: 'List all configured subnets',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_hosts',
    description: 'List hosts, optionally filtered by subnet ID',
    inputSchema: {
      type: 'object',
      properties: { subnet_id: { type: 'number', description: 'Filter by subnet ID' } },
    },
  },
  {
    name: 'get_host',
    description: 'Get a host by IP address',
    inputSchema: {
      type: 'object',
      properties: { ip: { type: 'string' } },
      required: ['ip'],
    },
  },
  {
    name: 'add_host',
    description: 'Add a new host to a subnet',
    inputSchema: {
      type: 'object',
      properties: {
        subnet_id:   { type: 'number' },
        ip:          { type: 'string' },
        name:        { type: 'string' },
        description: { type: 'string' },
        check_port:  { type: 'number' },
      },
      required: ['subnet_id', 'ip'],
    },
  },
  {
    name: 'update_host',
    description: 'Update host details by IP',
    inputSchema: {
      type: 'object',
      properties: {
        ip:          { type: 'string' },
        name:        { type: 'string' },
        description: { type: 'string' },
        check_port:  { type: 'number' },
        notes:       { type: 'string' },
      },
      required: ['ip'],
    },
  },
  {
    name: 'remove_host',
    description: 'Remove a host by IP',
    inputSchema: {
      type: 'object',
      properties: { ip: { type: 'string' } },
      required: ['ip'],
    },
  },
  {
    name: 'check_status',
    description: 'Check status of one host (by IP) or all hosts',
    inputSchema: {
      type: 'object',
      properties: { ip: { type: 'string', description: 'Omit to check all hosts' } },
    },
  },
  {
    name: 'add_subnet',
    description: 'Add a new subnet',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string' },
        network:     { type: 'string' },
        cidr:        { type: 'number' },
        description: { type: 'string' },
        color:       { type: 'string' },
      },
      required: ['name', 'network'],
    },
  },
  {
    name: 'update_subnet',
    description: 'Update a subnet by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id:          { type: 'number' },
        name:        { type: 'string' },
        description: { type: 'string' },
        color:       { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_subnet',
    description: 'Remove a subnet (and all its hosts) by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    name: 'get_settings',
    description: 'Get all application settings',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_setting',
    description: 'Update a single setting value',
    inputSchema: {
      type: 'object',
      properties: {
        key:   { type: 'string' },
        value: { type: 'string' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'search',
    description: 'Search hosts by IP, name, or description',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_audit_log',
    description: 'Get recent audit log entries',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max entries to return (default 20)' } },
    },
  },
];

// ── Tool handlers ────────────────────────────────────────────────────────────

function toolResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false };
}

function toolError(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

async function callTool(name, args) {
  try {
    switch (name) {
      case 'list_subnets': {
        const rows = db.prepare(`
          SELECT s.*, COUNT(h.id) AS hosts_count
          FROM subnets s LEFT JOIN hosts h ON h.subnet_id = s.id
          GROUP BY s.id ORDER BY s.display_order ASC
        `).all();
        return toolResult(rows);
      }

      case 'list_hosts': {
        const rows = args.subnet_id
          ? db.prepare('SELECT * FROM hosts WHERE subnet_id = ? ORDER BY ip ASC').all(args.subnet_id)
          : db.prepare('SELECT * FROM hosts ORDER BY subnet_id ASC, ip ASC').all();
        return toolResult(rows);
      }

      case 'get_host': {
        const host = db.prepare('SELECT * FROM hosts WHERE ip = ?').get(args.ip);
        return host ? toolResult(host) : toolError(`Host not found: ${args.ip}`);
      }

      case 'add_host': {
        const r = db.prepare(`
          INSERT INTO hosts (subnet_id, ip, name, description, check_port, check_enabled, last_status, created_at)
          VALUES (?, ?, ?, ?, ?, 1, 'unknown', datetime('now'))
        `).run(args.subnet_id, args.ip, args.name || null, args.description || null, args.check_port || null);
        return toolResult(db.prepare('SELECT * FROM hosts WHERE id = ?').get(r.lastInsertRowid));
      }

      case 'update_host': {
        const host = db.prepare('SELECT * FROM hosts WHERE ip = ?').get(args.ip);
        if (!host) return toolError(`Host not found: ${args.ip}`);
        db.prepare('UPDATE hosts SET name=?, description=?, check_port=?, notes=? WHERE ip=?').run(
          args.name        !== undefined ? args.name        : host.name,
          args.description !== undefined ? args.description : host.description,
          args.check_port  !== undefined ? args.check_port  : host.check_port,
          args.notes       !== undefined ? args.notes       : host.notes,
          args.ip
        );
        return toolResult(db.prepare('SELECT * FROM hosts WHERE ip = ?').get(args.ip));
      }

      case 'remove_host': {
        const host = db.prepare('SELECT * FROM hosts WHERE ip = ?').get(args.ip);
        if (!host) return toolError(`Host not found: ${args.ip}`);
        db.prepare('DELETE FROM hosts WHERE ip = ?').run(args.ip);
        return toolResult({ removed: args.ip });
      }

      case 'check_status': {
        const { checkHost, startCheckerCycle } = require('../lib/checker');
        if (args.ip) {
          const host = db.prepare('SELECT * FROM hosts WHERE ip = ?').get(args.ip);
          if (!host) return toolError(`Host not found: ${args.ip}`);
          const status = await checkHost(host);
          return toolResult({ ip: args.ip, status });
        }
        await startCheckerCycle();
        return toolResult(db.prepare('SELECT ip, last_status FROM hosts').all());
      }

      case 'add_subnet': {
        const r = db.prepare(`
          INSERT INTO subnets (name, network, cidr, description, color, display_order, created_at)
          VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order),-1)+1 FROM subnets), datetime('now'))
        `).run(args.name, args.network, args.cidr || 24, args.description || null, args.color || null);
        return toolResult(db.prepare('SELECT * FROM subnets WHERE id = ?').get(r.lastInsertRowid));
      }

      case 'update_subnet': {
        const s = db.prepare('SELECT * FROM subnets WHERE id = ?').get(args.id);
        if (!s) return toolError(`Subnet not found: ${args.id}`);
        db.prepare('UPDATE subnets SET name=?, description=?, color=? WHERE id=?').run(
          args.name        !== undefined ? args.name        : s.name,
          args.description !== undefined ? args.description : s.description,
          args.color       !== undefined ? args.color       : s.color,
          args.id
        );
        return toolResult(db.prepare('SELECT * FROM subnets WHERE id = ?').get(args.id));
      }

      case 'remove_subnet': {
        const s = db.prepare('SELECT * FROM subnets WHERE id = ?').get(args.id);
        if (!s) return toolError(`Subnet not found: ${args.id}`);
        db.prepare('DELETE FROM subnets WHERE id = ?').run(args.id);
        return toolResult({ removed: args.id });
      }

      case 'get_settings':
        return toolResult(db.prepare('SELECT key, value, description FROM settings ORDER BY key ASC').all());

      case 'update_setting':
        db.prepare(`
          INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        `).run(args.key, String(args.value));
        return toolResult({ key: args.key, value: args.value });

      case 'search': {
        const q = `%${args.query}%`;
        const rows = db.prepare(`
          SELECT h.*, s.name AS subnet_name FROM hosts h
          JOIN subnets s ON s.id = h.subnet_id
          WHERE h.ip LIKE ? OR h.name LIKE ? OR h.description LIKE ?
          ORDER BY h.ip ASC
        `).all(q, q, q);
        return toolResult(rows);
      }

      case 'get_audit_log': {
        const limit = Math.min(100, args.limit || 20);
        return toolResult(db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit));
      }

      default:
        return toolError(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return toolError(`Tool error: ${err.message}`);
  }
}

// ── JSON-RPC dispatcher ──────────────────────────────────────────────────────

async function handleRpc(body) {
  const { jsonrpc, id, method, params = {} } = body;

  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } };
  }

  switch (method) {
    case 'initialize': {
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, { sseRes: null });
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'subnet-manager', version: '1.0.0' },
        },
        _sessionId: sessionId,
      };
    }

    case 'notifications/initialized':
      return null;

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

    case 'tools/call': {
      const result = await callTool(params.name, params.arguments || {});
      return { jsonrpc: '2.0', id, result };
    }

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ── MCP routes ───────────────────────────────────────────────────────────────

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const body      = req.body;

  if (body.method !== 'initialize' && body.method !== 'notifications/initialized') {
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found — call initialize first' });
    }
  }

  const rpc = await handleRpc(body);

  if (rpc === null) return res.status(202).end();

  if (body.method === 'initialize' && rpc._sessionId) {
    res.setHeader('Mcp-Session-Id', rpc._sessionId);
    delete rpc._sessionId;
  }

  res.json(rpc);
});

app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sessions.get(sessionId).sseRes = res;

  const ping = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { clearInterval(ping); }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    const s = sessions.get(sessionId);
    if (s) s.sseRes = null;
  });
});

app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId) sessions.delete(sessionId);
  res.status(200).json({ ok: true });
});

// ── Start ────────────────────────────────────────────────────────────────────

function start(port, tlsOpts) {
  const server = tlsOpts && tlsOpts.key && tlsOpts.cert
    ? require('https').createServer(tlsOpts, app)
    : require('http').createServer(app);

  server.listen(port, config.BIND_HOST, () => {
    const proto = tlsOpts ? 'https' : 'http';
    const creds = getOAuthCredentials();
    console.log(`[mcp] Server listening on ${config.BIND_HOST}:${port}`);
    console.log(`[mcp] ─────────────────────────────────────────────`);
    console.log(`[mcp] Claude.ai web integration:`);
    console.log(`[mcp]   MCP URL:             ${proto}://<your-public-url>/mcp`);
    console.log(`[mcp]   OAuth Client ID:     ${creds.clientId}`);
    console.log(`[mcp]   OAuth Client Secret: ${creds.clientSecret || '(not set)'}`);
    console.log(`[mcp]   Settings → About tab shows full setup info`);
    console.log(`[mcp] ─────────────────────────────────────────────`);
  });

  return server;
}

module.exports = { start };
