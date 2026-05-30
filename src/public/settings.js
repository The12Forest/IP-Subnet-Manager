'use strict';

const SettingsPanel = {
  _settings: {},
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
    document.querySelectorAll('.panel-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${name}`);
    });

    if (name === 'users')    UsersPanel.load();
    if (name === 'auditlog') SettingsPanel.loadAudit();
    if (name === 'about')    SettingsPanel.loadAbout();
  },

  async load() {
    try {
      const rows = await fetch('/api/v1/settings').then(r => r.json());
      SettingsPanel._settings = {};
      for (const r of rows) SettingsPanel._settings[r.key] = r;

      const get = (key) => {
        const r = SettingsPanel._settings[key];
        return r ? r.value : '';
      };

      // General tab
      const appName = document.getElementById('set-app-name');
      if (appName) appName.value = get('app_name');

      const bindHost = document.getElementById('set-bind-host');
      if (bindHost) bindHost.value = get('bind_host') || '0.0.0.0';

      // Network tab
      const ci = document.getElementById('set-check-interval');
      const ct = document.getElementById('set-check-timeout');
      const ce = document.getElementById('set-check-enabled');
      if (ci) ci.value = get('check_interval') || '60';
      if (ct) ct.value = get('check_timeout')  || '2000';
      if (ce) ce.checked = get('check_enabled') !== 'false';

      // Apply locked indicators
      for (const [key, row] of Object.entries(SettingsPanel._settings)) {
        if (row.locked) {
          SettingsPanel._markLocked(key);
        }
      }
    } catch (err) {
      console.error('[settings] Load error:', err);
    }
  },

  _markLocked(key) {
    const inputId = `set-${key.replace(/_/g, '-')}`;
    const el = document.getElementById(inputId);
    if (el) {
      el.disabled = true;
      const label = el.closest('.form-group')?.querySelector('label');
      if (label && !label.querySelector('.locked-badge')) {
        label.insertAdjacentHTML('beforeend', '<span class="locked-badge">🔒 env</span>');
      }
    }
  },

  async saveGeneral() {
    const name     = document.getElementById('set-app-name').value.trim();
    const bindHost = document.getElementById('set-bind-host').value.trim();
    if (!name) { App.toast('App name cannot be empty', 'error'); return; }

    const updates = { app_name: name };
    if (bindHost) updates.bind_host = bindHost;

    const res = await fetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      document.title = name;
      if (bindHost) App.toast('Bind host saved — restart required to take effect', 'info');
      else App.toast('Settings saved', 'success');
    } else {
      const d = await res.json();
      App.toast(d.error || 'Save failed', 'error');
    }
  },

  async saveNetwork() {
    const updates = {
      check_interval: document.getElementById('set-check-interval').value,
      check_timeout:  document.getElementById('set-check-timeout').value,
      check_enabled:  document.getElementById('set-check-enabled').checked ? 'true' : 'false',
    };

    const res = await fetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      App.toast('Network settings saved', 'success');
    } else {
      const d = await res.json();
      App.toast(d.error || 'Save failed', 'error');
    }
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
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
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
        </table>
      `;
    } catch {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Failed to load audit log</p>';
    }
  },

  async loadAbout() {
    // Show MCP token from settings
    const row = SettingsPanel._settings['mcp_token'];
    // MCP token comes from config, not DB — fetch from a dedicated endpoint
    try {
      const res = await fetch('/api/v1/settings/mcp_token').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const el = document.getElementById('mcp-token');
        if (el && data.value) el.textContent = data.value;
      }
    } catch { /* mcp_token may not be in settings table */ }

    // Show MCP port
    const portEl = document.getElementById('mcp-port');
    if (portEl) portEl.textContent = '3001';
  },

  async importJSON(input) {
    const file = input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const res = await fetch('/api/v1/import/json', {
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
    } catch (err) {
      App.toast('Invalid JSON file', 'error');
    } finally {
      input.value = '';
    }
  },
};
