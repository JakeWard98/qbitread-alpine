/* qBitRead admin component (Alpine.js CSP build).
 *
 * The CSP evaluator only resolves dot-separated property paths, so
 * everything the template binds to has to be a property/method on the
 * component or on the iteration variable. Per-row inline edit forms
 * are rendered by flattening users + active-edit-form into one row
 * list (`userRows`) and toggling cells with x-show.
 */
(function () {
  'use strict';

  function roleBadgeClass(role) {
    if (role === 'admin') return 'badge badge-admin';
    if (role === 'monitor') return 'badge badge-monitor';
    return 'badge badge-user';
  }

  function roleLabel(role) {
    if (role === 'admin') return 'Admin';
    if (role === 'monitor') return 'Monitor';
    return 'User';
  }

  document.addEventListener('alpine:init', () => {
    Alpine.data('adminApp', () => ({
      /* ── State ── */
      users: [],
      adminError: '',

      // Create-user form
      newUsername: '',
      newPassword: '',
      newRole: 'user',

      // Inline edit state
      pwEditId: null,
      pwInput: '',
      pwMsg: '',
      pwMsgIsError: true,

      roleEditId: null,
      roleInput: 'user',
      roleMsg: '',
      roleMsgIsError: true,

      // Refresh rate
      refreshRate: 5,
      refreshMsg: '',
      refreshMsgIsError: false,

      // qBit connection
      qbitDotClass: 'dot',
      qbitStatusText: 'Checking...',
      qbitStatusColor: '',
      qbitStatusMsg: '',
      browserAuthEnabled: false,
      browserHost: '',
      qbitUsername: '',

      // Browser auth form
      qbitUrl: '',
      qbitUser: '',
      qbitPass: '',
      browserAuthMsg: '',
      browserAuthMsgColor: '',

      retryDisabled: false,
      retryLabel: 'Retry Login',

      /* ── Init ── */
      async init() {
        await this.checkAdmin();
        this.loadUsers();
        this.loadConnectionInfo();
        this.loadRefreshRate();
      },

      async checkAdmin() {
        try {
          const resp = await fetch('/api/auth/me');
          if (!resp.ok) { window.location.href = '/login'; return; }
          const user = await resp.json();
          if (!user.is_admin) { window.location.href = '/'; return; }
        } catch (_) {
          window.location.href = '/login';
        }
      },

      /* ── Users ── */
      async loadUsers() {
        this.adminError = '';
        try {
          const resp = await fetch('/api/auth/users');
          if (resp.status === 401) { window.location.href = '/login'; return; }
          if (resp.status === 403) { window.location.href = '/'; return; }
          const users = await resp.json();
          this.users = users.map((u) => ({
            id: u.id,
            username: u.username,
            role: u.role,
            roleBadgeClass: roleBadgeClass(u.role),
            roleLabel: roleLabel(u.role),
            pwOk: !!u.password_meets_policy,
            pwBadgeClass: 'badge ' + (u.password_meets_policy ? 'badge-pw-ok' : 'badge-pw-weak'),
            pwBadgeText: u.password_meets_policy ? 'OK' : 'Weak',
            pwBadgeTitle: u.password_meets_policy ? '' : 'Password does not meet current security requirements',
            createdText: u.created_at ? new Date(u.created_at).toLocaleDateString() : '',
          }));
        } catch (_) {
          this.adminError = 'Failed to load users.';
        }
      },

      get userRows() {
        const rows = [];
        for (const u of this.users) {
          rows.push({ key: 'u-' + u.id, kind: 'user', isUserRow: true, isPwEdit: false, isRoleEdit: false, user: u });
          if (this.pwEditId === u.id) {
            rows.push({ key: 'pw-' + u.id, kind: 'pw', isUserRow: false, isPwEdit: true, isRoleEdit: false, user: u });
          }
          if (this.roleEditId === u.id) {
            rows.push({ key: 'role-' + u.id, kind: 'role', isUserRow: false, isPwEdit: false, isRoleEdit: true, user: u });
          }
        }
        return rows;
      },

      get pwMsgStyle() {
        return 'color:' + (this.pwMsgIsError ? 'var(--red)' : 'var(--green)');
      },
      get roleMsgStyle() {
        return 'color:' + (this.roleMsgIsError ? 'var(--red)' : 'var(--green)');
      },
      get refreshMsgStyle() {
        return 'color:' + (this.refreshMsgIsError ? 'var(--red)' : 'var(--green)');
      },
      get browserAuthBlockStyle() {
        return this.browserAuthEnabled
          ? 'display:flex;flex-direction:column;gap:14px'
          : 'display:none';
      },

      async deleteUser(event) {
        const id = parseInt(event.currentTarget.dataset.id, 10);
        if (!id) return;
        if (!confirm('Delete this user?')) return;
        this.adminError = '';
        try {
          const resp = await fetch('/api/auth/users/' + id, {
            method: 'DELETE',
            headers: qbr.csrfHeaders(),
          });
          if (!resp.ok) {
            let detail = 'Failed to delete user.';
            try { const data = await resp.json(); if (data.detail) detail = data.detail; } catch (_) { /* ignore */ }
            this.adminError = detail;
            return;
          }
          this.loadUsers();
        } catch (_) {
          this.adminError = 'Network error.';
        }
      },

      /* ── Inline password edit ── */
      startEditPassword(event) {
        const id = parseInt(event.currentTarget.dataset.id, 10);
        if (!id) return;
        if (this.pwEditId === id) {
          this.cancelEdit();
          return;
        }
        this.pwEditId = id;
        this.pwInput = '';
        this.pwMsg = '';
        this.pwMsgIsError = true;
        this.roleEditId = null;
      },

      async savePassword() {
        this.pwMsg = '';
        this.pwMsgIsError = true;
        const userId = this.pwEditId;
        const pw = this.pwInput || '';
        if (!userId) return;
        if (!pw) { this.pwMsg = 'Password is required.'; return; }
        const check = qbr.validatePassword(pw);
        if (!check.valid) {
          this.pwMsg = 'Missing: ' + check.errors.join(', ');
          return;
        }
        try {
          const resp = await fetch('/api/auth/users/' + userId + '/password', {
            method: 'PUT',
            headers: qbr.csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ password: pw }),
          });
          if (!resp.ok) {
            let detail = 'Failed to change password.';
            try { const data = await resp.json(); if (data.detail) detail = data.detail; } catch (_) { /* ignore */ }
            this.pwMsg = detail;
            return;
          }
          this.pwMsgIsError = false;
          this.pwMsg = 'Password updated.';
          setTimeout(() => {
            this.pwEditId = null;
            this.pwInput = '';
            this.pwMsg = '';
            this.loadUsers();
          }, 1000);
        } catch (_) {
          this.pwMsg = 'Network error.';
        }
      },

      /* ── Inline role edit ── */
      startEditRole(event) {
        const id = parseInt(event.currentTarget.dataset.id, 10);
        const role = event.currentTarget.dataset.role || 'user';
        if (!id) return;
        if (this.roleEditId === id) {
          this.cancelEdit();
          return;
        }
        this.roleEditId = id;
        this.roleInput = role;
        this.roleMsg = '';
        this.roleMsgIsError = true;
        this.pwEditId = null;
      },

      async saveRole() {
        this.roleMsg = '';
        this.roleMsgIsError = true;
        const userId = this.roleEditId;
        if (!userId) return;
        try {
          const resp = await fetch('/api/auth/users/' + userId + '/role', {
            method: 'PUT',
            headers: qbr.csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ role: this.roleInput }),
          });
          if (!resp.ok) {
            let detail = 'Failed to change role.';
            try { const data = await resp.json(); if (data.detail) detail = data.detail; } catch (_) { /* ignore */ }
            this.roleMsg = detail;
            return;
          }
          this.roleMsgIsError = false;
          this.roleMsg = 'Role updated.';
          setTimeout(() => {
            this.roleEditId = null;
            this.roleMsg = '';
            this.loadUsers();
          }, 1000);
        } catch (_) {
          this.roleMsg = 'Network error.';
        }
      },

      cancelEdit() {
        this.pwEditId = null;
        this.roleEditId = null;
        this.pwInput = '';
        this.pwMsg = '';
        this.roleMsg = '';
      },

      /* ── Create user ── */
      async createUser() {
        this.adminError = '';
        const username = (this.newUsername || '').trim();
        const password = this.newPassword || '';
        const role = this.newRole || 'user';
        if (!username || !password) {
          this.adminError = 'Username and password are required.';
          return;
        }
        const check = qbr.validatePassword(password);
        if (!check.valid) {
          this.adminError = 'Password must contain: ' + check.errors.join(', ') + '.';
          return;
        }
        try {
          const resp = await fetch('/api/auth/users', {
            method: 'POST',
            headers: qbr.csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ username, password, role }),
          });
          if (!resp.ok) {
            let detail = 'Failed to create user.';
            try { const data = await resp.json(); if (data.detail) detail = data.detail; } catch (_) { /* ignore */ }
            this.adminError = detail;
            return;
          }
          this.newUsername = '';
          this.newPassword = '';
          this.newRole = 'user';
          this.loadUsers();
        } catch (_) {
          this.adminError = 'Network error.';
        }
      },

      /* ── Refresh rate ── */
      async loadRefreshRate() {
        try {
          const resp = await fetch('/api/auth/settings/refresh-rate');
          if (resp.ok) {
            const data = await resp.json();
            this.refreshRate = data.refresh_rate;
          }
        } catch (_) { /* ignore */ }
      },

      async saveRefreshRate() {
        this.refreshMsg = '';
        this.refreshMsgIsError = true;
        const val = parseInt(this.refreshRate, 10);
        if (!val || val < 2 || val > 300) {
          this.refreshMsg = 'Value must be between 2 and 300.';
          return;
        }
        try {
          const resp = await fetch('/api/auth/settings/refresh-rate', {
            method: 'PUT',
            headers: qbr.csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ refresh_rate: val }),
          });
          if (resp.ok) {
            this.refreshMsgIsError = false;
            this.refreshMsg = 'Saved.';
            setTimeout(() => { this.refreshMsg = ''; }, 2000);
          } else {
            this.refreshMsg = 'Failed to save.';
          }
        } catch (_) {
          this.refreshMsg = 'Failed to save.';
        }
      },

      /* ── qBit connection ── */
      async loadConnectionInfo() {
        try {
          const resp = await fetch('/api/qbit/connection-info');
          if (!resp.ok) return;
          const info = await resp.json();
          this.browserAuthEnabled = !!info.browser_auth_enabled;
          this.browserHost = info.browser_host || '';
          this.qbitUsername = info.qbit_username || '';

          const banHint = info.browser_auth_enabled
            ? 'Use Browser Auth or wait for ban to lift.'
            : 'Log into qBittorrent directly to clear the ban, then use Retry Login.';

          if (info.authenticated) {
            this.qbitDotClass = 'dot dot-green';
            this.qbitStatusText = 'Connected';
            this.qbitStatusColor = 'color:var(--green)';
            this.qbitStatusMsg = '';
          } else if (info.ban_detected) {
            this.qbitDotClass = 'dot dot-red';
            this.qbitStatusText = 'IP Banned';
            this.qbitStatusColor = 'color:var(--red)';
            this.qbitStatusMsg = 'Ban time remaining: ~' + info.ban_seconds_remaining + 's. ' + banHint;
          } else if (info.cooldown_remaining > 0) {
            this.qbitDotClass = 'dot dot-red';
            this.qbitStatusText = 'Cooldown';
            this.qbitStatusColor = 'color:var(--yellow)';
            this.qbitStatusMsg = 'Retry cooldown: ' + info.cooldown_remaining + 's remaining.';
          } else {
            this.qbitDotClass = 'dot dot-red';
            this.qbitStatusText = 'Disconnected';
            this.qbitStatusColor = 'color:var(--red)';
            this.qbitStatusMsg = 'Not authenticated with qBittorrent.';
          }

          if (info.browser_auth_enabled) {
            if (this.browserHost && !this.qbitUrl) this.qbitUrl = this.browserHost;
            if (this.qbitUsername && !this.qbitUser) this.qbitUser = this.qbitUsername;
          }
        } catch (_) {
          this.qbitDotClass = 'dot dot-red';
          this.qbitStatusText = 'Error';
          this.qbitStatusColor = 'color:var(--red)';
        }
      },

      async retryQbitLogin() {
        this.retryDisabled = true;
        this.retryLabel = 'Retrying...';
        this.qbitStatusMsg = '';
        try {
          const resp = await fetch('/api/qbit/retry-login', {
            method: 'POST',
            headers: qbr.csrfHeaders(),
          });
          const data = await resp.json();
          this.qbitStatusMsg = data.message || '';
          this.qbitStatusColor = 'color:' + (data.success ? 'var(--green)' : 'var(--red)');
          await this.loadConnectionInfo();
        } catch (_) {
          this.qbitStatusMsg = 'Network error.';
          this.qbitStatusColor = 'color:var(--red)';
        }
        this.retryDisabled = false;
        this.retryLabel = 'Retry Login';
      },

      async autofillCreds() {
        this.browserAuthMsg = '';
        try {
          const resp = await fetch('/api/qbit/browser-auth-creds');
          if (!resp.ok) {
            this.browserAuthMsg = 'Failed to fetch credentials.';
            this.browserAuthMsgColor = 'color:var(--red)';
            return;
          }
          const creds = await resp.json();
          if (creds.url) this.qbitUrl = creds.url;
          if (creds.username) this.qbitUser = creds.username;
          if (creds.password) this.qbitPass = creds.password;
          this.browserAuthMsg = 'Credentials loaded from server.';
          this.browserAuthMsgColor = 'color:var(--green)';
        } catch (_) {
          this.browserAuthMsg = 'Network error.';
          this.browserAuthMsgColor = 'color:var(--red)';
        }
      },

      submitBrowserAuth() {
        const validUrl = qbr.validateHttpUrl((this.qbitUrl || '').trim());
        if (!validUrl) {
          this.browserAuthMsg = 'A valid http:// or https:// URL is required.';
          this.browserAuthMsgColor = 'color:var(--red)';
          return;
        }
        const username = (this.qbitUser || '').trim();
        const password = this.qbitPass || '';
        if (!username || !password) {
          this.browserAuthMsg = 'Username and password are required.';
          this.browserAuthMsgColor = 'color:var(--red)';
          return;
        }

        // Sandboxed iframe (no allow-same-origin so it can't read our cookies)
        const iframe = document.createElement('iframe');
        iframe.name = 'qbit-auth-frame';
        iframe.sandbox = 'allow-forms';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = validUrl.replace(/\/+$/, '') + '/api/v2/auth/login';
        form.target = 'qbit-auth-frame';
        form.style.display = 'none';

        const inputUser = document.createElement('input');
        inputUser.type = 'hidden';
        inputUser.name = 'username';
        inputUser.value = username;
        form.appendChild(inputUser);

        const inputPass = document.createElement('input');
        inputPass.type = 'hidden';
        inputPass.name = 'password';
        inputPass.value = password;
        form.appendChild(inputPass);

        document.body.appendChild(form);
        form.submit();

        this.browserAuthMsg = 'Auth request sent to qBittorrent. Click "Retry Login" to check if the backend can now connect.';
        this.browserAuthMsgColor = 'color:var(--accent)';

        setTimeout(() => {
          iframe.remove();
          form.remove();
        }, 5000);
      },

      openWebui() {
        const validUrl = qbr.validateHttpUrl((this.qbitUrl || '').trim());
        if (!validUrl) {
          this.browserAuthMsg = 'Enter a valid http:// or https:// URL first.';
          this.browserAuthMsgColor = 'color:var(--red)';
          return;
        }
        window.open(validUrl, '_blank');
      },

      async logout() {
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
        window.location.href = '/login';
      },
    }));
  });
})();
