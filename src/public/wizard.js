'use strict';

const Wizard = {
  _step: 0,
  _totalSteps: 3,  // steps 0, 1, 2

  show() {
    document.getElementById('wizard-overlay').classList.remove('hidden');
    Wizard._step = 0;
    Wizard._renderDots();
    Wizard._showStep(0);
    setTimeout(() => {
      const el = document.getElementById('wiz-subnet-name');
      if (el) el.focus();
    }, 100);
  },

  hide() {
    document.getElementById('wizard-overlay').classList.add('hidden');
  },

  _renderDots() {
    const container = document.getElementById('wizard-dots');
    const pages = document.querySelectorAll('.step-page');
    container.innerHTML = Array.from(pages).map((_, i) => {
      let cls = 'wizard-step-dot';
      if (i < Wizard._step) cls += ' done';
      else if (i === Wizard._step) cls += ' active';
      return `<span class="${cls}"></span>`;
    }).join('');
  },

  _showStep(step) {
    document.querySelectorAll('.step-page').forEach((p, i) => {
      p.classList.toggle('active', i === step);
    });
    Wizard._renderDots();
  },

  next() {
    if (Wizard._step === 1) {
      // Validate network step
      const network = document.getElementById('wiz-network').value.trim();
      if (!network) {
        App.toast('Network address is required', 'error');
        return;
      }
    }

    if (Wizard._step < Wizard._totalSteps - 1) {
      Wizard._step++;
      Wizard._showStep(Wizard._step);
      if (Wizard._step === 2) {
        setTimeout(() => {
          const el = document.getElementById('wiz-username');
          if (el) el.focus();
        }, 50);
      }
    }
  },

  prev() {
    if (Wizard._step > 0) {
      Wizard._step--;
      Wizard._showStep(Wizard._step);
    }
  },

  async submit() {
    const username  = document.getElementById('wiz-username').value.trim();
    const password  = document.getElementById('wiz-password').value;
    const password2 = document.getElementById('wiz-password2').value;
    const errEl     = document.getElementById('wiz-error');
    const btn       = document.getElementById('wiz-submit-btn');

    errEl.classList.add('hidden');

    if (!username) {
      errEl.textContent = 'Username is required';
      errEl.classList.remove('hidden');
      return;
    }
    if (!password || password.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters';
      errEl.classList.remove('hidden');
      return;
    }
    if (password !== password2) {
      errEl.textContent = 'Passwords do not match';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Setting up…';

    const email = document.getElementById('wiz-email')?.value.trim() || '';
    const body = {
      username,
      password,
      email:               email || undefined,
      subnet_name:         document.getElementById('wiz-subnet-name').value.trim(),
      network:             document.getElementById('wiz-network').value.trim(),
      cidr:                parseInt(document.getElementById('wiz-cidr').value, 10),
      network_mode:        document.getElementById('wiz-mode').value,
    };

    try {
      const res = await fetch('/api/v1/wizard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Setup failed';
        errEl.classList.remove('hidden');
        return;
      }
      // Setup complete — init app
      Wizard.hide();
      await App.init();
    } catch (err) {
      errEl.textContent = 'Network error — please try again';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Complete Setup';
    }
  },
};
