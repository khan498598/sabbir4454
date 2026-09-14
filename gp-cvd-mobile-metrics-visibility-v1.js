(function () {
  'use strict';

  if (window.__GP_CVD_MOBILE_METRICS_VISIBILITY_V2__) return;
  window.__GP_CVD_MOBILE_METRICS_VISIBILITY_V2__ = true;

  var STYLE_ID = 'gp-cvd-mobile-metrics-visibility-v1-style';
  var VERSION = 'v268-cvd-mobile-resize-loop-guard';
  var resizeTimer = 0;

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '@media (max-width: 1180px) {',
      '  body.terminal-active.gp-dashboard-chart-mode .chart-container,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .chart-container {',
      '    display: flex !important;',
      '    flex-direction: column !important;',
      '    flex: 1 1 auto !important;',
      '    min-height: 0 !important;',
      '    height: auto !important;',
      '    overflow: hidden !important;',
      '    padding-bottom: 0 !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode .chart-area,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .chart-area,',
      '  body.terminal-active.gp-dashboard-chart-mode #chart-area,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #chart-area {',
      '    display: block !important;',
      '    flex: 1 1 auto !important;',
      '    min-height: 0 !important;',
      '    height: auto !important;',
      '    max-height: none !important;',
      '    visibility: visible !important;',
      '    opacity: 1 !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #cvd-chart,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #cvd-chart,',
      '  body.terminal-active.gp-dashboard-chart-mode .cvd-container,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .cvd-container {',
      '    display: block !important;',
      '    flex: 0 0 48px !important;',
      '    height: 48px !important;',
      '    min-height: 48px !important;',
      '    max-height: 54px !important;',
      '    overflow: hidden !important;',
      '    visibility: visible !important;',
      '    opacity: 1 !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics {',
      '    display: grid !important;',
      '    grid-template-columns: repeat(5, minmax(88px, 1fr)) !important;',
      '    gap: 6px !important;',
      '    flex: 0 0 auto !important;',
      '    min-height: 60px !important;',
      '    max-height: 76px !important;',
      '    padding: 7px !important;',
      '    overflow-x: auto !important;',
      '    overflow-y: hidden !important;',
      '    visibility: visible !important;',
      '    opacity: 1 !important;',
      '    scrollbar-width: none !important;',
      '    -webkit-overflow-scrolling: touch !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics::-webkit-scrollbar,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics::-webkit-scrollbar,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics::-webkit-scrollbar,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics::-webkit-scrollbar {',
      '    display: none !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics .metric,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics .metric,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics .metric,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics .metric {',
      '    min-width: 88px !important;',
      '    min-height: 0 !important;',
      '    padding: 7px 8px !important;',
      '    gap: 3px !important;',
      '    overflow: hidden !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics .metric__label,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics .metric__label,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics .metric__label,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics .metric__label {',
      '    font-size: 9px !important;',
      '    line-height: 1.05 !important;',
      '    white-space: nowrap !important;',
      '    overflow: hidden !important;',
      '    text-overflow: ellipsis !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics .metric__value,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics .metric__value,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics .metric__value,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics .metric__value {',
      '    font-size: 13px !important;',
      '    line-height: 1.12 !important;',
      '    white-space: nowrap !important;',
      '    overflow: hidden !important;',
      '    text-overflow: ellipsis !important;',
      '  }',
      '}',
      '@media (max-width: 520px) {',
      '  body.terminal-active.gp-dashboard-chart-mode #cvd-chart,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #cvd-chart,',
      '  body.terminal-active.gp-dashboard-chart-mode .cvd-container,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .cvd-container {',
      '    flex-basis: 36px !important;',
      '    height: 36px !important;',
      '    min-height: 36px !important;',
      '    max-height: 40px !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics {',
      '    grid-template-columns: repeat(5, minmax(78px, 1fr)) !important;',
      '    gap: 5px !important;',
      '    min-height: 54px !important;',
      '    max-height: 64px !important;',
      '    padding: 6px !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics .metric,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics .metric,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics .metric,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics .metric {',
      '    min-width: 78px !important;',
      '    padding: 6px 7px !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics .metric__label,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics .metric__label,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics .metric__label,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics .metric__label {',
      '    font-size: 8px !important;',
      '  }',
      '  body.terminal-active.gp-dashboard-chart-mode #analytics .metric__value,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode #analytics .metric__value,',
      '  body.terminal-active.gp-dashboard-chart-mode .analytics .metric__value,',
      '  body.gp-terminal-active.gp-dashboard-chart-mode .analytics .metric__value {',
      '    font-size: 12px !important;',
      '  }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function fireResize() {
    if (resizeTimer) return;
    resizeTimer = window.setTimeout(function () {
      resizeTimer = 0;
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    }, 60);
  }

  function markMetrics() {
    var analytics = document.getElementById('analytics');
    if (analytics) {
      analytics.dataset.gpCvdMobileVisible = VERSION;
      analytics.scrollLeft = 0;
    }
    var cvd = document.getElementById('cvd-chart');
    if (cvd) cvd.dataset.gpCvdMobileVisible = VERSION;
  }

  function refresh() {
    installStyle();
    markMetrics();
  }

  function boot() {
    refresh();
    fireResize();
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', function () {
      window.setTimeout(refresh, 120);
      window.setTimeout(refresh, 420);
    }, { passive: true });
    try {
      new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
    [250, 750, 1500, 3000, 6000].forEach(function (delay) {
      window.setTimeout(refresh, delay);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
