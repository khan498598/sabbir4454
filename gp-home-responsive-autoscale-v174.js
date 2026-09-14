(function () {
  'use strict';

  var VERSION = 'v174-home-responsive-autoscale';
  var previousHtmlOverflowX = null;
  var previousBodyOverflowX = null;
  var observer = null;
  var raf = 0;

  function isTerminalOpen() {
    return document.body.classList.contains('terminal-active') ||
      document.body.classList.contains('gp-terminal-active') ||
      document.body.classList.contains('gp-dashboard-ready');
  }

  function isHomeOpen() {
    return !!document.getElementById('home-page') && !isTerminalOpen();
  }

  function scheduleApply() {
    if (raf) return;
    raf = window.requestAnimationFrame(function () {
      raf = 0;
      apply();
    });
  }

  function apply() {
    var active = isHomeOpen();
    document.documentElement.classList.toggle('gp-v174-home-active', active);
    document.body.classList.toggle('gp-v174-home-active', active);

    if (active) {
      if (previousHtmlOverflowX === null) previousHtmlOverflowX = document.documentElement.style.overflowX || '';
      if (previousBodyOverflowX === null) previousBodyOverflowX = document.body.style.overflowX || '';
      if (document.documentElement.style.overflowX !== 'hidden') document.documentElement.style.overflowX = 'hidden';
      if (document.body.style.overflowX !== 'hidden') document.body.style.overflowX = 'hidden';

      var home = document.getElementById('home-page');
      if (home) {
        if (home.style.maxWidth !== '100vw') home.style.maxWidth = '100vw';
        if (home.style.overflowX !== 'hidden') home.style.overflowX = 'hidden';
      }
    } else {
      document.documentElement.classList.remove('gp-v174-home-active');
      document.body.classList.remove('gp-v174-home-active');
      if (previousHtmlOverflowX !== null) document.documentElement.style.overflowX = previousHtmlOverflowX;
      if (previousBodyOverflowX !== null) document.body.style.overflowX = previousBodyOverflowX;
      previousHtmlOverflowX = null;
      previousBodyOverflowX = null;
    }
  }

  function start() {
    apply();
    if (!observer && window.MutationObserver) {
      observer = new MutationObserver(scheduleApply);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
    window.addEventListener('resize', scheduleApply, { passive: true });
    window.addEventListener('orientationchange', scheduleApply, { passive: true });
    window.addEventListener('guardeer:terminal-visibility-changed', scheduleApply, { passive: true });
    window.addEventListener('guardeer:auth-updated', scheduleApply, { passive: true });
    window.setTimeout(apply, 80);
    window.setTimeout(apply, 350);
    window.setTimeout(apply, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.GPHomeResponsiveAutoscaleV174 = {
    version: VERSION,
    apply: apply,
    isHomeOpen: isHomeOpen
  };
})();
