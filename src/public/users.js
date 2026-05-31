'use strict';

const UsersPanel = {
  _users: [],

  async load() {
    const container = document.getElementById('users-panel-content');
    container.innerHTML = '<p style="color:var(--muted);font-size:13px">Loading…</p>';

    if (!App.user || App.user.role !== 'admin') {
      container.innerHTML = '<p style="color:var(--muted);font-size:13px">Admin access required.</p>';
      return;
    }

    try {
      UsersPanel._users = await fetch('/api/v1/users').then(r => r.json());
      UsersPanel.render(container);
    } catch {
      container.innerHTML = '<p style="color:var(--danger);font-size:13px">Failed to load users</p>';
    }
  },

  render(container) {
    const rows = UsersPanel._users.map(u => {
      const avatar = u.gravatar_url
        ? `<img src="${App.esc(u.gravatar_url)}&s=40" class="user-avatar-sm"
               onerror="this.parentElement.textContent='${App.esc(u.username[0].toUpperCase())}'" alt="">`
        : `<span class="user-avatar-sm user-avatar-letter">${App.esc(u.username[0].toUpperCase())}</span>`;
      return `
        <tr>
          <td style="width:36px">${avatar}</td>
          <td>${App.esc(u.username)}</td>
          <td style="color:var(--muted);font-size:12px">${u.email ? App.esc(u.email) : '—'}</td>
          <td><span class="action-badge ${u.role === 'admin' ? 'create' : u.role === 'editor' ? 'update' : ''}">${u.role}</span></td>
          <td style="white-space:nowrap">${u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="UsersPanel.openEditModal(${u.id})">edit</button>
            ${u.id !== App.user.id ? `<button class="btn btn-danger btn-sm" onclick="UsersPanel.deleteUser(${u.id})">del</button>` : ''}
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="UsersPanel.openAddModal()">+ Add User</button>
      </div>
      <table class="audit-table">
        <thead>
          <tr><th></th><th>Username</th><th>Email</th><th>Role</th><th>Last Login</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  openAddModal() {
    App.openModal(`
      <div class="modal-header">
        <h3>Add User</h3>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Username *</label>
        <input type="text" id="mu-username" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Email <span class="muted">(optional — Gravatar avatar)</span></label>
        <input type="email" id="mu-email" placeholder="user@example.com" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Password *</label>
        <input type="password" id="mu-password" autocomplete="new-password" placeholder="Min. 8 characters">
      </div>
      <div class="form-group">
        <label>Role</label>
        <select id="mu-role">
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <div class="error-msg hidden" id="mu-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="UsersPanel.saveUser(null)">Add User</button>
      </div>
    `);
  },

  openEditModal(id) {
    const u = UsersPanel._users.find(u => u.id === id);
    if (!u) return;
    App.openModal(`
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:10px">
          ${u.gravatar_url
            ? `<img src="${App.esc(u.gravatar_url)}&s=48" style="width:36px;height:36px;border-radius:50%;object-fit:cover" alt="">`
            : `<span style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600">${App.esc(u.username[0].toUpperCase())}</span>`}
          <h3>Edit: ${App.esc(u.username)}</h3>
        </div>
        <button class="modal-close" onclick="App.closeModal()">×</button>
      </div>
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="mu-username" value="${App.esc(u.username)}" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Email <span class="muted">(optional — Gravatar avatar)</span></label>
        <input type="email" id="mu-email" value="${App.esc(u.email || '')}" placeholder="user@example.com">
        <span class="hint">Add an email to get a Gravatar profile picture</span>
      </div>
      <div class="form-group">
        <label>New Password <span class="muted">(leave blank to keep current)</span></label>
        <input type="password" id="mu-password" autocomplete="new-password" placeholder="Leave blank to keep">
      </div>
      <div class="form-group">
        <label>Role</label>
        <select id="mu-role">
          <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>viewer</option>
          <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>editor</option>
          <option value="admin"  ${u.role === 'admin'  ? 'selected' : ''}>admin</option>
        </select>
      </div>
      <div class="error-msg hidden" id="mu-err"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="UsersPanel.saveUser(${id})">Save Changes</button>
      </div>
    `);
  },

  async saveUser(id) {
    const username = document.getElementById('mu-username').value.trim();
    const email    = document.getElementById('mu-email')?.value.trim() || '';
    const password = document.getElementById('mu-password').value;
    const role     = document.getElementById('mu-role').value;
    const errEl    = document.getElementById('mu-err');

    errEl.classList.add('hidden');
    if (!username) { errEl.textContent = 'Username is required'; errEl.classList.remove('hidden'); return; }
    if (!id && (!password || password.length < 8)) {
      errEl.textContent = 'Password must be at least 8 characters';
      errEl.classList.remove('hidden');
      return;
    }

    const body = { username, email: email || null, role };
    if (password) body.password = password;

    const res = await fetch(id ? `/api/v1/users/${id}` : '/api/v1/users', {
      method:  id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed to save user'; errEl.classList.remove('hidden'); return; }

    App.closeModal();
    UsersPanel.load();
    App.toast(id ? 'User updated' : 'User added', 'success');

    // If the current user updated their own email, refresh the topbar avatar
    if (id === App.user.id && data.gravatar_url) {
      App.user.gravatar_url = data.gravatar_url;
      App.user.email        = data.email;
      const avatarEl = document.getElementById('user-avatar');
      if (avatarEl && data.gravatar_url) {
        avatarEl.innerHTML = `<img src="${data.gravatar_url}&s=44"
          style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block" alt="">`;
      }
    }
  },

  async deleteUser(id) {
    const u  = UsersPanel._users.find(u => u.id === id);
    const ok = await App.confirm(
      `Delete user <b>${App.esc(u ? u.username : id)}</b>?`,
      { confirmLabel: 'Delete', danger: true }
    );
    if (!ok) return;
    const res = await fetch(`/api/v1/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); App.toast(d.error || 'Failed to delete', 'error'); return; }
    UsersPanel.load();
    App.toast('User deleted', 'success');
  },
};
