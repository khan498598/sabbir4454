(function () {
  'use strict';

  if (window.__GP_CHART_VIEWPORT_RECOVERY_V1__) return;
  window.__GP_CHART_VIEWPORT_RECOVERY_V1__ = true;

  var VERSION = 'r360-user-viewport-lock-v2';
  var state = {
    runtime: null,
    wrapper: null,
    lastUserActionAt: 0,
    lastAppliedAt: 0,
    lastSignature: '',
    userViewportLocked: false,
    userViewportContext: '',
    savedLogicalRange: null,
    savedPriceRange: null,
    userInputRevision: 0,
    restoreGeneration: 0,
    restoreTimers: [],
    captureTimers: [],
    restoring: false,
    allowNativePriceResetUntil: 0,
    pointerStart: null,
    timers: []
  };

  function runtime() {
    try {
      var root = window.GuardeerPrimeRuntime || state.runtime;
      return root && (root.runtime || root);
    } catch (_) {
      return null;
    }
  }

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'XAUUSD';
  }

  function symbol(rt) {
    try {
      return cleanSymbol(rt && rt.state && rt.state.symbol ||
        (document.getElementById('symbol-label') || {}).textContent ||
        (document.getElementById('gp-overview-symbol') || {}).textContent);
    } catch (_) {
      return 'XAUUSD';
    }
  }

  function timeframe(rt) {
    try {
      return String(rt && rt.state && rt.state.timeframe ||
        (document.querySelector('.timeframe-btn.active[data-tf]') || {}).dataset?.tf ||
        (document.getElementById('timeframe-select') || {}).value ||
        (document.getElementById('header-timeframe-select') || {}).value ||
        '1h');
    } catch (_) {
      return '1h';
    }
  }

  function exchange(rt) {
    try {
      return String(rt && rt.state && rt.state.exchange || 'binance').toLowerCase();
    } catch (_) {
      return 'binance';
    }
  }

  function contextKey(rt) {
    return [exchange(rt), symbol(rt), timeframe(rt)].join('|');
  }

  function unlockUserViewport(reason) {
    clearRestoreTimers();
    clearCaptureTimers();
    state.userViewportLocked = false;
    state.userViewportContext = '';
    state.savedLogicalRange = null;
    state.savedPriceRange = null;
    state.pointerStart = null;
    state.allowNativePriceResetUntil = 0;
    try {
      var parts = chartParts(runtime());
      parts.scale && parts.scale.applyOptions && parts.scale.applyOptions({
        lockVisibleTimeRangeOnResize: false
      });
    } catch (_) {}
    try {
      document.body.removeAttribute('data-gp-user-viewport-locked');
      window.dispatchEvent(new CustomEvent('guardeer:user-viewport-unlocked', {
        detail: { version: VERSION, reason: reason || 'context-change' }
      }));
    } catch (_) {}
  }

  function userViewportLocked(rt) {
    if (!state.userViewportLocked) return false;
    var current = contextKey(rt);
    if (!state.userViewportContext || state.userViewportContext !== current) {
      unlockUserViewport('market-context-change');
      return false;
    }
    return true;
  }

  function lockUserViewport(rt, reason) {
    if (!rt) return;
    var nextContext = contextKey(rt);
    if (state.userViewportContext && state.userViewportContext !== nextContext) {
      unlockUserViewport('market-context-change');
    }
    state.lastUserActionAt = Date.now();
    state.userViewportLocked = true;
    state.userViewportContext = nextContext;
    state.userInputRevision += 1;
    clearRestoreTimers();
    captureUserRanges(rt);
    scheduleUserRangeCapture(rt, state.userInputRevision);
    try {
      var parts = chartParts(rt);
      parts.scale && parts.scale.applyOptions && parts.scale.applyOptions({
        rightBarStaysOnScroll: false,
        shiftVisibleRangeOnNewBar: false,
        lockVisibleTimeRangeOnResize: true
      });
    } catch (_) {}
    try {
      document.body.setAttribute('data-gp-user-viewport-locked', 'true');
      window.dispatchEvent(new CustomEvent('guardeer:user-viewport-locked', {
        detail: { version: VERSION, reason: reason || 'chart-interaction', context: state.userViewportContext }
      }));
    } catch (_) {}
  }

  function desiredBars(tf) {
    var key = String(tf || '1h');
    var map = {
      '1m': 180, '3m': 150, '5m': 125, '15m': 115, '30m': 105,
      '1h': 96, '2h': 110, '4h': 105, '6h': 100, '8h': 96,
      '12h': 92, '1d': 90, '3d': 86, '1w': 82, '1M': 76
    };
    return map[key] || 110;
  }

  function chartParts(rt) {
    var wrapper = rt && rt.chart;
    var chart = null;
    try {
      chart = wrapper && typeof wrapper.getChartInstance === 'function'
        ? wrapper.getChartInstance()
        : wrapper && (wrapper.chart || wrapper);
    } catch (_) {}
    var scale = null;
    try { scale = chart && chart.timeScale && chart.timeScale(); } catch (_) {}
    return { wrapper: wrapper, chart: chart, scale: scale };
  }

  function candleRows(rt, wrapper) {
    try {
      if (wrapper && Array.isArray(wrapper.lastCandleData) && wrapper.lastCandleData.length) {
        return wrapper.lastCandleData;
      }
    } catch (_) {}
    try {
      var rows = rt && typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function currentRange(scale) {
    try {
      var range = scale && scale.getVisibleLogicalRange && scale.getVisibleLogicalRange();
      if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to))) {
        return { from: Number(range.from), to: Number(range.to) };
      }
    } catch (_) {}
    return null;
  }

  function currentPriceRange(chart) {
    try {
      var priceScale = chart && chart.priceScale && chart.priceScale('right');
      var range = priceScale && priceScale.getVisibleRange && priceScale.getVisibleRange();
      if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to)) && Number(range.to) > Number(range.from)) {
        return { from: Number(range.from), to: Number(range.to) };
      }
    } catch (_) {}
    return null;
  }

  function clearRestoreTimers() {
    state.restoreGeneration += 1;
    state.restoreTimers.forEach(function (timer) { window.clearTimeout(timer); });
    state.restoreTimers = [];
  }

  function clearCaptureTimers() {
    state.captureTimers.forEach(function (timer) { window.clearTimeout(timer); });
    state.captureTimers = [];
  }

  function captureUserRanges(rt) {
    if (!userViewportLocked(rt) || state.restoring) return false;
    var parts = chartParts(rt);
    var logical = currentRange(parts.scale);
    var price = currentPriceRange(parts.chart);
    if (logical) state.savedLogicalRange = logical;
    if (price) state.savedPriceRange = price;
    return Boolean(logical || price);
  }

  function scheduleUserRangeCapture(rt, revision) {
    clearCaptureTimers();
    [0, 60, 180].forEach(function (delay) {
      state.captureTimers.push(window.setTimeout(function () {
        if (revision !== state.userInputRevision || !userViewportLocked(rt)) return;
        captureUserRanges(rt);
      }, delay));
    });
  }

  function restoreRanges(rt, logical, price) {
    if (!userViewportLocked(rt)) return false;
    var parts = chartParts(rt);
    state.restoring = true;
    try {
      if (logical && parts.scale && typeof parts.scale.setVisibleLogicalRange === 'function') {
        parts.scale.setVisibleLogicalRange({ from: logical.from, to: logical.to });
      }
      var priceScale = parts.chart && parts.chart.priceScale && parts.chart.priceScale('right');
      if (price && priceScale && typeof priceScale.setVisibleRange === 'function') {
        priceScale.setVisibleRange({ from: price.from, to: price.to });
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      state.restoring = false;
    }
  }

  function scheduleRangeRestore(rt, logical, price, revision, delays) {
    clearRestoreTimers();
    var generation = state.restoreGeneration;
    var expectedContext = state.userViewportContext;
    function guardedRestore() {
      if (generation !== state.restoreGeneration || revision !== state.userInputRevision ||
          expectedContext !== state.userViewportContext || !userViewportLocked(rt)) return;
      restoreRanges(rt, logical, price);
    }
    guardedRestore();
    (delays || [70, 180]).forEach(function (delay) {
      state.restoreTimers.push(window.setTimeout(guardedRestore, delay));
    });
  }

  function collapsed(range, length, wanted) {
    if (!range) return true;
    var span = range.to - range.from;
    if (!Number.isFinite(span) || span <= 0) return true;
    if (span > wanted * 2.25) return true;
    if (range.to < length - Math.max(wanted * 1.4, 60)) return true;
    if (range.from > length + Math.max(wanted, 60)) return true;
    return false;
  }

  function apply(reason, force) {
    if (document.documentElement.hasAttribute('data-gp-module2-standalone') ||
        document.documentElement.hasAttribute('data-gp-module2-tools')) return false;

    var rt = runtime();
    var parts = chartParts(rt);
    var rows = candleRows(rt, parts.wrapper);
    if (!rt || !parts.chart || !parts.scale || rows.length < 12) return false;

    // Once the user pans or zooms, never pull the chart back to real time.
    // A symbol/timeframe change automatically starts a fresh viewport context.
    if (userViewportLocked(rt)) return false;

    var wanted = Math.min(desiredBars(timeframe(rt)), rows.length);
    var range = currentRange(parts.scale);
    var last = rows[rows.length - 1] || {};
    var signature = [symbol(rt), timeframe(rt), rows.length, Number(last.time || 0)].join('|');
    var needsRepair = collapsed(range, rows.length, wanted);

    // A normal new candle changes the signature but must not reset the user's
    // visible range. Record the new signature and leave a healthy viewport as-is.
    if (!force && !needsRepair) {
      state.lastSignature = signature;
      return true;
    }
    // Never fight a user who has just panned or zoomed the chart.
    if (!force && Date.now() - state.lastUserActionAt < 6000) return false;

    var rightOffset = Math.max(3, Math.min(7, Math.round(wanted * 0.045)));
    var from = Math.max(0, rows.length - wanted);
    var to = rows.length - 1 + rightOffset;

    try {
      parts.scale.applyOptions && parts.scale.applyOptions({
        rightOffset: rightOffset,
        minBarSpacing: 0.8,
        fixLeftEdge: false,
        fixRightEdge: false,
        rightBarStaysOnScroll: false,
        shiftVisibleRangeOnNewBar: false,
        lockVisibleTimeRangeOnResize: false
      });
    } catch (_) {}

    try {
      var priceScale = parts.chart.priceScale && parts.chart.priceScale('right');
      if (priceScale && priceScale.applyOptions) priceScale.applyOptions({ autoScale: true });
    } catch (_) {}

    try {
      if (parts.wrapper && typeof parts.wrapper.resetPriceScale === 'function') {
        parts.wrapper.resetPriceScale();
      }
    } catch (_) {}

    try {
      if (typeof parts.scale.setVisibleLogicalRange === 'function') {
        parts.scale.setVisibleLogicalRange({ from: from, to: to });
        state.lastSignature = signature;
        state.lastAppliedAt = Date.now();
        document.body.classList.add('gp-chart-viewport-recovered-r299');
        try {
          window.dispatchEvent(new CustomEvent('guardeer:chart-viewport-recovered', {
            detail: { version: VERSION, reason: reason || 'repair', symbol: symbol(rt), timeframe: timeframe(rt), bars: wanted }
          }));
        } catch (_) {}
        return true;
      }
    } catch (_) {}
    return false;
  }

  function clearTimers() {
    state.timers.forEach(function (timer) { window.clearTimeout(timer); });
    state.timers = [];
  }

  function schedule(reason, force) {
    clearTimers();
    // R299 forced seven independent viewport resets for nine seconds. During a
    // slow history request that looked like one or two giant candles and also
    // undid user zoom. R311 performs one initial fit and two conditional checks.
    [180, 1000, 2600].forEach(function (delay, index) {
      state.timers.push(window.setTimeout(function () {
        apply(reason, Boolean(force) && index === 0 && !state.lastSignature);
      }, delay));
    });
  }

  function patchRuntime(rt) {
    rt = rt && (rt.runtime || rt);
    if (!rt || !rt.chart) return false;
    state.runtime = rt;
    var wrapper = rt.chart;
    state.wrapper = wrapper;

    if (typeof wrapper.resetPriceScale === 'function' && !wrapper.__gpUserViewportResetWrappedR360) {
      var originalResetPriceScale = wrapper.resetPriceScale;
      var wrappedResetPriceScale = function () {
        if (userViewportLocked(runtime())) {
          if (Date.now() <= state.allowNativePriceResetUntil) {
            state.allowNativePriceResetUntil = 0;
            state.savedPriceRange = null;
            return originalResetPriceScale.apply(this, arguments);
          }
          return true;
        }
        return originalResetPriceScale.apply(this, arguments);
      };
      wrappedResetPriceScale.__gpUserViewportLockR360 = true;
      wrappedResetPriceScale.__gpOriginal = originalResetPriceScale;
      wrapper.resetPriceScale = wrappedResetPriceScale;
      wrapper.__gpUserViewportResetWrappedR360 = true;
    }

    if (typeof wrapper.setData === 'function' && !wrapper.setData.__gpViewportRecoveryR299) {
      var originalSetData = wrapper.setData;
      var wrappedSetData = function () {
        var activeRuntime = runtime();
        var partsBefore = chartParts(activeRuntime);
        var preserveUserRange = userViewportLocked(activeRuntime);
        var savedRange = preserveUserRange ? (currentRange(partsBefore.scale) || state.savedLogicalRange) : null;
        var savedPriceRange = preserveUserRange ? (currentPriceRange(partsBefore.chart) || state.savedPriceRange) : null;
        var inputRevision = state.userInputRevision;
        if (preserveUserRange) {
          if (savedRange) state.savedLogicalRange = savedRange;
          if (savedPriceRange) state.savedPriceRange = savedPriceRange;
          clearCaptureTimers();
        }
        var result = originalSetData.apply(this, arguments);
        if (preserveUserRange && (savedRange || savedPriceRange) && userViewportLocked(runtime())) {
          scheduleRangeRestore(activeRuntime, savedRange, savedPriceRange, inputRevision, [70, 180]);
        }
        schedule('chart-set-data', false);
        return result;
      };
      wrappedSetData.__gpViewportRecoveryR299 = true;
      wrappedSetData.__gpOriginal = originalSetData;
      wrapper.setData = wrappedSetData;
    }

    schedule('runtime-ready', false);
    return true;
  }

  function chartTarget(event) {
    var target = event && event.target;
    return Boolean(target && target.closest && target.closest('#chart-area,.chart-area,.chart-container,.tv-lightweight-charts'));
  }

  function pointerCoordinates(event) {
    var source = event && event.touches && event.touches[0] || event && event.changedTouches && event.changedTouches[0] || event || {};
    return { x: Number(source.clientX || 0), y: Number(source.clientY || 0) };
  }

  function startPointer(event) {
    if (!chartTarget(event)) return;
    var point = pointerCoordinates(event);
    state.pointerStart = { x: point.x, y: point.y };
  }

  function movePointer(event) {
    if (!state.pointerStart || !chartTarget(event)) return;
    var point = pointerCoordinates(event);
    var dx = Math.abs(point.x - state.pointerStart.x);
    var dy = Math.abs(point.y - state.pointerStart.y);
    if (dx + dy < 4) return;
    lockUserViewport(runtime(), event && event.type || 'chart-drag');
  }

  function endPointer() {
    if (state.pointerStart && userViewportLocked(runtime())) {
      state.userInputRevision += 1;
      clearRestoreTimers();
      captureUserRanges(runtime());
      scheduleUserRangeCapture(runtime(), state.userInputRevision);
    }
    state.pointerStart = null;
  }

  function wheelUserAction(event) {
    if (!chartTarget(event)) return;
    lockUserViewport(runtime(), 'wheel');
  }

  function allowExplicitPriceReset(event) {
    if (!chartTarget(event) || !userViewportLocked(runtime())) return;
    state.allowNativePriceResetUntil = Date.now() + 900;
    state.savedPriceRange = null;
  }

  function marketControl(target) {
    return target && target.closest && target.closest([
      '#symbol-selector', '#symbol-options', '.selector__option', '.gp-v71-market-btn',
      '.gp-v71-market-symbol-row', '.gp-tv-timeframe-menu', '.tv-timeframe-menu',
      '#timeframe-select', '#header-timeframe-select', '.timeframe-btn'
    ].join(','));
  }

  function boot() {
    document.addEventListener('wheel', wheelUserAction, { capture: true, passive: true });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      document.addEventListener(name, startPointer, { capture: true, passive: true });
    });
    ['pointermove', 'mousemove', 'touchmove'].forEach(function (name) {
      document.addEventListener(name, movePointer, { capture: true, passive: true });
    });
    ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel'].forEach(function (name) {
      document.addEventListener(name, endPointer, { capture: true, passive: true });
    });
    document.addEventListener('dblclick', allowExplicitPriceReset, { capture: true, passive: true });

    document.addEventListener('click', function (event) {
      if (marketControl(event.target)) schedule('market-control', false);
    }, true);
    document.addEventListener('change', function (event) {
      if (marketControl(event.target)) schedule('market-change', false);
    }, true);

    window.addEventListener('guardeer:prime-runtime-ready', function (event) {
      patchRuntime((event && event.detail) || window.GuardeerPrimeRuntime);
    }, { passive: true });
    ['guardeer:market-quick-switch', 'guardeer:open-dashboard-chart'].forEach(function (name) {
      window.addEventListener(name, function () { schedule(name, false); }, { passive: true });
    });
    ['guardeer:market-snapshot', 'guardeer:forexgold-live-tick'].forEach(function (name) {
      window.addEventListener(name, function () { apply(name, false); }, { passive: true });
    });

    function layoutChanged(reason) {
      var rt = runtime();
      if (userViewportLocked(rt)) {
        scheduleRangeRestore(rt, state.savedLogicalRange, state.savedPriceRange, state.userInputRevision, [80, 220]);
      } else {
        schedule(reason, false);
      }
    }
    window.addEventListener('resize', function () { layoutChanged('resize'); }, { passive: true });
    window.addEventListener('orientationchange', function () { layoutChanged('orientation'); }, { passive: true });

    patchRuntime(window.GuardeerPrimeRuntime);
    schedule('boot', false);

    window.setInterval(function () {
      var rt = runtime();
      if (rt && rt.chart !== state.wrapper) patchRuntime(rt);
      else apply('viewport-watchdog', false);
    }, 4000);
  }

  window.GPChartViewportRecoveryV1 = {
    version: VERSION,
    apply: function () {
      unlockUserViewport('manual-reset');
      return apply('manual-reset', true);
    },
    unlock: function () { unlockUserViewport('api-reset'); },
    allowNextPriceReset: function () {
      state.allowNativePriceResetUntil = Date.now() + 900;
      state.savedPriceRange = null;
    },
    schedule: schedule,
    status: function () {
      return {
        version: VERSION,
        lastAppliedAt: state.lastAppliedAt,
        lastSignature: state.lastSignature,
        lastUserActionAt: state.lastUserActionAt,
        userViewportLocked: state.userViewportLocked,
        userViewportContext: state.userViewportContext,
        savedLogicalRange: state.savedLogicalRange && Object.assign({}, state.savedLogicalRange),
        savedPriceRange: state.savedPriceRange && Object.assign({}, state.savedPriceRange),
        userInputRevision: state.userInputRevision
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
