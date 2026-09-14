(function () {
  'use strict';

  if (window.__GP_ACCESS_TOKEN_RECOVERY_V1__) return;
  window.__GP_ACCESS_TOKEN_RECOVERY_V1__ = true;

  var AUTH_KEY = 'guardeer_prime_auth_v1';
  var FALLBACK_KEY = '__gp_storage_fallback__:' + AUTH_KEY;
  var CLIENT_ID = '61qe4rla3qkm5a76qbiteh7glv';
  var COGNITO_URL = 'https://cognito-idp.ap-southeast-2.amazonaws.com/';
  var baseFetch = window.fetch && window.fetch.bind(window);
  var refreshFlight = null;

  if (!baseFetch) return;

  function parseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function decodeJwt(token) {
    try {
      var part = String(token || '').split('.')[1];
      if (!part) return {};
      part = part.replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      return JSON.parse(atob(part));
    } catch (_) { return {}; }
  }

  function readSession() {
    var raw = '';
    try { raw = localStorage.getItem(AUTH_KEY) || ''; } catch (_) {}
    if (!raw) {
      try { raw = sessionStorage.getItem(FALLBACK_KEY) || ''; } catch (_) {}
    }
    if (!raw) {
      try { raw = window.__GP_AUTH_LAST_SESSION__ || ''; } catch (_) {}
    }
    return parseJson(raw);
  }

  function writeSession(session) {
    if (!session) return null;
    var encoded = JSON.stringify(session);
    try { localStorage.setItem(AUTH_KEY, encoded); } catch (_) {}
    try { sessionStorage.setItem(FALLBACK_KEY, encoded); } catch (_) {}
    try { window.__GP_AUTH_LAST_SESSION__ = encoded; } catch (_) {}
    try {
      // Token rotation keeps the same signed-in user and entitlement.  The
      // broad auth-updated event is reserved for real login/access changes;
      // firing it here rebuilds the terminal and disables active PRIME tools
      // in sibling tabs.
      window.dispatchEvent(new CustomEvent('guardeer:auth-token-refreshed', {
        detail: { signedIn: true, session: session, refreshed: true, tokenOnly: true }
      }));
    } catch (_) {}
    return session;
  }

  function authToken(session) {
    return session && (session.id_token || session.IdToken || session.access_token || session.AccessToken) || '';
  }

  function tokenNeedsRefresh(session) {
    var token = authToken(session);
    if (!token) return true;
    var payload = decodeJwt(token);
    var jwtExpiry = Number(payload.exp || 0) * 1000;
    if (jwtExpiry > 0) return jwtExpiry <= Date.now() + 90000;
    var storedExpiry = Number(session && session.expiresAt || 0);
    return storedExpiry > 0 && storedExpiry <= Date.now() + 90000;
  }

  async function refreshSession(force) {
    var session = readSession();
    if (!session) return null;
    if (!force && !tokenNeedsRefresh(session)) return session;
    if (refreshFlight) return refreshFlight;

    refreshFlight = (async function () {
      try {
        var helper = window.GuardeerAuthKeepAlive;
        if (helper && typeof helper.ensureFreshSession === 'function') {
          var helperSession = await helper.ensureFreshSession('access-check-recovery', true);
          if (helperSession && authToken(helperSession)) return helperSession;
        }

        var refreshToken = session.refresh_token || session.RefreshToken || '';
        if (!refreshToken) return session;
        var response = await baseFetch(COGNITO_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
          },
          body: JSON.stringify({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: { REFRESH_TOKEN: refreshToken }
          }),
          cache: 'no-store'
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) return session;
        var result = data.AuthenticationResult || data || {};
        var now = Date.now();
        var expiresIn = Number(result.ExpiresIn || result.expires_in || session.expires_in || 3600);
        var idToken = result.IdToken || result.id_token || session.id_token || session.IdToken || '';
        var accessToken = result.AccessToken || result.access_token || session.access_token || session.AccessToken || '';
        var profile = Object.assign({}, session.profile || {}, decodeJwt(idToken || accessToken));
        return writeSession(Object.assign({}, session, {
          id_token: idToken,
          access_token: accessToken,
          refresh_token: result.RefreshToken || result.refresh_token || refreshToken,
          token_type: result.TokenType || result.token_type || session.token_type || 'Bearer',
          expires_in: expiresIn,
          expiresAt: now + Math.max(60, expiresIn) * 1000,
          lastRefreshAt: now,
          profile: profile,
          email: String(session.email || profile.email || profile['cognito:username'] || '').trim().toLowerCase(),
          userId: session.userId || profile.sub || session.email || profile.email || ''
        }));
      } catch (error) {
        console.warn('[HUNTER] Access token refresh was deferred:', error && error.message || error);
        return session;
      } finally {
        refreshFlight = null;
      }
    })();

    return refreshFlight;
  }

  function isCheckAccessUrl(value) {
    try {
      var url = new URL(String(value || ''), window.location.href);
      return /\/check-access\/?$/i.test(url.pathname);
    } catch (_) {
      return /\/check-access(?:[/?#]|$)/i.test(String(value || ''));
    }
  }

  function withAuthorization(input, init, session) {
    var token = authToken(session);
    var isRequest = typeof Request !== 'undefined' && input instanceof Request;
    var headers = new Headers((init && init.headers) || (isRequest && input.headers) || {});
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    var nextInit = Object.assign({}, init || {}, { headers: headers, cache: 'no-store' });
    if (isRequest) return { input: new Request(input, nextInit), init: undefined };
    return { input: input, init: nextInit };
  }

  window.fetch = async function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : input && input.url || ''; } catch (_) {}
    if (!isCheckAccessUrl(url)) return baseFetch(input, init);

    var session = await refreshSession(false);
    var first = withAuthorization(input, init, session);
    var response = await baseFetch(first.input, first.init);
    if (response.status !== 401) return response;

    session = await refreshSession(true);
    var retry = withAuthorization(input, init, session);
    return baseFetch(retry.input, retry.init);
  };

  window.GuardeerAccessTokenRecovery = {
    version: 'r298-access-token-recovery',
    getSession: readSession,
    refresh: refreshSession
  };
})();
