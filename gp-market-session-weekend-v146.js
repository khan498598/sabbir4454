(function () {
  'use strict';

  if (window.__GP_MARKET_SESSION_WEEKEND_V146__) return;
  window.__GP_MARKET_SESSION_WEEKEND_V146__ = true;
  window.__GP_MARKET_SESSION_WEEKEND_V145__ = true;
  // Prevent any older cached weekend-freeze script from taking control after this one.
  window.__GP_MARKET_SESSION_WEEKEND_V119__ = true;

  var VERSION = 'gp-market-session-weekend-v146-dst-session-recovery-v1';
  var PROVIDER_FRESHNESS_MS = 45000;
  var runtimeRef = null;
  var originalGetLatestKlines = null;
  var originalRefreshMarketData = null;
  var originalSwitchMarket = null;
  var originalSwitchTimeframe = null;
  var lastDispatchAt = 0;
  var integrityVerifiedAt = Object.create(null);
  var loadingContext = '';
  var loadingStartedAt = 0;
  var LOADING_FAILSAFE_MS = 60000;
  var lastSessionOpen = null;
  var marketClock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function exchangeName(rt) {
    return String(rt && rt.state && rt.state.exchange || '').toLowerCase();
  }

  function symbolName(rt) {
    return cleanSymbol(rt && rt.state && rt.state.symbol || (document.getElementById('gp-overview-symbol') || {}).textContent || '');
  }

  function timeframeName(rt) {
    return String(rt && rt.state && rt.state.timeframe || '1h');
  }

  function contextKey(rt) {
    return [exchangeName(rt), symbolName(rt), timeframeName(rt)].join(':');
  }

  function integrityContextKey(rt) {
    return [symbolName(rt), exchangeName(rt), timeframeName(rt)].join('|');
  }

  function isForexGoldRuntime(rt) {
    var exchange = exchangeName(rt);
    var symbol = symbolName(rt);
    if (exchange) return exchange === 'forexgold';
    return symbol === 'XAUUSD' || symbol === 'XAGUSD' || /^[A-Z]{6}$/.test(symbol);
  }

  function marketClockParts(value) {
    var parts = marketClock.formatToParts(value instanceof Date ? value : new Date(value || Date.now()));
    var result = { weekday: '', hour: 0, minute: 0 };
    parts.forEach(function (part) {
      if (part.type === 'weekday') result.weekday = part.value;
      if (part.type === 'hour') result.hour = Number(part.value) || 0;
      if (part.type === 'minute') result.minute = Number(part.value) || 0;
    });
    return result;
  }

  function sessionState(value, rt) {
    rt = rt || runtimeRef || window.GuardeerPrimeRuntime || null;
    if (!isForexGoldRuntime(rt)) return { open: true, kind: 'continuous', reason: 'continuous-market' };
    var parts = marketClockParts(value || new Date());
    var minute = parts.hour * 60 + parts.minute;
    var sym = symbolName(rt);
    var metal = sym === 'XAUUSD' || sym === 'XAGUSD';
    var open = true;
    var reason = 'open';

    if (parts.weekday === 'Sat') {
      open = false;
      reason = 'weekend';
    } else if (parts.weekday === 'Fri' && minute >= 17 * 60) {
      open = false;
      reason = 'weekend';
    } else if (parts.weekday === 'Sun') {
      var sundayOpen = metal ? 18 * 60 : 17 * 60 + 5;
      open = minute >= sundayOpen;
      reason = open ? 'open' : 'weekend';
    } else if (metal && minute >= 17 * 60 && minute < 18 * 60) {
      open = false;
      reason = 'daily-maintenance';
    }

    return {
      open: open,
      kind: metal ? 'metals' : 'fx',
      reason: reason,
      symbol: sym,
      timezone: 'America/New_York',
      weekday: parts.weekday,
      minuteOfDay: minute
    };
  }

  function sessionIsOpen(value, rt) {
    return sessionState(value, rt).open === true;
  }

  function timestamp(value) {
    var time = Number(value || 0);
    if (!Number.isFinite(time) || time <= 0) return 0;
    return time < 100000000000 ? time * 1000 : time;
  }

  function isFreshTimestamp(time, now) {
    var age = Number(now) - Number(time);
    return Number(time) > 0 && Number.isFinite(age) && age >= 0 && age <= PROVIDER_FRESHNESS_MS;
  }

  function pastTimestamp(value) {
    var time = timestamp(value);
    return Number.isFinite(time) && time > 0 && time <= Date.now() ? time : 0;
  }

  function recentLoading(value) {
    var time = pastTimestamp(value);
    return time > 0 && Date.now() - time <= LOADING_FAILSAFE_MS;
  }

  function detailMatchesRuntime(rt, detail) {
    if (!detail) return true;
    var explicit = String(detail.context || '');
    if (explicit && explicit !== contextKey(rt) && explicit !== integrityContextKey(rt)) return false;
    if (detail.exchange && String(detail.exchange).toLowerCase() !== exchangeName(rt)) return false;
    if (detail.symbol && cleanSymbol(detail.symbol) !== symbolName(rt)) return false;
    if (detail.timeframe && String(detail.timeframe) !== timeframeName(rt)) return false;
    return true;
  }

  function chartRows(rt) {
    try {
      var rows = rt && typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : null;
      if (!Array.isArray(rows) || !rows.length) {
        rows = rt && rt.chart && Array.isArray(rt.chart.lastCandleData) ? rt.chart.lastCandleData : [];
      }
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function hasUsableHistory(rt) {
    var rows = chartRows(rt);
    if (rows.length < 24) return false;
    var previous = 0;
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index] || {};
      var rowTime = timestamp(row.time);
      var open = Number(row.open);
      var high = Number(row.high);
      var low = Number(row.low);
      var close = Number(row.close);
      if (!rowTime || rowTime <= previous ||
          ![open, high, low, close].every(function (value) { return Number.isFinite(value) && value > 0; }) ||
          high < Math.max(open, close) || low > Math.min(open, close) || low > high ||
          row.synthetic === true || /synthetic|safety-fallback|mock|demo/i.test(String(row.provider || row.source || ''))) {
        return false;
      }
      previous = rowTime;
    }
    return true;
  }

  function integrityStatus() {
    try {
      var api = window.GPForexGoldFeedIntegrityR311;
      return api && typeof api.status === 'function' ? api.status() || null : null;
    } catch (_) {
      return null;
    }
  }

  function stabilityStatus() {
    try {
      var api = window.GPForexGoldRuntimeStabilityV1;
      return api && typeof api.status === 'function' ? api.status() || null : null;
    } catch (_) {
      return null;
    }
  }

  function committedHistoryReady(rt) {
    if (!rt || !isForexGoldRuntime(rt)) return false;
    try {
      var stableApi = window.GPForexGoldRuntimeStabilityV1;
      if (stableApi && typeof stableApi.hasCommittedVerifiedHistory === 'function') {
        return stableApi.hasCommittedVerifiedHistory(rt) === true;
      }
    } catch (_) {}

    var status = integrityStatus();
    var expectedIntegrity = integrityContextKey(rt);
    var expectedMain = contextKey(rt);
    return Boolean(status && status.context === expectedIntegrity && status.hasGoodHistory === true &&
      String(window.__gpMainCommittedForexContext || '') === expectedMain && hasUsableHistory(rt));
  }

  function bodyHasClass(name) {
    try { return Boolean(document.body && document.body.classList && document.body.classList.contains(name)); } catch (_) { return false; }
  }

  function rememberLoading(rt, detail, explicitStart) {
    var context = contextKey(rt);
    if (loadingContext !== context) {
      loadingContext = context;
      loadingStartedAt = 0;
    }
    if (!explicitStart && !detailMatchesRuntime(rt, detail)) return;
    // Session heartbeats describe a request; they never start or renew one.
    // In particular, an idle quote receipt must not restart the loading clock.
    if (explicitStart || (String(detail && detail.state || '').toLowerCase() === 'loading' && detail.source !== VERSION)) {
      var startedAt = explicitStart ? Date.now() : pastTimestamp(detail.time);
      // An invalid clock is not a renewable loading lease. Permit only the
      // first local grace window when no valid request start is available.
      if (startedAt) loadingStartedAt = Math.max(loadingStartedAt, startedAt);
      else if (!loadingStartedAt) loadingStartedAt = Date.now();
    }
  }

  function verifiedAfterCurrentLoad(rt) {
    return loadingContext === contextKey(rt) && loadingStartedAt > 0 &&
      Number(integrityVerifiedAt[integrityContextKey(rt)] || 0) >= loadingStartedAt;
  }

  function loadingIsActive(rt, current, chartReady) {
    var raw = String(current && current.state || '').toLowerCase();
    rememberLoading(rt, current, false);
    var stable = stabilityStatus();
    if (stable && (!detailMatchesRuntime(rt, stable) || stable.context !== contextKey(rt))) stable = null;
    var integrity = integrityStatus();
    if (stable && stable.requestedContext === contextKey(rt) && stable.requestedPhase === 'start') {
      loadingStartedAt = Math.max(loadingStartedAt, pastTimestamp(stable.requestedStartedAt));
    }
    var verifiedAfterLoad = verifiedAfterCurrentLoad(rt);
    var canonical = null;
    try {
      canonical = window.GPXauUsdCanonicalFeedV1 && typeof window.GPXauUsdCanonicalFeedV1.status === 'function'
        ? window.GPXauUsdCanonicalFeedV1.status() || null
        : null;
    } catch (_) {}

    var loadRecent = recentLoading(loadingStartedAt);
    var canonicalRecent = symbolName(rt) === 'XAUUSD' && canonical &&
      canonical.pendingContext === integrityContextKey(rt) && recentLoading(canonical.pendingSinceAt);
    if (stable && stable.context === contextKey(rt) &&
        (stable.refreshInFlight === true || stable.switchBusy === true) && loadRecent) return true;
    var transaction = window.__gpPendingForexTimeframeTxnR390;
    if (transaction && transaction.exchange === exchangeName(rt) && transaction.symbol === symbolName(rt) &&
        transaction.requestedTimeframe === timeframeName(rt) && loadRecent) return true;
    if (integrity && integrity.context === integrityContextKey(rt) &&
        (integrity.hasPendingSet === true || integrity.refreshBusy === true) && loadRecent) return true;
    if (canonical && (canonical.pending === true || canonical.busy === true) && canonicalRecent) return true;
    if (!loadRecent || (chartReady && verifiedAfterLoad)) return false;
    if (raw === 'loading') return true;
    if (bodyHasClass('gp-forexgold-feed-pending') || bodyHasClass('gp-xau-canonical-pending')) return true;
    if (stable && /^(?:booting|loading)$/.test(String(stable.phase || ''))) return true;
    if (stable && stable.requestedContext === contextKey(rt) && String(stable.requestedPhase || '') === 'start') return true;
    return false;
  }

  function verifiedProviderQuote(rt, now) {
    var sym = symbolName(rt);
    var quote = null;
    try { quote = window.__gpForexQuoteState && window.__gpForexQuoteState[sym]; } catch (_) {}
    var quoteTime = timestamp(quote && (quote.time || quote.updatedAt || quote.timestamp || quote.eventTime));
    var quotePrice = Number(quote && quote.price);
    if (quote && quote.fresh === true && Number.isFinite(quotePrice) && quotePrice > 0 && isFreshTimestamp(quoteTime, now)) {
      return { price: quotePrice, time: quoteTime, source: quote.source || 'forexgold-provider-quote' };
    }

    // A runtime value is eligible only when the runtime itself explicitly marks
    // it as fresh and supplies a recent provider timestamp. A cached price alone
    // must never manufacture a LIVE market state.
    var runtimeState = rt && rt.state || {};
    var runtimeFresh = runtimeState.quoteFresh === true || runtimeState.marketDataFresh === true || runtimeState.currentPriceFresh === true;
    var runtimeTime = timestamp(runtimeState.quoteTime || runtimeState.lastQuoteTime || runtimeState.quoteUpdatedAt || runtimeState.currentPriceUpdatedAt || runtimeState.lastPriceUpdatedAt);
    var runtimePrice = Number(runtimeState.currentPrice || runtimeState.price);
    if (runtimeFresh && Number.isFinite(runtimePrice) && runtimePrice > 0 && isFreshTimestamp(runtimeTime, now)) {
      return { price: runtimePrice, time: runtimeTime, source: 'verified-runtime-quote' };
    }
    return null;
  }

  function publishState(state, reason, force) {
    var now = Date.now();
    if (!force && now - lastDispatchAt < 4500) return;
    lastDispatchAt = now;
    var rt = runtimeRef || window.GuardeerPrimeRuntime || null;
    var requestedState = state || (navigator.onLine === false ? 'offline' : 'live');
    var current = window.__gpMarketDataState || {};
    rememberLoading(rt, current, requestedState === 'loading');
    var chartReady = committedHistoryReady(rt);
    var session = sessionState(new Date(now), rt);
    var activeLoading = session.open && requestedState !== 'offline' && (requestedState === 'loading' || loadingIsActive(rt, current, chartReady));
    var verifiedQuote = session.open && requestedState === 'live' && !activeLoading ? verifiedProviderQuote(rt, now) : null;
    var displayState = requestedState === 'offline'
      ? 'offline'
      : !session.open
        ? 'closed'
      : activeLoading
        ? 'loading'
        : requestedState === 'live' && verifiedQuote && chartReady
          ? 'live'
          : 'stale';
    var defaultReason = displayState === 'live'
      ? 'Forex / Gold provider quote is fresh and verified against committed chart history.'
      : displayState === 'closed'
        ? (session.reason === 'daily-maintenance'
          ? 'Forex / Gold daily maintenance is active; the last verified chart remains visible.'
          : 'Forex / Gold weekend session is closed; the last verified chart remains visible.')
      : displayState === 'loading'
        ? 'Loading and verifying Forex / Gold history; the last verified chart remains visible.'
      : displayState === 'stale'
        ? 'Awaiting a fresh provider quote and committed Forex / Gold chart history; last verified values remain visible.'
        : 'Network offline; last values remain visible.';
    var detail = {
      state: displayState,
      reason: displayState === 'live' || displayState === 'offline' ? (reason || defaultReason) : defaultReason,
      // Only an actual provider timestamp may back a LIVE badge.  STALE uses
      // zero so a downstream status layer cannot interpret this heartbeat as
      // a new market update.
      time: displayState === 'live' ? verifiedQuote.time : displayState === 'offline' ? now : displayState === 'loading' ? loadingStartedAt : 0,
      symbol: symbolName(rt),
      exchange: exchangeName(rt),
      price: displayState === 'live' ? verifiedQuote.price : Number(rt && rt.state && rt.state.currentPrice) || 0,
      source: VERSION,
      context: contextKey(rt),
      quoteVerified: Boolean(verifiedQuote),
      chartReady: chartReady,
      historyCommitted: chartReady,
      loadingActive: activeLoading,
      sessionOpen: session.open,
      sessionReason: session.reason,
      sessionKind: session.kind,
      sessionTimezone: session.timezone
    };
    window.__gpMarketDataState = detail;
    try { document.body.setAttribute('data-gp-market-state', detail.state); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('guardeer:market-data-state', { detail: detail })); } catch (_) {}
  }

  function latestRows() {
    var rt = runtimeRef || window.GuardeerPrimeRuntime || null;
    if (!rt) return [];
    try {
      var rows = originalGetLatestKlines ? originalGetLatestKlines() : (typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : []);
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function wrapRuntime(rt) {
    if (!rt || rt.__gpMarketSessionV146Wrapped) return;
    rt.__gpMarketSessionV146Wrapped = true;
    runtimeRef = rt;

    if (typeof rt.getLatestKlines === 'function') {
      originalGetLatestKlines = rt.getLatestKlines.bind(rt);
      // Important: do not filter, bridge, rebuild, setData, fitContent or scrollToRealTime here.
      // The chart keeps the user's current zoom/pan and receives normal live updates from the core runtime.
      rt.getLatestKlines = function () {
        return originalGetLatestKlines();
      };
    }

    if (typeof rt.refreshMarketData === 'function') {
      originalRefreshMarketData = rt.refreshMarketData.bind(rt);
      rt.refreshMarketData = async function () {
        if (isForexGoldRuntime(rt) && !sessionIsOpen(new Date(), rt)) {
          publishState('closed', 'Forex / Gold session is closed; the last verified chart remains visible.', true);
          return false;
        }
        if (isForexGoldRuntime(rt)) publishState('loading', 'Refreshing verified Forex / Gold history.', true);
        var result = await originalRefreshMarketData.apply(rt, arguments);
        if (isForexGoldRuntime(rt)) publishState(navigator.onLine === false ? 'offline' : 'live', 'Forex / Gold feed refreshed and committed.', true);
        return result;
      };
    }

    if (typeof rt.switchMarket === 'function') {
      originalSwitchMarket = rt.switchMarket.bind(rt);
      rt.switchMarket = async function () {
        var result = await originalSwitchMarket.apply(rt, arguments);
        window.setTimeout(function () {
          if (isForexGoldRuntime(rt)) publishState(navigator.onLine === false ? 'offline' : sessionIsOpen(new Date(), rt) ? 'live' : 'closed', 'Market switch completed.', true);
        }, 150);
        return result;
      };
    }

    if (typeof rt.switchTimeframe === 'function') {
      originalSwitchTimeframe = rt.switchTimeframe.bind(rt);
      rt.switchTimeframe = async function () {
        var result = await originalSwitchTimeframe.apply(rt, arguments);
        window.setTimeout(function () {
          if (isForexGoldRuntime(rt)) publishState(navigator.onLine === false ? 'offline' : sessionIsOpen(new Date(), rt) ? 'live' : 'closed', 'Timeframe changed; chart zoom is preserved after live updates.', true);
        }, 150);
        return result;
      };
    }
  }

  function tick(force) {
    var rt = window.GuardeerPrimeRuntime || runtimeRef;
    if (rt && rt !== runtimeRef) wrapRuntime(rt);
    if (!runtimeRef) return;
    if (!isForexGoldRuntime(runtimeRef)) return;

    // Keep the core timer alive but network-gated while closed. This lets the
    // first post-open quote resume without rebuilding the chart or changing the
    // user's pan/zoom position.
    var open = sessionIsOpen(new Date(), runtimeRef);
    if (lastSessionOpen !== open) {
      var previous = lastSessionOpen;
      lastSessionOpen = open;
      try {
        window.dispatchEvent(new CustomEvent(open ? 'guardeer:forexgold-session-reopened' : 'guardeer:forexgold-session-closed', {
          detail: Object.assign({ version: VERSION, time: Date.now() }, sessionState(new Date(), runtimeRef))
        }));
      } catch (_) {}
      if (previous === false && open) lastDispatchAt = 0;
    }
    publishState(navigator.onLine === false ? 'offline' : open ? 'live' : 'closed', open
      ? 'Forex / Gold session is open.'
      : 'Forex / Gold session is closed; the last verified chart remains visible.', !!force);
  }

  function boot() {
    if (window.GuardeerPrimeRuntime) wrapRuntime(window.GuardeerPrimeRuntime);
    window.addEventListener('guardeer:prime-runtime-ready', function (event) {
      wrapRuntime((event && event.detail) || window.GuardeerPrimeRuntime);
      window.setTimeout(function () { tick(true); }, 0);
      window.setTimeout(function () { tick(true); }, 700);
    }, { passive: true });
    window.addEventListener('guardeer:forexgold-live-tick', function () { tick(false); }, { passive: true });
    window.addEventListener('guardeer:market-data-state', function (event) {
      var rt = runtimeRef || window.GuardeerPrimeRuntime;
      if (rt && isForexGoldRuntime(rt)) rememberLoading(rt, event && event.detail, false);
    }, { passive: true });
    window.addEventListener('guardeer:forexgold-feed-integrity', function (event) {
      var detail = event && event.detail || {};
      var rt = runtimeRef || window.GuardeerPrimeRuntime;
      var verifiedTime = detail.time == null ? Date.now() : pastTimestamp(detail.time);
      if (String(detail.state || '').toLowerCase() === 'verified' && detail.context &&
          rt && detailMatchesRuntime(rt, detail) && verifiedTime) {
        integrityVerifiedAt[String(detail.context)] = verifiedTime;
        window.setTimeout(function () { tick(true); }, 0);
      }
    }, { passive: true });
    window.addEventListener('online', function () { window.setTimeout(function () { tick(true); }, 100); }, { passive: true });
    window.addEventListener('offline', function () { publishState('offline', 'Network offline; last values remain visible.', true); }, { passive: true });
    window.setInterval(function () { tick(false); }, 5000);
    window.setTimeout(function () { tick(true); }, 0);
  }

  window.GPMarketSessionV119 = window.GPMarketSessionV145 = window.GPMarketSessionV146 = {
    version: VERSION,
    isOpen: function (value, rt) { return sessionIsOpen(value || new Date(), rt); },
    isForexGoldSessionOpen: function (value, rt) { return sessionIsOpen(value || new Date(), rt); },
    sessionState: function (value, rt) { return sessionState(value || new Date(), rt); },
    filterCandles: function (rows) { return Array.isArray(rows) ? rows.slice() : []; },
    sanitize: function () { return latestRows(); },
    refresh: function () { return tick(true); },
    schedule: {
      timezone: 'America/New_York',
      fridayCloseMinuteEt: 17 * 60,
      sundayFxOpenMinuteEt: 17 * 60 + 5,
      sundayMetalsOpenMinuteEt: 18 * 60,
      metalsMaintenance: '17:00-18:00 America/New_York',
      continuousWeekendFeed: false,
      noSyntheticCandles: true,
      noForcedRedraw: true
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
