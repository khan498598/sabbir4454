(function () {
  'use strict';

  if (window.__GP_FOOTPRINT_STANDALONE_LAUNCHER_V1__) return;
  window.__GP_FOOTPRINT_STANDALONE_LAUNCHER_V1__ = true;

  var STORAGE_KEY = 'guardeer_prime_footprint_bootstrap_v1';
  var WINDOW_NAME = '_blank';
  var BUILD_ID = 'r386-all-module-history-navigation-v1';

  function safeTarget(target) {
    return target && target.nodeType === 1 ? target : target && target.parentElement ? target.parentElement : null;
  }

  function runtime() {
    try { return window.GuardeerPrimeRuntime || null; } catch (_) { return null; }
  }

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'XAUUSD';
  }

  function cleanTimeframe(value) {
    return String(value || '').trim() || '5m';
  }

  function cleanExchange(value, symbol) {
    var raw = String(value || '').toLowerCase().trim();
    if (raw) return raw;
    symbol = cleanSymbol(symbol);
    return symbol === 'XAUUSD' || /^[A-Z]{6}$/.test(symbol) ? 'forexgold' : 'binance';
  }

  function activeTimeframeFromDom() {
    var active = document.querySelector('.timeframe-btn.active[data-tf]');
    if (active && active.dataset.tf) return active.dataset.tf;
    var select = document.querySelector('#timeframe-select, #header-timeframe-select');
    return select && select.value ? select.value : '';
  }

  function currentContext() {
    var rt = runtime();
    var state = rt && rt.state ? rt.state : {};
    var symbol = cleanSymbol(state.symbol || (document.querySelector('#gp-overview-symbol') || {}).textContent || 'XAUUSD');
    var timeframe = cleanTimeframe(state.timeframe || activeTimeframeFromDom() || '5m');
    var exchange = cleanExchange(state.exchange, symbol);
    return { symbol: symbol, timeframe: timeframe, exchange: exchange };
  }

  function copyCandles(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.slice(-1200).map(function (row) {
      return {
        time: Number(row.time || row.openTime || row.timestamp || 0),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Math.max(0, Number(row.volume || row.qty || row.amount || 0))
      };
    }).filter(function (row) {
      return row.time > 0 && [row.open, row.high, row.low, row.close].every(Number.isFinite);
    });
  }

  function copyBook(book) {
    if (!book || (!Array.isArray(book.bids) && !Array.isArray(book.asks))) return null;
    function rows(list) {
      return (Array.isArray(list) ? list : []).slice(0, 140).map(function (row) {
        if (Array.isArray(row)) return [Number(row[0]), Math.max(0, Number(row[1]))];
        return [
          Number(row && (row.price != null ? row.price : row[0])),
          Math.max(0, Number(row && (row.qty != null ? row.qty : row.size != null ? row.size : row.volume != null ? row.volume : row[1])))
        ];
      }).filter(function (row) {
        return Number.isFinite(row[0]) && row[0] > 0 && Number.isFinite(row[1]) && row[1] > 0;
      });
    }
    return { bids: rows(book.bids), asks: rows(book.asks) };
  }

  function captureBootstrap() {
    var ctx = currentContext();
    var rt = runtime();
    var payload = {
      version: 1,
      savedAt: Date.now(),
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      exchange: ctx.exchange,
      currentPrice: 0,
      candles: [],
      orderBook: null
    };

    try {
      if (rt && typeof rt.getLatestKlines === 'function') payload.candles = copyCandles(rt.getLatestKlines());
      if (rt && typeof rt.getLatestOrderBook === 'function') payload.orderBook = copyBook(rt.getLatestOrderBook());
      if (rt && typeof rt.getCurrentPrice === 'function') payload.currentPrice = Number(rt.getCurrentPrice()) || 0;
      if (!payload.currentPrice && payload.candles.length) payload.currentPrice = Number(payload.candles[payload.candles.length - 1].close) || 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
    return payload;
  }

  function isFootprintTrigger(target) {
    if (!target) return null;
    // Module launchers own their routes. Some titles also contain the word
    // "Footprint", so the generic legacy interceptor must never claim M1-M4.
    if (target.closest('[data-gp-module1-open], [data-gp-module2-open], [data-gp-module3-open], [data-gp-module4-open]')) return null;
    var direct = target.closest('[data-gp-footprint-v1-tool], [data-gp-step44-prime-tool="footprint"], #tool-footprint-toggle, [data-tv-action="toggleFootprint"]');
    if (direct) return direct;
    var action = target.closest('.gp-step44-prime-tools-action, .gp-layer-row, .tv-top-tool');
    if (!action) return null;
    var text = (action.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return text.indexOf('footprint') !== -1 ? action : null;
  }

  function syncVisibleButtons() {
    var buttons = document.querySelectorAll('#tool-footprint-toggle, [data-tv-action="toggleFootprint"], [data-gp-footprint-v1-tool], [data-gp-step44-prime-tool="footprint"]');
    buttons.forEach(function (button) {
      button.classList.remove('active', 'is-active');
      button.setAttribute('aria-pressed', 'false');
      if (button.id === 'tool-footprint-toggle') button.textContent = 'OPEN';
      var pill = button.querySelector && button.querySelector('em');
      if (pill) pill.textContent = 'Open';
    });
  }

  function closePrimeToolsPopover() {
    try {
      document.body.classList.remove('gp-step44-prime-tools-open');
      var pop = document.getElementById('gp-step44-prime-tools-popover');
      if (pop) pop.classList.remove('is-open', 'is-dragging');
      var nav = document.querySelector('[data-gp-step44-top-nav="prime-tools"]');
      if (nav) nav.setAttribute('aria-expanded', 'false');
    } catch (_) {}
  }

  function pageUrl(ctx) {
    var url = new URL('footprint-live.html', window.location.href);
    url.searchParams.set('symbol', ctx.symbol);
    url.searchParams.set('tf', ctx.timeframe);
    url.searchParams.set('exchange', ctx.exchange);
    url.searchParams.set('source', 'terminal');
    url.searchParams.set('build', BUILD_ID);
    return url.toString();
  }

  function toast(message, type) {
    try {
      var rt = runtime();
      if (rt && typeof rt.showToast === 'function') rt.showToast(message, type || 'info');
    } catch (_) {}
  }

  function openStandalone() {
    var ctx = currentContext();
    captureBootstrap();
    syncVisibleButtons();
    closePrimeToolsPopover();

    var child = null;
    try {
      child = window.open(
        pageUrl(ctx),
        WINDOW_NAME,
        'width=1440,height=920,left=70,top=40,resizable=yes,scrollbars=no'
      );
      if (child && typeof child.focus === 'function') child.focus();
    } catch (_) {}

    if (!child) {
      toast('Popup was blocked, opening Footprint in this tab.', 'info');
      window.location.href = pageUrl(ctx);
      return false;
    }

    toast('Footprint opened in a separate window.', 'success');
    return true;
  }

  function intercept(event) {
    var target = safeTarget(event.target);
    var button = isFootprintTrigger(target);
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (button.id === 'tool-footprint-toggle') {
      var targetUrl = window.location.href.split('#')[0] + '#module2-footprint';
      var popup = null;
      try { popup = window.open(targetUrl, 'guardeer_module2_footprint', 'width=1440,height=920,left=70,top=40,resizable=yes,scrollbars=yes'); } catch (_) {}
      if (popup && typeof popup.focus === 'function') popup.focus();
      return;
    }
    openStandalone();
  }

  window.addEventListener('click', intercept, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncVisibleButtons, { once: true });
  } else {
    syncVisibleButtons();
  }
  window.setInterval(syncVisibleButtons, 1200);

  window.GPFootprintStandaloneLauncher = {
    open: openStandalone,
    captureBootstrap: captureBootstrap
  };
})();
