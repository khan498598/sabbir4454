(function () {
  'use strict';

  if (window.__GP_FOREX_QUOTE_REFRESH_STABILITY_V1__) return;
  window.__GP_FOREX_QUOTE_REFRESH_STABILITY_V1__ = true;

  var VERSION = 'gp-forex-quote-refresh-stability-v1';
  var FRESHNESS_MS = 45000;
  var TRANSIENT_SOURCES = /^(?:pending|cache|timeout)$/;
  var backing = Object.create(null);

  function timestamp(value) {
    var time = Number(value || 0);
    if (!Number.isFinite(time) || time <= 0) return 0;
    return time < 100000000000 ? time * 1000 : time;
  }

  function isVerifiedAndFresh(quote, now) {
    var time = timestamp(quote && (quote.time || quote.updatedAt || quote.timestamp || quote.eventTime));
    var price = Number(quote && quote.price);
    var age = Number(now) - time;
    return Boolean(quote && quote.fresh === true && Number.isFinite(price) && price > 0 &&
      time > 0 && Number.isFinite(age) && age >= 0 && age <= FRESHNESS_MS);
  }

  function normalizeAttempt(previous, next, now) {
    var source = String(next && next.source || 'unknown').toLowerCase();
    if (next && next.fresh !== true && TRANSIENT_SOURCES.test(source) && isVerifiedAndFresh(previous, now)) {
      // Starting or timing out one refresh does not invalidate the last provider
      // quote while its original provider timestamp is still inside the strict
      // freshness window. Never renew that timestamp here.
      return Object.assign({}, previous, {
        pending: source === 'pending',
        refreshState: source,
        lastAttemptAt: now,
        lastAttemptSource: source
      });
    }

    var accepted = next && typeof next === 'object' ? Object.assign({}, next) : next;
    if (accepted && typeof accepted === 'object') {
      accepted.pending = source === 'pending';
      accepted.refreshState = source;
      accepted.lastAttemptAt = now;
      accepted.lastAttemptSource = source;
    }
    return accepted;
  }

  var state = new Proxy(backing, {
    set: function (target, key, value) {
      target[key] = normalizeAttempt(target[key], value, Date.now());
      return true;
    },
    defineProperty: function (target, key, descriptor) {
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        descriptor = Object.assign({}, descriptor, {
          value: normalizeAttempt(target[key], descriptor.value, Date.now())
        });
      }
      return Reflect.defineProperty(target, key, descriptor);
    }
  });

  function importState(value) {
    if (!value || typeof value !== 'object' || value === state) return;
    Object.keys(value).forEach(function (key) { state[key] = value[key]; });
  }

  try { importState(window.__gpForexQuoteState); } catch (_) {}

  try {
    Object.defineProperty(window, '__gpForexQuoteState', {
      configurable: false,
      enumerable: true,
      get: function () { return state; },
      set: function (value) { importState(value); }
    });
  } catch (_) {
    window.__gpForexQuoteState = state;
  }

  window.GPForexQuoteRefreshStabilityV1 = {
    version: VERSION,
    freshnessWindowMs: FRESHNESS_MS,
    state: function (symbol) {
      return state[String(symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()] || null;
    },
    isFresh: function (symbol) {
      return isVerifiedAndFresh(this.state(symbol), Date.now());
    }
  };
})();
