(function () {
  'use strict';

  if (window.__GP_MODULE4_LAUNCHER_V1__) return;
  window.__GP_MODULE4_LAUNCHER_V1__ = true;

  var VERSION = 'r386-all-module-history-navigation-v1';
  var WINDOW_NAME = 'guardeer_module4_imbalance';
  var BUILD = 'r386-all-module-history-navigation-v1';
  var KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'BCH', 'TRX', 'SUI', 'PEPE'];
  var syncTimer = 0;
  var observer = null;
  var observerStopTimer = 0;

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function cleanExchange(value) {
    var text = String(value || '').trim().toLowerCase();
    if (text.indexOf('okx') >= 0) return 'okx';
    if (text.indexOf('bybit') >= 0) return 'bybit';
    if (text.indexOf('binance') >= 0) return 'binance';
    if (text.indexOf('forex') >= 0 || text.indexOf('gold') >= 0 || text.indexOf('massive') >= 0 || text.indexOf('polygon') >= 0) return 'forexgold';
    return '';
  }

  function normalizeTimeframe(value) {
    var text = String(value || '1m').trim();
    if (/^\d+$/.test(text)) text += 'm';
    if (text === 'D' || text === '1D') text = '1d';
    if (text === 'H' || text === '1H') text = '1h';
    if (text === 'M') text = '1M';
    return /^\d+[mhdwM]$/.test(text) ? text : '1m';
  }

  function runtime() {
    try {
      var root = window.GuardeerPrimeRuntime || null;
      return root && (root.runtime || root);
    } catch (_) {
      return null;
    }
  }

  function readMarket() {
    var rt = runtime();
    var rtState = rt && rt.state || {};
    var symbolNode = qs('#symbol-label,[data-symbol-label],.symbol-display,#gp-overview-symbol');
    var symbol = cleanSymbol(rtState.symbol || (symbolNode && symbolNode.textContent) || 'XAUUSD');
    var exchangeHint = rtState.exchange || rtState.market || rtState.provider || '';
    var exchange = cleanExchange(exchangeHint || '');

    if (!exchange && (/(USDT|USDC|BUSD)$/.test(symbol) || (/USD$/.test(symbol) && KNOWN_CRYPTO.indexOf(symbol.slice(0, -3)) >= 0))) {
      exchange = 'binance';
    } else if (!exchange && (symbol === 'XAUUSD' || symbol === 'XAGUSD' || (/^[A-Z]{6}$/.test(symbol) && !/(USDT|USDC)$/.test(symbol)))) {
      exchange = 'forexgold';
    }

    var timeframeNode = qs('.timeframe-btn.active,[data-tf].active,#timeframe-select,#header-timeframe-select,[data-timeframe-select]');
    var timeframe = rtState.timeframe || (timeframeNode && (timeframeNode.value || timeframeNode.getAttribute('data-tf') || timeframeNode.textContent)) || '1m';

    return {
      symbol: symbol || 'XAUUSD',
      exchange: exchange || 'forexgold',
      timeframe: normalizeTimeframe(timeframe)
    };
  }

  function moduleWindowUrl() {
    var market = readMarket();
    try {
      var target = new URL('module4-imbalance.html', window.location.href);
      target.searchParams.set('symbol', market.symbol);
      target.searchParams.set('exchange', market.exchange);
      target.searchParams.set('timeframe', market.timeframe);
      target.searchParams.set('build', BUILD);
      target.hash = 'module4-imbalance';
      return target.toString();
    } catch (_) {
      return 'module4-imbalance.html?build=' + BUILD + '#module4-imbalance';
    }
  }

  function ensureLauncher() {
    var grid = qs('#gp-step44-prime-tools-popover .gp-step44-prime-tools-popover__grid');
    if (!grid) return null;

    var launcher = qs('[data-gp-module4-open]', grid);
    if (launcher && launcher.tagName !== 'A') {
      var replacement = document.createElement('a');
      launcher.replaceWith(replacement);
      launcher = replacement;
    }
    if (!launcher) launcher = document.createElement('a');

    launcher.className = 'gp-step44-prime-tools-action gp-module4-prime-card';
    launcher.setAttribute('data-gp-module4-open', 'true');
    launcher.setAttribute('href', moduleWindowUrl());
    launcher.setAttribute('target', WINDOW_NAME);
    launcher.setAttribute('aria-label', 'Open MODULE-4 Advanced Footprint and Imbalance in a new window');
    launcher.setAttribute('aria-haspopup', 'dialog');

    if (!qs('[data-gp-module4-launcher-title]', launcher)) {
      launcher.innerHTML = '<span>M4</span><div><strong data-gp-module4-launcher-title>MODULE-4 Advanced Footprint &amp; Imbalance</strong><small>Six advanced footprint and imbalance tools in one workspace.</small></div><em>Open</em>';
    }

    var moduleThree = qs('[data-gp-module3-open]', grid);
    var moduleTwo = qs('[data-gp-module2-open]', grid);
    var moduleOne = qs('[data-gp-module1-open]', grid);
    var predecessor = moduleThree || moduleTwo || moduleOne;
    if (predecessor) {
      if (predecessor.nextSibling !== launcher) grid.insertBefore(launcher, predecessor.nextSibling);
    } else if (launcher.parentElement !== grid) {
      grid.appendChild(launcher);
    }

    return launcher;
  }

  function closePrimeToolsPopover() {
    var popover = qs('#gp-step44-prime-tools-popover');
    if (popover) popover.classList.remove('is-open', 'is-dragging');
    if (document.body) document.body.classList.remove('gp-step44-prime-tools-open');
    var topButton = qs('[data-gp-step44-top-nav="prime-tools"]');
    if (topButton) {
      topButton.classList.remove('is-open');
      topButton.setAttribute('aria-expanded', 'false');
    }
  }

  function openModuleWindow() {
    closePrimeToolsPopover();
    var availableWidth = Number(window.screen && window.screen.availWidth) || 1680;
    var availableHeight = Number(window.screen && window.screen.availHeight) || 980;
    var width = Math.min(1780, Math.max(1080, availableWidth - 54));
    var height = Math.min(1080, Math.max(720, availableHeight - 54));
    var left = Math.max(0, Math.round((availableWidth - width) / 2));
    var top = Math.max(0, Math.round((availableHeight - height) / 2));
    var features = [
      'popup=yes',
      'width=' + Math.round(width),
      'height=' + Math.round(height),
      'left=' + left,
      'top=' + top,
      'resizable=yes',
      'scrollbars=yes'
    ].join(',');
    var popup = null;
    try { popup = window.open(moduleWindowUrl(), WINDOW_NAME, features); } catch (_) {}
    if (popup) {
      try { popup.focus(); } catch (_) {}
    }
    return popup;
  }

  function scheduleLauncherSync(delay) {
    if (syncTimer) return;
    syncTimer = window.setTimeout(function () {
      syncTimer = 0;
      ensureLauncher();
    }, delay == null ? 24 : delay);
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    if (observerStopTimer) window.clearTimeout(observerStopTimer);
    observerStopTimer = 0;
  }

  function observeLauncherWindow(duration) {
    stopObserver();
    if (!document.body || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function (mutations) {
      var touchesPrimeTools = mutations.some(function (mutation) {
        var relevantNode = function (node) {
          if (!node || node.nodeType !== 1) return false;
          var selector = '#gp-step44-prime-tools-popover,.gp-step44-prime-tools-popover__grid,[data-gp-module1-open],[data-gp-module2-open],[data-gp-module3-open],[data-gp-module4-open]';
          return (node.matches && node.matches(selector)) || (node.querySelector && node.querySelector(selector));
        };
        return Array.prototype.some.call(mutation.addedNodes || [], relevantNode)
          || Array.prototype.some.call(mutation.removedNodes || [], relevantNode);
      });
      if (touchesPrimeTools) scheduleLauncherSync(24);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observerStopTimer = window.setTimeout(stopObserver, duration || 5000);
  }

  function onDocumentClick(event) {
    var target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement);
    if (!target) return;

    if (target.closest('[data-gp-step44-top-nav="prime-tools"]')) {
      observeLauncherWindow(5000);
      scheduleLauncherSync(0);
      return;
    }

    var launcher = target.closest('[data-gp-module4-open]');
    if (!launcher) return;
    launcher.setAttribute('href', moduleWindowUrl());
    if (event.button && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var popup = openModuleWindow();
    if (popup) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function start() {
    ensureLauncher();
    observeLauncherWindow(5000);
    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('guardeer:market-quick-switch', function () { scheduleLauncherSync(0); });
    window.addEventListener('guardeer:prime-runtime-ready', function () { scheduleLauncherSync(0); });
    [120, 500, 1200, 2400, 4800].forEach(function (delay) {
      window.setTimeout(scheduleLauncherSync, delay, 0);
    });
  }

  window.GPModule4Launcher = {
    version: VERSION,
    sync: ensureLauncher,
    url: moduleWindowUrl,
    open: openModuleWindow
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
