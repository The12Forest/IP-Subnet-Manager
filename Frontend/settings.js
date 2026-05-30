window.settings = {
    async load() {
        try {
            const response = await fetch('/api/v1/settings');
            if (!response.ok) throw new Error('Failed to fetch settings');
            const data = await response.json();
            
            // For this version, we just show the MCP token which is a bit special
            // It's not in the settings table by default if auto-generated,
            // but we can add an endpoint or just rely on the fact that 
            // the user can see it in the console or set it.
            // Let's assume for now we only show it if it's set in the DB or via a special help endpoint.
            
            this.loadUsers();
            this.loadAbout();
        } catch (error) {
            console.error('Settings load error:', error);
        }
    },

    async loadUsers() {
        const userList = document.getElementById('user-list');
        try {
            const response = await fetch('/api/v1/users');
            if (!response.ok) return;
            const users = await response.json();
            
            userList.innerHTML = users.map(u => `
                <div class="user-row" style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 4px;">
                    <span>${u.username} (${u.role})</span>
                    <button class="danger small delete-user" data-id="${u.id}" style="padding: 2px 8px; font-size: 0.75rem;">Delete</button>
                </div>
            `).join('');

            document.querySelectorAll('.delete-user').forEach(btn => {
                btn.onclick = async (e) => {
                    if (confirm('Are you sure you want to delete this user?')) {
                        const id = e.target.dataset.id;
                        const res = await fetch(`/api/v1/users/${id}`, { method: 'DELETE' });
                        if (res.ok) this.loadUsers();
                        else alert('Failed to delete user');
                    }
                };
            });
        } catch (e) {}
    },

    async loadAbout() {
        // We'll need a backend endpoint to get the current MCP token if we want to show it.
        // For now, let's just placeholder it as "Check server logs" or similar
        // unless we want to add that endpoint.
        document.getElementById('mcp-token-display').textContent = 'See server logs on startup';
    }
};
