(function () {
  'use strict';

  if (window.__GP_MARKET_CONTEXT_SUMMARY_GUARD_R387__) return;
  window.__GP_MARKET_CONTEXT_SUMMARY_GUARD_R387__ = true;

  var VERSION = 'r387-market-context-summary-guard-v1';
  var lastContext = '';

  function runtime() {
    var root = window.GuardeerPrimeRuntime;
    return root && (root.runtime || root) || null;
  }

  function clean(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function market(rt) {
    var state = rt && rt.state || {};
    return {
      exchange: String(state.exchange || '').toLowerCase(),
      symbol: clean(state.symbol || (document.getElementById('gp-overview-symbol') || {}).textContent),
      timeframe: String(state.timeframe || '1h')
    };
  }

  function context(rt) {
    var value = market(rt);
    return [value.exchange, value.symbol, value.timeframe].join(':');
  }

  function committed(rt) {
    var value = market(rt);
    if (!value.exchange || !value.symbol) return false;
    if (value.exchange === 'forexgold') {
      return String(window.__gpMainCommittedForexContext || '') === context(rt);
    }
    var expected = context(rt);
    var actual = String(window.__gpMainCommittedCryptoContext || '');
    return actual === expected || actual.indexOf(value.exchange + ':' + value.symbol + ':') === 0 && actual.split(':').pop() === value.timeframe;
  }

  function text(id, value) {
    var element = document.getElementById(id);
    if (element) element.textContent = value;
    return element;
  }

  function clearClasses(element) {
    if (element && element.classList) {
      element.classList.remove('positive', 'negative', 'metric__value--positive', 'metric__value--negative');
    }
  }

  function clearSummary(rt) {
    var value = market(rt);
    if (value.symbol) text('gp-overview-symbol', value.symbol);
    if (value.symbol) text('gp-chart-title-symbol', value.symbol + '  -  ' + value.timeframe + '  -  ' + value.exchange);
    ['gp-overview-price', 'gp-overview-high', 'gp-overview-low', 'gp-overview-volume', 'gp-overview-bias'].forEach(function (id) {
      clearClasses(text(id, ' - '));
    });
    clearClasses(text('gp-overview-change', 'Loading feed'));
    var sentiment = document.querySelector('.gp-overview-sentiment');
    if (sentiment) {
      sentiment.classList.remove('bearish');
      var label = sentiment.querySelector('span');
      if (label) label.textContent = 'WAITING';
    }
    ['metric-alpha', 'metric-delta', 'metric-cvd', 'metric-imbalance', 'metric-spread'].forEach(function (id) {
      clearClasses(text(id, ' - '));
    });
  }

  function number(value, digits) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : ' - ';
  }

  function volume(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return ' - ';
    if (Math.abs(parsed) >= 1000000) return (parsed / 1000000).toFixed(2) + 'M';
    if (Math.abs(parsed) >= 1000) return (parsed / 1000).toFixed(2) + 'K';
    return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function rowTimeMs(row) {
    var value = Number(row && row.time);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < 100000000000 ? value * 1000 : value;
  }

  function trailingDay(rows) {
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return [];
    var latestTime = 0;
    for (var index = list.length - 1; index >= 0; index -= 1) {
      latestTime = rowTimeMs(list[index]);
      if (latestTime) break;
    }
    if (!latestTime) return list.slice(-1);
    var cutoff = latestTime - 24 * 60 * 60 * 1000;
    var selected = list.filter(function (row) {
      var time = rowTimeMs(row);
      // Candle timestamps are bucket-open times. Excluding the exact cutoff
      // gives 288 x 5m, 96 x 15m or 24 x 1h bars instead of one extra bucket.
      return time > cutoff && time <= latestTime;
    });
    return selected.length ? selected : list.slice(-1);
  }

  function renderCommitted(rt) {
    var value = market(rt);
    var rows = [];
    try { rows = typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : []; } catch (_) {}
    if (!Array.isArray(rows) || !rows.length) return;
    // Header fields are explicitly labelled 24H. Use timestamps relative to
    // the last verified provider candle, not a fixed row count or Date.now(),
    // so 5m/15m/1h and closed-weekend charts all report the same true window.
    rows = trailingDay(rows);
    var last = rows[rows.length - 1] || {};
    var price = Number(rt.state && rt.state.currentPrice);
    if (!Number.isFinite(price) || price <= 0) price = Number(last.close);
    var highs = rows.map(function (row) { return Number(row && row.high); }).filter(Number.isFinite);
    var lows = rows.map(function (row) { return Number(row && row.low); }).filter(Number.isFinite);
    var totalVolume = rows.reduce(function (sum, row) {
      var next = Number(row && row.volume);
      return sum + (Number.isFinite(next) ? next : 0);
    }, 0);
    var firstOpen = Number(rows[0] && rows[0].open);
    var change = Number.isFinite(price) && Number.isFinite(firstOpen) && firstOpen > 0 ? (price - firstOpen) / firstOpen * 100 : null;
    var digits = value.symbol === 'XAUUSD' ? 2 : /^[A-Z]{6}$/.test(value.symbol) ? (value.symbol.indexOf('JPY') >= 0 ? 3 : 5) : 2;

    text('gp-overview-symbol', value.symbol);
    text('gp-chart-title-symbol', value.symbol + '  -  ' + value.timeframe + '  -  ' + value.exchange);
    text('gp-overview-price', number(price, digits));
    text('gp-overview-high', highs.length ? number(Math.max.apply(Math, highs), digits) : ' - ');
    text('gp-overview-low', lows.length ? number(Math.min.apply(Math, lows), digits) : ' - ');
    text('gp-overview-volume', volume(totalVolume));
    var changeNode = text('gp-overview-change', Number.isFinite(change) ? (change >= 0 ? '+' : '') + change.toFixed(2) + '%' : 'Verified history');
    var priceNode = document.getElementById('gp-overview-price');
    clearClasses(changeNode);
    clearClasses(priceNode);
    if (Number.isFinite(change)) {
      changeNode && changeNode.classList.add(change >= 0 ? 'positive' : 'negative');
      priceNode && priceNode.classList.add(change >= 0 ? 'positive' : 'negative');
    }
  }

  function sync() {
    var rt = runtime();
    if (!rt) return;
    var nextContext = context(rt);
    // This guard exists only to stop stale crypto values leaking into the
    // Forex/Gold header. Native crypto rendering remains owned by the core
    // runtime so r387 cannot alter Binance metrics, sentiment or lifecycle.
    if (market(rt).exchange !== 'forexgold') {
      lastContext = nextContext;
      return;
    }
    if (!committed(rt)) clearSummary(rt);
    else renderCommitted(rt);
    lastContext = nextContext;
  }

  function schedule() {
    window.setTimeout(sync, 0);
    window.setTimeout(sync, 120);
  }

  ['guardeer:prime-runtime-ready', 'guardeer:market-quick-switch', 'guardeer:open-dashboard-chart',
    'gp:timeframe-changed', 'guardeer:timeframe-changed', 'guardeer:forexgold-feed-integrity',
    'guardeer:market-data-state'].forEach(function (name) {
    window.addEventListener(name, schedule, { passive: true });
  });
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('#exchange-selector, #symbol-selector, [data-gp-market-type], [data-symbol]')) schedule();
  }, true);
  document.addEventListener('change', function (event) {
    if (event.target && event.target.matches && event.target.matches('#timeframe-select, #header-timeframe-select, #gp-market-instrument-select')) schedule();
  }, true);
  window.setInterval(function () {
    var rt = runtime();
    if (rt && (lastContext !== context(rt) || !committed(rt))) sync();
  }, 500);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();

  window.GPMarketContextSummaryGuardR387 = { version: VERSION, sync: sync, committed: committed };
})();
