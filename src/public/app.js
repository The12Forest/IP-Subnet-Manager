'use strict';

const App = {
  user: null,
  subnets: [],
  hosts: {},      // subnetId -> { hosts: [], free_ips: [] }
  searchQuery: '',
  eventSource: null,
  _theme: null,

  async init() {
    // Load theme preference early to avoid flash
    const saved = localStorage.getItem('sm-theme') || 'dark';
    App._theme = saved;
    if (saved === 'light') document.body.classList.add('light');

    // Check wizard status first (no auth needed)
    const wizStatus = await fetch('/api/v1/wizard/status').then(r => r.json()).catch(() => ({ needed: false }));
    if (wizStatus.needed) {
      Wizard.show();
      return;
    }

    // Check auth
    const meRes = await fetch('/api/v1/auth/me');
    if (!meRes.ok) {
      App.showLogin();
      return;
    }
    App.user = await meRes.json();
    App.showApp();
    await App.loadData();
    App.render();
    App.subscribeEvents();
  },

  showLogin() {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    const u = document.getElementById('login-username');
    if (u) setTimeout(() => u.focus(), 100);

    // Enter key submits login
    const handler = (e) => {
      if (e.key === 'Enter') App.login();
    };
    document.getElementById('login-password').addEventListener('keydown', handler);
    document.getElementById('login-username').addEventListener('keydown', handler);
  },

  showApp() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Set user info in topbar
    const name = App.user.username;
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-avatar').textContent = name[0].toUpperCase();
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Login failed';
        errEl.classList.remove('hidden');
        return;
      }
      App.user = data.user;
      document.getElementById('login-password').value = '';
      App.showApp();
      await App.loadData();
      App.render();
      App.subscribeEvents();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  },

  async logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    App.user = null;
    if (App.eventSource) {
      App.eventSource.close();
      App.eventSource = null;
    }
    document.getElementById('app').classList.add('hidden');
    App.showLogin();
    App.subnets = [];
    App.hosts = {};
  },

  async loadData() {
    const subnets = await fetch('/api/v1/subnets').then(r => r.json());
    App.subnets = subnets;

    await Promise.all(subnets.map(async s => {
      const data = await fetch(`/api/v1/subnets/${s.id}/hosts`).then(r => r.json());
      App.hosts[s.id] = data;
    }));
  },

  render() {
    App.updateStats();
    App.renderGrid(App.searchQuery);
  },

  updateStats() {
    const subnets = App.subnets.length;
    let services = 0;
    let freeTotal = 0;

    for (const s of App.subnets) {
      const d = App.hosts[s.id];
      if (d) {
        services  += d.hosts.length;
        freeTotal += (d.free_ips || []).length;
      }
    }

    document.getElementById('stat-subnets').textContent  = subnets;
    document.getElementById('stat-services').textContent = services;
    document.getElementById('stat-free').textContent     = freeTotal;
    document.getElementById('services-badge').textContent = `${services} service${services !== 1 ? 's' : ''}`;
  },

  renderGrid(query) {
    const grid = document.getElementById('subnet-grid');
    const q = (query || '').toLowerCase();

    // Filter subnets/hosts
    const filtered = App.subnets.map(s => {
      const d = App.hosts[s.id] || { hosts: [], free_ips: [] };
      let hosts = d.hosts;
      if (q) {
        hosts = hosts.filter(h =>
          (h.ip   && h.ip.includes(q)) ||
          (h.name && h.name.toLowerCase().includes(q)) ||
          (h.description && h.description.toLowerCase().includes(q))
        );
        // If no match and search is active, skip subnet
        if (hosts.length === 0 && !s.name.toLowerCase().includes(q) && !s.network.includes(q)) {
          return null;
        }
      }
      return { subnet: s, hosts, free_ips: d.free_ips || [] };
    }).filter(Boolean);

    if (filtered.length === 0) {
      grid.innerHTML = q
        ? `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><h3>No results</h3><p>No subnets or hosts match "${query}"</p></div>`
        : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🌐</div><h3>No subnets yet</h3><p>Click <b>+ Subnet</b> to add your first subnet</p></div>`;

      if (!q) {
        const addCard = document.createElement('div');
        addCard.className = 'add-subnet-card';
        addCard.innerHTML = '+ Add your first subnet';
        addCard.onclick = () => App.openAddSubnetModal();
        grid.appendChild(addCard);
      }
      return;
    }

    grid.innerHTML = filtered.map(({ subnet, hosts, free_ips }) =>
      App.renderSubnetCard(subnet, hosts, free_ips, q)
    ).join('');
  },

  renderSubnetCard(s, hosts, freeIps, query) {
    const range    = `${s.network}/${s.cidr}`;
    const total    = Math.pow(2, 32 - s.cidr) - 2;
    const used     = hosts.length;
    const colorDot = s.color
      ? `<span class="subnet-color-dot" style="background:${s.color}"></span>`
      : '';
    const canEdit  = App.user && (App.user.role === 'admin' || App.user.role === 'editor');
    const canDel   = App.user && App.user.role === 'admin';

    const hostRows = hosts.map(h => App.renderHostRow(h)).join('');

    // Show up to 5 free IPs when not searching
    const showFree = !query && freeIps.length > 0;
    const freeSlice = freeIps.slice(0, 5);
    const freeRows = showFree
      ? freeSlice.map(ip => `
          <div class="host-row free-ip" onclick="App.openAddHostModal(${s.id}, '${ip}')">
            <span class="status-dot unknown"></span>
            <span class="host-ip mono">${ip}</span>
            <span class="host-name">click to assign</span>
          </div>`).join('')
      : '';

    const freeMore = (showFree && freeIps.length > 5)
      ? `<div class="free-ips-more">+${freeIps.length - 5} free IPs</div>`
      : '';

    return `
      <div class="subnet-card" id="subnet-card-${s.id}">
        <div class="subnet-card-header">
          ${colorDot}
          <span class="subnet-name" title="${s.description || ''}">${s.name}</span>
          <span class="subnet-range mono">${range}</span>
          <span class="subnet-count">${used}/${total}</span>
          <div class="subnet-card-actions">
            ${canEdit ? `<button onclick="App.openEditSubnetModal(${s.id})">edit</button>` : ''}
            ${canDel  ? `<button class="del" onclick="App.deleteSubnet(${s.id})">del</button>` : ''}
          </div>
        </div>
        <div class="host-list">
          ${hostRows}
          ${freeRows}
          ${freeMore}
        </div>
      </div>`;
  },

  renderHostRow(h) {
    const status = h.last_status || 'unknown';
    const name   = h.name || '—';
    return `
      <div class="host-row" data-host-id="${h.id}" onclick="App.openEditHostModal(${h.id})">
        <span class="status-dot ${status}" id="dot-${h.id}"></span>
        <span class="host-ip mono">${h.ip}</span>
        <span class="host-name">${App.esc(name)}</span>
        <span class="host-type-badge">${h.type}</span>
      </div>`;
  },

  // Live status update from SSE
  updateHostStatus(hostId, status) {
    const dot = document.getElementById(`dot-${hostId}`);
    if (dot) {
      dot.className = `status-dot ${status}`;
    }
    // Also update in-memory
    for (const subnetId of Object.keys(App.hosts)) {
      const d = App.hosts[subnetId];
      if (d && d.hosts) {
        const host = d.hosts.find(h => h.id === hostId);
        if (host) { host.last_status = status; break; }
      }
    }
  },

  subscribeEvents() {
    if (App.eventSource) App.eventSource.close();
    App.eventSource = new EventSource('/api/v1/status/events');

    App.eventSource.addEventListener('status_update', (e) => {
      const { hostId, status } = JSON.parse(e.data);
      App.updateHostStatus(hostId, status);
    });

    App.eventSource.onerror = () => {
      App.eventSource.close();
      // Retry after 5 seconds
      setTimeout(() => {
        if (App.user) App.subscribeEvents();
      }, 5000);
    };
  },

  onSearch(value) {
    App.searchQuery = value;
    App.renderGrid(value);
  },

  toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    App._theme = isLight ? 'light' : 'dark';
    localStorage.setItem('sm-theme', App._theme);
  },

  // ── Modals ────────────────────────────────────────────────────────────────

  openModal(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  closeModal(e) {
    if (!e || e.target === document.getElementById('modal-overlay')) {
      document.getElementById('modal-overlay').classList.add('hidden');
    }
  },

  // Add subnet
  openAddSubnetModal() {
    App.openModal(`
      <div class="modal-header">
        <h3>Add Subnet</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" id="m-subnet-name" placeholder="e.g. Services">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Network *</label>
          <input type="text" id="m-subnet-network" placeholder="10.10.1.0">
        </div>
        <div class="form-group">
          <label>CIDR</label>
          <select id="m-subnet-cidr">
            <option value="16">/16</option>
            <option value="24" selected>/24</option>
            <option value="25">/25</option>
            <option value="26">/26</option>
            <option value="28">/28</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-subnet-desc" placeholder="Optional">
      </div>
      <div class="form-group">
        <label>Accent Color</label>
        <input type="color" id="m-subnet-color" value="#3b82f6" style="height:36px;padding:2px 4px">
        <span class="hint">Shown as a dot in the card header</span>
      </div>
      <div class="error-msg hidden" id="m-subnet-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveSubnet()">Add Subnet</button>
      </div>
    `);
  },

  async openEditSubnetModal(id) {
    const s = App.subnets.find(s => s.id === id);
    if (!s) return;
    App.openModal(`
      <div class="modal-header">
        <h3>Edit Subnet</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" id="m-subnet-name" value="${App.esc(s.name)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Network *</label>
          <input type="text" id="m-subnet-network" value="${App.esc(s.network)}">
        </div>
        <div class="form-group">
          <label>CIDR</label>
          <select id="m-subnet-cidr">
            ${[16,24,25,26,28].map(v => `<option value="${v}" ${s.cidr == v ? 'selected' : ''}>/${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-subnet-desc" value="${App.esc(s.description || '')}">
      </div>
      <div class="form-group">
        <label>Accent Color</label>
        <input type="color" id="m-subnet-color" value="${s.color || '#3b82f6'}" style="height:36px;padding:2px 4px">
      </div>
      <div class="error-msg hidden" id="m-subnet-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveSubnet(${id})">Save Changes</button>
      </div>
    `);
  },

  async saveSubnet(id) {
    const name    = document.getElementById('m-subnet-name').value.trim();
    const network = document.getElementById('m-subnet-network').value.trim();
    const cidr    = parseInt(document.getElementById('m-subnet-cidr').value, 10);
    const desc    = document.getElementById('m-subnet-desc').value.trim();
    const color   = document.getElementById('m-subnet-color').value;
    const errEl   = document.getElementById('m-subnet-err');

    if (!name || !network) {
      errEl.textContent = 'Name and network are required';
      errEl.classList.remove('hidden');
      return;
    }

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/v1/subnets/${id}` : '/api/v1/subnets';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, network, cidr, description: desc, color }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Failed to save subnet';
      errEl.classList.remove('hidden');
      return;
    }

    App.closeModal();
    await App.loadData();
    App.render();
    App.toast(id ? 'Subnet updated' : 'Subnet added', 'success');
  },

  async deleteSubnet(id) {
    const s = App.subnets.find(s => s.id === id);
    if (!confirm(`Delete subnet "${s ? s.name : id}" and all its hosts?`)) return;
    const res = await fetch(`/api/v1/subnets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      App.toast(d.error || 'Failed to delete', 'error');
      return;
    }
    await App.loadData();
    App.render();
    App.toast('Subnet deleted', 'success');
  },

  // Add / edit host modal
  openAddHostModal(subnetId, prefilledIp) {
    App._hostModalSubnetId = subnetId;
    App.openModal(App._hostModalHtml(null, subnetId, prefilledIp));
  },

  async openEditHostModal(hostId) {
    // Find host in memory
    let host = null;
    let subnetId = null;
    for (const [sid, d] of Object.entries(App.hosts)) {
      const found = d.hosts.find(h => h.id === hostId);
      if (found) { host = found; subnetId = parseInt(sid, 10); break; }
    }
    if (!host) return;
    App._hostModalSubnetId = subnetId;
    App.openModal(App._hostModalHtml(host, subnetId, null));
  },

  _hostModalHtml(host, subnetId, prefilledIp) {
    const isEdit = !!host;
    const ip   = isEdit ? host.ip          : (prefilledIp || '');
    const name = isEdit ? (host.name || '') : '';
    const desc = isEdit ? (host.description || '') : '';
    const type = isEdit ? host.type        : 'container';
    const port = isEdit ? (host.check_port || '') : '';
    const notes = isEdit ? (host.notes || '') : '';
    const enabled = isEdit ? host.check_enabled : 1;

    return `
      <div class="modal-header">
        <h3>${isEdit ? 'Edit Host' : 'Add Host'}</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>IP Address *</label>
          <input type="text" id="m-host-ip" value="${App.esc(ip)}" ${isEdit ? 'readonly style="opacity:.6"' : ''} class="mono" placeholder="x.x.x.x">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="m-host-type">
            ${['container','server','reserved','other'].map(t =>
              `<option value="${t}" ${type === t ? 'selected' : ''}>${t}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="m-host-name" value="${App.esc(name)}" placeholder="e.g. nginx-proxy">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-host-desc" value="${App.esc(desc)}" placeholder="Short description">
      </div>
      <div class="form-group">
        <label>Check Port <span class="muted">(TCP — leave empty for ICMP ping)</span></label>
        <input type="number" id="m-host-port" value="${port}" placeholder="e.g. 80" min="1" max="65535">
      </div>
      <div class="form-group">
        <label>Notes <span class="muted">(markdown)</span></label>
        <textarea id="m-host-notes" placeholder="Markdown notes…">${App.esc(notes)}</textarea>
      </div>
      <div class="toggle-group">
        <span>Enable status check</span>
        <label class="toggle">
          <input type="checkbox" id="m-host-enabled" ${enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="error-msg hidden" id="m-host-err"></div>
      <div class="modal-footer">
        ${isEdit && (App.user.role === 'admin' || App.user.role === 'editor')
          ? `<button class="btn btn-danger btn-sm" onclick="App.deleteHost(${host.id})">Delete</button>`
          : ''}
        <div style="flex:1"></div>
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveHost(${isEdit ? host.id : 'null'})">${isEdit ? 'Save' : 'Add Host'}</button>
      </div>
    `;
  },

  async saveHost(hostId) {
    const ip      = document.getElementById('m-host-ip').value.trim();
    const name    = document.getElementById('m-host-name').value.trim();
    const desc    = document.getElementById('m-host-desc').value.trim();
    const type    = document.getElementById('m-host-type').value;
    const port    = document.getElementById('m-host-port').value;
    const notes   = document.getElementById('m-host-notes').value;
    const enabled = document.getElementById('m-host-enabled').checked;
    const errEl   = document.getElementById('m-host-err');

    if (!ip) {
      errEl.textContent = 'IP address is required';
      errEl.classList.remove('hidden');
      return;
    }

    const body = { name, description: desc, type, notes, check_enabled: enabled };
    if (port) body.check_port = parseInt(port, 10);
    else body.check_port = null;

    let url, method;
    if (hostId) {
      url    = `/api/v1/hosts/${hostId}`;
      method = 'PUT';
    } else {
      url    = `/api/v1/subnets/${App._hostModalSubnetId}/hosts`;
      method = 'POST';
      body.ip = ip;
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Failed to save host';
      errEl.classList.remove('hidden');
      return;
    }

    App.closeModal();
    await App.loadData();
    App.render();
    App.toast(hostId ? 'Host updated' : 'Host added', 'success');
  },

  async deleteHost(hostId) {
    if (!confirm('Delete this host?')) return;
    const res = await fetch(`/api/v1/hosts/${hostId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      App.toast(d.error || 'Failed to delete', 'error');
      return;
    }
    App.closeModal();
    await App.loadData();
    App.render();
    App.toast('Host deleted', 'success');
  },

  // ── Toast ─────────────────────────────────────────────────────────────────

  toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('show'));
    });
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 3000);
  },

  // ── HTML escape ───────────────────────────────────────────────────────────

  esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
