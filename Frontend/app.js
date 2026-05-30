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
            document.getElementById('current-user').textContent = this.state.user.username;
            
            // TODO: Fetch subnets and hosts and render them
            console.log('User is authenticated, showing dashboard.');
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
