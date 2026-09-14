(function () {
  'use strict';

  if (window.__GP_CRYPTO_CHART_PAN_PERFORMANCE_V177__) return;
  window.__GP_CRYPTO_CHART_PAN_PERFORMANCE_V177__ = true;

  var VERSION = 'v282-idempotent-pan-governor';
  var INTERACTION_SELECTOR = '#chart-area,.chart-area,.chart-container,.tv-lightweight-charts,#gp-prime-walls-overlay,#gp-footprint-chart-v1';
  var state = {
    interactingUntil: 0,
    lastPanOptionsAt: 0,
    bindCount: 0,
    bindTimer: 0,
    bindQueuedAt: 0,
    lastBindAt: 0,
    panChart: null,
    boundRuntime: null,
    interactionSubscribers: []
  };

  function now() { return Date.now(); }
  function isInteracting() { return now() < state.interactingUntil; }
  function markInteraction(ms) {
    var duration = ms || 450;
    var until = Math.max(state.interactingUntil, now() + duration);
    if (until === state.interactingUntil) return;
    state.interactingUntil = until;
    state.interactionSubscribers.slice().forEach(function (subscriber) {
      try { subscriber(until, duration); } catch (_) {}
    });
  }

  function onInteraction(subscriber) {
    if (typeof subscriber !== 'function') return function () {};
    if (state.interactionSubscribers.indexOf(subscriber) < 0) state.interactionSubscribers.push(subscriber);
    return function () {
      var index = state.interactionSubscribers.indexOf(subscriber);
      if (index >= 0) state.interactionSubscribers.splice(index, 1);
    };
  }

  function alreadyGoverned(fn) {
    return !!(fn && (fn.__gpPanGovernorWrapped || fn.__gpV177Wrapped || fn.__gpV202Wrapped));
  }

  function runtime() {
    try {
      return window.GuardeerPrimeRuntime && (window.GuardeerPrimeRuntime.runtime || window.GuardeerPrimeRuntime);
    } catch (_) { return null; }
  }

  function chartApi(rt) {
    try {
      var wrapper = rt && rt.chart;
      if (!wrapper) return null;
      if (typeof wrapper.getChartInstance === 'function') return wrapper.getChartInstance();
      return wrapper.chart || wrapper;
    } catch (_) { return null; }
  }

  function applyPanFriendlyOptions() {
    var rt = runtime();
    var chart = chartApi(rt);
    if (!chart) return false;
    if (state.panChart === chart) return true;
    try {
      if (typeof chart.applyOptions === 'function') {
        chart.applyOptions({
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true
          },
          handleScale: {
            axisPressedMouseMove: { time: true, price: true },
            axisDoubleClickReset: { time: true, price: true },
            mouseWheel: true,
            pinch: true
          }
        });
      }
      if (chart.timeScale && typeof chart.timeScale === 'function') {
        chart.timeScale().applyOptions({
          fixLeftEdge: false,
          fixRightEdge: false,
          rightBarStaysOnScroll: false,
          shiftVisibleRangeOnNewBar: false,
          lockVisibleTimeRangeOnResize: false
        });
      }
      state.panChart = chart;
      state.lastPanOptionsAt = now();
      return true;
    } catch (_) {
      return false;
    }
  }

  function candleSignature(args) {
    var list = args && args[0];
    if (!Array.isArray(list) || !list.length) return 'empty';
    var last = list[list.length - 1] || {};
    return [
      list.length,
      Number(last.time || 0),
      Number(last.open || 0),
      Number(last.high || 0),
      Number(last.low || 0),
      Number(last.close || 0),
      Number(last.volume || 0)
    ].join('|');
  }

  function wrapThrottle(obj, methodName, minMs, interactionMs) {
    if (!obj || typeof obj[methodName] !== 'function') return false;
    if (alreadyGoverned(obj[methodName])) return true;

    var original = obj[methodName];
    var lastAt = 0;
    var lastSig = '';
    var pendingArgs = null;
    var pendingThis = null;
    var timer = 0;
    var running = false;

    function flush() {
      var args = pendingArgs;
      var ctx = pendingThis || obj;
      pendingArgs = null;
      pendingThis = null;
      timer = 0;
      if (!args) return;
      running = true;
      try {
        lastAt = now();
        lastSig = candleSignature(args);
        return original.apply(ctx, args);
      } catch (err) {
        try { console.warn('[gp-v177] delayed overlay update failed:', methodName, err); } catch (_) {}
      } finally {
        running = false;
      }
    }

    function wrapped() {
      if (running) return original.apply(this, arguments);
      var t = now();
      var args = Array.prototype.slice.call(arguments);
      var sig = candleSignature(args);
      var baseDelay = isInteracting() ? (interactionMs || Math.max(minMs, 350)) : Math.max(0, minMs - (t - lastAt));

      // Live crypto often sends the same latest candle many times per second. Avoid rebuilding full overlays for duplicates.
      if (sig === lastSig && t - lastAt < Math.max(minMs * 2, 600)) return;

      if (baseDelay > 0) {
        pendingArgs = args;
        pendingThis = this;
        if (!timer) timer = setTimeout(flush, baseDelay);
        return;
      }

      running = true;
      try {
        lastAt = t;
        lastSig = sig;
        return original.apply(this, args);
      } finally {
        running = false;
      }
    }

    wrapped.__gpV177Wrapped = true;
    wrapped.__gpPanGovernorWrapped = true;
    wrapped.__gpOriginal = original;
    obj[methodName] = wrapped;
    return true;
  }

  function patchBubbles(bubbles) {
    if (!bubbles) return;
    wrapThrottle(bubbles, 'setCandleData', 650, 450);
    wrapThrottle(bubbles, 'setOptions', 250, 250);
    if (typeof bubbles._render === 'function' && !alreadyGoverned(bubbles._render)) {
      var originalRender = bubbles._render;
      var renderTimer = 0;
      var wrappedRender = function () {
        if (isInteracting()) {
          if (!renderTimer) {
            renderTimer = setTimeout(function () {
              renderTimer = 0;
              try { originalRender.call(bubbles); } catch (_) {}
            }, 280);
          }
          return;
        }
        return originalRender.apply(this, arguments);
      };
      wrappedRender.__gpV177Wrapped = true;
      wrappedRender.__gpPanGovernorWrapped = true;
      wrappedRender.__gpOriginal = originalRender;
      bubbles._render = wrappedRender;
    }
  }

  function patchHeatmap(heatmap) {
    if (!heatmap) return;
    wrapThrottle(heatmap, 'setCandleData', 900, 500);
    wrapThrottle(heatmap, 'update', 250, 250);
  }

  function patchVolumeProfile(volumeProfile) {
    if (!volumeProfile) return;
    wrapThrottle(volumeProfile, 'update', 500, 350);
  }

  function patchPrimeFlowSeries(chartWrapper) {
    if (!chartWrapper || typeof chartWrapper._syncPrimeFlowSeries !== 'function') return;
    if (alreadyGoverned(chartWrapper._syncPrimeFlowSeries)) return;
    var original = chartWrapper._syncPrimeFlowSeries;
    var lastAt = 0;
    var timer = 0;
    var wrapped = function () {
      var ctx = this;
      var t = now();
      var minMs = isInteracting() ? 500 : 220;
      if (t - lastAt < minMs) {
        if (!timer) {
          timer = setTimeout(function () {
            timer = 0;
            lastAt = now();
            try { original.call(ctx); } catch (_) {}
          }, minMs - (t - lastAt));
        }
        return;
      }
      lastAt = t;
      return original.apply(this, arguments);
    };
    wrapped.__gpV177Wrapped = true;
    wrapped.__gpPanGovernorWrapped = true;
    wrapped.__gpOriginal = original;
    chartWrapper._syncPrimeFlowSeries = wrapped;
  }

  function scheduleBind(delay) {
    delay = Math.max(0, Number(delay) || 0);
    var dueAt = now() + delay;
    if (state.bindTimer) {
      if (state.bindQueuedAt && state.bindQueuedAt <= dueAt + 20) return;
      clearTimeout(state.bindTimer);
      state.bindTimer = 0;
    }
    state.bindQueuedAt = dueAt;
    state.bindTimer = setTimeout(function () {
      state.bindTimer = 0;
      state.bindQueuedAt = 0;
      var since = now() - state.lastBindAt;
      if (since < 350) { scheduleBind(350 - since); return; }
      bind();
    }, delay);
  }

  function bind() {
    var rt = runtime();
    if (!rt) return false;
    state.lastBindAt = now();
    state.boundRuntime = rt;
    applyPanFriendlyOptions();
    try { patchBubbles(rt.bubbles || rt.orderFlowBubbles); } catch (_) {}
    try { patchHeatmap(rt.heatmap || rt.orderFlowHeatmap); } catch (_) {}
    try { patchVolumeProfile(rt.volumeProfile); } catch (_) {}
    try { patchPrimeFlowSeries(rt.chart); } catch (_) {}
    state.bindCount += 1;
    return true;
  }

  function runtimeWasReplaced() {
    var rt = runtime();
    if (!rt) return false;
    return rt !== state.boundRuntime || chartApi(rt) !== state.panChart;
  }

  function boot() {
    var pointerEvents = typeof window.PointerEvent !== 'undefined';
    var startEvents = pointerEvents ? ['pointerdown'] : ['mousedown', 'touchstart'];
    var moveEvents = pointerEvents ? ['pointermove', 'wheel'] : ['mousemove', 'touchmove', 'wheel'];
    var endEvents = pointerEvents ? ['pointerup', 'pointercancel'] : ['mouseup', 'touchend', 'touchcancel'];
    startEvents.forEach(function (eventName) {
      document.addEventListener(eventName, function (event) {
        if (event.target && event.target.closest && event.target.closest(INTERACTION_SELECTOR)) {
          markInteraction(750);
          applyPanFriendlyOptions();
        }
      }, { capture: true, passive: true });
    });

    moveEvents.forEach(function (eventName) {
      document.addEventListener(eventName, function (event) {
        var realInteraction = eventName === 'wheel' || eventName === 'touchmove' || Number(event.buttons || 0) !== 0;
        if (realInteraction && event.target && event.target.closest && event.target.closest(INTERACTION_SELECTOR)) {
          markInteraction(eventName === 'wheel' ? 650 : 450);
        }
      }, { capture: true, passive: true });
    });

    endEvents.forEach(function (eventName) {
      document.addEventListener(eventName, function () { markInteraction(220); }, { capture: true, passive: true });
    });

    window.addEventListener('guardeer:prime-runtime-ready', function () {
      scheduleBind(0);
      setTimeout(function () { scheduleBind(0); }, 250);
      setTimeout(function () { scheduleBind(0); }, 800);
    }, { passive: true });
    window.addEventListener('guardeer:market-quick-switch', function () { scheduleBind(150); }, { passive: true });
    ['guardeer:forexgold-live-tick', 'guardeer:orderbook-live-tick'].forEach(function (name) {
      window.addEventListener(name, function () { if (runtimeWasReplaced()) scheduleBind(120); }, { passive: true });
    });
    ['guardeer:tool-state-change', 'guardeer:reconnect'].forEach(function (name) {
      window.addEventListener(name, function () { scheduleBind(120); }, { passive: true });
    });
    window.addEventListener('online', function () { scheduleBind(120); }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleBind(120);
    }, { passive: true });

    bind();
    // A slow visible-page watchdog covers runtimes replaced without a lifecycle
    // event. It also services the companion terminal guard without a second poll.
    setInterval(function () {
      if (document.hidden) return;
      if (runtimeWasReplaced() || now() - state.lastBindAt > 7500) bind();
      try {
        if (window.GPTerminalSmoothGuardV202 && typeof window.GPTerminalSmoothGuardV202.bind === 'function') {
          window.GPTerminalSmoothGuardV202.bind();
        }
      } catch (_) {}
    }, 8000);
  }

  window.GPCryptoChartSmoothPanV177 = {
    version: VERSION,
    bind: bind,
    applyPanFriendlyOptions: applyPanFriendlyOptions,
    isInteracting: isInteracting,
    markInteraction: markInteraction,
    onInteraction: onInteraction,
    hasSharedWatchdog: true
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

(function () {
  'use strict';

  if (window.__GP_PRIME_INDICATOR_MODAL_SYNC_V203__) return;
  window.__GP_PRIME_INDICATOR_MODAL_SYNC_V203__ = true;

  var VERSION = 'v203-prime-modal-active-chart-sync';

  function runtime() {
    try { return window.GuardeerPrimeRuntime && (window.GuardeerPrimeRuntime.runtime || window.GuardeerPrimeRuntime); }
    catch (_) { return null; }
  }

  function normSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function normTimeframe(value) {
    return String(value || '').trim().toLowerCase();
  }

  function activeSymbol() {
    try {
      var rt = runtime();
      var value = rt && rt.state && rt.state.symbol;
      if (value) return normSymbol(value);
      var label = document.querySelector('#symbol-label,[data-symbol-label],.symbol-display');
      return normSymbol(label && label.textContent || 'XAUUSD');
    } catch (_) {
      return 'XAUUSD';
    }
  }

  function activeTimeframe() {
    try {
      var rt = runtime();
      var value = rt && rt.state && rt.state.timeframe;
      if (value) return normTimeframe(value);
      var select = document.querySelector('#timeframe-select,#header-timeframe-select,[data-timeframe-select]');
      return normTimeframe(select && select.value || '5m');
    } catch (_) {
      return '5m';
    }
  }

  function setSelectToOption(select, wanted, normalizer) {
    if (!select || !wanted) return false;
    var options = Array.prototype.slice.call(select.options || []);
    var match = options.find(function (option) { return normalizer(option.value) === wanted; });
    if (!match || select.value === match.value) return false;
    select.value = match.value;
    return true;
  }

  function syncPrimeModal(modal) {
    if (!modal || modal.dataset.gpPrimeModalSyncedV203 === 'true') return;
    var symbolSelect = modal.querySelector('[data-prime-symbol]');
    var timeframeSelect = modal.querySelector('[data-prime-timeframe]');
    if (!symbolSelect || !timeframeSelect) return;

    modal.dataset.gpPrimeModalSyncedV203 = 'true';
    var changed = false;
    changed = setSelectToOption(symbolSelect, activeSymbol(), normSymbol) || changed;
    changed = setSelectToOption(timeframeSelect, activeTimeframe(), normTimeframe) || changed;

    if (changed) {
      setTimeout(function () {
        try {
          var analyze = modal.querySelector('[data-prime-analyze]');
          if (analyze && document.body.contains(modal)) analyze.click();
        } catch (_) {}
      }, 80);
    }
  }

  function boot() {
    var observer = new MutationObserver(function () {
      syncPrimeModal(document.getElementById('prime-indicator-modal'));
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('#prime-indicator-btn,[data-mobile-prime-indicator]')) {
        setTimeout(function () { syncPrimeModal(document.getElementById('prime-indicator-modal')); }, 80);
        setTimeout(function () { syncPrimeModal(document.getElementById('prime-indicator-modal')); }, 240);
      }
    }, true);
    syncPrimeModal(document.getElementById('prime-indicator-modal'));
  }

  window.GPPrimeIndicatorModalSyncV203 = {
    version: VERSION,
    sync: function () { syncPrimeModal(document.getElementById('prime-indicator-modal')); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

(function () {
  'use strict';

  if (window.__GP_TERMINAL_SMOOTH_V202__) return;
  window.__GP_TERMINAL_SMOOTH_V202__ = true;

  var VERSION = 'r407-context-bound-deferred-candles';
  var STYLE_ID = 'gp-terminal-smooth-v202-style';
  var state = {
    interactingUntil: 0,
    degradedUntil: 0,
    lastBindAt: 0,
    bindTimer: 0,
    lastNetworkHintAt: 0,
    lastInteractionEventAt: 0,
    classTimer: 0,
    classTimerDueAt: 0,
    classKey: '',
    longTaskObserver: null
  };

  function now() { return Date.now(); }
  function isHidden() { return !!document.hidden; }
  function isInteracting() { return now() < state.interactingUntil; }
  function isDegraded() { return now() < state.degradedUntil; }
  function isStressed() { return isHidden() || isInteracting() || isDegraded(); }

  function syncClasses() {
    if (!document.body) return;
    var interacting = isInteracting();
    var degraded = isDegraded();
    var hidden = isHidden();
    var key = [interacting ? 1 : 0, degraded ? 1 : 0, hidden ? 1 : 0].join('|');
    if (key === state.classKey) return;
    state.classKey = key;
    document.body.classList.toggle('gp-terminal-interacting-v202', interacting);
    document.body.classList.toggle('gp-terminal-degraded-v202', degraded);
    document.body.classList.toggle('gp-terminal-background-v202', hidden);
  }

  function armClassExpiry() {
    var t = now();
    var dueAt = Infinity;
    if (state.interactingUntil > t) dueAt = Math.min(dueAt, state.interactingUntil);
    if (state.degradedUntil > t) dueAt = Math.min(dueAt, state.degradedUntil);
    if (dueAt === Infinity) {
      if (state.classTimer) clearTimeout(state.classTimer);
      state.classTimer = 0;
      state.classTimerDueAt = 0;
      return;
    }
    if (state.classTimer && state.classTimerDueAt <= dueAt + 20) return;
    if (state.classTimer) clearTimeout(state.classTimer);
    state.classTimerDueAt = dueAt;
    state.classTimer = setTimeout(function () {
      state.classTimer = 0;
      state.classTimerDueAt = 0;
      syncClasses();
      armClassExpiry();
    }, Math.max(30, dueAt - t + 24));
  }

  function updateInteraction(until, ms) {
    var t = now();
    var wasInteracting = isInteracting();
    var gap = state.lastInteractionEventAt ? t - state.lastInteractionEventAt : 0;
    state.lastInteractionEventAt = t;
    state.interactingUntil = Math.max(state.interactingUntil, Number(until || 0), t + (ms || 700));
    try { window.__gpChartPanActiveUntil = state.interactingUntil; } catch (_) {}
    if (!wasInteracting) syncClasses();
    armClassExpiry();
    // Continuous input events provide a cheap jank signal without a permanent RAF.
    if (gap > 120 && gap < 450) markDegraded(gap > 240 ? 4200 : 2600);
  }

  function markInteraction(ms) {
    updateInteraction(0, ms || 700);
  }

  function markDegraded(ms) {
    var wasDegraded = isDegraded();
    state.degradedUntil = Math.max(state.degradedUntil, now() + (ms || 4500));
    if (!wasDegraded) syncClasses();
    armClassExpiry();
  }

  function originOf(value) {
    try {
      if (!/^https?:\/\//i.test(String(value || ''))) return '';
      return new URL(String(value)).origin;
    } catch (_) { return ''; }
  }

  function addLink(rel, href, cross) {
    if (!document.head || !href) return;
    var links = document.head.querySelectorAll('link[rel="' + rel + '"]');
    for (var i = 0; i < links.length; i += 1) {
      if (links[i].href === href || links[i].getAttribute('href') === href) return;
    }
    var link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (cross) link.crossOrigin = '';
    document.head.appendChild(link);
  }

  function addNetworkHints() {
    var t = now();
    if (t - state.lastNetworkHintAt < 3000) return;
    state.lastNetworkHintAt = t;
    var cfg = window.GUARDEER_CONFIG || {};
    var urls = [
      cfg.PRIME_ACCESS_API_BASE_URL,
      cfg.PRIME_ADMIN_API_BASE_URL,
      cfg.ADMIN_API_BASE_URL,
      cfg.ACCESS_API_BASE_URL,
      cfg.PRIME_CHECK_ACCESS_URL,
      cfg.CHECK_ACCESS_URL,
      cfg.NOWPAYMENTS_CREATE_INVOICE_URL,
      cfg.NOWPAYMENTS_PAYMENT_STATUS_URL,
      cfg.PRIME_FXBOOK_API_BASE_URL,
      'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com',
      'https://uhhkpq9fb1.execute-api.ap-southeast-2.amazonaws.com',
      'https://ap-southeast-2pjp7vw9m4.auth.ap-southeast-2.amazoncognito.com',
      'https://cognito-idp.ap-southeast-2.amazonaws.com'
    ];
    var seen = {};
    urls.forEach(function (url) {
      var origin = originOf(url);
      if (!origin || seen[origin]) return;
      seen[origin] = true;
      addLink('preconnect', origin, true);
      addLink('dns-prefetch', '//' + origin.replace(/^https?:\/\//i, ''), false);
    });
  }

  function injectStyles() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#chart-area,.chart-area,.chart-container{overscroll-behavior:contain;}',
      '#chart-area,.chart-area,.chart-container,#orderflow-panel{contain:layout paint;}',
      'body.gp-terminal-interacting-v202 #chart-area .volume-bubbles-canvas,body.gp-terminal-interacting-v202 #chart-area .atas-bubbles-canvas{transition:none!important;will-change:transform;}',
      'body.gp-terminal-interacting-v202 #chart-area .gp-orderflow-surface-bg-v138,body.gp-terminal-degraded-v202 #chart-area .gp-orderflow-surface-bg-v138{transition:none!important;}',
      'body.gp-terminal-degraded-v202 #chart-area .heatmap-canvas,body.gp-terminal-degraded-v202 #chart-area .atas-heatmap-canvas{display:none!important;visibility:hidden!important;opacity:0!important;}',
      'body.gp-terminal-degraded-v202 #chart-area .volume-profile-overlay,body.gp-terminal-degraded-v202 #chart-area .session-volume-profile,body.gp-terminal-degraded-v202 #chart-area .vpvr-canvas{opacity:.35!important;pointer-events:none!important;transition:none!important;}',
      'body.gp-terminal-background-v202 #chart-area .heatmap-canvas,body.gp-terminal-background-v202 #chart-area .atas-heatmap-canvas,body.gp-terminal-background-v202 #chart-area .volume-bubbles-canvas,body.gp-terminal-background-v202 #chart-area .atas-bubbles-canvas{transition:none!important;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function runtime() {
    try { return window.GuardeerPrimeRuntime && (window.GuardeerPrimeRuntime.runtime || window.GuardeerPrimeRuntime); }
    catch (_) { return null; }
  }

  function signature(args) {
    var first = args && args[0];
    if (Array.isArray(first)) {
      var last = first[first.length - 1] || {};
      return [first.length, Number(last.time || 0), Number(last.open || 0), Number(last.high || 0), Number(last.low || 0), Number(last.close || 0), Number(last.volume || 0)].join('|');
    }
    if (first && typeof first === 'object') {
      var bids = Array.isArray(first.bids) ? first.bids.length : 0;
      var asks = Array.isArray(first.asks) ? first.asks.length : 0;
      if (bids || asks) return [bids, asks, Number(args && args[1] || 0)].join('|');
      try {
        return Object.keys(first).sort().slice(0, 18).map(function (key) {
          var value = first[key];
          return key + ':' + (value && typeof value === 'object' ? 'object' : String(value));
        }).join('|');
      } catch (_) { return 'object'; }
    }
    return String(args && args.length || 0) + ':' + String(first);
  }

  function alreadyGoverned(fn) {
    return !!(fn && (fn.__gpPanGovernorWrapped || fn.__gpV177Wrapped || fn.__gpV202Wrapped));
  }

  function deferredChartContext(obj, owner) {
    var rt = runtime() || owner.runtime;
    if (!rt || (rt.chart || rt.chartWrapper) !== obj) return null;
    var market = rt.state || {};
    return {
      runtime: rt,
      key: [String(market.exchange || '').toLowerCase(), String(market.symbol || '').toUpperCase(),
        String(market.timeframe || ''), String(obj.currentSymbol || '').toUpperCase()].join('|')
    };
  }

  function invalidateDeferredChart(owner) {
    owner.generation += 1;
    owner.cancel.forEach(function (cancel) { cancel(); });
  }

  function deferredChartTicket(obj, owner) {
    var context = deferredChartContext(obj, owner);
    if (!context || owner.context !== context.key || owner.runtime !== context.runtime) {
      invalidateDeferredChart(owner);
      owner.context = context && context.key;
      owner.runtime = context && context.runtime;
    }
    return context && { runtime: context.runtime, key: context.key, generation: owner.generation };
  }

  function installDeferredChartOwner(obj, rt) {
    if (!obj || obj.__gpDeferredChartOwnerR407) return;
    var owner = { runtime: rt, context: null, generation: 0, cancel: new Set() };
    obj.__gpDeferredChartOwnerR407 = owner;
    deferredChartTicket(obj, owner);
    if (typeof obj.setData !== 'function') return;
    var originalSetData = obj.setData;
    obj.setData = function (rows) {
      var result = originalSetData.apply(this, arguments);
      // A successful history commit supersedes even same-context queued values.
      // A rejected request leaves the existing history and its valid work intact.
      if (result !== false && Array.isArray(rows) && rows.length &&
          Array.isArray(this.lastCandleData) && this.lastCandleData.length) {
        invalidateDeferredChart(owner);
        deferredChartTicket(this, owner);
      }
      return result;
    };
  }

  function invalidateActiveDeferredChart() {
    var rt = runtime();
    var wrapper = rt && (rt.chart || rt.chartWrapper);
    var owner = wrapper && wrapper.__gpDeferredChartOwnerR407;
    if (owner) invalidateDeferredChart(owner);
  }

  function wrapMethod(obj, name, normalMs, stressMs) {
    if (!obj || typeof obj[name] !== 'function' || alreadyGoverned(obj[name])) return false;
    var original = obj[name];
    var chartOwner = name === 'updateCandle' && obj.__gpDeferredChartOwnerR407;
    var lastAt = 0;
    var lastSig = '';
    var lastResult;
    var timer = 0;
    var pendingArgs = null;
    var pendingThis = null;
    var pendingTicket = null;
    var running = false;

    function cancelPending() {
      if (timer) clearTimeout(timer);
      timer = 0;
      pendingArgs = null;
      pendingThis = null;
      pendingTicket = null;
    }

    if (chartOwner) chartOwner.cancel.add(function () {
      cancelPending();
      lastAt = 0;
      lastSig = '';
      lastResult = false;
    });

    function invoke(ctx, args, at) {
      running = true;
      try {
        lastAt = at;
        lastResult = original.apply(ctx, args);
        // A false rejection must never turn into an accepted duplicate skip.
        lastSig = chartOwner && lastResult === false ? '' : signature(args);
        return lastResult;
      } finally { running = false; }
    }

    function flush() {
      var args = pendingArgs;
      var ctx = pendingThis || obj;
      var ticket = pendingTicket;
      cancelPending();
      if (!args || isHidden()) return chartOwner ? false : undefined;
      if (chartOwner) {
        var current = deferredChartTicket(obj, chartOwner);
        if (!ticket || !current || ticket.runtime !== current.runtime ||
            ticket.key !== current.key || ticket.generation !== current.generation) return false;
        var last = obj.lastCandleData && obj.lastCandleData[obj.lastCandleData.length - 1];
        if (last && Number(args[0] && args[0].time) < Number(last.time)) return false;
      }
      try {
        return invoke(ctx, args, now());
      } catch (err) {
        try { console.warn('[gp-v202] delayed terminal update failed:', name, err); } catch (_) {}
        return chartOwner ? false : undefined;
      }
    }

    function wrapped() {
      var ticket = chartOwner && deferredChartTicket(obj, chartOwner);
      if (chartOwner && !ticket) return false;
      if (running) return original.apply(this, arguments);
      var t = now();
      var args = Array.prototype.slice.call(arguments);
      if (chartOwner && args[0] && Object.prototype.hasOwnProperty.call(args[0], '__gpProviderOhlcContextR407')) {
        // Provider candles include historical corrections: pass them directly to
        // the integrity owner, which validates the marker and commit result.
        // A queued quote must not later overwrite that same authoritative bar.
        if (pendingArgs && Number(pendingArgs[0] && pendingArgs[0].time) === Number(args[0].time)) cancelPending();
        return invoke(this, args, t);
      }
      var sig = signature(args);
      var minMs = isStressed() ? (stressMs || normalMs || 300) : (normalMs || 120);
      if (sig === lastSig && t - lastAt < Math.max(minMs * 2, 550)) {
        if (chartOwner) cancelPending();
        return chartOwner ? lastResult : undefined;
      }
      if (t - lastAt < minMs || isHidden()) {
        pendingArgs = args;
        pendingThis = this;
        pendingTicket = ticket;
        if (!timer && !isHidden()) timer = setTimeout(flush, Math.max(30, minMs - (t - lastAt)));
        // Deferred is not committed. Callers must not publish the unvalidated row.
        return chartOwner ? false : undefined;
      }
      if (chartOwner) cancelPending();
      return invoke(this, args, t);
    }
    wrapped.__gpV202Wrapped = true;
    wrapped.__gpPanGovernorWrapped = true;
    wrapped.__gpOriginal = original;
    obj[name] = wrapped;
    return true;
  }

  function wrapRender(obj, name, delay) {
    if (!obj || typeof obj[name] !== 'function' || alreadyGoverned(obj[name])) return false;
    var original = obj[name];
    var timer = 0;
    var wrapped = function () {
      if (isHidden()) return;
      if (isStressed()) {
        var ctx = this;
        var args = arguments;
        if (!timer) {
          timer = setTimeout(function () {
            timer = 0;
            if (!isHidden()) {
              try { original.apply(ctx, args); } catch (_) {}
            }
          }, delay || 240);
        }
        return;
      }
      return original.apply(this, arguments);
    };
    wrapped.__gpV202Wrapped = true;
    wrapped.__gpPanGovernorWrapped = true;
    wrapped.__gpOriginal = original;
    obj[name] = wrapped;
    return true;
  }

  function patchRuntime(rt) {
    if (!rt) return false;
    var heatmap = rt.heatmap || rt.orderFlowHeatmap || (rt.tools && rt.tools.heatmap);
    var bubbles = rt.bubbles || rt.orderFlowBubbles || (rt.tools && rt.tools.bubbles);
    var volumeProfile = rt.volumeProfile || rt.sessionVolumeProfile || (rt.tools && rt.tools.volumeProfile);
    var footprint = rt.footprint || rt.footprintChart || (rt.tools && rt.tools.footprint);
    var chartWrapper = rt.chart || rt.chartWrapper || null;
    installDeferredChartOwner(chartWrapper, rt);
    wrapMethod(heatmap, 'setCandleData', 900, 1500);
    wrapMethod(heatmap, 'update', 260, 650);
    wrapMethod(heatmap, 'forceRender', 320, 900);
    wrapRender(heatmap, '_render', 360);
    wrapMethod(bubbles, 'setCandleData', 650, 950);
    wrapMethod(bubbles, 'setOptions', 250, 420);
    wrapMethod(bubbles, 'forceRender', 260, 620);
    wrapRender(bubbles, '_render', 260);
    wrapRender(bubbles, 'render', 260);
    wrapMethod(volumeProfile, 'update', 700, 1300);
    wrapMethod(volumeProfile, 'forceRender', 420, 900);
    wrapRender(volumeProfile, '_render', 420);
    wrapMethod(footprint, 'update', 500, 900);
    wrapMethod(footprint, 'refresh', 500, 900);
    wrapMethod(chartWrapper, 'updateCandle', 80, 260);
    wrapMethod(chartWrapper, '_syncPrimeFlowSeries', 260, 720);
    try {
      if (window.GPCryptoChartSmoothPanV177 && typeof window.GPCryptoChartSmoothPanV177.applyPanFriendlyOptions === 'function') {
        window.GPCryptoChartSmoothPanV177.applyPanFriendlyOptions();
      }
    } catch (_) {}
    return true;
  }

  function bindNow() {
    state.lastBindAt = now();
    return patchRuntime(runtime());
  }

  function scheduleBind(delay) {
    if (state.bindTimer) return;
    state.bindTimer = setTimeout(function () {
      state.bindTimer = 0;
      var t = now();
      if (t - state.lastBindAt < 500) {
        scheduleBind(500 - (t - state.lastBindAt));
        return;
      }
      bindNow();
    }, Math.max(0, Number(delay) || 0));
  }

  function bindEvents() {
    var selector = '#chart-area,.chart-area,.chart-container,.tv-lightweight-charts,#gp-prime-walls-overlay,#gp-footprint-chart-v1';
    var sharedPan = window.GPCryptoChartSmoothPanV177;
    if (sharedPan && typeof sharedPan.onInteraction === 'function') {
      sharedPan.onInteraction(function (until, duration) { updateInteraction(until, duration); });
    } else {
      // Compatibility fallback for a previously loaded governor that does not
      // expose the shared interaction subscription API.
      var pointerEvents = typeof window.PointerEvent !== 'undefined';
      var startEvents = pointerEvents ? ['pointerdown'] : ['mousedown', 'touchstart'];
      var moveEvents = pointerEvents ? ['pointermove', 'wheel'] : ['mousemove', 'touchmove', 'wheel'];
      var endEvents = pointerEvents ? ['pointerup', 'pointercancel'] : ['mouseup', 'touchend', 'touchcancel'];
      startEvents.forEach(function (name) {
        document.addEventListener(name, function (event) {
          if (event.target && event.target.closest && event.target.closest(selector)) markInteraction(950);
        }, { capture: true, passive: true });
      });
      moveEvents.forEach(function (name) {
        document.addEventListener(name, function (event) {
          var realInteraction = name === 'wheel' || name === 'touchmove' || Number(event.buttons || 0) !== 0;
          if (realInteraction && event.target && event.target.closest && event.target.closest(selector)) markInteraction(name === 'wheel' ? 850 : 620);
        }, { capture: true, passive: true });
      });
      endEvents.forEach(function (name) {
        document.addEventListener(name, function () { markInteraction(260); }, { capture: true, passive: true });
      });
    }
    ['guardeer:prime-runtime-ready', 'guardeer:market-quick-switch', 'guardeer:tool-state-change', 'guardeer:reconnect'].forEach(function (name) {
      window.addEventListener(name, function () {
        if (name === 'guardeer:market-quick-switch' || name === 'guardeer:reconnect') invalidateActiveDeferredChart();
        scheduleBind(120);
      }, { passive: true });
    });
    window.addEventListener('online', function () { scheduleBind(120); }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      syncClasses();
      armClassExpiry();
      if (!isHidden()) {
        markDegraded(900);
        scheduleBind(100);
      }
    }, { passive: true });
  }

  function startStressMonitor() {
    // Chromium exposes long tasks directly, so degraded rendering can remain
    // event-driven instead of running a class synchronizer on every frame.
    try {
      if (!window.PerformanceObserver || state.longTaskObserver) return;
      state.longTaskObserver = new PerformanceObserver(function (list) {
        if (isHidden()) return;
        var entries = list.getEntries ? list.getEntries() : [];
        for (var i = 0; i < entries.length; i += 1) {
          if (Number(entries[i].duration || 0) >= 85 && (isInteracting() || now() - state.lastInteractionEventAt < 1000)) {
            markDegraded(Number(entries[i].duration || 0) > 160 ? 5200 : 2600);
            break;
          }
        }
      });
      state.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (_) {
      state.longTaskObserver = null;
    }
  }

  function boot() {
    injectStyles();
    addNetworkHints();
    bindEvents();
    startStressMonitor();
    syncClasses();
    scheduleBind(0);
    setTimeout(function () { scheduleBind(0); }, 350);
    setTimeout(function () { scheduleBind(0); }, 1300);
    // Older externally loaded pan governors may not provide the shared
    // watchdog. Keep one slow compatibility fallback only in that case.
    if (!window.GPCryptoChartSmoothPanV177 || !window.GPCryptoChartSmoothPanV177.hasSharedWatchdog) {
      setInterval(function () { if (!isHidden()) bindNow(); }, 8000);
    }
  }

  window.GPTerminalSmoothGuardV202 = {
    version: VERSION,
    markInteraction: markInteraction,
    markDegraded: markDegraded,
    isStressed: isStressed,
    bind: bindNow,
    state: state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
