(function () {
  'use strict';

  if (window.__GP_FOREXGOLD_SESSION_NETWORK_GUARD_R387__) return;
  window.__GP_FOREXGOLD_SESSION_NETWORK_GUARD_R387__ = true;

  var VERSION = 'r387-forexgold-session-network-guard-v1';
  var originalFetch = window.fetch && window.fetch.bind(window);
  var originalSetInterval = window.setInterval.bind(window);
  var counters = { blockedQuotes: 0, suppressedPollTicks: 0, lastBlockedUrl: '', lastBlockedAt: 0 };

  function runtime() {
    var root = window.GuardeerPrimeRuntime;
    return root && (root.runtime || root) || null;
  }

  function isForexGold() {
    var rt = runtime();
    return String(rt && rt.state && rt.state.exchange || '').toLowerCase() === 'forexgold';
  }

  function sessionClosed() {
    if (!isForexGold()) return false;
    try {
      var api = window.GPMarketSessionV146 || window.GPMarketSessionV119;
      return Boolean(api && typeof api.isOpen === 'function' && api.isOpen(new Date(), runtime()) === false);
    } catch (_) {
      return false;
    }
  }

  function isLiveQuoteRequest(url) {
    var host = String(url && url.hostname || '').toLowerCase();
    var path = String(url && url.pathname || '').replace(/\/{2,}/g, '/').toLowerCase().replace(/\/$/, '');
    if ((host === 'financialmodelingprep.com' || host === 'www.financialmodelingprep.com') && path === '/stable/quote-short') return true;
    if ((host === 'api.massive.com' || host === 'api.polygon.io') && path.indexOf('/v1/last_quote/currencies/') === 0) return true;
    if (host === 'api.twelvedata.com' && (path === '/price' || path === '/quote')) return true;
    if (host === 'open.er-api.com' && path.indexOf('/v6/latest/') === 0) return true;
    if (host === 'api.frankfurter.app' && path === '/latest') return true;
    return false;
  }

  function isCoreForexGoldPoll(callback, delay) {
    if (Number(delay) !== 1500 || typeof callback !== 'function') return false;
    try {
      // The active r358 core poll carries this stable diagnostic marker. Do
      // not pause unrelated drawing, accessibility or UI timers that happen
      // to use the same interval while the market session is closed.
      return Function.prototype.toString.call(callback).indexOf('Forex/Gold live polling error') >= 0;
    } catch (_) {
      return false;
    }
  }

  function closedResponse() {
    return new Response(JSON.stringify({
      status: 'error',
      code: 'MARKET_SESSION_CLOSED',
      message: 'Forex / Gold live quote polling is paused while the market session is closed.'
    }), {
      status: 425,
      statusText: 'Market Closed',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-guardeer-market-session': 'closed'
      }
    });
  }

  if (originalFetch) {
    window.fetch = function (input, init) {
      var raw = '';
      try { raw = typeof input === 'string' ? input : input && input.url || ''; } catch (_) {}
      var parsed = null;
      try { parsed = new URL(String(raw || ''), window.location.href); } catch (_) {}
      if (parsed && isLiveQuoteRequest(parsed) && sessionClosed()) {
        var signal = init && init.signal;
        if (signal && signal.aborted) {
          try { return Promise.reject(new DOMException('The operation was aborted.', 'AbortError')); }
          catch (_) { return Promise.reject(new Error('The operation was aborted.')); }
        }
        counters.blockedQuotes += 1;
        counters.lastBlockedUrl = parsed.origin + parsed.pathname;
        counters.lastBlockedAt = Date.now();
        return Promise.resolve(closedResponse());
      }
      return originalFetch(input, init);
    };
    window.fetch.__gpForexGoldSessionNetworkGuardR387 = true;
    window.fetch.__gpOriginal = originalFetch;
  }

  window.setInterval = function (callback, delay) {
    var args = Array.prototype.slice.call(arguments, 2);
    if (isCoreForexGoldPoll(callback, delay)) {
      var guarded = function () {
        if (sessionClosed()) {
          counters.suppressedPollTicks += 1;
          return;
        }
        return callback.apply(this, arguments);
      };
      return originalSetInterval.apply(window, [guarded, delay].concat(args));
    }
    return originalSetInterval.apply(window, arguments);
  };
  window.setInterval.__gpForexGoldSessionNetworkGuardR387 = true;
  window.setInterval.__gpOriginal = originalSetInterval;

  window.GPForexGoldSessionNetworkGuardR387 = {
    version: VERSION,
    isClosed: sessionClosed,
    status: function () {
      return {
        version: VERSION,
        sessionClosed: sessionClosed(),
        blockedQuotes: counters.blockedQuotes,
        suppressedPollTicks: counters.suppressedPollTicks,
        lastBlockedUrl: counters.lastBlockedUrl,
        lastBlockedAt: counters.lastBlockedAt
      };
    }
  };
})();
