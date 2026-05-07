/* qBitRead shared helpers — loaded on every page before the page component.
 *
 * The Alpine.js CSP build only evaluates dot-separated property paths.
 * Anything that needs to compute a value lives here and is exposed via
 * window.qbr so each Alpine component can call it from its methods.
 */
(function () {
  'use strict';

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtBytes(b, decimals) {
    if (b == null || isNaN(b) || b <= 0) return '0 B';
    const dec = decimals == null ? 1 : decimals;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(dec)) + ' ' + sizes[i];
  }

  function fmtSpeed(b) {
    return b ? fmtBytes(b) + '/s' : '—';
  }

  function fmtEta(s) {
    if (s == null || s < 0 || s === 8640000) return '∞';
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + ('0' + (s % 60)).slice(-2) + 's';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h + 'h ' + ('0' + m).slice(-2) + 'm';
  }

  function fmtRatio(r) {
    return r != null ? r.toFixed(2) : '—';
  }

  function progressColor(p) {
    if (p < 0.3) return '#e05c5c';
    if (p < 0.7) return '#f5c542';
    return '#3ecf6e';
  }

  function stateClass(s) {
    if (['downloading', 'forcedDL'].includes(s)) return 'downloading';
    if (['uploading', 'forcedUP', 'seeding'].includes(s)) return 'seeding';
    if (['pausedDL', 'pausedUP'].includes(s)) return 'paused';
    if (['stalledDL', 'stalledUP'].includes(s)) return 'stalled';
    if (['checkingDL', 'checkingUP', 'checkingResumeData'].includes(s)) return 'checking';
    if (s === 'error') return 'error';
    return 'paused';
  }

  function stateLabel(s) {
    const m = {
      downloading: 'DL', forcedDL: 'DL!', uploading: 'Seed', forcedUP: 'Seed!',
      seeding: 'Seed', pausedDL: 'Paused', pausedUP: 'Paused',
      stalledDL: 'Stalled', stalledUP: 'Stalled',
      checkingDL: 'Checking', checkingUP: 'Checking', checkingResumeData: 'Checking',
      error: 'Error',
    };
    return m[s] || s;
  }

  function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return m ? m[1] : '';
  }

  function csrfHeaders(extra) {
    const h = { 'X-CSRF-Token': getCsrfToken() };
    if (extra) Object.assign(h, extra);
    return h;
  }

  function validatePassword(pw) {
    const errors = [];
    if (pw.length < 8) errors.push('at least 8 characters');
    if (!/[A-Z]/.test(pw)) errors.push('1 uppercase letter');
    if (!/[a-z]/.test(pw)) errors.push('1 lowercase letter');
    if (!/\d/.test(pw)) errors.push('1 number');
    if (!/[^a-zA-Z0-9]/.test(pw)) errors.push('1 special character');
    return { valid: errors.length === 0, errors };
  }

  function validateHttpUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (_) { /* invalid URL */ }
    return null;
  }

  window.qbr = {
    escHtml,
    fmtBytes,
    fmtSpeed,
    fmtEta,
    fmtRatio,
    progressColor,
    stateClass,
    stateLabel,
    getCsrfToken,
    csrfHeaders,
    validatePassword,
    validateHttpUrl,
  };
})();
