(function () {
  'use strict';
  if (window.__GP_INVESTOR_UI_V113__) return;
  window.__GP_INVESTOR_UI_V113__ = true;

  var VERSION = 'gp-investor-ui-v113';
  var wasKairiActive = false;
  var drawWasOpenBeforeKairi = false;
  var drawUsedInsideKairi = false;
  var opacityUserOverride = false;
  var opacitySequence = 0;

  function isDrawOpen() {
    var toolbar = document.getElementById('gp-pro-draw-toolbar');
    return !!(toolbar && toolbar.classList.contains('is-open'));
  }

  function setZeroRange(id, labelSelector, dispatch) {
    var input = document.getElementById(id);
    if (!input) return false;
    input.min = '0';
    input.value = '0';
    input.setAttribute('value', '0');
    if (labelSelector) {
      var value = document.querySelector(labelSelector);
      if (value) value.textContent = '0%';
    }
    if (dispatch) {
      try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }
    return true;
  }

  function applyOrderFlowOpacityZero(dispatch, force) {
    if (opacityUserOverride && !force) return false;
    var changed = false;
    changed = setZeroRange('gp-heat-opacity', '[data-range-value="gp-heat-opacity"]', dispatch) || changed;
    changed = setZeroRange('prime-heat-opacity', '', dispatch) || changed;

    try {
      var runtime = window.GuardeerPrimeRuntime;
      var heatmap = runtime && (runtime.orderFlowHeatmap || runtime.heatmap);
      if (heatmap && typeof heatmap.setOptions === 'function') heatmap.setOptions({ opacity: 0 });
      else if (heatmap && typeof heatmap.setOpacity === 'function') heatmap.setOpacity(0);
    } catch (_) {}

    return changed;
  }

  function scheduleOpacityZero(force) {
    var sequence = ++opacitySequence;
    [0, 35, 120, 340, 760].forEach(function (delay) {
      window.setTimeout(function () {
        if (sequence !== opacitySequence) return;
        applyOrderFlowOpacityZero(true, !!force);
      }, delay);
    });
  }

  function resetOrderFlowDefault() {
    opacityUserOverride = false;
    scheduleOpacityZero(false);
  }

  function syncKairiState() {
    var active = !!(document.body && document.body.classList.contains('gp-kairi-v1-active'));
    if (active && !wasKairiActive) {
      drawWasOpenBeforeKairi = isDrawOpen();
      drawUsedInsideKairi = false;
    } else if (!active && wasKairiActive) {
      if (!drawWasOpenBeforeKairi && drawUsedInsideKairi) {
        try {
          var api = window.GuardeerPrimeProfessionalDrawings;
          if (api && typeof api.close === 'function') api.close();
        } catch (_) {}
      }
      drawWasOpenBeforeKairi = false;
      drawUsedInsideKairi = false;
    }
    wasKairiActive = active;
  }

  function boot() {
    applyOrderFlowOpacityZero(false, true);
    scheduleOpacityZero(false);
    syncKairiState();

    document.addEventListener('input', function (event) {
      var input = event && event.target;
      if (input && input.id === 'gp-heat-opacity' && event.isTrusted) opacityUserOverride = true;
    }, true);
    document.addEventListener('change', function (event) {
      var input = event && event.target;
      if (input && input.id === 'gp-heat-opacity' && event.isTrusted) opacityUserOverride = true;
    }, true);

    document.addEventListener('click', function (event) {
      var closest = event.target && event.target.closest ? event.target.closest.bind(event.target) : null;
      var target = closest ? closest('[data-dashboard-tab="orderflow"], #gp-prime-enable, #tool-flow-toggle, #prime-orderflow-btn, #prime-enable-flow') : null;
      if (target) resetOrderFlowDefault();

      if (document.body.classList.contains('gp-kairi-v1-active') && closest && closest('.gp-draw-tv-rail')) {
        drawUsedInsideKairi = true;
      }
    }, true);

    try {
      if (window.MutationObserver && document.body) {
        var observer = new MutationObserver(syncKairiState);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (_) {}

    window.addEventListener('guardeer:prime-runtime-ready', function () {
      if (!opacityUserOverride) scheduleOpacityZero(false);
    }, { passive: true });

    window.GPInvestorUiV113 = {
      version: VERSION,
      applyOrderFlowOpacityDefault: resetOrderFlowDefault,
      state: function () {
        return {
          kairiActive: wasKairiActive,
          opacityUserOverride: opacityUserOverride,
          opacity: document.getElementById('gp-heat-opacity') ? document.getElementById('gp-heat-opacity').value : null
        };
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
