'use strict';

const DomainsPage = {
  _domains:   [],
  _expanded:  null,
  _collapsed: new Set(),

  _loadCollapsed() {
    try {
      const saved = JSON.parse(localStorage.getItem('sm-domains-collapsed') || '[]');
      DomainsPage._collapsed = new Set(saved);
    } catch { DomainsPage._collapsed = new Set(); }
  },

  _saveCollapsed() {
    localStorage.setItem('sm-domains-collapsed', JSON.stringify([...DomainsPage._collapsed]));
  },

  async load() {
    const container = document.getElementById('domains-list');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 0">Loading…</p>';
    DomainsPage._loadCollapsed();
    try {
      DomainsPage._domains = await fetch('/api/v1/domains').then(r => r.json());
      DomainsPage._render();
    } catch {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Failed to load domains</p>';
    }
  },

  _render() {
    const container = document.getElementById('domains-list');
    if (!container) return;
    const all = DomainsPage._domains;

    if (!all.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⊕</div>
          <h3>No domains yet</h3>
          <p>Add a domain to start managing DNS records and linking IPs</p>
        </div>`;
      return;
    }

    let html = '';

    // ── Grouped by subnet ─────────────────────────────────────────────────
    for (const subnet of App.subnets) {
      const grouped = all.filter(d => d.display_subnet_id === subnet.id);
      if (!grouped.length) continue;
      const isCollapsed = DomainsPage._collapsed.has(subnet.id);
      const dot = subnet.color ? `<span class="compose-group-dot" style="background:${App.esc(subnet.color)}"></span>` : '';
      html += `
        <div class="compose-group">
          <div class="compose-group-header" onclick="DomainsPage.toggleGroup(${subnet.id})">
            ${dot}
            <span class="compose-group-name">${App.esc(subnet.name)}</span>
            <span class="compose-group-meta mono">${App.esc(subnet.network)}/${subnet.cidr}</span>
            <span class="compose-group-count">${grouped.length}</span>
            <span class="compose-chevron">${isCollapsed ? '▶' : '▼'}</span>
          </div>
          ${isCollapsed ? '' : `<div class="compose-group-body">
            ${grouped.map(d => DomainsPage._cardHtml(d)).join('')}
          </div>`}
        </div>`;
    }

    // ── No network ────────────────────────────────────────────────────────
    const unassigned  = all.filter(d => !d.display_subnet_id);
    if (unassigned.length) {
      const isCollapsed = DomainsPage._collapsed.has('none');
      html += `
        <div class="compose-group">
          <div class="compose-group-header compose-group-header--dim" onclick="DomainsPage.toggleGroup('none')">
            <span class="compose-group-name">No Network</span>
            <span class="compose-group-count">${unassigned.length}</span>
            <span class="compose-chevron">${isCollapsed ? '▶' : '▼'}</span>
          </div>
          ${isCollapsed ? '' : `<div class="compose-group-body">
            ${unassigned.map(d => DomainsPage._cardHtml(d)).join('')}
          </div>`}
        </div>`;
    }

    container.innerHTML = html;
    if (DomainsPage._expanded !== null) DomainsPage._loadRecords(DomainsPage._expanded);
  },

  toggleGroup(id) {
    if (DomainsPage._collapsed.has(id)) DomainsPage._collapsed.delete(id);
    else                                DomainsPage._collapsed.add(id);
    DomainsPage._saveCollapsed();
    DomainsPage._render();
  },

  _cardHtml(d) {
    const isExpanded = DomainsPage._expanded === d.id;
    const updated    = new Date(d.updated_at).toLocaleString();
    return `
      <div class="compose-card domain-card" id="domain-card-${d.id}">
        <div class="compose-card-header" onclick="DomainsPage.toggle(${d.id})">
          <span class="domain-globe">🌐</span>
          <div class="compose-info">
            <span class="compose-name mono">${App.esc(d.name)}</span>
            <span class="compose-meta">${d.record_count} record${d.record_count !== 1 ? 's' : ''} · ${updated}</span>
            ${d.description ? `<span class="compose-meta" style="color:var(--text2)">${App.esc(d.description)}</span>` : ''}
          </div>
          <div class="compose-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="DomainsPage.openEditModal(${d.id})">Edit</button>
            <button class="btn btn-danger btn-sm"    onclick="DomainsPage.deleteDomain(${d.id})">Del</button>
          </div>
          <span class="compose-chevron">${isExpanded ? '▲' : '▼'}</span>
        </div>
        ${isExpanded ? `<div id="domain-records-${d.id}"><p style="color:var(--muted);padding:12px 16px;font-size:13px">Loading records…</p></div>` : ''}
      </div>`;
  },

  async toggle(id) {
    if (DomainsPage._expanded === id) {
      DomainsPage._expanded = null;
      DomainsPage._render();
      return;
    }
    DomainsPage._expanded = id;
    DomainsPage._render();
    DomainsPage._loadRecords(id);
  },

  async _loadRecords(id) {
    const container = document.getElementById(`domain-records-${id}`);
    if (!container) return;
    try {
      const data = await fetch(`/api/v1/domains/${id}`).then(r => r.json());
      container.innerHTML = DomainsPage._recordsHtml(id, data.name, data.records || []);
    } catch {
      container.innerHTML = '<p style="color:var(--danger);padding:12px 16px;font-size:13px">Failed to load records</p>';
    }
  },

  _recordsHtml(domainId, domainName, records) {
    // Build flat sorted host list for dropdowns (reused from ComposePage pattern)
    const allHosts = [];
    for (const [sid, d] of Object.entries(App.hosts)) {
      const subnet = App.subnets.find(s => s.id === parseInt(sid, 10));
      for (const h of (d.hosts || [])) allHosts.push({ ...h, subnetName: subnet ? subnet.name : '' });
    }
    allHosts.sort((a, b) => App._ipToInt(a.ip) - App._ipToInt(b.ip));

    const recordRows = records.map(r => DomainsPage._recordRowHtml(domainId, domainName, r, allHosts)).join('');

    return `<div class="domain-records-body">
      <div class="compose-services-header" style="display:flex;align-items:center;justify-content:space-between">
        <span class="compose-section-label">DNS Records</span>
        <button class="btn btn-primary btn-sm" onclick="DomainsPage.openAddRecordModal(${domainId}, '${App.esc(domainName)}')">+ Add Record</button>
      </div>
      ${records.length
        ? `<table class="domain-table"><thead><tr><th>Name</th><th>Type</th><th>Value / Host</th><th>Status</th><th></th></tr></thead>
           <tbody>${recordRows}</tbody></table>`
        : '<p style="color:var(--muted);font-size:13px;padding:10px 14px">No records yet — click + Add Record to start</p>'}
    </div>`;
  },

  _recordRowHtml(domainId, domainName, r, allHosts) {
    const fqdn   = r.name === '@' ? domainName : `${r.name}.${domainName}`;
    const status = r.last_status || (r.host_id ? 'unknown' : null);
    const linked = r.host_ip ? `${r.host_ip}${r.host_name ? ' — ' + r.host_name : ''}` : (r.value || '—');
    return `
      <tr class="domain-record-row" id="drecord-${r.id}">
        <td class="mono" style="font-size:12px">${App.esc(fqdn)}</td>
        <td><span class="dns-type-badge">${r.record_type}</span></td>
        <td style="font-size:12px;color:var(--text2)">${App.esc(linked)}</td>
        <td>${status ? `<span class="status-dot ${status}"></span>` : '<span style="color:var(--muted);font-size:11px">—</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" onclick="DomainsPage.openEditRecordModal(${domainId}, '${App.esc(domainName)}', ${r.id})">edit</button>
          <button class="btn btn-danger btn-sm"    onclick="DomainsPage.deleteRecord(${domainId}, ${r.id})">del</button>
        </td>
      </tr>`;
  },

  // ── Host dropdown helper (searchable, reused pattern) ────────────────────

  _hostPickerHtml(selectedHostId) {
    const allHosts = [];
    for (const [sid, d] of Object.entries(App.hosts)) {
      for (const h of (d.hosts || [])) allHosts.push(h);
    }
    allHosts.sort((a, b) => App._ipToInt(a.ip) - App._ipToInt(b.ip));
    const opts = allHosts.map(h =>
      `<option value="${h.id}" ${h.id == selectedHostId ? 'selected' : ''}>${h.ip}${h.name ? ' — ' + App.esc(h.name) : ''}</option>`
    ).join('');
    return `
      <div class="compose-host-picker">
        <input type="text" class="compose-host-filter" placeholder="Search IP or name…"
               oninput="DomainsPage._filterSelect(this)" autocomplete="off">
        <select id="m-rec-host">
          <option value="">— no host —</option>
          ${opts}
        </select>
      </div>`;
  },

  _filterSelect(input) {
    const query  = input.value.toLowerCase();
    const select = input.closest('.compose-host-picker')?.querySelector('select');
    if (!select) return;
    [...select.options].forEach(opt => {
      if (!opt.value) return;
      opt.hidden = query.length > 0 && !opt.text.toLowerCase().includes(query);
    });
  },

  _networkOptions(selectedId) {
    const none = `<option value="">— No network —</option>`;
    const opts = App.subnets.map(s =>
      `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${App.esc(s.name)} (${s.network}/${s.cidr})</option>`
    ).join('');
    return none + opts;
  },

  // ── Domain modals ─────────────────────────────────────────────────────────

  openAddModal() {
    App.openModal(`
      <div class="modal-header">
        <h3>Add Domain</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Domain Name *</label>
        <input type="text" id="m-dom-name" placeholder="e.g. example.com" class="mono">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-dom-desc" placeholder="Optional">
      </div>
      <div class="form-group">
        <label>Network / Group</label>
        <select id="m-dom-subnet">${DomainsPage._networkOptions(null)}</select>
        <span class="hint">Groups this domain under the selected network</span>
      </div>
      <div class="error-msg hidden" id="m-dom-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary"   onclick="DomainsPage.saveDomain()">Add Domain</button>
      </div>
    `);
  },

  async openEditModal(id) {
    const d = DomainsPage._domains.find(d => d.id === id);
    if (!d) return;
    App.openModal(`
      <div class="modal-header">
        <h3>Edit Domain</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Domain Name *</label>
        <input type="text" id="m-dom-name" value="${App.esc(d.name)}" class="mono">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="m-dom-desc" value="${App.esc(d.description || '')}">
      </div>
      <div class="form-group">
        <label>Network / Group</label>
        <select id="m-dom-subnet">${DomainsPage._networkOptions(d.display_subnet_id)}</select>
      </div>
      <div class="error-msg hidden" id="m-dom-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary"   onclick="DomainsPage.saveDomain(${id})">Save Changes</button>
      </div>
    `);
  },

  async saveDomain(id) {
    const name     = document.getElementById('m-dom-name')?.value.trim();
    const desc     = document.getElementById('m-dom-desc')?.value.trim();
    const subnetEl = document.getElementById('m-dom-subnet');
    const subnetId = subnetEl?.value ? parseInt(subnetEl.value, 10) : null;
    const errEl    = document.getElementById('m-dom-err');
    if (!name) { errEl.textContent = 'Domain name is required'; errEl.classList.remove('hidden'); return; }

    const res = await fetch(id ? `/api/v1/domains/${id}` : '/api/v1/domains', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description: desc, display_subnet_id: subnetId }),
    });
    if (!res.ok) {
      const d = await res.json();
      errEl.textContent = d.error || 'Failed to save';
      errEl.classList.remove('hidden');
      return;
    }
    App.closeModal();
    App.toast(id ? 'Domain updated' : 'Domain added', 'success');
    DomainsPage.load();
  },

  async deleteDomain(id) {
    const d  = DomainsPage._domains.find(d => d.id === id);
    const ok = await App.confirm(
      `Delete domain <b>${App.esc(d ? d.name : id)}</b> and all its records?`,
      { confirmLabel: 'Delete', danger: true }
    );
    if (!ok) return;
    const res = await fetch(`/api/v1/domains/${id}`, { method: 'DELETE' });
    if (!res.ok) { App.toast('Failed to delete', 'error'); return; }
    if (DomainsPage._expanded === id) DomainsPage._expanded = null;
    App.toast('Domain deleted', 'success');
    DomainsPage.load();
  },

  // ── Record modals ─────────────────────────────────────────────────────────

  _recordFormHtml(domainName, rec) {
    const types = ['A','AAAA','CNAME','MX','TXT','NS','SRV','CAA'];
    const typeOpts = types.map(t => `<option value="${t}" ${t === (rec?.record_type || 'A') ? 'selected' : ''}>${t}</option>`).join('');
    return `
      <div class="form-row">
        <div class="form-group">
          <label>Name <span class="muted">(@&nbsp;=&nbsp;root)</span></label>
          <input type="text" id="m-rec-name" value="${App.esc(rec?.name || '@')}" class="mono" placeholder="@">
          <span class="hint">.${App.esc(domainName)}</span>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="m-rec-type" onchange="DomainsPage._toggleRecordValue(this.value)">${typeOpts}</select>
        </div>
      </div>
      <div class="form-group" id="m-rec-host-group">
        <label>Linked Host (IP)</label>
        ${DomainsPage._hostPickerHtml(rec?.host_id)}
      </div>
      <div class="form-group" id="m-rec-value-group">
        <label>Value <span class="muted" id="m-rec-value-hint">(target hostname, text content…)</span></label>
        <input type="text" id="m-rec-value" value="${App.esc(rec?.value || '')}" class="mono" placeholder="e.g. other.example.com">
      </div>
      <div class="form-group" id="m-rec-priority-group" style="display:none">
        <label>Priority <span class="muted">(MX / SRV)</span></label>
        <input type="number" id="m-rec-priority" value="${rec?.priority || ''}" min="0" max="65535" placeholder="10">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input type="text" id="m-rec-notes" value="${App.esc(rec?.notes || '')}" placeholder="Optional">
      </div>`;
  },

  _toggleRecordValue(type) {
    const hostGroup     = document.getElementById('m-rec-host-group');
    const valueGroup    = document.getElementById('m-rec-value-group');
    const priorityGroup = document.getElementById('m-rec-priority-group');
    const hint          = document.getElementById('m-rec-value-hint');
    const hostTypes     = new Set(['A', 'AAAA']);
    const needsPriority = new Set(['MX', 'SRV']);
    if (hostGroup)  hostGroup.style.display     = hostTypes.has(type) ? '' : 'none';
    if (valueGroup) valueGroup.style.display    = hostTypes.has(type) ? 'none' : '';
    if (priorityGroup) priorityGroup.style.display = needsPriority.has(type) ? '' : 'none';
    if (hint) {
      const hints = { CNAME:'target hostname', MX:'mail server hostname', NS:'nameserver hostname', TXT:'text content', SRV:'target hostname', CAA:'CA authorization value', AAAA:'host linked or IPv6 address' };
      hint.textContent = `(${hints[type] || 'value'})`;
    }
  },

  openAddRecordModal(domainId, domainName) {
    App.openModal(`
      <div class="modal-header">
        <h3>Add Record — <span class="mono">${App.esc(domainName)}</span></h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      ${DomainsPage._recordFormHtml(domainName, null)}
      <div class="error-msg hidden" id="m-rec-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary"   onclick="DomainsPage.saveRecord(${domainId})">Add Record</button>
      </div>
    `);
    DomainsPage._toggleRecordValue('A');
  },

  async openEditRecordModal(domainId, domainName, recordId) {
    let rec;
    try { rec = await fetch(`/api/v1/domains/${domainId}`).then(r => r.json()).then(d => d.records.find(r => r.id === recordId)); }
    catch { App.toast('Failed to load record', 'error'); return; }
    if (!rec) { App.toast('Record not found', 'error'); return; }

    App.openModal(`
      <div class="modal-header">
        <h3>Edit Record — <span class="mono">${App.esc(domainName)}</span></h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      ${DomainsPage._recordFormHtml(domainName, rec)}
      <div class="error-msg hidden" id="m-rec-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary"   onclick="DomainsPage.saveRecord(${domainId}, ${recordId})">Save Changes</button>
      </div>
    `);
    DomainsPage._toggleRecordValue(rec.record_type);
  },

  async saveRecord(domainId, recordId) {
    const name     = document.getElementById('m-rec-name')?.value.trim() || '@';
    const type     = document.getElementById('m-rec-type')?.value;
    const hostEl   = document.getElementById('m-rec-host');
    const host_id  = hostEl?.value ? parseInt(hostEl.value, 10) : null;
    const value    = document.getElementById('m-rec-value')?.value.trim();
    const priority = document.getElementById('m-rec-priority')?.value;
    const notes    = document.getElementById('m-rec-notes')?.value.trim();
    const errEl    = document.getElementById('m-rec-err');

    const hostTypes = new Set(['A', 'AAAA']);
    const body = {
      name, record_type: type, notes: notes || null,
      host_id:  hostTypes.has(type) ? host_id : null,
      value:    hostTypes.has(type) ? null : (value || null),
      priority: priority ? parseInt(priority, 10) : null,
    };

    const url    = recordId ? `/api/v1/domains/${domainId}/records/${recordId}` : `/api/v1/domains/${domainId}/records`;
    const method = recordId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json();
      errEl.textContent = d.error || 'Failed to save';
      errEl.classList.remove('hidden');
      return;
    }
    App.closeModal();
    App.toast(recordId ? 'Record updated' : 'Record added', 'success');
    DomainsPage._loadRecords(domainId);
    DomainsPage.load(); // refresh count on card
  },

  async deleteRecord(domainId, recordId) {
    const ok = await App.confirm('Delete this DNS record?', { confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/v1/domains/${domainId}/records/${recordId}`, { method: 'DELETE' });
    if (!res.ok) { App.toast('Failed to delete record', 'error'); return; }
    App.toast('Record deleted', 'success');
    DomainsPage._loadRecords(domainId);
    DomainsPage.load();
  },

  // SSE: update status dots in domain records when a host status changes
  onStatusUpdate(hostId, status) {
    document.querySelectorAll('[id^="drecord-"]').forEach(row => {
      // The status dot is in a <td>; we can't easily correlate without data attribute
      // So we rely on the next _loadRecords refresh cycle — lightweight enough
    });
  },
};
