/* qBitRead login component (Alpine.js CSP build). */
(function () {
  'use strict';

  document.addEventListener('alpine:init', () => {
    Alpine.data('loginApp', () => ({
      username: '',
      password: '',
      errorText: '',
      submitting: false,

      get hasError() { return this.errorText !== ''; },

      async submit() {
        this.errorText = '';
        const u = (this.username || '').trim();
        const p = this.password || '';
        if (!u || !p) {
          this.errorText = 'Please enter username and password.';
          return;
        }
        this.submitting = true;
        try {
          const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p }),
          });

          if (resp.status === 429) {
            this.errorText = 'Too many attempts. Please wait and try again.';
            return;
          }

          const data = await resp.json();

          if (!resp.ok) {
            this.errorText = data.detail || 'Login failed.';
            return;
          }

          if (data.password_weak) {
            try { sessionStorage.setItem('password_weak', '1'); } catch (_) { /* ignore */ }
          }
          window.location.href = '/';
        } catch (_) {
          this.errorText = 'Network error. Please try again.';
        } finally {
          this.submitting = false;
        }
      },
    }));
  });
})();
