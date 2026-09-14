(function () {
  'use strict';
  if (window.__GP_MODULE7_LAUNCHER_V1__) return;
  window.__GP_MODULE7_LAUNCHER_V1__ = true;

  var VERSION = 'r392-module7-verified-live-v1';
  var WINDOW_NAME = 'guardeer_module7_absorption_flow';
  var BUILD = 'r392-module7-verified-live-v1';
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
    return /^(1m|3m|5m|15m|1h)$/.test(text) ? text : '5m';
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
      var target = new URL('module7-absorption-flow.html', window.location.href);
      target.searchParams.set('symbol', market.symbol);
      target.searchParams.set('exchange', market.exchange);
      target.searchParams.set('timeframe', market.timeframe);
      target.searchParams.set('tool', '1');
      target.searchParams.set('build', BUILD);
      target.hash = 'module7-absorption-flow';
      return target.toString();
    } catch (_) { return 'module7-absorption-flow.html?build=' + BUILD + '#module7-absorption-flow'; }
  }
  function ensure() {
    var grid = qs('#gp-step44-prime-tools-popover .gp-step44-prime-tools-popover__grid');
    if (!grid) return null;
    var launcher = qs('[data-gp-module7-open]', grid);
    if (launcher && launcher.tagName !== 'A') {
      var replacement = document.createElement('a');
      launcher.replaceWith(replacement);
      launcher = replacement;
    }
    if (!launcher) launcher = document.createElement('a');
    launcher.className = 'gp-step44-prime-tools-action gp-module7-prime-card';
    launcher.setAttribute('data-gp-module7-open', 'true');
    launcher.setAttribute('href', moduleUrl());
    launcher.setAttribute('target', WINDOW_NAME);
    launcher.setAttribute('aria-label', 'Open MODULE-7 Absorption Order Flow in a new window');
    launcher.setAttribute('aria-haspopup', 'dialog');
    if (!qs('[data-gp-module7-launcher-title]', launcher)) {
      launcher.innerHTML = '<span>ABS</span><div><strong data-gp-module7-launcher-title>MODULE-7 Absorption Order Flow</strong><small>Footprint absorption, delta shift and liquidity map.</small></div><em>Open</em>';
    }
    var predecessor = qs('[data-gp-module6-open]', grid) || qs('[data-gp-module5-open]', grid) || qs('[data-gp-module4-open]', grid) || qs('[data-gp-module3-open]', grid) || qs('[data-gp-module2-open]', grid) || qs('[data-gp-module1-open]', grid);
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
  function openWindow() {
    closePopover();
    var aw = Number(screen && screen.availWidth) || 1680, ah = Number(screen && screen.availHeight) || 980;
    var width = Math.min(1780, Math.max(1080, aw - 54)), height = Math.min(1080, Math.max(720, ah - 54));
    var features = 'popup=yes,width=' + Math.round(width) + ',height=' + Math.round(height) + ',left=' + Math.max(0, Math.round((aw - width) / 2)) + ',top=' + Math.max(0, Math.round((ah - height) / 2)) + ',resizable=yes,scrollbars=yes';
    var popup = null;
    try { popup = window.open(moduleUrl(), WINDOW_NAME, features); } catch (_) {}
    if (popup) try { popup.focus(); } catch (_) {}
    return popup;
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
    var launcher = target.closest('[data-gp-module7-open]');
    if (!launcher) return;
    launcher.setAttribute('href', moduleUrl());
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var popup = openWindow();
    if (popup) { event.preventDefault(); event.stopPropagation(); }
  }
  function start() {
    ensure(); observe(); document.addEventListener('click', click, true);
    ['guardeer:market-quick-switch', 'guardeer:prime-runtime-ready'].forEach(function (name) { window.addEventListener(name, function () { schedule(0); }); });
    [120, 500, 1200, 2400, 4800].forEach(function (delay) { setTimeout(schedule, delay, 0); });
  }
  window.GPModule7Launcher = { version: VERSION, sync: ensure, url: moduleUrl, open: openWindow };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
