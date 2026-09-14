(function () {
  'use strict';

  if (window.__GP_AUTH_NAVIGATION_FIX_V5__) return;
  window.__GP_AUTH_NAVIGATION_FIX_V5__ = true;

  var AUTH_KEY = 'guardeer_prime_auth_v1';
  var PKCE_KEY = 'guardeer_pkce';
  var AFTER_LOGIN_KEY = 'guardeer_after_login_target';
  var FALLBACK_AUTH_KEY = '__gp_storage_fallback__:' + AUTH_KEY;
  var FORCE_PUBLIC_HOME_KEY = 'guardeer_force_public_home_v3';
  var CLIENT_ID = '61qe4rla3qkm5a76qbiteh7glv';
  var COGNITO_DOMAIN = 'https://ap-southeast-2pjp7vw9m4.auth.ap-southeast-2.amazoncognito.com';
  var LOGOUT_SELECTOR = '#home-logout-btn, .home-logout-btn, [data-action="logout"], [data-gp-auth="logout"]';
  var LOGIN_SELECTOR = '[data-gp-auth="login"], [data-action="login"], #home-login-btn, .home-login-btn, [data-open-prime-auth], [data-open-auth]';
  var TERMINAL_OPEN_SELECTOR = '#home-launch-btn, #home-launch-btn-2, [data-open-terminal]';
  var logoutInFlight = false;
  var publicLandingActive = false;
  var landingAuthWriteHold = false;
  var deferredLandingSession = null;
  var homeObserver = null;
  var preservedHome = null;
  var restoreTimer = 0;
  var originalStorageSetItem = Storage.prototype.setItem;
  var originalHistoryReplaceState = window.history.replaceState;
  var originalHistoryPushState = window.history.pushState;

  function parseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function isAuthCallback() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.has('code') || params.has('error');
    } catch (_) {
      return false;
    }
  }

  function isEkqrReturn() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var paymentId = String(params.get('paymentId') || '').trim();
      return params.get('payment') === 'ekqr-return' && /^gek_[a-f0-9]{32}$/.test(paymentId);
    } catch (_) {
      return false;
    }
  }

  function dashboardRouteIsActive() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var view = String(params.get('view') || '').toLowerCase();
      var hash = String(window.location.hash || '').toLowerCase();
      return view === 'terminal' || view === 'dashboard' || hash.indexOf('dashboard') >= 0 || hash.indexOf('terminal') >= 0;
    } catch (_) {
      return false;
    }
  }

  function isPublicLandingRoute() {
    if (isAuthCallback() || isEkqrReturn()) return false;
    try {
      var path = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';
      if (path !== '/' && path !== '/index.html') return false;
      var params = new URLSearchParams(window.location.search || '');
      var view = String(params.get('view') || '').trim();
      if (publicHomeRequested()) return true;
      if (dashboardRouteIsActive()) return !hasSession();
      return !view;
    } catch (_) {
      return true;
    }
  }

  function readRawSession() {
    var value = '';
    try { value = localStorage.getItem(AUTH_KEY) || ''; } catch (_) {}
    if (!value) {
      try { value = sessionStorage.getItem(FALLBACK_AUTH_KEY) || ''; } catch (_) {}
    }
    if (!value) {
      try { value = window.__GP_AUTH_LAST_SESSION__ || ''; } catch (_) {}
    }
    return parseJson(value);
  }

  function hasSession() {
    var session = readRawSession();
    return Boolean(session && (
      session.id_token || session.IdToken ||
      session.access_token || session.AccessToken ||
      session.refresh_token || session.RefreshToken
    ));
  }

  function publicHomeRequested() {
    try { return sessionStorage.getItem(FORCE_PUBLIC_HOME_KEY) === '1'; } catch (_) { return false; }
  }

  function setPublicHomeRequested(active) {
    try {
      if (active) sessionStorage.setItem(FORCE_PUBLIC_HOME_KEY, '1');
      else sessionStorage.removeItem(FORCE_PUBLIC_HOME_KEY);
    } catch (_) {}
  }

  function installAuthWriteGuard() {
    if (window.__GP_PUBLIC_LANDING_AUTH_WRITE_GUARD_V5__) return;
    window.__GP_PUBLIC_LANDING_AUTH_WRITE_GUARD_V5__ = true;
    Storage.prototype.setItem = function (key, value) {
      var blocked = landingAuthWriteHold && (
        (this === localStorage && key === AUTH_KEY) ||
        (this === sessionStorage && key === FALLBACK_AUTH_KEY)
      );
      if (blocked) return;
      return originalStorageSetItem.apply(this, arguments);
    };
  }

  function purgeAuthStorage() {
    try { localStorage.removeItem(AUTH_KEY); } catch (_) {}
    try { sessionStorage.removeItem(PKCE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(AFTER_LOGIN_KEY); } catch (_) {}
    try { sessionStorage.removeItem(FALLBACK_AUTH_KEY); } catch (_) {}
    try { window.__GP_AUTH_LAST_SESSION__ = ''; } catch (_) {}
  }

  function restoreDeferredLandingSession() {
    if (!deferredLandingSession || !publicLandingActive || publicHomeRequested() || isAuthCallback()) return;
    var session = deferredLandingSession;
    deferredLandingSession = null;
    landingAuthWriteHold = false;
    var encoded = JSON.stringify(session);
    try { originalStorageSetItem.call(localStorage, AUTH_KEY, encoded); } catch (_) {}
    try { originalStorageSetItem.call(sessionStorage, FALLBACK_AUTH_KEY, encoded); } catch (_) {}
    try { window.__GP_AUTH_LAST_SESSION__ = encoded; } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('guardeer:auth-updated', {
        detail: { signedIn: true, session: session, target: null, source: 'public-landing-session-restored' }
      }));
    } catch (_) {}
  }

  function normalizePublicRoute() {
    try { originalHistoryReplaceState.call(window.history, null, document.title, '/'); } catch (_) {}
  }

  function publicRouteFenceActive() {
    return publicHomeRequested() || publicLandingActive;
  }

  function terminalRouteRequested(url) {
    if (url === undefined || url === null || url === '') return false;
    try {
      var parsed = new URL(String(url), window.location.href);
      var hash = String(parsed.hash || '').toLowerCase();
      var view = String(parsed.searchParams.get('view') || '').toLowerCase();
      return hash.indexOf('dashboard') >= 0 || hash.indexOf('terminal') >= 0 || view === 'dashboard' || view === 'terminal';
    } catch (_) {
      var value = String(url || '').toLowerCase();
      return value.indexOf('#dashboard') >= 0 || value.indexOf('#terminal') >= 0;
    }
  }

  function installPublicRouteGuard() {
    if (window.__GP_PUBLIC_HOME_HISTORY_GUARD_V5__) return;
    window.__GP_PUBLIC_HOME_HISTORY_GUARD_V5__ = true;
    try {
      window.history.replaceState = function (state, title, url) {
        if (publicRouteFenceActive() && terminalRouteRequested(url)) {
          return originalHistoryReplaceState.call(window.history, state, title, '/');
        }
        return originalHistoryReplaceState.apply(window.history, arguments);
      };
    } catch (_) {}
    try {
      window.history.pushState = function (state, title, url) {
        if (publicRouteFenceActive() && terminalRouteRequested(url)) {
          return originalHistoryReplaceState.call(window.history, state, title, '/');
        }
        return originalHistoryPushState.apply(window.history, arguments);
      };
    } catch (_) {}
  }

  function installPublicHomeStyle() {
    if (document.getElementById('gp-public-home-boundary-style')) return;
    var style = document.createElement('style');
    style.id = 'gp-public-home-boundary-style';
    style.textContent = '' +
      'html.gp-public-home-active #app{display:none!important;visibility:hidden!important;pointer-events:none!important}' +
      'html.gp-public-home-active #home-page{display:block!important;opacity:1!important;visibility:visible!important;transform:none!important;pointer-events:auto!important}' +
      'html.gp-public-home-active #splash-screen,html.gp-public-home-active #preload-fallback{display:none!important;visibility:hidden!important;pointer-events:none!important}';
    document.head.appendChild(style);
  }

  function activatePublicHomeBoundary() {
    publicLandingActive = true;
    installPublicHomeStyle();
    document.documentElement.classList.add('gp-public-home-active');
  }

  function releasePublicHomeBoundary() {
    publicLandingActive = false;
    document.documentElement.classList.remove('gp-public-home-active');
    if (homeObserver) {
      try { homeObserver.disconnect(); } catch (_) {}
      homeObserver = null;
    }
  }

  function removeBlockingLoaders() {
    try { document.body.classList.remove('preload-lock'); } catch (_) {}
    ['preload-fallback', 'splash-screen', 'gp-signing-out-screen'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) {
        node.classList.add('hidden');
        try { node.remove(); } catch (_) {}
      }
    });
  }

  function restorePublicHome() {
    if (!publicLandingActive || isAuthCallback()) return false;
    activatePublicHomeBoundary();
    normalizePublicRoute();
    var home = document.getElementById('home-page') || preservedHome;
    if (!home) return false;

    preservedHome = home;
    if (!home.isConnected && document.body) document.body.prepend(home);

    home.classList.remove('home-page-hidden');
    document.body.classList.remove(
      'terminal-active',
      'gp-terminal-active',
      'gp-dashboard-ready',
      'gp-dashboard-show-panel',
      'gp-dashboard-chart-mode',
      'prime-fxbook-open'
    );
    var app = document.getElementById('app');
    if (app) delete app.dataset.dashboardOpen;
    removeBlockingLoaders();

    if (deferredLandingSession && !restoreTimer) {
      restoreTimer = window.setTimeout(function () {
        restoreTimer = 0;
        restoreDeferredLandingSession();
      }, 1600);
    }
    return true;
  }

  function enforcePublicHomeRoute(event) {
    if (!publicRouteFenceActive() || isAuthCallback()) return false;
    if (event) {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopImmediatePropagation(); } catch (_) {}
    }
    if (publicHomeRequested()) {
      deferredLandingSession = null;
      landingAuthWriteHold = true;
      purgeAuthStorage();
    }
    activatePublicHomeBoundary();
    normalizePublicRoute();
    restorePublicHome();
    window.setTimeout(restorePublicHome, 0);
    window.setTimeout(restorePublicHome, 240);
    return true;
  }

  function showPublicRecovery() {
    if (!publicLandingActive || document.getElementById('home-page') || document.getElementById('gp-public-home-recovery')) return;
    removeBlockingLoaders();
    var recovery = document.createElement('div');
    recovery.id = 'gp-public-home-recovery';
    recovery.innerHTML = '' +
      '<strong>HUNTER <span>PRIME</span></strong>' +
      '<p>The public page did not finish loading.</p>' +
      '<button type="button">Reload homepage</button>';
    var style = document.createElement('style');
    style.textContent = '' +
      '#gp-public-home-recovery{position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;justify-items:center;gap:14px;background:#030715;color:#f8fafc;font-family:Inter,system-ui,sans-serif}' +
      '#gp-public-home-recovery strong{font-size:24px;font-weight:900}' +
      '#gp-public-home-recovery strong span{color:#19d7ff}' +
      '#gp-public-home-recovery p{margin:0;color:#a8b3c7}' +
      '#gp-public-home-recovery button{border:0;border-radius:12px;padding:12px 18px;background:#10cfe3;color:#02111f;font-weight:900;cursor:pointer}';
    document.head.appendChild(style);
    recovery.querySelector('button').addEventListener('click', function () { window.location.replace(window.location.origin + '/'); });
    document.body.appendChild(recovery);
  }

  function watchForPublicHome() {
    if (restorePublicHome()) return;
    if (typeof MutationObserver === 'function') {
      homeObserver = new MutationObserver(function () {
        if (restorePublicHome() && homeObserver) {
          homeObserver.disconnect();
          homeObserver = null;
        }
      });
      homeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.setTimeout(restorePublicHome, 80);
    window.setTimeout(restorePublicHome, 400);
    window.setTimeout(restorePublicHome, 1400);
    window.setTimeout(showPublicRecovery, 9000);
  }

  function startPublicLanding() {
    if (!isPublicLandingRoute()) return;
    var logoutReturn = publicHomeRequested();
    deferredLandingSession = logoutReturn ? null : readRawSession();
    landingAuthWriteHold = true;
    installAuthWriteGuard();
    installPublicRouteGuard();
    purgeAuthStorage();
    activatePublicHomeBoundary();
    normalizePublicRoute();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchForPublicHome, { once: true });
    } else {
      watchForPublicHome();
    }
  }

  function findLogoutTrigger(target) {
    var direct = target && target.closest && target.closest(LOGOUT_SELECTOR);
    if (direct) return direct;
    var control = target && target.closest && target.closest('button, a, [role="button"]');
    if (!control) return null;
    return /^log\s*out$/i.test(String(control.textContent || '').trim()) ? control : null;
  }

  function homeUrl() {
    return window.location.origin + '/';
  }

  function clearLocalAuth() {
    deferredLandingSession = null;
    landingAuthWriteHold = true;
    setPublicHomeRequested(true);
    purgeAuthStorage();
    try {
      window.dispatchEvent(new CustomEvent('guardeer:auth-updated', {
        detail: { signedIn: false, target: null, source: 'logout-public-home-v4' }
      }));
    } catch (_) {}
  }

  function showSigningOutScreen() {
    if (document.getElementById('gp-signing-out-screen')) return;
    var screen = document.createElement('div');
    screen.id = 'gp-signing-out-screen';
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.innerHTML = '' +
      '<div class="gp-signing-out-card">' +
        '<strong>HUNTER <span>PRIME</span></strong>' +
        '<p>Signing out securely...</p>' +
      '</div>';
    var style = document.createElement('style');
    style.textContent = '' +
      '#gp-signing-out-screen{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle at 18% 16%,rgba(25,215,255,.16),transparent 34%),linear-gradient(180deg,#030715,#070a18);color:#f8fafc;font-family:Inter,system-ui,sans-serif}' +
      '#gp-signing-out-screen .gp-signing-out-card{display:grid;justify-items:center;gap:14px;padding:34px 42px;border:1px solid rgba(148,163,184,.2);border-radius:28px;background:rgba(10,15,31,.92);box-shadow:0 30px 90px rgba(0,0,0,.55)}' +
      '#gp-signing-out-screen strong{font-size:24px;font-weight:900;letter-spacing:-.03em}' +
      '#gp-signing-out-screen strong span{color:#19d7ff}' +
      '#gp-signing-out-screen p{margin:0;color:#a8b3c7;font-weight:700}';
    document.head.appendChild(style);
    document.body.appendChild(screen);
  }

  function waitAtMost(promise, milliseconds) {
    return Promise.race([
      Promise.resolve(promise).catch(function () {}),
      new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); })
    ]);
  }

  async function logoutToHome() {
    if (logoutInFlight) return;
    logoutInFlight = true;
    var session = readRawSession();
    installAuthWriteGuard();
    clearLocalAuth();
    showSigningOutScreen();
    normalizePublicRoute();

    try {
      if (window.GuardeerDeviceSession && typeof window.GuardeerDeviceSession.logout === 'function') {
        await waitAtMost(window.GuardeerDeviceSession.logout(session), 1500);
      } else if (window.GuardeerDeviceSession && typeof window.GuardeerDeviceSession.release === 'function') {
        await waitAtMost(window.GuardeerDeviceSession.release(session), 1500);
      }
    } catch (_) {}

    var target = homeUrl();
    window.setTimeout(function () {
      try { window.location.replace(target); } catch (_) {}
    }, 6000);
    var params = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: target });
    window.location.replace(COGNITO_DOMAIN + '/logout?' + params.toString());
  }

  window.addEventListener('click', function (event) {
    var target = event.target;
    var loginTrigger = target && target.closest && target.closest(LOGIN_SELECTOR);
    if (loginTrigger) {
      deferredLandingSession = null;
      landingAuthWriteHold = false;
      setPublicHomeRequested(false);
      releasePublicHomeBoundary();
      return;
    }
    var terminalTrigger = target && target.closest && target.closest(TERMINAL_OPEN_SELECTOR);
    if (terminalTrigger && hasSession()) {
      setPublicHomeRequested(false);
      releasePublicHomeBoundary();
    }
  }, true);

  document.addEventListener('click', function (event) {
    var trigger = findLogoutTrigger(event.target);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    logoutToHome();
  }, true);

  window.addEventListener('guardeer:auth-updated', function () {
    if (publicHomeRequested() || (publicLandingActive && landingAuthWriteHold)) {
      purgeAuthStorage();
      window.setTimeout(restorePublicHome, 0);
    }
  });

  window.addEventListener('guardeer:login-success', function (event) {
    if (enforcePublicHomeRoute(event)) return;
    deferredLandingSession = null;
    landingAuthWriteHold = false;
    setPublicHomeRequested(false);
    releasePublicHomeBoundary();
  });

  window.addEventListener('guardeer:terminal-visibility-changed', function (event) {
    if (event && event.detail && event.detail.open === true) {
      if (enforcePublicHomeRoute(event)) return;
      setPublicHomeRequested(false);
      releasePublicHomeBoundary();
    }
  });

  window.addEventListener('guardeer:open-dashboard-chart', function (event) {
    enforcePublicHomeRoute(event);
  }, true);

  window.addEventListener('hashchange', function (event) {
    if (enforcePublicHomeRoute(event)) return;
    if (dashboardRouteIsActive()) {
      deferredLandingSession = null;
      landingAuthWriteHold = false;
      setPublicHomeRequested(false);
      releasePublicHomeBoundary();
    }
  }, true);

  window.addEventListener('popstate', function (event) {
    enforcePublicHomeRoute(event);
  }, true);

  if (isAuthCallback() || isEkqrReturn()) {
    setPublicHomeRequested(false);
    landingAuthWriteHold = false;
  } else {
    installPublicRouteGuard();
    var openDashboardWhenReady = function (attempt) {
      if (typeof window.guardeerOpenDashboardChart === 'function') {
        window.guardeerOpenDashboardChart();
        return;
      }
      if (attempt < 160) {
        window.setTimeout(function () { openDashboardWhenReady(attempt + 1); }, 25);
      }
    };
    window.setTimeout(function () { openDashboardWhenReady(0); }, 0);
  }

  window.GuardeerAuthNavigationFix = {
    version: 'v5',
    logoutToHome: logoutToHome,
    restorePublicHome: restorePublicHome,
    isPublicLandingRoute: isPublicLandingRoute,
    isEkqrReturn: isEkqrReturn
  };
})();
