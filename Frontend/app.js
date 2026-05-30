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
                    // The wizard.js file will handle showing the wizard
                    if (window.wizard && typeof window.wizard.show === 'function') {
                        window.wizard.show();
                    }
                } else {
                    this.checkAuth();
                }
            } catch (error) {
                console.error('Error checking setup status:', error);
                document.body.innerHTML = '<h1>Error connecting to backend API. Is the server running?</h1>';
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

        connectSse() {
            console.log('Connecting to SSE endpoint...');
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
                // The browser will automatically try to reconnect.
            };
        },

        updateHostStatus(hostId, newStatus) {
            const hostDot = document.querySelector(`.host-row[data-host-id="${hostId}"] .status-dot`);
            if (hostDot) {
                hostDot.className = `status-dot ${newStatus || 'unknown'}`;
            }
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
                
                this.state.hosts = {}; // Clear previous host state
                this.state.subnets.forEach((subnet, index) => {
                    this.state.hosts[subnet.id] = hostsBySubnet[index];
                });

                this.renderDashboard();
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
                document.getElementById('subnet-grid').innerHTML = `<p>Error loading data. Is the server running?</p>`;
            }
        },

        renderDashboard() {
            const grid = document.getElementById('subnet-grid');
            if (!grid) return;
            
            if (this.state.subnets.length === 0) {
                grid.innerHTML = '<div class="card"><p>No subnets have been created yet.</p></div>';
                return;
            }

            grid.innerHTML = this.state.subnets.map(subnet => {
                const hosts = this.state.hosts[subnet.id] || [];
                const subnetColorDot = subnet.color ? `<span class="subnet-color-dot" style="background-color: ${subnet.color};"></span>` : '';
                
                return `
                    <div class="card subnet-card" data-subnet-id="${subnet.id}">
                        <div class="card-header">
                            <div class="card-title">
                                ${subnetColorDot}
                                <h2>${subnet.name}</h2>
                            </div>
                            <span class="network-range">${subnet.network}/${subnet.cidr}</span>
                        </div>
                        <div class="host-list">
                            ${hosts.map(host => `
                                <div class="host-row" data-host-id="${host.id}">
                                    <span class="status-dot ${host.last_status || 'unknown'}"></span>
                                    <span class="ip-address">${host.ip}</span>
                                    <span class="host-name">${host.name || ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');
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
            const themeToggle = document.getElementById('theme-toggle');
            const storedTheme = localStorage.getItem('theme');
            const html = document.documentElement;

            if (storedTheme) {
                html.className = storedTheme;
            }

            themeToggle.addEventListener('click', () => {
                if (html.classList.contains('dark')) {
                    html.classList.remove('dark');
                    html.classList.add('light');
                } else {
                    html.classList.remove('light');
                    html.classList.add('dark');
                }
                localStorage.setItem('theme', html.className);
            });
        },
        
        bindEvents() {
            const logoutBtn = document.getElementById('logout-btn');
            logoutBtn.addEventListener('click', async () => {
                try {
                    await fetch('/api/v1/auth/logout', { method: 'POST' });
                    window.location.reload();
                } catch (error) {
                    console.error('Logout failed:', error);
                }
            });
        }
    };

    // Expose app and a startup function to the window scope
    // so other files can interact with it if needed.
    window.app = app;
    app.init();
});
