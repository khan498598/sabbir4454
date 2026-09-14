(function () {
  'use strict';

  if (window.__GP_FOREXGOLD_FEED_INTEGRITY_R313__) return;
  window.__GP_FOREXGOLD_FEED_INTEGRITY_R313__ = true;
  window.__GP_FOREXGOLD_FEED_INTEGRITY_R312__ = true;
  window.__GP_FOREXGOLD_FEED_INTEGRITY_R311__ = true;

  var VERSION = 'r400-forexgold-live-continuity-v1';
  var QUOTE_TTL_MS = 30000;
  var QUOTE_TIMEOUT_MS = 15000;
  var NO_QUOTE_COMMIT_MS = 16000;
  var REFRESH_COOLDOWN_MS = 30000;
  var LOAD_GRACE_MS = 45000;
  var MAX_RECOVERY_BACKOFF_MS = 120000;
  var state = {
    runtime: null,
    wrapper: null,
    context: '',
    generation: 0,
    setSequence: 0,
    quoteSequence: 0,
    quote: null,
    quotePromise: null,
    quoteFlightContext: '',
    quoteFlightProvider: '',
    quoteController: null,
    quoteTimer: 0,
    resumeTimer: 0,
    lastResumeAt: 0,
    preferredQuoteProvider: '',
    pendingSet: null,
    pendingTimer: 0,
    refreshTimer: 0,
    refreshBusy: false,
    lastRefreshAt: 0,
    contextStartedAt: 0,
    refreshFailures: 0,
    nextRefreshAt: 0,
    lastRecoveryReason: '',
    lastGood: Object.create(null),
    degradedCommitAllowedUntil: 0,
    lastRejectedReason: '',
    lastRejectedAt: 0,
    ignoredSupersededHistoryCount: 0
  };

  function clean(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function normalizeRuntime(value) {
    var root = value || window.GuardeerPrimeRuntime || state.runtime;
    return root && (root.runtime || root) || null;
  }

  function symbol(rt) {
    return clean(rt && rt.state && rt.state.symbol ||
      (document.getElementById('symbol-label') || {}).textContent || '');
  }

  function exchange(rt) {
    return String(rt && rt.state && rt.state.exchange || '').toLowerCase();
  }

  function timeframe(rt) {
    return String(rt && rt.state && rt.state.timeframe || '1h');
  }

  function contextKey(rt) {
    return [symbol(rt), exchange(rt), timeframe(rt)].join('|');
  }

  function isForexGold(rt) {
    return Boolean(rt && exchange(rt) === 'forexgold' && symbol(rt));
  }

  function sessionIsOpen(rt, value) {
    if (!isForexGold(rt)) return true;
    try {
      var api = window.GPMarketSessionV146 || window.GPMarketSessionV119;
      return !api || typeof api.isOpen !== 'function' || api.isOpen(value || new Date(), rt) !== false;
    } catch (_) {
      return true;
    }
  }

  function timeframeMs(value) {
    var tf = String(value || '1h');
    if (tf === '1M') return 30 * 86400000;
    var amount = Math.max(1, parseInt(tf, 10) || 1);
    var unit = tf.slice(-1).toLowerCase();
    if (unit === 'm') return amount * 60000;
    if (unit === 'h') return amount * 3600000;
    if (unit === 'd') return amount * 86400000;
    if (unit === 'w') return amount * 7 * 86400000;
    return 3600000;
  }

  function minimumHistoryRows(value) {
    var interval = timeframeMs(value);
    if (interval >= 4 * 3600000) return 4;
    if (interval >= 3600000) return 6;
    if (interval >= 30 * 60000) return 10;
    return 18;
  }

  function rowTimeMs(row) {
    var value = Number(row && row.time);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < 100000000000 ? value * 1000 : value;
  }

  function closedHistoryRowCount(list, value, now) {
    if (!Array.isArray(list) || !list.length) return 0;
    var interval = timeframeMs(value);
    var currentBucket = Math.floor(Number(now || Date.now()) / interval) * interval;
    var buckets = new Set();
    list.forEach(function (row) {
      var time = rowTimeMs(row);
      if (!time) return;
      var bucket = Math.floor(time / interval) * interval;
      if (bucket < currentBucket) buckets.add(String(bucket));
    });
    return buckets.size;
  }

  function allowedAgeMs(tf, now) {
    var interval = timeframeMs(tf);
    if (interval >= 7 * 86400000) return 15 * 86400000;
    if (interval >= 86400000) return 5 * 86400000;
    var date = new Date(now || Date.now());
    var day = date.getUTCDay();
    var mondayOpenGrace = day === 1 && date.getUTCHours() < 6;
    if (day === 0 || day === 6 || mondayOpenGrace) return 96 * 3600000;
    return Math.max(interval * 6, 3 * 3600000);
  }

  function deviationLimit(targetSymbol) {
    return clean(targetSymbol) === 'XAUUSD' ? 0.005 : 0.004;
  }

  function liveDeviationLimit(targetSymbol) {
    return clean(targetSymbol) === 'XAUUSD' ? 0.0045 : 0.002;
  }

  function liveQuoteMatchLimit(targetSymbol) {
    return clean(targetSymbol) === 'XAUUSD' ? 0.002 : 0.0005;
  }

  function secureQuoteMatches(price, targetSymbol, now) {
    var value = Number(price);
    var quotePrice = Number(state.quote && state.quote.price);
    if (!Number.isFinite(value) || value <= 0 || !quoteFresh(state.quote, now) || !Number.isFinite(quotePrice) || quotePrice <= 0) return false;
    return Math.abs(value - quotePrice) / quotePrice <= liveQuoteMatchLimit(targetSymbol);
  }

  function referencePrice(list) {
    var rows = Array.isArray(list) ? list : [];
    for (var index = rows.length - 1; index >= 0; index -= 1) {
      var close = Number(rows[index] && rows[index].close);
      if (Number.isFinite(close) && close > 0) return close;
    }
    return 0;
  }

  function medianIntervalMs(list) {
    var gaps = [];
    var sample = (Array.isArray(list) ? list : []).slice(-40);
    for (var index = 1; index < sample.length; index += 1) {
      var gap = rowTimeMs(sample[index]) - rowTimeMs(sample[index - 1]);
      if (gap > 0) gaps.push(gap);
    }
    gaps.sort(function (a, b) { return a - b; });
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  }

  function medianPositive(values) {
    var sorted = (Array.isArray(values) ? values : []).filter(function (value) {
      return Number.isFinite(Number(value)) && Number(value) > 0;
    }).map(Number).sort(function (a, b) { return a - b; });
    if (!sorted.length) return 0;
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function xauExcursionFloor(value) {
    var interval = timeframeMs(value);
    if (interval <= 60000) return 0.012;
    if (interval <= 5 * 60000) return 0.016;
    if (interval <= 15 * 60000) return 0.022;
    if (interval <= 3600000) return 0.04;
    if (interval <= 4 * 3600000) return 0.065;
    return 0.12;
  }

  function xauRangeThreshold(list, value) {
    var ratios = (Array.isArray(list) ? list : []).slice(-80).map(function (row) {
      var open = Number(row && row.open);
      var high = Number(row && row.high);
      var low = Number(row && row.low);
      var close = Number(row && row.close);
      var reference = Math.max(1, Math.abs(open), Math.abs(close));
      return [open, high, low, close].every(Number.isFinite) && high >= low
        ? Math.max(0, high - low) / reference
        : 0;
    });
    return Math.max(xauExcursionFloor(value), medianPositive(ratios) * 12);
  }

  function isolatedXauExcursion(list, rt) {
    if (clean(symbol(rt)) !== 'XAUUSD' || !Array.isArray(list) || list.length < 3) return null;
    var threshold = xauRangeThreshold(list, timeframe(rt));
    for (var index = 0; index < list.length; index += 1) {
      var row = list[index] || {};
      var open = Number(row.open);
      var high = Number(row.high);
      var low = Number(row.low);
      var close = Number(row.close);
      if (![open, high, low, close].every(Number.isFinite)) continue;
      var reference = Math.max(1, Math.abs(open), Math.abs(close));
      var bodyHigh = Math.max(open, close);
      var bodyLow = Math.min(open, close);
      var wickRatio = Math.max(Math.max(0, high - bodyHigh), Math.max(0, bodyLow - low)) / reference;
      var bodyRatio = Math.abs(close - open) / reference;
      if (wickRatio > threshold && wickRatio > Math.max(bodyRatio * 3, threshold * 1.02)) {
        return { index: index, kind: 'isolated-wick', threshold: threshold, observed: wickRatio };
      }
      if (index > 0 && index < list.length - 1) {
        var previousClose = Number(list[index - 1] && list[index - 1].close);
        var nextOpen = Number(list[index + 1] && list[index + 1].open);
        var bridge = (previousClose + nextOpen) / 2;
        var midpoint = (open + close) / 2;
        var neighborGap = bridge > 0 ? Math.abs(previousClose - nextOpen) / bridge : 0;
        var displacement = bridge > 0 ? Math.abs(midpoint - bridge) / bridge : 0;
        if (bridge > 0 && neighborGap < threshold * 0.35 && displacement > threshold) {
          return { index: index, kind: 'isolated-level', threshold: threshold, observed: displacement };
        }
      }
    }
    return null;
  }

  function implausibleLiveXauCandle(candle, good, rt) {
    if (clean(symbol(rt)) !== 'XAUUSD' || !candle || !good) return null;
    var open = Number(candle.open);
    var high = Number(candle.high);
    var low = Number(candle.low);
    var close = Number(candle.close);
    if (![open, high, low, close].every(Number.isFinite)) return { kind: 'invalid-live-ohlc' };
    var reference = Math.max(1, Math.abs(open), Math.abs(close), Number(good.reference || 0));
    var bodyHigh = Math.max(open, close);
    var bodyLow = Math.min(open, close);
    var wickRatio = Math.max(Math.max(0, high - bodyHigh), Math.max(0, bodyLow - low)) / reference;
    var bodyRatio = Math.abs(close - open) / reference;
    var threshold = xauRangeThreshold(good.rows || [], timeframe(rt));
    return wickRatio > threshold && wickRatio > Math.max(bodyRatio * 3, threshold * 1.02)
      ? { kind: 'isolated-live-wick', threshold: threshold, observed: wickRatio }
      : null;
  }

  function hasSyntheticRows(list) {
    return (Array.isArray(list) ? list : []).some(function (row) {
      return Boolean(row && (row.synthetic === true ||
        /synthetic|safety-fallback|mock|demo/i.test(String(row.provider || row.source || ''))));
    });
  }

  function hasBlockedProviderRows(list, targetSymbol) {
    if (clean(targetSymbol) !== 'XAUUSD') return false;
    return (Array.isArray(list) ? list : []).some(function (row) {
      return /yahoo|gc=f|gold-stock|futures-fallback/i.test(String(row && (row.provider || row.source) || ''));
    });
  }

  function quoteFresh(quote, now) {
    return Boolean(quote && Number(quote.price) > 0 && (now || Date.now()) - Number(quote.time || 0) <= QUOTE_TTL_MS);
  }

  function validateRows(list, rt, quote, allowMissingQuote) {
    var requiredRows = minimumHistoryRows(timeframe(rt));
    var rowCount = Array.isArray(list) ? list.length : 0;
    var closedRowCount = closedHistoryRowCount(list, timeframe(rt), Date.now());
    if (!Array.isArray(list) || rowCount < requiredRows || closedRowCount < requiredRows) {
      return { ok: false, reason: 'history-too-short', rowCount: rowCount, closedRowCount: closedRowCount, requiredRows: requiredRows };
    }
    if (hasSyntheticRows(list)) return { ok: false, reason: 'synthetic-history' };
    if (hasBlockedProviderRows(list, symbol(rt))) return { ok: false, reason: 'xau-futures-history' };

    var previousTime = 0;
    for (var index = 0; index < list.length; index += 1) {
      var row = list[index] || {};
      var time = rowTimeMs(row);
      var open = Number(row.open);
      var high = Number(row.high);
      var low = Number(row.low);
      var close = Number(row.close);
      if (!time || time <= previousTime || ![open, high, low, close].every(function (value) {
        return Number.isFinite(value) && value > 0;
      }) || high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
        return { ok: false, reason: 'invalid-ohlc' };
      }
      previousTime = time;
    }

    var now = Date.now();
    if (now - previousTime > allowedAgeMs(timeframe(rt), now)) {
      return { ok: false, reason: 'stale-history', lastTime: previousTime };
    }

    var excursion = isolatedXauExcursion(list, rt);
    if (excursion) {
      return Object.assign({ ok: false, reason: 'isolated-xau-price-excursion' }, excursion);
    }

    var expectedInterval = timeframeMs(timeframe(rt));
    var observedInterval = medianIntervalMs(list);
    if (expectedInterval < 86400000 && observedInterval &&
        (observedInterval < expectedInterval * 0.5 || observedInterval > expectedInterval * 1.6)) {
      return { ok: false, reason: 'timeframe-mismatch', expectedInterval: expectedInterval, observedInterval: observedInterval };
    }

    var reference = referencePrice(list);
    if (quoteFresh(quote, now)) {
      var deviation = reference > 0 ? Math.abs(reference - Number(quote.price)) / reference : Infinity;
      if (deviation > deviationLimit(symbol(rt))) {
        return { ok: false, reason: 'history-quote-mismatch', reference: reference, quote: quote.price, deviation: deviation };
      }
    } else if (!allowMissingQuote) {
      return { ok: false, reason: 'quote-pending', reference: reference };
    }

    return { ok: true, reason: 'verified', reference: reference, lastTime: previousTime, rowCount: rowCount, closedRowCount: closedRowCount, requiredRows: requiredRows };
  }

  function ensureStyle() {
    if (document.getElementById('gp-r311-forexgold-feed-style')) return;
    var style = document.createElement('style');
    style.id = 'gp-r311-forexgold-feed-style';
    style.textContent = [
      'body.gp-forexgold-feed-pending #chart-area{position:relative!important}',
      'body.gp-forexgold-feed-pending #chart-area:after{content:"Verifying live market history...";position:absolute;inset:0;z-index:89;display:grid;place-items:center;background:rgba(2,8,20,.78);color:#d9f7ff;font:800 13px/1.4 Inter,Arial,sans-serif;letter-spacing:.03em;pointer-events:none}',
      'body.gp-forexgold-feed-pending.gp-forexgold-feed-has-good #chart-area:after{display:none}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function publish(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent('guardeer:forexgold-feed-integrity', {
        detail: Object.assign({ version: VERSION, state: kind, context: state.context, time: Date.now() }, detail || {})
      }));
    } catch (_) {}
  }

  function mirrorVerifiedQuote(rt, observation) {
    var key = symbol(rt);
    var context = contextKey(rt);
    var observedAt = Number(observation && observation.time || 0);
    var price = Number(observation && observation.price || 0);
    if (!key || !(observedAt > 0) || !(price > 0)) return false;
    if (observation.timeProof === 'receipt-fallback' &&
        (!state.lastGood[context] || String(window.__gpMainCommittedForexContext || '') !== [exchange(rt), key, timeframe(rt)].join(':'))) {
      return false;
    }
    try {
      var store = window.__gpForexQuoteState || (window.__gpForexQuoteState = {});
      var previous = store[key] || null;
      var previousAt = Number(previous && (previous.time || previous.updatedAt || previous.timestamp || previous.eventTime) || 0);
      if (previousAt > observedAt && previous && previous.fresh === true) return false;
      store[key] = {
        fresh: true,
        price: price,
        source: observation.source || observation.provider || 'feed-integrity',
        provider: observation.provider || '',
        time: observedAt,
        updatedAt: Number(observation.receivedAt || Date.now()),
        providerTimestampVerified: observation.timeProof === 'provider-timestamp',
        responseTimeFallback: observation.timeProof === 'receipt-fallback',
        symbol: key,
        context: context,
        sequence: Number(observation.sequence || 0),
        integrityVersion: VERSION
      };
      return true;
    } catch (_) {
      return false;
    }
  }

  function markRejected(reason, detail) {
    state.lastRejectedReason = String(reason || 'rejected');
    state.lastRejectedAt = Date.now();
    document.body.classList.add('gp-forexgold-feed-pending');
    document.body.classList.toggle('gp-forexgold-feed-has-good', Boolean(state.lastGood[state.context]));
    // Validation details may themselves contain `reason: "verified"`.  The
    // canonical rejection reason must always win so a rejected event can never
    // be surfaced as the contradictory "blocked [verified]: verified" toast.
    publish('rejected', Object.assign({}, detail || {}, { reason: state.lastRejectedReason }));
  }

  function markVerified(validation) {
    state.lastRejectedReason = '';
    document.body.classList.remove('gp-forexgold-feed-pending', 'gp-forexgold-feed-has-good');
    publish('verified', validation || {});
  }

  function config() {
    return window.GUARDEER_CONFIG || {};
  }

  function quoteUrl(targetSymbol) {
    var marker = String(config().PRIME_MARKET_DATA_SECURE_MARKER || config().FMP_API_KEY || 'GUARDEER_SECURE_PROXY');
    return 'https://financialmodelingprep.com/stable/quote-short?symbol=' +
      encodeURIComponent(clean(targetSymbol)) + '&apikey=' + encodeURIComponent(marker);
  }

  function massiveQuoteUrl(targetSymbol) {
    var cleaned = clean(targetSymbol);
    if (cleaned.length !== 6) return '';
    return 'https://api.massive.com/v1/last_quote/currencies/' +
      encodeURIComponent(cleaned.slice(0, 3)) + '/' + encodeURIComponent(cleaned.slice(3, 6)) +
      '?apiKey=GUARDEER_SECURE_PROXY&_=' + Date.now();
  }

  function preferredProvider(list) {
    var rows = Array.isArray(list) ? list : [];
    for (var index = rows.length - 1; index >= 0; index -= 1) {
      var source = String(rows[index] && (rows[index].provider || rows[index].source) || '').toLowerCase();
      if (source.indexOf('massive') >= 0 || source.indexOf('polygon') >= 0) return 'massive';
      if (source.indexOf('fmp') >= 0) return 'fmp';
    }
    return '';
  }

  function providerTime(row) {
    var names = ['timestamp', 't', 'time', 'last_updated', 'lastUpdated',
      'updated_at', 'updatedAt', 'sip_timestamp', 'participant_timestamp'];
    var present = false;
    for (var index = 0; row && index < names.length; index += 1) {
      var raw = row[names[index]];
      if (raw == null || String(raw).trim() === '') continue;
      present = true;
      var value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        var text = String(raw || '').trim();
        // Quote instants must be unambiguous across every user's browser.
        // A naive wall-clock string is explicit-but-invalid, not a receipt-time fallback.
        if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) continue;
        value = Date.parse(text);
        if (!Number.isFinite(value) || value <= 0) continue;
      } else if (value >= 1e18) value = Math.floor(value / 1e6);
      else if (value >= 1e15) value = Math.floor(value / 1e3);
      else if (value < 1e12) value *= 1000;
      return { present: true, value: value };
    }
    return { present: present, value: 0 };
  }

  function responseSymbol(row) {
    var raw = row && (row.symbol != null ? row.symbol : row.ticker != null ? row.ticker : row.pair);
    return raw == null || String(raw).trim() === '' ? '' : clean(raw);
  }

  function responseSymbolMatches(row, targetSymbol, provider) {
    var observed = responseSymbol(row);
    var requested = clean(targetSymbol);
    if (!observed) return true;
    if (observed === requested) return true;
    return provider === 'massive' && observed === 'C' + requested;
  }

  function verifiedObservationTime(row, receivedAt) {
    var observed = providerTime(row);
    if (!observed.present) return { time: receivedAt, providerTime: 0, receivedAt: receivedAt, timeProof: 'receipt-fallback' };
    if (!observed.value) {
      var invalidError = new Error('Quote timestamp was malformed');
      invalidError.code = 'QUOTE_TIMESTAMP_INVALID';
      throw invalidError;
    }
    var age = receivedAt - observed.value;
    if (age > 120000 || age < -60000) {
      var staleError = new Error('Quote timestamp was stale or in the future');
      staleError.code = 'QUOTE_TIMESTAMP_INVALID';
      staleError.providerTime = observed.value;
      staleError.receivedAt = receivedAt;
      throw staleError;
    }
    return { time: observed.value, providerTime: observed.value, receivedAt: receivedAt, timeProof: 'provider-timestamp' };
  }

  function quoteObservation(provider, payload, targetSymbol) {
    var row = Array.isArray(payload) ? payload[0] : payload;
    if (provider === 'massive') {
      row = payload && (payload.last || payload.results) || row;
      if (Array.isArray(row)) row = row[0];
      if (!responseSymbolMatches(row, targetSymbol, provider)) throw new Error('Fallback quote symbol did not match the requested market');
      var bid = Number(row && (row.bid != null ? row.bid : row.b != null ? row.b : row.bid_price != null ? row.bid_price : row.bp));
      var ask = Number(row && (row.ask != null ? row.ask : row.a != null ? row.a : row.ask_price != null ? row.ask_price : row.ap));
      var midpoint = Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0 ? (bid + ask) / 2 : 0;
      var massivePrice = midpoint || Number(row && (row.price != null ? row.price : row.p));
      if (!Number.isFinite(massivePrice) || massivePrice <= 0) throw new Error('Fallback quote was empty');
      return Object.assign({ price: massivePrice, provider: 'massive', source: 'massive-secure-proxy' }, verifiedObservationTime(row, Date.now()));
    }
    if (!responseSymbolMatches(row, targetSymbol, provider)) throw new Error('Quote symbol did not match the requested market');
    var price = Number(row && (row.price != null ? row.price : row.close));
    if (!Number.isFinite(price) || price <= 0) throw new Error('Quote was empty');
    return Object.assign({ price: price, provider: 'fmp', source: 'fmp-secure-proxy' }, verifiedObservationTime(row, Date.now()));
  }

  function fetchQuoteProvider(provider, targetSymbol) {
    var url = provider === 'massive' ? massiveQuoteUrl(targetSymbol) : quoteUrl(targetSymbol);
    if (!url) return Promise.reject(new Error(provider + ' quote symbol was unavailable'));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    state.quoteController = controller;
    var timeout = 0;
    var deadline = new Promise(function (_, reject) {
      timeout = window.setTimeout(function () {
        if (controller) controller.abort();
        var error = new Error('Quote verification timed out.');
        error.name = 'TimeoutError';
        reject(error);
      }, 6500);
    });
    var request = Promise.resolve().then(function () { return fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }); }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error((payload && (payload.error || payload.message)) || (provider + ' quote failed (' + response.status + ')'));
        return quoteObservation(provider, payload, targetSymbol);
      });
    });
    // The proxy shares/clones response streams. Aborting one caller's signal
    // after headers is not sufficient to stop an indefinitely stalled body.
    return Promise.race([request, deadline]).finally(function () {
      if (timeout) window.clearTimeout(timeout);
      if (state.quoteController === controller) state.quoteController = null;
    });
  }

  function clearPending() {
    state.pendingSet = null;
    if (state.pendingTimer) window.clearTimeout(state.pendingTimer);
    state.pendingTimer = 0;
  }

  function committedHistoryTime(entry) {
    return Number(entry && (entry.historyLastTime || entry.lastTime) || 0);
  }

  function mainContextKey(rt) {
    return [exchange(rt), symbol(rt), timeframe(rt)].join(':');
  }

  function latestRuntimeRows(rt) {
    try {
      var rows = rt && typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function preserveVerifiedChartForSupersededHistory(list, rt, ctx, previous, incomingLastTime) {
    if (!previous || !Array.isArray(list)) return false;
    if (String(window.__gpMainCommittedForexContext || '') !== mainContextKey(rt)) return false;

    var currentRows = latestRuntimeRows(rt);
    if (closedHistoryRowCount(currentRows, timeframe(rt), Date.now()) < minimumHistoryRows(timeframe(rt)) || hasSyntheticRows(currentRows)) return false;
    var retainedRows = currentRows.map(function (row) { return Object.assign({}, row); });

    // The core assigns its in-memory candle array from the same `list` after
    // chart.setData() returns.  Replace that array with the already verified
    // rows and return success without touching the chart.  This keeps both the
    // chart and core state on the newer data while silently discarding the late
    // provider response.
    list.splice(0, list.length);
    retainedRows.forEach(function (row) { list.push(row); });
    state.ignoredSupersededHistoryCount += 1;
    markVerified({
      reason: 'superseded-history-retained',
      ignoredReason: 'out-of-order-history',
      incomingLastTime: Number(incomingLastTime || 0),
      committedHistoryLastTime: committedHistoryTime(previous),
      retainedLastTime: rowTimeMs(retainedRows[retainedRows.length - 1])
    });
    publish('ignored', {
      reason: 'superseded-history',
      ignoredReason: 'out-of-order-history',
      incomingLastTime: Number(incomingLastTime || 0),
      committedHistoryLastTime: committedHistoryTime(previous),
      retainedLastTime: rowTimeMs(retainedRows[retainedRows.length - 1])
    });
    return true;
  }

  function commitPending(allowMissingQuote) {
    var pending = state.pendingSet;
    var rt = normalizeRuntime();
    if (!pending || !rt || pending.context !== contextKey(rt) || pending.generation !== state.generation) return false;
    var validation = validateRows(pending.rows, rt, state.quote, Boolean(allowMissingQuote));
    if (!validation.ok) {
      if (validation.reason !== 'quote-pending') {
        clearPending();
        markRejected(validation.reason, validation);
        scheduleRefresh(validation.reason);
      }
      return false;
    }

    var previous = state.lastGood[pending.context];
    if (previous && Number(validation.lastTime) < committedHistoryTime(previous)) {
      if (preserveVerifiedChartForSupersededHistory(pending.rows, rt, pending.context, previous, validation.lastTime)) {
        clearPending();
        return true;
      }
      clearPending();
      markRejected('out-of-order-history', validation);
      return false;
    }

    clearPending();
    var result = pending.original.apply(pending.thisArg, pending.args);
    if (result === false) {
      markRejected('chart-history-commit-rejected', validation);
      return false;
    }
    var committedClose = Number(pending.rows[pending.rows.length - 1] && pending.rows[pending.rows.length - 1].close || validation.reference);
    state.lastGood[pending.context] = {
      rows: pending.rows.slice(),
      rowCount: pending.rows.length,
      closedRowCount: validation.closedRowCount,
      requiredRows: minimumHistoryRows(timeframe(rt)),
      reference: committedClose,
      historyClose: committedClose,
      validationReference: validation.reference,
      historyLastTime: validation.lastTime,
      lastTime: validation.lastTime,
      committedAt: Date.now(),
      sequence: pending.sequence
    };
    markVerified(validation);
    return result;
  }

  function scheduleQuote(delay) {
    if (state.quoteTimer) window.clearTimeout(state.quoteTimer);
    state.quoteTimer = 0;
    if (!sessionIsOpen(normalizeRuntime(), new Date())) return false;
    state.quoteTimer = window.setTimeout(function () {
      state.quoteTimer = 0;
      requestQuote('scheduled');
    }, Math.max(0, Number(delay) || 0));
    return true;
  }

  function requestQuote(reason) {
    var rt = normalizeRuntime();
    if (!isForexGold(rt)) return Promise.resolve(null);
    if (!sessionIsOpen(rt, new Date())) {
      publish('session-closed', { reason: reason || 'quote-suppressed' });
      return Promise.resolve(null);
    }
    var requestedContext = contextKey(rt);
    var requestedGeneration = state.generation;
    var first = state.preferredQuoteProvider === 'massive' ? 'massive' : 'fmp';
    var second = first === 'massive' ? 'fmp' : 'massive';
    if (state.quotePromise && state.quoteFlightContext === requestedContext && state.quoteFlightProvider === first) return state.quotePromise;
    if (state.quotePromise && state.quoteController) {
      try { state.quoteController.abort(); } catch (_) {}
    }
    var sequence = ++state.quoteSequence;
    var flight = fetchQuoteProvider(first, symbol(rt)).catch(function (firstError) {
      if (!sessionIsOpen(normalizeRuntime(), new Date())) throw firstError;
      if (requestedContext !== contextKey(normalizeRuntime()) || requestedGeneration !== state.generation || sequence !== state.quoteSequence) throw firstError;
      return fetchQuoteProvider(second, symbol(rt)).catch(function (secondError) {
        var error = new Error('Both quote providers failed: ' + String(firstError && firstError.message || firstError) + '; ' + String(secondError && secondError.message || secondError));
        error.providers = [first, second];
        throw error;
      });
    }).then(function (observation) {
      var current = normalizeRuntime();
      if (!current || requestedContext !== contextKey(current) || requestedGeneration !== state.generation || sequence !== state.quoteSequence) {
        return null;
      }
      state.quote = {
        price: observation.price,
        time: observation.time,
        providerTime: observation.providerTime,
        receivedAt: observation.receivedAt,
        timeProof: observation.timeProof,
        provider: observation.provider,
        source: observation.source,
        symbol: symbol(current),
        context: requestedContext,
        sequence: sequence
      };
      mirrorVerifiedQuote(current, state.quote);
      state.degradedCommitAllowedUntil = 0;
      publish('quote', { price: observation.price, provider: observation.provider, source: observation.source, reason: reason || 'poll' });
      commitPending(false);
      return state.quote;
    }).catch(function (error) {
      if (requestedContext !== contextKey(normalizeRuntime()) || requestedGeneration !== state.generation || sequence !== state.quoteSequence) return null;
      if (sessionIsOpen(normalizeRuntime(), new Date())) {
        publish('quote-unavailable', { reason: reason || 'poll', error: String(error && error.message || error || '') });
      }
      return null;
    }).finally(function () {
      if (state.quotePromise !== flight) return;
      state.quotePromise = null;
      state.quoteFlightContext = '';
      state.quoteFlightProvider = '';
      state.quoteController = null;
      if (sessionIsOpen(normalizeRuntime(), new Date())) scheduleQuote(document.hidden ? 25000 : 10000);
    });
    state.quotePromise = flight;
    state.quoteFlightContext = requestedContext;
    state.quoteFlightProvider = first;
    return flight;
  }

  function verifyHistory(list, requestedSymbol) {
    var rt = normalizeRuntime();
    if (!isForexGold(rt) || !Array.isArray(list)) return Promise.resolve(false);
    if (clean(requestedSymbol) && clean(requestedSymbol) !== symbol(rt)) {
      markRejected('stale-context-history', { requestedSymbol: clean(requestedSymbol), currentSymbol: symbol(rt) });
      return Promise.resolve(false);
    }
    var requestedContext = contextKey(rt);
    var requestedGeneration = state.generation;
    state.preferredQuoteProvider = preferredProvider(list);
    var basic = validateRows(list, rt, null, true);
    if (!basic.ok) {
      markRejected(basic.reason, basic);
      scheduleRefresh(basic.reason);
      return Promise.resolve(false);
    }
    if (!sessionIsOpen(rt, new Date())) {
      state.degradedCommitAllowedUntil = Date.now() + NO_QUOTE_COMMIT_MS + 5000;
      publish('closed-history-approved', {
        reason: 'verified-provider-history-market-closed',
        reference: basic.reference,
        provider: state.preferredQuoteProvider || 'provider'
      });
      return Promise.resolve(true);
    }
    return requestQuote('main-history-verify').then(function () {
      var current = normalizeRuntime();
      if (!current || requestedContext !== contextKey(current) || requestedGeneration !== state.generation) return false;
      var verified = validateRows(list, current, state.quote, false);
      if (!verified.ok) {
        if (verified.reason === 'quote-pending') {
          state.degradedCommitAllowedUntil = Date.now() + 5000;
          publish('degraded-history-approved', { reason: 'quote-temporarily-unavailable', reference: basic.reference });
          return true;
        }
        markRejected(verified.reason, verified);
        scheduleRefresh(verified.reason);
        return false;
      }
      return true;
    });
  }

  function nativeLoadActive(rt) {
    if (window.__gpPendingForexTimeframeTxnR390) return true;
    var source = window.__gpMarketDataState || {};
    var same = (!source.symbol || clean(source.symbol) === symbol(rt)) &&
      (!source.exchange || String(source.exchange).toLowerCase() === exchange(rt));
    if (same && source.state === 'loading' && Date.now() - Number(source.time || 0) < LOAD_GRACE_MS) return true;
    try {
      var api = window.GPForexGoldRuntimeStabilityV1;
      var status = api && typeof api.status === 'function' ? api.status() : null;
      if (status && (status.refreshInFlight || status.switchBusy)) return true;
    } catch (_) {}
    return false;
  }

  function recoveryAllowed(rt) {
    return isForexGold(rt) && !document.hidden && navigator.onLine !== false &&
      sessionIsOpen(rt, new Date()) && !nativeLoadActive(rt);
  }

  function needsHistoryRecovery(rt) {
    var good = state.lastGood[contextKey(rt)];
    var committed = [exchange(rt), symbol(rt), timeframe(rt)].join(':');
    // The core stops its quote timer before each history load, and a rejected
    // load returns before restarting it. A verified old picture is not enough.
    if (!good || window.__gpMainCommittedForexContext !== committed) return 'history-unavailable';
    if (!window.forexGoldRefreshTimer) return 'live-poll-not-running';
    if (Date.now() - Number(good.lastTime || 0) > Math.max(timeframeMs(timeframe(rt)) * 2, 180000)) return 'live-history-gap';
    return '';
  }

  function checkHistoryRecovery(reason) {
    var rt = normalizeRuntime();
    if (!recoveryAllowed(rt) || state.refreshBusy || Date.now() - state.contextStartedAt < LOAD_GRACE_MS) return false;
    var needed = needsHistoryRecovery(rt);
    return needed ? scheduleRefresh(String(reason || 'watchdog') + ':' + needed) : false;
  }

  function resumeFeed(reason) {
    var rt = normalizeRuntime();
    if (!isForexGold(rt) || document.hidden || navigator.onLine === false || !sessionIsOpen(rt, new Date())) return false;
    state.lastResumeAt = Date.now();
    requestQuote(String(reason || 'resume'));
    checkHistoryRecovery(String(reason || 'resume'));
    return true;
  }

  function scheduleResume(reason, delay) {
    if (state.resumeTimer) return true;
    state.resumeTimer = window.setTimeout(function () {
      state.resumeTimer = 0;
      resumeFeed(reason);
    }, Math.max(0, Number(delay) || 0));
    return true;
  }

  function scheduleRefresh(reason) {
    var rt = normalizeRuntime();
    if (!rt || typeof rt.refreshMarketData !== 'function' || state.refreshBusy) return false;
    if (!isForexGold(rt) || !sessionIsOpen(rt, new Date()) || document.hidden || navigator.onLine === false) return false;
    if (state.refreshTimer) return true;
    var requestedContext = contextKey(rt);
    var requestedGeneration = state.generation;
    var delay = Math.max(800, state.lastRefreshAt + REFRESH_COOLDOWN_MS - Date.now(), state.nextRefreshAt - Date.now(), state.contextStartedAt + LOAD_GRACE_MS - Date.now());
    state.refreshTimer = window.setTimeout(function () {
      state.refreshTimer = 0;
      var current = normalizeRuntime();
      if (!current || !recoveryAllowed(current) || requestedContext !== contextKey(current) || requestedGeneration !== state.generation) return;
      state.refreshBusy = true;
      state.lastRefreshAt = Date.now();
      state.lastRecoveryReason = String(reason || 'feed-integrity');
      // Resolve synchronously thrown failures as well, so one throw cannot
      // leave refreshBusy stuck and disable recovery for the rest of the tab.
      Promise.resolve().then(function () {
        return current.refreshMarketData('r396-' + state.lastRecoveryReason);
      }).catch(function () {}).finally(function () {
        state.refreshBusy = false;
        if (requestedContext !== state.context || requestedGeneration !== state.generation) return;
        var stillNeeded = needsHistoryRecovery(current);
        state.refreshFailures = stillNeeded ? state.refreshFailures + 1 : 0;
        state.nextRefreshAt = stillNeeded ? Date.now() + Math.min(MAX_RECOVERY_BACKOFF_MS, REFRESH_COOLDOWN_MS * Math.pow(2, Math.min(2, state.refreshFailures - 1))) : 0;
        publish(stillNeeded ? 'recovery-waiting' : 'recovery-complete', { reason: stillNeeded || state.lastRecoveryReason, nextRefreshAt: state.nextRefreshAt });
      });
    }, delay);
    return true;
  }

  function patchRuntime(value) {
    var rt = normalizeRuntime(value);
    if (!rt || !rt.chart) return false;

    var nextContext = contextKey(rt);
    if (state.context !== nextContext) {
      state.context = nextContext;
      state.generation += 1;
      state.contextStartedAt = Date.now();
      state.refreshFailures = 0;
      state.nextRefreshAt = 0;
      if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
      state.refreshTimer = 0;
      // A cached entry belongs to the generation that committed it. Never let
      // a revisited symbol/timeframe approve whatever rows are still present
      // in the shared chart while the new asynchronous load is in flight.
      delete state.lastGood[nextContext];
      state.quote = null;
      state.preferredQuoteProvider = '';
      state.degradedCommitAllowedUntil = 0;
      state.lastRejectedReason = '';
      state.lastRejectedAt = 0;
      clearPending();
      if (state.quoteController) {
        try { state.quoteController.abort(); } catch (_) {}
      }
      if (isForexGold(rt)) {
        document.body.classList.add('gp-forexgold-feed-pending');
        document.body.classList.remove('gp-forexgold-feed-has-good');
      } else {
        document.body.classList.remove('gp-forexgold-feed-pending', 'gp-forexgold-feed-has-good');
      }
    }
    state.runtime = rt;
    state.wrapper = rt.chart;
    var wrapper = rt.chart;

    // The underlying adapter historically rounded every price >= 100 to two
    // decimals. Keep the chart/axis on the correct three-decimal JPY precision.
    try {
      if (/JPY$/.test(symbol(rt)) && wrapper.candleSeries && typeof wrapper.candleSeries.applyOptions === 'function') {
        wrapper.candleSeries.applyOptions({ priceFormat: { type: 'price', precision: 3, minMove: 0.001 } });
      }
    } catch (_) {}

    if (typeof wrapper.setData === 'function' && !wrapper.setData.__gpForexGoldIntegrityR311) {
      var originalSetData = wrapper.setData;
      var wrappedSetData = function (list, requestedSymbol) {
        var current = normalizeRuntime();
        if (!isForexGold(current) || !Array.isArray(list)) return originalSetData.apply(this, arguments);

        if (clean(requestedSymbol) && clean(requestedSymbol) !== symbol(current)) {
          markRejected('stale-context-history', { requestedSymbol: clean(requestedSymbol), currentSymbol: symbol(current) });
          return false;
        }

        var ctx = contextKey(current);
        var basic = validateRows(list, current, null, true);
        if (!basic.ok) {
          markRejected(basic.reason, basic);
          scheduleRefresh(basic.reason);
          requestQuote('rejected-history');
          return false;
        }

        var previous = state.lastGood[ctx];
        if (previous && Number(basic.lastTime) < committedHistoryTime(previous)) {
          if (preserveVerifiedChartForSupersededHistory(list, current, ctx, previous, basic.lastTime)) return true;
          markRejected('out-of-order-history', basic);
          return false;
        }

        state.setSequence += 1;
        clearPending();
        state.pendingSet = {
          original: originalSetData,
          thisArg: this,
          args: Array.prototype.slice.call(arguments),
          rows: list,
          context: ctx,
          generation: state.generation,
          sequence: state.setSequence
        };

        var verified = validateRows(list, current, state.quote, false);
        if (verified.ok) return commitPending(false);
        if (verified.reason !== 'quote-pending') {
          clearPending();
          markRejected(verified.reason, verified);
          scheduleRefresh(verified.reason);
          requestQuote('history-mismatch');
          return false;
        }

        // verifyHistory() already waited for the bounded quote request.  Permit
        // this one real-provider history commit immediately, then keep checking
        // the live quote in the background.
        if (Date.now() <= Number(state.degradedCommitAllowedUntil || 0)) {
          var degradedResult = commitPending(true);
          if (degradedResult !== false) publish('degraded', { reason: 'quote-temporarily-unavailable', reference: basic.reference });
          requestQuote('degraded-history-background-verify');
          return degradedResult;
        }

        markRejected('quote-pending', basic);
        requestQuote('history-commit');
        state.pendingTimer = window.setTimeout(function () {
          if (!state.pendingSet) return;
          // The provider history already passed strict OHLC, ordering, freshness,
          // timeframe and synthetic-source checks.  A temporarily unavailable
          // quote must not leave a valid chart black forever.  Render that real
          // history in degraded mode and keep quote verification running in the
          // background; an actually mismatched fresh quote is still rejected by
          // the normal verified path above.
          if (commitPending(true) === false) {
            markRejected('quote-verification-timeout', basic);
            scheduleRefresh('quote-verification-timeout');
          } else {
            publish('degraded', { reason: 'quote-verification-timeout', reference: basic.reference });
          }
          requestQuote('quote-verification-timeout');
        }, NO_QUOTE_COMMIT_MS);
        return false;
      };
      wrappedSetData.__gpForexGoldIntegrityR311 = true;
      wrappedSetData.__gpOriginal = originalSetData;
      wrapper.setData = wrappedSetData;
    }

    if (typeof wrapper.updateCandle === 'function' && !wrapper.updateCandle.__gpForexGoldIntegrityR311) {
      var originalUpdateCandle = wrapper.updateCandle;
      var wrappedUpdateCandle = function (candle) {
        var current = normalizeRuntime();
        if (!isForexGold(current)) return originalUpdateCandle.apply(this, arguments);
        if (!candle || candle.synthetic === true) return false;

        var ctx = contextKey(current);
        var good = state.lastGood[ctx];
        var close = Number(candle.close);
        if (!good || !Number.isFinite(close) || close <= 0) return false;
        var reference = Number(good.reference || 0);
        var jump = reference > 0 ? Math.abs(close - reference) / reference : 0;
        var resetJump = jump;
        var secureQuoteMatch = secureQuoteMatches(close, symbol(current));
        var badWick = implausibleLiveXauCandle(candle, good, current);
        if (badWick) {
          markRejected('isolated-xau-live-wick', Object.assign({
            symbol: symbol(current), reference: reference, quote: close
          }, badWick));
          scheduleRefresh('isolated-xau-live-wick');
          return false;
        }
        if (symbol(current) === 'XAUUSD' && jump > liveDeviationLimit(symbol(current))) {
          var stability = window.GPXauLivePriceStabilityV1;
          var source = state.quote && state.quote.source || candle.source || 'main-chart-live';
          var evidenceKey = candle.quoteTime || candle.eventTime || candle.time || '';
          if (!stability || typeof stability.approve !== 'function' ||
              !stability.approve(close, reference, source, true, evidenceKey)) {
            markRejected('unconfirmed-live-jump', { symbol: symbol(current), reference: reference, quote: close, deviation: jump });
            scheduleRefresh('unconfirmed-live-jump');
            return false;
          }
        }
        if (jump > liveDeviationLimit(symbol(current)) && !secureQuoteMatch) {
          markRejected('unconfirmed-live-jump', { symbol: symbol(current), reference: reference, quote: close, deviation: jump });
          scheduleRefresh('unconfirmed-live-jump');
          return false;
        }
        if (candle.__resetLiveGap === true && resetJump > liveDeviationLimit(symbol(current)) && !secureQuoteMatch) {
          markRejected('disjoint-live-candle', { reference: reference, quote: close, deviation: resetJump });
          scheduleRefresh('disjoint-live-candle');
          return false;
        }
        if (quoteFresh(state.quote) && !secureQuoteMatch) {
          return false;
        }

        var result = originalUpdateCandle.apply(this, arguments);
        if (result === false) return false;
        good.reference = close;
        good.lastTime = Math.max(Number(good.lastTime || 0), rowTimeMs(candle));
        return result;
      };
      wrappedUpdateCandle.__gpForexGoldIntegrityR311 = true;
      wrappedUpdateCandle.__gpOriginal = originalUpdateCandle;
      wrapper.updateCandle = wrappedUpdateCandle;
    }

    if (!quoteFresh(state.quote)) requestQuote('runtime-ready');
    return true;
  }

  function installYahooFuturesBlock() {
    if (!window.fetch || window.fetch.__gpYahooFuturesBlockedR311) return;
    var originalFetch = window.fetch.bind(window);
    var wrappedFetch = function (input, init) {
      var rawUrl = '';
      try { rawUrl = typeof input === 'string' ? input : input && input.url || ''; } catch (_) {}
      var decoded = '';
      try { decoded = decodeURIComponent(String(rawUrl || '')); } catch (_) { decoded = String(rawUrl || ''); }
      if (/query\d*\.finance\.yahoo\.com\/v8\/finance\/chart\/(?:GC=F|GOLD)(?:\?|$|\/)/i.test(decoded)) {
        return Promise.resolve(new Response(JSON.stringify({
          chart: { result: null, error: { code: 'R311_XAU_FUTURES_FALLBACK_BLOCKED' } }
        }), {
          status: 409,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
        }));
      }
      return originalFetch(input, init);
    };
    wrappedFetch.__gpYahooFuturesBlockedR311 = true;
    wrappedFetch.__gpOriginal = originalFetch;
    window.fetch = wrappedFetch;
  }

  function currentLoadHasCommittedHistory() {
    var rt = normalizeRuntime();
    if (!isForexGold(rt)) return true;
    var good = state.lastGood[contextKey(rt)];
    var validPrice = Number(good && (good.reference || good.historyClose) || 0);
    var mainContext = [exchange(rt), symbol(rt), timeframe(rt)].join(':');
    if (!good || !Number.isFinite(validPrice) || validPrice <= 0 ||
        String(window.__gpMainCommittedForexContext || '') !== mainContext) return false;
    var marketState = window.__gpMarketDataState || {};
    var loadStartedAt = String(marketState.state || '') === 'loading' ? Number(marketState.time || 0) : 0;
    return !loadStartedAt || Number(good.committedAt || 0) >= loadStartedAt;
  }

  function removeFalseLoadSuccess(root) {
    var nodes = [];
    if (root && root.nodeType === 1) nodes.push(root);
    if (root && typeof root.querySelectorAll === 'function') {
      Array.prototype.push.apply(nodes, root.querySelectorAll('.toast--success'));
    }
    nodes.forEach(function (node) {
      if (!node || !/loaded from Forex\s*\/\s*Gold feed/i.test(String(node.textContent || ''))) return;
      if (!currentLoadHasCommittedHistory() && typeof node.remove === 'function') node.remove();
    });
  }

  function installLoadSuccessGuard() {
    if (typeof window.MutationObserver !== 'function') return;
    var target = document.documentElement || document.body;
    if (!target) return;
    var observer = new window.MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes || [], removeFalseLoadSuccess);
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function boot() {
    ensureStyle();
    installLoadSuccessGuard();
    window.addEventListener('guardeer:prime-runtime-ready', function (event) {
      patchRuntime(event && event.detail);
    }, { passive: true });
    ['guardeer:market-quick-switch', 'guardeer:open-dashboard-chart'].forEach(function (name) {
      window.addEventListener(name, function () {
        window.setTimeout(function () { patchRuntime(window.GuardeerPrimeRuntime); }, 0);
      }, { passive: true });
    });
    // The TradingView-style timeframe menu keeps the same chart wrapper while
    // changing rt.state.timeframe. Refresh the integrity context after both
    // public timeframe events so lastGood is read from the newly committed
    // interval instead of the previous interval. The delayed pass covers the
    // asynchronous switchTimeframe load without issuing a second data load.
    ['gp:timeframe-changed', 'guardeer:timeframe-changed'].forEach(function (name) {
      window.addEventListener(name, function () {
        window.setTimeout(function () { patchRuntime(window.GuardeerPrimeRuntime); }, 0);
        window.setTimeout(function () { patchRuntime(window.GuardeerPrimeRuntime); }, 500);
      }, { passive: true });
    });
    window.addEventListener('online', function () { scheduleResume('online', 0); }, { passive: true });
    window.addEventListener('focus', function () { scheduleResume('focus', 80); }, { passive: true });
    window.addEventListener('pageshow', function () { scheduleResume('pageshow', 40); }, { passive: true });
    window.addEventListener('guardeer:forexgold-session-reopened', function () {
      scheduleResume('session-reopened', 0);
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleResume('visible', 60);
    }, { passive: true });
    ['guardeer:auth-token-refreshed', 'guardeer:auth-updated', 'guardeer:open-dashboard-chart', 'guardeer:terminal-visibility-changed'].forEach(function (name) {
      window.addEventListener(name, function () { scheduleResume(name, 80); }, { passive: true });
    });
    patchRuntime(window.GuardeerPrimeRuntime);
    window.setInterval(function () {
      var rt = normalizeRuntime();
      if (rt && (rt.chart !== state.wrapper || state.context !== contextKey(rt))) patchRuntime(rt);
      else if (isForexGold(rt) && !quoteFresh(state.quote)) requestQuote('watchdog');
      checkHistoryRecovery('watchdog');
    }, 15000);
  }

  window.GPForexGoldFeedIntegrityR311 = window.GPForexGoldFeedIntegrityR313 = {
    version: VERSION,
    attach: patchRuntime,
    confirmsLivePrice: function (price, targetSymbol) {
      var rt = normalizeRuntime();
      var requested = clean(targetSymbol || symbol(rt));
      if (!rt || requested !== symbol(rt)) return false;
      var good = state.lastGood[contextKey(rt)];
      var reference = Number(good && (good.reference || good.historyClose) || 0);
      var value = Number(price);
      var historyMatch = reference > 0 && value > 0 && Math.abs(value - reference) / reference <= liveDeviationLimit(requested);
      return Boolean(historyMatch || secureQuoteMatches(value, requested));
    },
    confirmsHistoryPrice: function (price, targetSymbol) {
      var rt = normalizeRuntime();
      var requested = clean(targetSymbol || symbol(rt));
      if (!rt || requested !== symbol(rt)) return false;
      var good = state.lastGood[contextKey(rt)];
      var reference = Number(good && (good.reference || good.historyClose) || 0);
      var value = Number(price);
      return Boolean(reference > 0 && value > 0 &&
        Math.abs(value - reference) / reference <= liveDeviationLimit(requested));
    },
    recover: function (reason) {
      requestQuote(String(reason || 'manual-recovery'));
      return scheduleRefresh(String(reason || 'manual-recovery'));
    },
    resume: function (reason) {
      return scheduleResume(String(reason || 'manual-resume'), 0);
    },
    verifyHistory: verifyHistory,
    validateRows: function (list, options) {
      options = options || {};
      var rt = options.runtime || normalizeRuntime();
      return validateRows(list, rt, options.quote || null, options.allowMissingQuote !== false);
    },
    status: function () {
      var rt = normalizeRuntime();
      var good = state.lastGood[state.context];
      return {
        version: VERSION,
        context: state.context,
        generation: state.generation,
        quote: state.quote,
        quoteBusy: Boolean(state.quotePromise),
        refreshBusy: state.refreshBusy,
        lastRefreshAt: state.lastRefreshAt,
        contextStartedAt: state.contextStartedAt,
        refreshFailures: state.refreshFailures,
        nextRefreshAt: state.nextRefreshAt,
        lastRecoveryReason: state.lastRecoveryReason,
        hasPendingSet: Boolean(state.pendingSet),
        hasGoodHistory: Boolean(good),
        goodHistoryRows: Number(good && (good.closedRowCount != null ? good.closedRowCount : good.rowCount || good.rows && good.rows.length) || 0),
        requiredRows: minimumHistoryRows(timeframe(rt)),
        sessionOpen: sessionIsOpen(rt, new Date()),
        preferredQuoteProvider: state.preferredQuoteProvider,
        ignoredSupersededHistoryCount: state.ignoredSupersededHistoryCount,
        lastRejectedReason: state.lastRejectedReason,
        lastRejectedAt: state.lastRejectedAt
      };
    },
    _test: {
      allowedAgeMs: allowedAgeMs,
      deviationLimit: deviationLimit,
      liveDeviationLimit: liveDeviationLimit,
      liveQuoteMatchLimit: liveQuoteMatchLimit,
      hasSyntheticRows: hasSyntheticRows,
      hasBlockedProviderRows: hasBlockedProviderRows,
      referencePrice: referencePrice,
      medianIntervalMs: medianIntervalMs,
      isolatedXauExcursion: isolatedXauExcursion,
      implausibleLiveXauCandle: implausibleLiveXauCandle,
      xauRangeThreshold: xauRangeThreshold,
      rowTimeMs: rowTimeMs,
      closedHistoryRowCount: closedHistoryRowCount,
      minimumHistoryRows: minimumHistoryRows
    }
  };

  installYahooFuturesBlock();
  // This asset is loaded at the end of <body>, before the deferred main module
  // finishes startup. Register the runtime-ready listener immediately so the
  // first history setData call is protected as well.
  boot();
})();
