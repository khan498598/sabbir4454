(function () {
  'use strict';

  if (window.__GP_KAIRI_PRIME_PRICE_SCALE_COMPAT_V77__) return;
  window.__GP_KAIRI_PRIME_PRICE_SCALE_COMPAT_V77__ = true;

  var VERSION = 'v168-prime-indicator-native-price-axis-drag';
  var state = {
    runtimeChart: null,
    chart: null,
    container: null,
    scale: null,
    originalReset: null,
    manual: false,
    drag: null,
    contextKey: '',
    bindTimer: 0,
    monitorTimer: 0,
    monitorQueued: false,
    bodyObserver: null,
    lastSnapshotMonitorAt: 0
  };

  function primeModeActive() {
    var body = document.body;
    return !!(
      body &&
      body.classList.contains('prime-indicator-chart-mode-active') &&
      !body.classList.contains('gp-dashboard-tab-orderflow')
    );
  }

  function number(value) {
    value = Number(value);
    return Number.isFinite(value) ? value : null;
  }

  function runtime() {
    return window.GuardeerPrimeRuntime || null;
  }

  function currentContext() {
    var rt = runtime();
    var st = rt && rt.state || {};
    var snap = null;
    try {
      snap = typeof window.__gpGetPrimeMarketSnapshot === 'function'
        ? window.__gpGetPrimeMarketSnapshot()
        : window.__gpPrimeMarketSnapshot;
    } catch (_) {}
    return [
      String(st.exchange || snap && snap.exchange || ''),
      String(st.symbol || snap && snap.symbol || ''),
      String(st.timeframe || snap && snap.timeframe || '')
    ].join('|').toUpperCase();
  }

  function candleRange() {
    var snap = null;
    try {
      snap = typeof window.__gpGetPrimeMarketSnapshot === 'function'
        ? window.__gpGetPrimeMarketSnapshot()
        : window.__gpPrimeMarketSnapshot;
    } catch (_) {}
    var rows = snap && (snap.visibleCandles || snap.candles || snap.sessionCandles) || [];
    if (!Array.isArray(rows) || !rows.length) return null;
    rows = rows.slice(-240);
    var low = Infinity;
    var high = -Infinity;
    rows.forEach(function (row) {
      var l = number(row && row.low);
      var h = number(row && row.high);
      if (l !== null && l > 0) low = Math.min(low, l);
      if (h !== null && h > 0) high = Math.max(high, h);
    });
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;
    var pad = Math.max((high - low) * 0.10, Math.abs(high) * 0.0004, 1e-8);
    return { from: low - pad, to: high + pad };
  }

  function visibleRange() {
    try {
      var range = state.scale && state.scale.getVisibleRange && state.scale.getVisibleRange();
      var from = number(range && range.from);
      var to = number(range && range.to);
      if (from !== null && to !== null && to > from) return { from: from, to: to };
    } catch (_) {}
    return candleRange();
  }

  function setRange(range) {
    if (!range || !state.scale) return false;
    var from = number(range.from);
    var to = number(range.to);
    if (from === null || to === null || to <= from) return false;
    try {
      if (typeof state.scale.setVisibleRange === 'function') {
        state.scale.setVisibleRange({ from: from, to: to });
        state.manual = true;
        document.body.classList.add('gp-prime-price-scale-manual-v77');
        return true;
      }
      state.scale.applyOptions({ autoScale: false });
    } catch (_) {}
    return false;
  }

  function resetManualScale() {
    state.manual = false;
    state.drag = null;
    if (document.body) document.body.classList.remove('gp-prime-price-scale-manual-v77');
    try { state.scale && state.scale.setAutoScale && state.scale.setAutoScale(true); } catch (_) {}
    try {
      if (state.originalReset && state.runtimeChart) state.originalReset.call(state.runtimeChart);
      else if (state.scale) state.scale.applyOptions({ autoScale: true });
    } catch (_) {}
  }

  function isRightPriceAxis(event) {
    var container = state.container;
    if (!container || !event) return false;
    var rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var x = Number(event.clientX) - rect.left;
    var axisWidth = Math.max(82, Math.min(122, rect.width * 0.09));
    return x >= rect.width - axisWidth && x <= rect.width + 4;
  }

  function onWheel(event) {
    if (!primeModeActive() || !isRightPriceAxis(event)) return;
    var range = visibleRange();
    if (!range) return;
    var span = range.to - range.from;
    if (!(span > 0)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey || event.altKey) {
      var zoom = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      var center = (range.from + range.to) / 2;
      var half = Math.max(span * zoom / 2, Math.abs(center) * 1e-7);
      setRange({ from: center - half, to: center + half });
    } else {
      var rect = state.container.getBoundingClientRect();
      var shift = span * (Number(event.deltaY) || 0) / Math.max(220, rect.height) * 0.82;
      setRange({ from: range.from + shift, to: range.to + shift });
    }
  }

  function onPointerDown(event) {
    if (!primeModeActive() || event.button !== 0 || !isRightPriceAxis(event)) return;
    var range = visibleRange();
    if (!range) return;

    // Mark the scale as manual, but leave the pointer event untouched so the
    // native Lightweight Charts price-axis drag can handle the resize exactly
    // like it does on the standard chart.
    state.drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      range: range,
      nativeScale: true
    };
    state.manual = true;
    document.body.classList.add('gp-prime-price-scale-manual-v77', 'gp-prime-price-scale-dragging-v77');
  }

  function onPointerMove(event) {
    var drag = state.drag;
    if (!drag || (drag.pointerId != null && event.pointerId != null && drag.pointerId !== event.pointerId)) return;
    if (!primeModeActive()) {
      endPointer(event);
      return;
    }

    // Native price-axis scaling receives this event unchanged. The compatibility
    // layer only keeps manual scale mode locked so live updates cannot reset it.
    if (drag.nativeScale) return;
  }

  function endPointer(event) {
    if (!state.drag) return;
    if (state.drag.pointerId != null && event && event.pointerId != null && state.drag.pointerId !== event.pointerId) return;
    state.drag = null;
    if (document.body) document.body.classList.remove('gp-prime-price-scale-dragging-v77');
  }

  function onDoubleClick(event) {
    if (!primeModeActive() || !isRightPriceAxis(event)) return;
    event.preventDefault();
    event.stopPropagation();
    resetManualScale();
  }

  function onPointerMoveHover(event) {
    if (!primeModeActive() || !document.body) return;
    document.body.classList.toggle('gp-prime-price-scale-hover-v77', isRightPriceAxis(event));
  }

  function unbind() {
    var container = state.container;
    if (container) {
      container.removeEventListener('wheel', onWheel, true);
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('dblclick', onDoubleClick, true);
      container.removeEventListener('pointermove', onPointerMoveHover, true);
      container.removeEventListener('pointerleave', onPointerMoveHover, true);
    }
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', endPointer, true);
    window.removeEventListener('pointercancel', endPointer, true);
    state.container = null;
    state.chart = null;
    state.scale = null;
    state.runtimeChart = null;
    state.originalReset = null;
  }

  function wrapReset(runtimeChart) {
    if (!runtimeChart || runtimeChart.__gpPriceScaleResetWrappedV77) return;
    var original = runtimeChart.resetPriceScale;
    if (typeof original !== 'function') return;
    runtimeChart.__gpPriceScaleResetWrappedV77 = true;
    runtimeChart.__gpOriginalResetPriceScaleV77 = original;
    state.originalReset = original;
    runtimeChart.resetPriceScale = function () {
      if (primeModeActive() && state.manual) {
        try {
          var chart = runtimeChart.getChartInstance && runtimeChart.getChartInstance();
          chart && chart.priceScale && chart.priceScale('volume').applyOptions({ autoScale: true, scaleMargins: { top: 0.85, bottom: 0 } });
        } catch (_) {}
        return true;
      }
      return original.apply(runtimeChart, arguments);
    };
  }

  function bind() {
    var rt = runtime();
    var runtimeChart = rt && rt.chart;
    var chart = runtimeChart && (runtimeChart.getChartInstance && runtimeChart.getChartInstance() || runtimeChart.chart);
    var container = runtimeChart && (runtimeChart.getContainer && runtimeChart.getContainer() || runtimeChart.container);
    if (!runtimeChart || !chart || !container || !container.isConnected) return false;

    if (state.container === container && state.chart === chart) return true;
    unbind();

    state.runtimeChart = runtimeChart;
    state.chart = chart;
    state.container = container;
    try { state.scale = chart.priceScale('right'); } catch (_) { state.scale = null; }
    if (!state.scale) return false;

    try {
      chart.applyOptions({
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: {
          axisPressedMouseMove: { time: true, price: true },
          axisDoubleClickReset: { time: true, price: true },
          mouseWheel: true,
          pinch: true
        },
        rightPriceScale: {
          visible: true,
          borderVisible: true
        }
      });
    } catch (_) {}

    wrapReset(runtimeChart);
    container.addEventListener('wheel', onWheel, { capture: true, passive: false });
    container.addEventListener('pointerdown', onPointerDown, true);
    container.addEventListener('dblclick', onDoubleClick, true);
    container.addEventListener('pointermove', onPointerMoveHover, true);
    container.addEventListener('pointerleave', onPointerMoveHover, true);
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', endPointer, true);
    window.addEventListener('pointercancel', endPointer, true);
    state.contextKey = currentContext();
    return true;
  }

  function monitor() {
    bind();
    var nextContext = currentContext();
    if (state.contextKey && nextContext && nextContext !== state.contextKey) {
      resetManualScale();
      state.contextKey = nextContext;
    } else if (nextContext) {
      state.contextKey = nextContext;
    }
    if (!primeModeActive() && document.body) {
      if (document.body.classList.contains('gp-prime-price-scale-hover-v77') || document.body.classList.contains('gp-prime-price-scale-dragging-v77')) {
        document.body.classList.remove('gp-prime-price-scale-hover-v77', 'gp-prime-price-scale-dragging-v77');
      }
      state.drag = null;
    }
  }

  function scheduleMonitor(delay) {
    if (state.monitorQueued) return;
    state.monitorQueued = true;
    setTimeout(function () {
      requestAnimationFrame(function () {
        state.monitorQueued = false;
        monitor();
      });
    }, Math.max(0, Number(delay) || 0));
  }

  function start() {
    if (state.monitorTimer) return;
    // A sentinel replaces the old permanent 900 ms polling loop.
    state.monitorTimer = -1;
    [0, 120, 450, 1200].forEach(function (delay) { setTimeout(bind, delay); });

    window.addEventListener('guardeer:prime-runtime-ready', function () { scheduleMonitor(0); }, { passive: true });
    window.addEventListener('guardeer:market-snapshot', function () {
      var stamp = Date.now();
      if (stamp - state.lastSnapshotMonitorAt < 500) return;
      state.lastSnapshotMonitorAt = stamp;
      scheduleMonitor(0);
    }, { passive: true });
    window.addEventListener('guardeer:market-quick-switch', function () { scheduleMonitor(80); }, { passive: true });
    window.addEventListener('guardeer:terminal-visibility-changed', function () { scheduleMonitor(0); }, { passive: true });

    try {
      state.bodyObserver = new MutationObserver(function () { scheduleMonitor(0); });
      state.bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
  }

  window.GPPriceScaleCompatV77 = {
    version: VERSION,
    bind: bind,
    reset: resetManualScale,
    getState: function () {
      return {
        manual: state.manual,
        dragging: !!state.drag,
        contextKey: state.contextKey,
        bound: !!state.container,
        version: VERSION
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
