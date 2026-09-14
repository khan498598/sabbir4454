(function () {
  'use strict';

  if (window.__GP_CLEAN_CHART_PRIME_CARD_LAYOUT_FIX_V79__) return;
  window.__GP_CLEAN_CHART_PRIME_CARD_LAYOUT_FIX_V79__ = true;

  var VERSION = 'v79-clean-chart-prime-card-layout-fix';
  var state = {
    capturedContainer: 0,
    capturedArea: 0,
    cleanActive: false,
    observer: null,
    signalListObserver: null,
    signalStyleObserver: null,
    signalCard: null,
    resizeTimers: []
  };

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function isCleanActive() {
    return !!(document.body && (
      document.body.classList.contains('gp-clean-chart-active') ||
      document.body.classList.contains('gp-clean-chart-visuals-only')
    ));
  }

  function captureNormalChartSize() {
    var container = qs('.chart-container');
    var area = qs('#chart-area');
    if (!container || !area) return;

    var containerRect = container.getBoundingClientRect();
    var areaRect = area.getBoundingClientRect();
    if (containerRect.height > 300) state.capturedContainer = Math.round(containerRect.height);
    if (areaRect.height > 220) state.capturedArea = Math.round(areaRect.height);

    if (document.body) {
      if (state.capturedContainer) document.body.style.setProperty('--gp-v79-clean-container-min', state.capturedContainer + 'px');
      if (state.capturedArea) document.body.style.setProperty('--gp-v79-clean-area-min', state.capturedArea + 'px');
    }
  }

  function resizeChartNow() {
    var area = qs('#chart-area');
    var rt = window.GuardeerPrimeRuntime || null;
    var runtimeChart = rt && rt.chart;

    try {
      if (runtimeChart && typeof runtimeChart.resize === 'function') runtimeChart.resize();
    } catch (_) {}

    try {
      var chart = runtimeChart && typeof runtimeChart.getChartInstance === 'function'
        ? runtimeChart.getChartInstance()
        : runtimeChart && runtimeChart.chart;
      if (chart && typeof chart.resize === 'function' && area && area.clientWidth > 0 && area.clientHeight > 0) {
        chart.resize(area.clientWidth, area.clientHeight);
      }
    } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent('guardeer:chart-layout-stabilized', {
        detail: { source: VERSION, clean: isCleanActive(), time: Date.now() }
      }));
    } catch (_) {}
  }

  function cancelResizeSequence() {
    state.resizeTimers.forEach(function (timer) { clearTimeout(timer); });
    state.resizeTimers = [];
  }

  function scheduleResizeSequence() {
    cancelResizeSequence();
    // Three coalesced passes are enough for the CSS transition and avoid the old
    // seven-pass resize storm while Order Flow canvases are rendering.
    [0, 140, 520].forEach(function (delay) {
      state.resizeTimers.push(setTimeout(resizeChartNow, delay));
    });
  }

  function syncCleanLayout() {
    var active = isCleanActive();
    if (active === state.cleanActive && active) return;
    state.cleanActive = active;

    if (!document.body) return;
    document.body.classList.toggle('gp-clean-layout-stable-v79', active);

    if (active) {
      if (!state.capturedContainer || !state.capturedArea) captureNormalChartSize();
      scheduleResizeSequence();
      return;
    }

    cancelResizeSequence();
    document.body.classList.remove('gp-clean-layout-stable-v79');
    document.body.style.removeProperty('--gp-v79-clean-container-min');
    document.body.style.removeProperty('--gp-v79-clean-area-min');
    state.capturedContainer = 0;
    state.capturedArea = 0;
    setTimeout(resizeChartNow, 40);
  }

  function cleanButtonFromEvent(event) {
    return event && event.target && event.target.closest && event.target.closest(
      '[data-tv-action="cleanChart"], #gp-clean-flow, #gp-clean-chart-head-btn, .gp-clean-chart-head-btn, .tv-top-tool--clean, [data-mobile-action="clean"], [data-mobile-action="clean-chart"]'
    );
  }

  function bindCleanChartSizing() {
    document.addEventListener('pointerdown', function (event) {
      if (cleanButtonFromEvent(event) && !isCleanActive()) captureNormalChartSize();
    }, true);

    document.addEventListener('click', function (event) {
      if (!cleanButtonFromEvent(event)) return;
      if (!isCleanActive()) captureNormalChartSize();
      [0, 40, 160].forEach(function (delay) { setTimeout(syncCleanLayout, delay); });
    }, true);

    try {
      state.observer = new MutationObserver(function () {
        var next = isCleanActive();
        if (next !== state.cleanActive) syncCleanLayout();
      });
      state.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
  }

  function applyPrimeSignalWidth(card) {
    if (!card || card.id !== 'prime-chart-signal') return;
    if (!String(card.getAttribute('style') || '').match(/(?:^|;)\s*left\s*:/i)) return;
    if (!card.style.getPropertyValue('--gp-v79-prime-signal-width')) {
      card.style.setProperty('--gp-v79-prime-signal-width', '565px');
    }
  }

  function watchPrimeSignalCard(card) {
    if (!card || state.signalCard === card) return;
    if (state.signalStyleObserver) state.signalStyleObserver.disconnect();
    state.signalCard = card;
    applyPrimeSignalWidth(card);
    try {
      state.signalStyleObserver = new MutationObserver(function () { applyPrimeSignalWidth(card); });
      state.signalStyleObserver.observe(card, { attributes: true, attributeFilter: ['style'] });
    } catch (_) {}
  }

  function findSignalInNode(node) {
    if (!node || node.nodeType !== 1) return null;
    if (node.id === 'prime-chart-signal') return node;
    return node.querySelector && node.querySelector('#prime-chart-signal');
  }

  function bindPrimeSignalWidthLock() {
    document.addEventListener('pointerdown', function (event) {
      var card = event.target && event.target.closest && event.target.closest('#prime-chart-signal');
      if (!card || event.target.closest('button')) return;
      var rect = card.getBoundingClientRect();
      var parent = card.offsetParent || card.parentElement;
      var available = parent && parent.clientWidth ? Math.max(280, parent.clientWidth - 16) : Math.max(280, window.innerWidth - 16);
      var width = Math.min(Math.max(360, rect.width || 565), available);
      card.style.setProperty('--gp-v79-prime-signal-width', Math.round(width) + 'px');
      watchPrimeSignalCard(card);
    }, true);

    // Only watch nodes being added. The previous build observed every style change
    // in the whole application, including every chart frame.
    try {
      state.signalListObserver = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          var nodes = records[i].addedNodes || [];
          for (var j = 0; j < nodes.length; j += 1) {
            var card = findSignalInNode(nodes[j]);
            if (card) {
              watchPrimeSignalCard(card);
              return;
            }
          }
        }
      });
      state.signalListObserver.observe(document.body, { subtree: true, childList: true });
    } catch (_) {}

    watchPrimeSignalCard(qs('#prime-chart-signal'));
  }

  function boot() {
    bindCleanChartSizing();
    bindPrimeSignalWidthLock();
    syncCleanLayout();
    window.addEventListener('resize', function () {
      if (isCleanActive()) scheduleResizeSequence();
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.GPCleanChartPrimeCardLayoutFixV79 = {
    version: VERSION,
    sync: syncCleanLayout,
    resize: resizeChartNow,
    state: state
  };
})();
