window.wizard = {
    show() {
        const overlay = document.getElementById('wizard-overlay');
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal-content card">
                <h2>Subnet Manager Setup</h2>
                <p>Welcome! Please create the initial admin user and configure your network settings.</p>
                <form id="wizard-form">
                    <fieldset>
                        <legend>Admin Account</legend>
                        <label for="wizard-username">Admin Username</label>
                        <input type="text" id="wizard-username" value="admin" required>
                        <label for="wizard-password">Admin Password</label>
                        <input type="password" id="wizard-password" required>
                    </fieldset>
                    <hr>
                    <fieldset>
                        <legend>Network Configuration</legend>
                        <label for="wizard-base-ip">Network Base IP</label>
                        <input type="text" id="wizard-base-ip" value="10.10.0.0">
                        <label for="wizard-mask">Default Subnet Mask</label>
                        <input type="text" id="wizard-mask" value="255.255.0.0">
                        <label for="wizard-cidr">Default Subnet Size (CIDR)</label>
                        <input type="number" id="wizard-cidr" value="24" min="1" max="32">
                    </fieldset>
                    <button type="submit">Complete Setup</button>
                </form>
            </div>
        `;

        document.getElementById('wizard-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Submitting...';

            const username = document.getElementById('wizard-username').value;
            const password = document.getElementById('wizard-password').value;
            
            const settings = {
                network_base_ip: document.getElementById('wizard-base-ip').value,
                default_subnet_mask: document.getElementById('wizard-mask').value,
                default_subnet_cidr: document.getElementById('wizard-cidr').value,
            };

            try {
                const response = await fetch('/api/v1/setup/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, settings }),
                });

                if (response.ok) {
                    alert('Setup complete! The application will now reload.');
                    window.location.reload();
                } else {
                    const error = await response.json();
                    alert(`Setup failed: ${error.error || 'Unknown error'}`);
                    submitButton.disabled = false;
                    submitButton.textContent = 'Complete Setup';
                }
            } catch (err) {
                alert('An error occurred during setup. Check the console and ensure the backend is running.');
                submitButton.disabled = false;
                submitButton.textContent = 'Complete Setup';
            }
        });
    }
};
