(function () {
  'use strict';
  if (window.__GP_MARKET_DATA_STATUS_V119__) return;
  window.__GP_MARKET_DATA_STATUS_V119__ = true;
  window.__GP_MARKET_DATA_STATUS_V113__ = true;

  var VERSION = 'r473-source-price-freshness-v1';
  var styleId = 'gp-market-data-status-v119-style';
  var lastSourceDetail = null;
  var loadingContext = '';
  var loadingStartedAt = 0;
  var resumeContext = '';
  var resumeGraceUntil = 0;
  var resumeExpiryTimer = 0;
  var integrityVerifiedAt = Object.create(null);
  // A provider status may be delivered by a delayed browser event.  Do not turn
  // that event into a permanent LIVE badge: the event itself must carry a
  // recent provider timestamp.
  var LIVE_FRESHNESS_MS = 45000;
  var LOADING_FAILSAFE_MS = 60000;
  var RESUME_GRACE_MS = 10000;

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function runtime() {
    var root = window.GuardeerPrimeRuntime || null;
    return root && (root.runtime || root) || null;
  }

  function exchangeName(detail) {
    return String(detail && detail.exchange || runtime() && runtime().state && runtime().state.exchange || '').toLowerCase();
  }

  function symbolName(detail) {
    return cleanSymbol(detail && detail.symbol || runtime() && runtime().state && runtime().state.symbol || '');
  }

  function timeframeName(detail) {
    var rt = runtime();
    return String(detail && detail.timeframe || rt && rt.state && rt.state.timeframe || '1h');
  }

  function marketContext(detail) {
    return [exchangeName(detail), symbolName(detail), timeframeName(detail)].join(':');
  }

  function integrityContext(detail) {
    return [symbolName(detail), exchangeName(detail), timeframeName(detail)].join('|');
  }

  function isForexGold(detail) {
    var exchange = exchangeName(detail);
    var symbol = symbolName(detail);
    if (exchange) return exchange === 'forexgold';
    return symbol === 'XAUUSD' || symbol === 'XAGUSD' || /^[A-Z]{6}$/.test(symbol);
  }

  function timestamp(value) {
    var time = Number(value || 0);
    if (!Number.isFinite(time) || time <= 0) return 0;
    return time < 100000000000 ? time * 1000 : time;
  }

  function pastTimestamp(value) {
    var time = timestamp(value);
    return Number.isFinite(time) && time > 0 && time <= Date.now() ? time : 0;
  }

  function recentLoading(value) {
    var time = pastTimestamp(value);
    return time > 0 && Date.now() - time <= LOADING_FAILSAFE_MS;
  }

  function ensureStyle() {
    if (document.getElementById(styleId)) return;
    var oldStyle = document.getElementById('gp-market-data-status-v113-style') || document.getElementById('gp-market-data-status-v103-style');
    if (oldStyle) oldStyle.remove();
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '#gp-market-data-status-v103{display:inline-flex;align-items:center;gap:6px;position:fixed;right:12px;bottom:92px;z-index:360;padding:6px 9px;border-radius:999px;border:1px solid rgba(0,229,155,.32);background:rgba(6,18,22,.94);color:#a9ffdd;font:900 10px/1 Inter,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;box-shadow:0 6px 18px rgba(0,0,0,.32),0 0 18px rgba(0,229,155,.08);pointer-events:none;backdrop-filter:blur(8px)}',
      '#gp-market-data-status-v103:before{content:"";width:7px;height:7px;border-radius:50%;background:#00e59b;box-shadow:0 0 0 3px rgba(0,229,155,.15),0 0 12px rgba(0,229,155,.42)}',
      '#gp-market-data-status-v103[data-state="loading"]{color:#9ec8ff;border-color:rgba(86,157,255,.28);background:rgba(6,13,28,.94)}',
      '#gp-market-data-status-v103[data-state="loading"]:before{background:#5b9dff;box-shadow:0 0 0 3px rgba(91,157,255,.15),0 0 12px rgba(91,157,255,.38)}',
      '#gp-market-data-status-v103[data-state="recovering"]{color:#9ee8ff;border-color:rgba(60,198,255,.32);background:rgba(5,17,29,.94)}',
      '#gp-market-data-status-v103[data-state="recovering"]:before{background:#39c6ff;box-shadow:0 0 0 3px rgba(57,198,255,.15),0 0 12px rgba(57,198,255,.38)}',
      '#gp-market-data-status-v103[data-state="closed"]{color:#f7d776;border-color:rgba(247,201,75,.34);background:rgba(24,18,5,.95)}',
      '#gp-market-data-status-v103[data-state="closed"]:before{background:#f4c542;box-shadow:0 0 0 3px rgba(244,197,66,.15),0 0 12px rgba(244,197,66,.38)}',
       '#gp-market-data-status-v103[data-state="offline"]{color:#ff91a8;border-color:rgba(255,91,124,.30);background:rgba(25,8,15,.94)}',
       '#gp-market-data-status-v103[data-state="offline"]:before{background:#ff5b7c;box-shadow:0 0 0 3px rgba(255,91,124,.14),0 0 12px rgba(255,91,124,.38)}',
       '#gp-market-data-status-v103[data-state="stale"]{color:#ffd18a;border-color:rgba(231,158,56,.38);background:rgba(28,19,7,.95)}',
       '#gp-market-data-status-v103[data-state="stale"]:before{background:#eea537;box-shadow:0 0 0 3px rgba(238,165,55,.15),0 0 12px rgba(238,165,55,.38)}',
       '@media(max-width:768px){#gp-market-data-status-v103{right:8px;bottom:68px;font-size:9px;padding:5px 8px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function sourceState(detail) {
    return String((detail && detail.state) || 'loading').toLowerCase();
  }

  function sourceTimestamp(detail) {
    return timestamp(detail && detail.time);
  }

  function sourceIsFresh(detail, now) {
    var time = sourceTimestamp(detail);
    var age = Number(now) - time;
    return time > 0 && Number.isFinite(age) && age >= 0 && age <= LIVE_FRESHNESS_MS;
  }

  function sourceIsUnavailable(raw) {
    // "resumed" is a recovery hint, not an independently verified live tick.
    // The candle-resume bridge now publishes fresh recovery quotes as "live".
    return /^(?:stale|resumed|error|failed|failure|unavailable|disconnected)$/.test(raw);
  }

  function latestRows() {
    var rt = runtime();
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

  function hasUsableHistory() {
    var rows = latestRows();
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

  function feedIntegrityStatus() {
    try {
      var api = window.GPForexGoldFeedIntegrityR311;
      return api && typeof api.status === 'function' ? api.status() || null : null;
    } catch (_) {
      return null;
    }
  }

  function runtimeStabilityStatus() {
    try {
      var api = window.GPForexGoldRuntimeStabilityV1;
      return api && typeof api.status === 'function' ? api.status() || null : null;
    } catch (_) {
      return null;
    }
  }

  function chartHistoryReady(detail) {
    if (!isForexGold(detail)) return true;
    var rt = runtime();
    try {
      var stableApi = window.GPForexGoldRuntimeStabilityV1;
      if (stableApi && typeof stableApi.hasCommittedVerifiedHistory === 'function') {
        return stableApi.hasCommittedVerifiedHistory(rt) === true;
      }
    } catch (_) {}

    var integrity = feedIntegrityStatus();
    return Boolean(integrity && integrity.context === integrityContext(detail) && integrity.hasGoodHistory === true &&
      String(window.__gpMainCommittedForexContext || '') === marketContext(detail) && hasUsableHistory());
  }

  function verifiedProviderQuote(detail, now) {
    if (exchangeName(detail) === 'binance') {
      var cryptoRuntime = runtime(), evidence = null;
      try { evidence = cryptoRuntime && typeof cryptoRuntime.getCryptoPriceStatus === 'function' ? cryptoRuntime.getCryptoPriceStatus() : null; } catch (_) {}
      var eventTime = Number(evidence && evidence.providerTime);
      var eventPrice = Number(evidence && evidence.price);
      if (evidence && evidence.context === marketContext(detail) && evidence.fresh === true &&
          Number.isSafeInteger(eventTime) && eventTime > 0 && now - eventTime >= -2000 && now - eventTime <= LIVE_FRESHNESS_MS &&
          Number.isFinite(eventPrice) && eventPrice > 0 && String(window.__gpMainCommittedCryptoContext || '') === marketContext(detail))
        return { time:eventTime,price:eventPrice,integrity:true };
      return null;
    }
    if (!isForexGold(detail)) return sourceIsFresh(detail, now) ? { time: sourceTimestamp(detail), price: Number(detail && detail.price) || 0, integrity: false } : null;
    var symbol = symbolName(detail);
    var quote = null;
    var integrity = feedIntegrityStatus();
    var integrityQuote = integrity && integrity.quote;
    var expectedIntegrityContext = integrityContext(detail);
    var quoteTime = timestamp(integrityQuote && integrityQuote.time);
    var quotePrice = Number(integrityQuote && integrityQuote.price);
    if (integrity && integrity.context === expectedIntegrityContext && integrityQuote && integrityQuote.context === expectedIntegrityContext &&
        Number.isFinite(quotePrice) && quotePrice > 0 && quoteTime > 0 && now - quoteTime >= 0 && now - quoteTime <= LIVE_FRESHNESS_MS) {
      return { time: quoteTime, price: quotePrice, integrity: true };
    }

    try { quote = window.__gpForexQuoteState && window.__gpForexQuoteState[symbol]; } catch (_) {}
    quoteTime = timestamp(quote && (quote.time || quote.updatedAt || quote.timestamp || quote.eventTime));
    quotePrice = Number(quote && quote.price);
    if (quote && quote.fresh === true && Number.isFinite(quotePrice) && quotePrice > 0 &&
        quoteTime > 0 && now - quoteTime >= 0 && now - quoteTime <= LIVE_FRESHNESS_MS) {
      return { time: quoteTime, price: quotePrice, integrity: Boolean(quote.integrityVersion) };
    }

    // Status heartbeats produced by the session guard explicitly carry both
    // proofs.  This fallback is intentionally unavailable to generic core
    // "live" events, whose Date.now timestamp alone is not provider evidence.
    if (detail && detail.quoteVerified === true && detail.chartReady === true && sourceIsFresh(detail, now)) {
      return { time: sourceTimestamp(detail), price: Number(detail.price) || 0, integrity: true };
    }
    return null;
  }

  function bodyHasClass(name) {
    try { return Boolean(document.body && document.body.classList && document.body.classList.contains(name)); } catch (_) { return false; }
  }

  function activeLoadingEvidence(detail, chartReady) {
    // Binance has its own committed-price proof. A prior loading receipt or
    // Forex request cannot hold a healthy Binance chart in LOADING for60s.
    if (exchangeName(detail) === 'binance') return false;
    var context = marketContext(detail);
    var verifiedAt = Number(integrityVerifiedAt[integrityContext(detail)] || 0);
    var verifiedAfterLoad = context === loadingContext && loadingStartedAt > 0 && verifiedAt >= loadingStartedAt;
    var integrity = feedIntegrityStatus();
    var stable = runtimeStabilityStatus();
    if (integrity && integrity.context !== integrityContext(detail)) integrity = null;
    if (stable && (stable.context !== context || !detailMatchesCurrent(stable))) stable = null;
    var canonical = null;
    try {
      canonical = window.GPXauUsdCanonicalFeedV1 && typeof window.GPXauUsdCanonicalFeedV1.status === 'function'
        ? window.GPXauUsdCanonicalFeedV1.status() || null
        : null;
    } catch (_) {}

    var requestedAt = stable && stable.requestedContext === context ? pastTimestamp(stable.requestedStartedAt) : 0;
    var loadAt = Math.max(context === loadingContext ? pastTimestamp(loadingStartedAt) : 0, requestedAt);
    var loadRecent = recentLoading(loadAt);
    var canonicalRecent = symbolName(detail) === 'XAUUSD' && canonical &&
      canonical.pendingContext === integrityContext(detail) && recentLoading(canonical.pendingSinceAt);
    // Pending CSS and the last source event are state, not proof a request is
    // still running. Expired work must display STALE, never permanent LOADING.
    if (integrity && (integrity.hasPendingSet === true || integrity.refreshBusy === true) && loadRecent) return true;
    if (canonical && (canonical.pending === true || canonical.busy === true) && canonicalRecent) return true;
    if ((bodyHasClass('gp-forexgold-feed-pending') || bodyHasClass('gp-xau-canonical-pending')) && loadRecent && !verifiedAfterLoad) return true;
    if (stable && String(stable.requestedPhase || '') === 'start' && loadRecent && !verifiedAfterLoad) return true;
    if (stable && /^(?:booting|loading)$/.test(String(stable.phase || '')) && loadRecent && (!chartReady || !verifiedAfterLoad)) return true;
    if (context === loadingContext && loadingStartedAt > 0 && !verifiedAfterLoad) {
      return recentLoading(loadingStartedAt);
    }
    return false;
  }

  function sessionIsOpen() {
    try {
      return !window.GPMarketSessionV119 || window.GPMarketSessionV119.isOpen(new Date());
    } catch (_) { return true; }
  }

  function currentRuntimeContext() {
    var rt = runtime();
    return [String(rt && rt.state && rt.state.exchange || '').toLowerCase(), cleanSymbol(rt && rt.state && rt.state.symbol || ''), String(rt && rt.state && rt.state.timeframe || '1h')].join(':');
  }

  function detailMatchesCurrent(detail) {
    var explicit = String(detail && detail.context || '');
    var rt = runtime();
    if (!rt || !rt.state || !rt.state.exchange || !rt.state.symbol) return true;
    var current = currentRuntimeContext();
    var currentIntegrity = [cleanSymbol(rt.state.symbol), String(rt.state.exchange).toLowerCase(), String(rt.state.timeframe || '1h')].join('|');
    if (explicit && explicit !== current && explicit !== currentIntegrity) return false;
    if (detail && detail.exchange && String(detail.exchange).toLowerCase() !== String(rt.state.exchange).toLowerCase()) return false;
    if (detail && detail.symbol && cleanSymbol(detail.symbol) !== cleanSymbol(rt.state.symbol)) return false;
    if (detail && detail.timeframe && String(detail.timeframe) !== String(rt.state.timeframe || '1h')) return false;
    return true;
  }

  function beginResume(reason) {
    resumeContext = currentRuntimeContext();
    resumeGraceUntil = Date.now() + RESUME_GRACE_MS;
    if (resumeExpiryTimer) window.clearTimeout(resumeExpiryTimer);
    resumeExpiryTimer = window.setTimeout(function () {
      resumeExpiryTimer = 0;
      render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading', reason: reason || 'resume-expired' });
    }, RESUME_GRACE_MS + 20);
    render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading', reason: reason || 'resume' });
  }

  function render(detail) {
    ensureStyle();
    if (detail && typeof detail === 'object' && detailMatchesCurrent(detail)) lastSourceDetail = detail;

    var current = lastSourceDetail || window.__gpMarketDataState || {};
    if (!detailMatchesCurrent(current)) {
      var rt = runtime();
      current = {
        state: 'loading',
        reason: 'Waiting for current market context',
        time: loadingContext === currentRuntimeContext() && loadingStartedAt ? loadingStartedAt : Date.now(),
        symbol: rt && rt.state && rt.state.symbol,
        exchange: rt && rt.state && rt.state.exchange,
        timeframe: rt && rt.state && rt.state.timeframe,
        context: currentRuntimeContext()
      };
    }
    var raw = sourceState(current);
    var context = marketContext(current);
    if (raw === 'loading') {
      var sourceLoadingAt = pastTimestamp(current.time);
      if (context !== loadingContext) {
        loadingContext = context;
        loadingStartedAt = sourceLoadingAt || Date.now();
      } else if (!loadingStartedAt || sourceLoadingAt > loadingStartedAt) {
        loadingStartedAt = sourceLoadingAt || Date.now();
      }
    }
    var offline = navigator.onLine === false || raw === 'offline';
    var closed = !offline && !sessionIsOpen();
    var now = Date.now();
    var sourceFresh = sourceIsFresh(current, now);
    var chartReady = chartHistoryReady(current);
    var providerQuote = verifiedProviderQuote(current, now);
    var verifiedAfterLoad = context === loadingContext && loadingStartedAt > 0 &&
      Number(integrityVerifiedAt[integrityContext(current)] || 0) >= loadingStartedAt;
    var loading = !offline && !closed && ((raw === 'loading' && recentLoading(loadingStartedAt) &&
      (!chartReady || !verifiedAfterLoad)) || activeLoadingEvidence(current, chartReady));
    var fresh = Boolean(providerQuote) && chartReady && (isForexGold(current) || exchangeName(current) === 'binance' || sourceFresh);
    if (fresh && !loading) {
      loadingContext = '';
      loadingStartedAt = 0;
      resumeGraceUntil = 0;
      if (resumeExpiryTimer) window.clearTimeout(resumeExpiryTimer);
      resumeExpiryTimer = 0;
    }
    var recovering = !offline && !closed && !loading && (isForexGold(current) && ((raw === 'recovering' && sourceFresh) || (!fresh && resumeContext === currentRuntimeContext() && now < resumeGraceUntil)));
    var unavailable = sourceIsUnavailable(raw) && !(providerQuote && providerQuote.integrity === true);
    var displayState = offline ? 'offline' : closed ? 'closed' : loading ? 'loading' : recovering ? 'recovering' : (!fresh || unavailable) ? 'stale' : 'live';
    var el = document.getElementById('gp-market-data-status-v103');

    if (!el) {
      el = document.createElement('div');
      el.id = 'gp-market-data-status-v103';
      document.body.appendChild(el);
    }

    el.dataset.state = displayState;
    el.dataset.sourceState = raw;
    el.textContent = displayState === 'offline' ? 'Offline' : displayState === 'closed' ? 'Market closed' : displayState === 'loading' ? 'Loading market' : displayState === 'recovering' ? 'Syncing live' : displayState === 'stale' ? 'Stale market' : 'Live market';
    var topBarLabel = document.querySelector('.gp-terminal-livebar span:nth-child(2)');
    if (topBarLabel) topBarLabel.textContent = displayState === 'live' ? 'Live' : displayState === 'recovering' ? 'Syncing' : displayState === 'loading' ? 'Loading' : displayState === 'offline' ? 'Offline' : 'Stale';
    el.title = displayState === 'offline'
      ? 'No network connection — last values remain visible.'
      : displayState === 'closed'
        ? 'Forex / Gold session is closed. The last verified chart remains visible.'
        : displayState === 'loading'
          ? 'Loading and verifying provider history. The last verified chart remains visible.'
          : displayState === 'recovering'
            ? 'Revalidating the live provider quote after returning to the chart. The last verified chart remains visible.'
            : displayState === 'stale'
              ? 'A fresh provider quote and committed chart history are not both available — last verified values remain visible.'
              : 'Live provider quote and committed chart history are both verified.';

    try {
      document.body.setAttribute('data-gp-market-display-state', displayState);
      window.__gpMarketDataDisplayState = {
        state: displayState,
        sourceState: raw,
        sourceTime: sourceTimestamp(current),
        providerTime: providerQuote ? providerQuote.time : 0,
        fresh: fresh,
        providerQuoteFresh: Boolean(providerQuote),
        chartReady: chartReady,
        loadingActive: loading,
        recoveryActive: recovering,
        context: context,
        freshnessWindowMs: LIVE_FRESHNESS_MS,
        reason: el.title,
        time: Date.now(),
        version: VERSION
      };
    } catch (_) {}
  }

  function boot() {
    render(window.__gpMarketDataState || { state: navigator.onLine === false ? 'offline' : 'loading' });
    window.addEventListener('guardeer:market-data-state', function (event) {
      var detail = (event && event.detail) || {};
      if (detailMatchesCurrent(detail)) render(detail);
    }, { passive: true });
    window.addEventListener('guardeer:forexgold-feed-integrity', function (event) {
      var detail = event && event.detail || {};
      var verifiedTime = detail.time == null ? Date.now() : pastTimestamp(detail.time);
      if (String(detail.state || '').toLowerCase() === 'verified' && detail.context && detailMatchesCurrent(detail) && verifiedTime) {
        integrityVerifiedAt[String(detail.context)] = verifiedTime;
      }
      render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading' });
    }, { passive: true });
    window.addEventListener('guardeer:forexgold-runtime-stability', function () {
      render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading' });
    }, { passive: true });
    window.addEventListener('guardeer:xau-canonical-feed-state', function () {
      render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading' });
    }, { passive: true });
    window.addEventListener('offline', function () { render({ state: 'offline' }); }, { passive: true });
    window.addEventListener('online', function () { beginResume('online'); }, { passive: true });
    window.addEventListener('focus', function () { beginResume('focus'); }, { passive: true });
    window.addEventListener('pageshow', function () { beginResume('pageshow'); }, { passive: true });
    window.addEventListener('guardeer:open-dashboard-chart', function () { beginResume('open-dashboard-chart'); }, { passive: true });
    window.addEventListener('guardeer:terminal-visibility-changed', function () { beginResume('terminal-visibility-changed'); }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) beginResume('visible'); }, { passive: true });
    window.setInterval(function () { render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading' }); }, 15000);

    window.GPMarketDataStatusV119 = {
      version: VERSION,
      refresh: function () { render(lastSourceDetail || window.__gpMarketDataState || { state: 'loading' }); },
      state: function () { return window.__gpMarketDataDisplayState || null; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
