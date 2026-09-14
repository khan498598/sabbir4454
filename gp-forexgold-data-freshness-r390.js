(function (root, factory) {
  'use strict';

  var api = factory(root || {});
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.GPForexGoldDataFreshnessR390 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 'r390-forexgold-data-freshness-v1';
  var QUOTE_MAX_AGE_MS = 2 * 60 * 1000;
  var MAX_FUTURE_SKEW_MS = 60 * 1000;

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function timeframeMs(value) {
    var tf = String(value || '1h').trim();
    if (tf === '1M') return 30 * 86400000;
    var amount = Math.max(1, parseInt(tf, 10) || 1);
    var unit = tf.slice(-1).toLowerCase();
    if (unit === 'm') return amount * 60000;
    if (unit === 'h') return amount * 3600000;
    if (unit === 'd') return amount * 86400000;
    if (unit === 'w') return amount * 7 * 86400000;
    return 3600000;
  }

  function allowedHistoryAgeMs(value, now) {
    var interval = timeframeMs(value);
    if (interval >= 7 * 86400000) return 15 * 86400000;
    if (interval >= 86400000) return 5 * 86400000;
    var date = new Date(now || Date.now());
    var day = date.getUTCDay();
    var mondayOpenGrace = day === 1 && date.getUTCHours() < 6;
    if (day === 0 || day === 6 || mondayOpenGrace) return 96 * 3600000;
    return Math.max(interval * 6, 3 * 3600000);
  }

  function numericEpochMs(value) {
    var parsed = number(value);
    if (!(parsed > 0)) return 0;
    if (parsed >= 1e18) return Math.floor(parsed / 1e6);
    if (parsed >= 1e15) return Math.floor(parsed / 1e3);
    if (parsed >= 1e12) return Math.floor(parsed);
    if (parsed >= 1e10) return Math.floor(parsed);
    return Math.floor(parsed * 1000);
  }

  function parseTimeMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' || typeof value === 'bigint') return numericEpochMs(value);
    if (typeof value !== 'string') return 0;
    var source = value.trim();
    if (!source) return 0;
    if (/^\d+(?:\.\d+)?$/.test(source)) return numericEpochMs(source);
    try {
      var helper = root.GPFmpEasternTimeV1;
      var parsed = helper && typeof helper.parseMilliseconds === 'function'
        ? helper.parseMilliseconds(source)
        : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } catch (_) {}
    var fallback = Date.parse(source);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  function rowTimeMs(row) {
    row = row || {};
    var candidates = [row.time, row.t, row.timestamp, row.datetime, row.date];
    for (var index = 0; index < candidates.length; index += 1) {
      var parsed = parseTimeMs(candidates[index]);
      if (parsed > 0) return parsed;
    }
    return 0;
  }

  function latestTimeMs(rows) {
    var latest = 0;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      latest = Math.max(latest, rowTimeMs(row));
    });
    return latest;
  }

  function inspectHistory(rows, timeframe, now) {
    var checkedAt = number(now) || Date.now();
    var lastTime = latestTimeMs(rows);
    var maxAgeMs = allowedHistoryAgeMs(timeframe, checkedAt);
    var futureSkewMs = lastTime > checkedAt ? lastTime - checkedAt : 0;
    var ageMs = lastTime > 0 ? Math.max(0, checkedAt - lastTime) : Infinity;
    var ok = lastTime > 0 && futureSkewMs <= MAX_FUTURE_SKEW_MS && ageMs <= maxAgeMs;
    return {
      ok: ok,
      reason: lastTime > 0
        ? (futureSkewMs > MAX_FUTURE_SKEW_MS ? 'future-history' : (ok ? 'fresh-history' : 'stale-history'))
        : 'history-time-unavailable',
      timeframe: String(timeframe || ''),
      checkedAt: checkedAt,
      lastTime: lastTime,
      futureSkewMs: futureSkewMs,
      ageMs: ageMs,
      maxAgeMs: maxAgeMs,
      rowCount: Array.isArray(rows) ? rows.length : 0
    };
  }

  function staleHistoryError(inspection, source) {
    var detail = inspection || {};
    var ageMinutes = Number.isFinite(detail.ageMs) ? Math.round(detail.ageMs / 60000) : null;
    var error = new Error(
      ageMinutes == null
        ? 'Provider history has no verifiable timestamp.'
        : 'Provider history is stale (' + ageMinutes + ' minutes old).'
    );
    error.code = detail.reason === 'history-time-unavailable'
      ? 'HISTORY_TIME_UNAVAILABLE'
      : detail.reason === 'future-history' ? 'FUTURE_HISTORY' : 'STALE_HISTORY';
    error.source = String(source || 'provider');
    error.detail = detail;
    return error;
  }

  function assertFreshHistory(rows, timeframe, source, now) {
    var inspection = inspectHistory(rows, timeframe, now);
    if (!inspection.ok) throw staleHistoryError(inspection, source);
    return rows;
  }

  function quoteTimeMs(row) {
    row = row || {};
    var candidates = [
      row.timestamp,
      row.t,
      row.time,
      row.last_updated,
      row.lastUpdated,
      row.updated_at,
      row.updatedAt,
      row.sip_timestamp,
      row.participant_timestamp
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      var parsed = parseTimeMs(candidates[index]);
      if (parsed > 0) return parsed;
    }
    return 0;
  }

  function inspectQuote(row, now, maxAgeMs) {
    var checkedAt = number(now) || Date.now();
    var time = quoteTimeMs(row);
    var limit = Math.max(1000, number(maxAgeMs) || QUOTE_MAX_AGE_MS);
    var futureSkewMs = time > checkedAt ? time - checkedAt : 0;
    var ageMs = time > 0 ? Math.max(0, checkedAt - time) : Infinity;
    var ok = time > 0 && futureSkewMs <= MAX_FUTURE_SKEW_MS && ageMs <= limit;
    return {
      ok: ok,
      reason: time > 0
        ? (futureSkewMs > MAX_FUTURE_SKEW_MS ? 'future-quote' : (ok ? 'fresh-quote' : 'stale-quote'))
        : 'quote-time-unavailable',
      checkedAt: checkedAt,
      time: time,
      futureSkewMs: futureSkewMs,
      ageMs: ageMs,
      maxAgeMs: limit
    };
  }

  function quoteResult(row, price, source, now) {
    var inspection = inspectQuote(row, now);
    return {
      price: number(price),
      source: String(source || 'provider quote'),
      fresh: inspection.ok,
      time: inspection.time,
      freshnessReason: inspection.reason,
      freshness: inspection
    };
  }

  function quoteFreshnessError(result, source) {
    var quote = result || {};
    var reason = String(quote.freshnessReason || quote.freshness && quote.freshness.reason || 'stale-quote');
    var error = new Error(
      reason === 'quote-time-unavailable'
        ? 'Provider quote has no verifiable timestamp.'
        : 'Provider quote is stale.'
    );
    error.code = reason === 'quote-time-unavailable'
      ? 'QUOTE_TIME_UNAVAILABLE'
      : reason === 'future-quote' ? 'FUTURE_QUOTE' : 'STALE_QUOTE';
    error.source = String(source || quote.source || 'provider quote');
    error.quoteResult = quote;
    return error;
  }

  function assertFreshQuote(result, source) {
    if (result && result.fresh === true) return result;
    throw quoteFreshnessError(result, source);
  }

  function historyProof(rows, timeframe, context, source, now) {
    var inspection = inspectHistory(rows, timeframe, now);
    if (!inspection.ok) return null;
    return {
      context: String(context || ''),
      source: String(source || 'verified history'),
      timeframe: String(timeframe || ''),
      checkedAt: inspection.checkedAt,
      lastTime: inspection.lastTime,
      validUntil: inspection.lastTime + inspection.maxAgeMs
    };
  }

  function hasFreshHistoryProof(proof, context, now) {
    var checkedAt = number(now) || Date.now();
    return Boolean(
      proof &&
      String(proof.context || '') === String(context || '') &&
      number(proof.lastTime) > 0 &&
      number(proof.validUntil) >= checkedAt
    );
  }

  function responseTimeFallback(result, proof, context, source, now) {
    var quote = result || {};
    var checkedAt = number(now) || Date.now();
    if (
      quote.freshnessReason !== 'quote-time-unavailable' ||
      !(number(quote.price) > 0) ||
      !hasFreshHistoryProof(proof, context, checkedAt)
    ) return null;
    return {
      price: number(quote.price),
      source: String(source || quote.source || 'provider quote') + ' · response verified by fresh matching history',
      fresh: true,
      time: checkedAt,
      freshnessReason: 'fresh-response-backed-by-history',
      providerTimestampVerified: false,
      responseTimeFallback: true,
      freshness: {
        ok: true,
        reason: 'fresh-response-backed-by-history',
        checkedAt: checkedAt,
        time: checkedAt,
        ageMs: 0,
        maxAgeMs: QUOTE_MAX_AGE_MS
      }
    };
  }

  return Object.freeze({
    version: VERSION,
    timeframeMs: timeframeMs,
    allowedHistoryAgeMs: allowedHistoryAgeMs,
    parseTimeMs: parseTimeMs,
    rowTimeMs: rowTimeMs,
    latestTimeMs: latestTimeMs,
    inspectHistory: inspectHistory,
    assertFreshHistory: assertFreshHistory,
    inspectQuote: inspectQuote,
    quoteResult: quoteResult,
    quoteFreshnessError: quoteFreshnessError,
    assertFreshQuote: assertFreshQuote,
    historyProof: historyProof,
    hasFreshHistoryProof: hasFreshHistoryProof,
    responseTimeFallback: responseTimeFallback
  });
});
