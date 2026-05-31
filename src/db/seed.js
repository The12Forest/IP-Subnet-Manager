'use strict';

const db = require('./schema');

const defaults = [
  { key: 'setup_complete',   value: 'false',          description: 'Whether the setup wizard has been completed' },
  { key: 'app_name',         value: 'Subnet Manager', description: 'Application display name shown in the top bar' },
  { key: 'check_interval',   value: '60',             description: 'Seconds between automatic status checks' },
  { key: 'check_enabled',    value: 'true',           description: 'Enable or disable background status checks globally' },
  { key: 'check_timeout',    value: '2000',           description: 'TCP/ping timeout in milliseconds' },
  { key: 'mcp_enabled',      value: 'true',           description: 'Enable or disable the built-in MCP server' },
  { key: 'theme_default',    value: 'dark',           description: 'Default UI theme: dark or light' },
  { key: 'max_users',        value: '0',              description: 'Maximum number of user accounts (0 = unlimited)' },
  { key: 'session_timeout',  value: '3600',           description: 'Idle session timeout in seconds' },
  { key: 'base_network',     value: '',               description: 'Base network address configured during setup' },
  { key: 'base_cidr',        value: '24',             description: 'Default subnet CIDR prefix' },
  { key: 'network_mode',     value: 'bridge',         description: 'Network mode label: macvlan, ipvlan, bridge, host' },
  { key: 'bind_host',             value: '0.0.0.0',      description: 'Host/IP to bind the server to (requires restart)' },
  { key: 'port',                  value: '3000',          description: 'Web UI port (requires restart; Docker users must also update port mapping)' },
  { key: 'mcp_port',              value: '3001',          description: 'MCP server port (requires restart; Docker users must also update port mapping)' },
  { key: 'mcp_oauth_client_id',     value: 'claude-client', description: 'OAuth Client ID for claude.ai MCP integration' },
  { key: 'mcp_oauth_client_secret', value: '',             description: 'OAuth Client Secret for claude.ai MCP integration' },
  { key: 'backup_enabled',          value: 'false',        description: 'Enable automatic database backups' },
  { key: 'backup_interval_hours',   value: '24',           description: 'Hours between automatic backups' },
  { key: 'backup_max_count',        value: '7',            description: 'Maximum number of backup files to keep' },
  { key: 'backup_last_run',         value: '',             description: 'ISO timestamp of the last automatic backup' },
];

const insert = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, datetime(\'now\'))'
);

const seedAll = db.transaction(() => {
  for (const s of defaults) {
    insert.run(s.key, s.value, s.description);
  }
});

seedAll();

module.exports = {};
