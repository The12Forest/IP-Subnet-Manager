'use strict';

const ComposePage = {
  _projects:  [],
  _groups:    [],
  _expanded:  null,
  _collapsed: new Set(), // group IDs that are collapsed

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
      const [projects, groups] = await Promise.all([
        fetch('/api/v1/compose').then(r => r.json()),
        fetch('/api/v1/compose/groups').then(r => r.json()),
      ]);
      ComposePage._projects = projects;
      ComposePage._groups   = groups;
      ComposePage._render();
    } catch {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Failed to load compose projects</p>';
    }
  },

  _render() {
    const container = document.getElementById('compose-list');
    if (!container) return;

    const all = ComposePage._projects;

    if (!all.length && !ComposePage._groups.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🐳</div>
          <h3>No compose projects yet</h3>
          <p>Add a docker-compose.yml to track and link your services to IPs</p>
        </div>`;
      return;
    }

    let html = '';

    // ── Render each group ──────────────────────────────────────────────────
    for (const g of ComposePage._groups) {
      const gProjects   = all.filter(p => p.group_id === g.id);
      const isCollapsed = ComposePage._collapsed.has(g.id);
      const dot         = g.color ? `<span class="compose-group-dot" style="background:${App.esc(g.color)}"></span>` : '';
      html += `
        <div class="compose-group" id="compose-group-${g.id}">
          <div class="compose-group-header" onclick="ComposePage.toggleGroup(${g.id})">
            ${dot}
            <span class="compose-group-name">${App.esc(g.name)}</span>
            <span class="compose-group-count">${gProjects.length}</span>
            <div class="compose-group-actions" onclick="event.stopPropagation()">
              <button class="btn btn-secondary btn-sm" onclick="ComposePage.openEditGroupModal(${g.id})" title="Rename group">✎</button>
              <button class="btn btn-danger btn-sm"    onclick="ComposePage.deleteGroup(${g.id})"         title="Delete group">×</button>
            </div>
            <span class="compose-chevron">${isCollapsed ? '▶' : '▼'}</span>
          </div>
          ${isCollapsed ? '' : `<div class="compose-group-body">
            ${gProjects.length
              ? gProjects.map(p => ComposePage._cardHtml(p)).join('')
              : '<p style="color:var(--muted);font-size:12px;padding:8px 14px">No projects in this group</p>'}
          </div>`}
        </div>`;
    }

    // ── Ungrouped section ─────────────────────────────────────────────────
    const ungrouped = all.filter(p => !p.group_id);
    if (ungrouped.length) {
      const isCollapsed = ComposePage._collapsed.has('ungrouped');
      html += `
        <div class="compose-group compose-group-ungrouped" id="compose-group-ungrouped">
          <div class="compose-group-header compose-group-header--dim" onclick="ComposePage.toggleGroup('ungrouped')">
            <span class="compose-group-name">Ungrouped</span>
            <span class="compose-group-count">${ungrouped.length}</span>
            <span class="compose-chevron">${isCollapsed ? '▶' : '▼'}</span>
          </div>
          ${isCollapsed ? '' : `<div class="compose-group-body">
            ${ungrouped.map(p => ComposePage._cardHtml(p)).join('')}
          </div>`}
        </div>`;
    }

    container.innerHTML = html;

    if (ComposePage._expanded !== null) ComposePage._loadLinks(ComposePage._expanded);
  },

  toggleGroup(id) {
    if (ComposePage._collapsed.has(id)) {
      ComposePage._collapsed.delete(id);
    } else {
      ComposePage._collapsed.add(id);
    }
    ComposePage._saveCollapsed();
    ComposePage._render();
  },

  _iconHtml(icon) {
    if (!icon) return `<span class="compose-icon">🐳</span>`;
    return `<img src="${App.esc(icon)}" class="compose-icon-img"
              onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'compose-icon',textContent:'🐳'}))"
              alt="">`;
  },

  _cardHtml(p) {
    const isExpanded  = ComposePage._expanded === p.id;
    const updated     = new Date(p.updated_at).toLocaleString();
    const subnetChips = p.subnet_names
      ? p.subnet_names.split(',').map(n =>
          `<span class="compose-subnet-chip">${App.esc(n.trim())}</span>`
        ).join('')
      : '';
    return `
      <div class="compose-card" id="compose-card-${p.id}">
        <div class="compose-card-header" onclick="ComposePage.toggle(${p.id})">
          ${ComposePage._iconHtml(p.icon)}
          <div class="compose-info">
            <span class="compose-name">${App.esc(p.name)}</span>
            <span class="compose-meta">${p.linked_count} linked · ${updated}</span>
            ${subnetChips ? `<span class="compose-subnet-chips">${subnetChips}</span>` : ''}
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
      container.innerHTML = ComposePage._linkRowsHtml(id, services, data.links || [], data);
    } catch {
      container.innerHTML = '<p style="color:var(--danger);padding:12px 16px;font-size:13px">Failed to load services</p>';
    }
  },

  _linkRowsHtml(projectId, services, links, data) {
    const subnetLinkedIds  = new Set((data.subnet_links || []).map(s => s.subnet_id));
    const subnetCheckboxes = App.subnets.map(s => `
      <label class="compose-subnet-check">
        <input type="checkbox" value="${s.id}" ${subnetLinkedIds.has(s.id) ? 'checked' : ''}>
        <span>${App.esc(s.name)}</span>
        <span class="compose-subnet-range mono">${s.network}/${s.cidr}</span>
      </label>`).join('');
    const subnetSection = `
      <div class="compose-subnet-section">
        <span class="compose-section-label">Linked Subnets</span>
        <div class="compose-subnet-checks">${subnetCheckboxes || '<span style="color:var(--muted);font-size:12px">No subnets configured</span>'}</div>
        <button class="btn btn-secondary btn-sm" onclick="ComposePage.saveSubnets(${projectId})" style="margin-top:6px">Save Subnets</button>
      </div>`;

    if (!services.length) {
      return subnetSection + '<p style="color:var(--muted);padding:12px 16px;font-size:13px">No services found — check that your YAML has a <code>services:</code> block</p>';
    }

    const linkMap  = {};
    for (const l of links) linkMap[l.service_name] = l;

    const allHosts = [];
    for (const [sid, d] of Object.entries(App.hosts)) {
      const subnet = App.subnets.find(s => s.id === parseInt(sid, 10));
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
            <input type="text" class="compose-host-filter" placeholder="Filter by IP or name…"
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
      ${subnetSection}
      <div class="compose-services-header"><span class="compose-section-label">Service → IP Links</span></div>
      ${rows}
      <div class="compose-links-footer">
        <button class="btn btn-primary btn-sm" onclick="ComposePage.saveLinks(${projectId})">Save Service Links</button>
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

  async saveSubnets(projectId) {
    const container = document.getElementById(`compose-links-${projectId}`);
    if (!container) return;
    const ids = [...container.querySelectorAll('.compose-subnet-check input:checked')].map(cb => parseInt(cb.value, 10));
    try {
      await fetch(`/api/v1/compose/${projectId}/subnets`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) });
      App.toast('Subnet links saved', 'success');
      await ComposePage.load();
    } catch { App.toast('Failed to save subnet links', 'error'); }
  },

  async saveLinks(projectId) {
    const container = document.getElementById(`compose-links-${projectId}`);
    if (!container) return;
    const links = [];
    container.querySelectorAll('.compose-host-sel').forEach(sel => {
      links.push({ service_name: sel.dataset.svc, host_id: sel.value ? parseInt(sel.value, 10) : null });
    });
    try {
      const res = await fetch(`/api/v1/compose/${projectId}/links`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(links) });
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

  // ── Group modals ────────────────────────────────────────────────────────────

  openAddGroupModal() {
    App.openModal(`
      <div class="modal-header">
        <h3>Add Group</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Group Name *</label>
        <input type="text" id="m-grp-name" placeholder="e.g. Production">
      </div>
      <div class="form-group">
        <label>Color <span class="muted">(optional)</span></label>
        <input type="color" id="m-grp-color" value="#3b82f6" style="height:36px;padding:2px 4px">
      </div>
      <div class="error-msg hidden" id="m-grp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="ComposePage.saveGroup()">Add Group</button>
      </div>
    `);
  },

  async openEditGroupModal(id) {
    const g = ComposePage._groups.find(g => g.id === id);
    if (!g) return;
    App.openModal(`
      <div class="modal-header">
        <h3>Edit Group</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Group Name *</label>
        <input type="text" id="m-grp-name" value="${App.esc(g.name)}">
      </div>
      <div class="form-group">
        <label>Color</label>
        <input type="color" id="m-grp-color" value="${App.esc(g.color || '#3b82f6')}" style="height:36px;padding:2px 4px">
      </div>
      <div class="error-msg hidden" id="m-grp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="ComposePage.saveGroup(${id})">Save</button>
      </div>
    `);
  },

  async saveGroup(id) {
    const name  = document.getElementById('m-grp-name')?.value.trim();
    const color = document.getElementById('m-grp-color')?.value;
    const errEl = document.getElementById('m-grp-err');
    if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
    const res = await fetch(id ? `/api/v1/compose/groups/${id}` : '/api/v1/compose/groups', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, color }),
    });
    if (!res.ok) { const d = await res.json(); errEl.textContent = d.error || 'Failed'; errEl.classList.remove('hidden'); return; }
    App.closeModal();
    App.toast(id ? 'Group updated' : 'Group added', 'success');
    ComposePage.load();
  },

  async deleteGroup(id) {
    const g  = ComposePage._groups.find(g => g.id === id);
    const ok = await App.confirm(
      `Delete group <b>${App.esc(g ? g.name : id)}</b>? Projects in this group will become ungrouped.`,
      { confirmLabel: 'Delete', danger: true }
    );
    if (!ok) return;
    await fetch(`/api/v1/compose/groups/${id}`, { method: 'DELETE' });
    App.toast('Group deleted', 'success');
    ComposePage.load();
  },

  // ── Project modals ──────────────────────────────────────────────────────────

  _groupOptions(selectedId) {
    const none = `<option value="">— No group —</option>`;
    const opts = ComposePage._groups.map(g =>
      `<option value="${g.id}" ${g.id == selectedId ? 'selected' : ''}>${App.esc(g.name)}</option>`
    ).join('');
    return none + opts;
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
        <label>Group</label>
        <select id="m-cmp-group">${ComposePage._groupOptions(null)}</select>
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
        <button class="btn btn-primary" onclick="ComposePage.saveProject()">Add Project</button>
      </div>
    `);
  },

  async openEditModal(id) {
    let data;
    try { data = await fetch(`/api/v1/compose/${id}`).then(r => r.json()); }
    catch { App.toast('Failed to load project', 'error'); return; }

    const iconPreview  = data.icon
      ? `<img src="${App.esc(data.icon)}" class="compose-icon-edit-preview" id="m-cmp-icon-preview-img" onerror="this.style.display='none'">`
      : `<span id="m-cmp-icon-preview-img" style="font-size:28px">🐳</span>`;
    const urlValue = data.icon && !data.icon.startsWith('/uploads/') ? App.esc(data.icon) : '';

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
        <label>Group</label>
        <select id="m-cmp-group">${ComposePage._groupOptions(data.group_id)}</select>
      </div>
      <div class="form-group">
        <label>Icon</label>
        <div class="compose-icon-edit-row">
          <div class="compose-icon-edit-thumb">${iconPreview}</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:6px">
            <input type="text" id="m-cmp-icon-url" placeholder="Image URL (https://…)" value="${urlValue}">
            <div style="display:flex;gap:6px;align-items:center">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
                Upload file
                <input type="file" id="m-cmp-icon-file" accept="image/*" style="display:none"
                       onchange="ComposePage._previewIconFile(this)">
              </label>
              ${data.icon ? `<button class="btn btn-danger btn-sm" onclick="ComposePage._clearIcon(${id})">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <span class="hint">PNG, SVG, JPG · max 2 MB</span>
      </div>
      <div class="form-group">
        <label>docker-compose.yml *</label>
        <textarea id="m-cmp-content" style="min-height:200px;font-family:monospace;font-size:12px;line-height:1.5">${App.esc(data.content)}</textarea>
      </div>
      <div class="error-msg hidden" id="m-cmp-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="ComposePage.saveProject(${id})">Save Changes</button>
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
    await fetch(`/api/v1/compose/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ icon: null }) });
    App.toast('Icon removed', 'success');
    ComposePage.openEditModal(id);
  },

  async saveProject(id) {
    const name    = document.getElementById('m-cmp-name')?.value.trim();
    const desc    = document.getElementById('m-cmp-desc')?.value.trim();
    const content = document.getElementById('m-cmp-content')?.value.trim();
    const iconUrl = document.getElementById('m-cmp-icon-url')?.value.trim();
    const groupEl = document.getElementById('m-cmp-group');
    const groupId = groupEl?.value ? parseInt(groupEl.value, 10) : null;
    const errEl   = document.getElementById('m-cmp-err');

    if (!name || !content) {
      errEl.textContent = 'Project name and compose content are required';
      errEl.classList.remove('hidden');
      return;
    }
    const body = { name, description: desc, content, group_id: groupId };
    if (iconUrl) body.icon = iconUrl;

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
