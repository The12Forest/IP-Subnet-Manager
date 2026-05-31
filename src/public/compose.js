'use strict';

const ComposePage = {
  _projects: [],
  _expanded: null,

  async load() {
    const container = document.getElementById('compose-list');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">Loading…</p>';
    try {
      ComposePage._projects = await fetch('/api/v1/compose').then(r => r.json());
      ComposePage._render();
    } catch {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Failed to load compose projects</p>';
    }
  },

  _render() {
    const container = document.getElementById('compose-list');
    if (!container) return;
    if (!ComposePage._projects.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🐳</div>
          <h3>No compose projects yet</h3>
          <p>Add a docker-compose.yml to track and link your services to IPs</p>
        </div>`;
      return;
    }
    container.innerHTML = ComposePage._projects.map(p => ComposePage._cardHtml(p)).join('');

    // If a project was expanded before re-render, re-fetch and render its links
    if (ComposePage._expanded !== null) {
      ComposePage._loadLinks(ComposePage._expanded);
    }
  },

  _cardHtml(p) {
    const isExpanded = ComposePage._expanded === p.id;
    const updated    = new Date(p.updated_at).toLocaleString();
    return `
      <div class="compose-card" id="compose-card-${p.id}">
        <div class="compose-card-header" onclick="ComposePage.toggle(${p.id})">
          <span class="compose-icon">🐳</span>
          <div class="compose-info">
            <span class="compose-name">${App.esc(p.name)}</span>
            <span class="compose-meta">${p.linked_count} linked · ${updated}</span>
          </div>
          <div class="compose-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="ComposePage.openEditModal(${p.id})">Edit</button>
            <button class="btn btn-danger btn-sm"    onclick="ComposePage.deleteProject(${p.id})">Del</button>
          </div>
          <span class="compose-chevron">${isExpanded ? '▲' : '▼'}</span>
        </div>
        ${isExpanded ? `<div class="compose-links" id="compose-links-${p.id}"><p style="color:var(--muted);padding:12px 16px;font-size:13px">Loading services…</p></div>` : ''}
      </div>`;
  },

  async toggle(id) {
    if (ComposePage._expanded === id) {
      ComposePage._expanded = null;
      ComposePage._render();
      return;
    }
    ComposePage._expanded = id;
    ComposePage._render();
    ComposePage._loadLinks(id);
  },

  async _loadLinks(id) {
    const container = document.getElementById(`compose-links-${id}`);
    if (!container) return;
    try {
      const data     = await fetch(`/api/v1/compose/${id}`).then(r => r.json());
      const services = ComposePage._parseServices(data.content);
      container.innerHTML = ComposePage._linkRowsHtml(id, services, data.links || []);
    } catch {
      container.innerHTML = '<p style="color:var(--danger);padding:12px 16px;font-size:13px">Failed to load services</p>';
    }
  },

  _linkRowsHtml(projectId, services, links) {
    if (!services.length) {
      return '<p style="color:var(--muted);padding:12px 16px;font-size:13px">No services found — check that your YAML has a <code>services:</code> block</p>';
    }

    const linkMap = {};
    for (const l of links) linkMap[l.service_name] = l;

    // Flat sorted host list for dropdowns
    const allHosts = [];
    for (const [sid, d] of Object.entries(App.hosts)) {
      const subnet = App.subnets.find(s => s.id === parseInt(sid, 10));
      for (const h of (d.hosts || [])) {
        allHosts.push({ ...h, subnetName: subnet ? subnet.name : '' });
      }
    }
    allHosts.sort((a, b) => App._ipToInt(a.ip) - App._ipToInt(b.ip));

    const rows = services.map(svc => {
      const linked = linkMap[svc];
      const status = linked?.last_status || 'unknown';
      const hostId = linked?.host_id || '';
      const opts   = allHosts.map(h =>
        `<option value="${h.id}" ${h.id == hostId ? 'selected' : ''}>${h.ip}${h.name ? ' — ' + App.esc(h.name) : ''}</option>`
      ).join('');
      return `
        <div class="compose-service-row">
          <span class="status-dot ${status}" id="csl-dot-${projectId}-${App.esc(svc)}"></span>
          <span class="compose-svc-name mono">${App.esc(svc)}</span>
          <select class="compose-host-sel" data-svc="${App.esc(svc)}">
            <option value="">— unlinked —</option>
            ${opts}
          </select>
          ${linked?.ip ? `<span class="mono compose-linked-ip">${App.esc(linked.ip)}</span>` : ''}
        </div>`;
    }).join('');

    return `<div class="compose-links-body">
      ${rows}
      <div class="compose-links-footer">
        <button class="btn btn-primary btn-sm" onclick="ComposePage.saveLinks(${projectId})">Save Links</button>
      </div>
    </div>`;
  },

  async saveLinks(projectId) {
    const container = document.getElementById(`compose-links-${projectId}`);
    if (!container) return;
    const links = [];
    container.querySelectorAll('.compose-host-sel').forEach(sel => {
      links.push({
        service_name: sel.dataset.svc,
        host_id:      sel.value ? parseInt(sel.value, 10) : null,
      });
    });
    try {
      const res = await fetch(`/api/v1/compose/${projectId}/links`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(links),
      });
      if (!res.ok) throw new Error();
      App.toast('Links saved', 'success');
      await ComposePage.load();
    } catch {
      App.toast('Failed to save links', 'error');
    }
  },

  _parseServices(yaml) {
    if (!yaml) return [];
    const lines    = yaml.split('\n');
    const services = [];
    let inServices = false;
    for (const line of lines) {
      if (/^services\s*:/.test(line)) { inServices = true; continue; }
      if (inServices && /^\S/.test(line)) break;
      if (inServices && /^  [a-zA-Z0-9_][a-zA-Z0-9_.:-]*\s*:/.test(line)) {
        services.push(line.trim().replace(/:.*$/, ''));
      }
    }
    return services;
  },

  openAddModal() {
    App.openModal(`
      <div class="modal-header">
        <h3>Add Compose Project</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Project Name *</label>
        <input type="text" id="m-cmp-name" placeholder="e.g. Production Stack">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-cmp-desc" placeholder="Optional">
      </div>
      <div class="form-group">
        <label>docker-compose.yml *</label>
        <textarea id="m-cmp-content" style="min-height:220px;font-family:monospace;font-size:12px;line-height:1.5"
          placeholder="Paste your docker-compose.yml here…"></textarea>
      </div>
      <div class="error-msg hidden" id="m-cmp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="ComposePage.saveProject()">Add Project</button>
      </div>
    `);
  },

  async openEditModal(id) {
    let data;
    try { data = await fetch(`/api/v1/compose/${id}`).then(r => r.json()); }
    catch { App.toast('Failed to load project', 'error'); return; }

    App.openModal(`
      <div class="modal-header">
        <h3>Edit Compose Project</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Project Name *</label>
        <input type="text" id="m-cmp-name" value="${App.esc(data.name)}">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-cmp-desc" value="${App.esc(data.description || '')}">
      </div>
      <div class="form-group">
        <label>docker-compose.yml *</label>
        <textarea id="m-cmp-content" style="min-height:220px;font-family:monospace;font-size:12px;line-height:1.5">${App.esc(data.content)}</textarea>
      </div>
      <div class="error-msg hidden" id="m-cmp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="ComposePage.saveProject(${id})">Save Changes</button>
      </div>
    `);
  },

  async saveProject(id) {
    const name    = document.getElementById('m-cmp-name')?.value.trim();
    const desc    = document.getElementById('m-cmp-desc')?.value.trim();
    const content = document.getElementById('m-cmp-content')?.value.trim();
    const errEl   = document.getElementById('m-cmp-err');
    if (!name || !content) {
      errEl.textContent = 'Project name and compose content are required';
      errEl.classList.remove('hidden');
      return;
    }
    const res = await fetch(id ? `/api/v1/compose/${id}` : '/api/v1/compose', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description: desc, content }),
    });
    if (!res.ok) {
      const d = await res.json();
      errEl.textContent = d.error || 'Failed to save';
      errEl.classList.remove('hidden');
      return;
    }
    App.closeModal();
    App.toast(id ? 'Project updated' : 'Project added', 'success');
    ComposePage.load();
  },

  async deleteProject(id) {
    const p  = ComposePage._projects.find(p => p.id === id);
    const ok = await App.confirm(
      `Delete <b>${App.esc(p ? p.name : id)}</b> and all its service links? This cannot be undone.`,
      { confirmLabel: 'Delete', danger: true }
    );
    if (!ok) return;
    const res = await fetch(`/api/v1/compose/${id}`, { method: 'DELETE' });
    if (!res.ok) { App.toast('Failed to delete', 'error'); return; }
    App.toast('Project deleted', 'success');
    if (ComposePage._expanded === id) ComposePage._expanded = null;
    ComposePage.load();
  },

  onStatusUpdate(hostId, status) {
    // Update any compose service link dot whose dropdown has this host selected
    document.querySelectorAll('.compose-host-sel').forEach(sel => {
      if (parseInt(sel.value) === hostId) {
        const row = sel.closest('.compose-service-row');
        if (row) {
          const dot = row.querySelector('.status-dot');
          if (dot) dot.className = `status-dot ${status}`;
        }
      }
    });
  },
};
