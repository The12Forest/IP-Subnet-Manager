'use strict';

const ComposePage = {
  _projects:  [],
  _expanded:  null,
  _collapsed: new Set(), // subnet IDs (or 'none') that are collapsed

  _loadCollapsed() {
    try {
      const saved = JSON.parse(localStorage.getItem('sm-compose-collapsed') || '[]');
      ComposePage._collapsed = new Set(saved);
    } catch { ComposePage._collapsed = new Set(); }
  },

  _saveCollapsed() {
    localStorage.setItem('sm-compose-collapsed', JSON.stringify([...ComposePage._collapsed]));
  },

  async load() {
    const container = document.getElementById('compose-list');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">Loading…</p>';
    ComposePage._loadCollapsed();
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
    const all = ComposePage._projects;

    if (!all.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🐳</div>
          <h3>No compose projects yet</h3>
          <p>Add a docker-compose.yml to track and link your services to IPs</p>
        </div>`;
      return;
    }

    let html = '';

    // ── One section per subnet that has projects ──────────────────────────
    for (const subnet of App.subnets) {
      const sProjects   = all.filter(p => p.display_subnet_id === subnet.id);
      if (!sProjects.length) continue;
      const isCollapsed = ComposePage._collapsed.has(subnet.id);
      const dot = subnet.color
        ? `<span class="compose-group-dot" style="background:${App.esc(subnet.color)}"></span>`
        : '';
      html += `
        <div class="compose-group" id="compose-group-${subnet.id}">
          <div class="compose-group-header" onclick="ComposePage.toggleGroup(${subnet.id})">
            ${dot}
            <span class="compose-group-name">${App.esc(subnet.name)}</span>
            <span class="compose-group-meta mono">${App.esc(subnet.network)}/${subnet.cidr}</span>
            <span class="compose-group-count">${sProjects.length}</span>
            <span class="compose-chevron">${isCollapsed ? '▶' : '▼'}</span>
          </div>
          ${isCollapsed ? '' : `<div class="compose-group-body">
            ${sProjects.map(p => ComposePage._cardHtml(p)).join('')}
          </div>`}
        </div>`;
    }

    // ── Unassigned section ────────────────────────────────────────────────
    const unassigned  = all.filter(p => !p.display_subnet_id);
    if (unassigned.length) {
      const isCollapsed = ComposePage._collapsed.has('none');
      html += `
        <div class="compose-group" id="compose-group-none">
          <div class="compose-group-header compose-group-header--dim" onclick="ComposePage.toggleGroup('none')">
            <span class="compose-group-name">No Network</span>
            <span class="compose-group-count">${unassigned.length}</span>
            <span class="compose-chevron">${isCollapsed ? '▶' : '▼'}</span>
          </div>
          ${isCollapsed ? '' : `<div class="compose-group-body">
            ${unassigned.map(p => ComposePage._cardHtml(p)).join('')}
          </div>`}
        </div>`;
    }

    container.innerHTML = html;
    if (ComposePage._expanded !== null) ComposePage._loadLinks(ComposePage._expanded);
  },

  toggleGroup(id) {
    if (ComposePage._collapsed.has(id)) ComposePage._collapsed.delete(id);
    else                                ComposePage._collapsed.add(id);
    ComposePage._saveCollapsed();
    ComposePage._render();
  },

  _iconHtml(projectId, updatedAt) {
    // Cache-bust with updated_at so the browser fetches fresh after each save
    const t = updatedAt ? `?t=${new Date(updatedAt).getTime()}` : '';
    return `<img src="/api/v1/compose/${projectId}/icon${t}" class="compose-icon-img" alt="">`;
  },

  _cardHtml(p) {
    const isExpanded = ComposePage._expanded === p.id;
    const updated    = new Date(p.updated_at).toLocaleString();
    return `
      <div class="compose-card" id="compose-card-${p.id}">
        <div class="compose-card-header" onclick="ComposePage.toggle(${p.id})">
          ${ComposePage._iconHtml(p.id, p.updated_at)}
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
    // _render() already calls _loadLinks for the expanded item — do NOT call it again here
  },

  async _loadLinks(id) {
    const container = document.getElementById(`compose-links-${id}`);
    if (!container) return;
    try {
      const res = await fetch(`/api/v1/compose/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data     = await res.json();
      const services = ComposePage._parseServices(data.content);
      // Re-check container is still in DOM after async gap
      const live = document.getElementById(`compose-links-${id}`);
      if (!live) return;
      live.innerHTML = ComposePage._linkRowsHtml(id, services, data.links || [], data);
    } catch (err) {
      console.error('[compose] _loadLinks error:', err);
      const live = document.getElementById(`compose-links-${id}`);
      if (live) live.innerHTML = `<p style="color:var(--danger);padding:12px 16px;font-size:13px">Failed to load services: ${App.esc(err.message)}</p>`;
    }
  },

  _linkRowsHtml(projectId, services, links, data) {
    if (!services.length) {
      return '<p style="color:var(--muted);padding:12px 16px;font-size:13px">No services found in this compose file</p>';
    }

    const linkMap  = {};
    for (const l of links) linkMap[l.service_name] = l;

    // If the project is assigned to a specific network, only show hosts from that network
    const filterSubnetId = data?.display_subnet_id || null;
    const allHosts = [];
    for (const [sid, d] of Object.entries(App.hosts)) {
      const subnetId = parseInt(sid, 10);
      if (filterSubnetId && subnetId !== filterSubnetId) continue;
      const subnet = App.subnets.find(s => s.id === subnetId);
      for (const h of (d.hosts || [])) allHosts.push({ ...h, subnetName: subnet ? subnet.name : '' });
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
          <span class="status-dot ${status}"></span>
          <span class="compose-svc-name mono">${App.esc(svc)}</span>
          <div class="compose-host-picker">
            <input type="text" class="compose-host-filter" placeholder="Search IP or name…"
                   oninput="ComposePage._filterSelect(this)" autocomplete="off">
            <select class="compose-host-sel" data-svc="${App.esc(svc)}">
              <option value="">— unlinked —</option>
              ${opts}
            </select>
          </div>
          ${linked?.ip ? `<span class="mono compose-linked-ip">${App.esc(linked.ip)}</span>` : ''}
        </div>`;
    }).join('');

    return `<div class="compose-links-body">
      <div class="compose-services-header"><span class="compose-section-label">Service → IP Links</span></div>
      ${rows}
      <div class="compose-links-footer">
        <button class="btn btn-primary btn-sm" onclick="ComposePage.saveLinks(${projectId})">Save Links</button>
      </div>
    </div>`;
  },

  _filterSelect(input) {
    const query  = input.value.toLowerCase();
    const select = input.closest('.compose-host-picker')?.querySelector('.compose-host-sel');
    if (!select) return;
    [...select.options].forEach(opt => {
      if (!opt.value) return;
      opt.hidden = query.length > 0 && !opt.text.toLowerCase().includes(query);
    });
  },

  async saveLinks(projectId) {
    const container = document.getElementById(`compose-links-${projectId}`);
    if (!container) return;
    const links = [];
    container.querySelectorAll('.compose-host-sel').forEach(sel => {
      links.push({ service_name: sel.dataset.svc, host_id: sel.value ? parseInt(sel.value, 10) : null });
    });
    try {
      const res = await fetch(`/api/v1/compose/${projectId}/links`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(links),
      });
      if (!res.ok) throw new Error();
      App.toast('Links saved', 'success');
      await ComposePage.load();
    } catch { App.toast('Failed to save links', 'error'); }
  },

  _parseServices(yaml) {
    if (!yaml) return [];
    const lines = yaml.split('\n');
    const svcs  = [];
    let inSvcs  = false;
    for (const line of lines) {
      if (/^services\s*:/.test(line)) { inSvcs = true; continue; }
      if (inSvcs && /^\S/.test(line)) break;
      if (inSvcs && /^  [a-zA-Z0-9_][a-zA-Z0-9_.:-]*\s*:/.test(line)) svcs.push(line.trim().replace(/:.*$/, ''));
    }
    return svcs;
  },

  // ── Network selector (used in add/edit modals) ───────────────────────────

  _networkOptions(selectedId) {
    const none = `<option value="">— No network —</option>`;
    const opts = App.subnets.map(s =>
      `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${App.esc(s.name)} (${s.network}/${s.cidr})</option>`
    ).join('');
    return none + opts;
  },

  // ── Add modal ────────────────────────────────────────────────────────────

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
        <label>Network / Group</label>
        <select id="m-cmp-subnet">${ComposePage._networkOptions(null)}</select>
        <span class="hint">Groups this compose project under the selected network</span>
      </div>
      <div class="form-group">
        <label>Icon URL <span class="muted">(optional)</span></label>
        <input type="text" id="m-cmp-icon-url" placeholder="https://example.com/icon.png">
        <span class="hint">You can also upload a file after saving</span>
      </div>
      <div class="form-group">
        <label>docker-compose.yml *</label>
        <textarea id="m-cmp-content" style="min-height:200px;font-family:monospace;font-size:12px;line-height:1.5"
          placeholder="Paste your docker-compose.yml here…"></textarea>
      </div>
      <div class="error-msg hidden" id="m-cmp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary"   onclick="ComposePage.saveProject()">Add Project</button>
      </div>
    `);
  },

  // ── Edit modal ───────────────────────────────────────────────────────────

  async openEditModal(id) {
    let data;
    try { data = await fetch(`/api/v1/compose/${id}`).then(r => r.json()); }
    catch { App.toast('Failed to load project', 'error'); return; }

    const urlValue = data.icon_url ? App.esc(data.icon_url) : '';

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
        <label>Network / Group</label>
        <select id="m-cmp-subnet">${ComposePage._networkOptions(data.display_subnet_id)}</select>
        <span class="hint">Groups this project under the selected network in the Compose page</span>
      </div>
      <div class="form-group">
        <label>Icon</label>
        <div class="compose-icon-edit-row">
          <div class="compose-icon-edit-thumb">
            <img src="/api/v1/compose/${id}/icon?t=${new Date(data.updated_at).getTime()}" class="compose-icon-edit-preview" id="m-cmp-icon-preview-img" alt="">
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:6px">
            <input type="text" id="m-cmp-icon-url" placeholder="Image URL (https://…)" value="${urlValue}">
            <div style="display:flex;gap:6px;align-items:center">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
                Upload file
                <input type="file" id="m-cmp-icon-file" accept="image/*" style="display:none"
                       onchange="ComposePage._previewIconFile(this)">
              </label>
              ${data.icon_url || data.icon ? `<button class="btn btn-danger btn-sm" onclick="ComposePage._clearIcon(${id})">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <span class="hint">The server downloads and caches the image — broken URLs fall back to the cached version</span>
      </div>
      <div class="form-group">
        <label>docker-compose.yml *</label>
        <textarea id="m-cmp-content" style="min-height:200px;font-family:monospace;font-size:12px;line-height:1.5">${App.esc(data.content)}</textarea>
      </div>
      <div class="error-msg hidden" id="m-cmp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary"   onclick="ComposePage.saveProject(${id})">Save Changes</button>
      </div>
    `);
  },

  _previewIconFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const prev = document.getElementById('m-cmp-icon-preview-img');
      if (prev) prev.outerHTML = `<img src="${e.target.result}" class="compose-icon-edit-preview" id="m-cmp-icon-preview-img">`;
      const urlEl = document.getElementById('m-cmp-icon-url');
      if (urlEl) urlEl.value = '';
    };
    reader.readAsDataURL(file);
  },

  async _clearIcon(id) {
    const ok = await App.confirm('Remove the icon from this project?', { confirmLabel: 'Remove' });
    if (!ok) return;
    await fetch(`/api/v1/compose/${id}/icon`, { method: 'DELETE' });
    App.toast('Icon removed', 'success');
    ComposePage.openEditModal(id);
  },

  async saveProject(id) {
    const name     = document.getElementById('m-cmp-name')?.value.trim();
    const desc     = document.getElementById('m-cmp-desc')?.value.trim();
    const content  = document.getElementById('m-cmp-content')?.value.trim();
    const iconUrl  = document.getElementById('m-cmp-icon-url')?.value.trim();
    const subnetEl = document.getElementById('m-cmp-subnet');
    const subnetId = subnetEl?.value ? parseInt(subnetEl.value, 10) : null;
    const errEl    = document.getElementById('m-cmp-err');

    if (!name || !content) {
      errEl.textContent = 'Project name and compose content are required';
      errEl.classList.remove('hidden');
      return;
    }

    const body = { name, description: desc, content, display_subnet_id: subnetId };
    if (iconUrl) body.icon_url = iconUrl;

    const res = await fetch(id ? `/api/v1/compose/${id}` : '/api/v1/compose', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      errEl.textContent = d.error || 'Failed to save';
      errEl.classList.remove('hidden');
      return;
    }

    const saved  = await res.json();
    const newId  = saved.id || id;
    const fileEl = document.getElementById('m-cmp-icon-file');
    if (fileEl?.files[0]) {
      try { await ComposePage._uploadIcon(newId, fileEl.files[0]); } catch {}
    }
    App.closeModal();
    App.toast(id ? 'Project updated' : 'Project added', 'success');
    ComposePage.load();
  },

  async _uploadIcon(id, file) {
    const res = await fetch(`/api/v1/compose/${id}/icon`, {
      method: 'POST', headers: { 'Content-Type': file.type || 'image/png' }, body: file,
    });
    if (!res.ok) { App.toast('Icon upload failed', 'error'); throw new Error(); }
    return res.json();
  },

  async deleteProject(id) {
    const p  = ComposePage._projects.find(p => p.id === id);
    const ok = await App.confirm(
      `Delete <b>${App.esc(p ? p.name : id)}</b> and all its links? This cannot be undone.`,
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
    document.querySelectorAll('.compose-host-sel').forEach(sel => {
      if (parseInt(sel.value) === hostId) {
        const dot = sel.closest('.compose-service-row')?.querySelector('.status-dot');
        if (dot) dot.className = `status-dot ${status}`;
      }
    });
  },
};
