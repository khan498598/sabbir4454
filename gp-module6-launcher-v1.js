(function () {
  'use strict';
  if (window.__GP_MODULE6_LAUNCHER_V1__) return;
  window.__GP_MODULE6_LAUNCHER_V1__ = true;

  var VERSION = 'r386-all-module-history-navigation-v1';
  var BUILD = 'r386-all-module-history-navigation-v1';
  var KNOWN_CRYPTO = ['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','TRX','SUI','PEPE'];
  var timer = 0, observer = null, stopTimer = 0;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function cleanSymbol(value) { return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); }
  function cleanExchange(value) {
    var text = String(value || '').toLowerCase();
    if (text.indexOf('okx') >= 0) return 'okx';
    if (text.indexOf('bybit') >= 0) return 'bybit';
    if (text.indexOf('binance') >= 0) return 'binance';
    if (/forex|gold|massive|polygon/.test(text)) return 'forexgold';
    return '';
  }
  function normalizeTimeframe(value) {
    var text = String(value || '5m').trim();
    if (/^\d+$/.test(text)) text += 'm';
    if (/^1H$/i.test(text)) text = '1h';
    return /^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d)$/.test(text) ? text : '5m';
  }
  function runtime() {
    try { var root = window.GuardeerPrimeRuntime; return root && (root.runtime || root); } catch (_) { return null; }
  }
  function readMarket() {
    var rt = runtime(), rtState = rt && rt.state || {};
    var symbolNode = qs('#symbol-label,[data-symbol-label],.symbol-display,#gp-overview-symbol');
    var symbol = cleanSymbol(rtState.symbol || (symbolNode && symbolNode.textContent) || 'XAUUSD');
    var exchange = cleanExchange(rtState.exchange || rtState.market || rtState.provider || '');
    if (!exchange && (/(USDT|USDC|BUSD)$/.test(symbol) || (/USD$/.test(symbol) && KNOWN_CRYPTO.indexOf(symbol.slice(0, -3)) >= 0))) exchange = 'binance';
    if (!exchange) exchange = 'forexgold';
    var tfNode = qs('.timeframe-btn.active,[data-tf].active,#timeframe-select,#header-timeframe-select,[data-timeframe-select]');
    return { symbol: symbol || 'XAUUSD', exchange: exchange, timeframe: normalizeTimeframe(rtState.timeframe || (tfNode && (tfNode.value || tfNode.getAttribute('data-tf') || tfNode.textContent)) || '5m') };
  }
  function moduleUrl() {
    var market = readMarket();
    try {
      var target = new URL('module6-delta-divergence.html', window.location.href);
      target.searchParams.set('symbol', market.symbol);
      target.searchParams.set('exchange', market.exchange);
      target.searchParams.set('timeframe', market.timeframe);
      target.searchParams.set('tool', '1');
      target.searchParams.set('build', BUILD);
      target.hash = 'module6-delta-divergence';
      return target.toString();
    } catch (_) { return 'module6-delta-divergence.html?build=' + BUILD + '#module6-delta-divergence'; }
  }
  function ensure() {
    var grid = qs('#gp-step44-prime-tools-popover .gp-step44-prime-tools-popover__grid');
    if (!grid) return null;
    var launcher = qs('[data-gp-module6-open]', grid);
    if (launcher && launcher.tagName !== 'BUTTON') {
      var replacement = document.createElement('button');
      launcher.replaceWith(replacement);
      launcher = replacement;
    }
    if (!launcher) launcher = document.createElement('button');
    launcher.className = 'gp-step44-prime-tools-action gp-module6-prime-card';
    launcher.setAttribute('data-gp-module6-open', 'true');
    launcher.removeAttribute('href');
    launcher.removeAttribute('target');
    launcher.setAttribute('type', 'button');
    launcher.setAttribute('aria-label', 'Open MODULE-6 Delta Divergence inline');
    launcher.setAttribute('aria-haspopup', 'dialog');
    if (!qs('[data-gp-module6-launcher-title]', launcher)) {
      launcher.innerHTML = '<span>DVG</span><div><strong data-gp-module6-launcher-title>MODULE-6 Delta Divergence</strong><small>Delta spikes, CVD divergence and wave structure.</small></div><em>Open</em>';
    }
    var predecessor = qs('[data-gp-module5-open]', grid) || qs('[data-gp-module4-open]', grid) || qs('[data-gp-module3-open]', grid) || qs('[data-gp-module2-open]', grid) || qs('[data-gp-module1-open]', grid);
    if (predecessor) {
      if (predecessor.nextSibling !== launcher) grid.insertBefore(launcher, predecessor.nextSibling);
    } else if (launcher.parentElement !== grid) grid.appendChild(launcher);
    return launcher;
  }
  function closePopover() {
    var popover = qs('#gp-step44-prime-tools-popover');
    if (popover) popover.classList.remove('is-open', 'is-dragging');
    if (document.body) document.body.classList.remove('gp-step44-prime-tools-open');
    var top = qs('[data-gp-step44-top-nav="prime-tools"]');
    if (top) { top.classList.remove('is-open'); top.setAttribute('aria-expanded', 'false'); }
  }
  function ensureInlineStyle() {
    if (qs('#gp-module6-inline-style')) return;
    var style = document.createElement('style');
    style.id = 'gp-module6-inline-style';
    style.textContent = '#gp-module6-inline{position:fixed;z-index:2147483000;inset:0;display:grid;place-items:center;padding:24px;background:rgba(2,5,7,.78)}.gp-module6-inline-frame{position:relative;width:min(1480px,96vw);height:min(940px,94vh);border:1px solid rgba(36,230,210,.28);background:#070a0d;box-shadow:0 24px 80px rgba(0,0,0,.55)}.gp-module6-inline-frame iframe{width:100%;height:100%;display:block;border:0}.gp-module6-inline-close{position:absolute;z-index:2;top:10px;right:10px;width:34px;height:34px;border:1px solid rgba(224,241,245,.24);background:rgba(7,10,13,.86);color:#edf7f5;font-size:22px;line-height:1;cursor:pointer}body.gp-module6-inline-open{overflow:hidden}';
    document.head.appendChild(style);
  }
  function closeInline() {
    var overlay = qs('#gp-module6-inline');
    if (overlay) overlay.remove();
    document.body.classList.remove('gp-module6-inline-open');
  }
  function openInline() {
    closePopover();
    ensureInlineStyle();
    var existing = qs('#gp-module6-inline');
    if (existing) return existing;
    var overlay = document.createElement('div');
    overlay.id = 'gp-module6-inline';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div class="gp-module6-inline-frame"><button type="button" class="gp-module6-inline-close" aria-label="Close MODULE-6">×</button><iframe title="MODULE-6 Delta Divergence" src="' + moduleUrl() + '&inline=1"></iframe></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('gp-module6-inline-open');
    var close = qs('.gp-module6-inline-close', overlay);
    if (close) close.addEventListener('click', closeInline);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closeInline(); });
    return overlay;
  }
  function schedule(delay) {
    if (timer) return;
    timer = setTimeout(function () { timer = 0; ensure(); }, delay == null ? 24 : delay);
  }
  function observe() {
    if (observer) observer.disconnect();
    if (!document.body || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function () { schedule(24); });
    observer.observe(document.body, { childList: true, subtree: true });
    clearTimeout(stopTimer);
    stopTimer = setTimeout(function () { if (observer) observer.disconnect(); observer = null; }, 5000);
  }
  function click(event) {
    var target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (!target) return;
    if (target.closest('[data-gp-step44-top-nav="prime-tools"]')) { observe(); schedule(0); return; }
    var launcher = target.closest('[data-gp-module6-open]');
    if (!launcher) return;
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    openInline();
  }
  function start() {
    ensure(); observe(); document.addEventListener('click', click, true);
    ['guardeer:market-quick-switch', 'guardeer:prime-runtime-ready'].forEach(function (name) { window.addEventListener(name, function () { schedule(0); }); });
    [120, 500, 1200, 2400, 4800].forEach(function (delay) { setTimeout(schedule, delay, 0); });
  }
  window.GPModule6Launcher = { version: VERSION, sync: ensure, url: moduleUrl, open: openInline, openInline: openInline, close: closeInline };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
