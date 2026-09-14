(function () {
  'use strict';

  if (window.__GP_FOREXGOLD_LIVE_CANDLE_RESUME_V175__) return;
  window.__GP_FOREXGOLD_LIVE_CANDLE_RESUME_V175__ = true;

  var VERSION = 'r400-focus-resume-and-context-v1';
  var QUOTE_FRESHNESS_MS = 45000;
  var state = {
    runtime: null,
    lastForcedAt: 0,
    lastOverlayAt: 0,
    lastDispatchAt: 0,
    eventSequence: 0,
    resumeTimer: 0,
    timer: 0
  };

  function runtime() {
    return window.GuardeerPrimeRuntime || state.runtime || null;
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function exchange(rt) {
    return String(rt && rt.state && rt.state.exchange || '').toLowerCase();
  }

  function symbol(rt) {
    return cleanSymbol(
      rt && rt.state && rt.state.symbol ||
      (qs('#symbol-label') && qs('#symbol-label').textContent) ||
      (qs('#gp-overview-symbol') && qs('#gp-overview-symbol').textContent) ||
      'XAUUSD'
    );
  }

  function timeframe(rt) {
    return String(
      rt && rt.state && rt.state.timeframe ||
      (qs('.timeframe-btn.active') && qs('.timeframe-btn.active').getAttribute('data-tf')) ||
      (qs('#timeframe-select') && qs('#timeframe-select').value) ||
      (qs('#header-timeframe-select') && qs('#header-timeframe-select').value) ||
      '1m'
    ).trim();
  }

  function timeframeSeconds(tf) {
    var text = String(tf || '1m').trim();
    var amount = parseInt(text, 10) || 1;
    if (text.endsWith('m')) return amount * 60;
    if (text.endsWith('h')) return amount * 3600;
    if (text.endsWith('d')) return amount * 86400;
    if (text.endsWith('w')) return amount * 604800;
    if (text.endsWith('M')) return amount * 2592000;
    return 60;
  }

  function nowBucket(tf) {
    var text = String(tf || '1m').trim();
    if (text.endsWith('M')) {
      var amount = parseInt(text, 10) || 1;
      var date = new Date();
      var month = date.getUTCMonth() - (date.getUTCMonth() % amount);
      return Math.floor(Date.UTC(date.getUTCFullYear(), month, 1, 0, 0, 0) / 1000);
    }
    var seconds = timeframeSeconds(tf);
    var now = Math.floor(Date.now() / 1000);
    return Math.floor(now / seconds) * seconds;
  }

  function priceDecimals(sym, price) {
    if (sym === 'XAUUSD' || sym === 'XAGUSD') return 2;
    if (sym.indexOf('JPY') >= 0) return 3;
    var p = Math.abs(Number(price) || 0);
    if (p >= 1000) return 2;
    if (p >= 100) return 3;
    if (p >= 1) return 5;
    return 6;
  }

  function round(value, sym, reference) {
    var n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Number(n.toFixed(priceDecimals(sym, reference == null ? n : reference)));
  }

  function rows(rt) {
    try {
      var list = rt && typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : null;
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function quoteIsFresh(value, now) {
    var time = Number(value && value.time || 0);
    var age = Number(now == null ? Date.now() : now) - time;
    return !!(value && value.fresh === true && Number.isFinite(time) && time > 0 && Number.isFinite(age) && age >= 0 && age < QUOTE_FRESHNESS_MS);
  }

  function quote(sym, rt, list) {
    var q = null;
    try { q = window.__gpForexQuoteState && window.__gpForexQuoteState[sym]; } catch (_) {}
    var qPrice = Number(q && q.price);
    var qFresh = quoteIsFresh(q);
    if (qFresh && Number.isFinite(qPrice) && qPrice > 0) {
      return {
        price: qPrice,
        fresh: true,
        time: Number(q.time),
        source: q.source || 'core-quote-state',
        providerTimestampVerified: q.providerTimestampVerified === true,
        responseTimeFallback: q.responseTimeFallback === true
      };
    }
    var rtPrice = Number(rt && rt.state && rt.state.currentPrice);
    if (Number.isFinite(rtPrice) && rtPrice > 0) return { price: rtPrice, fresh: false, time: 0, source: 'runtime-current-price' };
    var last = list && list[list.length - 1];
    var lastPrice = Number(last && last.close);
    if (Number.isFinite(lastPrice) && lastPrice > 0) return { price: lastPrice, fresh: false, time: 0, source: 'last-candle-close' };
    return null;
  }

  function normalizeCandle(candle, sym) {
    if (!candle) return null;
    var close = round(candle.close, sym);
    var open = round(candle.open, sym, close);
    var high = round(Math.max(Number(candle.high), open, close), sym, close);
    var low = round(Math.min(Number(candle.low), open, close), sym, close);
    var time = Number(candle.time);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
    return {
      time: Math.floor(time),
      open: open,
      high: high,
      low: low,
      close: close,
      volume: Math.max(0, Number(candle.volume || 0)),
      provider: candle.provider || VERSION,
      synthetic: !!candle.synthetic,
      volumeReliable: candle.volumeReliable === true
    };
  }

  function makeCurrentCandle(last, priceValue, bucket, sym, quoteSource) {
    var price = round(priceValue, sym);
    if (!Number.isFinite(price) || price <= 0) return null;
    if (last && Number(last.time) === bucket) {
      return normalizeCandle({
        time: bucket,
        open: Number(last.open) || price,
        high: Math.max(Number(last.high) || price, price),
        low: Math.min(Number(last.low) || price, price),
        close: price,
        volume: Number(last.volume || 0),
        provider: last.provider,
        synthetic: !!last.synthetic,
        volumeReliable: last.volumeReliable === true
      }, sym);
    }
    if (!last || Number(last.time) >= bucket) return null;
    // A fresh authenticated quote may seed only the bucket that is active now.
    // This never fills missed history. The first observed quote is the current
    // candle's O/H/L/C until later live quotes extend that same bucket.
    return normalizeCandle({
      time: bucket,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      provider: 'quote-derived-live:' + String(quoteSource || 'verified-provider'),
      synthetic: false,
      volumeReliable: false
    }, sym);
  }

  function mergeIntoRows(list, candle) {
    if (!Array.isArray(list) || !candle) return list;
    var idx = -1;
    for (var i = list.length - 1; i >= 0; i -= 1) {
      var time = Number(list[i] && list[i].time);
      if (time === candle.time) { idx = i; break; }
      if (time < candle.time) break;
    }
    if (idx >= 0) list[idx] = candle;
    else list.push(candle);
    list.sort(function (a, b) { return Number(a.time) - Number(b.time); });
    if (list.length > 260000) list.splice(0, list.length - 260000);
    return list;
  }

  function mergeIntoChartRows(rt, candle) {
    try {
      var chartRows = rt && rt.chart && Array.isArray(rt.chart.lastCandleData) ? rt.chart.lastCandleData : null;
      if (chartRows) {
        mergeIntoRows(chartRows, candle);
        rt.chart.lastCandleData = chartRows;
      }
    } catch (_) {}
  }

  function updateOverlays(rt, list, price) {
    var now = Date.now();
    if (now - state.lastOverlayAt < 3200) {
      try { if (rt && rt.heatmap && typeof rt.heatmap.setCurrentPrice === 'function') rt.heatmap.setCurrentPrice(price); } catch (_) {}
      return;
    }
    state.lastOverlayAt = now;
    var overlayRows = Array.isArray(list) && list.length > 24000 ? list.slice(-24000) : list;
    try { if (rt && rt.bubbles && typeof rt.bubbles.setCandleData === 'function') rt.bubbles.setCandleData(overlayRows); } catch (_) {}
    try { if (rt && rt.heatmap && typeof rt.heatmap.setCandleData === 'function') rt.heatmap.setCandleData(overlayRows); } catch (_) {}
    try { if (rt && rt.heatmap && typeof rt.heatmap.setCurrentPrice === 'function') rt.heatmap.setCurrentPrice(price); } catch (_) {}
    try { if (window.GPPrimeCvdIstSyncV172 && typeof window.GPPrimeCvdIstSyncV172.syncNow === 'function') window.GPPrimeCvdIstSyncV172.syncNow(true); } catch (_) {}
  }

  function updatePriceDom(sym, price) {
    var decimals = priceDecimals(sym, price);
    var text = Number(price).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    ['#gp-overview-price', '#last-price', '[data-last-price]'].forEach(function (selector) {
      try {
        document.querySelectorAll(selector).forEach(function (node) {
          if (node) node.textContent = text;
        });
      } catch (_) {}
    });
  }

  function dispatch(rt, sym, candle, q) {
    var now = Date.now();
    if (now - state.lastDispatchAt < 700) return;
    state.lastDispatchAt = now;
    var fresh = quoteIsFresh(q, now);
    var detail = {
      state: fresh ? 'live' : 'stale',
      reason: fresh ? 'Forex / Gold live candle resumed from a fresh quote.' : 'Forex / Gold quote is stale or unverified; last candle values remain visible.',
      time: fresh ? Number(q.time) : 0,
      symbol: sym,
      exchange: 'forexgold',
      timeframe: timeframe(rt),
      context: ['forexgold', sym, timeframe(rt)].join(':'),
      sequence: ++state.eventSequence,
      price: Number(candle.close) || 0,
      source: VERSION,
      candleTime: Number(candle.time) || 0,
      providerTimestampVerified: fresh && q.providerTimestampVerified === true,
      responseTimeFallback: fresh && q.responseTimeFallback === true
    };
    try { window.__gpMarketDataState = detail; } catch (_) {}
    try { document.body.setAttribute('data-gp-market-state', detail.state); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('guardeer:market-data-state', { detail: detail })); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('guardeer:forexgold-live-tick', { detail: detail })); } catch (_) {}
  }

  function isForexGold(rt, sym) {
    var ex = exchange(rt);
    if (ex) return ex === 'forexgold';
    return sym === 'XAUUSD' || sym === 'XAGUSD' || /^[A-Z]{6}$/.test(sym);
  }

  function verifiedHistoryReady(rt, sym, tf) {
    try {
      var api = window.GPForexGoldFeedIntegrityR311;
      var status = api && typeof api.status === 'function' ? api.status() : null;
      var integrityContext = [sym, 'forexgold', tf].join('|');
      var mainContext = ['forexgold', sym, tf].join(':');
      return Boolean(status && status.context === integrityContext && status.hasGoodHistory === true &&
        String(window.__gpMainCommittedForexContext || '') === mainContext);
    } catch (_) {
      return false;
    }
  }

  function tick(force) {
    var rt = runtime();
    if (!rt || !rt.state) return false;
    var sym = symbol(rt);
    if (!isForexGold(rt, sym)) return false;
    var tf = timeframe(rt);
    if (!verifiedHistoryReady(rt, sym, tf)) return false;
    var seconds = timeframeSeconds(tf);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 12 * 60 * 60) return false;

    var list = rows(rt);
    if (!list.length) return false;
    var last = list[list.length - 1];
    var lastTime = Number(last && last.time);
    var bucket = nowBucket(tf);
    if (!Number.isFinite(lastTime) || lastTime > bucket) return false;

    var q = quote(sym, rt, list);
    if (!q) return false;
    var coreTickAt = Number(window.__gpLastForexGoldLiveTick || 0);
    if (!force && coreTickAt && Date.now() - coreTickAt < 850) return false;

    var sameBucket = lastTime === bucket;
    var lastClose = Number(last && last.close);
    if (sym === 'XAUUSD' && q.fresh && window.GPXauLivePriceStabilityV1 &&
        !window.GPXauLivePriceStabilityV1.approve(Number(q.price), lastClose, q.source, true)) {
      return false;
    }
    var changedInsideBucket = sameBucket && q.fresh && Number.isFinite(lastClose) && Math.abs(Number(q.price) - lastClose) >= (sym === 'XAUUSD' ? 0.005 : 0.0000005);
    var seedCurrentBucket = !sameBucket && lastTime < bucket && q.fresh;

    // A stale runtime/header price may be useful for labels, but it is not valid
    // OHLC evidence. Only a fresh quote may update or seed the active bucket.
    if (!q.fresh || (!changedInsideBucket && !seedCurrentBucket)) return false;
    if (!force && Date.now() - state.lastForcedAt < 900) return false;

    var candle = makeCurrentCandle(last, q.price, bucket, sym, q.source);
    if (!candle) return false;

    var chartResult;
    try {
      if (rt.chart && typeof rt.chart.updateCandle === 'function') chartResult = rt.chart.updateCandle(candle);
    } catch (_) {
      return false;
    }
    if (chartResult === false) return false;
    state.lastForcedAt = Date.now();
    try { rt.state.currentPrice = Number(candle.close); } catch (_) {}
    mergeIntoRows(list, candle);
    mergeIntoChartRows(rt, candle);
    var updatedRows = rows(rt);
    updateOverlays(rt, updatedRows.length ? updatedRows : list, Number(candle.close));
    updatePriceDom(sym, Number(candle.close));
    dispatch(rt, sym, candle, q);
    return true;
  }

  function start() {
    if (!state.timer) state.timer = window.setInterval(function () { tick(false); }, 2400);
    window.setTimeout(function () { tick(true); }, 1800);
    window.setTimeout(function () { tick(true); }, 5200);
  }

  function requestResume(reason) {
    if (state.resumeTimer) return;
    state.resumeTimer = window.setTimeout(function () {
      state.resumeTimer = 0;
      if (document.hidden || navigator.onLine === false) return;
      try {
        var api = window.GPForexGoldFeedIntegrityR311;
        if (api && typeof api.resume === 'function') api.resume(String(reason || 'live-candle-resume'));
        else if (api && typeof api.recover === 'function') api.recover(String(reason || 'live-candle-resume'));
      } catch (_) {}
      tick(true);
    }, 120);
  }

  window.addEventListener('guardeer:prime-runtime-ready', function (event) {
    state.runtime = (event && event.detail) || window.GuardeerPrimeRuntime || null;
    window.setTimeout(function () { tick(true); }, 500);
    window.setTimeout(function () { tick(true); }, 2500);
  }, { passive: true });
  var externalTickTimer = 0;
  function scheduleExternalTick(event, delay) {
    // dispatch() emits both events below. Never feed our own event back into tick(),
    // otherwise every update creates two more timers and the queue grows for the
    // entire terminal session.
    if (event && event.detail && event.detail.source === VERSION) return;
    if (externalTickTimer) window.clearTimeout(externalTickTimer);
    externalTickTimer = window.setTimeout(function () {
      externalTickTimer = 0;
      tick(false);
    }, delay);
  }
  window.addEventListener('guardeer:forexgold-live-tick', function (event) {
    scheduleExternalTick(event, 900);
  }, { passive: true });
  window.addEventListener('guardeer:market-data-state', function (event) {
    scheduleExternalTick(event, 700);
  }, { passive: true });
  window.addEventListener('guardeer:forexgold-feed-integrity', function (event) {
    var detail = event && event.detail || {};
    if (String(detail.state || '').toLowerCase() === 'quote') scheduleExternalTick(event, 160);
  }, { passive: true });
  window.addEventListener('focus', function () { requestResume('focus'); }, { passive: true });
  window.addEventListener('pageshow', function () { requestResume('pageshow'); }, { passive: true });
  window.addEventListener('online', function () { requestResume('online'); }, { passive: true });
  window.addEventListener('guardeer:open-dashboard-chart', function () { requestResume('open-dashboard-chart'); }, { passive: true });
  window.addEventListener('guardeer:terminal-visibility-changed', function () { requestResume('terminal-visibility-changed'); }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestResume('visible'); }, { passive: true });

  window.GPForexGoldLiveCandleResumeV175 = {
    version: VERSION,
    tick: tick,
    resume: requestResume,
    status: function () {
      var rt = runtime();
      var list = rows(rt);
      var last = list[list.length - 1] || null;
      return {
        version: VERSION,
        symbol: symbol(rt),
        exchange: exchange(rt),
        timeframe: timeframe(rt),
        lastCandleTime: last && last.time,
        currentBucket: nowBucket(timeframe(rt)),
        rows: list.length,
        lastForcedAt: state.lastForcedAt
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
