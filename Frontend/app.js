document.addEventListener('DOMContentLoaded', () => {
    const app = {
        state: {
            user: null,
            subnets: [],
            hosts: {},
        },

        init() {
            this.checkSetup();
            this.initTheme();
            this.bindEvents();
        },

        async checkSetup() {
            try {
                const response = await fetch('/api/v1/setup/status');
                if (!response.ok) throw new Error('Could not connect to API.');
                
                const data = await response.json();
                if (data.needsSetup) {
                    if (window.wizard && typeof window.wizard.show === 'function') {
                        window.wizard.show();
                    }
                } else {
                    this.checkAuth();
                }
            } catch (error) {
                console.error('Error checking setup status:', error);
                document.body.innerHTML = '<div style="padding: 2rem; text-align: center;"><h1>Error connecting to backend API.</h1><p>Is the server running?</p></div>';
            }
        },

        async checkAuth() {
            try {
                const response = await fetch('/api/v1/auth/me');
                if (response.ok) {
                    this.state.user = await response.json();
                    this.showDashboard();
                } else {
                    this.showLogin();
                }
            } catch (error) {
                console.error('Error checking auth status:', error);
                this.showLogin();
            }
        },
        
        showDashboard() {
            document.getElementById('login-modal').style.display = 'none';
            const userMenu = document.getElementById('user-menu');
            userMenu.style.display = 'flex';
            if (this.state.user) {
                document.getElementById('current-user').textContent = this.state.user.username;
            }
            this.fetchAndRenderDashboard();
            this.connectSse();
        },

        async fetchAndRenderDashboard() {
            try {
                const subnetsRes = await fetch('/api/v1/subnets');
                if (!subnetsRes.ok) throw new Error('Failed to fetch subnets');
                this.state.subnets = await subnetsRes.json();

                const hostPromises = this.state.subnets.map(subnet => 
                    fetch(`/api/v1/subnets/${subnet.id}/hosts`).then(res => {
                        if (!res.ok) throw new Error(`Failed to fetch hosts for subnet ${subnet.id}`);
                        return res.json();
                    })
                );
                
                const hostsBySubnet = await Promise.all(hostPromises);
                
                this.state.hosts = {};
                this.state.subnets.forEach((subnet, index) => {
                    this.state.hosts[subnet.id] = hostsBySubnet[index];
                });

                this.updateStats();
                this.renderDashboard();
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            }
        },

        updateStats() {
            document.getElementById('stat-subnets').textContent = this.state.subnets.length;
            let hostCount = 0;
            Object.values(this.state.hosts).forEach(hosts => hostCount += hosts.length);
            document.getElementById('stat-hosts').textContent = hostCount;
        },

        renderDashboard() {
            const grid = document.getElementById('subnet-grid');
            const query = document.getElementById('global-search').value.toLowerCase();
            
            if (this.state.subnets.length === 0) {
                grid.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center;"><p>No subnets found. Click "Add Subnet" to get started.</p></div>';
                return;
            }

            const filteredSubnets = this.state.subnets.filter(s => {
                if (!query) return true;
                const hosts = this.state.hosts[s.id] || [];
                return s.name.toLowerCase().includes(query) || 
                       s.network.includes(query) ||
                       hosts.some(h => h.ip.includes(query) || h.name.toLowerCase().includes(query));
            });

            grid.innerHTML = filteredSubnets.map(subnet => {
                let hosts = this.state.hosts[subnet.id] || [];
                if (query) {
                    hosts = hosts.filter(h => h.ip.includes(query) || h.name.toLowerCase().includes(query));
                }

                const colorDot = subnet.color ? `<span class="subnet-color-dot" style="background-color: ${subnet.color}"></span>` : '';
                
                return `
                    <div class="card subnet-card" data-id="${subnet.id}">
                        <div class="card-header">
                            <div class="card-title">
                                ${colorDot}
                                <h2 class="edit-subnet" title="Click to edit subnet" style="cursor: pointer;">${subnet.name}</h2>
                            </div>
                            <span class="network-range">${subnet.network}/${subnet.cidr}</span>
                        </div>
                        <div class="host-list">
                            ${hosts.map(host => `
                                <div class="host-row" data-id="${host.id}">
                                    <span class="status-dot ${host.last_status || 'unknown'}"></span>
                                    <span class="ip-address">${host.ip}</span>
                                    <span class="host-name">${host.name || ''}</span>
                                </div>
                            `).join('')}
                            <div class="host-row add-host-row" style="color: var(--accent-primary); justify-content: center; font-weight: 500; cursor: pointer;">
                                + Add Host
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            this.bindCardEvents();
        },

        bindEvents() {
            // Theme toggle
            document.getElementById('theme-toggle').onclick = () => {
                const html = document.documentElement;
                html.classList.toggle('dark');
                html.classList.toggle('light');
                localStorage.setItem('theme', html.className);
            };

            // Logout
            document.getElementById('logout-btn').onclick = async () => {
                await fetch('/api/v1/auth/logout', { method: 'POST' });
                window.location.reload();
            };

            // Settings button
            document.getElementById('settings-btn').onclick = () => {
                document.getElementById('settings-sidebar').style.display = 'flex';
                if (window.settings && window.settings.load) window.settings.load();
            };

            document.getElementById('close-settings').onclick = () => {
                document.getElementById('settings-sidebar').style.display = 'none';
            };

            // Search
            document.getElementById('global-search').oninput = () => this.renderDashboard();

            // Add Subnet
            document.getElementById('add-subnet-btn').onclick = () => {
                this.showSubnetModal();
            };

            // Modal cancel buttons
            document.querySelectorAll('.cancel-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.target.closest('.modal').style.display = 'none';
                };
            });

            // Subnet form submit
            document.getElementById('subnet-form').onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('subnet-id').value;
                const data = {
                    name: document.getElementById('subnet-name').value,
                    network: document.getElementById('subnet-network').value,
                    cidr: parseInt(document.getElementById('subnet-cidr').value),
                    color: document.getElementById('subnet-color').value
                };

                const method = id ? 'PUT' : 'POST';
                const url = id ? `/api/v1/subnets/${id}` : '/api/v1/subnets';

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (res.ok) {
                    document.getElementById('subnet-modal').style.display = 'none';
                    this.fetchAndRenderDashboard();
                } else {
                    const err = await res.json();
                    alert(err.error || 'Failed to save subnet');
                }
            };

            // Host form submit
            document.getElementById('host-form').onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('host-id').value;
                const subnetId = document.getElementById('host-subnet-id').value;
                const data = {
                    ip: document.getElementById('host-ip').value,
                    name: document.getElementById('host-name').value,
                    type: document.getElementById('host-type').value,
                    check_port: document.getElementById('host-port').value ? parseInt(document.getElementById('host-port').value) : null,
                    notes: document.getElementById('host-notes').value
                };

                const method = id ? 'PUT' : 'POST';
                const url = id ? `/api/v1/hosts/${id}` : `/api/v1/subnets/${subnetId}/hosts`;

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (res.ok) {
                    document.getElementById('host-modal').style.display = 'none';
                    this.fetchAndRenderDashboard();
                } else {
                    const err = await res.json();
                    alert(err.error || 'Failed to save host');
                }
            };
        },

        bindCardEvents() {
            // Edit Subnet
            document.querySelectorAll('.edit-subnet').forEach(el => {
                el.onclick = (e) => {
                    const id = e.target.closest('.subnet-card').dataset.id;
                    const subnet = this.state.subnets.find(s => s.id == id);
                    this.showSubnetModal(subnet);
                };
            });

            // Add Host
            document.querySelectorAll('.add-host-row').forEach(el => {
                el.onclick = (e) => {
                    const subnetId = e.target.closest('.subnet-card').dataset.id;
                    this.showHostModal(null, subnetId);
                };
            });

            // Edit Host
            document.querySelectorAll('.host-row:not(.add-host-row)').forEach(el => {
                el.onclick = (e) => {
                    const hostId = e.currentTarget.dataset.id;
                    const subnetId = e.currentTarget.closest('.subnet-card').dataset.id;
                    const host = this.state.hosts[subnetId].find(h => h.id == hostId);
                    this.showHostModal(host, subnetId);
                };
            });
        },

        showSubnetModal(subnet = null) {
            const modal = document.getElementById('subnet-modal');
            document.getElementById('subnet-modal-title').textContent = subnet ? 'Edit Subnet' : 'Add Subnet';
            document.getElementById('subnet-id').value = subnet ? subnet.id : '';
            document.getElementById('subnet-name').value = subnet ? subnet.name : '';
            document.getElementById('subnet-network').value = subnet ? subnet.network : '';
            document.getElementById('subnet-cidr').value = subnet ? subnet.cidr : '24';
            document.getElementById('subnet-color').value = subnet ? subnet.color : '#3b82f6';
            modal.style.display = 'flex';
        },

        showHostModal(host = null, subnetId) {
            const modal = document.getElementById('host-modal');
            document.getElementById('host-modal-title').textContent = host ? 'Edit Host' : 'Add Host';
            document.getElementById('host-id').value = host ? host.id : '';
            document.getElementById('host-subnet-id').value = subnetId;
            document.getElementById('host-ip').value = host ? host.ip : '';
            document.getElementById('host-name').value = host ? host.name : '';
            document.getElementById('host-type').value = host ? host.type : 'container';
            document.getElementById('host-port').value = (host && host.check_port) ? host.check_port : '';
            document.getElementById('host-notes').value = host ? host.notes : '';
            modal.style.display = 'flex';
        },

        showLogin() {
            const loginModal = document.getElementById('login-modal');
            loginModal.style.display = 'flex';

            const loginForm = document.getElementById('login-form');
            loginForm.onsubmit = async (e) => {
                e.preventDefault();
                const username = document.getElementById('login-username').value;
                const password = document.getElementById('login-password').value;
                
                try {
                    const response = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password }),
                    });

                    if (response.ok) {
                        window.location.reload();
                    } else {
                        alert('Login failed. Please check your username and password.');
                    }
                } catch (error) {
                    alert('An error occurred during login.');
                }
            };
        },
        
        initTheme() {
            const html = document.documentElement;
            const storedTheme = localStorage.getItem('theme');
            if (storedTheme) {
                html.className = storedTheme;
            } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                html.className = 'light';
            }
        },

        connectSse() {
            const evtSource = new EventSource('/api/v1/events');
            
            evtSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'status_update' && data.payload) {
                        this.updateHostStatus(data.payload.hostId, data.payload.status);
                    }
                } catch (e) {
                    console.error('Error parsing SSE message:', e);
                }
            };

            evtSource.onerror = (err) => {
                console.error('EventSource failed:', err);
            };
        },

        updateHostStatus(hostId, newStatus) {
            const hostDot = document.querySelector(`.host-row[data-id="${hostId}"] .status-dot`);
            if (hostDot) {
                hostDot.className = `status-dot ${newStatus || 'unknown'}`;
            }
        }
    };

    window.app = app;
    app.init();
});
