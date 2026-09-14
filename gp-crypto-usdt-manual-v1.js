/*
 * HUNTER — manual USDT (TRC20) payment option, r408.
 *
 * Adds a second card next to the existing monthly EKQR/UPI card in the
 * "Plans & tools" panel. The existing checkout is not touched: this overlay only
 * appends its own card + an expandable instruction panel, and it appends them
 * only where the paid option is already offered (a card with
 * data-action="start-checkout" is present).
 *
 * Flow (manual, fail-closed): the member sends USDT on Tron (TRC20) to the
 * configured address, emails the proof of payment together with the email of
 * the HUNTER account to support, and the team activates the plan after
 * on-chain confirmation. The browser never grants
 * access by itself.
 *
 * Optional override in config.js:
 *   window.GUARDEER_CONFIG.PRIME_CRYPTO_PAYMENT = {
 *     enabled: true, asset: 'USDT', network: 'TRC20', networkLabel: 'Tron (TRC20)',
 *     address: 'T...', amount: '35', durationLabel: '30 days', planName: 'Monthly Prime',
 *     supportEmail: 'supportguardeer@gmail.com', approvalWindow: '24 hours',
 *     qrSrc: 'assets/gp-crypto-usdt-trc20-qr-v1.png?v=...'
 *   };
 */
(function () {
  'use strict';

  if (window.__GP_CRYPTO_USDT_MANUAL_V1__) return;
  window.__GP_CRYPTO_USDT_MANUAL_V1__ = true;

  var VERSION = 'r408-crypto-usdt-manual-v1';
  var AUTH_KEY = 'guardeer_prime_auth_v1';
  var FALLBACK_AUTH_KEY = '__gp_storage_fallback__:' + AUTH_KEY;
  var STYLE_ID = 'gp-crypto-usdt-manual-style';
  var DEFAULTS = {
    enabled: true,
    asset: 'USDT',
    network: 'TRC20',
    networkLabel: 'Tron (TRC20)',
    address: 'TXhxRF7QdAam2QEJUYnYKeCEKvHHSkrP8X',
    amount: '35',
    durationLabel: '30 days',
    planName: 'Monthly Prime',
    supportEmail: 'supportguardeer@gmail.com',
    approvalWindow: '24 hours',
    qrSrc: 'assets/gp-crypto-usdt-trc20-qr-v1.png?v=r408-crypto-usdt-manual-20260905'
  };
  var TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  var stats = { injected: 0, opened: 0, copied: 0, mailto: 0, skipped: 0 };
  var observer = null;

  function config() {
    var override = null;
    try {
      override = window.GUARDEER_CONFIG && window.GUARDEER_CONFIG.PRIME_CRYPTO_PAYMENT;
    } catch (_) {}
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) { out[key] = DEFAULTS[key]; });
    if (override && typeof override === 'object') {
      Object.keys(override).forEach(function (key) {
        if (override[key] !== undefined && override[key] !== null && override[key] !== '') out[key] = override[key];
      });
    }
    out.address = String(out.address || '').trim();
    out.amount = String(out.amount || '').trim();
    out.supportEmail = String(out.supportEmail || '').trim();
    return out;
  }

  function usable(cfg) {
    // Fail closed: never render a card with a malformed address or no contact.
    return cfg.enabled !== false &&
      TRON_ADDRESS_RE.test(cfg.address) &&
      /^[0-9]+(\.[0-9]+)?$/.test(cfg.amount) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.supportEmail);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function parseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function jwtPayload(token) {
    try {
      var part = String(token || '').split('.')[1];
      if (!part) return null;
      part = part.replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (_) {
      return null;
    }
  }

  function accountEmail(dialog) {
    var session = null;
    try { session = parseJson(localStorage.getItem(AUTH_KEY)); } catch (_) {}
    if (!session) { try { session = parseJson(sessionStorage.getItem(FALLBACK_AUTH_KEY)); } catch (_) {} }
    if (session) {
      var payload = jwtPayload(session.id_token || session.IdToken || '');
      if (payload && payload.email) return String(payload.email).trim();
      if (session.user && session.user.email) return String(session.user.email).trim();
      if (session.email) return String(session.email).trim();
    }
    // Fallback: the profile dialog prints the account email in its info lists.
    try {
      var rows = dialog ? dialog.querySelectorAll('.gp-info-list > div') : [];
      for (var i = 0; i < rows.length; i += 1) {
        var label = rows[i].querySelector('span');
        var value = rows[i].querySelector('strong');
        if (label && value && /^email$/i.test(label.textContent.trim()) && /@/.test(value.textContent)) {
          return value.textContent.trim();
        }
      }
    } catch (_) {}
    return '';
  }

  function mailtoHref(cfg, email) {
    var subject = 'HUNTER - ' + cfg.asset + ' payment - ' + (email || 'account email');
    var body = [
      'HUNTER account email: ' + (email || ''),
      'Plan: ' + cfg.planName + ' (' + cfg.durationLabel + ')',
      'Paid: ' + cfg.amount + ' ' + cfg.asset + ' (' + cfg.network + ')',
      'Proof of payment: (attach a screenshot of the completed transfer and/or paste the TXID below)',
      'Transaction hash (TXID): ',
      'Sender wallet address: ',
      'Date and time of payment: ',
      '',
      'Please activate Prime access on the account above after confirmation.'
    ].join('\n');
    return 'mailto:' + encodeURIComponent(cfg.supportEmail) +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '' +
      '.gp-crypto-card{border-color:rgba(38,217,199,.38)!important;background:radial-gradient(circle at 100% 0%,rgba(38,217,199,.16),transparent 40%),linear-gradient(180deg,#ffffff12,#ffffff06)!important}' +
      '.gp-crypto-card .gp-crypto-badge{display:inline-flex;align-items:center;gap:6px;justify-self:start;padding:3px 9px;border-radius:999px;background:rgba(38,217,199,.14);color:#7ff5e6;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}' +
      '.gp-crypto-card h3 small{display:block;margin-top:2px;color:#ffffff94;font-size:12px;font-weight:800;letter-spacing:.08em}' +
      '.gp-crypto-card .gp-main-action{background:linear-gradient(90deg,#26d9c7,#19d7ff);color:#02111f}' +
      '.gp-crypto-pay-panel{display:grid;gap:14px;margin:4px 0 12px;padding:16px;border-radius:18px;border:1px solid rgba(38,217,199,.3);background:linear-gradient(180deg,#07151fee,#050d1aee)}' +
      '.gp-crypto-pay-panel[hidden]{display:none}' +
      '.gp-crypto-pay-panel h4{margin:0;color:#fff;font-size:16px;letter-spacing:-.02em}' +
      '.gp-crypto-pay-panel ol{margin:0;padding-left:20px;color:#d7e6f2;line-height:1.55;font-size:13px}' +
      '.gp-crypto-pay-panel ol li{margin:0 0 6px}' +
      '.gp-crypto-pay-panel ol strong{color:#fff}' +
      '.gp-crypto-pay-grid{display:grid;grid-template-columns:minmax(0,1fr) 168px;gap:14px;align-items:start}' +
      '.gp-crypto-qr{display:grid;gap:6px;justify-items:center}' +
      '.gp-crypto-qr img{width:168px;height:168px;border-radius:14px;background:#fff;padding:6px;box-sizing:border-box;image-rendering:pixelated}' +
      '.gp-crypto-qr small{color:#ffffff94;font-size:11px;text-align:center}' +
      '.gp-crypto-pay-panel .gp-direct-payment-box{margin:0}' +
      '.gp-crypto-pay-panel .gp-direct-payment-box label{color:#b9c9d9;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}' +
      '.gp-crypto-pay-panel .gp-copy-row code{white-space:normal;overflow-wrap:anywhere;font-size:13px;letter-spacing:.02em}' +
      '.gp-crypto-warning{margin:0;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,183,77,.45);background:rgba(255,183,77,.1);color:#ffd9a3;font-size:13px;font-weight:700;line-height:1.45}' +
      '.gp-crypto-actions{display:flex;flex-wrap:wrap;gap:10px}' +
      '.gp-crypto-actions .gp-main-action{text-decoration:none;display:inline-flex;align-items:center;background:linear-gradient(90deg,#26d9c7,#19d7ff);color:#02111f}' +
      '.gp-crypto-actions .gp-soft-action{background:#00e0ff24;color:#8bf7ff}' +
      '.gp-crypto-account{color:#ffffff9e;font-size:12px;margin:0}' +
      '.gp-crypto-account strong{color:#e8fbff;overflow-wrap:anywhere}' +
      '@media (max-width:640px){.gp-crypto-pay-grid{grid-template-columns:minmax(0,1fr)}.gp-crypto-qr img{width:200px;height:200px}}';
    (document.head || document.documentElement).appendChild(style);
  }

  function cardHtml(cfg, renew) {
    return '' +
      '<span>' + esc(renew ? 'Extend with crypto' : 'Crypto payment') + '</span>' +
      '<span class="gp-crypto-badge">' + esc(cfg.asset + ' · ' + cfg.network) + '</span>' +
      '<h3>' + esc(cfg.amount + ' ' + cfg.asset) + '<small>' + esc(cfg.networkLabel + ' network') + '</small></h3>' +
      '<p>' + esc('Proof of payment by email  |  ' + cfg.durationLabel) + '</p>' +
      '<button class="gp-main-action" type="button" data-action="gp-crypto-pay" aria-expanded="false">' +
        esc((renew ? 'Extend ' : 'Pay ') + cfg.planName + ' with ' + cfg.asset) +
      '</button>';
  }

  function panelHtml(cfg, email, renew) {
    var mailto = mailtoHref(cfg, email);
    return '' +
      '<h4>' + esc('Pay ' + cfg.amount + ' ' + cfg.asset + ' on ' + cfg.networkLabel) + '</h4>' +
      '<ol>' +
        '<li>Send <strong>' + esc(cfg.amount + ' ' + cfg.asset) + '</strong> to the address below on the <strong>' + esc(cfg.networkLabel) + '</strong> network. ' +
            'The network fee is paid by the sender — the amount received must be the full ' + esc(cfg.amount + ' ' + cfg.asset) + '.</li>' +
        '<li>Email your <strong>proof of payment</strong> (transaction hash / TXID, or a screenshot of the completed transfer) to ' +
            '<strong>' + esc(cfg.supportEmail) + '</strong>. <strong>Together with the attached proof of payment, provide the email address of your ' +
            'HUNTER account</strong> — the account that should receive Prime access. The button below opens a prepared email.</li>' +
        '<li>Your ' + esc(renew ? 'renewal' : 'Prime access') + ' is activated manually after the transfer is confirmed on-chain — ' +
            '<strong>within ' + esc(cfg.approvalWindow) + '</strong>.</li>' +
      '</ol>' +
      '<p class="gp-crypto-warning">Send only ' + esc(cfg.asset) + ' on the ' + esc(cfg.networkLabel) + ' network. ' +
        'Coins sent on another network (ERC20, BEP20, Solana, Polygon…) or other tokens cannot be recovered.</p>' +
      '<div class="gp-crypto-pay-grid">' +
        '<div class="gp-direct-payment-box">' +
          '<label>Amount</label>' +
          '<div class="gp-copy-row"><code>' + esc(cfg.amount + ' ' + cfg.asset) + '</code>' +
            '<button type="button" data-gp-crypto-copy="' + esc(cfg.amount) + '">Copy</button></div>' +
          '<label>' + esc(cfg.asset + ' ' + cfg.network) + ' address</label>' +
          '<div class="gp-copy-row"><code>' + esc(cfg.address) + '</code>' +
            '<button type="button" data-gp-crypto-copy="' + esc(cfg.address) + '">Copy</button></div>' +
          '<label>Support email</label>' +
          '<div class="gp-copy-row"><code>' + esc(cfg.supportEmail) + '</code>' +
            '<button type="button" data-gp-crypto-copy="' + esc(cfg.supportEmail) + '">Copy</button></div>' +
        '</div>' +
        '<div class="gp-crypto-qr">' +
          '<img alt="' + esc(cfg.asset + ' ' + cfg.network + ' deposit address QR code') + '" src="' + esc(cfg.qrSrc) + '" loading="lazy" decoding="async">' +
          '<small>Scan with your wallet — ' + esc(cfg.network) + ' only</small>' +
        '</div>' +
      '</div>' +
      '<p class="gp-crypto-account">' +
        (email
          ? 'Your HUNTER account email: <strong>' + esc(email) + '</strong> — it must be sent together with the proof of payment so the payment can be matched to this account.'
          : 'Send the email address of your HUNTER account together with the proof of payment so the payment can be matched to the right account.') +
      '</p>' +
      '<div class="gp-crypto-actions">' +
        '<a class="gp-main-action" href="' + esc(mailto) + '" data-gp-crypto-mailto rel="noopener">Open prepared email</a>' +
        '<button class="gp-soft-action" type="button" data-gp-crypto-copy="' + esc(cfg.supportEmail) + '">Copy support email</button>' +
      '</div>' +
      '<p class="gp-profile-note"><strong>Security rule:</strong> crypto payments are verified manually by the HUNTER team from the blockchain record. ' +
        'The browser never grants Prime access by itself, and no payment is confirmed automatically.</p>';
  }

  function inject(dialog) {
    if (!dialog || !dialog.isConnected) return false;
    var grid = dialog.querySelector('.gp-plan-validity-card .gp-subscription-grid');
    if (!grid) return false;
    if (grid.querySelector('.gp-crypto-card')) return false;
    // Only where the paid option is offered (new purchase or renewal).
    if (!grid.querySelector('[data-action="start-checkout"]')) { stats.skipped += 1; return false; }
    var cfg = config();
    if (!usable(cfg)) { stats.skipped += 1; return false; }
    installStyle();
    var renew = Boolean(grid.querySelector('.gp-subscription-card--renew, .gp-subscription-card--active'));
    var card = document.createElement('article');
    card.className = 'gp-subscription-card gp-crypto-card' + (renew ? ' gp-subscription-card--renew' : '');
    card.setAttribute('data-gp-crypto-version', VERSION);
    card.innerHTML = cardHtml(cfg, renew);
    grid.appendChild(card);

    var panel = document.createElement('div');
    panel.className = 'gp-crypto-pay-panel';
    panel.hidden = true;
    panel.innerHTML = panelHtml(cfg, accountEmail(dialog), renew);
    grid.insertAdjacentElement('afterend', panel);
    stats.injected += 1;
    return true;
  }

  function scan() {
    var dialog = document.getElementById('gp-profile-dialog');
    if (dialog) inject(dialog);
  }

  function copyText(text, button) {
    var done = function (ok) {
      if (!button) return;
      var original = button.getAttribute('data-gp-crypto-label') || button.textContent;
      button.setAttribute('data-gp-crypto-label', original);
      button.textContent = ok ? 'Copied' : 'Copy failed';
      window.setTimeout(function () { button.textContent = original; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { stats.copied += 1; done(true); }, function () { done(fallbackCopy(text)); });
      return;
    }
    done(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand && document.execCommand('copy');
      area.remove();
      if (ok) stats.copied += 1;
      return Boolean(ok);
    } catch (_) {
      return false;
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var toggle = target.closest('[data-action="gp-crypto-pay"]');
    if (toggle) {
      event.preventDefault();
      var dialog = toggle.closest('#gp-profile-dialog');
      var panel = dialog ? dialog.querySelector('.gp-crypto-pay-panel') : null;
      if (!panel) return;
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        stats.opened += 1;
        try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
      }
      return;
    }
    var copy = target.closest('[data-gp-crypto-copy]');
    if (copy) {
      event.preventDefault();
      copyText(copy.getAttribute('data-gp-crypto-copy') || '', copy);
      return;
    }
    if (target.closest('[data-gp-crypto-mailto]')) stats.mailto += 1;
  }, true);

  function start() {
    scan();
    if (typeof MutationObserver === 'function' && !observer) {
      observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i += 1) {
          if (mutations[i].addedNodes && mutations[i].addedNodes.length) { scan(); return; }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.GPCryptoUsdtManualV1 = {
    version: VERSION,
    config: config,
    inject: scan,
    status: function () {
      var cfg = config();
      return { version: VERSION, usable: usable(cfg), address: cfg.address, amount: cfg.amount, asset: cfg.asset,
        network: cfg.network, supportEmail: cfg.supportEmail, stats: { injected: stats.injected, opened: stats.opened, copied: stats.copied, mailto: stats.mailto, skipped: stats.skipped } };
    }
  };
})();
