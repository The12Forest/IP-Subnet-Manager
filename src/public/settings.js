'use strict';

const SettingsPanel = {
  _settings: {},  // key -> enriched setting object
  _currentTab: 'general',

  open() {
    document.getElementById('settings-panel').classList.add('open');
    document.getElementById('settings-backdrop').classList.add('active');
    SettingsPanel.load();
  },

  close() {
    document.getElementById('settings-panel').classList.remove('open');
    document.getElementById('settings-backdrop').classList.remove('active');
  },

  tab(name) {
    SettingsPanel._currentTab = name;
    document.querySelectorAll('.panel-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name)
    );
    document.querySelectorAll('.tab-content').forEach(c =>
      c.classList.toggle('active', c.id === `tab-${name}`)
    );
    if (name === 'users')    UsersPanel.load();
    if (name === 'auditlog') SettingsPanel.loadAudit();
    if (name === 'about')    SettingsPanel.loadAbout();
  },

  async load() {
    try {
      const rows = await fetch('/api/v1/settings').then(r => r.json());
      SettingsPanel._settings = {};
      for (const r of rows) SettingsPanel._settings[r.key] = r;
      SettingsPanel._applyToForm();
    } catch (err) {
      console.error('[settings] Load error:', err);
    }
  },

  _get(key) {
    const r = SettingsPanel._settings[key];
    return r ? r.value : '';
  },

  _applyToForm() {
    const keys = [
      'app_name', 'bind_host', 'theme_default',
      'max_users', 'session_timeout',
      'port', 'mcp_port',
      'check_interval', 'check_timeout', 'check_enabled',
      'network_mode',
    ];
    for (const key of keys) {
      SettingsPanel._applyField(key);
    }
  },

  _applyField(key) {
    const inputId = `set-${key.replace(/_/g, '-')}`;
    const labelId = `label-${key.replace(/_/g, '-')}`;
    const el      = document.getElementById(inputId);
    const labelEl = document.getElementById(labelId);
    const row     = SettingsPanel._settings[key];
    if (!el || !row) return;

    // Set value
    if (el.type === 'checkbox') {
      el.checked = row.value === 'true';
    } else {
      el.value = row.value;
    }

    // Remove old badges/reset buttons
    const parent = el.closest('.setting-row') || el.parentElement;
    parent.querySelectorAll('.env-badge, .reset-btn').forEach(e => e.remove());
    if (labelEl) labelEl.querySelectorAll('.env-badge').forEach(e => e.remove());

    // Add env badge and reset button if an env var is set
    if (row.has_env) {
      const badge = document.createElement('span');
      badge.className = 'env-badge';
      badge.title = `Environment variable: ${row.env_value}`;
      badge.textContent = row.from_env ? 'env' : `env: ${row.env_value}`;
      if (labelEl) labelEl.appendChild(badge);

      // Show reset button only when user has overridden env
      if (!row.from_env) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-btn';
        resetBtn.title = `Reset to env value: ${row.env_value}`;
        resetBtn.textContent = '↩ env';
        resetBtn.onclick = () => SettingsPanel.resetToEnv(key);
        // Insert after the input inside .setting-row
        if (el.closest('.setting-row')) {
          el.closest('.setting-row').appendChild(resetBtn);
        }
      }
    }
  },

  async _save(updates, successMsg) {
    const res = await fetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      App.toast(successMsg || 'Saved', 'success');
      await SettingsPanel.load();
    } else {
      const d = await res.json();
      App.toast(d.error || 'Save failed', 'error');
    }
  },

  async resetToEnv(key) {
    const res = await fetch(`/api/v1/settings/${key}/override`, { method: 'DELETE' });
    if (res.ok) {
      App.toast('Reset to environment value', 'info');
      await SettingsPanel.load();
    } else {
      const d = await res.json();
      App.toast(d.error || 'Reset failed', 'error');
    }
  },

  async saveGeneral() {
    const name      = document.getElementById('set-app-name').value.trim();
    const bindHost  = document.getElementById('set-bind-host').value.trim();
    const theme     = document.getElementById('set-theme-default').value;
    if (!name) { App.toast('App name cannot be empty', 'error'); return; }

    const updates = { app_name: name, theme_default: theme };
    if (bindHost) updates.bind_host = bindHost;

    await SettingsPanel._save(updates, bindHost ? 'Saved — bind host change requires restart' : 'General settings saved');
    document.title = name;
  },

  async saveSecurity() {
    const maxUsers = document.getElementById('set-max-users').value;
    const timeout  = document.getElementById('set-session-timeout').value;
    await SettingsPanel._save({ max_users: maxUsers, session_timeout: timeout }, 'Security settings saved');
  },

  async saveNetwork() {
    const interval = document.getElementById('set-check-interval').value;
    const timeout  = document.getElementById('set-check-timeout').value;
    const enabled  = document.getElementById('set-check-enabled').checked ? 'true' : 'false';
    await SettingsPanel._save({ check_interval: interval, check_timeout: timeout, check_enabled: enabled }, 'Network settings saved');
  },

  async saveNetworkMode() {
    const mode = document.getElementById('set-network-mode').value;
    await SettingsPanel._save({ network_mode: mode }, 'Network mode saved');
  },

  async savePorts() {
    const port    = document.getElementById('set-port').value.trim();
    const mcpPort = document.getElementById('set-mcp-port').value.trim();
    if (!port || !mcpPort) { App.toast('Both ports are required', 'error'); return; }

    const ok = await App.confirm(
      `<b>Changing ports requires a server restart.</b><br><br>` +
      `If you are running in Docker you must <b>also update the port mapping</b> in <code>docker-compose.yml</code> before restarting.<br><br>` +
      `<span style="color:var(--danger)">⚠ If the new port is inaccessible (wrong mapping, firewall, etc.) you will lose access and cannot revert through the UI.</span>`,
      { confirmLabel: 'Change Ports', danger: true }
    );
    if (!ok) return;

    await SettingsPanel._save({ port, mcp_port: mcpPort }, 'Port settings saved — restart required');
  },

  async loadAudit() {
    const container = document.getElementById('audit-panel-content');
    container.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading…</p>';
    try {
      const data = await fetch('/api/v1/audit?limit=50').then(r => r.json());
      if (!data.rows || data.rows.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:13px">No audit entries yet.</p>';
        return;
      }
      container.innerHTML = `
        <table class="audit-table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            ${data.rows.map(r => `
              <tr>
                <td style="white-space:nowrap">${new Date(r.created_at).toLocaleString()}</td>
                <td>${App.esc(r.username || '—')}</td>
                <td><span class="action-badge ${r.action}">${r.action}</span></td>
                <td>${r.target_type || ''}${r.target_id ? ' #' + r.target_id : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Failed to load audit log</p>';
    }
  },

  async loadAbout() {
    try {
      if (!SettingsPanel._settings || !Object.keys(SettingsPanel._settings).length) {
        await SettingsPanel.load();
      }
      const idEl     = document.getElementById('about-oauth-id');
      const secretEl = document.getElementById('about-oauth-secret');
      const urlEl    = document.getElementById('about-mcp-url');

      if (idEl)     idEl.value     = SettingsPanel._get('mcp_oauth_client_id')     || 'claude-client';
      if (secretEl) secretEl.value = SettingsPanel._get('mcp_oauth_client_secret') || '';

      // Build the MCP URL from the current browser host with the MCP port
      if (urlEl) {
        const mcpPort = SettingsPanel._get('mcp_port') || '3001';
        urlEl.value = `${window.location.protocol}//${window.location.hostname}:${mcpPort}/mcp`;
      }

      // Fetch version + MCP token (token only returned for admins)
      const about = await fetch('/api/v1/settings/about').then(r => r.json()).catch(() => ({}));
      const versionEl = document.getElementById('about-version');
      if (versionEl) versionEl.textContent = `v${about.version || 'dev'}`;

      const bearerSection = document.getElementById('about-bearer-section');
      const tokenEl       = document.getElementById('about-mcp-token');
      if (about.mcp_token && bearerSection && tokenEl) {
        bearerSection.style.display = '';
        tokenEl.textContent = about.mcp_token;
      }
    } catch { /* ignore */ }
  },

  toggleSecret() {
    const el = document.getElementById('about-oauth-secret');
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  },

  generateSecret() {
    const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => chars[b % chars.length]).join('');
    const el = document.getElementById('about-oauth-secret');
    if (el) { el.value = secret; el.type = 'text'; }
    App.toast('New secret generated — click Save Credentials to apply', 'info');
  },

  async saveMcpCredentials() {
    const id     = (document.getElementById('about-oauth-id')?.value     || '').trim();
    const secret = (document.getElementById('about-oauth-secret')?.value || '').trim();
    if (!id) { App.toast('Client ID cannot be empty', 'error'); return; }

    await SettingsPanel._save(
      { mcp_oauth_client_id: id, mcp_oauth_client_secret: secret },
      'MCP credentials saved — takes effect immediately'
    );
  },

  async importJSON(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const res  = await fetch('/api/v1/import/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        App.toast(result.error || 'Import failed', 'error');
      } else {
        App.toast(`Imported ${result.imported.subnets} subnets, ${result.imported.hosts} hosts`, 'success');
        await App.loadData();
        App.render();
      }
    } catch {
      App.toast('Invalid JSON file', 'error');
    } finally {
      input.value = '';
    }
  },
};
