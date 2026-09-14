(function () {
  'use strict';

  if (window.__GP_FOREXGOLD_RUNTIME_STABILITY_V1__) return;
  window.__GP_FOREXGOLD_RUNTIME_STABILITY_V1__ = true;

  var VERSION = 'r397-forexgold-runtime-rebind-coalescing-v1';
  var BREAKER_TTL_MS = 60000;
  var REFRESH_DEADLINE_MS = 45000;
  var FOREX_GOLD_SYMBOLS = {
    XAUUSD: true,
    EURUSD: true,
    GBPUSD: true,
    USDJPY: true,
    AUDUSD: true,
    USDCHF: true,
    USDCAD: true
  };
  var DEFAULT_SYMBOLS = { forex: 'EURUSD', gold: 'XAUUSD' };
  var breakers = new Map();
  var switchBusy = false;
  var queuedSwitch = null;
  var toastObserver = null;
  var runtimeRef = null;
  var delegatedSwitchInvocation = null;
  var refreshPromise = null;
  var refreshContext = '';
  var refreshRuntime = null;
  var refreshGuardedRuntimes = new WeakSet();
  var state = {
    installedAt: Date.now(),
    runtimePatched: false,
    selectorDelegated: false,
    phase: 'booting',
    context: '',
    committedVerifiedHistory: false,
    lastFailureCode: '',
    lastFailureReason: '',
    lastFailureAt: 0,
    lastFailureDetail: null,
    lastMarketState: '',
    lastMarketReason: '',
    lastProviderCapability: '',
    lastProviderCapabilityAt: 0,
    blockedFalseSuccessCount: 0,
    replacedGenericErrorCount: 0,
    delegatedSwitchCount: 0,
    lastDelegatedSource: '',
    requestedContext: '',
    requestedSymbol: '',
    requestedType: '',
    requestedPhase: '',
    requestedStartedAt: 0,
    lastToastKey: '',
    lastToastAt: 0,
    actualFmpHistorical402Count: 0,
    localFmpHistorical402Count: 0,
    actualFmpQuote402Count: 0,
    localFmpQuote402Count: 0
  };

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function normalizeRuntime(value) {
    var root = value || window.GuardeerPrimeRuntime || runtimeRef;
    return root && (root.runtime || root) || null;
  }

  function runtimeMarket(value) {
    var rt = normalizeRuntime(value);
    var rtState = rt && rt.state;
    var symbol = cleanSymbol(rtState && rtState.symbol);
    return {
      runtime: rt,
      exchange: String(rtState && rtState.exchange || '').toLowerCase(),
      symbol: symbol,
      timeframe: String(rtState && rtState.timeframe || '1h')
    };
  }

  function isForexGoldSymbol(value) {
    return FOREX_GOLD_SYMBOLS[cleanSymbol(value)] === true;
  }

  function isForexGoldRuntime(value) {
    var market = runtimeMarket(value);
    return market.exchange === 'forexgold' && isForexGoldSymbol(market.symbol);
  }

  function sessionClosed(value) {
    if (!isForexGoldRuntime(value)) return false;
    try {
      var api = window.GPMarketSessionV146 || window.GPMarketSessionV119;
      return Boolean(api && typeof api.isOpen === 'function' && api.isOpen(new Date(), normalizeRuntime(value)) === false);
    } catch (_) {
      return false;
    }
  }

  function contextKey(value) {
    var market = runtimeMarket(value);
    return [market.exchange, market.symbol, market.timeframe].join(':');
  }

  function integrityStatus() {
    try {
      var api = window.GPForexGoldFeedIntegrityR311;
      return api && typeof api.status === 'function' ? api.status() || null : null;
    } catch (_) {
      return null;
    }
  }

  function latestCandles(value) {
    try {
      var rt = normalizeRuntime(value);
      var rows = rt && typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function isRealHistory(rows) {
    if (!Array.isArray(rows) || rows.length < 24) return false;
    var previousTime = 0;
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index] || {};
      var time = Number(row.time);
      var open = Number(row.open);
      var high = Number(row.high);
      var low = Number(row.low);
      var close = Number(row.close);
      var source = String(row.provider || row.source || '');
      if (row.synthetic === true || /synthetic|safety-fallback|mock|demo/i.test(source)) return false;
      if (!Number.isFinite(time) || time <= previousTime ||
          ![open, high, low, close].every(function (number) { return Number.isFinite(number) && number > 0; }) ||
          high < Math.max(open, close) || low > Math.min(open, close) || low > high) return false;
      previousTime = time;
    }
    return true;
  }

  function hasCommittedVerifiedHistory(value) {
    var market = runtimeMarket(value);
    if (market.exchange !== 'forexgold' || !isForexGoldSymbol(market.symbol)) return false;
    var status = integrityStatus();
    var expectedIntegrityContext = [market.symbol, 'forexgold', market.timeframe].join('|');
    var expectedMainContext = ['forexgold', market.symbol, market.timeframe].join(':');
    return Boolean(status && status.context === expectedIntegrityContext && status.hasGoodHistory === true &&
      String(window.__gpMainCommittedForexContext || '') === expectedMainContext &&
      isRealHistory(latestCandles(market.runtime)));
  }

  function breakerSnapshot() {
    var now = Date.now();
    var result = [];
    breakers.forEach(function (entry, key) {
      if (!entry || entry.expiresAt <= now) {
        breakers.delete(key);
        return;
      }
      result.push({
        kind: entry.kind || 'historical',
        path: entry.path,
        symbol: entry.symbol,
        key: key,
        status: 402,
        openedAt: entry.openedAt,
        expiresAt: entry.expiresAt,
        localHits: entry.localHits || 0
      });
    });
    return result;
  }

  function publicStatus() {
    var market = runtimeMarket();
    var committed = hasCommittedVerifiedHistory(market.runtime);
    state.context = state.requestedPhase === 'start' && state.requestedContext
      ? state.requestedContext
      : contextKey(market.runtime);
    state.committedVerifiedHistory = committed;
    return {
      version: VERSION,
      installedAt: state.installedAt,
      runtimePatched: state.runtimePatched,
      selectorDelegated: state.selectorDelegated,
      phase: state.phase,
      context: state.context,
      exchange: market.exchange,
      symbol: market.symbol,
      timeframe: market.timeframe,
      committedVerifiedHistory: committed,
      switchBusy: switchBusy,
      queuedSwitch: queuedSwitch ? {
        symbol: queuedSwitch.symbol,
        source: queuedSwitch.source
      } : null,
      lastFailureCode: state.lastFailureCode,
      lastFailureReason: state.lastFailureReason,
      lastFailureAt: state.lastFailureAt,
      lastFailureDetail: state.lastFailureDetail,
      lastMarketState: state.lastMarketState,
      lastMarketReason: state.lastMarketReason,
      lastProviderCapability: state.lastProviderCapability,
      lastProviderCapabilityAt: state.lastProviderCapabilityAt,
      blockedFalseSuccessCount: state.blockedFalseSuccessCount,
      replacedGenericErrorCount: state.replacedGenericErrorCount,
      delegatedSwitchCount: state.delegatedSwitchCount,
      lastDelegatedSource: state.lastDelegatedSource,
      requestedContext: state.requestedContext,
      requestedSymbol: state.requestedSymbol,
      requestedType: state.requestedType,
      requestedPhase: state.requestedPhase,
      requestedStartedAt: state.requestedStartedAt,
      refreshInFlight: Boolean(refreshPromise && refreshRuntime === market.runtime && refreshContext === contextKey(market.runtime)),
      actualFmpHistorical402Count: state.actualFmpHistorical402Count,
      localFmpHistorical402Count: state.localFmpHistorical402Count,
      actualFmpQuote402Count: state.actualFmpQuote402Count,
      localFmpQuote402Count: state.localFmpQuote402Count,
      openFmpBreakers: breakerSnapshot(),
      openFmpHistoricalBreakers: breakerSnapshot().filter(function (entry) { return entry.kind !== 'quote'; })
    };
  }

  function publish(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent('guardeer:forexgold-runtime-stability', {
        detail: Object.assign({
          version: VERSION,
          kind: String(kind || 'status'),
          time: Date.now(),
          status: publicStatus()
        }, detail || {})
      }));
    } catch (_) {}
  }

  function compactFailureDetail(detail) {
    detail = detail || {};
    var copy = {};
    ['deviation', 'expectedInterval', 'observedInterval', 'lastTime', 'reference', 'quote', 'error'].forEach(function (key) {
      if (detail[key] != null) copy[key] = detail[key];
    });
    return copy;
  }

  function percent(value) {
    var number = Number(value);
    return Number.isFinite(number) ? (number * 100).toFixed(3) + '%' : '';
  }

  function exactFailureText(code, detail) {
    code = String(code || 'verified-history-not-committed');
    detail = detail || {};
    var suffix = '';
    if (Number.isFinite(Number(detail.deviation))) suffix = ' (' + percent(detail.deviation) + ')';
    var messages = {
      'history-too-short': 'provider history has fewer than 24 valid candles',
      'synthetic-history': 'synthetic or demo history was rejected',
      'xau-futures-history': 'XAU futures fallback was rejected for XAUUSD spot',
      'invalid-ohlc': 'provider history contains invalid or unordered OHLC candles',
      'stale-history': 'the latest provider candle is stale',
      'timeframe-mismatch': 'the provider candle interval does not match the selected timeframe',
      'history-quote-mismatch': 'provider history and the live quote do not match' + suffix,
      'quote-pending': 'a fresh live quote is unavailable',
      'quote-unavailable': 'the live quote request failed',
      'stale-context-history': 'history arrived for a market that is no longer selected',
      'out-of-order-history': 'older history attempted to replace newer committed history',
      'quote-verification-timeout': 'live quote verification timed out',
      'unconfirmed-live-jump': 'an unconfirmed live price jump was rejected' + suffix,
      'disjoint-live-candle': 'a disjoint live candle was rejected' + suffix,
      'fmp-historical-capability-402': 'the verified history feed returned HTTP 402; the fallback feed is required',
      'fmp-quote-capability-402': 'the verified quote feed returned HTTP 402; the fallback feed is required',
      'verified-history-not-committed': 'no verified provider history was committed to the selected chart',
      'runtime-unavailable': 'the market runtime is not ready',
      'market-switch-failed': 'the requested Forex/Gold market switch failed'
    };
    return 'Forex/Gold feed blocked: ' + (messages[code] || String(detail.error || 'the feed is temporarily unavailable'));
  }

  function rememberFailure(code, detail, showToast) {
    code = String(code || 'verified-history-not-committed');
    state.phase = 'blocked';
    if (state.requestedContext === contextKey()) state.requestedPhase = 'failed';
    state.lastFailureCode = code;
    state.lastFailureDetail = compactFailureDetail(detail);
    state.lastFailureReason = exactFailureText(code, detail);
    state.lastFailureAt = Date.now();
    state.committedVerifiedHistory = false;
    if (document.body) document.body.setAttribute('data-gp-forexgold-feed-failure', code);
    publish('blocked', { reasonCode: code, reason: state.lastFailureReason });
    if (showToast) showFailureToast(code, detail);
  }

  function clearFailure(reason) {
    state.phase = 'verified';
    // Both delegated switches AND programmatic recovery loads must settle.
    // Leaving this at "start" made verified charts say LOADING forever.
    if (state.requestedContext === contextKey()) state.requestedPhase = 'complete';
    state.lastFailureCode = '';
    state.lastFailureReason = '';
    state.lastFailureDetail = null;
    state.committedVerifiedHistory = true;
    if (document.body) document.body.removeAttribute('data-gp-forexgold-feed-failure');
    publish('verified', { reason: String(reason || 'committed-verified-history') });
  }

  function showFailureToast(code, detail) {
    if (!isForexGoldRuntime()) return;
    if (sessionClosed()) return;
    var message = exactFailureText(code, detail);
    var key = contextKey() + '|' + code + '|' + message;
    var now = Date.now();
    if (state.lastToastKey === key && now - state.lastToastAt < 5000) return;
    state.lastToastKey = key;
    state.lastToastAt = now;
    try {
      var rt = normalizeRuntime();
      if (rt && typeof rt.showToast === 'function') rt.showToast(message, 'error');
    } catch (_) {}
  }

  function currentFailure() {
    var status = integrityStatus();
    if (status && status.lastRejectedReason) {
      return { code: String(status.lastRejectedReason), detail: state.lastFailureDetail || {} };
    }
    if (state.lastFailureCode) return { code: state.lastFailureCode, detail: state.lastFailureDetail || {} };
    if (state.lastProviderCapability === 'fmp-historical-capability-402' || state.lastProviderCapability === 'fmp-quote-capability-402') {
      return { code: state.lastProviderCapability, detail: {} };
    }
    return { code: 'verified-history-not-committed', detail: {} };
  }

  function beginLoad(source, request) {
    var market = runtimeMarket();
    var requestedSymbol = cleanSymbol(request && request.symbol || market.symbol);
    var requestedType = requestedSymbol === 'XAUUSD' ? 'gold' : isForexGoldSymbol(requestedSymbol) ? 'forex' : '';
    state.phase = 'loading';
    state.context = requestedSymbol && isForexGoldSymbol(requestedSymbol)
      ? ['forexgold', requestedSymbol, market.timeframe].join(':')
      : contextKey();
    state.requestedContext = state.context;
    state.requestedSymbol = requestedSymbol;
    state.requestedType = requestedType;
    state.requestedPhase = 'start';
    state.requestedStartedAt = Date.now();
    state.committedVerifiedHistory = false;
    publish('loading', {
      source: String(source || 'runtime'),
      phase: 'start',
      pending: true,
      exchange: requestedType ? 'forexgold' : market.exchange,
      symbol: requestedSymbol,
      timeframe: market.timeframe,
      context: state.requestedContext
    });
  }

  function patchRuntime(value) {
    var rt = normalizeRuntime(value);
    if (!rt) return false;
    runtimeRef = rt;

    if (typeof rt.switchMarket === 'function' && !rt.switchMarket.__gpForexGoldRuntimeStabilityV1) {
      var originalSwitchMarket = rt.switchMarket;
      var wrappedSwitchMarket = async function () {
        var targetSymbol = cleanSymbol(arguments[0]);
        var targetIsForexGold = isForexGoldSymbol(targetSymbol);
        if (targetIsForexGold && (!delegatedSwitchInvocation || delegatedSwitchInvocation.symbol !== targetSymbol)) {
          beginLoad('runtime-switch-market', { symbol: targetSymbol });
        }
        try {
          return await originalSwitchMarket.apply(this, arguments);
        } catch (error) {
          if (targetIsForexGold) rememberFailure('market-switch-failed', { error: String(error && error.message || error || '') }, true);
          throw error;
        } finally {
          if (!isForexGoldRuntime(rt)) {
            state.phase = 'idle';
            state.committedVerifiedHistory = false;
          }
        }
      };
      wrappedSwitchMarket.__gpForexGoldRuntimeStabilityV1 = true;
      wrappedSwitchMarket.__gpOriginal = originalSwitchMarket;
      rt.switchMarket = wrappedSwitchMarket;
    }

    // Session/history overlays replace the outer function but retain this
    // guarded function underneath. Wrapping again makes its inner call join
    // the outer pending promise and deadlock until the deadline. Install once
    // per runtime object; a newly created runtime still receives its own guard.
    if (typeof rt.refreshMarketData === 'function' && !refreshGuardedRuntimes.has(rt)) {
      var originalRefreshMarketData = rt.refreshMarketData;
      var wrappedRefreshMarketData = function () {
        var applies = isForexGoldRuntime(rt);
        var requestedContext = contextKey(rt);
        if (applies && refreshPromise && refreshRuntime === rt && refreshContext === requestedContext) return refreshPromise;
        if (applies) beginLoad('runtime-refresh-market-data', { symbol: runtimeMarket(rt).symbol });
        var self = this;
        var args = arguments;
        var deadlineTimer = 0;
        var work = Promise.resolve().then(function () {
          return originalRefreshMarketData.apply(self, args);
        });
        var deadline = applies ? new Promise(function (_, reject) {
          deadlineTimer = window.setTimeout(function () {
            var error = new Error('Verified market refresh timed out.');
            error.code = 'MARKET_REFRESH_TIMEOUT';
            reject(error);
          }, REFRESH_DEADLINE_MS);
        }) : null;
        var pending = (deadline ? Promise.race([work, deadline]) : work).then(function (result) {
          if (applies && requestedContext === contextKey(rt)) {
            var marketState = window.__gpMarketDataState || {};
            if (hasCommittedVerifiedHistory(rt) && !/^(stale|offline|error|failed)$/.test(String(marketState.state || ''))) {
              clearFailure('runtime-refresh-verified');
            } else if (state.requestedPhase === 'start') {
              state.requestedPhase = 'failed';
              state.phase = 'blocked';
              publish('refresh-failed', { reason: 'verified-history-not-committed' });
            }
          }
          return result;
        }).catch(function (error) {
          if (applies && requestedContext === contextKey(rt)) rememberFailure('verified-history-not-committed', { error: String(error && error.message || error || '') }, true);
          throw error;
        }).finally(function () {
          if (deadlineTimer) window.clearTimeout(deadlineTimer);
          if (refreshPromise === pending) { refreshPromise = null; refreshContext = ''; refreshRuntime = null; }
        });
        if (applies) { refreshPromise = pending; refreshContext = requestedContext; refreshRuntime = rt; }
        return pending;
      };
      wrappedRefreshMarketData.__gpForexGoldRuntimeStabilityV1 = true;
      wrappedRefreshMarketData.__gpOriginal = originalRefreshMarketData;
      rt.refreshMarketData = wrappedRefreshMarketData;
      refreshGuardedRuntimes.add(rt);
    }

    state.runtimePatched = true;
    state.context = contextKey(rt);
    state.committedVerifiedHistory = hasCommittedVerifiedHistory(rt);
    if (state.committedVerifiedHistory) state.phase = 'verified';
    publish('runtime-patched');
    return true;
  }

  function closest(target, selector) {
    return target && typeof target.closest === 'function' ? target.closest(selector) : null;
  }

  function requestFromTarget(target, eventType) {
    if (!target) return null;

    if (eventType === 'change') {
      var select = closest(target, '#gp-market-instrument-select');
      if (!select) return null;
      var selectedSymbol = cleanSymbol(select.value);
      return isForexGoldSymbol(selectedSymbol) ? { symbol: selectedSymbol, source: 'instrument-select' } : null;
    }

    var exchangeOption = closest(target, '#exchange-selector .selector__option[data-exchange]');
    if (exchangeOption && String(exchangeOption.getAttribute('data-exchange') || '').toLowerCase() === 'forexgold') {
      var market = runtimeMarket();
      return { symbol: isForexGoldSymbol(market.symbol) ? market.symbol : 'XAUUSD', source: 'exchange-selector' };
    }

    var symbolOption = closest(target, '#symbol-options .selector__option[data-symbol]');
    if (symbolOption) {
      var optionSymbol = cleanSymbol(symbolOption.getAttribute('data-symbol'));
      return isForexGoldSymbol(optionSymbol) ? { symbol: optionSymbol, source: 'symbol-selector' } : null;
    }

    var typeButton = closest(target, '[data-gp-market-type]');
    if (typeButton) {
      var type = String(typeButton.getAttribute('data-gp-market-type') || '').toLowerCase();
      if (type === 'forex' || type === 'gold') return { symbol: DEFAULT_SYMBOLS[type], source: 'market-type-' + type };
      return null;
    }

    var delegated = closest(target, '.gp-v71-market-btn[data-symbol], .gp-v71-market-symbol-row [data-symbol]');
    if (delegated) {
      var delegatedSymbol = cleanSymbol(delegated.getAttribute('data-symbol'));
      return isForexGoldSymbol(delegatedSymbol) ? { symbol: delegatedSymbol, source: 'market-card-symbol' } : null;
    }
    return null;
  }

  function closeMarketMenus() {
    ['exchange-selector', 'symbol-selector'].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.classList.remove('open');
    });
  }

  function showPendingRequest(request) {
    if (!request || !isForexGoldSymbol(request.symbol)) return;
    var type = request.symbol === 'XAUUSD' ? 'gold' : 'forex';
    var card = document.querySelector('.gp-overview-market--switch, [data-gp-test1-v71-market-selector]');
    if (card) {
      card.classList.add('is-switching');
      card.setAttribute('data-gp-market-pending-symbol', request.symbol);
      card.setAttribute('data-gp-market-pending-type', type);
      card.setAttribute('aria-busy', 'true');
      var strong = card.querySelector('#gp-overview-symbol');
      if (strong) strong.textContent = request.symbol;
      Array.prototype.forEach.call(card.querySelectorAll('[data-gp-market-type]'), function (button) {
        var active = String(button.getAttribute('data-gp-market-type') || '') === type;
        button.classList.toggle('active', active);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    var select = document.getElementById('gp-market-instrument-select');
    if (select) {
      select.setAttribute('data-gp-pending-value', request.symbol);
      var option = select.querySelector('option[value="' + request.symbol + '"]');
      if (option) select.value = request.symbol;
    }
  }

  function finishPendingRequest(request, succeeded) {
    var card = document.querySelector('.gp-overview-market--switch, [data-gp-test1-v71-market-selector]');
    if (card) {
      card.classList.remove('is-switching');
      card.removeAttribute('data-gp-market-pending-symbol');
      card.removeAttribute('data-gp-market-pending-type');
      card.removeAttribute('aria-busy');
    }
    var select = document.getElementById('gp-market-instrument-select');
    if (select) select.removeAttribute('data-gp-pending-value');
    state.requestedPhase = succeeded ? 'complete' : 'failed';
    try {
      var selectorApi = window.GPTest1V71MarketSelectorSafe;
      if (selectorApi && typeof selectorApi.sync === 'function') selectorApi.sync();
    } catch (_) {}
    publish(succeeded ? 'switch-complete' : 'switch-failed', {
      phase: state.requestedPhase,
      pending: false,
      exchange: 'forexgold',
      symbol: request && request.symbol || '',
      context: state.requestedContext
    });
  }

  function emitQuickSwitch(request, phase) {
    phase = String(phase || 'complete');
    try {
      window.dispatchEvent(new CustomEvent('guardeer:market-quick-switch', {
        detail: {
          exchange: 'forexgold',
          symbol: request.symbol,
          type: request.symbol === 'XAUUSD' ? 'gold' : 'forex',
          source: request.source,
          phase: phase,
          pending: phase === 'start',
          context: ['forexgold', request.symbol, runtimeMarket().timeframe].join(':'),
          stabilityVersion: VERSION
        }
      }));
    } catch (_) {}
  }

  async function executeDelegatedSwitch(request) {
    if (!request || !isForexGoldSymbol(request.symbol)) return false;
    var rt = normalizeRuntime();
    if (!rt || typeof rt.switchMarket !== 'function') {
      rememberFailure('runtime-unavailable', {}, true);
      return false;
    }
    patchRuntime(rt);
    if (switchBusy) {
      queuedSwitch = request;
      showPendingRequest(request);
      beginLoad('delegated-queued-' + request.source, request);
      emitQuickSwitch(request, 'start');
      publish('switch-queued', {
        phase: 'start',
        pending: true,
        symbol: request.symbol,
        source: request.source,
        context: state.requestedContext
      });
      return true;
    }

    switchBusy = true;
    state.delegatedSwitchCount += 1;
    state.lastDelegatedSource = request.source;
    showPendingRequest(request);
    beginLoad('delegated-' + request.source, request);
    emitQuickSwitch(request, 'start');
    var succeeded = false;
    try {
      var market = runtimeMarket(rt);
      if (market.exchange !== 'forexgold' || market.symbol !== request.symbol) {
        delegatedSwitchInvocation = request;
        await rt.switchMarket(request.symbol);
      }
      succeeded = true;
      emitQuickSwitch(request, 'complete');
      window.setTimeout(function () {
        var committed = hasCommittedVerifiedHistory(rt);
        state.committedVerifiedHistory = committed;
        if (committed) clearFailure('delegated-switch-verified');
      }, 0);
      return true;
    } catch (error) {
      rememberFailure('market-switch-failed', { error: String(error && error.message || error || '') }, true);
      return false;
    } finally {
      delegatedSwitchInvocation = null;
      switchBusy = false;
      var next = queuedSwitch;
      queuedSwitch = null;
      if (next && next.symbol !== request.symbol) {
        publish(succeeded ? 'switch-complete' : 'switch-failed', {
          phase: succeeded ? 'complete' : 'failed',
          pending: false,
          exchange: 'forexgold',
          symbol: request.symbol,
          context: ['forexgold', request.symbol, runtimeMarket(rt).timeframe].join(':')
        });
        window.setTimeout(function () { executeDelegatedSwitch(next); }, 0);
      } else {
        finishPendingRequest(request, succeeded);
      }
    }
  }

  function onDelegatedMarketControl(event) {
    if (event.type === 'click' && Number(event.button || 0) !== 0) return;
    var request = requestFromTarget(event.target, event.type);
    if (!request) return;

    var rt = normalizeRuntime();
    if (!rt || typeof rt.switchMarket !== 'function') {
      patchRuntime(rt);
      return;
    }

    // Capture only Forex/Gold controls. Crypto and every other selector retain
    // their original listeners and behavior unchanged.
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMarketMenus();
    executeDelegatedSwitch(request);
  }

  function installDelegation() {
    if (state.selectorDelegated) return;
    document.addEventListener('click', onDelegatedMarketControl, true);
    document.addEventListener('change', onDelegatedMarketControl, true);
    state.selectorDelegated = true;
  }

  function fmpHistoricalRequest(input) {
    var raw = '';
    try { raw = typeof input === 'string' ? input : input && input.url || ''; } catch (_) {}
    if (!raw) return null;
    try {
      var url = new URL(String(raw), window.location.href);
      var host = String(url.hostname || '').toLowerCase();
      var path = String(url.pathname || '').replace(/\/{2,}/g, '/').toLowerCase();
      var symbol = cleanSymbol(url.searchParams.get('symbol'));
      if (host !== 'financialmodelingprep.com' && host !== 'www.financialmodelingprep.com') return null;
      if (!/^\/stable\/(?:historical-chart\/[^/]+|historical-price-eod\/full)\/?$/.test(path)) return null;
      if (!isForexGoldSymbol(symbol)) return null;
      path = path.replace(/\/$/, '');
      return { kind: 'historical', path: path, symbol: symbol, key: 'historical:' + path + '?symbol=' + symbol };
    } catch (_) {
      return null;
    }
  }

  function fmpQuoteRequest(input) {
    var raw = '';
    try { raw = typeof input === 'string' ? input : input && input.url || ''; } catch (_) {}
    if (!raw) return null;
    try {
      var url = new URL(String(raw), window.location.href);
      var host = String(url.hostname || '').toLowerCase();
      var path = String(url.pathname || '').replace(/\/{2,}/g, '/').toLowerCase().replace(/\/$/, '');
      var symbol = cleanSymbol(url.searchParams.get('symbol'));
      if (host !== 'financialmodelingprep.com' && host !== 'www.financialmodelingprep.com') return null;
      if (path !== '/stable/quote-short' || !isForexGoldSymbol(symbol)) return null;
      return { kind: 'quote', path: path, symbol: symbol, key: 'quote:' + path + '?symbol=' + symbol };
    } catch (_) {
      return null;
    }
  }

  function requestMethod(input, init) {
    try {
      var requestMethodValue = typeof Request !== 'undefined' && input instanceof Request ? input.method : '';
      return String(init && init.method || requestMethodValue || 'GET').toUpperCase();
    } catch (_) {
      return 'GET';
    }
  }

  function requestSignal(input, init) {
    try {
      if (init && init.signal) return init.signal;
      if (typeof Request !== 'undefined' && input instanceof Request) return input.signal;
    } catch (_) {}
    return null;
  }

  function abortError() {
    try { return new DOMException('The operation was aborted.', 'AbortError'); }
    catch (_) {
      var error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      return error;
    }
  }

  function local402(entry) {
    var body = JSON.stringify({
      status: 'error',
      code: entry && entry.kind === 'quote' ? 'FMP_QUOTE_CAPABILITY_402' : 'FMP_HISTORICAL_CAPABILITY_402',
      message: entry && entry.kind === 'quote'
        ? 'Quote access is unavailable for this market; continue to the next provider.'
        : 'Historical access is unavailable for this reviewed market; continue to the next provider.'
    });
    return new Response(body, {
      status: 402,
      statusText: 'Payment Required',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-guardeer-negative-capability-cache': entry && entry.kind === 'quote' ? 'fmp-quote-402' : 'fmp-historical-402'
      }
    });
  }

  function openHistorical402Breaker(requestInfo) {
    var now = Date.now();
    breakers.set(requestInfo.key, {
      kind: requestInfo.kind,
      path: requestInfo.path,
      symbol: requestInfo.symbol,
      openedAt: now,
      expiresAt: now + BREAKER_TTL_MS,
      localHits: 0
    });
    if (requestInfo.kind === 'quote') state.actualFmpQuote402Count += 1;
    else state.actualFmpHistorical402Count += 1;
    state.lastProviderCapability = requestInfo.kind === 'quote' ? 'fmp-quote-capability-402' : 'fmp-historical-capability-402';
    state.lastProviderCapabilityAt = now;
    publish('fmp-historical-breaker-opened', {
      path: requestInfo.path,
      symbol: requestInfo.symbol,
      key: requestInfo.key,
      status: 402,
      expiresAt: now + BREAKER_TTL_MS
    });
  }

  function installHistorical402CircuitBreaker() {
    if (!window.fetch || window.fetch.__gpForexGoldHistorical402BreakerV1) return false;
    var originalFetch = window.fetch.bind(window);
    var wrappedFetch = function (input, init) {
      var requestInfo = fmpHistoricalRequest(input) || fmpQuoteRequest(input);
      if (!requestInfo || requestMethod(input, init) !== 'GET') return originalFetch(input, init);

      var signal = requestSignal(input, init);
      if (signal && signal.aborted) return Promise.reject(abortError());
      var entry = breakers.get(requestInfo.key);
      var now = Date.now();
      if (entry && entry.expiresAt > now) {
        entry.localHits = Number(entry.localHits || 0) + 1;
        if (requestInfo.kind === 'quote') state.localFmpQuote402Count += 1;
        else state.localFmpHistorical402Count += 1;
        publish('fmp-historical-breaker-hit', {
          path: requestInfo.path,
          symbol: requestInfo.symbol,
          key: requestInfo.key,
          status: 402,
          expiresAt: entry.expiresAt
        });
        return Promise.resolve(local402(entry));
      }
      if (entry) breakers.delete(requestInfo.key);

      return originalFetch(input, init).then(function (response) {
        if (!response || Number(response.status) !== 402) return response;
        // A later wrapper/rebind can place this guard around an older instance.
        // Only a provider/proxy response may open a new breaker; a local 402
        // from the older guard remains local and must not be counted as real.
        if (response.headers && /^fmp-(?:historical|quote)-402$/.test(String(response.headers.get('x-guardeer-negative-capability-cache') || ''))) return response;
        openHistorical402Breaker(requestInfo);
        return response;
      });
    };
    wrappedFetch.__gpForexGoldHistorical402BreakerV1 = true;
    wrappedFetch.__gpOriginal = originalFetch;
    window.fetch = wrappedFetch;
    return true;
  }

  function toastNodes(root) {
    var nodes = [];
    if (!root) return nodes;
    if (root.nodeType === 1 && root.matches && root.matches('.toast')) nodes.push(root);
    if (root.querySelectorAll) {
      Array.prototype.push.apply(nodes, root.querySelectorAll('.toast'));
    }
    return nodes;
  }

  function inspectToast(root) {
    toastNodes(root).forEach(function (toast) {
      var text = String(toast.textContent || '').trim();
      if (sessionClosed() && (/^Data loading error$/i.test(text) || /Forex\/Gold feed blocked/i.test(text))) {
        toast.setAttribute('data-gp-forexgold-closed-toast-suppressed', VERSION);
        if (typeof toast.remove === 'function') toast.remove();
        return;
      }
      if (/loaded from Forex\s*\/\s*Gold feed/i.test(text)) {
        if (!hasCommittedVerifiedHistory()) {
          state.blockedFalseSuccessCount += 1;
          toast.setAttribute('data-gp-forexgold-false-success-blocked', VERSION);
          if (typeof toast.remove === 'function') toast.remove();
          publish('false-success-blocked');
          return;
        }
        state.phase = 'verified';
        state.committedVerifiedHistory = true;
        return;
      }
      if (/^Data loading error$/i.test(text) && isForexGoldRuntime() && !hasCommittedVerifiedHistory()) {
        var failure = currentFailure();
        var exact = exactFailureText(failure.code, failure.detail);
        var span = toast.querySelector && toast.querySelector('span');
        if (span) span.textContent = exact;
        else toast.textContent = exact;
        toast.setAttribute('data-gp-forexgold-exact-error', failure.code);
        state.replacedGenericErrorCount += 1;
        rememberFailure(failure.code, failure.detail, false);
      }
    });
  }

  function installToastGuard() {
    if (toastObserver || typeof MutationObserver !== 'function') return;
    var root = document.documentElement || document.body;
    if (!root) return;
    inspectToast(document);
    toastObserver = new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes || [], inspectToast);
      });
    });
    toastObserver.observe(root, { childList: true, subtree: true });
  }

  function detailMatchesRuntimeMarket(detail) {
    var market = runtimeMarket();
    var explicit = String(detail && detail.context || '');
    var expectedIntegrity = [market.symbol, market.exchange, market.timeframe].join('|');
    if (explicit && explicit !== contextKey() && explicit !== expectedIntegrity) return false;
    if (detail && detail.symbol && cleanSymbol(detail.symbol) !== market.symbol) return false;
    if (detail && detail.timeframe && String(detail.timeframe) !== market.timeframe) return false;
    if (detail && detail.exchange && String(detail.exchange).toLowerCase() !== market.exchange) return false;
    return true;
  }

  function onIntegrity(event) {
    var detail = event && event.detail || {};
    if (!isForexGoldRuntime() || !detailMatchesRuntimeMarket(detail)) return;
    var kind = String(detail.state || '').toLowerCase();
    if (kind === 'verified') {
      window.setTimeout(function () {
        if (hasCommittedVerifiedHistory()) clearFailure('integrity-verified');
      }, 0);
      return;
    }
    if (kind === 'rejected') {
      rememberFailure(String(detail.reason || 'verified-history-not-committed'), detail, !sessionClosed());
      return;
    }
    if (kind === 'quote-unavailable') {
      state.lastFailureCode = 'quote-unavailable';
      state.lastFailureDetail = compactFailureDetail(detail);
      state.lastFailureReason = exactFailureText('quote-unavailable', detail);
      state.lastFailureAt = Date.now();
    }
  }

  function onMarketState(event) {
    var detail = event && event.detail || {};
    var market = runtimeMarket();
    if (!detailMatchesRuntimeMarket(detail)) return;
    var exchange = String(detail.exchange || market.exchange || '').toLowerCase();
    if (exchange !== 'forexgold') return;
    state.lastMarketState = String(detail.state || '');
    state.lastMarketReason = String(detail.reason || '');
    if (state.lastMarketState === 'closed') {
      state.phase = 'closed';
      publish('market-state', { marketState: state.lastMarketState, marketReason: state.lastMarketReason });
      return;
    }
    if (state.lastMarketState === 'loading') state.phase = 'loading';
    // A settled failure is not an active loader. Keeping phase=loading here
    // makes the live-feed watchdog refuse recovery after the request is gone.
    if (/^(?:stale|error|failed|offline)$/.test(state.lastMarketState) &&
        !refreshPromise && !switchBusy && !window.__gpPendingForexTimeframeTxnR390) {
      state.phase = 'blocked';
      if (state.requestedContext === contextKey() && state.requestedPhase === 'start') state.requestedPhase = 'failed';
    }
    if (state.lastMarketState === 'live' && hasCommittedVerifiedHistory()) {
      state.phase = 'verified';
      state.committedVerifiedHistory = true;
      if (state.requestedContext === contextKey()) state.requestedPhase = 'complete';
    }
    publish('market-state', { marketState: state.lastMarketState, marketReason: state.lastMarketReason });
  }

  function boot() {
    installDelegation();
    installToastGuard();
    installHistorical402CircuitBreaker();
    patchRuntime(window.GuardeerPrimeRuntime);
    state.phase = hasCommittedVerifiedHistory() ? 'verified' : 'idle';
    publish('ready');
  }

  window.addEventListener('guardeer:prime-runtime-ready', function (event) {
    patchRuntime(event && event.detail);
    window.setTimeout(function () { inspectToast(document); }, 0);
  }, { passive: true });
  window.addEventListener('guardeer:forexgold-feed-integrity', onIntegrity, { passive: true });
  window.addEventListener('guardeer:market-data-state', onMarketState, { passive: true });
  ['guardeer:market-quick-switch', 'guardeer:open-dashboard-chart', 'guardeer:terminal-visibility-changed'].forEach(function (name) {
    window.addEventListener(name, function () {
      patchRuntime(window.GuardeerPrimeRuntime);
      window.setTimeout(function () { inspectToast(document); }, 0);
    }, { passive: true });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.GPForexGoldRuntimeStabilityV1 = {
    version: VERSION,
    status: publicStatus,
    rebind: function () {
      installDelegation();
      installToastGuard();
      installHistorical402CircuitBreaker();
      return patchRuntime(window.GuardeerPrimeRuntime);
    },
    hasCommittedVerifiedHistory: hasCommittedVerifiedHistory
  };
})();
