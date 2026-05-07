/* qBitRead dashboard component (Alpine.js CSP build).
 *
 * The CSP evaluator only resolves dot-separated property paths, so:
 *   - x-text="t.nameText"     ✓
 *   - x-show="hasError"        ✓
 *   - @click="setFilterBtn"    ✓ (the event provides $event with dataset)
 *   - @click="setFilter('x')"  ✗ (literal arg with paren — not allowed)
 *
 * Per-row computed values (badge class, progress style, formatted speeds)
 * are baked into each torrent during decorate() so the template only ever
 * needs property access.
 */
(function () {
  'use strict';

  const CATEGORY_FILTERS = {
    downloading: (t) => ['downloading', 'forcedDL', 'stalledDL', 'checkingDL'].includes(t.state),
    seeding: (t) => ['uploading', 'forcedUP', 'seeding', 'stalledUP', 'checkingUP'].includes(t.state),
    completed: (t) => t.progress >= 1.0,
    running: (t) => !['pausedDL', 'pausedUP'].includes(t.state),
    stopped: (t) => ['pausedDL', 'pausedUP'].includes(t.state),
    active: (t) => t.dlspeed > 0 || t.upspeed > 0,
    stalled: (t) => ['stalledDL', 'stalledUP'].includes(t.state),
  };

  const VALID_FILTERS = ['all', 'downloading', 'seeding', 'completed', 'running', 'stopped', 'active', 'stalled'];
  const FILTER_STORAGE_KEY = 'qbitread:filter';
  const SORT_COLS = ['name', 'size', 'progress', 'dlspeed', 'upspeed', 'eta', 'ratio', 'state'];

  document.addEventListener('alpine:init', () => {
    Alpine.data('dashboardApp', () => ({
      /* ── State ── */
      torrents: [],
      sortCol: 'dlspeed',
      sortDir: -1,
      filterState: 'all',
      searchQ: '',
      userRole: 'user',
      isAdmin: false,
      showRatio: false,
      isConnected: false,
      isSpinning: false,
      errorText: '',
      showPasswordWarning: false,
      countdown: 0,
      INTERVAL: 5,
      currentInterval: 5,
      MAX_INTERVAL: 60,
      consecutiveErrors: 0,
      _refreshTimer: null,
      _countdownTimer: null,
      counts: { all: 0, downloading: 0, seeding: 0, completed: 0, running: 0, stopped: 0, active: 0, stalled: 0 },
      filterLabels: {
        all: 'All (0)',
        downloading: 'Downloading (0)',
        seeding: 'Seeding (0)',
        completed: 'Completed (0)',
        running: 'Running (0)',
        stopped: 'Stopped (0)',
        active: 'Active (0)',
        stalled: 'Stalled (0)',
      },
      transferDl: '—',
      transferUl: '—',
      sortIndicator: '↓',
      sortIcons: { name: '↕', size: '↕', progress: '↕', dlspeed: '↓', upspeed: '↕', eta: '↕', ratio: '↕', state: '↕' },
      refreshText: '',

      /* ── Init ── */
      async init() {
        await this.checkAuth();
        try {
          const r = await fetch('/api/auth/settings/refresh-rate');
          if (r.ok) {
            const data = await r.json();
            this.INTERVAL = Math.max(2, Math.min(300, data.refresh_rate));
            this.currentInterval = this.INTERVAL;
          }
        } catch (_) { /* keep default */ }

        this.restoreFilter();
        this.updateSortIndicator();

        this.$watch('filterState', (val) => {
          if (VALID_FILTERS.includes(val)) {
            try { sessionStorage.setItem(FILTER_STORAGE_KEY, val); } catch (_) { /* ignore */ }
          }
        });
        this.$watch('sortCol', () => this.updateSortIndicator());
        this.$watch('sortDir', () => this.updateSortIndicator());

        this.doRefresh();
      },

      restoreFilter() {
        try {
          const saved = sessionStorage.getItem(FILTER_STORAGE_KEY);
          if (saved && VALID_FILTERS.includes(saved)) {
            this.filterState = saved;
          }
        } catch (_) { /* ignore */ }
      },

      async checkAuth() {
        try {
          const resp = await fetch('/api/auth/me');
          if (!resp.ok) {
            window.location.href = '/login';
            return;
          }
          const user = await resp.json();
          this.userRole = user.role || 'user';
          this.isAdmin = !!user.is_admin;
          this.showRatio = this.userRole === 'admin' || this.userRole === 'monitor';
          if (sessionStorage.getItem('password_weak') === '1') {
            this.showPasswordWarning = true;
          }
        } catch (_) {
          window.location.href = '/login';
        }
      },

      dismissPasswordWarning() {
        this.showPasswordWarning = false;
        try { sessionStorage.removeItem('password_weak'); } catch (_) { /* ignore */ }
      },

      /* ── Fetch ── */
      async fetchData() {
        this.isSpinning = true;
        try {
          const [torrentsResp, transferResp] = await Promise.all([
            fetch('/api/torrents'),
            fetch('/api/transfer'),
          ]);

          if (torrentsResp.status === 401 || transferResp.status === 401) {
            window.location.href = '/login';
            return;
          }

          if (!torrentsResp.ok || !transferResp.ok) {
            const errorResp = !torrentsResp.ok ? torrentsResp : transferResp;
            let detail = 'Failed to fetch data';
            if (errorResp.status === 502) {
              try {
                const body = await errorResp.json();
                detail = body.detail || detail;
              } catch (_) { /* ignore */ }
            }
            throw new Error(detail);
          }

          const raw = await torrentsResp.json();
          this.torrents = raw.map((t) => this.decorate(t));
          const transfer = await transferResp.json();
          this.transferDl = qbr.fmtSpeed(transfer.dl_info_speed);
          this.transferUl = qbr.fmtSpeed(transfer.up_info_speed);
          this.computeCounts();
          this.isConnected = true;
          this.errorText = '';

          if (this.consecutiveErrors > 0) {
            this.consecutiveErrors = 0;
            if (this.currentInterval !== this.INTERVAL) {
              this.currentInterval = this.INTERVAL;
              this.startRefreshLoop();
            }
          }
        } catch (e) {
          this.consecutiveErrors++;
          const isBan = e && e.message && e.message.toLowerCase().includes('banned');
          if (isBan) {
            this.errorText = 'IP banned by qBittorrent. Login attempts paused for 15 minutes. Will auto-retry.';
            this.currentInterval = this.MAX_INTERVAL;
          } else {
            this.errorText = 'Cannot reach qBittorrent: ' + (e && e.message ? e.message : 'unknown');
            const newInterval = Math.min(this.INTERVAL * Math.pow(2, this.consecutiveErrors), this.MAX_INTERVAL);
            if (newInterval !== this.currentInterval) {
              this.currentInterval = newInterval;
            }
          }
          this.isConnected = false;
          this.startRefreshLoop();
        } finally {
          this.isSpinning = false;
        }
      },

      /* ── Per-row decoration so the template only does property access ── */
      decorate(t) {
        const sc = qbr.stateClass(t.state);
        const pct = ((t.progress || 0) * 100).toFixed(1);
        const pcol = qbr.progressColor(t.progress || 0);
        const cat = t.category ? String(t.category) : '';
        return {
          hash: t.hash,
          name: t.name,
          size: t.size,
          progress: t.progress,
          dlspeed: t.dlspeed,
          upspeed: t.upspeed,
          eta: t.eta,
          ratio: t.ratio,
          state: t.state,
          category: cat,
          hasCategory: cat !== '',
          sizeText: qbr.fmtBytes(t.size),
          dlspeedText: qbr.fmtSpeed(t.dlspeed),
          upspeedText: qbr.fmtSpeed(t.upspeed),
          etaText: qbr.fmtEta(t.eta),
          ratioText: qbr.fmtRatio(t.ratio),
          pctText: pct + '%',
          progressStyle: 'width:' + pct + '%;background:' + pcol,
          badgeClass: 'badge badge-' + sc,
          stateLabel: qbr.stateLabel(t.state),
        };
      },

      /* ── Counts ── */
      computeCounts() {
        const counts = { all: this.torrents.length };
        for (const key of Object.keys(CATEGORY_FILTERS)) counts[key] = 0;
        for (const t of this.torrents) {
          for (const [key, fn] of Object.entries(CATEGORY_FILTERS)) {
            if (fn(t)) counts[key]++;
          }
        }
        this.counts = counts;
        const labels = {};
        for (const key of VALID_FILTERS) {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          labels[key] = label + ' (' + (counts[key] || 0) + ')';
        }
        this.filterLabels = labels;
      },

      /* ── Filter & sort ── */
      get filteredTorrents() {
        const q = (this.searchQ || '').toLowerCase().trim();
        const filter = this.filterState;
        return this.torrents.filter((t) => {
          if (filter !== 'all') {
            const fn = CATEGORY_FILTERS[filter];
            if (fn && !fn(t)) return false;
            if (!fn && qbr.stateClass(t.state) !== filter) return false;
          }
          if (q && !(t.name || '').toLowerCase().includes(q)) return false;
          return true;
        });
      },

      get sortedTorrents() {
        const list = [...this.filteredTorrents];
        const col = this.sortCol;
        const dir = this.sortDir;
        list.sort((a, b) => {
          let av = a[col];
          let bv = b[col];
          if (av == null) av = '';
          if (bv == null) bv = '';
          if (typeof av === 'string') return av.localeCompare(bv) * dir;
          return (av - bv) * dir;
        });
        return list;
      },

      get hasError() { return this.errorText !== ''; },
      get hasTorrents() { return this.sortedTorrents.length > 0; },
      get isEmpty() { return this.sortedTorrents.length === 0; },
      get connectionDotClass() { return 'dot ' + (this.isConnected ? 'dot-green' : 'dot-red'); },
      get connectionTitle() { return this.isConnected ? 'Connected to qBittorrent' : 'Disconnected'; },
      get headerRightClass() { return this.isSpinning ? 'header-right spinning' : 'header-right'; },

      /* ── Sort handlers ── */
      sortBy(event) {
        const col = event.currentTarget.dataset.col;
        if (!SORT_COLS.includes(col)) return;
        if (this.sortCol === col) this.sortDir *= -1;
        else { this.sortCol = col; this.sortDir = -1; }
        this.updateSortIndicator();
      },

      sortByMobile(event) {
        const col = event.target.value;
        if (SORT_COLS.includes(col)) {
          this.sortCol = col;
          this.updateSortIndicator();
        }
      },

      toggleSortDir() {
        this.sortDir *= -1;
        this.updateSortIndicator();
      },

      updateSortIndicator() {
        this.sortIndicator = this.sortDir === -1 ? '↓' : '↑';
        const icons = {};
        for (const c of SORT_COLS) {
          icons[c] = this.sortCol === c ? this.sortIndicator : '↕';
        }
        this.sortIcons = icons;
      },

      sortHeaderClass(col) {
        return this.sortCol === col ? 'sorted' : '';
      },

      get sortNameClass() { return this.sortHeaderClass('name'); },
      get sortSizeClass() { return this.sortHeaderClass('size'); },
      get sortProgressClass() { return this.sortHeaderClass('progress'); },
      get sortDlspeedClass() { return this.sortHeaderClass('dlspeed'); },
      get sortUpspeedClass() { return this.sortHeaderClass('upspeed'); },
      get sortEtaClass() { return this.sortHeaderClass('eta'); },
      get sortRatioClass() { return this.sortHeaderClass('ratio'); },
      get sortStateClass() { return this.sortHeaderClass('state'); },

      /* ── Filter handlers ── */
      setFilterBtn(event) {
        const f = event.currentTarget.dataset.filter;
        if (!VALID_FILTERS.includes(f)) return;
        this.filterState = f;
        try { sessionStorage.setItem(FILTER_STORAGE_KEY, f); } catch (_) { /* ignore */ }
      },

      setFilterFromSelect(event) {
        const f = event.target.value;
        if (!VALID_FILTERS.includes(f)) return;
        this.filterState = f;
        try { sessionStorage.setItem(FILTER_STORAGE_KEY, f); } catch (_) { /* ignore */ }
      },

      filterBtnClass(name) {
        return 'filter-btn' + (this.filterState === name ? ' active' : '');
      },

      get filterAllClass() { return this.filterBtnClass('all'); },
      get filterDownloadingClass() { return this.filterBtnClass('downloading'); },
      get filterSeedingClass() { return this.filterBtnClass('seeding'); },
      get filterCompletedClass() { return this.filterBtnClass('completed'); },
      get filterRunningClass() { return this.filterBtnClass('running'); },
      get filterStoppedClass() { return this.filterBtnClass('stopped'); },
      get filterActiveClass() { return this.filterBtnClass('active'); },
      get filterStalledClass() { return this.filterBtnClass('stalled'); },

      /* ── Refresh loop ── */
      startRefreshLoop() {
        clearInterval(this._refreshTimer);
        clearInterval(this._countdownTimer);
        this.countdown = this.currentInterval;
        this.refreshText = 'Refresh in ' + this.countdown + 's';
        this._countdownTimer = setInterval(() => {
          this.countdown--;
          if (this.countdown <= 0) this.countdown = this.currentInterval;
          this.refreshText = 'Refresh in ' + this.countdown + 's';
        }, 1000);
        this._refreshTimer = setInterval(() => {
          this.fetchData();
          this.countdown = this.currentInterval;
        }, this.currentInterval * 1000);
      },

      doRefresh() {
        this.fetchData();
        this.startRefreshLoop();
      },

      async logout() {
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
        window.location.href = '/login';
      },
    }));
  });
})();
