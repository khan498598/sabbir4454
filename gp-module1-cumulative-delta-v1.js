(function () {
  'use strict';

  if (window.__GP_MODULE1_CUMULATIVE_DELTA_V15__) return;
  window.__GP_MODULE1_CUMULATIVE_DELTA_V15__ = true;

  var VERSION = 'r473-module1-binance-canonical-delta-v1';
  var HISTORY_LIMIT = 2400;
  var CANONICAL_VISIBLE_BARS = 96;
  var CANONICAL_HISTORY_REFRESH_MS = 30000;
  var LIVE_PREVIEW_POLL_MS = 4000;
  var BINANCE_DAY_MS = 86400000;
  var BINANCE_EVENT_MAX_AGE_MS = 15000;
  function canonicalRefreshMs(timeframe) {
    var tf = normalizeTimeframe(timeframe);
    if (tf === '1m' || tf === '3m' || tf === '5m') return 15000;
    if (tf === '15m') return 20000;
    return CANONICAL_HISTORY_REFRESH_MS;
  }
  var QUICK_TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h'];
  var KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'BCH', 'TRX', 'SUI', 'PEPE'];
  var STANDALONE = window.__GP_MODULE1_STANDALONE__ === true || document.documentElement.hasAttribute('data-gp-module1-standalone');
  var MULTI_FILTERS = [
    { label: '0-10', min: 0, max: 10, color: '#87ceeb', width: 1 },
    { label: '10-100', min: 10, max: 100, color: '#ff5252', width: 2 },
    { label: '100-500', min: 100, max: 500, color: '#4caf50', width: 3 },
    { label: '500-1000', min: 500, max: 1000, color: '#808080', width: 4 },
    { label: '1000+', min: 1000, max: Infinity, color: '#cd5c5c', width: 5 }
  ];
  var PRESSURE_FILTER_LABELS = ['Very Small', 'Small', 'Medium', 'Large', 'Extreme'];

  var state = {
    open: false,
    overlay: null,
    canvas: null,
    ctx: null,
    resizeObserver: null,
    symbol: 'XAUUSD',
    exchange: 'forexgold',
    timeframe: '1m',
    timeframeLocked: false,
    source: 'Waiting for market data',
    status: 'idle',
    statusTone: 'warn',
    activeView: 1,
    candles: [],
    tickCandles: [],
    priceCandles: [],
    multiCandles: [[], [], [], [], []],
    multiCvd: [0, 0, 0, 0, 0],
    multiThresholds: [],
    cumDelta: 0,
    cumTick: 0,
    buyVolume: 0,
    sellVolume: 0,
    prints: 0,
    lastPrice: 0,
    proxyUnit: 1,
    multiUnit: 1,
    ws: null,
    feedToken: 0,
    reconnectTimer: 0,
    pingTimer: 0,
    pollTimer: 0,
    secureQuoteTimer: 0,
    canonicalHistoryTimer: 0,
    canonicalHistoryBusy: false,
    secureQuoteBusy: false,
    lastVerifiedQuoteAt: 0,
    marketTimer: 0,
    reloadTimer: 0,
    historyRetryTimer: 0,
    renderFrame: 0,
    chromeSyncTimer: 0,
    lastChromeSyncAt: 0,
    loadSeq: 0,
    zoom: 1,
    endOffset: 0,
    historyAnchorTime: 0,
    pendingCanonicalRows: null,
    pendingCanonicalContext: '',
    pendingCanonicalLoadSeq: 0,
    pendingCanonicalCapturedAt: 0,
    pinnedLiveUpdatePending: false,
    hoverIndex: null,
    hoverPanel: null,
    layout: null,
    toastTimer: 0,
    lastRuntimeSignature: '',
    lastHistoryError: '',
    lastIntegrityRefreshAt: 0,
    runtimeFingerprint: '',
    runtimeCanonicalActive: false,
    canonicalDatasetId: '',
    canonicalRevision: '',
    canonicalAlgorithmVersion: '',
    canonicalGeneratedAt: 0,
    canonicalServerTime: 0,
    canonicalActiveBucket: 0,
    canonicalFinalizedThrough: 0,
    lastCanonicalRuntimeAt: 0,
    lastCanonicalEventAt: 0,
    lastAcceptedQuoteEventAt: 0,
    freshHistoryProof: null,
    rejectedQuoteCount: 0,
    renderEnd: null,
    renderCount: 0,
    multiThresholdContext: '',
    appliedHistoryContext: '',
    timeframeRailKey: '',
    binanceRows: [],
    binanceLastEventAt: 0,
    binanceConnectedAt: 0,
    binanceRepairAt: 0,
    binanceRepairBusy: false,
    binanceRepairNeeded: false,
    binanceBlocked: false,
    binanceHistoryController: null
  };

  var queueLauncherMaintenance = function () { ensureLauncher(); };

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function targetOf(event) {
    var target = event && event.target;
    return target && target.nodeType === 1 ? target : target && target.parentElement ? target.parentElement : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function syncZoomControls() {
    var overlay = state.overlay;
    if (!overlay) return;
    var historical = state.endOffset > 0;
    var group = qs('[data-gp-m1cd-zoom-controls]', overlay);
    if (group) group.setAttribute('aria-label', 'Candle zoom ' + Math.round(state.zoom * 100) + ' percent');
    qsa('[data-gp-m1cd-action="zoom-out"]', overlay).forEach(function (button) {
      var disabled = state.zoom <= .6201;
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.setAttribute('aria-pressed', state.zoom < .999 ? 'true' : 'false');
    });
    qsa('[data-gp-m1cd-action="zoom-in"]', overlay).forEach(function (button) {
      var disabled = state.zoom >= 2.2499;
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.setAttribute('aria-pressed', state.zoom > 1.001 ? 'true' : 'false');
    });
    var viewReset = qs('[data-gp-m1cd-action="go-live"]', overlay);
    if (viewReset) {
      viewReset.textContent = historical ? 'GO LIVE / RESET' : 'RESET VIEW';
      viewReset.setAttribute('aria-label', historical ? 'Return to the live edge and reset candle zoom' : 'Reset candle zoom at the live edge');
      viewReset.setAttribute('aria-pressed', historical ? 'true' : 'false');
      viewReset.title = historical ? 'Return to current candles' : 'Reset candle zoom';
    }
    var historyState = qs('[data-gp-m1cd-history-state]', overlay);
    if (historyState) {
      historyState.textContent = historical ? 'HISTORICAL VIEW · ' + state.endOffset + ' BARS BACK · PINNED' : 'LIVE EDGE · DRAG FOR HISTORY';
      historyState.classList.toggle('is-history', historical);
    }
    qsa('[data-gp-m1cd-view] em', overlay).forEach(function (label) {
      label.textContent = historical ? 'History' : 'Live';
    });
  }

  function setChartZoom(nextZoom) {
    var next = clamp(number(nextZoom, state.zoom), .62, 2.25);
    if (Math.abs(next - state.zoom) < .0001) return false;
    state.zoom = next;
    state.hoverIndex = null;
    state.hoverPanel = null;
    syncZoomControls();
    scheduleRender();
    return true;
  }

  function setEndOffset(nextOffset) {
    var length = synchronizedHistoryLength();
    var visibleCount = clamp(Math.round(number(state.renderCount, 1)), 1, Math.max(1, length));
    var next = clamp(Math.round(number(nextOffset)), 0, Math.max(0, length - visibleCount));
    if (next === state.endOffset) return false;
    state.endOffset = next;
    state.historyAnchorTime = next > 0 ? historyAnchorAtOffset(next) : 0;
    if (!next) resumeDeferredLiveHistory();
    state.hoverIndex = null;
    state.hoverPanel = null;
    syncZoomControls();
    scheduleRender();
    return true;
  }

  function resetViewport() {
    var changed = state.endOffset !== 0 || Math.abs(state.zoom - 1) > .0001 || state.renderEnd != null || Boolean(state.pendingCanonicalRows);
    state.endOffset = 0;
    state.historyAnchorTime = 0;
    state.zoom = 1;
    state.renderEnd = null;
    state.renderCount = 0;
    state.hoverIndex = null;
    state.hoverPanel = null;
    if (!resumeDeferredLiveHistory()) {
      syncZoomControls();
      scheduleRender();
    }
    return changed;
  }

  function synchronizedHistoryLength() {
    var lengths = [state.candles.length, state.tickCandles.length, state.priceCandles.length].filter(function (length) {
      return length > 0;
    });
    return lengths.length ? Math.min.apply(Math, lengths) : 0;
  }

  function historyReferenceRows() {
    return state.priceCandles.length ? state.priceCandles : state.candles.length ? state.candles : state.tickCandles;
  }

  function historyAnchorAtOffset(offset) {
    var rows = historyReferenceRows();
    var length = Math.min(synchronizedHistoryLength(), rows.length);
    if (!length || !(offset > 0)) return 0;
    var visibleCount = clamp(Math.round(number(state.renderCount, 1)), 1, length);
    var end = clamp(length - Math.round(number(offset)), visibleCount, length);
    return number(rows[end - 1] && rows[end - 1].time);
  }

  function restoreHistoricalViewport(anchorTime) {
    var anchor = number(anchorTime);
    var rows = historyReferenceRows();
    var length = Math.min(synchronizedHistoryLength(), rows.length);
    if (!(anchor > 0) || !length) return false;
    var index = -1;
    for (var cursor = length - 1; cursor >= 0; cursor -= 1) {
      if (number(rows[cursor] && rows[cursor].time) <= anchor) {
        index = cursor;
        break;
      }
    }
    if (index < 0) index = 0;
    var visibleCount = clamp(Math.round(number(state.renderCount, 1)), 1, length);
    var end = clamp(index + 1, visibleCount, length);
    state.endOffset = Math.max(0, length - end);
    state.historyAnchorTime = number(rows[end - 1] && rows[end - 1].time, anchor);
    return true;
  }

  function historyContextKey() {
    return cleanSymbol(state.symbol) + '|' + cleanExchange(state.exchange) + '|' + normalizeTimeframe(state.timeframe);
  }

  function clearPendingCanonicalHistory() {
    state.pendingCanonicalRows = null;
    state.pendingCanonicalContext = '';
    state.pendingCanonicalLoadSeq = 0;
    state.pendingCanonicalCapturedAt = 0;
  }

  function queuePendingCanonicalHistory(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    state.pendingCanonicalRows = rows.map(function (row) { return Object.assign({}, row); });
    state.pendingCanonicalContext = historyContextKey();
    state.pendingCanonicalLoadSeq = state.loadSeq;
    state.pendingCanonicalCapturedAt = Date.now();
    return true;
  }

  function flushPendingCanonicalHistory() {
    var pendingRows = state.pendingCanonicalRows;
    var pendingContext = state.pendingCanonicalContext;
    var pendingLoadSeq = state.pendingCanonicalLoadSeq;
    var pendingCapturedAt = state.pendingCanonicalCapturedAt;
    var currentRows = runtimeRows(state.timeframe);
    var currentContext = historyContextKey();
    var validPending = Array.isArray(pendingRows) && pendingRows.length &&
      pendingContext === currentContext && pendingLoadSeq === state.loadSeq && number(pendingCapturedAt) > 0;
    var currentFingerprint = currentRows.length >= 2 ? runtimeRowsFingerprint(currentRows) : '';
    var currentAdvanced = currentFingerprint && state.runtimeFingerprint && currentFingerprint !== state.runtimeFingerprint;
    var currentLastTime = currentRows.length ? number(currentRows[currentRows.length - 1].time) : 0;
    var pendingLastTime = validPending ? number(pendingRows[pendingRows.length - 1].time) : 0;
    var preferCurrent = currentRows.length >= 2 && (!validPending || currentAdvanced || currentLastTime > pendingLastTime);
    var rows = preferCurrent ? currentRows : pendingRows;
    clearPendingCanonicalHistory();
    if ((!currentRows.length && !validPending) || !Array.isArray(rows) || !rows.length) return false;
    // Canonical Forex/Gold rows were already freshness-checked by the server.
    // Never re-decide their validity against an individual browser clock when
    // the user returns from a historical viewport.
    applyHistory(rows);
    if (preferCurrent) {
      state.runtimeCanonicalActive = true;
      state.runtimeFingerprint = runtimeRowsFingerprint(currentRows);
      markCanonicalRuntimeUpdate();
    }
    return true;
  }

  function resumeDeferredLiveHistory() {
    var hadDeferredUpdate = Boolean(state.pendingCanonicalRows) || state.pinnedLiveUpdatePending;
    var applied = hadDeferredUpdate && flushPendingCanonicalHistory();
    state.pinnedLiveUpdatePending = false;
    if (hadDeferredUpdate && !applied) {
      window.setTimeout(function () {
        if (state.open && state.endOffset === 0) reloadData('go-live');
      }, 0);
    }
    return applied;
  }

  function applyAuthoritativeHistory(rows) {
    rows = Array.isArray(rows) ? rows : [];
    if (state.endOffset > 0) return queuePendingCanonicalHistory(rows);
    clearPendingCanonicalHistory();
    applyHistory(rows);
    return true;
  }

  function viewportFor(length, count) {
    count = Math.min(Math.max(0, length), Math.max(0, count));
    var end = clamp(length - Math.round(state.endOffset), count, length);
    if (state.endOffset > 0 && number(state.historyAnchorTime) > 0) {
      var rows = historyReferenceRows();
      var referenceLength = Math.min(length, rows.length);
      for (var index = referenceLength - 1; index >= 0; index -= 1) {
        if (number(rows[index] && rows[index].time) <= number(state.historyAnchorTime)) {
          end = index + 1;
          break;
        }
      }
      count = Math.min(count, end);
    }
    return { start: Math.max(0, end - count), end: end, count: count };
  }

  function visibleSlice(rows, start) {
    rows = Array.isArray(rows) ? rows : [];
    var end = state.renderEnd == null ? rows.length : Math.min(rows.length, state.renderEnd);
    return rows.slice(start, end);
  }

  function canonicalVisibleCount(length) {
    var requested = Math.round(CANONICAL_VISIBLE_BARS / Math.max(.62, number(state.zoom, 1)));
    return Math.min(Math.max(0, number(length)), clamp(requested, 42, 155));
  }

  function zoomChart(direction) {
    return setChartZoom(state.zoom + (direction > 0 ? .18 : -.18));
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
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
    return text || 'binance';
  }

  function normalizeTimeframe(value) {
    var text = String(value || '1m').trim();
    if (/^\d+$/.test(text)) text += 'm';
    if (text === 'D' || text === '1D') text = '1d';
    if (text === 'H' || text === '1H') text = '1h';
    if (text === 'M') text = '1M';
    if (!/^\d+[mhdwM]$/.test(text)) return '1m';
    return text;
  }

  function timeframeMs(value) {
    var text = normalizeTimeframe(value);
    var amount = parseInt(text, 10) || 1;
    if (text.slice(-1) === 'm') return amount * 60000;
    if (text.slice(-1) === 'h') return amount * 3600000;
    if (text.slice(-1) === 'd') return amount * 86400000;
    if (text.slice(-1) === 'w') return amount * 604800000;
    if (text.slice(-1) === 'M') return amount * 2592000000;
    return 60000;
  }

  function freshnessVerifierR390() {
    return window.GPForexGoldDataFreshnessR390 || null;
  }

  function requireFreshHistoryR390(rows, timeframe, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.assertFreshHistory !== 'function') {
      var unavailable = new Error('Forex/Gold freshness verifier is unavailable.');
      unavailable.code = 'FRESHNESS_VERIFIER_UNAVAILABLE';
      throw unavailable;
    }
    return verifier.assertFreshHistory(rows, timeframe, source);
  }

  function freshHistoryInspectionR390(rows, timeframe) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.inspectHistory !== 'function') {
      return { ok: false, reason: 'freshness-verifier-unavailable' };
    }
    return verifier.inspectHistory(rows, timeframe);
  }

  function verifiedQuoteResultR390(row, price, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.quoteResult !== 'function') {
      return { price: number(price), source: source, fresh: false, time: 0, freshnessReason: 'freshness-verifier-unavailable' };
    }
    var result = verifier.quoteResult(row, price, source);
    if (result && result.fresh === true && number(result.time) > 0) result.providerTimestampVerified = true;
    return result;
  }

  function freshnessContextR390(symbol, exchange, timeframe) {
    return [cleanExchange(exchange), cleanSymbol(symbol), normalizeTimeframe(timeframe)].join(':');
  }

  function rememberFreshHistoryProofR390(rows, timeframe, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.historyProof !== 'function') {
      state.freshHistoryProof = null;
      return null;
    }
    state.freshHistoryProof = verifier.historyProof(
      rows,
      timeframe,
      freshnessContextR390(state.symbol, state.exchange, timeframe),
      source
    );
    return state.freshHistoryProof;
  }

  function requireFreshQuoteR390(result, source) {
    var verifier = freshnessVerifierR390();
    if (verifier && typeof verifier.assertFreshQuote === 'function') {
      return verifier.assertFreshQuote(result, source);
    }
    var error = new Error('Forex/Gold quote freshness verifier is unavailable.');
    error.code = 'FRESHNESS_VERIFIER_UNAVAILABLE';
    throw error;
  }

  function responseTimeQuoteFallbackR390(result, symbol, exchange, timeframe, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.responseTimeFallback !== 'function') return null;
    return verifier.responseTimeFallback(
      result,
      state.freshHistoryProof,
      freshnessContextR390(symbol, exchange, timeframe),
      source
    );
  }

  function isClosedCandle(row, timeframe, now) {
    var openedAt = number(row && row.time);
    var checkedAt = number(now, Date.now());
    var interval = timeframeMs(timeframe);
    var openedBucket = Math.floor(openedAt / interval) * interval;
    var currentBucket = Math.floor(checkedAt / interval) * interval;
    return openedAt > 0 && openedBucket < currentBucket;
  }

  function confirmedSwingMarker(rows, index, timeframe, now) {
    rows = Array.isArray(rows) ? rows : [];
    index = Math.round(number(index, -1));
    if (index <= 0 || index >= rows.length - 1) return null;
    var previous = rows[index - 1];
    var candle = rows[index];
    var next = rows[index + 1];
    if (!previous || !candle || !next ||
        !isClosedCandle(previous, timeframe, now) ||
        !isClosedCandle(candle, timeframe, now) ||
        !isClosedCandle(next, timeframe, now)) return null;
    var values = [previous.high, previous.low, candle.high, candle.low, next.high, next.low].map(Number);
    if (!values.every(Number.isFinite)) return null;
    var high = candle.high >= previous.high && candle.high > next.high;
    var low = candle.low <= previous.low && candle.low < next.low;
    return high || low ? { high: high, low: low } : null;
  }

  function runtime() {
    try {
      var root = window.GuardeerPrimeRuntime || null;
      return root && (root.runtime || root);
    } catch (_) {
      return null;
    }
  }

  function config() {
    return window.GUARDEER_CONFIG || {};
  }

  function freshTimestamp(value) {
    var timestamp = number(value);
    if (!(timestamp > 0) && typeof value === 'string') timestamp = Date.parse(value);
    if (timestamp > 0 && timestamp < 100000000000) timestamp *= 1000;
    var age = Date.now() - timestamp;
    return timestamp > 0 && age >= 0 && age < 15000 ? timestamp : 0;
  }

  function quoteEventTime(quote) {
    var verified = quote && quote.fresh === true ? freshTimestamp(quote.time) : 0;
    return verified || Date.now();
  }

  function trustedForexGoldEventTime(quote) {
    quote = quote || {};
    var timestamp = number(quote.time);
    if (!(timestamp > 0) && typeof quote.time === 'string') timestamp = Date.parse(quote.time);
    if (timestamp > 0 && timestamp < 100000000000) timestamp *= 1000;
    var now = Date.now();
    var age = now - timestamp;
    var providerVerified = quote.providerTimestampVerified === true && age >= -60000 && age <= 120000;
    var responseVerified = quote.responseTimeFallback === true && age >= 0 && age < 15000;
    return providerVerified || responseVerified ? Math.min(timestamp, now) : 0;
  }

  function runtimeMarketMatches(rt) {
    try {
      var identity = rt && typeof rt.getMarketIdentity === 'function' ? rt.getMarketIdentity() : rt && rt.state || {};
      if (!identity || !identity.symbol) return false;
      var symbol = cleanSymbol(identity.symbol);
      var exchange = cleanExchange(identity.exchange || identity.market || identity.provider);
      var timeframe = normalizeTimeframe(identity.timeframe || state.timeframe);
      return symbol === cleanSymbol(state.symbol) && exchange === cleanExchange(state.exchange) && timeframe === normalizeTimeframe(state.timeframe);
    } catch (_) { return false; }
  }

  function freshRuntimeQuoteTimestamp(rt) {
    var runtimeState = rt && rt.state || {};
    var quote = runtimeState.quote || runtimeState.lastQuote || runtimeState.forexQuote || {};
    var values = [runtimeState.quoteTime, runtimeState.quoteUpdatedAt, runtimeState.lastQuoteAt, runtimeState.lastPriceAt, runtimeState.priceUpdatedAt, runtimeState.lastEventAt, runtimeState.lastUpdateAt, runtimeState.updatedAt, quote.time, quote.timestamp, quote.updatedAt, quote.eventTime];
    for (var index = 0; index < values.length; index += 1) {
      var timestamp = freshTimestamp(values[index]);
      if (timestamp) return timestamp;
    }
    return 0;
  }

  function markCanonicalRuntimeUpdate() {
    state.lastCanonicalRuntimeAt = Date.now();
    var eventTime = freshRuntimeQuoteTimestamp(runtime());
    if (eventTime > 0) state.lastCanonicalEventAt = Math.max(number(state.lastCanonicalEventAt), eventTime);
  }

  function chartTimeZone() {
    var zone = String(config().PRIME_CHART_TIMEZONE || 'Asia/Kolkata').trim();
    return zone || 'Asia/Kolkata';
  }

  function chartTimeZoneLabel() {
    var label = String(config().PRIME_CHART_TIMEZONE_LABEL || 'IST').trim();
    return label || 'IST';
  }

  function readMarket() {
    var rt = runtime();
    var rtState = rt && rt.state || {};
    var symbolNode = qs('#symbol-label,[data-symbol-label],.symbol-display,#gp-overview-symbol');
    var symbol = cleanSymbol(rtState.symbol || (symbolNode && symbolNode.textContent) || state.symbol || 'XAUUSD');
    var exchangeHint = rtState.exchange || rtState.market || rtState.provider || '';
    var exchange = cleanExchange(exchangeHint || state.exchange || '');
    if (!exchangeHint && (/(USDT|USDC|BUSD)$/.test(symbol) || (/USD$/.test(symbol) && KNOWN_CRYPTO.indexOf(symbol.slice(0, -3)) >= 0))) {
      exchange = 'binance';
    }
    if (!exchange || exchange === 'binance') {
      if (symbol === 'XAUUSD' || symbol === 'XAGUSD' || (/^[A-Z]{6}$/.test(symbol) && !/(USDT|USDC)$/.test(symbol))) exchange = 'forexgold';
    }
    var tfNode = qs('.timeframe-btn.active,[data-tf].active,#timeframe-select,#header-timeframe-select,[data-timeframe-select]');
    var tfValue = rtState.timeframe || (tfNode && (tfNode.value || tfNode.getAttribute('data-tf') || tfNode.textContent)) || state.timeframe || '1m';
    return {
      symbol: symbol || 'XAUUSD',
      exchange: exchange || 'forexgold',
      timeframe: normalizeTimeframe(tfValue)
    };
  }

  function isCryptoMarket(symbol, exchange) {
    symbol = cleanSymbol(symbol);
    exchange = cleanExchange(exchange);
    if (exchange === 'forexgold') return false;
    if (/(USDT|USDC|BUSD|BTC|ETH)$/.test(symbol) && symbol.length > 5) return true;
    if (/USD$/.test(symbol) && KNOWN_CRYPTO.indexOf(symbol.slice(0, -3)) >= 0) return true;
    return KNOWN_CRYPTO.indexOf(symbol) >= 0;
  }

  function isBinanceCryptoMarket(symbol, exchange) {
    return cleanExchange(exchange) === 'binance' &&
      ['BTCUSD', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'].indexOf(cleanSymbol(symbol)) >= 0;
  }

  function usesPricePressure() {
    return !isCryptoMarket(state.symbol, state.exchange);
  }

  function usesBinanceKlines() {
    return isBinanceCryptoMarket(state.symbol, state.exchange);
  }

  function pricePressureStep(symbol) {
    symbol = cleanSymbol(symbol);
    if (symbol === 'XAUUSD') return .01;
    if (symbol === 'XAGUSD') return .001;
    if (symbol.indexOf('JPY') >= 0) return .001;
    return .00001;
  }

  function forexGoldPriceMetrics(previousPrice, nextPrice, symbol) {
    var previous = number(previousPrice);
    var next = number(nextPrice);
    if (!(previous > 0) || !(next > 0) || previous === next) {
      return { pressure: 0, direction: 0, magnitude: 0 };
    }
    var direction = next > previous ? 1 : -1;
    var magnitude = Math.abs(next - previous) / pricePressureStep(symbol);
    return {
      pressure: direction * magnitude,
      direction: direction,
      magnitude: magnitude
    };
  }

  function medianValue(values, fallback) {
    var sorted = (Array.isArray(values) ? values : []).map(function (value) {
      return number(value);
    }).filter(function (value) {
      return value > 0;
    }).sort(function (a, b) {
      return a - b;
    });
    if (!sorted.length) return number(fallback, 0);
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function ohlcRange(open, high, low, close, symbol) {
    var safeOpen = number(open);
    var safeClose = number(close);
    var safeHigh = Math.max(number(high), safeOpen, safeClose);
    var safeLow = Math.min(number(low), safeOpen, safeClose);
    return Math.max(safeHigh - safeLow, pricePressureStep(symbol));
  }

  function recentRangeBaseline(ranges, fallback) {
    return medianValue((Array.isArray(ranges) ? ranges : []).slice(-20), fallback);
  }

  function forexGoldOhlcPressureMetrics(open, high, low, close, symbol, baselineRange) {
    var safeOpen = number(open);
    var safeClose = number(close);
    var safeHigh = Math.max(number(high), safeOpen, safeClose);
    var safeLow = Math.min(number(low), safeOpen, safeClose);
    if (!(safeOpen > 0) || !(safeClose > 0) || !(safeHigh > 0) || !(safeLow > 0)) {
      return { pressure: 0, direction: 0, magnitude: 0, range: 0, structure: 0, activity: 1 };
    }

    var range = Math.max(safeHigh - safeLow, pricePressureStep(symbol));
    var bodyBias = clamp((safeClose - safeOpen) / range, -1, 1);
    var closeLocation = clamp((2 * safeClose - safeHigh - safeLow) / range, -1, 1);
    var upperWick = Math.max(0, safeHigh - Math.max(safeOpen, safeClose));
    var lowerWick = Math.max(0, Math.min(safeOpen, safeClose) - safeLow);
    var rejectionBias = clamp((lowerWick - upperWick) / range, -1, 1);
    var structure = clamp(.50 * bodyBias + .30 * closeLocation + .20 * rejectionBias, -1, 1);
    var baseline = number(baselineRange);
    if (!(baseline > 0)) baseline = range;
    var activity = Math.sqrt(clamp(range / baseline, .25, 4));
    var pressure = 100 * structure * activity;
    if (Math.abs(pressure) < .000000001) pressure = 0;
    return {
      pressure: pressure,
      direction: pressure > 0 ? 1 : pressure < 0 ? -1 : 0,
      magnitude: Math.abs(pressure),
      range: range,
      structure: structure,
      activity: activity
    };
  }

  function completedPriceRangeBaseline(candles, activeCandle, symbol) {
    var rows = Array.isArray(candles) ? candles : [];
    var ranges = [];
    for (var index = Math.max(0, rows.length - 21); index < rows.length; index += 1) {
      var row = rows[index];
      if (!row || row === activeCandle) continue;
      var open = number(row.open);
      var high = number(row.high);
      var low = number(row.low);
      var close = number(row.close);
      if (!(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) continue;
      ranges.push(ohlcRange(open, high, low, close, symbol));
    }
    var fallback = activeCandle
      ? ohlcRange(activeCandle.open, activeCandle.high, activeCandle.low, activeCandle.close, symbol)
      : pricePressureStep(symbol);
    return recentRangeBaseline(ranges, fallback);
  }

  function binanceSymbol(symbol) {
    symbol = cleanSymbol(symbol).replace(/^XBT/, 'BTC');
    if (/USDT$/.test(symbol)) return symbol;
    if (/USDC$/.test(symbol)) return symbol.slice(0, -4) + 'USDT';
    if (/USD$/.test(symbol)) return symbol.slice(0, -3) + 'USDT';
    if (KNOWN_CRYPTO.indexOf(symbol) >= 0) return symbol + 'USDT';
    return symbol;
  }

  function okxSymbol(symbol) {
    var value = binanceSymbol(symbol);
    return value.replace(/USDT$/, '-USDT');
  }

  function binanceInterval(tf) {
    var value = normalizeTimeframe(tf);
    var supported = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    return supported.indexOf(value) >= 0 ? value : '1m';
  }

  function bybitInterval(tf) {
    return ({
      '1m': '1',
      '3m': '3',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '6h': '360',
      '12h': '720',
      '1d': 'D',
      '1w': 'W',
      '1M': 'M'
    })[normalizeTimeframe(tf)] || '1';
  }

  function okxInterval(tf) {
    return ({
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1H',
      '2h': '2H',
      '4h': '4H',
      '6h': '6H',
      '12h': '12H',
      '1d': '1D',
      '1w': '1W',
      '1M': '1M'
    })[normalizeTimeframe(tf)] || '1m';
  }

  function formatValue(value) {
    value = number(value);
    var absolute = Math.abs(value);
    var sign = value < 0 ? '-' : '';
    if (absolute >= 1000000000) return sign + (absolute / 1000000000).toFixed(2) + 'B';
    if (absolute >= 1000000) return sign + (absolute / 1000000).toFixed(2) + 'M';
    if (absolute >= 1000) return sign + (absolute / 1000).toFixed(2) + 'K';
    if (absolute >= 100) return sign + absolute.toFixed(0);
    if (absolute >= 10) return sign + absolute.toFixed(1);
    return sign + absolute.toFixed(2);
  }

  function formatTime(value, withSeconds) {
    var date = new Date(number(value));
    if (!Number.isFinite(date.getTime())) return '--:--';
    try {
      return date.toLocaleTimeString('en-GB', {
        timeZone: chartTimeZone(),
        hour: '2-digit',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: false
      }) + ' ' + chartTimeZoneLabel();
    } catch (_) {
      return date.toISOString().slice(11, withSeconds ? 19 : 16) + ' ' + chartTimeZoneLabel();
    }
  }

  function formatTooltipDateTime(value) {
    var date = new Date(number(value));
    if (!Number.isFinite(date.getTime())) return '-- --- ---- · --:--:--';
    try {
      var formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: chartTimeZone(),
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).format(date).replace(',', ' ·');
      return formatted + ' ' + chartTimeZoneLabel();
    } catch (_) {
      var offset = chartTimeZoneLabel() === 'IST' ? 330 : 0;
      var fallback = new Date(date.getTime() + offset * 60000).toISOString();
      return fallback.slice(8, 10) + ' ' + fallback.slice(5, 7) + ' ' + fallback.slice(0, 4) + ' · ' + fallback.slice(11, 19) + ' ' + chartTimeZoneLabel();
    }
  }

  function panelLayout(id, rect, tooltip) {
    return {
      id: id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      tooltip: tooltip !== false
    };
  }

  function activeHoverPanel() {
    var panels = state.layout && Array.isArray(state.layout.panels) ? state.layout.panels : [];
    for (var index = 0; index < panels.length; index += 1) {
      if (panels[index].id === state.hoverPanel) return panels[index];
    }
    return null;
  }

  function crosshairBoxWidth(preferred, plot) {
    return Math.max(88, Math.min(preferred, Math.max(88, plot.width - 8)));
  }

  function crosshairBoxX(x, width, plot, offset) {
    offset = offset || 12;
    var next = x + offset;
    if (next + width > plot.x + plot.width - 4) next = x - width - offset;
    return clamp(next, plot.x + 4, Math.max(plot.x + 4, plot.x + plot.width - width - 4));
  }

  function crosshairBoxY(panel, height, preferredOffset) {
    if (!panel || panel.tooltip === false || panel.height < height + 8) return null;
    return clamp(panel.y + (preferredOffset || 28), panel.y + 4, panel.y + panel.height - height - 4);
  }

  function tooltipDateTimeParts(value) {
    var formatted = formatTooltipDateTime(value);
    var separatorAt = formatted.indexOf(' · ');
    return {
      date: separatorAt >= 0 ? formatted.slice(0, separatorAt) : formatted,
      time: separatorAt >= 0 ? formatted.slice(separatorAt + 3) : ''
    };
  }

  function drawCompactCrosshairTooltip(ctx, panel, plot, x, time, primaryLine, primaryColor, background, border) {
    if (!panel || panel.tooltip === false || panel.height < 44) return false;
    var parts = tooltipDateTimeParts(time);
    var symbolLine = state.symbol + ' · ' + state.timeframe;
    var availableWidth = Math.max(80, plot.width - 8);
    var fontSize = 7;
    ctx.save();
    ctx.font = '900 ' + fontSize + 'px "JetBrains Mono", monospace';
    var combinedLine = parts.time + ' · ' + symbolLine;
    var lines = [parts.date, combinedLine];
    var hasPrimary = panel.height >= 58 && Boolean(primaryLine);
    if (hasPrimary) lines.push(primaryLine);
    var measured = lines.reduce(function (maximum, line) {
      return Math.max(maximum, ctx.measureText(line).width);
    }, 0);
    if (measured + 16 > availableWidth && panel.height >= 72) {
      lines = [parts.date, parts.time, symbolLine];
      if (primaryLine) lines.push(primaryLine);
      hasPrimary = Boolean(primaryLine);
      measured = lines.reduce(function (maximum, line) {
        return Math.max(maximum, ctx.measureText(line).width);
      }, 0);
    }
    if (measured + 16 > availableWidth) {
      fontSize = 6;
      ctx.font = '900 ' + fontSize + 'px "JetBrains Mono", monospace';
      measured = lines.reduce(function (maximum, line) {
        return Math.max(maximum, ctx.measureText(line).width);
      }, 0);
    }
    var boxHeight = lines.length >= 4 ? 64 : (lines.length === 3 ? 50 : 36);
    var boxY = crosshairBoxY(panel, boxHeight, 4);
    if (boxY == null) {
      ctx.restore();
      return false;
    }
    var boxWidth = crosshairBoxWidth(Math.ceil(measured) + 16, plot);
    var boxX = crosshairBoxX(x, boxWidth, plot, 10);
    ctx.fillStyle = background || 'rgba(5,9,10,.96)';
    ctx.strokeStyle = border || 'rgba(36,230,210,.42)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach(function (line, lineIndex) {
      ctx.fillStyle = hasPrimary && lineIndex === lines.length - 1 ? primaryColor : '#fff';
      ctx.fillText(line, boxX + 8, boxY + 5 + lineIndex * 14);
    });
    ctx.restore();
    return true;
  }

  function clearHover(schedule) {
    var changed = state.hoverIndex != null || state.hoverPanel != null;
    state.hoverIndex = null;
    state.hoverPanel = null;
    if (changed && schedule !== false) scheduleRender();
    return changed;
  }

  function centerActiveTimeframe(overlay) {
    var rail = qs('.gp-m1cd-timeframes', overlay);
    var active = qs('[data-gp-m1cd-tf].is-active', rail);
    if (!rail || !active) return;
    window.requestAnimationFrame(function () {
      if (!state.open || !rail.isConnected || !active.isConnected) return;
      var key = state.timeframe + '|' + Math.round(number(rail.clientWidth));
      if (state.timeframeRailKey === key) return;
      state.timeframeRailKey = key;
      var target = number(active.offsetLeft) - Math.max(0, number(rail.clientWidth) - number(active.offsetWidth)) / 2;
      rail.scrollLeft = clamp(Math.round(target), 0, Math.max(0, number(rail.scrollWidth) - number(rail.clientWidth)));
    });
  }

  function moduleHtml() {
    var tfHtml = QUICK_TIMEFRAMES.map(function (tf) {
      return '<button type="button" class="gp-m1cd-tf" data-gp-m1cd-tf="' + tf + '">' + tf + '</button>';
    }).join('');
    return [
      '<div class="gp-m1cd-window" role="dialog" aria-modal="true" aria-label="MODULE-1 Cumulative Delta">',
      '  <header class="gp-m1cd-head">',
      '    <div class="gp-m1cd-mark" aria-hidden="true">Δ</div>',
      '    <div class="gp-m1cd-title"><strong data-gp-m1cd-module-title>MODULE-1 · Cumulative Delta</strong><span data-gp-m1cd-module-subtitle>Five distinct professional views · Tools 01-05 live</span></div>',
      '    <div class="gp-m1cd-head-status">',
      '      <span class="gp-m1cd-badge" data-gp-m1cd-source>MARKET FEED</span>',
      '      <span class="gp-m1cd-badge" data-gp-m1cd-status data-tone="warn"><i></i><b>CONNECTING</b></span>',
      '      <button type="button" class="gp-m1cd-icon-btn" data-gp-m1cd-action="maximize" aria-label="Maximize">□</button>',
      '      <button type="button" class="gp-m1cd-icon-btn" data-gp-m1cd-action="close" aria-label="Close">×</button>',
      '    </div>',
      '  </header>',
      '  <div class="gp-m1cd-shell">',
      '    <aside class="gp-m1cd-nav" aria-label="Cumulative Delta tools">',
      '      <span class="gp-m1cd-nav-label">Module tools</span>',
      '      <button type="button" class="gp-m1cd-tool is-active" data-gp-m1cd-view="1"><b>01</b><span><strong data-gp-m1cd-tool1-title>Cumulative Delta Bars</strong><small data-gp-m1cd-tool1-subtitle>Volume + Up/Down Tick</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m1cd-tool" data-gp-m1cd-view="2"><b>02</b><span><strong data-gp-m1cd-tool2-title>Delta &amp; Volume Stack</strong><small data-gp-m1cd-tool2-subtitle>Price + CVD + Volume + Difference</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m1cd-tool" data-gp-m1cd-view="3"><b>03</b><span><strong data-gp-m1cd-tool3-title>Cumulative Trades</strong><small data-gp-m1cd-tool3-subtitle>Trade blocks + CVD histogram</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m1cd-tool" data-gp-m1cd-view="4"><b>04</b><span><strong data-gp-m1cd-tool4-title>Ask/Bid Difference</strong><small data-gp-m1cd-tool4-subtitle>Focused pressure histogram</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m1cd-tool" data-gp-m1cd-view="5"><b>05</b><span><strong data-gp-m1cd-tool5-title>Multi-Market CVD</strong><small data-gp-m1cd-tool5-subtitle>Five volume-filtered CVD lines</small></span><em>Live</em></button>',
      '    </aside>',
      '    <main class="gp-m1cd-stage">',
      '      <div class="gp-m1cd-toolbar">',
      '        <div class="gp-m1cd-zoom-controls" data-gp-m1cd-zoom-controls role="group" aria-label="Candle zoom 100 percent">',
      '          <button type="button" class="gp-m1cd-zoom-btn" data-gp-m1cd-action="zoom-out" aria-label="Show more loaded candles" title="Show more loaded candles">−</button>',
      '          <button type="button" class="gp-m1cd-zoom-btn" data-gp-m1cd-action="zoom-in" aria-label="Show fewer candles in greater detail" title="Show fewer candles in greater detail">+</button>',
      '        </div>',
      '        <div class="gp-m1cd-market"><strong data-gp-m1cd-symbol>XAUUSD</strong><span data-gp-m1cd-exchange>FOREXGOLD</span></div>',
      '        <div class="gp-m1cd-timeframes" aria-label="Timeframe">' + tfHtml + '</div>',
      '        <div class="gp-m1cd-toolbar-spacer"></div>',
      '        <button type="button" class="gp-m1cd-btn" data-gp-m1cd-action="go-live">Reset view</button>',
      '        <button type="button" class="gp-m1cd-btn" data-gp-m1cd-action="reconnect">Reconnect</button>',
      '      </div>',
      '      <div class="gp-m1cd-chart-wrap">',
      '        <canvas id="gp-m1cd-canvas" aria-label="Cumulative Delta Bars chart"></canvas>',
      '        <div class="gp-m1cd-history-state" data-gp-m1cd-history-state>LIVE EDGE · DRAG FOR HISTORY</div>',
      '        <div class="gp-m1cd-empty" data-gp-m1cd-empty>Waiting for terminal market data...</div>',
      '        <div class="gp-m1cd-toast" data-gp-m1cd-toast></div>',
      '      </div>',
      '      <div class="gp-m1cd-metrics">',
      '        <div class="gp-m1cd-metric"><span data-gp-m1cd-metric-label="cvd">Session CVD</span><strong data-gp-m1cd-metric="cvd">0</strong></div>',
      '        <div class="gp-m1cd-metric"><span data-gp-m1cd-metric-label="tick">Up/Down CVD</span><strong data-gp-m1cd-metric="tick">0</strong></div>',
      '        <div class="gp-m1cd-metric"><span data-gp-m1cd-metric-label="buy">Buy volume</span><strong data-gp-m1cd-metric="buy">0</strong></div>',
      '        <div class="gp-m1cd-metric"><span data-gp-m1cd-metric-label="sell">Sell volume</span><strong data-gp-m1cd-metric="sell">0</strong></div>',
      '        <div class="gp-m1cd-metric"><span data-gp-m1cd-metric-label="ratio">Buy/Sell ratio</span><strong data-gp-m1cd-metric="ratio">0.00</strong></div>',
      '        <div class="gp-m1cd-metric"><span data-gp-m1cd-metric-label="prints">Trades / ticks</span><strong data-gp-m1cd-metric="prints">0</strong></div>',
      '      </div>',
      '    </main>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function ensureOverlay() {
    var overlay = state.overlay || qs('#gp-module1-cumulative-delta');
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'gp-module1-cumulative-delta';
    overlay.className = 'gp-m1cd-overlay';
    overlay.innerHTML = moduleHtml();
    document.body.appendChild(overlay);
    state.overlay = overlay;
    state.canvas = qs('#gp-m1cd-canvas', overlay);
    state.ctx = state.canvas && state.canvas.getContext('2d');
    bindCanvas(state.canvas);
    if (window.ResizeObserver && state.canvas) {
      state.resizeObserver = new ResizeObserver(function () {
        clearHover(false);
        resizeCanvas();
        scheduleRender();
      });
      state.resizeObserver.observe(state.canvas);
    }
    syncChrome();
    return overlay;
  }

  function ensureLauncher() {
    var grid = qs('#gp-step44-prime-tools-popover .gp-step44-prime-tools-popover__grid');
    if (!grid) return null;
    var button = qs('[data-gp-module1-open]', grid);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'gp-step44-prime-tools-action gp-module1-prime-card';
      button.setAttribute('data-gp-module1-open', 'true');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'gp-module1-cumulative-delta');
      button.innerHTML = '<span>M1</span><div><strong data-gp-module1-launcher-title>MODULE-1 Cumulative Delta</strong><small data-gp-module1-launcher-subtitle>Five distinct professional tools in one live workspace.</small></div><em>Open</em>';
      grid.insertBefore(button, grid.firstChild);
    }
    var launcherTitle = qs('[data-gp-module1-launcher-title]', button);
    var launcherSubtitle = qs('[data-gp-module1-launcher-subtitle]', button);
    var launcherMarket = readMarket();
    var launcherPressureMode = !isCryptoMarket(launcherMarket.symbol, launcherMarket.exchange);
    var titleText = launcherPressureMode ? 'MODULE-1 Price Pressure' : 'MODULE-1 Cumulative Delta';
    var subtitleText = launcherPressureMode ? 'Five distinct quote-derived price-pressure tools in one live workspace.' : 'Five distinct professional delta tools in one live workspace.';
    // textContent replaces a text node even when the value is unchanged. Because
    // the launcher is maintained by a childList MutationObserver, unconditional
    // writes created a self-sustaining microtask loop as soon as PRIME Tools was
    // opened. Keep the launcher fully idempotent so its own sync never produces
    // another observed mutation.
    if (launcherTitle && launcherTitle.textContent !== titleText) launcherTitle.textContent = titleText;
    if (launcherSubtitle && launcherSubtitle.textContent !== subtitleText) launcherSubtitle.textContent = subtitleText;
    button.classList.toggle('is-active', state.open);
    var pressed = state.open ? 'true' : 'false';
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    return button;
  }

  function closePrimeToolsPopover() {
    var pop = qs('#gp-step44-prime-tools-popover');
    if (pop) pop.classList.remove('is-open', 'is-dragging');
    document.body.classList.remove('gp-step44-prime-tools-open');
    var button = qs('[data-gp-step44-top-nav="prime-tools"]');
    if (button) {
      button.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  function setStatus(text, tone, source) {
    state.status = String(text || 'waiting');
    state.statusTone = tone || 'warn';
    if (source) state.source = String(source);
    var overlay = state.overlay;
    var status = overlay && qs('[data-gp-m1cd-status]', overlay);
    var statusText = status && qs('b', status);
    var sourceNode = overlay && qs('[data-gp-m1cd-source]', overlay);
    if (status) status.setAttribute('data-tone', state.statusTone);
    if (statusText) statusText.textContent = state.status.toUpperCase();
    if (sourceNode) sourceNode.textContent = state.source || 'MARKET FEED';
    syncEmpty();
  }

  function showToast(message) {
    var toast = state.overlay && qs('[data-gp-m1cd-toast]', state.overlay);
    if (!toast) return;
    toast.textContent = String(message || '');
    toast.classList.add('is-visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
      state.toastTimer = 0;
    }, 2400);
  }

  function syncEmpty() {
    var empty = state.overlay && qs('[data-gp-m1cd-empty]', state.overlay);
    if (!empty) return;
    var visible = state.candles.length < 2 || state.priceCandles.length < 2;
    empty.classList.toggle('is-visible', visible);
    if (!visible) return;
    if (state.status === 'loading') empty.textContent = usesPricePressure()
      ? 'Loading live and historical market data...'
      : 'Loading historical delta and connecting live market feed...';
    else if (state.statusTone === 'error') empty.textContent = 'Market data is unavailable. Use Reconnect or sign in again.';
    else empty.textContent = 'Waiting for synchronized pressure and OHLC history...';
  }

  function syncChrome() {
    var overlay = state.overlay;
    if (!overlay) return;
    if (state.chromeSyncTimer) window.clearTimeout(state.chromeSyncTimer);
    state.chromeSyncTimer = 0;
    state.lastChromeSyncAt = Date.now();
    var symbolNode = qs('[data-gp-m1cd-symbol]', overlay);
    var exchangeNode = qs('[data-gp-m1cd-exchange]', overlay);
    if (symbolNode) symbolNode.textContent = state.symbol;
    if (exchangeNode) exchangeNode.textContent = state.exchange;
    var pricePressureMode = usesPricePressure();
    var moduleWindow = qs('.gp-m1cd-window', overlay);
    var moduleNavigation = qs('.gp-m1cd-nav', overlay);
    var moduleTitle = qs('[data-gp-m1cd-module-title]', overlay);
    var moduleSubtitle = qs('[data-gp-m1cd-module-subtitle]', overlay);
    var estimatedCryptoMode = !pricePressureMode && !usesBinanceKlines();
    if (moduleWindow) moduleWindow.setAttribute('aria-label', pricePressureMode ? 'MODULE-1 Forex and Gold Price Pressure' : 'MODULE-1 Cumulative Delta');
    if (moduleNavigation) moduleNavigation.setAttribute('aria-label', pricePressureMode ? 'Forex and Gold price-pressure tools' : 'Cumulative Delta tools');
    if (moduleTitle) moduleTitle.textContent = pricePressureMode ? 'MODULE-1 · Forex/Gold Price Pressure' : 'MODULE-1 · Cumulative Delta';
    if (moduleSubtitle) moduleSubtitle.textContent = pricePressureMode ? 'Five price-pressure views · synchronized server data' : 'Five distinct professional order-flow views · Tools 01-05 live';
    if (moduleSubtitle && usesBinanceKlines()) moduleSubtitle.textContent = 'Binance taker volume · UTC daily reset · estimated views labelled';
    if (moduleSubtitle && estimatedCryptoMode) moduleSubtitle.textContent = 'OKX/Bybit live trades · historical CVD estimated';
    var toolLabels = pricePressureMode ? [
      ['Cumulative Price Pressure', 'OHLC pressure + candle-direction balance'],
      ['Price Pressure Stack', 'Price candles + structural pressure step-line + magnitude'],
      ['Cumulative Price Moves', 'Price-move blocks + structural pressure history'],
      ['Directional Pressure', 'Focused up/down structural-pressure histogram'],
      ['Move-Size Pressure', 'Five structural-magnitude pressure lines']
    ] : [
      ['Cumulative Delta Bars', 'Volume + Up/Down Tick'],
      ['Delta & Volume Stack', 'Price + CVD + Volume + Difference'],
      ['Cumulative Trades', 'Trade blocks + CVD histogram'],
      ['Ask/Bid Difference', 'Focused pressure histogram'],
      ['Multi-Market CVD', 'Five volume-filtered CVD lines']
    ];
    if (usesBinanceKlines()) toolLabels = [
      ['Cumulative Delta Bars', 'Taker volume + direction estimate'],
      ['Delta & Volume Stack', 'Full-bar price + taker CVD + volume'],
      ['Estimated Trade Blocks', 'Modelled blocks + taker CVD'],
      ['Taker Buy/Sell Difference', 'Full-bar net taker volume'],
      ['Modelled CVD Components', 'Five estimates · not trade-size buckets']
    ];
    if (estimatedCryptoMode) toolLabels = [
      ['Estimated Cumulative Delta Bars', 'Estimated volume + live trade direction'],
      ['Estimated Delta & Volume Stack', 'Price + estimated CVD + volume'],
      ['Estimated Trade Blocks', 'Live trades + estimated historical blocks'],
      ['Estimated Ask/Bid Difference', 'Estimated pressure histogram'],
      ['Estimated Multi-Market CVD', 'Five estimated volume-filtered lines']
    ];
    toolLabels.forEach(function (labels, index) {
      var title = qs('[data-gp-m1cd-tool' + (index + 1) + '-title]', overlay);
      var subtitle = qs('[data-gp-m1cd-tool' + (index + 1) + '-subtitle]', overlay);
      if (title) title.textContent = labels[0];
      if (subtitle) subtitle.textContent = labels[1];
    });
    var metricLabels = pricePressureMode ? {
      cvd: 'Session pressure',
      tick: 'Candle-direction balance',
      buy: 'Up pressure',
      sell: 'Down pressure',
      ratio: 'Up/Down ratio',
      prints: 'Candles'
    } : {
      cvd: 'Session CVD',
      tick: 'Up/Down CVD',
      buy: 'Buy volume',
      sell: 'Sell volume',
      ratio: 'Buy/Sell ratio',
      prints: 'Trades / ticks'
    };
    if (usesBinanceKlines()) {
      metricLabels.cvd = 'UTC-day taker CVD';
      metricLabels.tick = 'Direction estimate';
      metricLabels.prints = 'UTC-day trades';
    }
    if (estimatedCryptoMode) {
      metricLabels.cvd = 'Estimated CVD';
      metricLabels.tick = 'Estimated direction';
      metricLabels.buy = 'Estimated buy volume';
      metricLabels.sell = 'Estimated sell volume';
    }
    Object.keys(metricLabels).forEach(function (name) {
      var label = qs('[data-gp-m1cd-metric-label="' + name + '"]', overlay);
      if (label) label.textContent = metricLabels[name];
    });
    qsa('[data-gp-m1cd-tf]', overlay).forEach(function (button) {
      var active = normalizeTimeframe(button.getAttribute('data-gp-m1cd-tf')) === state.timeframe;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    centerActiveTimeframe(overlay);
    qsa('[data-gp-m1cd-view]', overlay).forEach(function (button) {
      var active = number(button.getAttribute('data-gp-m1cd-view')) === state.activeView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (state.canvas) {
      var pressureAria = [
        'Cumulative price pressure and candle-direction balance chart',
        'Price Pressure Stack with price candles, a cumulative structural-pressure step-line, structural magnitude, and directional pressure',
        'Cumulative Price Moves chart with price-move blocks and structural-pressure history',
        'Directional Pressure chart with price, cumulative structural pressure, structural magnitude, and focused up/down histogram',
        'Move-Size Pressure chart with five structural-magnitude bucket lines'
      ];
      var cryptoAria = [
        'Cumulative Delta Bars chart',
        'Delta and Volume Stack chart with price, cumulative delta, volume, and ask bid difference',
        'Cumulative Trades chart with trade blocks and cumulative delta histogram',
        'Ask and Bid Volume Difference chart with price, cumulative delta, volume, and focused pressure histogram',
        'Multi-Market CVD chart with five volume-filtered cumulative delta lines'
      ];
      if (usesBinanceKlines()) cryptoAria = [
        'UTC-day taker cumulative delta and estimated price-direction volume',
        'Full-bar price, UTC-day taker cumulative delta, volume and difference',
        'Estimated trade blocks and UTC-day taker cumulative delta',
        'Full-bar taker buy and sell volume difference',
        'Five modelled cumulative delta components, not observed trade-size buckets'
      ];
      state.canvas.setAttribute('aria-label', (pricePressureMode ? pressureAria : cryptoAria)[state.activeView - 1]);
    }
    setMetric('cvd', state.cumDelta);
    setMetric('tick', state.cumTick);
    setMetric('buy', state.buyVolume);
    setMetric('sell', state.sellVolume);
    var ratio = state.sellVolume > 0 ? state.buyVolume / state.sellVolume : 0;
    var ratioNode = qs('[data-gp-m1cd-metric="ratio"]', overlay);
    if (ratioNode) {
      ratioNode.textContent = ratio.toFixed(2);
      ratioNode.classList.toggle('is-positive', ratio >= 1);
      ratioNode.classList.toggle('is-negative', ratio > 0 && ratio < 1);
    }
    var printsNode = qs('[data-gp-m1cd-metric="prints"]', overlay);
    if (printsNode) printsNode.textContent = Math.round(state.prints).toLocaleString();
    syncZoomControls();
  }

  function scheduleChromeSync() {
    if (!state.open || state.chromeSyncTimer) return;
    var elapsed = Date.now() - state.lastChromeSyncAt;
    var delay = Math.max(0, 100 - elapsed);
    state.chromeSyncTimer = window.setTimeout(function () {
      state.chromeSyncTimer = 0;
      if (!state.open) return;
      syncChrome();
      syncEmpty();
    }, delay);
  }

  function setMetric(name, value) {
    var node = state.overlay && qs('[data-gp-m1cd-metric="' + name + '"]', state.overlay);
    if (!node) return;
    node.textContent = formatValue(value);
    node.classList.toggle('is-positive', number(value) > 0);
    node.classList.toggle('is-negative', number(value) < 0);
  }

  function resizeCanvas() {
    var canvas = state.canvas;
    if (!canvas) return false;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      clearHover(false);
      canvas.width = width;
      canvas.height = height;
    }
    if (state.ctx) state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function scheduleRender() {
    if (!state.open || state.renderFrame) return;
    state.renderFrame = window.requestAnimationFrame(function () {
      state.renderFrame = 0;
      render();
    });
  }

  function valueRange(rows) {
    if (!rows.length) return { min: -1, max: 1 };
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      min = Math.min(min, number(row.low), number(row.open), number(row.close));
      max = Math.max(max, number(row.high), number(row.open), number(row.close));
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
    if (min === max) {
      var around = Math.abs(min) || 1;
      min -= around * .08;
      max += around * .08;
    }
    var padding = Math.max((max - min) * .08, .000001);
    return { min: min - padding, max: max + padding };
  }

  function yFor(value, range, rect) {
    return rect.y + (range.max - number(value)) / (range.max - range.min || 1) * rect.height;
  }

  function drawGrid(ctx, rect, range, rightX) {
    ctx.save();
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= 5; i += 1) {
      var y = rect.y + rect.height * i / 5;
      var value = range.max - (range.max - range.min) * i / 5;
      ctx.beginPath();
      ctx.strokeStyle = i === 5 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.055)';
      ctx.lineWidth = 1;
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,238,240,.68)';
      ctx.fillText(formatValue(value), rightX + 8, y);
    }
    if (range.min < 0 && range.max > 0) {
      var zeroY = yFor(0, range, rect);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,.20)';
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(zeroY) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(zeroY) + .5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawLatestTag(ctx, value, candle, range, rect, rightX) {
    var y = clamp(yFor(value, range, rect), rect.y + 10, rect.y + rect.height - 10);
    var positive = candle && candle.close >= candle.open;
    var color = positive ? '#00ef63' : '#ff2d44';
    var text = formatValue(value);
    ctx.save();
    ctx.font = '900 9px "JetBrains Mono", monospace';
    var width = Math.max(48, ctx.measureText(text).width + 12);
    ctx.fillStyle = color;
    ctx.fillRect(rightX + 2, y - 9, width, 18);
    ctx.fillStyle = '#020504';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rightX + 2 + width / 2, y);
    ctx.restore();
  }

  function drawPanel(ctx, rows, rect, title, subtitle, start, step, bodyWidth, rightX) {
    var visible = visibleSlice(rows, start);
    var range = valueRange(visible);
    drawGrid(ctx, rect, range, rightX);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    visible.forEach(function (candle, offset) {
      var x = rect.x + step * offset + step / 2;
      var openY = yFor(candle.open, range, rect);
      var closeY = yFor(candle.close, range, rect);
      var highY = yFor(candle.high, range, rect);
      var lowY = yFor(candle.low, range, rect);
      var up = candle.close >= candle.open;
      var color = up ? '#00ef63' : '#ff2d44';
      ctx.strokeStyle = up ? '#56ff93' : '#ff7a88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, highY);
      ctx.lineTo(Math.round(x) + .5, lowY);
      ctx.stroke();
      var bodyTop = Math.min(openY, closeY);
      var bodyHeight = Math.max(2, Math.abs(closeY - openY));
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x - bodyWidth / 2), Math.round(bodyTop), Math.max(2, Math.round(bodyWidth)), Math.round(bodyHeight));
      ctx.strokeStyle = up ? 'rgba(182,255,208,.72)' : 'rgba(255,194,200,.75)';
      ctx.strokeRect(Math.round(x - bodyWidth / 2) + .5, Math.round(bodyTop) + .5, Math.max(1, Math.round(bodyWidth) - 1), Math.max(1, Math.round(bodyHeight) - 1));
    });
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, rect.x + 4, rect.y + 5);
    ctx.fillStyle = 'rgba(224,235,238,.52)';
    ctx.font = '750 8px "JetBrains Mono", monospace';
    ctx.fillText(subtitle, rect.x + 4, rect.y + 22);
    ctx.restore();
    if (visible.length) drawLatestTag(ctx, visible[visible.length - 1].close, visible[visible.length - 1], range, rect, rightX);
    return range;
  }

  function drawCanonicalGapDividers(ctx, rows, rect, start, step) {
    var visible = visibleSlice(rows, start);
    visible.forEach(function (row, offset) {
      if (!row || row.gapBefore !== true) return;
      var x = rect.x + step * offset;
      var unverified = row.gapKind === 'long-unverified-provider-gap';
      var providerGap = row.gapKind === 'provider-gap';
      var label = row.gapKind === 'utc-day-reset' ? '00:00 UTC RESET' : unverified ? 'DATA GAP' : providerGap ? 'FEED GAP' : 'MARKET BREAK';
      var color = unverified ? 'rgba(255,171,64,.92)' : providerGap ? 'rgba(255,214,102,.86)' : 'rgba(62,226,214,.72)';
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, rect.y);
      ctx.lineTo(Math.round(x) + .5, rect.y + rect.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '800 7px "JetBrains Mono", monospace';
      var labelWidth = ctx.measureText(label).width + 8;
      var labelX = clamp(x + 3, rect.x + 2, rect.x + rect.width - labelWidth - 2);
      ctx.fillStyle = 'rgba(3,9,12,.88)';
      ctx.fillRect(labelX, rect.y + rect.height - 14, labelWidth, 11);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX + 4, rect.y + rect.height - 8.5);
      ctx.restore();
    });
  }

  function drawTimeAxis(ctx, rows, start, rect, step) {
    var visible = visibleSlice(rows, start);
    if (!visible.length) return;
    var targetLabels = Math.max(3, Math.floor(rect.width / 130));
    var every = Math.max(1, Math.ceil(visible.length / targetLabels));
    ctx.save();
    ctx.font = '8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    visible.forEach(function (row, offset) {
      if (offset % every !== 0 && offset !== visible.length - 1) return;
      var x = rect.x + step * offset + step / 2;
      ctx.strokeStyle = 'rgba(255,255,255,.04)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, rect.y - 12);
      ctx.lineTo(Math.round(x) + .5, rect.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(236,242,244,.68)';
      ctx.fillText(formatTime(row.time, false), x, rect.y + 5);
    });
    ctx.restore();
  }

  function drawCrosshair(ctx, topRows, bottomRows, start, plot, topRect, bottomRect, step, topRange, bottomRange) {
    var index = state.hoverIndex;
    if (index == null || index < start || index >= topRows.length) return;
    var panel = activeHoverPanel();
    if (!panel || (panel.id !== 'top' && panel.id !== 'bottom')) return;
    var offset = index - start;
    var x = plot.x + step * offset + step / 2;
    var top = topRows[index];
    var bottom = bottomRows[index];
    var isTop = panel.id === 'top';
    var row = isTop ? top : bottom;
    var rowRect = isTop ? topRect : bottomRect;
    var rowRange = isTop ? topRange : bottomRange;
    if (!row) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.width, panel.height);
    ctx.clip();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,.40)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + .5, panel.y);
    ctx.lineTo(Math.round(x) + .5, panel.y + panel.height);
    ctx.stroke();
    ctx.setLineDash([]);
    var rowY = yFor(row.close, rowRange, rowRect);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, rowY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    var metricLabel = isTop ? (usesPricePressure() ? 'PRESSURE' : 'CVD') : (usesPricePressure() ? 'BALANCE' : 'TICK');
    var boxWidth = crosshairBoxWidth(332, plot);
    var boxHeight = 87;
    var boxX = crosshairBoxX(x, boxWidth, plot, 14);
    var boxY = crosshairBoxY(panel, boxHeight, 38);
    if (boxY == null) {
      drawCompactCrosshairTooltip(
        ctx,
        panel,
        plot,
        x,
        row.time,
        metricLabel + ' C ' + formatValue(row.close) + ' · Δ ' + formatValue(row.delta),
        row.delta >= 0 ? '#00ef63' : '#ff2d44'
      );
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(5,9,10,.96)';
    ctx.strokeStyle = 'rgba(36,230,210,.32)';
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    ctx.fillStyle = '#fff';
    ctx.font = '900 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(formatTooltipDateTime(row.time) + '  ' + state.symbol + '  ' + state.timeframe, boxX + 9, boxY + 8);
    ctx.fillStyle = 'rgba(224,235,238,.68)';
    ctx.font = '750 8px "JetBrains Mono", monospace';
    ctx.fillText(metricLabel + ' O ' + formatValue(row.open) + '  H ' + formatValue(row.high), boxX + 9, boxY + 27);
    ctx.fillText('L ' + formatValue(row.low) + '  C ' + formatValue(row.close), boxX + 9, boxY + 42);
    ctx.fillStyle = row.delta >= 0 ? '#00ef63' : '#ff2d44';
    ctx.fillText('BAR Δ ' + formatValue(row.delta), boxX + 9, boxY + 60);
    ctx.fillStyle = 'rgba(224,235,238,.68)';
    ctx.fillText((usesPricePressure() ? 'UP ' : 'BUY ') + formatValue(row.buy) + (usesPricePressure() ? '  DOWN ' : '  SELL ') + formatValue(row.sell), boxX + 92, boxY + 60);
    ctx.restore();
  }

  function renderViewOne() {
    if (!state.open || !state.canvas || !state.ctx) return;
    if (!resizeCanvas()) return;
    var canvas = state.canvas;
    var rect = canvas.getBoundingClientRect();
    var width = rect.width;
    var height = rect.height;
    var ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    var left = 12;
    var right = width < 560 ? 62 : 78;
    var top = 8;
    var bottom = 30;
    var gap = 30;
    var plotWidth = Math.max(100, width - left - right);
    var available = Math.max(180, height - top - bottom - gap);
    var topHeight = Math.floor(available * .48);
    var bottomHeight = available - topHeight;
    var topRect = { x: left, y: top, width: plotWidth, height: topHeight };
    var bottomRect = { x: left, y: top + topHeight + gap, width: plotWidth, height: bottomHeight };
    var axisRect = { x: left, y: bottomRect.y + bottomRect.height, width: plotWidth, height: bottom };
    var synchronizedLength = Math.min(state.candles.length, state.tickCandles.length, state.priceCandles.length);
    var count = canonicalVisibleCount(synchronizedLength);
    var viewport = viewportFor(synchronizedLength, count);
    count = viewport.count;
    var start = viewport.start;
    state.renderEnd = viewport.end;
    state.renderCount = count;
    var actualStep = count > 0 ? plotWidth / Math.max(count, 1) : plotWidth / CANONICAL_VISIBLE_BARS;
    var bodyWidth = clamp(actualStep * .62, 2, 12);
    var rightX = left + plotWidth;

    var topRange = drawPanel(
      ctx,
      state.candles,
      topRect,
      usesPricePressure() ? 'Cumulative Candle / Price Pressure' : 'Cumulative Delta Bars - Volume',
      (usesPricePressure() ? 'OHLC structural pressure: body, close location, wick rejection and range activity · no trade-side volume' : usesBinanceKlines() ? (width < 620 ? 'Net taker bars · UTC reset · no CVD wicks' : 'Taker buy minus sell · 00:00 UTC reset · net bars, no intrabar delta wicks') : state.source) + ' · scroll to zoom',
      start,
      actualStep,
      bodyWidth,
      rightX
    );
    var bottomRange = drawPanel(
      ctx,
      state.tickCandles,
      bottomRect,
      usesPricePressure() ? 'Cumulative Candle-Direction Balance' : usesBinanceKlines() ? 'Cumulative Price-Direction Estimate' : 'Cum UpTick/DownTick Bars',
      usesPricePressure() ? 'One candle = one direction vote · synchronized server data' : usesBinanceKlines() ? (width < 620 ? 'OHLC estimate · not ticks · UTC reset' : 'OHLC-derived volume estimate · not tick counts · 00:00 UTC reset') : 'Price-direction volume · session baseline 0',
      start,
      actualStep,
      bodyWidth,
      rightX
    );
    state.layout = {
      start: start,
      count: count,
      x: left,
      width: plotWidth,
      step: actualStep,
      panels: [panelLayout('top', topRect), panelLayout('bottom', bottomRect)]
    };
    drawTimeAxis(ctx, state.candles, start, axisRect, actualStep);
    drawCanonicalGapDividers(ctx, state.candles, {
      x: left,
      y: topRect.y,
      width: plotWidth,
      height: bottomRect.y + bottomRect.height - topRect.y
    }, start, actualStep);
    drawCrosshair(ctx, state.candles, state.tickCandles, start, { x: left, width: plotWidth }, topRect, bottomRect, actualStep, topRange, bottomRange);
  }

  function formatPrice(value) {
    value = number(value);
    var absolute = Math.abs(value);
    if (absolute >= 1000) return value.toFixed(2);
    if (absolute >= 100) return value.toFixed(3);
    if (absolute >= 1) return value.toFixed(4);
    return value.toFixed(6);
  }

  function drawStackGrid(ctx, rect, range, rightX, priceScale, strongZero) {
    ctx.save();
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i += 1) {
      var y = rect.y + rect.height * i / 4;
      var value = range.max - (range.max - range.min) * i / 4;
      ctx.strokeStyle = i === 0 || i === 4 ? 'rgba(0,0,0,.42)' : 'rgba(0,0,0,.17)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      ctx.fillText(priceScale ? formatPrice(value) : formatValue(value), rightX + 6, y);
    }
    if (range.min < 0 && range.max > 0) {
      var zeroY = yFor(0, range, rect);
      ctx.strokeStyle = strongZero ? '#050505' : 'rgba(0,0,0,.48)';
      ctx.lineWidth = strongZero ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(zeroY) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(zeroY) + .5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.62)';
    ctx.beginPath();
    ctx.moveTo(Math.round(rightX) + .5, rect.y);
    ctx.lineTo(Math.round(rightX) + .5, rect.y + rect.height);
    ctx.stroke();
    ctx.restore();
  }

  function drawStackTitle(ctx, title, detail, rect) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = '900 9px "JetBrains Mono", monospace';
    ctx.fillText(title, rect.x + 3, rect.y + 3);
    if (detail) {
      ctx.fillStyle = 'rgba(255,255,255,.76)';
      ctx.font = '700 7px "JetBrains Mono", monospace';
      ctx.fillText(detail, rect.x + 3, rect.y + 15);
    }
    ctx.restore();
  }

  function drawStackCandles(ctx, rows, rect, range, start, step, bodyWidth, palette) {
    var visible = visibleSlice(rows, start);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    visible.forEach(function (candle, offset) {
      var x = rect.x + step * offset + step / 2;
      var openY = yFor(candle.open, range, rect);
      var closeY = yFor(candle.close, range, rect);
      var highY = yFor(candle.high, range, rect);
      var lowY = yFor(candle.low, range, rect);
      var up = candle.close >= candle.open;
      var fill = up ? palette.up : palette.down;
      var stroke = up ? palette.upStroke : palette.downStroke;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, highY);
      ctx.lineTo(Math.round(x) + .5, lowY);
      ctx.stroke();
      var bodyTop = Math.min(openY, closeY);
      var bodyHeight = Math.max(2, Math.abs(closeY - openY));
      ctx.fillStyle = fill;
      ctx.fillRect(Math.round(x - bodyWidth / 2), Math.round(bodyTop), Math.max(2, Math.round(bodyWidth)), Math.round(bodyHeight));
      ctx.strokeStyle = stroke;
      ctx.strokeRect(Math.round(x - bodyWidth / 2) + .5, Math.round(bodyTop) + .5, Math.max(1, Math.round(bodyWidth) - 1), Math.max(1, Math.round(bodyHeight) - 1));
    });
    ctx.restore();
  }

  function drawCumulativePressureStepArea(ctx, rows, rect, range, start, step) {
    var visible = visibleSlice(rows, start);
    if (!visible.length) return;
    var points = visible.map(function (row, offset) {
      return {
        x: rect.x + step * offset + step / 2,
        y: yFor(number(row.close), range, rect),
        rising: number(row.close) >= number(row.open),
        value: number(row.close),
        gapBefore: row.gapBefore === true
      };
    });
    var segments = [];
    var segment = [];
    points.forEach(function (point) {
      if (point.gapBefore && segment.length) {
        segments.push(segment);
        segment = [];
      }
      segment.push(point);
    });
    if (segment.length) segments.push(segment);
    var baselineValue = range.min <= 0 && range.max >= 0
      ? 0
      : (range.min > 0 ? range.min : range.max);
    var baselineY = yFor(baselineValue, range, rect);
    var latest = points[points.length - 1];

    function traceStepPath() {
      ctx.beginPath();
      segments.forEach(function (currentSegment) {
        ctx.moveTo(currentSegment[0].x, currentSegment[0].y);
        for (var index = 1; index < currentSegment.length; index += 1) {
          ctx.lineTo(currentSegment[index].x, currentSegment[index - 1].y);
          ctx.lineTo(currentSegment[index].x, currentSegment[index].y);
        }
      });
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.fillStyle = 'rgba(12,22,26,.14)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    ctx.fillStyle = 'rgba(8,17,20,.28)';
    segments.forEach(function (currentSegment) {
      var segmentLatest = currentSegment[currentSegment.length - 1];
      ctx.beginPath();
      ctx.moveTo(currentSegment[0].x, baselineY);
      ctx.lineTo(currentSegment[0].x, currentSegment[0].y);
      for (var areaIndex = 1; areaIndex < currentSegment.length; areaIndex += 1) {
        ctx.lineTo(currentSegment[areaIndex].x, currentSegment[areaIndex - 1].y);
        ctx.lineTo(currentSegment[areaIndex].x, currentSegment[areaIndex].y);
      }
      ctx.lineTo(segmentLatest.x, baselineY);
      ctx.closePath();
      ctx.fill();
    });

    points.forEach(function (point) {
      var bandLeft = Math.max(rect.x, point.x - step / 2);
      var bandRight = Math.min(rect.x + rect.width, point.x + step / 2);
      var bandTop = Math.min(point.y, baselineY);
      var bandHeight = Math.max(1, Math.abs(point.y - baselineY));
      ctx.fillStyle = point.value >= baselineValue
        ? 'rgba(0,239,155,.075)'
        : 'rgba(255,59,85,.075)';
      ctx.fillRect(bandLeft, bandTop, Math.max(1, bandRight - bandLeft), bandHeight);
    });

    traceStepPath();
    ctx.strokeStyle = 'rgba(0,0,0,.88)';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (points.length === 1) {
      ctx.strokeStyle = points[0].rising ? '#00ef9b' : '#ff3b55';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(points[0].x - Math.min(step * .34, 6), points[0].y);
      ctx.lineTo(points[0].x + Math.min(step * .34, 6), points[0].y);
      ctx.stroke();
    } else {
      for (var lineIndex = 1; lineIndex < points.length; lineIndex += 1) {
        var previous = points[lineIndex - 1];
        var current = points[lineIndex];
        if (current.gapBefore) continue;
        ctx.strokeStyle = current.rising ? '#00ef9b' : '#ff3b55';
        ctx.lineWidth = 2.35;
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(current.x, previous.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
      }
    }

    var markerEvery = Math.max(1, Math.ceil(points.length / 32));
    points.forEach(function (point, pointIndex) {
      if (pointIndex % markerEvery !== 0 && pointIndex !== points.length - 1) return;
      ctx.beginPath();
      ctx.arc(point.x, point.y, pointIndex === points.length - 1 ? 3.4 : 1.45, 0, Math.PI * 2);
      ctx.fillStyle = point.rising ? '#00ef9b' : '#ff3b55';
      ctx.fill();
      if (pointIndex === points.length - 1) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
    });

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = latest.rising ? 'rgba(0,239,155,.62)' : 'rgba(255,59,85,.62)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(latest.x + 4, latest.y);
    ctx.lineTo(rect.x + rect.width, latest.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSwingMarkers(ctx, rows, rect, range, start, step) {
    rows = Array.isArray(rows) ? rows : [];
    var end = state.renderEnd == null ? rows.length : Math.min(rows.length, state.renderEnd);
    var checkedAt = Date.now();
    ctx.save();
    for (var index = Math.max(1, start); index < end; index += 1) {
      var marker = confirmedSwingMarker(rows, index, state.timeframe, checkedAt);
      if (!marker) continue;
      var candle = rows[index];
      var offset = index - start;
      var x = rect.x + step * offset + step / 2;
      if (marker.high) {
        var highY = clamp(yFor(candle.high, range, rect) - 7, rect.y + 26, rect.y + rect.height - 8);
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.moveTo(x, highY + 5);
        ctx.lineTo(x - 4, highY - 2);
        ctx.lineTo(x + 4, highY - 2);
        ctx.closePath();
        ctx.fill();
      }
      if (marker.low) {
        var lowY = clamp(yFor(candle.low, range, rect) + 7, rect.y + 28, rect.y + rect.height - 7);
        ctx.fillStyle = '#071cff';
        ctx.beginPath();
        ctx.moveTo(x, lowY - 5);
        ctx.lineTo(x - 4, lowY + 2);
        ctx.lineTo(x + 4, lowY + 2);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSwingLegend(ctx, rect) {
    var text = 'CONFIRMED SWING HIGH / LOW · CLOSED BARS ONLY · NOT A TRADE SIGNAL';
    var boxX = rect.x + 4;
    var boxY = rect.y + rect.height - 19;
    var boxWidth = Math.max(120, Math.min(rect.width - 8, 430));
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,22,.78)';
    ctx.fillRect(boxX, boxY, boxWidth, 15);
    ctx.fillStyle = 'rgba(235,245,248,.88)';
    ctx.font = '800 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, boxX + 5, boxY + 7.5, boxWidth - 10);
    ctx.restore();
  }

  function drawVolumeStrip(ctx, rows, rect, start, step, bodyWidth, rightX) {
    var visible = visibleSlice(rows, start);
    var pricePressureMode = usesPricePressure();
    function stripValue(row) {
      return pricePressureMode
        ? Math.max(0, number(row.magnitude, Math.abs(number(row.delta))))
        : Math.max(0, number(row.volume));
    }
    var maxVolume = 1;
    visible.forEach(function (row) { maxVolume = Math.max(maxVolume, stripValue(row)); });
    ctx.save();
    ctx.fillStyle = 'rgba(92,92,92,.72)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    visible.forEach(function (row, offset) {
      var x = rect.x + step * offset + step / 2;
      var barHeight = Math.max(1, stripValue(row) / maxVolume * Math.max(2, rect.height - 5));
      ctx.fillStyle = row.close >= row.open ? '#fff' : '#060606';
      ctx.fillRect(Math.round(x - bodyWidth / 2), Math.round(rect.y + rect.height - barHeight), Math.max(2, Math.round(bodyWidth)), Math.round(barHeight));
    });
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeRect(rect.x + .5, rect.y + .5, rect.width - 1, rect.height - 1);
    ctx.fillStyle = '#fff';
    ctx.font = '800 7px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText((pricePressureMode ? 'Structural magnitude  ' : 'Volume  ') + formatValue(visible.length ? stripValue(visible[visible.length - 1]) : 0), rect.x + 3, rect.y + 2);
    ctx.fillText(formatValue(maxVolume), rightX + 6, rect.y + 4);
    ctx.restore();
  }

  function drawDifferencePanel(ctx, rows, rect, start, step, bodyWidth, rightX) {
    var visible = visibleSlice(rows, start);
    var maxAbs = 1;
    visible.forEach(function (row) { maxAbs = Math.max(maxAbs, Math.abs(number(row.delta))); });
    maxAbs *= 1.08;
    var range = { min: -maxAbs, max: maxAbs };
    drawStackGrid(ctx, rect, range, rightX, false, true);
    var zeroY = yFor(0, range, rect);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    visible.forEach(function (row, offset) {
      var x = rect.x + step * offset + step / 2;
      var valueY = yFor(number(row.delta), range, rect);
      var top = Math.min(zeroY, valueY);
      var height = Math.max(1, Math.abs(valueY - zeroY));
      var positive = number(row.delta) >= 0;
      ctx.fillStyle = positive ? '#fff' : '#050505';
      ctx.fillRect(Math.round(x - bodyWidth / 2), Math.round(top), Math.max(2, Math.round(bodyWidth)), Math.round(height));
      ctx.strokeStyle = positive ? 'rgba(0,0,0,.68)' : 'rgba(255,255,255,.22)';
      ctx.strokeRect(Math.round(x - bodyWidth / 2) + .5, Math.round(top) + .5, Math.max(1, Math.round(bodyWidth) - 1), Math.max(1, Math.round(height) - 1));
    });
    ctx.restore();
    drawStackTitle(ctx,
      usesPricePressure() ? 'Directional Price Pressure Bars' : 'Ask/Bid Volume Difference Bars',
      usesPricePressure() ? 'Positive / negative OHLC structural pressure' : 'Positive ask volume / negative bid volume',
      rect
    );
    return range;
  }

  function drawStackTimeAxis(ctx, rows, start, rect, step) {
    var visible = visibleSlice(rows, start);
    if (!visible.length) return;
    var target = Math.max(3, Math.floor(rect.width / 115));
    var every = Math.max(1, Math.ceil(visible.length / target));
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.62)';
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + .5);
    ctx.lineTo(rect.x + rect.width, rect.y + .5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    visible.forEach(function (row, offset) {
      if (offset % every !== 0 && offset !== visible.length - 1) return;
      var x = rect.x + step * offset + step / 2;
      ctx.fillText(formatTime(row.time, false), x, rect.y + 4);
    });
    ctx.restore();
  }

  function drawStackCrosshair(ctx, priceRows, cvdRows, start, plot, step) {
    var index = state.hoverIndex;
    if (index == null || index < start || index >= priceRows.length) return;
    var panel = activeHoverPanel();
    if (!panel) return;
    var price = priceRows[index];
    var cvd = cvdRows[index];
    if (!price || !cvd) return;
    var x = plot.x + step * (index - start) + step / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.width, panel.height);
    ctx.clip();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,.76)';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + .5, panel.y);
    ctx.lineTo(Math.round(x) + .5, panel.y + panel.height);
    ctx.stroke();
    ctx.setLineDash([]);
    var showCvd = panel.id === 'cvd';
    var row = showCvd ? cvd : price;
    var boxWidth = crosshairBoxWidth(360, plot);
    var boxHeight = 72;
    var boxX = crosshairBoxX(x, boxWidth, plot, 12);
    var boxY = crosshairBoxY(panel, boxHeight, 28);
    if (boxY == null) {
      drawCompactCrosshairTooltip(
        ctx,
        panel,
        plot,
        x,
        price.time,
        (showCvd ? (usesPricePressure() ? 'CUM PRESSURE ' : 'CVD ') + formatValue(row.close) : 'PRICE ' + formatPrice(price.close)) + ' · Δ ' + formatValue(row.delta),
        row.delta >= 0 ? '#63ff8c' : '#ff6672',
        'rgba(28,28,28,.96)',
        'rgba(255,255,255,.82)'
      );
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(28,28,28,.96)';
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = '900 8px "JetBrains Mono", monospace';
    ctx.fillText(formatTooltipDateTime(price.time) + '  ' + state.symbol + '  ' + state.timeframe, boxX + 8, boxY + 7);
    ctx.font = '750 8px "JetBrains Mono", monospace';
    if (showCvd) {
      ctx.fillText((usesPricePressure() ? 'CUM PRESSURE' : 'CVD') + ' O ' + formatValue(row.open) + '  H ' + formatValue(row.high), boxX + 8, boxY + 24);
      ctx.fillText('L ' + formatValue(row.low) + '  C ' + formatValue(row.close), boxX + 8, boxY + 40);
      ctx.fillStyle = row.delta >= 0 ? '#63ff8c' : '#ff6672';
      ctx.fillText('BAR Δ ' + formatValue(row.delta), boxX + 8, boxY + 56);
    } else {
      ctx.fillText('O ' + formatPrice(price.open) + '  H ' + formatPrice(price.high) + '  L ' + formatPrice(price.low), boxX + 8, boxY + 24);
      ctx.fillText('C ' + formatPrice(price.close) + (usesPricePressure()
        ? '  STRUCT MAG ' + formatValue(price.magnitude)
        : '  VOL ' + formatValue(price.volume)), boxX + 8, boxY + 40);
      ctx.fillStyle = price.delta >= 0 ? '#63ff8c' : '#ff6672';
      ctx.fillText((usesPricePressure() ? 'STRUCT Δ ' : 'BAR Δ ') + formatValue(price.delta) + (usesPricePressure() ? '  CUM PRESSURE ' : '  CVD ') + formatValue(cvd.close), boxX + 8, boxY + 56);
    }
    ctx.restore();
  }

  function renderViewTwo() {
    if (!state.open || !state.canvas || !state.ctx) return;
    if (!resizeCanvas()) return;
    var canvas = state.canvas;
    var bounds = canvas.getBoundingClientRect();
    var width = bounds.width;
    var height = bounds.height;
    var ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, width, height);

    var left = 8;
    var right = width < 620 ? 61 : 72;
    var top = 5;
    var bottom = 23;
    var separator = 3;
    var plotWidth = Math.max(100, width - left - right);
    var usable = Math.max(240, height - top - bottom - separator * 3);
    var priceHeight = Math.floor(usable * .40);
    var cvdHeight = Math.floor(usable * .27);
    var volumeHeight = Math.max(34, Math.floor(usable * .075));
    var differenceHeight = usable - priceHeight - cvdHeight - volumeHeight;
    var priceRect = { x: left, y: top, width: plotWidth, height: priceHeight };
    var cvdRect = { x: left, y: priceRect.y + priceRect.height + separator, width: plotWidth, height: cvdHeight };
    var volumeRect = { x: left, y: cvdRect.y + cvdRect.height + separator, width: plotWidth, height: volumeHeight };
    var differenceRect = { x: left, y: volumeRect.y + volumeRect.height + separator, width: plotWidth, height: differenceHeight };
    var axisRect = { x: left, y: differenceRect.y + differenceRect.height, width: plotWidth, height: bottom };
    var rightX = left + plotWidth;
    var synchronizedLength = Math.min(state.priceCandles.length, state.candles.length);
    var count = canonicalVisibleCount(synchronizedLength);
    var viewport = viewportFor(synchronizedLength, count);
    count = viewport.count;
    var start = viewport.start;
    state.renderEnd = viewport.end;
    state.renderCount = count;
    var actualStep = count ? plotWidth / count : plotWidth / CANONICAL_VISIBLE_BARS;
    var bodyWidth = clamp(actualStep * .63, 2, 12);
    var priceVisible = visibleSlice(state.priceCandles, start);
    var cvdVisible = visibleSlice(state.candles, start);
    var priceRange = valueRange(priceVisible);
    var cvdRange = valueRange(cvdVisible);
    var pricePressureMode = usesPricePressure();

    drawStackGrid(ctx, priceRect, priceRange, rightX, true, false);
    drawStackCandles(ctx, state.priceCandles, priceRect, priceRange, start, actualStep, bodyWidth, {
      up: '#00ef31',
      down: '#ff101d',
      upStroke: '#00ff47',
      downStroke: '#ff5962'
    });
    drawSwingMarkers(ctx, state.priceCandles, priceRect, priceRange, start, actualStep);
    drawSwingLegend(ctx, priceRect);
    var latestPrice = priceVisible[priceVisible.length - 1];
    drawStackTitle(ctx,
      state.symbol + (pricePressureMode ? ' · PRICE PRESSURE STACK · ' : ' · DELTA STACK · ') + state.timeframe,
      latestPrice ? 'O ' + formatPrice(latestPrice.open) + '  H ' + formatPrice(latestPrice.high) + '  L ' + formatPrice(latestPrice.low) + '  C ' + formatPrice(latestPrice.close) + (pricePressureMode ? '  STRUCT ' + formatValue(latestPrice.magnitude) : '  V ' + formatValue(latestPrice.volume)) : state.source,
      priceRect
    );
    if (latestPrice) {
      var rollingDelta = priceVisible.slice(-20).reduce(function (sum, row) { return sum + number(row.delta); }, 0);
      var badge = (pricePressureMode ? 'RP:' : 'RD:') + formatValue(Math.abs(rollingDelta));
      ctx.save();
      ctx.font = '950 13px "JetBrains Mono", monospace';
      var badgeWidth = ctx.measureText(badge).width + 12;
      ctx.fillStyle = '#ff8214';
      ctx.fillRect(priceRect.x + 82, priceRect.y + 43, badgeWidth, 23);
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, priceRect.x + 82 + badgeWidth / 2, priceRect.y + 54.5);
      ctx.restore();
    }

    drawStackGrid(ctx, cvdRect, cvdRange, rightX, false, pricePressureMode);
    if (pricePressureMode) {
      drawCumulativePressureStepArea(ctx, state.candles, cvdRect, cvdRange, start, actualStep);
    } else {
      drawStackCandles(ctx, state.candles, cvdRect, cvdRange, start, actualStep, bodyWidth, {
        up: '#fff',
        down: '#050505',
        upStroke: '#111',
        downStroke: '#050505'
      });
    }
    drawStackTitle(
      ctx,
      pricePressureMode ? 'Cumulative Price Pressure - Step Line' : 'Cumulative Delta Bars - Volume',
      pricePressureMode
        ? 'OHLC structural pressure | green rising / red falling | Current ' + formatValue(cvdVisible.length ? cvdVisible[cvdVisible.length - 1].close : 0)
        : 'Open ' + formatValue(cvdVisible.length ? cvdVisible[cvdVisible.length - 1].open : 0) + '  Close ' + formatValue(cvdVisible.length ? cvdVisible[cvdVisible.length - 1].close : 0),
      cvdRect
    );
    drawVolumeStrip(ctx, state.priceCandles, volumeRect, start, actualStep, bodyWidth, rightX);
    drawDifferencePanel(ctx, state.priceCandles, differenceRect, start, actualStep, bodyWidth, rightX);
    drawStackTimeAxis(ctx, state.priceCandles, start, axisRect, actualStep);
    drawCanonicalGapDividers(ctx, state.priceCandles, {
      x: left,
      y: priceRect.y,
      width: plotWidth,
      height: differenceRect.y + differenceRect.height - priceRect.y
    }, start, actualStep);
    state.layout = {
      start: start,
      count: count,
      x: left,
      width: plotWidth,
      step: actualStep,
      panels: [
        panelLayout('price', priceRect),
        panelLayout('cvd', cvdRect),
        panelLayout('volume', volumeRect, false),
        panelLayout('difference', differenceRect, false)
      ]
    };
    drawStackCrosshair(ctx, state.priceCandles, state.candles, start, { x: left, width: plotWidth }, actualStep);
  }

  function drawTradeGrid(ctx, rect, range, rightX) {
    ctx.save();
    ctx.fillStyle = '#030506';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    for (var column = 0; column <= 10; column += 1) {
      var x = rect.x + rect.width * column / 10;
      ctx.strokeStyle = column === 0 || column === 10 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.055)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, rect.y);
      ctx.lineTo(Math.round(x) + .5, rect.y + rect.height);
      ctx.stroke();
    }
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var row = 0; row <= 7; row += 1) {
      var y = rect.y + rect.height * row / 7;
      var value = range.max - (range.max - range.min) * row / 7;
      ctx.strokeStyle = row === 0 || row === 7 ? 'rgba(255,255,255,.17)' : 'rgba(255,255,255,.06)';
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,242,244,.76)';
      ctx.fillText(formatPrice(value), rightX + 7, y);
    }
    ctx.restore();
  }

  function drawTradeBlocks(ctx, rows, rect, range, start, step) {
    var visible = visibleSlice(rows, start);
    var maxDelta = 1;
    visible.forEach(function (row) { maxDelta = Math.max(maxDelta, Math.abs(number(row.delta))); });
    var cellHeight = clamp(rect.height / 43, 5, 11);
    var cellWidth = clamp(step * .78, 4, 19);
    var priceSpan = Math.max(.0000001, range.max - range.min);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    visible.forEach(function (row, offset) {
      var x = rect.x + step * offset + step / 2;
      var movement = Math.abs(number(row.close) - number(row.open));
      var levels = clamp(Math.round(movement / priceSpan * rect.height / Math.max(5, cellHeight)) + 1, 1, 4);
      var positive = number(row.delta) === 0 ? row.close >= row.open : number(row.delta) > 0;
      var fill = positive ? '#00dc2a' : '#ff071b';
      var edge = positive ? '#00ff41' : '#ff4151';
      var strength = .58 + .42 * Math.min(1, Math.abs(number(row.delta)) / maxDelta * 2.4);
      for (var level = 0; level < levels; level += 1) {
        var ratio = levels === 1 ? 1 : level / (levels - 1);
        var price = number(row.open) + (number(row.close) - number(row.open)) * ratio;
        var y = yFor(price, range, rect);
        ctx.globalAlpha = strength;
        ctx.shadowColor = fill;
        ctx.shadowBlur = 6;
        ctx.fillStyle = fill;
        ctx.fillRect(Math.round(x - cellWidth / 2), Math.round(y - cellHeight / 2), Math.max(3, Math.round(cellWidth)), Math.max(3, Math.round(cellHeight)));
        ctx.shadowBlur = 0;
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x - cellWidth / 2) + .5, Math.round(y - cellHeight / 2) + .5, Math.max(2, Math.round(cellWidth) - 1), Math.max(2, Math.round(cellHeight) - 1));
      }
    });
    ctx.restore();
  }

  function drawCvdHistogram(ctx, rows, rect, start, step, rightX) {
    var visible = visibleSlice(rows, start);
    var min = Infinity;
    var max = -Infinity;
    visible.forEach(function (row) {
      min = Math.min(min, number(row.close));
      max = Math.max(max, number(row.close));
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (min === max) {
      var around = Math.abs(min) || 1;
      min -= around * .1;
      max += around * .1;
    }
    var span = Math.max(.000001, max - min);
    var displayMin = min - span * .11;
    var displayMax = max + span * .06;
    var range = { min: displayMin, max: displayMax };
    ctx.save();
    ctx.fillStyle = '#020405';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    for (var i = 0; i <= 4; i += 1) {
      var y = rect.y + rect.height * i / 4;
      var axisValue = displayMax - (displayMax - displayMin) * i / 4;
      ctx.strokeStyle = i === 0 || i === 4 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.055)';
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,242,244,.70)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatValue(axisValue), rightX + 7, y);
    }
    var bodyWidth = clamp(step * .86, 3, 22);
    visible.forEach(function (row, offset) {
      var x = rect.x + step * offset + step / 2;
      var normalized = clamp((number(row.close) - displayMin) / (displayMax - displayMin), .02, 1);
      var barHeight = Math.max(2, normalized * (rect.height - 2));
      var top = rect.y + rect.height - barHeight;
      ctx.fillStyle = '#00a918';
      ctx.shadowColor = 'rgba(0,226,46,.36)';
      ctx.shadowBlur = 4;
      ctx.fillRect(Math.round(x - bodyWidth / 2), Math.round(top), Math.max(2, Math.round(bodyWidth)), Math.round(barHeight));
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#006f10';
      ctx.strokeRect(Math.round(x - bodyWidth / 2) + .5, Math.round(top) + .5, Math.max(1, Math.round(bodyWidth) - 1), Math.max(1, Math.round(barHeight) - 1));
    });
    ctx.fillStyle = '#fff';
    ctx.font = '900 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(usesPricePressure() ? 'Cumulative Price Pressure' : usesBinanceKlines() ? 'Taker Net Delta · UTC Day' : 'Cumulative Delta (Bars, True)', rect.x + 4, rect.y + 5);
    if (visible.length) {
      var latest = visible[visible.length - 1];
      var latestY = clamp(yFor(latest.close, range, rect), rect.y + 10, rect.y + rect.height - 10);
      var label = formatValue(latest.close);
      ctx.font = '900 9px "JetBrains Mono", monospace';
      var labelWidth = Math.max(45, ctx.measureText(label).width + 10);
      ctx.fillStyle = '#009e17';
      ctx.fillRect(rightX + 2, latestY - 9, labelWidth, 18);
      ctx.fillStyle = '#020805';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, rightX + 2 + labelWidth / 2, latestY);
    }
    ctx.restore();
    return range;
  }

  function drawTradeLatestTag(ctx, row, range, rect, rightX) {
    if (!row) return;
    var positive = number(row.delta) === 0 ? row.close >= row.open : number(row.delta) > 0;
    var y = clamp(yFor(row.close, range, rect), rect.y + 10, rect.y + rect.height - 10);
    var label = formatPrice(row.close);
    ctx.save();
    ctx.font = '900 8px "JetBrains Mono", monospace';
    var width = Math.max(54, ctx.measureText(label).width + 10);
    ctx.fillStyle = positive ? '#00d62b' : '#ff0b21';
    ctx.fillRect(rightX + 2, y - 9, width, 18);
    ctx.fillStyle = '#020504';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rightX + 2 + width / 2, y);
    ctx.restore();
  }

  function drawTradeCrosshair(ctx, priceRows, cvdRows, start, plot, topRect, bottomRect, step, priceRange) {
    var index = state.hoverIndex;
    if (index == null || index < start || index >= priceRows.length) return;
    var panel = activeHoverPanel();
    if (!panel) return;
    var price = priceRows[index];
    var cvd = cvdRows[index];
    if (!price || !cvd) return;
    var x = plot.x + step * (index - start) + step / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.width, panel.height);
    ctx.clip();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,.46)';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + .5, panel.y);
    ctx.lineTo(Math.round(x) + .5, panel.y + panel.height);
    ctx.stroke();
    ctx.setLineDash([]);
    var showPrice = panel.id === 'trade' || panel.id === 'price';
    if (showPrice) {
      var y = yFor(price.close, priceRange, topRect);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    var boxWidth = crosshairBoxWidth(370, plot);
    var boxHeight = 70;
    var boxX = crosshairBoxX(x, boxWidth, plot, 13);
    var boxY = crosshairBoxY(panel, boxHeight, 34);
    if (boxY == null) {
      drawCompactCrosshairTooltip(
        ctx,
        panel,
        plot,
        x,
        price.time,
        (panel.id === 'cvd' ? (usesPricePressure() ? 'CUM PRESSURE ' : 'CVD ') + formatValue(cvd.close) : 'PRICE ' + formatPrice(price.close)) + ' · Δ ' + formatValue(panel.id === 'cvd' ? cvd.delta : price.delta),
        (panel.id === 'cvd' ? cvd.delta : price.delta) >= 0 ? '#48ff71' : '#ff6675',
        'rgba(4,7,8,.96)',
        price.delta >= 0 ? 'rgba(0,239,63,.55)' : 'rgba(255,20,40,.58)'
      );
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(4,7,8,.96)';
    ctx.strokeStyle = price.delta >= 0 ? 'rgba(0,239,63,.55)' : 'rgba(255,20,40,.58)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    ctx.fillStyle = '#fff';
    ctx.font = '900 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(formatTooltipDateTime(price.time) + '  ' + state.symbol + '  ' + state.timeframe, boxX + 8, boxY + 7);
    ctx.font = '750 8px "JetBrains Mono", monospace';
    if (panel.id === 'cvd') {
      ctx.fillText((usesPricePressure() ? 'CUM PRESSURE' : 'CVD') + ' O ' + formatValue(cvd.open) + '  H ' + formatValue(cvd.high), boxX + 8, boxY + 25);
      ctx.fillText('L ' + formatValue(cvd.low) + '  C ' + formatValue(cvd.close), boxX + 8, boxY + 43);
      ctx.fillStyle = cvd.delta >= 0 ? '#48ff71' : '#ff6675';
      ctx.fillText('BAR Δ ' + formatValue(cvd.delta), boxX + 8, boxY + 57);
    } else {
      ctx.fillText('PRICE ' + formatPrice(price.close) + (usesPricePressure()
        ? '  STRUCT MAG ' + formatValue(price.magnitude)
        : '  VOLUME ' + formatValue(price.volume)), boxX + 8, boxY + 25);
      ctx.fillStyle = price.delta >= 0 ? '#48ff71' : '#ff6675';
      ctx.fillText((usesPricePressure() ? 'STRUCT PRESSURE ' : 'TRADE Δ ') + formatValue(price.delta) + (usesPricePressure() ? '  CUM PRESSURE ' : '  CVD ') + formatValue(cvd.close), boxX + 8, boxY + 43);
      ctx.fillStyle = 'rgba(231,239,241,.65)';
      ctx.fillText((usesPricePressure() ? 'UP ' : 'BUY ') + formatValue(price.buy) + (usesPricePressure() ? '  DOWN ' : '  SELL ') + formatValue(price.sell), boxX + 8, boxY + 57);
    }
    ctx.restore();
  }

  function renderViewThree() {
    if (!state.open || !state.canvas || !state.ctx) return;
    if (!resizeCanvas()) return;
    var canvas = state.canvas;
    var bounds = canvas.getBoundingClientRect();
    var width = bounds.width;
    var height = bounds.height;
    var ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#020405';
    ctx.fillRect(0, 0, width, height);

    var left = 12;
    var right = width < 620 ? 62 : 76;
    var top = 5;
    var bottom = 25;
    var gap = 5;
    var plotWidth = Math.max(100, width - left - right);
    var usable = Math.max(220, height - top - bottom - gap);
    var tradeHeight = Math.floor(usable * .58);
    var cvdHeight = usable - tradeHeight;
    var tradeRect = { x: left, y: top, width: plotWidth, height: tradeHeight };
    var cvdRect = { x: left, y: tradeRect.y + tradeRect.height + gap, width: plotWidth, height: cvdHeight };
    var axisRect = { x: left, y: cvdRect.y + cvdRect.height, width: plotWidth, height: bottom };
    var rightX = left + plotWidth;
    var synchronizedLength = Math.min(state.priceCandles.length, state.candles.length);
    var count = canonicalVisibleCount(synchronizedLength);
    var viewport = viewportFor(synchronizedLength, count);
    count = viewport.count;
    var start = viewport.start;
    state.renderEnd = viewport.end;
    state.renderCount = count;
    var step = count ? plotWidth / count : plotWidth / CANONICAL_VISIBLE_BARS;
    var priceVisible = visibleSlice(state.priceCandles, start);
    var priceRange = valueRange(priceVisible);
    var pricePressureMode = usesPricePressure();

    drawTradeGrid(ctx, tradeRect, priceRange, rightX);
    drawTradeBlocks(ctx, state.priceCandles, tradeRect, priceRange, start, step);
    ctx.save();
    ctx.fillStyle = 'rgba(242,247,248,.92)';
    ctx.font = '900 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(state.symbol + (pricePressureMode ? ' · PRICE-MOVEMENT BLOCKS · ' : usesBinanceKlines() ? ' · ESTIMATED TRADE BLOCKS · ' : ' · Cumulative Trades [from 20 to 0 lots] · ') + state.timeframe, tradeRect.x + 4, tradeRect.y + 5);
    ctx.fillStyle = 'rgba(224,234,237,.52)';
    ctx.font = '750 8px "JetBrains Mono", monospace';
    ctx.fillText(state.source + (pricePressureMode ? ' · green upward / red downward movement' : ' · green buy pressure / red sell pressure') + ' · scroll to zoom', tradeRect.x + 4, tradeRect.y + 21);
    ctx.restore();
    drawTradeLatestTag(ctx, priceVisible[priceVisible.length - 1], priceRange, tradeRect, rightX);
    drawCvdHistogram(ctx, state.candles, cvdRect, start, step, rightX);
    drawStackTimeAxis(ctx, state.priceCandles, start, axisRect, step);
    drawCanonicalGapDividers(ctx, state.priceCandles, {
      x: left,
      y: tradeRect.y,
      width: plotWidth,
      height: cvdRect.y + cvdRect.height - tradeRect.y
    }, start, step);
    state.layout = {
      start: start,
      count: count,
      x: left,
      width: plotWidth,
      step: step,
      panels: [panelLayout('trade', tradeRect), panelLayout('cvd', cvdRect)]
    };
    drawTradeCrosshair(ctx, state.priceCandles, state.candles, start, { x: left, width: plotWidth }, tradeRect, cvdRect, step, priceRange);
  }

  function drawFocusedDifference(ctx, rows, rect, start, step, bodyWidth, rightX) {
    var range = drawDifferencePanel(ctx, rows, rect, start, step, bodyWidth, rightX);
    var visible = visibleSlice(rows, start);
    var threshold = range.max * .55;
    ctx.save();
    [threshold, -threshold].forEach(function (value) {
      var y = yFor(value, range, rect);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,.72)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    var latest = visible[visible.length - 1];
    if (latest) {
      var ask = number(latest.buy);
      var bid = number(latest.sell);
      var difference = number(latest.delta);
      var text = usesPricePressure()
        ? 'UP ' + formatValue(ask) + '   DOWN ' + formatValue(bid) + '   NET ' + formatValue(difference)
        : 'ASK ' + formatValue(ask) + '   BID ' + formatValue(bid) + '   Δ ' + formatValue(difference);
      ctx.font = '900 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = difference >= 0 ? '#fff' : '#090909';
      ctx.fillText(text, rect.x + rect.width - 7, rect.y + 5);
      var tagY = clamp(yFor(difference, range, rect), rect.y + 10, rect.y + rect.height - 10);
      var tagText = formatValue(difference);
      var tagWidth = Math.max(45, ctx.measureText(tagText).width + 10);
      ctx.fillStyle = difference >= 0 ? '#fff' : '#050505';
      ctx.fillRect(rightX + 2, tagY - 9, tagWidth, 18);
      ctx.fillStyle = difference >= 0 ? '#111' : '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, rightX + 2 + tagWidth / 2, tagY);
    }
    ctx.restore();
    return range;
  }

  function renderViewFour() {
    if (!state.open || !state.canvas || !state.ctx) return;
    if (!resizeCanvas()) return;
    var canvas = state.canvas;
    var bounds = canvas.getBoundingClientRect();
    var width = bounds.width;
    var height = bounds.height;
    var ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, width, height);

    var left = 8;
    var right = width < 620 ? 61 : 72;
    var top = 5;
    var bottom = 23;
    var separator = 4;
    var plotWidth = Math.max(100, width - left - right);
    var usable = Math.max(250, height - top - bottom - separator * 3);
    var priceHeight = Math.floor(usable * .34);
    var cvdHeight = Math.floor(usable * .19);
    var volumeHeight = Math.max(32, Math.floor(usable * .07));
    var differenceHeight = usable - priceHeight - cvdHeight - volumeHeight;
    var priceRect = { x: left, y: top, width: plotWidth, height: priceHeight };
    var cvdRect = { x: left, y: priceRect.y + priceRect.height + separator, width: plotWidth, height: cvdHeight };
    var volumeRect = { x: left, y: cvdRect.y + cvdRect.height + separator, width: plotWidth, height: volumeHeight };
    var differenceRect = { x: left, y: volumeRect.y + volumeRect.height + separator, width: plotWidth, height: differenceHeight };
    var axisRect = { x: left, y: differenceRect.y + differenceRect.height, width: plotWidth, height: bottom };
    var rightX = left + plotWidth;
    var synchronizedLength = Math.min(state.priceCandles.length, state.candles.length);
    var count = canonicalVisibleCount(synchronizedLength);
    var viewport = viewportFor(synchronizedLength, count);
    count = viewport.count;
    var start = viewport.start;
    state.renderEnd = viewport.end;
    state.renderCount = count;
    var step = count ? plotWidth / count : plotWidth / CANONICAL_VISIBLE_BARS;
    var bodyWidth = clamp(step * .64, 2, 12);
    var priceVisible = visibleSlice(state.priceCandles, start);
    var cvdVisible = visibleSlice(state.candles, start);
    var priceRange = valueRange(priceVisible);
    var cvdRange = valueRange(cvdVisible);
    var pricePressureMode = usesPricePressure();

    drawStackGrid(ctx, priceRect, priceRange, rightX, true, false);
    drawStackCandles(ctx, state.priceCandles, priceRect, priceRange, start, step, bodyWidth, {
      up: '#00ef31',
      down: '#ff101d',
      upStroke: '#00ff47',
      downStroke: '#ff5962'
    });
    drawSwingMarkers(ctx, state.priceCandles, priceRect, priceRange, start, step);
    drawSwingLegend(ctx, priceRect);
    var latestPrice = priceVisible[priceVisible.length - 1];
    drawStackTitle(ctx,
      state.symbol + (pricePressureMode ? ' · UP/DOWN PRICE PRESSURE · ' : ' · ASK/BID DIFFERENCE · ') + state.timeframe,
      latestPrice ? 'O ' + formatPrice(latestPrice.open) + '  H ' + formatPrice(latestPrice.high) + '  L ' + formatPrice(latestPrice.low) + '  C ' + formatPrice(latestPrice.close) : state.source,
      priceRect
    );
    if (latestPrice) {
      var rollingDelta = priceVisible.slice(-20).reduce(function (sum, row) { return sum + number(row.delta); }, 0);
      var badge = (pricePressureMode ? 'RP:' : 'RD:') + formatValue(Math.abs(rollingDelta));
      ctx.save();
      ctx.font = '950 12px "JetBrains Mono", monospace';
      var badgeWidth = ctx.measureText(badge).width + 12;
      ctx.fillStyle = '#ff8214';
      ctx.fillRect(priceRect.x + 84, priceRect.y + 40, badgeWidth, 22);
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, priceRect.x + 84 + badgeWidth / 2, priceRect.y + 51);
      ctx.restore();
    }

    drawStackGrid(ctx, cvdRect, cvdRange, rightX, false, pricePressureMode);
    if (pricePressureMode) {
      drawCumulativePressureStepArea(ctx, state.candles, cvdRect, cvdRange, start, step);
    } else {
      drawStackCandles(ctx, state.candles, cvdRect, cvdRange, start, step, bodyWidth, {
        up: '#fff',
        down: '#050505',
        upStroke: '#111',
        downStroke: '#050505'
      });
    }
    drawStackTitle(
      ctx,
      pricePressureMode ? 'Cumulative Price Pressure - Step Line' : 'Cumulative Delta Bars - Volume',
      pricePressureMode
        ? 'OHLC structural pressure | green rising / red falling | Current ' + formatValue(cvdVisible.length ? cvdVisible[cvdVisible.length - 1].close : 0)
        : 'Live session pressure context',
      cvdRect
    );
    drawVolumeStrip(ctx, state.priceCandles, volumeRect, start, step, bodyWidth, rightX);
    drawFocusedDifference(ctx, state.priceCandles, differenceRect, start, step, bodyWidth, rightX);
    drawStackTimeAxis(ctx, state.priceCandles, start, axisRect, step);
    drawCanonicalGapDividers(ctx, state.priceCandles, {
      x: left,
      y: priceRect.y,
      width: plotWidth,
      height: differenceRect.y + differenceRect.height - priceRect.y
    }, start, step);
    state.layout = {
      start: start,
      count: count,
      x: left,
      width: plotWidth,
      step: step,
      panels: [
        panelLayout('price', priceRect),
        panelLayout('cvd', cvdRect),
        panelLayout('volume', volumeRect, false),
        panelLayout('difference', differenceRect, false)
      ]
    };
    drawTradeCrosshair(ctx, state.priceCandles, state.candles, start, { x: left, width: plotWidth }, priceRect, differenceRect, step, priceRange);
  }

  function combinedMultiRange(start) {
    var min = Infinity;
    var max = -Infinity;
    state.multiCandles.forEach(function (series) {
      visibleSlice(series, start).forEach(function (row) {
        min = Math.min(min, number(row.low), number(row.close));
        max = Math.max(max, number(row.high), number(row.close));
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
    if (min === max) {
      var around = Math.abs(min) || 1;
      min -= around * .1;
      max += around * .1;
    }
    var padding = Math.max(.000001, (max - min) * .11);
    return { min: min - padding, max: max + padding };
  }

  function drawMultiGrid(ctx, rect, range, rightX, priceScale) {
    ctx.save();
    ctx.fillStyle = '#111625';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    for (var column = 0; column <= 9; column += 1) {
      var x = rect.x + rect.width * column / 9;
      ctx.strokeStyle = column === 0 || column === 9 ? 'rgba(118,142,181,.24)' : 'rgba(99,120,155,.11)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, rect.y);
      ctx.lineTo(Math.round(x) + .5, rect.y + rect.height);
      ctx.stroke();
    }
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var row = 0; row <= 5; row += 1) {
      var y = rect.y + rect.height * row / 5;
      var value = range.max - (range.max - range.min) * row / 5;
      ctx.strokeStyle = row === 0 || row === 5 ? 'rgba(118,142,181,.26)' : 'rgba(99,120,155,.13)';
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(210,220,234,.72)';
      ctx.fillText(priceScale ? formatPrice(value) : formatValue(value), rightX + 7, y);
    }
    if (!priceScale && range.min < 0 && range.max > 0) {
      var zeroY = yFor(0, range, rect);
      ctx.strokeStyle = 'rgba(179,195,219,.34)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(zeroY) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(zeroY) + .5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawMultiLegend(ctx, rect) {
    ctx.save();
    ctx.textBaseline = 'middle';
    var x = rect.x + 6;
    MULTI_FILTERS.forEach(function (filter, index) {
      var label = 'F' + (index + 1) + '  ' + (usesPricePressure() ? PRESSURE_FILTER_LABELS[index] + ' price moves' : usesBinanceKlines() ? 'model estimate' : filter.label + ' lots');
      ctx.font = '850 7.5px "JetBrains Mono", monospace';
      var width = ctx.measureText(label).width + 21;
      ctx.fillStyle = 'rgba(5,8,14,.82)';
      ctx.fillRect(x, rect.y + 25, width, 19);
      ctx.fillStyle = filter.color;
      ctx.fillRect(x + 5, rect.y + 31, 9, Math.max(2, filter.width));
      ctx.fillStyle = 'rgba(232,238,247,.80)';
      ctx.fillText(label, x + 17, rect.y + 34.5);
      x += width + 5;
    });
    ctx.restore();
  }

  function drawMultiLines(ctx, rect, range, start, step, rightX) {
    var latestLabels = [];
    state.multiCandles.forEach(function (series, index) {
      var visible = visibleSlice(series, start);
      if (!visible.length) return;
      var filter = MULTI_FILTERS[index];
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      ctx.beginPath();
      visible.forEach(function (row, offset) {
        var x = rect.x + step * offset + step / 2;
        var y = yFor(row.close, range, rect);
        if (offset === 0 || row.gapBefore === true) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = filter.color;
      ctx.lineWidth = filter.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = filter.color;
      ctx.shadowBlur = filter.width >= 4 ? 3 : 1;
      ctx.stroke();
      ctx.restore();
      var latest = visible[visible.length - 1];
      latestLabels.push({
        index: index,
        color: filter.color,
        text: formatValue(latest.close),
        rawY: yFor(latest.close, range, rect),
        y: yFor(latest.close, range, rect)
      });
    });
    latestLabels.sort(function (a, b) { return a.rawY - b.rawY; });
    latestLabels.forEach(function (label, index) {
      var minY = index === 0 ? rect.y + 10 : latestLabels[index - 1].y + 17;
      label.y = Math.max(minY, label.rawY);
    });
    for (var i = latestLabels.length - 1; i >= 0; i -= 1) {
      var maxY = i === latestLabels.length - 1 ? rect.y + rect.height - 10 : latestLabels[i + 1].y - 17;
      latestLabels[i].y = Math.min(maxY, latestLabels[i].y);
    }
    ctx.save();
    ctx.font = '900 8px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    latestLabels.forEach(function (label) {
      var width = Math.max(46, ctx.measureText(label.text).width + 11);
      ctx.fillStyle = label.color;
      ctx.fillRect(rightX + 2, label.y - 8, width, 16);
      ctx.fillStyle = label.index === 3 ? '#fff' : '#071018';
      ctx.textAlign = 'center';
      ctx.fillText(label.text, rightX + 2 + width / 2, label.y);
    });
    ctx.restore();
  }

  function drawMultiCrosshair(ctx, priceRows, start, plot, priceRect, multiRect, step, priceRange) {
    var index = state.hoverIndex;
    if (index == null || index < start || index >= priceRows.length) return;
    var panel = activeHoverPanel();
    if (!panel || (panel.id !== 'price' && panel.id !== 'multi')) return;
    var price = priceRows[index];
    if (!price) return;
    var x = plot.x + step * (index - start) + step / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.width, panel.height);
    ctx.clip();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(210,223,241,.48)';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + .5, panel.y);
    ctx.lineTo(Math.round(x) + .5, panel.y + panel.height);
    ctx.stroke();
    ctx.setLineDash([]);
    if (panel.id === 'price') {
      var priceY = yFor(price.close, priceRange, priceRect);
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath();
      ctx.arc(x, priceY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    var boxWidth = crosshairBoxWidth(350, plot);
    var boxHeight = 119;
    var boxX = crosshairBoxX(x, boxWidth, plot, 13);
    var boxY = crosshairBoxY(panel, boxHeight, 34);
    if (boxY == null) {
      var compactMultiLine = state.multiCandles.map(function (series, filterIndex) {
        var seriesRow = series[index];
        return 'F' + (filterIndex + 1) + ' ' + formatValue(seriesRow && seriesRow.close);
      }).join(' ');
      drawCompactCrosshairTooltip(
        ctx,
        panel,
        plot,
        x,
        price.time,
        panel.id === 'multi' ? compactMultiLine : 'PRICE ' + formatPrice(price.close) + ' · Δ ' + formatValue(price.delta),
        price.delta >= 0 ? '#8ee6ff' : '#ff7990',
        'rgba(8,12,22,.96)',
        'rgba(135,206,235,.44)'
      );
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(8,12,22,.96)';
    ctx.strokeStyle = 'rgba(135,206,235,.44)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = '900 8px "JetBrains Mono", monospace';
    ctx.fillText(formatTooltipDateTime(price.time) + '  ' + state.symbol + '  ' + state.timeframe, boxX + 8, boxY + 7);
    ctx.fillStyle = 'rgba(226,235,247,.74)';
    ctx.fillText('PRICE ' + formatPrice(price.close) + (usesPricePressure()
      ? '   MOVE MAG ' + formatValue(price.magnitude)
      : '   VOL ' + formatValue(price.volume)), boxX + 8, boxY + 23);
    state.multiCandles.forEach(function (series, filterIndex) {
      var row = series[index];
      if (!row) return;
      ctx.fillStyle = MULTI_FILTERS[filterIndex].color;
      ctx.fillText('F' + (filterIndex + 1) + '  ' + (usesPricePressure() ? PRESSURE_FILTER_LABELS[filterIndex] : usesBinanceKlines() ? 'estimate' : MULTI_FILTERS[filterIndex].label) + '   ' + formatValue(row.close), boxX + 8, boxY + 42 + filterIndex * 14);
    });
    ctx.restore();
  }

  function renderViewFive() {
    if (!state.open || !state.canvas || !state.ctx) return;
    if (!resizeCanvas()) return;
    var canvas = state.canvas;
    var bounds = canvas.getBoundingClientRect();
    var width = bounds.width;
    var height = bounds.height;
    var ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1220';
    ctx.fillRect(0, 0, width, height);

    var left = 10;
    var right = width < 620 ? 62 : 76;
    var top = 5;
    var bottom = 25;
    var gap = 5;
    var plotWidth = Math.max(100, width - left - right);
    var usable = Math.max(220, height - top - bottom - gap);
    var priceHeight = Math.floor(usable * .52);
    var multiHeight = usable - priceHeight;
    var priceRect = { x: left, y: top, width: plotWidth, height: priceHeight };
    var multiRect = { x: left, y: priceRect.y + priceRect.height + gap, width: plotWidth, height: multiHeight };
    var axisRect = { x: left, y: multiRect.y + multiRect.height, width: plotWidth, height: bottom };
    var rightX = left + plotWidth;
    var synchronizedLength = Math.min(state.priceCandles.length, state.candles.length);
    var count = canonicalVisibleCount(synchronizedLength);
    var viewport = viewportFor(synchronizedLength, count);
    count = viewport.count;
    var start = viewport.start;
    state.renderEnd = viewport.end;
    state.renderCount = count;
    var step = count ? plotWidth / count : plotWidth / CANONICAL_VISIBLE_BARS;
    var bodyWidth = clamp(step * .42, 2, 8);
    var priceVisible = visibleSlice(state.priceCandles, start);
    var priceRange = valueRange(priceVisible);
    var multiRange = combinedMultiRange(start);

    drawMultiGrid(ctx, priceRect, priceRange, rightX, true);
    drawStackCandles(ctx, state.priceCandles, priceRect, priceRange, start, step, bodyWidth, {
      up: '#008f83',
      down: '#a83258',
      upStroke: '#12bbaa',
      downStroke: '#d54b76'
    });
    var latestPrice = priceVisible[priceVisible.length - 1];
    var pricePressureMode = usesPricePressure();
    ctx.save();
    ctx.fillStyle = 'rgba(238,244,251,.92)';
    ctx.font = '900 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(state.symbol + (pricePressureMode ? ' · PRICE PRESSURE BY STRUCTURAL MAGNITUDE · ' : usesBinanceKlines() ? ' · MODELLED CVD · ' : ' · MULTI-MARKET CVD · ') + state.timeframe, priceRect.x + 5, priceRect.y + 5);
    ctx.fillStyle = 'rgba(196,210,229,.56)';
    ctx.font = '750 8px "JetBrains Mono", monospace';
    ctx.fillText(latestPrice ? 'O ' + formatPrice(latestPrice.open) + '  H ' + formatPrice(latestPrice.high) + '  L ' + formatPrice(latestPrice.low) + '  C ' + formatPrice(latestPrice.close) : state.source, priceRect.x + 5, priceRect.y + 21);
    ctx.restore();
    if (latestPrice) {
      ctx.save();
      var priceY = clamp(yFor(latestPrice.close, priceRange, priceRect), priceRect.y + 10, priceRect.y + priceRect.height - 10);
      var priceText = formatPrice(latestPrice.close);
      ctx.font = '900 8px "JetBrains Mono", monospace';
      var priceTagWidth = Math.max(54, ctx.measureText(priceText).width + 10);
      ctx.fillStyle = latestPrice.close >= latestPrice.open ? '#18b8a7' : '#d84372';
      ctx.fillRect(rightX + 2, priceY - 9, priceTagWidth, 18);
      ctx.fillStyle = '#071018';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceText, rightX + 2 + priceTagWidth / 2, priceY);
      ctx.restore();
    }

    drawMultiGrid(ctx, multiRect, multiRange, rightX, false);
    drawMultiLines(ctx, multiRect, multiRange, start, step, rightX);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '900 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(pricePressureMode ? 'Cumulative Price Pressure · One structural-magnitude bucket per candle / quote' : usesBinanceKlines() ? 'Modelled CVD components · estimates, not size buckets · 00:00 UTC reset' : 'CVD pro (multi) · Cumulative Trades by Volume Filter', multiRect.x + 5, multiRect.y + 5);
    ctx.restore();
    drawMultiLegend(ctx, multiRect);
    drawStackTimeAxis(ctx, state.priceCandles, start, axisRect, step);
    drawCanonicalGapDividers(ctx, state.priceCandles, {
      x: left,
      y: priceRect.y,
      width: plotWidth,
      height: multiRect.y + multiRect.height - priceRect.y
    }, start, step);
    state.layout = {
      start: start,
      count: count,
      x: left,
      width: plotWidth,
      step: step,
      panels: [panelLayout('price', priceRect), panelLayout('multi', multiRect)]
    };
    drawMultiCrosshair(ctx, state.priceCandles, start, { x: left, width: plotWidth }, priceRect, multiRect, step, priceRange);
  }

  function render() {
    if (state.activeView === 5) renderViewFive();
    else if (state.activeView === 4) renderViewFour();
    else if (state.activeView === 3) renderViewThree();
    else if (state.activeView === 2) renderViewTwo();
    else renderViewOne();
  }

  function bindCanvas(canvas) {
    if (!canvas || canvas.getAttribute('data-gp-m1cd-bound')) return;
    canvas.setAttribute('data-gp-m1cd-bound', VERSION);
    var pinchStartDistance = 0;
    var pinchStartZoom = state.zoom;
    var touchPanStartX = 0;
    var touchPanStartOffset = 0;
    var mouseDrag = false;
    var mouseDragStartX = 0;
    var mouseDragStartOffset = 0;
    canvas.style.touchAction = 'none';

    function touchDistance(touches) {
      if (!touches || touches.length < 2) return 0;
      var dx = number(touches[0].clientX) - number(touches[1].clientX);
      var dy = number(touches[0].clientY) - number(touches[1].clientY);
      return Math.sqrt(dx * dx + dy * dy);
    }

    function updateHoverAt(clientX, clientY) {
      if (!state.layout || !state.layout.count) {
        clearHover();
        return;
      }
      var rect = canvas.getBoundingClientRect();
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      var nextHoverIndex = null;
      var nextHoverPanel = null;
      if (x >= state.layout.x && x <= state.layout.x + state.layout.width) {
        var panels = Array.isArray(state.layout.panels) ? state.layout.panels : [];
        for (var panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
          var panel = panels[panelIndex];
          if (y >= panel.y && y <= panel.y + panel.height) {
            nextHoverPanel = panel.id;
            break;
          }
        }
      }
      if (nextHoverPanel != null) {
        var offset = Math.floor((x - state.layout.x) / state.layout.step);
        nextHoverIndex = clamp(state.layout.start + offset, state.layout.start, state.layout.start + state.layout.count - 1);
      }
      if (nextHoverIndex === state.hoverIndex && nextHoverPanel === state.hoverPanel) return;
      state.hoverIndex = nextHoverIndex;
      state.hoverPanel = nextHoverPanel;
      scheduleRender();
    }

    canvas.addEventListener('mousemove', function (event) {
      if (mouseDrag) {
        clearHover();
        return;
      }
      updateHoverAt(event.clientX, event.clientY);
    });
    canvas.addEventListener('mouseleave', function () {
      clearHover();
    });
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      clearHover();
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        var panDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        setEndOffset(state.endOffset + (panDelta > 0 ? 4 : -4));
      } else {
        setChartZoom(state.zoom + (event.deltaY < 0 ? .12 : -.12));
      }
    }, { passive: false });
    canvas.addEventListener('pointerdown', function (event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (event.button != null && event.button !== 0) return;
      clearHover();
      mouseDrag = true;
      mouseDragStartX = event.clientX;
      mouseDragStartOffset = state.endOffset;
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!mouseDrag || (event.pointerType && event.pointerType !== 'mouse')) return;
      var step = Math.max(3, state.layout && state.layout.step || 8);
      setEndOffset(mouseDragStartOffset + (event.clientX - mouseDragStartX) / step);
    });
    function finishMouseDrag(event, restoreHover) {
      if (!mouseDrag) return;
      mouseDrag = false;
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
      if (restoreHover && (!event.pointerType || event.pointerType === 'mouse')) updateHoverAt(event.clientX, event.clientY);
      else clearHover();
    }
    canvas.addEventListener('pointerup', function (event) { finishMouseDrag(event, true); });
    canvas.addEventListener('pointercancel', function (event) { finishMouseDrag(event, false); });
    canvas.addEventListener('lostpointercapture', function () {
      if (!mouseDrag) return;
      mouseDrag = false;
      clearHover();
    });
    canvas.addEventListener('touchstart', function (event) {
      if (!event.touches || !event.touches.length) return;
      clearHover();
      if (event.touches.length === 1) {
        touchPanStartX = event.touches[0].clientX;
        touchPanStartOffset = state.endOffset;
        pinchStartDistance = 0;
        return;
      }
      pinchStartDistance = touchDistance(event.touches);
      pinchStartZoom = state.zoom;
      if (pinchStartDistance > 0) event.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', function (event) {
      if (!event.touches || !event.touches.length) return;
      if (event.touches.length === 1 && !(pinchStartDistance > 0)) {
        event.preventDefault();
        var step = Math.max(3, state.layout && state.layout.step || 8);
        setEndOffset(touchPanStartOffset + (event.touches[0].clientX - touchPanStartX) / step);
        return;
      }
      if (event.touches.length !== 2 || !(pinchStartDistance > 0)) return;
      var distance = touchDistance(event.touches);
      if (!(distance > 0)) return;
      event.preventDefault();
      setChartZoom(pinchStartZoom * distance / pinchStartDistance);
    }, { passive: false });
    canvas.addEventListener('touchend', function (event) {
      if (event.touches && event.touches.length >= 2) return;
      pinchStartDistance = 0;
      pinchStartZoom = state.zoom;
      touchPanStartX = 0;
      touchPanStartOffset = state.endOffset;
    }, { passive: true });
    canvas.addEventListener('touchcancel', function () {
      clearHover();
      pinchStartDistance = 0;
      pinchStartZoom = state.zoom;
      touchPanStartX = 0;
      touchPanStartOffset = state.endOffset;
    }, { passive: true });
    window.addEventListener('blur', function () {
      mouseDrag = false;
      pinchStartDistance = 0;
      clearHover();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) return;
      mouseDrag = false;
      pinchStartDistance = 0;
      clearHover();
    });
  }

  function fetchJson(url, timeoutMs, requestInit) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, timeoutMs || 7000);
    var options = Object.assign({ cache: 'no-store' }, requestInit || {});
    if (controller && options.signal) {
      var externalSignal = options.signal;
      externalSignal.addEventListener('abort', function () { controller.abort(); }, { once: true });
      options.signal = controller.signal;
    } else if (controller) options.signal = controller.signal;
    return fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || (payload && payload.ok === false)) {
          var nestedError = payload && payload.error && typeof payload.error === 'object' ? payload.error : null;
          var message = String(nestedError && (nestedError.message || nestedError.code) ||
            payload && (payload.error || payload.message || payload.code) || ('HTTP ' + response.status));
          var error = new Error(message);
          error.code = String(nestedError && nestedError.code || payload && payload.code || '');
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    }).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function abortBinanceHistory() {
    var controller = state.binanceHistoryController;
    state.binanceHistoryController = null;
    if (controller) {
      try { controller.abort(); } catch (_) {}
    }
  }

  function binanceHistoryRequest() {
    if (typeof AbortController === 'undefined') return {};
    abortBinanceHistory();
    var controller = new AbortController();
    state.binanceHistoryController = controller;
    return { signal: controller.signal };
  }

  function isBinanceAbort(error) {
    return !!error && (error.name === 'AbortError' || error.code === 'ERR_ABORTED');
  }

  function fmpErrorStatus(error) {
    var numeric = Number(error && error.status);
    if (Number.isFinite(numeric) && numeric >= 100 && numeric <= 599) return numeric;
    var match = String(error && (error.message || error.code) || '').match(/\bHTTP\s+(\d{3})\b/i);
    return match ? Number(match[1]) : 0;
  }

  function isFmpAuthError(error) {
    var status = fmpErrorStatus(error);
    var code = String(error && error.code || '').trim().toUpperCase();
    // Only an explicit user-auth response is allowed to stop provider
    // failover. Proxy/provider 5xx responses can contain words such as AUTH,
    // CREDENTIAL or SESSION even though the signed-in user is still valid.
    if (status === 401 || status === 403) return true;
    if (status === 409) {
      return /^(?:SESSION_(?:SUPERSEDED|REPLACED|REVOKED)|DEVICE_SESSION_(?:SUPERSEDED|REPLACED|REVOKED))$/.test(code);
    }
    // A usable HTTP status is authoritative. Text classification is reserved
    // for local/status-less client errors only.
    if (status) return false;
    if (/^(?:VENDOR_(?:AUTH_FAILED|CREDENTIAL_UNAVAILABLE|KEY_NOT_CONFIGURED)|MARKET_DATA_(?:AUTH_FAILED|CREDENTIAL_UNAVAILABLE)|SESSION_(?:VALIDATION_UNAVAILABLE|BACKEND_NOT_READY|REQUEST_TIMEOUT|NETWORK_ERROR|CONFLICT_UNVERIFIED)|DEVICE_SESSION_ERROR|NETWORK_UNAVAILABLE)$/.test(code)) return false;
    return /(?:TOKEN|SESSION|ACCOUNT|AUTH(?:ORIZATION|ENTICAT(?:ION|ED)?)?|UNAUTHORIZED|FORBIDDEN|ACCESS[ _-]?DENIED|CREDENTIAL|SIGN[ _-]?IN|LOGIN)/i.test(String(error && error.code || '') + ' ' + String(error && error.message || ''));
  }

  function fallbackFromFmp(error, fallback) {
    if (isFmpAuthError(error)) return Promise.reject(error);
    return typeof fallback === 'function' ? Promise.resolve().then(fallback) : Promise.reject(error);
  }

  function proxyDelta(open, high, low, close, volume) {
    var range = Math.max(Math.abs(number(high) - number(low)), Math.abs(number(close)) * .0000001, .0000001);
    var pressure = clamp((number(close) - number(open)) / range, -1, 1);
    var vol = Math.max(0, number(volume, 1));
    return vol * pressure;
  }

  function historyRow(time, open, high, low, close, volume, buy, sell, prints, exactDelta, pricePressureMode, baselineRange) {
    var vol = Math.max(0, number(volume, 1));
    if (pricePressureMode) {
      var priceMetrics = forexGoldOhlcPressureMetrics(open, high, low, close, state.symbol, baselineRange);
      return {
        time: number(time),
        openPrice: number(open),
        highPrice: number(high),
        lowPrice: number(low),
        closePrice: number(close),
        volume: vol,
        buy: Math.max(0, priceMetrics.pressure),
        sell: Math.max(0, -priceMetrics.pressure),
        prints: 1,
        delta: priceMetrics.pressure,
        tickDelta: priceMetrics.direction,
        tickBuy: priceMetrics.direction > 0 ? 1 : 0,
        tickSell: priceMetrics.direction < 0 ? 1 : 0,
        tickPrints: 1,
        magnitude: priceMetrics.magnitude,
        metricMode: 'canonical-target-ohlc-pressure'
      };
    }
    var delta = Number.isFinite(Number(exactDelta)) ? Number(exactDelta) : proxyDelta(open, high, low, close, vol);
    var buyVol = Number.isFinite(Number(buy)) ? Math.max(0, Number(buy)) : Math.max(0, (vol + delta) / 2);
    var sellVol = Number.isFinite(Number(sell)) ? Math.max(0, Number(sell)) : Math.max(0, vol - buyVol);
    var direction = number(close) === number(open) ? 0 : (number(close) > number(open) ? 1 : -1);
    var bodyRatio = Math.min(1, Math.abs(number(close) - number(open)) / Math.max(Math.abs(number(high) - number(low)), .0000001));
    var tickDelta = direction * vol * (.25 + .75 * bodyRatio);
    return {
      time: number(time),
      openPrice: number(open),
      highPrice: number(high),
      lowPrice: number(low),
      closePrice: number(close),
      volume: vol,
      buy: buyVol,
      sell: sellVol,
      prints: Math.max(0, number(prints, 1)),
      delta: delta,
      tickDelta: tickDelta
    };
  }

  function loadBinanceHistory(symbol, tf) {
    if (!isBinanceCryptoMarket(symbol, state.exchange)) return Promise.reject(new Error('Binance is restricted to supported crypto symbols.'));
    if (usesBinanceKlines()) return loadBinanceCanonicalHistory(symbol, tf);
    var endpoint = 'https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(binanceSymbol(symbol)) + '&interval=' + encodeURIComponent(binanceInterval(tf)) + '&limit=1000';
    return fetchJson(endpoint, 7500, binanceHistoryRequest()).then(function (rows) {
      if (!Array.isArray(rows)) throw new Error('Binance history unavailable');
      var currentBucket = Math.floor(Date.now() / timeframeMs(tf)) * timeframeMs(tf);
      return rows.filter(function (row) { return number(row[0]) < currentBucket; }).map(function (row) {
        var volume = number(row[5]);
        var takerBuy = number(row[9]);
        return historyRow(row[0], row[1], row[2], row[3], row[4], volume, takerBuy, Math.max(0, volume - takerBuy), row[8], takerBuy * 2 - volume);
      });
    });
  }

  // Binance REST v/V and the UTC @kline stream describe the SAME full bar.
  // Never add websocket trade quantities to a REST snapshot. OHLC klines do
  // not contain intrabar CVD extrema or up/down tick counts.
  function binanceValue(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) return NaN;
    return Number(value);
  }

  function binanceCanonicalRow(raw, tf, capturedAt) {
    if (!Array.isArray(raw) || raw.length < 10) return null;
    var values = [raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[8], raw[9]].map(binanceValue);
    if (!values.every(Number.isFinite)) return null;
    var t = values[0], o = values[1], h = values[2], l = values[3], c = values[4];
    var v = values[5], end = values[6], n = values[7], buy = values[8], interval = timeframeMs(tf);
    if (!Number.isSafeInteger(t) || t <= 0 || t % interval || t > Math.floor(capturedAt / interval) * interval ||
        !Number.isSafeInteger(end) || end !== t + interval - 1 || !Number.isSafeInteger(n) || n < 0 ||
        Math.min(o, h, l, c) <= 0 || h < Math.max(o, c) || l > Math.min(o, c) || h < l ||
        v < 0 || buy < 0 || buy > v || (v === 0 && (buy !== 0 || n !== 0)) || (v > 0 && n === 0)) return null;
    var row = historyRow(t, o, h, l, c, v, buy, v - buy, n, 2 * buy - v);
    row.metricMode = 'binance-full-kline';
    row.binanceClosed = end < capturedAt;
    row.binanceEventAt = 0;
    row.binanceLastTradeId = -1;
    return row;
  }

  function binanceHistoryStart(tf, at) {
    var interval = timeframeMs(tf);
    var firstVisible = Math.floor(at / interval) * interval - (HISTORY_LIMIT - 1) * interval;
    return Math.floor(firstVisible / BINANCE_DAY_MS) * BINANCE_DAY_MS;
  }

  function completeBinanceRows(rows, tf) {
    var interval = timeframeMs(tf);
    var list = rows.slice().sort(function (a, b) { return a.time - b.time; });
    // An exchange listing/short response may start mid-day. That partial day
    // cannot establish a reproducible UTC cumulative baseline.
    var firstComplete = list.findIndex(function (row) { return row.time % BINANCE_DAY_MS === 0; });
    if (firstComplete < 0) throw new Error('Binance UTC day baseline unavailable');
    list = list.slice(firstComplete);
    if (!list.length || list.length > 3840) throw new Error('Binance history bounds rejected');
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].metricMode !== 'binance-full-kline' || (i > 0 && list[i].time !== list[i - 1].time + interval)) {
        throw new Error('Binance candle history has a gap');
      }
    }
    return list;
  }

  function loadBinanceCanonicalHistory(symbol, tf) {
    var capturedAt = Date.now(), interval = timeframeMs(tf);
    var endBucket = Math.floor(capturedAt / interval) * interval;
    var cursor = binanceHistoryStart(tf, capturedAt), rows = [], pages = 0;
    function nextPage() {
      if (cursor > endBucket) return Promise.resolve(completeBinanceRows(rows, tf));
      if (pages >= 4) return Promise.reject(new Error('Binance history page limit reached'));
      pages += 1;
      var limit = Math.min(1000, Math.floor((endBucket - cursor) / interval) + 1);
      var url = 'https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(binanceSymbol(symbol)) +
        '&interval=' + encodeURIComponent(binanceInterval(tf)) + '&startTime=' + cursor +
        '&endTime=' + (endBucket + interval - 1) + '&limit=' + limit;
      return fetchJson(url, 7500, binanceHistoryRequest()).then(function (rawRows) {
        if (!Array.isArray(rawRows) || !rawRows.length || rawRows.length > limit) throw new Error('Binance history incomplete');
        var mapped = rawRows.map(function (raw) { return binanceCanonicalRow(raw, tf, capturedAt); });
        if (mapped.some(function (row) { return !row || row.time < cursor || row.time > endBucket; })) throw new Error('Binance candle rejected');
        for (var i = 1; i < mapped.length; i += 1) {
          if (mapped[i].time !== mapped[i - 1].time + interval) throw new Error('Binance candle page has a gap');
        }
        rows = rows.concat(mapped);
        cursor = mapped[mapped.length - 1].time + interval;
        if (rawRows.length < limit && cursor <= endBucket) throw new Error('Binance history incomplete');
        return nextPage();
      });
    }
    return nextPage();
  }

  function commitBinanceRows(rows) {
    var last = rows[rows.length - 1];
    var start = binanceHistoryStart(state.timeframe, last.time);
    var complete = completeBinanceRows(rows.filter(function (row) { return row.time >= start; }), state.timeframe);
    state.binanceRows = complete;
    // Panning freezes the camera, NOT data ingestion. applyHistory preserves
    // its timestamp anchor while rebuilding all five views from the same rows.
    applyHistory(complete);
  }

  function binanceSellRegressed(next, old) {
    // v-V involves floating subtraction: e.g. .6-.4 is a few ULPs below
    // .3-.1 although the observed seller quantity did not decrease.
    var tolerance = Math.max(1e-12, Math.max(Math.abs(next), Math.abs(old)) * Number.EPSILON * 16);
    return next < old - tolerance;
  }

  function loadBinanceRepairHistory(symbol, tf) {
    var prior = state.binanceRows, latest = prior[prior.length - 1], interval = timeframeMs(tf), capturedAt = Date.now();
    if (!latest || !prior.length) return loadBinanceCanonicalHistory(symbol, tf);
    var from = Math.max(prior[0].time, latest.time - 2 * interval);
    var end = Math.floor(capturedAt / interval) * interval;
    var count = Math.floor((end - from) / interval) + 1;
    if (count < 1 || count > 1000) return loadBinanceCanonicalHistory(symbol, tf);
    var url = 'https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(binanceSymbol(symbol)) +
      '&interval=' + encodeURIComponent(binanceInterval(tf)) + '&startTime=' + from +
      '&endTime=' + (end + interval - 1) + '&limit=' + count;
    return fetchJson(url, 7500, binanceHistoryRequest()).then(function (rawRows) {
      if (!Array.isArray(rawRows) || rawRows.length !== count) throw new Error('Binance repair history incomplete');
      var rows = rawRows.map(function (raw) { return binanceCanonicalRow(raw, tf, capturedAt); });
      if (rows.some(function (row, i) { return !row || row.time !== from + i * interval; })) throw new Error('Binance repair history rejected');
      return rows;
    });
  }

  function mergeBinanceRepair(rows, requestedAt) {
    var prior = new Map(state.binanceRows.map(function (row) { return [row.time, row]; }));
    var merged = rows.map(function (row) {
      var old = prior.get(row.time);
      if (old && (old.binanceEventAt > requestedAt || (!row.binanceClosed &&
          (old.prints > row.prints || old.volume > row.volume || old.buy > row.buy || binanceSellRegressed(row.sell, old.sell))))) return old;
      return row;
    });
    var lastTime = merged[merged.length - 1].time;
    var firstTime = merged[0].time;
    merged = state.binanceRows.filter(function (old) { return old.time < firstTime; }).concat(merged);
    state.binanceRows.forEach(function (old) { if (old.time > lastTime) merged.push(old); });
    var start = binanceHistoryStart(state.timeframe, merged[merged.length - 1].time);
    return completeBinanceRows(merged.filter(function (row) { return row.time >= start; }), state.timeframe);
  }

  function repairBinanceHistory(token, reason) {
    if (!state.open || !usesBinanceKlines() || token !== state.feedToken || state.binanceRepairBusy || state.binanceBlocked) return Promise.resolve(false);
    var requestedAt = Date.now(), context = historyContextKey(), seq = state.loadSeq;
    state.binanceRepairBusy = true;
    state.binanceRepairAt = requestedAt;
    if (reason !== 'periodic') {
      state.binanceRepairNeeded = true;
      setStatus('syncing', 'warn', 'Binance full-bar history repair');
    }
    return loadBinanceRepairHistory(state.symbol, state.timeframe).then(function (rows) {
      if (!state.open || token !== state.feedToken || seq !== state.loadSeq || context !== historyContextKey()) return false;
      commitBinanceRows(mergeBinanceRepair(rows, requestedAt));
      state.binanceRepairNeeded = false;
      // REST has no event timestamp. A successful snapshot cannot by itself
      // prove that this browser's websocket is currently receiving live data.
      if (state.binanceLastEventAt && Date.now() - state.binanceLastEventAt <= BINANCE_EVENT_MAX_AGE_MS) {
        setStatus('live', 'live', 'Binance taker net bars · UTC daily reset');
      } else setStatus('syncing', 'warn', 'Binance snapshot verified · waiting for live event');
      return true;
    }).catch(function (error) {
      if (isBinanceAbort(error)) return false;
      if (token !== state.feedToken || seq !== state.loadSeq || context !== historyContextKey()) return false;
      if (error && (error.status === 401 || error.status === 403 || error.status === 451)) {
        state.binanceBlocked = true;
        stopFeed();
      }
      state.binanceRepairNeeded = true;
      setStatus('stale', 'warn', 'Binance history repair unavailable · last verified bars');
      return false;
    }).finally(function () { if (token === state.feedToken) state.binanceRepairBusy = false; });
  }

  function acceptBinanceKline(payload, token) {
    if (!state.open || !usesBinanceKlines() || token !== state.feedToken || state.binanceBlocked) return false;
    var k = payload && payload.k, now = Date.now(), eventAt = binanceValue(payload && payload.E);
    var symbol = binanceSymbol(state.symbol), interval = timeframeMs(state.timeframe);
    if (!k || payload.e !== 'kline' || payload.s !== symbol || k.s !== symbol || k.i !== binanceInterval(state.timeframe) ||
        typeof k.x !== 'boolean' || !Number.isSafeInteger(eventAt) || eventAt < state.binanceLastEventAt || eventAt > now + 3000 || now - eventAt > BINANCE_EVENT_MAX_AGE_MS) return false;
    var row = binanceCanonicalRow([k.t, k.o, k.h, k.l, k.c, k.v, k.T, k.q, k.n, k.V], state.timeframe, now);
    var firstId = (typeof k.f === 'number' || typeof k.f === 'string' && /^-?\d+$/.test(k.f)) ? Number(k.f) : NaN;
    var lastId = (typeof k.L === 'number' || typeof k.L === 'string' && /^-?\d+$/.test(k.L)) ? Number(k.L) : NaN;
    if (!row || !Number.isSafeInteger(firstId) || !Number.isSafeInteger(lastId) || firstId < -1 || lastId < -1 ||
        (row.prints > 0 && (firstId < 0 || lastId < firstId)) ||
        k.x !== (Number(k.T) < eventAt) || row.time > eventAt || row.time < Math.floor(now / interval) * interval - interval) return false;
    row.binanceClosed = k.x;
    row.binanceEventAt = eventAt;
    row.binanceLastTradeId = lastId;
    var rows = state.binanceRows, latest = rows[rows.length - 1];
    if (!latest) return false;
    var index = rows.findIndex(function (old) { return old.time === row.time; });
    var old = index < 0 ? null : rows[index];
    if (old && (eventAt <= old.binanceEventAt || (old.binanceClosed && !row.binanceClosed) ||
        row.prints < old.prints || row.volume < old.volume || row.buy < old.buy || binanceSellRegressed(row.sell, old.sell) ||
        (old.binanceLastTradeId >= 0 && lastId < old.binanceLastTradeId) ||
        (old.prints > 0 && (row.openPrice !== old.openPrice || row.highPrice < old.highPrice || row.lowPrice > old.lowPrice)))) return false;
    if (old && (old.binanceClosed || row.prints === old.prints) &&
        ['openPrice', 'highPrice', 'lowPrice', 'closePrice', 'volume', 'buy', 'sell', 'prints'].some(function (key) { return old[key] !== row[key]; })) return false;
    if (state.binanceRepairNeeded) return false;
    if ((!old && row.time !== latest.time + interval) || (!old && !latest.binanceClosed)) {
      repairBinanceHistory(token, 'gap');
      return false;
    }
    var next = rows.slice();
    if (old) next[index] = row;
    else next.push(row);
    commitBinanceRows(next);
    state.binanceLastEventAt = eventAt;
    setStatus('live', 'live', 'Binance taker net bars · UTC daily reset');
    return true;
  }

  function connectBinanceKlineFeed() {
    if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
      try {
        state.ws.onopen = null;
        state.ws.onmessage = null;
        state.ws.onerror = null;
        state.ws.onclose = null;
        state.ws.close();
      } catch (_) {}
      state.ws = null;
    }
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
    var token = ++state.feedToken;
    state.binanceLastEventAt = 0;
    state.binanceConnectedAt = Date.now();
    setStatus('connecting', 'warn', 'Binance snapshot verified · waiting for live event');
    try {
      var socket = new WebSocket('wss://stream.binance.com:9443/ws/' + binanceSymbol(state.symbol).toLowerCase() + '@kline_' + binanceInterval(state.timeframe));
      state.ws = socket;
      socket.onopen = function () {
        if (token !== state.feedToken) return;
        var rt = runtime();
        var proof = rt && typeof rt.getCryptoPriceStatus === 'function' ? rt.getCryptoPriceStatus() : null;
        if (proof && proof.fresh === true && state.candles.length >= 2) {
          setStatus('live', 'live', 'Binance verified live flow · shared terminal feed');
        } else {
          setStatus('syncing', 'warn', 'Binance connected · verifying full bars');
          repairBinanceHistory(token, 'reconnect');
        }
      };
      socket.onmessage = function (event) {
        if (token !== state.feedToken) return;
        if (typeof event.data !== 'string' || !event.data || event.data === 'ping' || event.data === 'pong') return;
        try { acceptBinanceKline(JSON.parse(event.data), token); } catch (_) {}
      };
      socket.onerror = function () { if (token === state.feedToken) setStatus('reconnecting', 'warn', 'Binance feed unavailable'); };
      socket.onclose = function () {
        if (token !== state.feedToken) return;
        state.ws = null;
        state.binanceLastEventAt = 0;
        setStatus('reconnecting', 'warn', 'Binance feed disconnected · history repair required');
        scheduleReconnect(token);
      };
      state.pollTimer = window.setInterval(function () {
        if (token !== state.feedToken || state.binanceBlocked) return;
        var now = Date.now();
        var rt = runtime();
        var proof = rt && typeof rt.getCryptoPriceStatus === 'function' ? rt.getCryptoPriceStatus() : null;
        var fresh = (state.binanceLastEventAt && now - state.binanceLastEventAt <= BINANCE_EVENT_MAX_AGE_MS) || Boolean(proof && proof.fresh === true);
        if (!fresh) setStatus('stale', 'warn', 'Binance live events delayed · last verified bars');
        if (!fresh && !state.binanceRepairBusy && now - state.binanceConnectedAt > BINANCE_EVENT_MAX_AGE_MS) {
          connectFeed();
          return;
        }
        if (now - state.binanceRepairAt >= (fresh ? 60000 : 15000)) repairBinanceHistory(token, fresh ? 'periodic' : 'stale');
      }, 4000);
    } catch (_) {
      setStatus('error', 'warn', 'Binance feed unavailable');
      scheduleReconnect(token);
    }
  }

  function loadOkxHistory(symbol, tf) {
    var endpoint = 'https://www.okx.com/api/v5/market/candles?instId=' + encodeURIComponent(okxSymbol(symbol)) + '&bar=' + encodeURIComponent(okxInterval(tf)) + '&limit=300';
    return fetchJson(endpoint, 7500).then(function (payload) {
      var rows = payload && payload.data;
      if (!Array.isArray(rows)) throw new Error('OKX history unavailable');
      return rows.slice().reverse().map(function (row) {
        return historyRow(row[0], row[1], row[2], row[3], row[4], row[5], null, null, 1, null);
      });
    });
  }

  function loadBybitHistory(symbol, tf) {
    var endpoint = 'https://api.bybit.com/v5/market/kline?category=spot&symbol=' + encodeURIComponent(binanceSymbol(symbol)) + '&interval=' + encodeURIComponent(bybitInterval(tf)) + '&limit=1000';
    return fetchJson(endpoint, 7500).then(function (payload) {
      var rows = payload && payload.result && payload.result.list;
      if (!Array.isArray(rows)) throw new Error('Bybit history unavailable');
      return rows.slice().reverse().map(function (row) {
        return historyRow(row[0], row[1], row[2], row[3], row[4], row[5], null, null, 1, null);
      });
    });
  }

  function fmpSourceInterval(tf) {
    var map = {
      '1m': '1min',
      '3m': '1min',
      '5m': '1min',
      '15m': '5min',
      '1h': '1hour'
    };
    return map[normalizeTimeframe(tf)] || '1min';
  }

  function fmpHistoryDays(tf) {
    var key = normalizeTimeframe(tf);
    if (key === '1m') return 10;
    if (key === '3m') return 12;
    if (key === '5m') return 15;
    if (key === '15m') return 45;
    if (key === '1h') return 180;
    return 15;
  }

  function vendorTime(value) {
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    var text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) return 0;
    var parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmpVendorTime(value) {
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    try {
      var helper = window.GPFmpEasternTimeV1;
      if (helper && typeof helper.parseMilliseconds === 'function') {
        var parsed = helper.parseMilliseconds(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch (_) {}
    return vendorTime(value);
  }

  function rawVendorHistoryRow(row, source) {
    row = row || {};
    var rawTime = row.time != null ? row.time : row.t != null ? row.t : row.timestamp != null ? row.timestamp : row.date != null ? row.date : row.datetime;
    return {
      time: source === 'fmp' ? fmpVendorTime(rawTime) : vendorTime(rawTime),
      open: number(row.open != null ? row.open : row.o),
      high: number(row.high != null ? row.high : row.h),
      low: number(row.low != null ? row.low : row.l),
      close: number(row.close != null ? row.close : row.c),
      volume: Math.max(0, number(row.volume != null ? row.volume : row.v != null ? row.v : row.n, 1))
    };
  }

  function aggregatePricePressureHistory(rows, tf, symbol) {
    var bucketMs = timeframeMs(tf);
    var buckets = Object.create(null);
    (Array.isArray(rows) ? rows : []).slice().sort(function (a, b) { return a.time - b.time; }).forEach(function (row) {
      var time = number(row && row.time);
      var open = number(row && row.open);
      var high = number(row && row.high);
      var low = number(row && row.low);
      var close = number(row && row.close);
      if (!(time > 0) || !(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) return;
      var bucket = Math.floor(time / bucketMs) * bucketMs;
      var current = buckets[bucket];
      if (!current) {
        current = buckets[bucket] = {
          time: bucket,
          open: open,
          high: high,
          low: low,
          close: close,
          volume: Math.max(0, number(row.volume, 1)),
          prints: 0
        };
      } else {
        current.high = Math.max(current.high, high);
        current.low = Math.min(current.low, low);
        current.close = close;
        current.volume += Math.max(0, number(row.volume, 1));
      }
      current.prints += 1;
    });
    var priorTargetRanges = [];
    return Object.keys(buckets).map(function (key) {
      return buckets[key];
    }).sort(function (a, b) {
      return a.time - b.time;
    }).map(function (bucket) {
      var targetRange = ohlcRange(bucket.open, bucket.high, bucket.low, bucket.close, symbol);
      var baselineRange = recentRangeBaseline(priorTargetRanges, targetRange);
      var metrics = forexGoldOhlcPressureMetrics(
        bucket.open, bucket.high, bucket.low, bucket.close, symbol, baselineRange
      );
      priorTargetRanges.push(targetRange);
      if (priorTargetRanges.length > 20) priorTargetRanges.shift();
      return {
        time: bucket.time,
        openPrice: bucket.open,
        highPrice: bucket.high,
        lowPrice: bucket.low,
        closePrice: bucket.close,
        volume: bucket.volume,
        buy: Math.max(0, metrics.pressure),
        sell: Math.max(0, -metrics.pressure),
        prints: 1,
        delta: metrics.pressure,
        tickDelta: metrics.direction,
        tickBuy: metrics.direction > 0 ? 1 : 0,
        tickSell: metrics.direction < 0 ? 1 : 0,
        tickPrints: 1,
        magnitude: metrics.magnitude,
        sourceBars: bucket.prints,
        metricMode: 'canonical-target-ohlc-pressure'
      };
    });
  }

  function canonicalProviderHistoryRows(rows) {
    var byTime = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var time = number(row && row.time);
      if (time > 0) byTime.set(time, Object.assign({}, row));
    });
    return Array.from(byTime.values()).sort(function (left, right) {
      return number(left.time) - number(right.time);
    });
  }

  function canonicalRowsFingerprint(rows) {
    var hash = 2166136261;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var text = [
        number(row && row.time),
        number(row && row.openPrice),
        number(row && row.highPrice),
        number(row && row.lowPrice),
        number(row && row.closePrice),
        number(row && row.delta),
        number(row && row.tickDelta),
        number(row && row.prints)
      ].join('|') + ';';
      for (var index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    });
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function xauHistoryExcursionFloor(tf) {
    var interval = timeframeMs(tf);
    if (interval <= 60000) return .012;
    if (interval <= 5 * 60000) return .016;
    if (interval <= 15 * 60000) return .022;
    if (interval <= 3600000) return .04;
    return .065;
  }

  function isolatedXauHistoryExcursion(rows, tf, symbol) {
    if (cleanSymbol(symbol) !== 'XAUUSD' || !Array.isArray(rows) || rows.length < 3) return null;
    var ratios = rows.slice(-80).map(function (row) {
      var open = number(row && row.openPrice);
      var high = number(row && row.highPrice);
      var low = number(row && row.lowPrice);
      var close = number(row && row.closePrice);
      var reference = Math.max(1, Math.abs(open), Math.abs(close));
      return high >= low ? Math.max(0, high - low) / reference : 0;
    });
    var threshold = Math.max(xauHistoryExcursionFloor(tf), medianValue(ratios, 0) * 12);
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index] || {};
      var open = number(row.openPrice);
      var high = number(row.highPrice);
      var low = number(row.lowPrice);
      var close = number(row.closePrice);
      if (!(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) {
        return { index: index, kind: 'invalid-ohlc' };
      }
      var reference = Math.max(1, Math.abs(open), Math.abs(close));
      var bodyHigh = Math.max(open, close);
      var bodyLow = Math.min(open, close);
      var wickRatio = Math.max(Math.max(0, high - bodyHigh), Math.max(0, bodyLow - low)) / reference;
      var bodyRatio = Math.abs(close - open) / reference;
      if (wickRatio > threshold && wickRatio > Math.max(bodyRatio * 3, threshold * 1.02)) {
        return { index: index, kind: 'isolated-wick', observed: wickRatio, threshold: threshold };
      }
      if (index > 0 && index < rows.length - 1) {
        var previousClose = number(rows[index - 1] && rows[index - 1].closePrice);
        var nextOpen = number(rows[index + 1] && rows[index + 1].openPrice);
        var bridge = (previousClose + nextOpen) / 2;
        var midpoint = (open + close) / 2;
        var neighborGap = bridge > 0 ? Math.abs(previousClose - nextOpen) / bridge : 0;
        var displacement = bridge > 0 ? Math.abs(midpoint - bridge) / bridge : 0;
        if (bridge > 0 && neighborGap < threshold * .35 && displacement > threshold) {
          return { index: index, kind: 'isolated-level', observed: displacement, threshold: threshold };
        }
      }
    }
    return null;
  }

  function requirePriceHistoryIntegrity(rows, tf, symbol, source) {
    var excursion = isolatedXauHistoryExcursion(rows, tf, symbol);
    if (!excursion) return rows;
    var error = new Error('Rejected isolated XAUUSD candle excursion from ' + String(source || 'history'));
    error.code = 'XAU_HISTORY_CANDLE_INTEGRITY';
    error.detail = excursion;
    throw error;
  }

  function prepareSecureMarketSession() {
    if (usesBinanceKlines()) return Promise.resolve(null);
    var refresh = Promise.resolve(null);
    try {
      var helper = window.GuardeerAccessTokenRecovery;
      if (helper && typeof helper.refresh === 'function') refresh = Promise.resolve(helper.refresh(false));
    } catch (_) {}
    return refresh.then(function (session) {
      try {
        var keepAlive = window.GuardeerAuthKeepAlive;
        session = session || (keepAlive && typeof keepAlive.getSession === 'function' ? keepAlive.getSession() : null);
      } catch (_) {}
      if (!session) {
        var missingSession = new Error('Sign in to HUNTER and open Module 1 again.');
        missingSession.code = 'SESSION_LOGIN_REQUIRED';
        throw missingSession;
      }
      var device = window.GuardeerDeviceSession;
      if (!device || !session) return session;
      var diagnostics = typeof device.diagnostics === 'function' ? device.diagnostics() : {};
      if (diagnostics.enabled === false) return session;
      var currentBinding = typeof device.getBinding === 'function' ? device.getBinding() : null;
      if (currentBinding && currentBinding.token) return session;
      var missingBinding = new Error('The active device session was not found. Return to the platform and open Module 1 again.');
      missingBinding.code = 'SESSION_LOGIN_REQUIRED';
      throw missingBinding;
    });
  }

  function canonicalProxyBase() {
    var value = String(config().PRIME_MARKET_PROXY_BASE_URL || '').trim().replace(/\/+$/, '');
    return /^https:\/\/[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/i.test(value) ? value : '';
  }

  function canonicalRequestHeaders(session) {
    session = session || {};
    var token = session.id_token || session.IdToken || session.access_token || session.AccessToken || '';
    var headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    try {
      var device = window.GuardeerDeviceSession;
      var binding = device && typeof device.getBinding === 'function' ? device.getBinding() : null;
      var deviceId = device && typeof device.getDeviceId === 'function' ? device.getDeviceId(session) : '';
      if (binding && binding.token) headers['x-gp-session-token'] = binding.token;
      if (deviceId) headers['x-gp-device-id'] = deviceId;
    } catch (_) {}
    return headers;
  }

  function canonicalServerRow(row) {
    row = row || {};
    var gapKeys = ['gapBefore', 'gapFrom', 'gapTo', 'missingBuckets', 'gapKind'];
    var requiredNumbers = [
      'time', 'openPrice', 'highPrice', 'lowPrice', 'closePrice', 'delta', 'tickDelta',
      'cumulativePressureOpen', 'cumulativePressureHigh', 'cumulativePressureLow', 'cumulativePressureClose',
      'cumulativeDirectionOpen', 'cumulativeDirectionHigh', 'cumulativeDirectionLow', 'cumulativeDirectionClose'
    ];
    if (!requiredNumbers.every(function (name) {
      return row[name] !== null && row[name] !== '' && Number.isFinite(Number(row[name]));
    })) return null;
    var mapped = {
      time: number(row.time),
      openPrice: number(row.openPrice),
      highPrice: number(row.highPrice),
      lowPrice: number(row.lowPrice),
      closePrice: number(row.closePrice),
      volume: Math.max(0, number(row.volume)),
      sourceBars: Math.max(1, Math.round(number(row.sourceBars, 1))),
      delta: number(row.delta),
      tickDelta: number(row.tickDelta),
      tickBuy: Math.max(0, number(row.tickBuy)),
      tickSell: Math.max(0, number(row.tickSell)),
      tickPrints: Math.max(0, number(row.tickPrints, 1)),
      buy: Math.max(0, number(row.buy)),
      sell: Math.max(0, number(row.sell)),
      prints: Math.max(0, number(row.prints, 1)),
      magnitude: Math.max(0, number(row.magnitude)),
      cumulativePressureOpen: number(row.cumulativePressureOpen),
      cumulativePressureHigh: number(row.cumulativePressureHigh),
      cumulativePressureLow: number(row.cumulativePressureLow),
      cumulativePressureClose: number(row.cumulativePressureClose),
      cumulativeDirectionOpen: number(row.cumulativeDirectionOpen),
      cumulativeDirectionHigh: number(row.cumulativeDirectionHigh),
      cumulativeDirectionLow: number(row.cumulativeDirectionLow),
      cumulativeDirectionClose: number(row.cumulativeDirectionClose),
      finalized: row.finalized === true,
      metricMode: 'server-canonical-ohlc-pressure-v1'
    };
    // r394: a finalized candle built from fewer provider bars than the
    // session expects is published honestly as partial. It renders like any
    // other candle; the flag only feeds tooltips and diagnostics.
    if (row.partial === true) {
      var expectedSourceBars = Math.round(number(row.expectedSourceBars));
      if (mapped.finalized !== true || !(expectedSourceBars > mapped.sourceBars)) return null;
      mapped.partial = true;
      mapped.expectedSourceBars = expectedSourceBars;
    } else if (Object.prototype.hasOwnProperty.call(row, 'partial') ||
        Object.prototype.hasOwnProperty.call(row, 'expectedSourceBars')) {
      return null;
    }
    if (!(mapped.time > 0) || !(mapped.openPrice > 0) || !(mapped.highPrice > 0) ||
        !(mapped.lowPrice > 0) || !(mapped.closePrice > 0)) return null;
    if (mapped.highPrice < Math.max(mapped.openPrice, mapped.closePrice) ||
        mapped.lowPrice > Math.min(mapped.openPrice, mapped.closePrice)) return null;
    if (row.gapBefore === true) {
      var gapKind = String(row.gapKind || '');
      mapped.gapBefore = true;
      mapped.gapFrom = number(row.gapFrom);
      mapped.gapTo = number(row.gapTo);
      mapped.missingBuckets = Math.round(number(row.missingBuckets));
      mapped.gapKind = gapKind;
      if (!(mapped.gapFrom > 0) || mapped.gapTo !== mapped.time || mapped.gapFrom >= mapped.gapTo ||
          !(mapped.missingBuckets >= 1) ||
          ['scheduled-closure', 'provider-gap', 'long-unverified-provider-gap'].indexOf(gapKind) < 0) return null;
    } else if (gapKeys.some(function (key) { return Object.prototype.hasOwnProperty.call(row, key); })) {
      return null;
    }
    return mapped;
  }

  function canonicalServerRowsValid(rows, payload) {
    rows = Array.isArray(rows) ? rows : [];
    var activeBucket = number(payload && payload.activeBucket);
    var interval = timeframeMs(payload && payload.timeframe);
    var previous = null;
    var sawActive = false;
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index];
      if (!row || number(row.time) % interval !== 0 || (previous && number(row.time) <= number(previous.time))) return false;
      if (row.gapBefore === true) {
        if (number(row.gapTo) !== number(row.time) || number(row.gapFrom) % interval !== 0 ||
            number(row.gapTo) % interval !== 0 ||
            Math.round(number(row.missingBuckets)) !== (number(row.gapTo) - number(row.gapFrom)) / interval) return false;
        if (previous && (number(row.gapFrom) !== number(previous.time) + interval ||
            Math.round(number(row.missingBuckets)) !== (number(row.time) - number(previous.time)) / interval - 1)) return false;
      } else if (previous && number(row.time) - number(previous.time) !== interval) return false;
      if (row.cumulativePressureHigh < Math.max(row.cumulativePressureOpen, row.cumulativePressureClose) ||
          row.cumulativePressureLow > Math.min(row.cumulativePressureOpen, row.cumulativePressureClose) ||
          row.cumulativeDirectionHigh < Math.max(row.cumulativeDirectionOpen, row.cumulativeDirectionClose) ||
          row.cumulativeDirectionLow > Math.min(row.cumulativeDirectionOpen, row.cumulativeDirectionClose)) return false;
      if (Math.abs((row.cumulativePressureClose - row.cumulativePressureOpen) - row.delta) > .0000001 ||
          Math.abs((row.cumulativeDirectionClose - row.cumulativeDirectionOpen) - row.tickDelta) > .0000001) return false;
      if (previous && (Math.abs(row.cumulativePressureOpen - previous.cumulativePressureClose) > .0000001 ||
          Math.abs(row.cumulativeDirectionOpen - previous.cumulativeDirectionClose) > .0000001)) return false;
      if (!row.finalized) {
        if (sawActive || index !== rows.length - 1 || number(row.time) !== activeBucket) return false;
        sawActive = true;
      } else if (sawActive) return false;
      previous = row;
    }
    return true;
  }

  function canonicalServerMetadataValid(payload) {
    payload = payload || {};
    var serverTime = number(payload.serverTime);
    var generatedAt = number(payload.generatedAt);
    var sourceLatest = number(payload.sourceLatest);
    var sourceAgeSeconds = number(payload.sourceAgeSeconds, -1);
    if (!(serverTime > 0) || !(generatedAt > 0) || !(sourceLatest > 0) || sourceAgeSeconds < 0) return false;
    // Freshness is decided by the authenticated server against its own clock.
    // Browsers only verify that the signed response metadata is internally
    // coherent, so a user's incorrect device clock can never change whether a
    // canonical revision is accepted or hidden.
    if (Math.abs(generatedAt - serverTime) > 5000 || sourceLatest > serverTime + 1000) return false;
    if (Object.prototype.hasOwnProperty.call(payload, 'sourceFresh') && typeof payload.sourceFresh !== 'boolean') return false;
    return Math.abs(sourceAgeSeconds - Math.max(0, Math.floor((serverTime - sourceLatest) / 1000))) <= 1;
  }

  function canonicalFreshnessStatus() {
    // r394: the authenticated server decides freshness against its own clock
    // and the market session. Browsers only relay that verdict.
    var ageSeconds = Math.max(0, Math.round(number(state.canonicalSourceAgeSeconds)));
    var ageLabel = ageSeconds >= 120 ? Math.round(ageSeconds / 60) + ' min' : ageSeconds + ' s';
    var tf = normalizeTimeframe(state.timeframe).toUpperCase();
    if (state.canonicalSourceFresh === false) {
      return { text: 'stale', tone: 'warn', source: 'STALE · data ' + ageLabel + ' old · ' + tf };
    }
    return { text: 'live', tone: 'live', source: 'LIVE · server data · ' + tf };
  }

  function setCanonicalStatus() {
    var status = canonicalFreshnessStatus();
    setStatus(status.text, status.tone, status.source);
  }

  function loadServerCanonicalHistory(symbol, tf) {
    var normalizedSymbol = cleanSymbol(symbol);
    var normalizedTimeframe = normalizeTimeframe(tf);
    return prepareSecureMarketSession().then(function (session) {
      var base = canonicalProxyBase();
      if (!base) {
        var missingProxy = new Error('Canonical Module 1 server is not configured.');
        missingProxy.code = 'MARKET_PROXY_NOT_CONFIGURED';
        throw missingProxy;
      }
      var url = base + '/market-proxy/module1?symbol=' + encodeURIComponent(normalizedSymbol) +
        '&timeframe=' + encodeURIComponent(normalizedTimeframe);
      return fetchJson(url, 17000, { headers: canonicalRequestHeaders(session) });
    }).then(function (payload) {
      if (!payload || payload.ok !== true || payload.schema !== 'guardeer-module1-canonical-v1') {
        throw new Error('Canonical Module 1 response is invalid.');
      }
      if (cleanSymbol(payload.symbol) !== normalizedSymbol || normalizeTimeframe(payload.timeframe) !== normalizedTimeframe) {
        throw new Error('Canonical Module 1 response identity does not match the requested market.');
      }
      if (String(payload.algorithmVersion || '') !== 'ohlc-pressure-v1' || String(payload.source || '').toLowerCase() !== 'fmp' ||
          String(payload.sourceInterval || '') !== fmpSourceInterval(normalizedTimeframe)) {
        throw new Error('Canonical Module 1 algorithm or source identity is invalid.');
      }
      var datasetId = String(payload.datasetId || '');
      if (datasetId.indexOf(normalizedSymbol + ':' + normalizedTimeframe + ':') !== 0) {
        throw new Error('Canonical Module 1 dataset identity is invalid.');
      }
      var revision = String(payload.revision || '');
      if (!/^sha256:[a-f0-9]{64}$/i.test(revision)) throw new Error('Canonical Module 1 revision is invalid.');
      var sourceRows = Array.isArray(payload.rows) ? payload.rows : [];
      var mappedRows = sourceRows.map(canonicalServerRow);
      if (mappedRows.some(function (row) { return !row; })) throw new Error('Canonical Module 1 row validation failed.');
      var rows = canonicalProviderHistoryRows(mappedRows).slice(-HISTORY_LIMIT);
      if (rows.length < 2 || rows.length !== Math.min(HISTORY_LIMIT, sourceRows.length)) {
        throw new Error('Canonical Module 1 rows are incomplete.');
      }
      if (!canonicalServerRowsValid(rows, payload)) throw new Error('Canonical Module 1 cumulative chain is invalid.');
      if (!canonicalServerMetadataValid(payload)) throw new Error('Canonical Module 1 server metadata is invalid.');
      requirePriceHistoryIntegrity(rows, normalizedTimeframe, normalizedSymbol, 'Module 1 canonical server');
      state.source = 'Server data · ' + normalizedTimeframe;
      state.canonicalDatasetId = datasetId;
      state.canonicalRevision = revision;
      state.canonicalAlgorithmVersion = String(payload.algorithmVersion || '');
      state.canonicalGeneratedAt = number(payload.generatedAt);
      state.canonicalServerTime = number(payload.serverTime);
      state.canonicalActiveBucket = number(payload.activeBucket);
      state.canonicalFinalizedThrough = number(payload.finalizedThrough);
      state.canonicalSourceFresh = typeof payload.sourceFresh === 'boolean' ? payload.sourceFresh : true;
      state.canonicalSourceAgeSeconds = number(payload.sourceAgeSeconds);
      state.canonicalRefreshState = String(payload.refreshState || '').replace(/[^A-Z0-9_-]/gi, '').slice(0, 64);
      state.canonicalReceivedAt = Date.now();
      return rows;
    });
  }

  function isoDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function loadFmpHistory(symbol, tf) {
    var key = String(config().FMP_API_KEY || 'GUARDEER_SECURE_PROXY').trim();
    var interval = fmpSourceInterval(tf);
    var now = Date.now();
    var from = isoDate(now - fmpHistoryDays(tf) * 86400000);
    var to = isoDate(now + 86400000);
    var url = 'https://financialmodelingprep.com/stable/historical-chart/' + encodeURIComponent(interval) +
      '?symbol=' + encodeURIComponent(cleanSymbol(symbol)) + '&from=' + encodeURIComponent(from) +
      '&to=' + encodeURIComponent(to) + '&_=' + Date.now() + '&apikey=' + encodeURIComponent(key);
    return fetchJson(url, 17000).then(function (payload) {
      var list = Array.isArray(payload) ? payload : Array.isArray(payload && payload.historical) ? payload.historical : [];
      var rawRows = list.map(function (row) { return rawVendorHistoryRow(row, 'fmp'); })
        .filter(function (row) { return row.time > 0 && row.close > 0; });
      var rows = canonicalProviderHistoryRows(aggregatePricePressureHistory(rawRows, tf, symbol)).slice(-HISTORY_LIMIT);
      if (rows.length < 2) throw new Error('No candles for ' + tf);
      requirePriceHistoryIntegrity(rows, tf, symbol, 'FMP');
      requireFreshHistoryR390(rows, tf, 'FMP');
      state.source = 'Server snapshot · ' + tf;
      state.canonicalDatasetId = ['fmp', cleanSymbol(symbol), normalizeTimeframe(tf), fmpSourceInterval(tf), VERSION].join(':');
      state.canonicalRevision = canonicalRowsFingerprint(rows);
      return rows;
    });
  }

  function massiveSourceRange(tf) {
    var source = fmpSourceInterval(tf);
    var amount = parseInt(source, 10) || 1;
    var timespan = source.indexOf('hour') >= 0 ? 'hour' : 'minute';
    var days = fmpHistoryDays(tf);
    return { multiplier: amount, timespan: timespan, days: days };
  }

  function loadMassiveHistory(symbol, tf) {
    var range = massiveSourceRange(tf);
    var now = Date.now();
    var from = isoDate(now - range.days * 86400000);
    var to = isoDate(now + 86400000);
    var ticker = 'C:' + cleanSymbol(symbol);
    var url = 'https://api.massive.com/v2/aggs/ticker/' + encodeURIComponent(ticker) + '/range/' +
      range.multiplier + '/' + range.timespan + '/' + from + '/' + to +
      '?adjusted=true&sort=asc&limit=50000&apiKey=GUARDEER_SECURE_PROXY';
    return fetchJson(url, 13000).then(function (payload) {
      var list = Array.isArray(payload && payload.results) ? payload.results : [];
      var rawRows = list.map(function (row) { return rawVendorHistoryRow(row, 'massive'); })
        .filter(function (row) { return row.time > 0 && row.close > 0; });
      var rows = canonicalProviderHistoryRows(aggregatePricePressureHistory(rawRows, tf, symbol)).slice(-HISTORY_LIMIT);
      if (rows.length < 2) throw new Error('No candles for ' + tf);
      requirePriceHistoryIntegrity(rows, tf, symbol, 'Massive');
      requireFreshHistoryR390(rows, tf, 'Massive');
state.source = 'Secure feed · ' + tf;
      return rows;
    });
  }

  function loadForexGoldHistory(symbol, tf) {
    // One authenticated server revision owns Module 1 globally. Browsers do
    // not fetch raw vendor bars, choose a fallback, finalize candles or derive
    // cumulative values independently.
    return loadServerCanonicalHistory(symbol, tf).then(function (rows) {
      state.lastHistoryError = '';
      return rows;
    });
  }

  function runtimeRows(requestedTimeframe) {
    var rt = runtime();
    var rows = [];
    var runtimeTimeframe = '';
    // Crypto can use its exchange-native runtime. Forex/Gold Module 1 must
    // never import an opener's independently aggregated inventory because a
    // direct window would instead receive the shared FMP snapshot.
    if (!isCryptoMarket(state.symbol, state.exchange)) return [];
    try {
      // The terminal candle inventory is authoritative only while symbol,
      // exchange and timeframe all match this module window.  A standalone
      // popup can outlive a market switch in its opener, so never import the
      // opener's new instrument into the old popup.
      if (!runtimeMarketMatches(rt)) return [];
      if (rt && typeof rt.getTimeframe === 'function') runtimeTimeframe = normalizeTimeframe(rt.getTimeframe());
      else if (rt && rt.state && rt.state.timeframe) runtimeTimeframe = normalizeTimeframe(rt.state.timeframe);
      if (requestedTimeframe && runtimeTimeframe && normalizeTimeframe(requestedTimeframe) !== runtimeTimeframe) return [];
      if (usesBinanceKlines() && rt && typeof rt.getCryptoFlowKlines === 'function') rows = rt.getCryptoFlowKlines() || [];
      else if (rt && typeof rt.getLatestKlines === 'function') rows = rt.getLatestKlines() || [];
      else if (rt && rt.state && Array.isArray(rt.state.candles)) rows = rt.state.candles;
      else if (rt && rt.chart && Array.isArray(rt.chart.candles)) rows = rt.chart.candles;
    } catch (_) {
      rows = [];
    }
    var pricePressureMode = false;
    var priorRanges = [];
    // Keep warm-up rows outside the visible inventory so the rolling pressure
    // baseline for the first displayed candles does not restart every time the
    // 1,200-row runtime window advances.
    var mapped = (Array.isArray(rows) ? rows : []).slice(-(HISTORY_LIMIT + 20)).map(function (row) {
      var time = number(row.time != null ? row.time : row.t);
      if (time > 0 && time < 100000000000) time *= 1000;
      var open = row.open != null ? row.open : row.o;
      var high = row.high != null ? row.high : row.h;
      var low = row.low != null ? row.low : row.l;
      var close = row.close != null ? row.close : row.c;
      var sourceRange = pricePressureMode ? ohlcRange(open, high, low, close, state.symbol) : 0;
      var baselineRange = pricePressureMode ? recentRangeBaseline(priorRanges, sourceRange) : 0;
      var flowVolume = number(row.volume != null ? row.volume : row.v);
      var flowBuy = usesBinanceKlines() ? number(row.takerBuyBaseVolume) : row.buyVolume;
      var flowSell = usesBinanceKlines() ? Math.max(0, flowVolume - flowBuy) : row.sellVolume;
      var flowPrints = usesBinanceKlines() ? number(row.tradeCount, 1) : row.trades || row.count || 1;
      var flowDelta = usesBinanceKlines() ? (2 * flowBuy - flowVolume) : row.delta;
      var result = historyRow(
        time,
        open,
        high,
        low,
        close,
        flowVolume,
        flowBuy,
        flowSell,
        flowPrints,
        flowDelta,
        pricePressureMode,
        baselineRange
      );
      if (pricePressureMode && result.closePrice > 0) {
        priorRanges.push(sourceRange);
        if (priorRanges.length > 20) priorRanges.shift();
      }
      return result;
    }).filter(function (row) {
      return row.time > 0 && row.closePrice > 0;
    });
    if (isolatedXauHistoryExcursion(mapped, requestedTimeframe || state.timeframe, state.symbol)) return [];
    var freshness = freshHistoryInspectionR390(mapped, requestedTimeframe || state.timeframe);
    if (!freshness.ok) {
      state.lastHistoryError = freshness.reason === 'stale-history'
        ? 'Terminal history is stale; waiting for current candles.'
        : 'Terminal history freshness could not be verified.';
      return [];
    }
    return mapped.slice(-HISTORY_LIMIT);
  }

  function runtimeRowsFingerprint(rows) {
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '';
    return [list.length].concat(list.slice(-2).map(function (row) {
      return [row.time, row.openPrice, row.highPrice, row.lowPrice, row.closePrice, row.volume].join(':');
    })).join('|');
  }

  function syncCanonicalRuntimeRows() {
    // Retained as a compatibility hook for older callers. The opener/runtime
    // is no longer an admissible Forex/Gold history owner in r393.
    state.runtimeCanonicalActive = false;
    return false;
  }

  function loadHistory(symbol, exchange, tf) {
    if (!isCryptoMarket(symbol, exchange)) return loadForexGoldHistory(symbol, tf);
    if (exchange === 'okx') return loadOkxHistory(symbol, tf).catch(function () { return loadBinanceHistory(symbol, tf); });
    if (exchange === 'bybit') return loadBybitHistory(symbol, tf).catch(function () { return loadBinanceHistory(symbol, tf); });
    return loadBinanceHistory(symbol, tf);
  }

  function multiBucketIndex(quantity) {
    var normalized = Math.max(0, number(quantity)) / Math.max(.00000001, state.multiUnit);
    if (normalized < 10) return 0;
    if (normalized < 100) return 1;
    if (normalized < 500) return 2;
    if (normalized < 1000) return 3;
    return 4;
  }

  function pressureMagnitudeThresholds(rows) {
    var magnitudes = (Array.isArray(rows) ? rows : []).map(function (row) {
      return Math.abs(number(row && row.delta));
    }).filter(function (value) {
      return value > 0;
    }).sort(function (a, b) {
      return a - b;
    });
    if (!magnitudes.length) return [];
    return [.2, .4, .6, .8].map(function (quantile) {
      var index = Math.max(0, Math.min(magnitudes.length - 1, Math.ceil(magnitudes.length * quantile) - 1));
      return magnitudes[index];
    });
  }

  function pressureMagnitudeBucketIndex(value, thresholds) {
    var magnitude = Math.abs(number(value));
    var cuts = Array.isArray(thresholds) ? thresholds : state.multiThresholds;
    if (cuts.length < 4) return 0;
    for (var index = 0; index < 4; index += 1) {
      if (magnitude <= number(cuts[index])) return index;
    }
    return 4;
  }

  function estimatedMultiParts(row) {
    var delta = number(row.delta);
    var tickDelta = number(row.tickDelta);
    if (row.metricMode === 'binance-full-kline') {
      // Explicit modelled components, NOT observed trade-size buckets.
      // Row-local constants make closed values independent of history depth.
      var weights = [.42, .25, .16, .10, .07], mixes = [.10, -.055, .04, -.025, -.06];
      var model = weights.map(function (weight, i) { return delta * weight + tickDelta * mixes[i]; });
      model[4] += delta - model.reduce(function (sum, value) { return sum + value; }, 0);
      return model;
    }
    var averageSize = number(row.volume) / Math.max(1, number(row.prints, 1));
    var averageBucket = multiBucketIndex(averageSize);
    var base = [.42, .25, .16, .10, .07];
    base[averageBucket] += .12;
    var totalWeight = base.reduce(function (sum, value) { return sum + value; }, 0);
    var tickMix = [.10, -.055, .04, -.025, .015];
    var parts = base.map(function (weight, index) {
      return delta * weight / totalWeight + tickDelta * tickMix[index];
    });
    var difference = delta - parts.reduce(function (sum, value) { return sum + value; }, 0);
    parts[4] += difference;
    return parts;
  }

  function buildMultiHistory(rows) {
    var series = [[], [], [], [], []];
    var cumulative = [0, 0, 0, 0, 0];
    var pricePressureMode = usesPricePressure();
    var thresholdContext = cleanSymbol(state.symbol) + '|' + normalizeTimeframe(state.timeframe);
    if (!pricePressureMode) {
      state.multiThresholds = [];
      state.multiThresholdContext = '';
    } else {
      var canonicalRows = (Array.isArray(rows) ? rows : []);
      var referenceRows = canonicalRows.length > 1 ? canonicalRows.slice(0, -1) : canonicalRows;
      state.multiThresholds = pressureMagnitudeThresholds(referenceRows);
      state.multiThresholdContext = thresholdContext;
    }
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (row.metricMode === 'binance-full-kline' && row.time % BINANCE_DAY_MS === 0) cumulative = [0, 0, 0, 0, 0];
      var parts;
      if (pricePressureMode && Array.isArray(row.multiDeltas) && row.multiDeltas.length === 5) {
        parts = row.multiDeltas.map(function (value) { return number(value); });
      } else if (pricePressureMode) {
        parts = [0, 0, 0, 0, 0];
        parts[pressureMagnitudeBucketIndex(row.delta, state.multiThresholds)] = number(row.delta);
      } else {
        parts = estimatedMultiParts(row);
      }
      parts.forEach(function (delta, index) {
        var open = cumulative[index];
        cumulative[index] += delta;
        series[index].push(Object.assign({
          time: row.time,
          open: open,
          high: Math.max(open, cumulative[index]),
          low: Math.min(open, cumulative[index]),
          close: cumulative[index],
          delta: delta
        }, displayedGapFields(row)));
      });
    });
    state.multiCandles = series.map(function (rowsForFilter) { return rowsForFilter.slice(-HISTORY_LIMIT); });
    state.multiCvd = cumulative;
  }

  function cumulativeContinuityAnchor(rows) {
    if (state.appliedHistoryContext !== historyContextKey() || !state.candles.length) return null;
    var oldTopByTime = new Map(state.candles.map(function (row) { return [number(row.time), row]; }));
    var oldTickByTime = new Map(state.tickCandles.map(function (row) { return [number(row.time), row]; }));
    var oldMultiByTime = state.multiCandles.map(function (series) {
      return new Map(series.map(function (row) { return [number(row.time), row]; }));
    });
    for (var index = 0; index < rows.length; index += 1) {
      var time = number(rows[index] && rows[index].time);
      var top = oldTopByTime.get(time);
      var tick = oldTickByTime.get(time);
      if (!top || !tick) continue;
      return {
        time: time,
        topOpen: number(top.open),
        tickOpen: number(tick.open),
        topByTime: oldTopByTime,
        tickByTime: oldTickByTime,
        multiByTime: oldMultiByTime,
        multiOpen: oldMultiByTime.map(function (series) {
          var row = series.get(time);
          return row ? number(row.open) : 0;
        })
      };
    }
    return null;
  }

  function shiftCumulativeSeries(rows, anchorTime, expectedOpen) {
    var anchorRow = (Array.isArray(rows) ? rows : []).find(function (row) {
      return number(row && row.time) === number(anchorTime);
    });
    if (!anchorRow) return 0;
    var offset = number(expectedOpen) - number(anchorRow.open);
    if (!offset) return 0;
    rows.forEach(function (row) {
      row.open = number(row.open) + offset;
      row.high = number(row.high) + offset;
      row.low = number(row.low) + offset;
      row.close = number(row.close) + offset;
    });
    return offset;
  }

  function stabilizeCumulativeSeries(rows, oldRowsByTime, anchorTime, expectedOpen) {
    rows = Array.isArray(rows) ? rows : [];
    var anchorIndex = rows.findIndex(function (row) { return number(row && row.time) === number(anchorTime); });
    if (anchorIndex < 0) return rows.length ? number(rows[rows.length - 1].close) : 0;
    shiftCumulativeSeries(rows, anchorTime, expectedOpen);
    var running = number(expectedOpen);
    for (var index = anchorIndex; index < rows.length; index += 1) {
      var row = rows[index];
      var oldRow = oldRowsByTime && oldRowsByTime.get(number(row.time));
      if (oldRow && number(oldRow.delta) === number(row.delta) && number(oldRow.open) === running) {
        row.open = number(oldRow.open);
        row.high = number(oldRow.high);
        row.low = number(oldRow.low);
        row.close = number(oldRow.close);
      } else {
        row.open = running;
        row.close = running + number(row.delta);
        row.high = Math.max(row.open, row.close);
        row.low = Math.min(row.open, row.close);
      }
      running = number(row.close);
    }
    return rows.length ? number(rows[rows.length - 1].close) : 0;
  }

  // r392 sealed the first version seen by each browser. That made history
  // stable locally but permanently allowed two users to keep different rows.
  // r393 treats every authenticated FMP snapshot as the sole owner: refreshes
  // replace matching timestamps and no browser-local row is ever promoted to
  // canonical history.
  function sealPreviouslyDisplayedClosedRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      return Object.assign({}, row);
    });
  }

  function captureClosedHistorySeals() {
    return false;
  }

  function displayedGapFields(row) {
    if (row && row.metricMode === 'binance-full-kline' && row.time % BINANCE_DAY_MS === 0) {
      return { gapBefore: true, gapKind: 'utc-day-reset', missingBuckets: 0 };
    }
    if (!row || row.gapBefore !== true) return {};
    return {
      gapBefore: true,
      gapFrom: number(row.gapFrom),
      gapTo: number(row.gapTo),
      missingBuckets: Math.max(1, Math.round(number(row.missingBuckets, 1))),
      gapKind: String(row.gapKind || '')
    };
  }

  function applyHistory(rows) {
    var verifiedRows = (Array.isArray(rows) ? rows : []).map(function (row) { return Object.assign({}, row); });
    rows = sealPreviouslyDisplayedClosedRows(rows);
    var continuity = usesPricePressure() || usesBinanceKlines() ? null : cumulativeContinuityAnchor(rows);
    if (usesPricePressure() && !/^sha256:[a-f0-9]{64}$/i.test(String(state.canonicalRevision || ''))) {
      state.canonicalRevision = 'local-test:' + canonicalRowsFingerprint(rows);
    }
    var historicalAnchorTime = state.endOffset > 0
      ? number(state.historyAnchorTime) || historyAnchorAtOffset(state.endOffset)
      : 0;
    if (!isCryptoMarket(state.symbol, state.exchange) && verifiedRows.length) {
      rememberFreshHistoryProofR390(verifiedRows, state.timeframe, state.source || 'verified history');
    } else if (!verifiedRows.length || isCryptoMarket(state.symbol, state.exchange)) {
      state.freshHistoryProof = null;
    }
    var top = [];
    var ticks = [];
    var prices = [];
    var cumulative = 0;
    var cumulativeTick = 0;
    var buy = 0;
    var sell = 0;
    var prints = 0;
    var volumes = [];
    var tradeUnits = [];
    rows.forEach(function (row) {
      if (row.metricMode === 'binance-full-kline' && row.time % BINANCE_DAY_MS === 0) {
        cumulative = 0;
        cumulativeTick = 0;
        buy = 0;
        sell = 0;
        prints = 0;
      }
      var delta = number(row.delta);
      var tickDelta = number(row.tickDelta);
      var ownsAbsoluteCumulative = usesPricePressure() &&
        Number.isFinite(Number(row.cumulativePressureOpen)) && Number.isFinite(Number(row.cumulativePressureClose)) &&
        Number.isFinite(Number(row.cumulativeDirectionOpen)) && Number.isFinite(Number(row.cumulativeDirectionClose));
      var open = ownsAbsoluteCumulative ? number(row.cumulativePressureOpen) : cumulative;
      cumulative = ownsAbsoluteCumulative ? number(row.cumulativePressureClose) : cumulative + delta;
      var tickOpen = ownsAbsoluteCumulative ? number(row.cumulativeDirectionOpen) : cumulativeTick;
      cumulativeTick = ownsAbsoluteCumulative ? number(row.cumulativeDirectionClose) : cumulativeTick + tickDelta;
      top.push(Object.assign({
        time: row.time,
        open: open,
        high: ownsAbsoluteCumulative ? number(row.cumulativePressureHigh, Math.max(open, cumulative)) : Math.max(open, cumulative),
        low: ownsAbsoluteCumulative ? number(row.cumulativePressureLow, Math.min(open, cumulative)) : Math.min(open, cumulative),
        close: cumulative,
        delta: delta,
        buy: number(row.buy),
        sell: number(row.sell),
        prints: number(row.prints)
      }, displayedGapFields(row)));
      ticks.push(Object.assign({
        time: row.time,
        open: tickOpen,
        high: ownsAbsoluteCumulative ? number(row.cumulativeDirectionHigh, Math.max(tickOpen, cumulativeTick)) : Math.max(tickOpen, cumulativeTick),
        low: ownsAbsoluteCumulative ? number(row.cumulativeDirectionLow, Math.min(tickOpen, cumulativeTick)) : Math.min(tickOpen, cumulativeTick),
        close: cumulativeTick,
        delta: tickDelta,
        buy: row.metricMode === 'binance-full-kline' ? Math.max(0, tickDelta) : number(row.tickBuy != null ? row.tickBuy : row.buy),
        sell: row.metricMode === 'binance-full-kline' ? Math.max(0, -tickDelta) : number(row.tickSell != null ? row.tickSell : row.sell),
        prints: number(row.tickPrints != null ? row.tickPrints : row.prints)
      }, displayedGapFields(row)));
      prices.push(Object.assign({
        time: row.time,
        open: number(row.openPrice),
        high: number(row.highPrice),
        low: number(row.lowPrice),
        close: number(row.closePrice),
        volume: number(row.volume),
        magnitude: Number.isFinite(Number(row.magnitude)) ? Math.max(0, Number(row.magnitude)) : Math.abs(delta),
        delta: delta,
        buy: number(row.buy),
        sell: number(row.sell),
        prints: number(row.prints)
      }, displayedGapFields(row), row.partial === true ? {
        partial: true,
        sourceBars: Math.max(1, Math.round(number(row.sourceBars, 1))),
        expectedSourceBars: Math.max(1, Math.round(number(row.expectedSourceBars, 1)))
      } : {}));
      buy += number(row.buy);
      sell += number(row.sell);
      prints += number(row.prints);
      if (row.volume > 0) volumes.push(number(row.volume));
      if (row.volume > 0 && row.prints > 0) tradeUnits.push(number(row.volume) / Math.max(1, number(row.prints)));
      state.lastPrice = number(row.closePrice, state.lastPrice);
    });
    if (continuity) {
      cumulative = stabilizeCumulativeSeries(top, continuity.topByTime, continuity.time, continuity.topOpen);
      cumulativeTick = stabilizeCumulativeSeries(ticks, continuity.tickByTime, continuity.time, continuity.tickOpen);
    }
    state.candles = top.slice(-HISTORY_LIMIT);
    state.tickCandles = ticks.slice(-HISTORY_LIMIT);
    state.priceCandles = prices.slice(-HISTORY_LIMIT);
    state.cumDelta = cumulative;
    state.cumTick = cumulativeTick;
    state.buyVolume = buy;
    state.sellVolume = sell;
    state.prints = prints;
    if (volumes.length) {
      volumes.sort(function (a, b) { return a - b; });
      state.proxyUnit = Math.max(.000001, volumes[Math.floor(volumes.length / 2)] / 120);
    } else {
      state.proxyUnit = 1;
    }
    if (tradeUnits.length) {
      tradeUnits.sort(function (a, b) { return a - b; });
      state.multiUnit = Math.max(.00000001, tradeUnits[Math.floor(tradeUnits.length / 2)]);
    } else {
      state.multiUnit = Math.max(.00000001, state.proxyUnit);
    }
    buildMultiHistory(rows);
    if (continuity) {
      state.multiCandles.forEach(function (series, index) {
        state.multiCvd[index] = stabilizeCumulativeSeries(
          series,
          continuity.multiByTime[index],
          continuity.time,
          continuity.multiOpen[index]
        );
      });
    }
    state.appliedHistoryContext = historyContextKey();
    captureClosedHistorySeals();
    if (historicalAnchorTime > 0) restoreHistoricalViewport(historicalAnchorTime);
    syncChrome();
    syncEmpty();
    scheduleRender();
  }

  function appendTrade(price, quantity, time, isBuy, tickDirection, allowFlatBucket) {
    if (usesBinanceKlines()) return false;
    price = number(price);
    quantity = Math.max(.00000001, number(quantity, 1));
    time = number(time, Date.now());
    if (!price || !state.open) return false;
    if (state.endOffset > 0) {
      state.pinnedLiveUpdatePending = true;
      return false;
    }
    var interval = timeframeMs(state.timeframe);
    var bucket = Math.floor(time / interval) * interval;
    var pricePressureMode = usesPricePressure();
    var last = state.candles[state.candles.length - 1];
    var lastTick = state.tickCandles[state.tickCandles.length - 1];
    var lastPriceCandle = state.priceCandles[state.priceCandles.length - 1];
    var lastMulti = state.multiCandles.map(function (series) { return series[series.length - 1]; });
    var latestBucket = Math.max.apply(Math, [
      number(last && last.time),
      number(lastTick && lastTick.time),
      number(lastPriceCandle && lastPriceCandle.time)
    ].concat(lastMulti.map(function (row) { return number(row && row.time); })));
    if (latestBucket > bucket) return false;
    var opensNewBucket = !latestBucket || latestBucket < bucket;
    var historicalAnchorTime = state.endOffset > 0
      ? number(state.historyAnchorTime) || historyAnchorAtOffset(state.endOffset)
      : 0;
    var previousPrice = state.lastPrice;
    var priceMetrics = null;
    if (pricePressureMode) {
      if (!(previousPrice > 0)) {
        state.lastPrice = price;
        if (!allowFlatBucket || !opensNewBucket) return false;
        previousPrice = price;
      }
      priceMetrics = forexGoldPriceMetrics(previousPrice, price, state.symbol);
      if (!priceMetrics.direction) {
        if (!allowFlatBucket || !opensNewBucket) return false;
        isBuy = true;
        tickDirection = 0;
      } else {
        isBuy = priceMetrics.direction > 0;
        tickDirection = priceMetrics.direction;
      }
    }
    var signed = pricePressureMode ? priceMetrics.pressure : (isBuy ? quantity : -quantity);
    if (!tickDirection && !pricePressureMode) {
      if (state.lastPrice) tickDirection = price > state.lastPrice ? 1 : price < state.lastPrice ? -1 : (isBuy ? 1 : -1);
      else tickDirection = isBuy ? 1 : -1;
    }
    var tickSigned = pricePressureMode ? tickDirection : quantity * tickDirection;
    var pressureAmount = pricePressureMode ? priceMetrics.magnitude : quantity;
    var directionAmount = pricePressureMode ? 1 : quantity;
    var positivePressure = pricePressureMode ? signed > 0 : !!isBuy;
    var missingMultiBucket = lastMulti.some(function (row) { return !row || row.time !== bucket; });
    if (!last || last.time !== bucket || !lastTick || !lastPriceCandle || lastPriceCandle.time !== bucket || missingMultiBucket) {
      last = {
        time: bucket,
        open: state.cumDelta,
        high: state.cumDelta,
        low: state.cumDelta,
        close: state.cumDelta,
        delta: 0,
        buy: 0,
        sell: 0,
        prints: 0
      };
      lastTick = {
        time: bucket,
        open: state.cumTick,
        high: state.cumTick,
        low: state.cumTick,
        close: state.cumTick,
        delta: 0,
        buy: 0,
        sell: 0,
        prints: 0
      };
      lastPriceCandle = {
        time: bucket,
        open: pricePressureMode && previousPrice > 0 ? previousPrice : price,
        high: Math.max(pricePressureMode && previousPrice > 0 ? previousPrice : price, price),
        low: Math.min(pricePressureMode && previousPrice > 0 ? previousPrice : price, price),
        close: price,
        volume: 0,
        magnitude: 0,
        delta: 0,
        buy: 0,
        sell: 0,
        prints: 0
      };
      state.candles.push(last);
      state.tickCandles.push(lastTick);
      state.priceCandles.push(lastPriceCandle);
      lastMulti = state.multiCandles.map(function (series, index) {
        var value = number(state.multiCvd[index]);
        var row = { time: bucket, open: value, high: value, low: value, close: value, delta: 0 };
        series.push(row);
        if (series.length > HISTORY_LIMIT) series.shift();
        return row;
      });
      if (state.candles.length > HISTORY_LIMIT) state.candles.shift();
      if (state.tickCandles.length > HISTORY_LIMIT) state.tickCandles.shift();
      if (state.priceCandles.length > HISTORY_LIMIT) state.priceCandles.shift();
      if (state.endOffset > 0) {
        if (!restoreHistoricalViewport(historicalAnchorTime)) state.endOffset = Math.min(state.endOffset + 1, Math.max(0, synchronizedHistoryLength() - 2));
        syncZoomControls();
      }
    }

    if (pricePressureMode) {
      var previousBarPressure = number(lastPriceCandle.delta);
      var previousBarMagnitude = Math.abs(previousBarPressure);
      var previousBarBuy = Math.max(0, number(lastPriceCandle.buy));
      var previousBarSell = Math.max(0, number(lastPriceCandle.sell));
      var previousBarDirection = number(lastTick.delta);
      var previousBarPrints = number(last.prints);

      lastPriceCandle.high = Math.max(lastPriceCandle.high, price);
      lastPriceCandle.low = Math.min(lastPriceCandle.low, price);
      lastPriceCandle.close = price;
      lastPriceCandle.prints = 1;

      var structuralBaseline = completedPriceRangeBaseline(state.priceCandles, lastPriceCandle, state.symbol);
      var structuralMetrics = forexGoldOhlcPressureMetrics(
        lastPriceCandle.open,
        lastPriceCandle.high,
        lastPriceCandle.low,
        lastPriceCandle.close,
        state.symbol,
        structuralBaseline
      );
      var currentBarPressure = structuralMetrics.pressure;
      var currentBarMagnitude = structuralMetrics.magnitude;
      var currentBarBuy = Math.max(0, currentBarPressure);
      var currentBarSell = Math.max(0, -currentBarPressure);
      var pressureAdjustment = currentBarPressure - previousBarPressure;

      state.cumDelta += pressureAdjustment;
      last.close = state.cumDelta;
      last.high = Math.max(last.open, last.close);
      last.low = Math.min(last.open, last.close);
      last.delta = currentBarPressure;
      last.buy = currentBarBuy;
      last.sell = currentBarSell;
      last.prints = 1;

      var currentBarDirection = structuralMetrics.direction;
      state.cumTick += currentBarDirection - previousBarDirection;
      lastTick.close = state.cumTick;
      lastTick.high = Math.max(lastTick.open, lastTick.close);
      lastTick.low = Math.min(lastTick.open, lastTick.close);
      lastTick.delta = currentBarDirection;
      lastTick.buy = currentBarDirection > 0 ? 1 : 0;
      lastTick.sell = currentBarDirection < 0 ? 1 : 0;
      lastTick.prints = 1;

      lastPriceCandle.magnitude = currentBarMagnitude;
      lastPriceCandle.delta = currentBarPressure;
      lastPriceCandle.buy = currentBarBuy;
      lastPriceCandle.sell = currentBarSell;

      var previousMultiIndex = pressureMagnitudeBucketIndex(previousBarMagnitude, state.multiThresholds);
      var previousMultiRow = lastMulti[previousMultiIndex];
      state.multiCvd[previousMultiIndex] = number(state.multiCvd[previousMultiIndex]) - previousBarPressure;
      previousMultiRow.close = state.multiCvd[previousMultiIndex];
      previousMultiRow.delta -= previousBarPressure;
      previousMultiRow.high = Math.max(previousMultiRow.open, previousMultiRow.close);
      previousMultiRow.low = Math.min(previousMultiRow.open, previousMultiRow.close);

      var currentMultiIndex = pressureMagnitudeBucketIndex(currentBarMagnitude, state.multiThresholds);
      var currentMultiRow = lastMulti[currentMultiIndex];
      state.multiCvd[currentMultiIndex] = number(state.multiCvd[currentMultiIndex]) + currentBarPressure;
      currentMultiRow.close = state.multiCvd[currentMultiIndex];
      currentMultiRow.delta += currentBarPressure;
      currentMultiRow.high = Math.max(currentMultiRow.open, currentMultiRow.close);
      currentMultiRow.low = Math.min(currentMultiRow.open, currentMultiRow.close);

      state.buyVolume = Math.max(0, state.buyVolume + currentBarBuy - previousBarBuy);
      state.sellVolume = Math.max(0, state.sellVolume + currentBarSell - previousBarSell);
      state.prints = Math.max(0, state.prints + 1 - previousBarPrints);
      state.lastPrice = price;
      scheduleChromeSync();
      scheduleRender();
      return true;
    }

    state.cumDelta += signed;
    state.cumTick += tickSigned;
    last.close = state.cumDelta;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
    last.delta += signed;
    last.buy += positivePressure ? pressureAmount : 0;
    last.sell += positivePressure ? 0 : pressureAmount;
    last.prints += 1;

    lastTick.close = state.cumTick;
    lastTick.high = Math.max(lastTick.high, lastTick.close);
    lastTick.low = Math.min(lastTick.low, lastTick.close);
    lastTick.delta += tickSigned;
    lastTick.buy += tickDirection > 0 ? directionAmount : 0;
    lastTick.sell += tickDirection < 0 ? directionAmount : 0;
    lastTick.prints += 1;

    lastPriceCandle.high = Math.max(lastPriceCandle.high, price);
    lastPriceCandle.low = Math.min(lastPriceCandle.low, price);
    lastPriceCandle.close = price;
    lastPriceCandle.volume += pricePressureMode ? 1 : quantity;
    if (pricePressureMode) lastPriceCandle.magnitude = number(lastPriceCandle.magnitude) + pressureAmount;
    lastPriceCandle.delta += signed;
    lastPriceCandle.buy += positivePressure ? pressureAmount : 0;
    lastPriceCandle.sell += positivePressure ? 0 : pressureAmount;
    lastPriceCandle.prints += 1;

    var multiIndex = pricePressureMode
      ? pressureMagnitudeBucketIndex(pressureAmount, state.multiThresholds)
      : multiBucketIndex(quantity);
    var multiRow = lastMulti[multiIndex];
    state.multiCvd[multiIndex] += signed;
    multiRow.close = state.multiCvd[multiIndex];
    multiRow.high = Math.max(multiRow.high, multiRow.close);
    multiRow.low = Math.min(multiRow.low, multiRow.close);
    multiRow.delta += signed;

    state.buyVolume += positivePressure ? pressureAmount : 0;
    state.sellVolume += positivePressure ? 0 : pressureAmount;
    state.prints += 1;
    state.lastPrice = price;
    scheduleChromeSync();
    scheduleRender();
    return true;
  }

  function stopFeed() {
    state.feedToken += 1;
    if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
    if (state.pingTimer) window.clearInterval(state.pingTimer);
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    if (state.secureQuoteTimer) window.clearInterval(state.secureQuoteTimer);
    if (state.canonicalHistoryTimer) window.clearInterval(state.canonicalHistoryTimer);
    if (state.historyRetryTimer) window.clearTimeout(state.historyRetryTimer);
    state.reconnectTimer = 0;
    state.pingTimer = 0;
    state.pollTimer = 0;
    state.secureQuoteTimer = 0;
    state.canonicalHistoryTimer = 0;
    state.canonicalHistoryBusy = false;
    state.binanceRepairBusy = false;
    state.binanceLastEventAt = 0;
    state.binanceConnectedAt = 0;
    state.secureQuoteBusy = false;
    state.lastVerifiedQuoteAt = 0;
    state.historyRetryTimer = 0;
    abortBinanceHistory();
    if (state.ws) {
      try {
        state.ws.onopen = null;
        state.ws.onmessage = null;
        state.ws.onerror = null;
        state.ws.onclose = null;
        state.ws.close();
      } catch (_) {}
      state.ws = null;
    }
  }

  function scheduleReconnect(token) {
    if (!state.open || token !== state.feedToken) return;
    if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = window.setTimeout(function () {
      state.reconnectTimer = 0;
      if (state.open && token === state.feedToken) connectFeed();
    }, 2200);
  }

  function connectCryptoFeed() {
    if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
      try {
        state.ws.onopen = null;
        state.ws.onmessage = null;
        state.ws.onerror = null;
        state.ws.onclose = null;
        state.ws.close();
      } catch (_) {}
      state.ws = null;
    }
    if (state.pingTimer) window.clearInterval(state.pingTimer);
    state.pingTimer = 0;
    var exchange = state.exchange;
    var symbol = binanceSymbol(state.symbol);
    var token = ++state.feedToken;
    var url = '';
    if (exchange === 'okx') url = 'wss://ws.okx.com:8443/ws/v5/public';
    else if (exchange === 'bybit') url = 'wss://stream.bybit.com/v5/public/spot';
    else {
      exchange = 'binance';
      state.exchange = 'binance';
      url = 'wss://stream.binance.com:9443/ws/' + symbol.toLowerCase() + '@trade';
    }
    setStatus('connecting', 'warn', exchange + ' taker trades');
    try {
      var socket = new WebSocket(url);
      state.ws = socket;
      socket.onopen = function () {
        if (token !== state.feedToken) return;
        if (exchange === 'okx') {
          socket.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'trades', instId: okxSymbol(symbol) }] }));
          state.pingTimer = window.setInterval(function () {
            try { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); } catch (_) {}
          }, 20000);
        } else if (exchange === 'bybit') {
          socket.send(JSON.stringify({ op: 'subscribe', args: ['publicTrade.' + symbol] }));
          state.pingTimer = window.setInterval(function () {
            try { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' })); } catch (_) {}
          }, 20000);
        }
        setStatus('live', 'live', exchange + ' taker trades');
      };
      socket.onmessage = function (event) {
        if (token !== state.feedToken) return;
        if (typeof event.data !== 'string' || !event.data || event.data === 'ping' || event.data === 'pong') return;
        try {
          var payload = JSON.parse(event.data);
          if (exchange === 'binance') {
            appendTrade(payload.p, payload.q, payload.T || payload.E, payload.m === false, payload.m === false ? 1 : -1);
          } else if (exchange === 'okx' && payload.arg && payload.arg.channel === 'trades' && Array.isArray(payload.data)) {
            payload.data.forEach(function (trade) {
              appendTrade(trade.px, trade.sz, trade.ts, String(trade.side).toLowerCase() === 'buy', String(trade.side).toLowerCase() === 'buy' ? 1 : -1);
            });
          } else if (exchange === 'bybit' && String(payload.topic || '').indexOf('publicTrade.') === 0 && Array.isArray(payload.data)) {
            payload.data.forEach(function (trade) {
              appendTrade(trade.p, trade.v, trade.T, String(trade.S).toLowerCase() === 'buy', String(trade.S).toLowerCase() === 'buy' ? 1 : -1);
            });
          }
        } catch (_) {}
      };
      socket.onerror = function () {
        if (token === state.feedToken) setStatus('reconnecting', 'warn', exchange + ' feed');
      };
      socket.onclose = function () {
        if (token !== state.feedToken) return;
        state.ws = null;
        setStatus('reconnecting', 'warn', exchange + ' feed');
        scheduleReconnect(token);
      };
    } catch (_) {
      setStatus('error', 'warn', exchange + ' feed');
      scheduleReconnect(token);
    }
  }

  function quoteGuardSource(quote) {
    quote = quote || {};
    if (quote.guardSource) return String(quote.guardSource);
    var source = String(quote.source || 'module1-unknown');
    if (/fmp/i.test(source)) return 'fmp-secure-proxy';
    if (/massive/i.test(source)) return 'massive-rest';
    return source;
  }

  function recoverHistoryIntegrity() {
    var now = Date.now();
    if (!state.open || now - number(state.lastIntegrityRefreshAt) < 30000) return false;
    state.lastIntegrityRefreshAt = now;
    if (syncCanonicalRuntimeRows()) return true;
    window.setTimeout(function () {
      if (state.open) reloadData('xau-live-jump-unconfirmed');
    }, 0);
    return true;
  }

  function approveLiveQuotePrice(price, quote) {
    if (cleanSymbol(state.symbol) !== 'XAUUSD') return true;
    // Cached labels and DOM text are not OHLC evidence.  When the canonical
    // terminal candle is unavailable, only a fresh authenticated quote may
    // advance standalone XAU pressure.
    if (!quote || quote.fresh !== true) return false;
    var guard = window.GPXauLivePriceStabilityV1;
    if (!guard || typeof guard.approve !== 'function') return false;
    var evidenceKey = quote && (quote.evidenceKey || quote.time || quote.timestamp || '');
    var approved = guard.approve(price, state.lastPrice, quoteGuardSource(quote), quote && quote.fresh === true, evidenceKey);
    if (approved) return true;
    state.rejectedQuoteCount += 1;
    recoverHistoryIntegrity();
    try {
      window.dispatchEvent(new CustomEvent('guardeer:module1-xau-quote-rejected', {
        detail: {
          version: VERSION,
          price: number(price),
          reference: number(state.lastPrice),
          source: quoteGuardSource(quote),
          rejectedCount: state.rejectedQuoteCount
        }
      }));
    } catch (_) {}
    return false;
  }

  function appendQuote(quote) {
    quote = quote || {};
    // Forex/Gold active candles are part of the centrally fenced snapshot.
    // Never let a browser's poll phase, network latency or join time mutate
    // either panel locally. Crypto keeps its exchange-native live path.
    if (!isCryptoMarket(state.symbol, state.exchange)) return false;
    var price = number(quote.price);
    if (!(price > 0)) return false;
    var eventTime = 0;
    if (!isCryptoMarket(state.symbol, state.exchange)) {
      var trustedEvidence = quote.providerTimestampVerified === true || quote.responseTimeFallback === true;
      eventTime = trustedForexGoldEventTime(quote);
      if (quote.fresh !== true || !trustedEvidence || !eventTime) return false;
      quote.time = eventTime;
    }
    if (!eventTime) eventTime = quoteEventTime(quote);
    if (!isCryptoMarket(state.symbol, state.exchange) && number(state.lastCanonicalEventAt) > 0 &&
        eventTime <= number(state.lastCanonicalEventAt)) return false;
    if (!isCryptoMarket(state.symbol, state.exchange) && number(state.lastAcceptedQuoteEventAt) > 0 &&
        eventTime < number(state.lastAcceptedQuoteEventAt)) return false;
    if (state.endOffset > 0) {
      state.pinnedLiveUpdatePending = true;
      return true;
    }
    // Validate before touching freshness, OHLC or pressure accumulators.  One
    // bad XAU quote must not leave a permanent wick in the active candle.
    if (!approveLiveQuotePrice(price, quote)) return false;
    var bucket = Math.floor(eventTime / timeframeMs(state.timeframe)) * timeframeMs(state.timeframe);
    var last = state.priceCandles[state.priceCandles.length - 1];
    if (last && number(last.time) > bucket) return false;
    if (last && bucket - number(last.time) > timeframeMs(state.timeframe) * 1.5) {
      state.lastHistoryError = 'Live quote held because candle history has a gap.';
      recoverHistoryIntegrity();
      return false;
    }
    if (quote.fresh === true) state.lastVerifiedQuoteAt = Date.now();
    if (price === state.lastPrice && last && number(last.time) === bucket) {
      if (!isCryptoMarket(state.symbol, state.exchange)) {
        state.lastAcceptedQuoteEventAt = Math.max(number(state.lastAcceptedQuoteEventAt), eventTime);
      }
      return true;
    }
    var direction = state.lastPrice ? (price > state.lastPrice ? 1 : price < state.lastPrice ? -1 : 0) : 0;
    var appended = appendTrade(price, state.proxyUnit, eventTime, direction >= 0, direction, true) === true;
    if (appended && !isCryptoMarket(state.symbol, state.exchange)) {
      state.lastAcceptedQuoteEventAt = Math.max(number(state.lastAcceptedQuoteEventAt), eventTime);
    }
    return appended;
  }

  function pollRuntimePrice() {
    if (!state.open || isCryptoMarket(state.symbol, state.exchange)) return false;
    // Mirror a changed canonical candle first, then still allow an independently
    // verified quote to advance the active candle. Merely having a static
    // canonical inventory must never freeze Module 1.
    syncCanonicalRuntimeRows();
    var rt = runtime();
    var price = 0;
    var quote = null;
    try {
      var quoteState = window.__gpForexQuoteState && window.__gpForexQuoteState[cleanSymbol(state.symbol)];
      var quoteTimestamp = freshTimestamp(quoteState && quoteState.time);
      var quoteTrusted = quoteState && (quoteState.providerTimestampVerified === true || quoteState.responseTimeFallback === true);
      if (quoteState && quoteState.fresh === true && quoteTrusted && quoteTimestamp) {
        price = number(quoteState.price);
        if (price > 0) quote = {
          price: price,
          source: quoteState.source || 'TERMINAL',
          fresh: true,
          providerTimestampVerified: quoteState.providerTimestampVerified === true,
          responseTimeFallback: quoteState.responseTimeFallback === true,
          time: quoteTimestamp
        };
      }
      if (!quote && rt && typeof rt.getVerifiedQuote === 'function') {
        var bridgedQuote = rt.getVerifiedQuote();
        var bridgedTimestamp = freshTimestamp(bridgedQuote && bridgedQuote.time);
        var bridgedPrice = number(bridgedQuote && bridgedQuote.price);
        var bridgeTrusted = bridgedQuote && (bridgedQuote.providerTimestampVerified === true || bridgedQuote.responseTimeFallback === true);
        if (bridgedQuote && bridgedQuote.fresh === true && bridgeTrusted && bridgedTimestamp && bridgedPrice > 0) {
          price = bridgedPrice;
          quote = {
            price: price,
            source: bridgedQuote.source || 'TERMINAL BRIDGE',
            fresh: true,
            providerTimestampVerified: bridgedQuote.providerTimestampVerified === true,
            responseTimeFallback: bridgedQuote.responseTimeFallback === true,
            time: bridgedTimestamp
          };
        }
      }
      if (!quote && runtimeMarketMatches(rt)) {
        if (rt && typeof rt.getCurrentPrice === 'function') price = number(rt.getCurrentPrice());
        if (!price && rt && rt.state) price = number(rt.state.currentPrice || rt.state.price);
        var runtimeTimestamp = freshRuntimeQuoteTimestamp(rt);
        if (price > 0) quote = { price: price, source: 'TERMINAL', fresh: false, time: runtimeTimestamp || 0 };
      }
      if (!price) {
        var node = qs('#last-price,[data-last-price],#gp-overview-price');
        price = number(node && String(node.textContent || '').replace(/[^0-9.-]/g, ''));
        if (price > 0) quote = { price: price, source: 'TERMINAL DISPLAY', fresh: false };
      }
    } catch (_) {}
    return quote ? appendQuote(quote) : false;
  }

  function fmpLiveQuote(symbol) {
    var key = String(config().FMP_API_KEY || 'GUARDEER_SECURE_PROXY').trim();
    var url = 'https://financialmodelingprep.com/stable/quote-short?symbol=' +
      encodeURIComponent(cleanSymbol(symbol)) + '&apikey=' + encodeURIComponent(key) + '&_=' + Date.now();
    return fetchJson(url, 7000).then(function (payload) {
      var row = Array.isArray(payload) ? payload[0] : payload && payload.data && payload.data[0] || payload;
      var price = number(row && (row.price != null ? row.price : row.close != null ? row.close : row.value));
      if (!(price > 0)) throw new Error('Live quote did not contain a valid price.');
      var result = verifiedQuoteResultR390(row, price, 'Secure quote feed');
      result.guardSource = 'fmp-secure-proxy';
      return requireFreshQuoteR390(result, 'Secure quote feed');
    });
  }

  function massiveLiveQuote(symbol) {
    var clean = cleanSymbol(symbol);
    var from = clean.slice(0, 3);
    var to = clean.slice(3, 6);
    if (from.length !== 3 || to.length !== 3) return Promise.reject(new Error('Fallback quote symbol unavailable.'));
    var url = 'https://api.massive.com/v1/last_quote/currencies/' + encodeURIComponent(from) + '/' +
      encodeURIComponent(to) + '?apiKey=GUARDEER_SECURE_PROXY&_=' + Date.now();
    return fetchJson(url, 7000).then(function (payload) {
      var row = payload && (payload.last || payload.results || payload);
      var bid = number(row && (row.bid != null ? row.bid : row.bidPrice));
      var ask = number(row && (row.ask != null ? row.ask : row.askPrice));
      var price = bid > 0 && ask > 0 ? (bid + ask) / 2 : ask || bid || number(row && row.price);
      if (!(price > 0)) throw new Error('Fallback quote did not contain a valid price.');
      var result = verifiedQuoteResultR390(row, price, 'Secure quote feed');
      result.guardSource = 'massive-rest';
      return requireFreshQuoteR390(result, 'Secure quote feed');
    });
  }

  function pollSecureLiveQuote(token) {
    if (!state.open || token !== state.feedToken || isCryptoMarket(state.symbol, state.exchange) || state.secureQuoteBusy) return;
    syncCanonicalRuntimeRows();
    // The terminal/event bridge remains the lowest-latency source. Only use the
    // authenticated provider fallback when that bridge has not delivered a
    // verified quote recently (notably in iOS/Safari standalone windows).
    var latestTrustedUpdate = Math.max(number(state.lastVerifiedQuoteAt), number(state.lastCanonicalRuntimeAt));
    if (latestTrustedUpdate && Date.now() - latestTrustedUpdate < 3500) return;
    var symbol = state.symbol;
    var exchange = state.exchange;
    var timeframe = state.timeframe;
    state.secureQuoteBusy = true;
    prepareSecureMarketSession().then(function () {
      return fmpLiveQuote(symbol);
    }).catch(function (providerError) {
      var fallback = responseTimeQuoteFallbackR390(
        providerError && providerError.quoteResult,
        symbol,
        exchange,
        timeframe,
        'Secure quote feed'
      );
      if (fallback) {
        fallback.guardSource = 'fmp-secure-proxy-response-time';
        return fallback;
      }
      throw providerError;
    }).then(function (quote) {
      if (!state.open || token !== state.feedToken || cleanSymbol(state.symbol) !== cleanSymbol(symbol) ||
          cleanExchange(state.exchange) !== cleanExchange(exchange) || normalizeTimeframe(state.timeframe) !== normalizeTimeframe(timeframe)) return;
      previewLivePrice(quote);
    }).catch(function (error) {
      if (!state.open || token !== state.feedToken) return;
      if (isFmpAuthError(error)) {
        stopFeed();
        setStatus('auth required', 'error', 'Secure market data requires sign-in');
      }
      // A failed live-price preview is silent: the server verdict owns the status pill.
    }).finally(function () {
      if (token === state.feedToken) state.secureQuoteBusy = false;
    });
  }

  function refreshCanonicalHistorySnapshot(token) {
    if (!state.open || token !== state.feedToken || isCryptoMarket(state.symbol, state.exchange) || state.canonicalHistoryBusy) {
      return Promise.resolve(false);
    }
    var symbol = state.symbol;
    var exchange = state.exchange;
    var timeframe = state.timeframe;
    state.canonicalHistoryBusy = true;
    return loadForexGoldHistory(symbol, timeframe).then(function (rows) {
      if (!state.open || token !== state.feedToken || cleanSymbol(state.symbol) !== cleanSymbol(symbol) ||
          cleanExchange(state.exchange) !== cleanExchange(exchange) || normalizeTimeframe(state.timeframe) !== normalizeTimeframe(timeframe)) return false;
      if (!rows.length) throw new Error('Canonical Module 1 snapshot is empty.');
      applyAuthoritativeHistory(rows);
      state.lastCanonicalRuntimeAt = Date.now();
      setCanonicalStatus();
      return true;
    }).catch(function (error) {
      if (state.open && token === state.feedToken) {
        state.lastHistoryError = String(error && error.message || 'Canonical Module 1 snapshot unavailable');
        if (isFmpAuthError(error)) {
          stopFeed();
          clearLoadedHistory();
          setStatus('auth required', 'error', 'Secure market data requires sign-in');
          syncChrome();
          syncEmpty();
          scheduleRender();
        } else if (state.candles.length >= 2) {
          // r394: a failed periodic refresh no longer wipes the chart. The
          // last verified server revision stays on screen, clearly labelled,
          // until the next successful refresh replaces it atomically.
          state.canonicalSourceFresh = false;
          setStatus('stale', 'warn', 'STALE · last verified data · refresh failed');
          syncChrome();
        } else {
          clearLoadedHistory();
          setStatus('waiting for data', 'error', 'Server data unavailable · retrying');
          syncChrome();
          syncEmpty();
          scheduleRender();
        }
      }
      return false;
    }).finally(function () {
      if (token === state.feedToken) state.canonicalHistoryBusy = false;
    });
  }

  function connectProxyFeed() {
    var token = ++state.feedToken;
    // History, finalized candles and every cumulative value arrive as one
    // server-owned revision. r395 adds a live-price PREVIEW on top: the price
    // OHLC of the active candle follows the latest verified quote between
    // server refreshes so the module never lags the terminal, while the
    // pressure/direction panels stay strictly server-owned and every server
    // refresh replaces the preview atomically.
    setCanonicalStatus();
    state.canonicalHistoryTimer = window.setInterval(function () {
      refreshCanonicalHistorySnapshot(token);
    }, canonicalRefreshMs(state.timeframe));
    state.secureQuoteTimer = window.setInterval(function () {
      pollSecureLiveQuote(token);
    }, LIVE_PREVIEW_POLL_MS);
  }

  function livePreviewLimit(price) {
    var closed = state.priceCandles.slice(-25, -1);
    var ranges = closed.map(function (row) { return number(row.high) - number(row.low); })
      .filter(function (value) { return value > 0; })
      .sort(function (a, b) { return a - b; });
    var medianRange = ranges.length ? ranges[Math.floor(ranges.length / 2)] : 0;
    return Math.max(price * .0015, medianRange * 3);
  }

  function previewLivePrice(quote) {
    // Forex/Gold only. Touches ONLY the price OHLC of the active (server
    // unfinalized) candle; cumulative pressure/direction are never recomputed
    // locally. A quote that jumps beyond the spike limit is held until a second
    // sample confirms it, so one bad provider print never draws a fake wick.
    if (isCryptoMarket(state.symbol, state.exchange)) return false;
    var price = number(quote && quote.price);
    if (!(price > 0) || !state.priceCandles.length) return false;
    var interval = timeframeMs(state.timeframe);
    var bucket = Math.floor(Date.now() / interval) * interval;
    var last = state.priceCandles[state.priceCandles.length - 1];
    if (!last || number(last.time) !== bucket) return false;
    if (number(state.canonicalActiveBucket) !== bucket) return false;
    var reference = number(last.close);
    if (!(reference > 0)) return false;
    var limit = livePreviewLimit(price);
    var now = Date.now();
    if (Math.abs(price - reference) > limit) {
      var candidate = state.livePreviewCandidate;
      var sameSide = candidate && (price - reference) * (candidate.price - reference) > 0;
      var confirmed = sameSide && now - candidate.at <= 15000 && candidate.price !== price &&
        Math.abs(candidate.price - reference) > limit / 2;
      if (!confirmed) {
        state.livePreviewCandidate = { price: price, at: now };
        return false;
      }
    }
    state.livePreviewCandidate = null;
    if (price === reference && last.livePreview) return true;
    last.close = price;
    last.high = Math.max(number(last.high), price);
    last.low = Math.min(number(last.low), price);
    last.livePreview = true;
    state.lastPrice = price;
    state.lastVerifiedQuoteAt = now;
    if (quote && quote.fresh === true) state.lastAcceptedQuoteEventAt = Math.max(number(state.lastAcceptedQuoteEventAt), number(quote.time));
    scheduleRender();
    return true;
  }

  function connectFeed() {
    stopFeed();
    if (!state.open) return;
    if (state.exchange === 'binance' && !isBinanceCryptoMarket(state.symbol, state.exchange)) {
      state.lastHistoryError = 'Binance data is restricted to supported crypto symbols.';
      setStatus('waiting', 'warn', 'Binance disabled for this symbol');
      return;
    }
    if (usesBinanceKlines()) connectBinanceKlineFeed();
    else if (isCryptoMarket(state.symbol, state.exchange)) connectCryptoFeed();
    else connectProxyFeed();
  }

  function historySourceLabel(exchange, crypto) {
    if (!crypto) return 'Server snapshot';
    if (exchange === 'binance') return 'Binance taker delta';
    if (exchange === 'okx') return 'OKX trades · candle seed';
    if (exchange === 'bybit') return 'Bybit trades · candle seed';
    return exchange + ' taker trades';
  }

  function scheduleCanonicalHistoryRetry(seq, attempt) {
    if (state.historyRetryTimer) window.clearTimeout(state.historyRetryTimer);
    state.historyRetryTimer = 0;
    // r394: keep retrying (capped at one attempt per 30 s) for as long as the
    // module stays open, so a short server outage never leaves a dead window.
    if (!state.open || seq !== state.loadSeq || isCryptoMarket(state.symbol, state.exchange)) return;
    state.historyRetryTimer = window.setTimeout(function () {
      state.historyRetryTimer = 0;
      if (!state.open || seq !== state.loadSeq || isCryptoMarket(state.symbol, state.exchange)) return;
      var symbol = state.symbol;
      var timeframe = state.timeframe;
      loadForexGoldHistory(symbol, timeframe).then(function (rows) {
        if (!state.open || seq !== state.loadSeq || cleanSymbol(state.symbol) !== cleanSymbol(symbol) ||
            normalizeTimeframe(state.timeframe) !== normalizeTimeframe(timeframe)) return;
        if (!rows.length) throw new Error('Canonical Module 1 snapshot is empty.');
        state.lastHistoryError = '';
        applyAuthoritativeHistory(rows);
        setCanonicalStatus();
        syncChrome();
        scheduleRender();
        connectFeed();
      }).catch(function (error) {
        if (!state.open || seq !== state.loadSeq) return;
        state.lastHistoryError = String(error && error.message || 'Canonical Module 1 snapshot unavailable');
        scheduleCanonicalHistoryRetry(seq, attempt + 1);
      });
    }, Math.min(30000, 1500 * Math.pow(1.35, attempt)));
  }

  function clearLoadedHistory() {
    state.binanceRows = [];
    state.binanceLastEventAt = 0;
    state.binanceRepairAt = 0;
    state.binanceRepairBusy = false;
    state.binanceRepairNeeded = false;
    state.binanceBlocked = false;
    state.freshHistoryProof = null;
    state.candles = [];
    state.tickCandles = [];
    state.priceCandles = [];
    state.multiCandles = [[], [], [], [], []];
    state.multiCvd = [0, 0, 0, 0, 0];
    state.multiThresholds = [];
    state.cumDelta = 0;
    state.cumTick = 0;
    state.buyVolume = 0;
    state.sellVolume = 0;
    state.prints = 0;
    state.lastPrice = 0;
    state.runtimeFingerprint = '';
    state.runtimeCanonicalActive = false;
    state.canonicalDatasetId = '';
    state.canonicalRevision = '';
    state.canonicalAlgorithmVersion = '';
    state.canonicalGeneratedAt = 0;
    state.canonicalServerTime = 0;
    state.canonicalActiveBucket = 0;
    state.canonicalFinalizedThrough = 0;
    state.canonicalSourceFresh = true;
    state.canonicalSourceAgeSeconds = 0;
    state.canonicalRefreshState = '';
    state.canonicalReceivedAt = 0;
    state.livePreviewCandidate = null;
    state.lastCanonicalRuntimeAt = 0;
    state.lastCanonicalEventAt = 0;
    state.lastAcceptedQuoteEventAt = 0;
    state.endOffset = 0;
    state.historyAnchorTime = 0;
    state.zoom = 1;
    clearPendingCanonicalHistory();
    state.pinnedLiveUpdatePending = false;
    state.renderEnd = null;
    state.renderCount = 0;
    state.multiThresholdContext = '';
    state.appliedHistoryContext = '';
    state.timeframeRailKey = '';
  }

  function reloadData(reason) {
    if (!state.open) return Promise.resolve(false);
    var previousContext = historyContextKey();
    var market = readMarket();
    state.symbol = market.symbol;
    state.exchange = market.exchange;
    if (!state.timeframeLocked || reason === 'open') state.timeframe = market.timeframe;
    if (QUICK_TIMEFRAMES.indexOf(state.timeframe) < 0) state.timeframe = '1m';
    var nextContext = historyContextKey();
    var seq = ++state.loadSeq;
    stopFeed();
    var cryptoMarket = isCryptoMarket(state.symbol, state.exchange);
    var verifyCanonicalAgain = !cryptoMarket && (
      reason === 'reconnect' || reason === 'go-live' || reason === 'runtime-event' || reason === 'xau-live-jump-unconfirmed'
    );
    if (reason === 'open' || reason === 'timeframe' || reason === 'market-change' || previousContext !== nextContext || verifyCanonicalAgain) {
      clearLoadedHistory();
      scheduleRender();
    }
    setStatus('loading', 'warn', historySourceLabel(state.exchange, isCryptoMarket(state.symbol, state.exchange)));
    syncChrome();
    state.hoverIndex = null;
    state.hoverPanel = null;
    state.timeframeRailKey = '';
    if (usesBinanceKlines()) {
      state.binanceBlocked = false;
      var verifiedRuntimeRows = runtimeRows(state.timeframe);
      var historyPromise = verifiedRuntimeRows.length >= 2
        ? Promise.resolve(verifiedRuntimeRows)
        : loadBinanceCanonicalHistory(state.symbol, state.timeframe);
      return historyPromise.then(function (rows) {
        if (seq !== state.loadSeq || !state.open || historyContextKey() !== nextContext) return false;
        commitBinanceRows(rows);
        state.binanceRepairNeeded = false;
        connectFeed();
        return true;
      }).catch(function (error) {
        if (isBinanceAbort(error)) return false;
        if (seq !== state.loadSeq || !state.open || historyContextKey() !== nextContext) return false;
        if (error && (error.status === 401 || error.status === 403 || error.status === 451)) state.binanceBlocked = true;
        state.binanceRepairNeeded = true;
        setStatus(state.candles.length ? 'stale' : 'unavailable', 'warn', 'Binance full-bar history unavailable · use Reconnect');
        if (!state.binanceBlocked) connectFeed();
        return false;
      });
    }
    var immediateRows = cryptoMarket ? runtimeRows(state.timeframe) : [];
    if (immediateRows.length >= 2) {
      applyAuthoritativeHistory(immediateRows);
      setStatus('syncing', 'warn', historySourceLabel(state.exchange, true));
    }
    return loadHistory(state.symbol, state.exchange, state.timeframe).then(function (rows) {
      if (seq !== state.loadSeq || !state.open) return false;
      if (!rows.length && cryptoMarket) rows = runtimeRows(state.timeframe);
      if (rows.length) state.lastHistoryError = '';
      state.runtimeCanonicalActive = false;
      state.runtimeFingerprint = '';
      applyAuthoritativeHistory(rows);
      if (!rows.length) setStatus('waiting', 'warn', historySourceLabel(state.exchange, false));
      connectFeed();
      if (!rows.length && !cryptoMarket) scheduleCanonicalHistoryRetry(seq, 0);
      return true;
    }).catch(function (error) {
      if (seq !== state.loadSeq || !state.open) return false;
      if (isFmpAuthError(error)) {
        stopFeed();
        clearLoadedHistory();
        setStatus('auth required', 'error', 'Secure market data requires sign-in');
        syncChrome();
        scheduleRender();
        return false;
      }
      var fallback = cryptoMarket ? runtimeRows(state.timeframe) : [];
      if (fallback.length) {
        applyAuthoritativeHistory(fallback);
        connectFeed();
      } else if (!cryptoMarket) {
        state.lastHistoryError = String(error && error.message || 'Canonical Module 1 snapshot unavailable');
        clearLoadedHistory();
        setStatus('waiting for data', 'error', 'Server data unavailable · retrying');
        syncChrome();
        syncEmpty();
        scheduleRender();
        scheduleCanonicalHistoryRetry(seq, 0);
      } else {
        setStatus('waiting', 'warn', 'Waiting for exchange history');
      }
      return false;
    });
  }

  function resetBaseline() {
    if (usesBinanceKlines()) {
      resetViewport();
      showToast('Binance CVD resets at 00:00 UTC each day. Returned to the live view.');
      return;
    }
    if (usesPricePressure()) {
      resetViewport();
      showToast('The baseline is set by the server. Returned to the live default view.');
      return;
    }
    state.endOffset = 0;
    state.historyAnchorTime = 0;
    state.zoom = 1;
    state.renderEnd = null;
    state.renderCount = 0;
    resumeDeferredLiveHistory();
    syncZoomControls();
    var cumulative = 0;
    var cumulativeTick = 0;
    state.candles.forEach(function (row) {
      row.open = cumulative;
      cumulative += number(row.delta);
      row.close = cumulative;
      row.high = Math.max(row.open, row.close);
      row.low = Math.min(row.open, row.close);
    });
    state.tickCandles.forEach(function (row) {
      row.open = cumulativeTick;
      cumulativeTick += number(row.delta);
      row.close = cumulativeTick;
      row.high = Math.max(row.open, row.close);
      row.low = Math.min(row.open, row.close);
    });
    state.multiCandles.forEach(function (series, index) {
      var multiCumulative = 0;
      series.forEach(function (row) {
        row.open = multiCumulative;
        multiCumulative += number(row.delta);
        row.close = multiCumulative;
        row.high = Math.max(row.open, row.close);
        row.low = Math.min(row.open, row.close);
      });
      state.multiCvd[index] = multiCumulative;
    });
    state.cumDelta = cumulative;
    state.cumTick = cumulativeTick;
    showToast(usesPricePressure()
      ? 'Price-pressure baseline restored.'
      : 'Cumulative Delta baseline reset to zero for the visible session.');
    syncChrome();
    scheduleRender();
  }

  function startMarketMonitor() {
    if (state.marketTimer) window.clearInterval(state.marketTimer);
    state.lastRuntimeSignature = state.symbol + '|' + state.exchange;
    state.marketTimer = window.setInterval(function () {
      if (!state.open) return;
      var market = readMarket();
      var signature = market.symbol + '|' + market.exchange;
      if (signature !== state.lastRuntimeSignature) {
        state.lastRuntimeSignature = signature;
        state.timeframeLocked = false;
        if (state.reloadTimer) window.clearTimeout(state.reloadTimer);
        state.reloadTimer = window.setTimeout(function () {
          state.reloadTimer = 0;
          reloadData('market-change');
        }, 180);
      }
    }, 900);
  }

  function openModule() {
    var overlay = ensureOverlay();
    closePrimeToolsPopover();
    state.open = true;
    state.timeframeLocked = false;
    state.zoom = 1;
    state.endOffset = 0;
    state.historyAnchorTime = 0;
    state.renderEnd = null;
    state.renderCount = 0;
    state.hoverIndex = null;
    state.hoverPanel = null;
    document.body.classList.add('gp-m1cd-open');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    ensureLauncher();
    window.requestAnimationFrame(function () {
      resizeCanvas();
      scheduleRender();
    });
    startMarketMonitor();
    reloadData('open');
    try { window.dispatchEvent(new CustomEvent('guardeer:module1-cumulative-delta-opened')); } catch (_) {}
    return true;
  }

  function moduleWindowUrl() {
    var market = readMarket();
    var target;
    try {
      target = new URL('module1-cumulative-delta.html', window.location.href);
      target.searchParams.set('symbol', market.symbol || state.symbol);
      target.searchParams.set('exchange', market.exchange || state.exchange);
      target.searchParams.set('timeframe', market.timeframe || state.timeframe);
      target.searchParams.set('tool', String(state.activeView));
      target.searchParams.set('build', VERSION);
      target.hash = 'module1-cumulative-delta';
      return target.toString();
    } catch (_) {
      return 'module1-cumulative-delta.html?tool=' + state.activeView + '&build=' + encodeURIComponent(VERSION) + '#module1-cumulative-delta';
    }
  }

  function openModuleWindow() {
    return openModule();
  }

  function closeModule() {
    state.open = false;
    state.loadSeq += 1;
    document.body.classList.remove('gp-m1cd-open');
    var overlay = state.overlay || qs('#gp-module1-cumulative-delta');
    if (overlay) {
      overlay.classList.remove('is-open', 'is-maximized');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (state.marketTimer) window.clearInterval(state.marketTimer);
    if (state.reloadTimer) window.clearTimeout(state.reloadTimer);
    if (state.chromeSyncTimer) window.clearTimeout(state.chromeSyncTimer);
    state.marketTimer = 0;
    state.reloadTimer = 0;
    state.chromeSyncTimer = 0;
    stopFeed();
    ensureLauncher();
    try { window.dispatchEvent(new CustomEvent('guardeer:module1-cumulative-delta-closed')); } catch (_) {}
    if (STANDALONE) {
      window.setTimeout(function () {
        try { window.close(); } catch (_) {}
      }, 20);
    }
    return true;
  }

  function toggleMaximized() {
    var overlay = ensureOverlay();
    clearHover(false);
    overlay.classList.toggle('is-maximized');
    window.setTimeout(function () {
      resizeCanvas();
      scheduleRender();
    }, 40);
  }

  function onDocumentClick(event) {
    var target = targetOf(event);
    if (!target) return;
    var launcher = target.closest('[data-gp-module1-open]');
    if (launcher) {
      event.preventDefault();
      event.stopPropagation();
      if (STANDALONE) openModule();
      else openModuleWindow();
      return;
    }
    if (target.closest('[data-gp-step44-top-nav="prime-tools"]')) {
      queueLauncherMaintenance();
      window.setTimeout(queueLauncherMaintenance, 120);
    }
    var overlay = target.closest('#gp-module1-cumulative-delta');
    if (!overlay) return;
    if (target === overlay) {
      closeModule();
      return;
    }
    var action = target.closest('[data-gp-m1cd-action]');
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      var name = action.getAttribute('data-gp-m1cd-action');
      if (name === 'close') closeModule();
      else if (name === 'maximize') toggleMaximized();
      else if (name === 'go-live') {
        if (resetViewport()) showToast('Returned to the live edge and reset candle zoom.');
      }
      else if (name === 'reset') resetBaseline();
      else if (name === 'reconnect') reloadData('reconnect');
      else if (name === 'zoom-out') {
        if (zoomChart(-1)) showToast('Showing more loaded candles');
      }
      else if (name === 'zoom-in') {
        if (zoomChart(1)) showToast('Showing fewer candles in greater detail');
      }
      return;
    }
    var tf = target.closest('[data-gp-m1cd-tf]');
    if (tf) {
      event.preventDefault();
      event.stopPropagation();
      state.timeframe = normalizeTimeframe(tf.getAttribute('data-gp-m1cd-tf'));
      state.timeframeLocked = true;
      state.timeframeRailKey = '';
      reloadData('timeframe');
      return;
    }
    var view = target.closest('[data-gp-m1cd-view]');
    if (view) {
      event.preventDefault();
      event.stopPropagation();
      state.activeView = clamp(Math.round(number(view.getAttribute('data-gp-m1cd-view'), 1)), 1, 5);
      state.hoverIndex = null;
      state.hoverPanel = null;
      syncChrome();
      scheduleRender();
      var pressureToasts = [
        'Tool 01 live: OHLC pressure and one direction vote per candle.',
        'Tool 02 live: Price, cumulative structural pressure, structural magnitude and directional pressure.',
        'Tool 03 live: Price-movement blocks and structural-pressure history.',
        'Tool 04 live: Price, cumulative structural pressure and focused Up/Down pressure.',
        'Tool 05 live: Five structural-magnitude quantile pressure lines.'
      ];
      var cryptoToasts = [
        'Tool 01 live: Cumulative Delta and Up/Down Tick bars.',
        'Tool 02 live: Price, CVD, Volume and Ask/Bid Difference.',
        'Tool 03 live: Cumulative Trades blocks and CVD histogram.',
        'Tool 04 live: Focused Ask/Bid Volume Difference pressure.',
        'Tool 05 live: Five volume-filtered Multi-Market CVD lines.'
      ];
      if (usesBinanceKlines()) cryptoToasts = [
        'Taker volume delta and an OHLC direction estimate; both reset at 00:00 UTC.',
        'Full-bar price, taker CVD, volume and buy/sell difference.',
        'Estimated trade blocks, not individual trades; taker CVD below.',
        'Taker buy minus sell volume from Binance full bars.',
        'Five modelled CVD components; these are not observed trade-size buckets.'
      ];
      showToast((usesPricePressure() ? pressureToasts : cryptoToasts)[state.activeView - 1]);
      return;
    }
    var coming = target.closest('[data-gp-m1cd-coming]');
    if (coming) {
      event.preventDefault();
      event.stopPropagation();
      showToast('Tool ' + coming.getAttribute('data-gp-m1cd-coming') + ' is reserved for the next reference image.');
    }
  }

  function bindGlobalEvents() {
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open) {
        event.preventDefault();
        closeModule();
      }
    });
    window.addEventListener('resize', function () {
      if (!state.open) return;
      clearHover(false);
      resizeCanvas();
      scheduleRender();
    }, { passive: true });
    ['guardeer:market-quick-switch', 'guardeer:prime-runtime-ready'].forEach(function (name) {
      window.addEventListener(name, function () {
        if (!state.open) return;
        if (state.reloadTimer) window.clearTimeout(state.reloadTimer);
        state.reloadTimer = window.setTimeout(function () {
          state.reloadTimer = 0;
          state.timeframeLocked = false;
          reloadData('runtime-event');
        }, 240);
      }, { passive: true });
    });
    ['guardeer:forexgold-live-tick', 'guardeer:market-data-state'].forEach(function (name) {
      window.addEventListener(name, function (event) {
        if (!state.open || isCryptoMarket(state.symbol, state.exchange)) return;
        var detail = event && event.detail || {};
        if (detail.symbol && cleanSymbol(detail.symbol) !== cleanSymbol(state.symbol)) return;
        if (detail.exchange && cleanExchange(detail.exchange) !== cleanExchange(state.exchange)) return;
        if (detail.timeframe && normalizeTimeframe(detail.timeframe) !== normalizeTimeframe(state.timeframe)) return;
        var price = number(detail.price);
        if (!price) return;
        var fresh = detail.fresh === true || String(detail.state || '').toLowerCase() === 'live';
        appendQuote({
          price: price,
          source: detail.source || name,
          fresh: fresh,
          providerTimestampVerified: detail.providerTimestampVerified === true,
          responseTimeFallback: detail.responseTimeFallback === true,
          time: detail.time
        });
      }, { passive: true });
    });
    window.addEventListener('hashchange', function () {
      if (window.location.hash !== '#module1-cumulative-delta') return;
      if (STANDALONE) openModule();
      else openModuleWindow();
    });
    window.addEventListener('guardeer:open-module1-cumulative-delta', STANDALONE ? openModule : openModuleWindow);
    window.addEventListener('guardeer:close-module1-cumulative-delta', closeModule);
  }

  function start() {
    if (STANDALONE) {
      try {
        var initialParams = new URLSearchParams(window.location.search);
        state.activeView = clamp(Math.round(number(initialParams.get('tool'), state.activeView)), 1, 5);
      } catch (_) {}
    }
    bindGlobalEvents();
    if (!STANDALONE) {
      var launcherSyncTimer = 0;
      var rootObserver = null;
      var scopeObserver = null;
      var observedScope = null;
      var launcherSelector = '#gp-step44-prime-tools-popover, .gp-step44-prime-tools-popover__grid, [data-gp-module1-open]';

      function nodeContainsLauncher(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.matches && node.matches(launcherSelector)) return true;
        return Boolean(node.querySelector && node.querySelector(launcherSelector));
      }

      function mutationTouchesLauncher(mutation) {
        return Array.prototype.some.call(mutation.addedNodes || [], nodeContainsLauncher)
          || Array.prototype.some.call(mutation.removedNodes || [], nodeContainsLauncher);
      }

      function observeLauncherScope(button) {
        var scope = button && (button.closest('#gp-step44-prime-tools-popover') || button.parentElement);
        if (!scope || scope === observedScope) return;
        if (scopeObserver) scopeObserver.disconnect();
        observedScope = scope;
        scopeObserver = new MutationObserver(function () {
          scheduleLauncherCheck(32);
        });
        scopeObserver.observe(scope, { childList: true, subtree: true });
      }

      function runLauncherCheck() {
        launcherSyncTimer = 0;
        var button = ensureLauncher();
        if (!button) return;
        if (rootObserver) {
          rootObserver.disconnect();
          rootObserver = null;
        }
        observeLauncherScope(button);
      }

      function scheduleLauncherCheck(delay) {
        if (launcherSyncTimer) return;
        launcherSyncTimer = window.setTimeout(runLauncherCheck, delay || 16);
      }

      queueLauncherMaintenance = function () { scheduleLauncherCheck(16); };
      var initialLauncher = ensureLauncher();
      if (initialLauncher) {
        observeLauncherScope(initialLauncher);
      } else {
        rootObserver = new MutationObserver(function (mutations) {
          if (mutations.some(mutationTouchesLauncher)) scheduleLauncherCheck(16);
        });
        rootObserver.observe(document.body, { childList: true, subtree: true });
      }
      [120, 500, 1200, 2400, 4800].forEach(function (delay) {
        window.setTimeout(queueLauncherMaintenance, delay);
      });
    }
    if (window.location.hash === '#module1-cumulative-delta') {
      if (STANDALONE) window.requestAnimationFrame(openModule);
      else window.setTimeout(openModuleWindow, 700);
    }
  }

  window.GPModule1CumulativeDelta = {
    version: VERSION,
    open: STANDALONE ? openModule : openModuleWindow,
    openInline: openModule,
    openWindow: openModuleWindow,
    close: closeModule,
    reload: reloadData,
    resetBaseline: resetBaseline,
    resetViewport: resetViewport,
    confirmsHistoryPrice: function (price) {
      var value = number(price);
      var latest = state.priceCandles[state.priceCandles.length - 1];
      var reference = number(latest && latest.close);
      return Boolean(cleanSymbol(state.symbol) === 'XAUUSD' && value > 0 && reference > 0 &&
        Math.abs(value - reference) / reference <= 0.0045);
    },
    recoverHistory: recoverHistoryIntegrity,
    refreshCanonical: function () {
      // r394 diagnostics/QA hook: run one periodic canonical refresh now.
      return refreshCanonicalHistorySnapshot(state.feedToken);
    },
    render: render,
    state: state,
    getSnapshot: function () {
      return {
        version: VERSION,
        open: state.open,
        standalone: STANDALONE,
        symbol: state.symbol,
        exchange: state.exchange,
        timeframe: state.timeframe,
        activeView: state.activeView,
        source: state.source,
        status: state.status,
        candles: state.candles.length,
        priceCandles: state.priceCandles.length,
        multiCandles: state.multiCandles.map(function (series) { return series.length; }),
        multiCvd: state.multiCvd.slice(),
        cumulativeDelta: state.cumDelta,
        cumulativeTickDelta: state.cumTick,
        buyVolume: state.buyVolume,
        sellVolume: state.sellVolume,
        prints: state.prints
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
