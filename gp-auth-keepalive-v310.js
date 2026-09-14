(function () {
  'use strict';

  if (window.__GP_AUTH_KEEPALIVE_R310__) return;
  window.__GP_AUTH_KEEPALIVE_R310__ = true;

  var AUTH_KEY = 'guardeer_prime_auth_v1';
  var AUTH_FALLBACK_KEY = '__gp_storage_fallback__:' + AUTH_KEY;
  var REGION = 'ap-southeast-2';
  var CLIENT_ID = '61qe4rla3qkm5a76qbiteh7glv';
  var COGNITO_DOMAIN = 'https://ap-southeast-2pjp7vw9m4.auth.ap-southeast-2.amazoncognito.com';
  var HOSTED_TOKEN_URL = COGNITO_DOMAIN.replace(/\/+$/, '') + '/oauth2/token';
  var IDP_URL = 'https://cognito-idp.' + REGION + '.amazonaws.com/';
  var REFRESH_SKEW_MS = 8 * 60 * 1000;
  var MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
  var REFRESH_REQUEST_TIMEOUT_MS = 10000;
  var nativeFetch = window.fetch && window.fetch.bind(window);
  var refreshPromise = null;
  var refreshTimer = null;
  var lastAttemptAt = 0;

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
    } catch (_) {
      return {};
    }
  }

  function rawSession() {
    var value = '';
    try { value = localStorage.getItem(AUTH_KEY) || ''; } catch (_) {}
    if (!value) {
      try { value = sessionStorage.getItem(AUTH_FALLBACK_KEY) || ''; } catch (_) {}
    }
    if (!value) {
      try { value = window.__GP_AUTH_LAST_SESSION__ || ''; } catch (_) {}
    }
    return parseJson(value);
  }

  function normalize(session) {
    if (!session || typeof session !== 'object') return null;
    var token = session.id_token || session.IdToken || session.access_token || session.AccessToken || '';
    var profile = Object.assign({}, session.profile || {}, decodeJwt(token));
    var startedAt = Number(session.sessionStartedAt || session.createdAt || session.savedAt || Date.now());
    var expiresIn = Number(session.expires_in || session.ExpiresIn || 3600);
    var normalized = Object.assign({}, session, {
      id_token: session.id_token || session.IdToken || '',
      access_token: session.access_token || session.AccessToken || '',
      refresh_token: session.refresh_token || session.RefreshToken || '',
      token_type: session.token_type || session.TokenType || 'Bearer',
      expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
      profile: profile,
      sessionStartedAt: startedAt,
      createdAt: Number(session.createdAt || startedAt),
      lastRefreshAt: Number(session.lastRefreshAt || startedAt),
      expiresAt: Number(session.expiresAt || 0),
      sessionExpiresAt: Number(session.sessionExpiresAt || startedAt + MAX_SESSION_MS),
      email: String(session.email || profile.email || profile['cognito:username'] || '').trim().toLowerCase(),
      userId: session.userId || profile.sub || session.email || profile.email || ''
    });
    if (!Number.isFinite(normalized.expiresAt) || normalized.expiresAt <= 0) {
      var jwtExpiry = Number(profile.exp || 0) * 1000;
      normalized.expiresAt = jwtExpiry > 0 ? jwtExpiry : Date.now() + normalized.expires_in * 1000;
    }
    if (!Number.isFinite(normalized.sessionExpiresAt) || normalized.sessionExpiresAt <= 0) {
      normalized.sessionExpiresAt = startedAt + MAX_SESSION_MS;
    }
    delete normalized.keepAliveSoftExtended;
    return normalized;
  }

  function writeSession(session) {
    var normalized = normalize(session);
    if (!normalized) return null;
    var encoded = JSON.stringify(normalized);
    try { localStorage.setItem(AUTH_KEY, encoded); } catch (_) {}
    try { sessionStorage.setItem(AUTH_FALLBACK_KEY, encoded); } catch (_) {}
    try { window.__GP_AUTH_LAST_SESSION__ = encoded; } catch (_) {}
    try {
      // A Cognito token rotation is not a login-state or entitlement change.
      // Emitting the broad auth-updated event here makes the terminal rebuild
      // its active chart/tool state in every tab and can turn off PRIME Wall or
      // Order Flow while another tab signs in or refreshes its token.
      window.dispatchEvent(new CustomEvent('guardeer:auth-token-refreshed', {
        detail: { signedIn: true, session: normalized, refreshed: true, tokenOnly: true }
      }));
    } catch (_) {}
    return normalized;
  }

  function hasRefreshToken(session) {
    return Boolean(session && (session.refresh_token || session.RefreshToken));
  }

  function hardExpired(session) {
    session = normalize(session);
    return !session || Date.now() > Number(session.sessionExpiresAt || 0);
  }

  function needsRefresh(session, force) {
    session = normalize(session);
    return Boolean(
      session &&
      hasRefreshToken(session) &&
      !hardExpired(session) &&
      (force || Date.now() >= Number(session.expiresAt || 0) - REFRESH_SKEW_MS)
    );
  }

  function refreshedSession(previous, result) {
    previous = normalize(previous);
    result = result || {};
    var idToken = result.id_token || result.IdToken || previous.id_token || '';
    var accessToken = result.access_token || result.AccessToken || previous.access_token || '';
    var refreshToken = result.refresh_token || result.RefreshToken || previous.refresh_token || '';
    var expiresIn = Number(result.expires_in || result.ExpiresIn || previous.expires_in || 3600);
    var profile = Object.assign({}, previous.profile || {}, decodeJwt(idToken || accessToken));
    var now = Date.now();
    return Object.assign({}, previous, {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: result.token_type || result.TokenType || previous.token_type || 'Bearer',
      expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
      profile: profile,
      userId: previous.userId || profile.sub || previous.email || profile.email || '',
      email: String(previous.email || profile.email || profile['cognito:username'] || '').trim().toLowerCase(),
      lastRefreshAt: now,
      expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000
    });
  }

  async function refreshResponse(url, init) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = 0;
    var deadline = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        if (controller) controller.abort();
        var error = new Error('Session refresh temporarily timed out.');
        error.code = 'AUTH_REFRESH_TIMEOUT';
        reject(error);
      }, REFRESH_REQUEST_TIMEOUT_MS);
    });
    var request = Object.assign({}, init);
    if (controller) request.signal = controller.signal;
    try {
      // Include reading the response body: headers alone do not finish a
      // refresh. An unavailable identity service must not pin refreshPromise.
      return await Promise.race([Promise.resolve().then(function () {
        return nativeFetch(url, request);
      }).then(async function (response) {
        return { response: response, text: await response.text() };
      }), deadline]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function hostedRefresh(session) {
    var body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: session.refresh_token || session.RefreshToken || ''
    });
    var received = await refreshResponse(HOSTED_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
      cache: 'no-store'
    });
    var response = received.response;
    var text = received.text;
    var data = parseJson(text) || {};
    if (!response.ok) {
      var error = new Error(data.error_description || data.error || data.message || text || ('Refresh failed (' + response.status + ').'));
      error.code = data.error || data.code || '';
      error.responseText = text;
      throw error;
    }
    return data;
  }

  async function idpRefresh(session) {
    var received = await refreshResponse(IDP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
      },
      body: JSON.stringify({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: session.refresh_token || session.RefreshToken || '' }
      }),
      cache: 'no-store'
    });
    var response = received.response;
    var text = received.text;
    var data = parseJson(text) || {};
    if (!response.ok) {
      var error = new Error(data.message || data.Message || data.__type || text || ('Refresh failed (' + response.status + ').'));
      error.code = data.__type || data.code || '';
      error.responseText = text;
      throw error;
    }
    return data.AuthenticationResult || data;
  }

  function definitivelyInvalid(error) {
    var value = String(error && (error.code || error.message || error.responseText) || '').toLowerCase();
    return value.indexOf('invalid_grant') >= 0 ||
      value.indexOf('notauthorized') >= 0 ||
      (value.indexOf('refresh token') >= 0 && (value.indexOf('expired') >= 0 || value.indexOf('revoked') >= 0));
  }

  function schedule(session) {
    try {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = null;
      session = normalize(session || rawSession());
      if (!session || !hasRefreshToken(session) || hardExpired(session)) return;
      var wait = Math.max(15000, Math.min(15 * 60 * 1000, Number(session.expiresAt || 0) - Date.now() - REFRESH_SKEW_MS));
      refreshTimer = window.setTimeout(function () {
        refreshTimer = null;
        ensureFreshSession('timer', false).catch(function () {});
      }, wait);
    } catch (_) {}
  }

  async function ensureFreshSession(reason, force) {
    var session = normalize(rawSession());
    if (!nativeFetch || !needsRefresh(session, Boolean(force))) {
      schedule(session);
      return session;
    }
    if (refreshPromise) return refreshPromise;
    if (!force && Date.now() - lastAttemptAt < 20000) return session;
    lastAttemptAt = Date.now();
    refreshPromise = (async function () {
      try {
        var result;
        try { result = await hostedRefresh(session); }
        catch (_) { result = await idpRefresh(session); }
        var updated = writeSession(refreshedSession(session, result));
        schedule(updated);
        return updated;
      } catch (error) {
        if (definitivelyInvalid(error)) {
          writeSession(Object.assign({}, session, {
            sessionExpiresAt: Date.now() - 1,
            refreshInvalidReason: error.message || 'invalid-refresh-token'
          }));
        } else {
          console.warn('[HUNTER] Cognito refresh temporarily unavailable; keeping the browser session:', error && error.message || error);
        }
        schedule(session);
        return normalize(rawSession()) || session;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function protectedApiUrl(value) {
    var url = String(value || '');
    if (!url || url.indexOf('/oauth2/token') >= 0 || url.indexOf('cognito-idp.') >= 0) return false;
    return url.indexOf('execute-api.ap-southeast-2.amazonaws.com') >= 0 ||
      /\/(check-access|admin|payments|prime-indicator|signal-sync|prime-signal-sync)(\/|$|\?)/i.test(url);
  }

  function withAuthorization(input, init, session) {
    var token = session && (session.id_token || session.IdToken || session.access_token || session.AccessToken) || '';
    if (!token) return { input: input, init: init };
    var isRequest = typeof Request !== 'undefined' && input instanceof Request;
    var headers = new Headers(init && init.headers || isRequest && input.headers || {});
    // A peer tab may have rotated Cognito tokens after the caller captured its
    // in-memory session. Protected requests must always use the newest shared
    // browser token instead of preserving a stale Authorization header.
    headers.set('Authorization', 'Bearer ' + token);
    if (isRequest) {
      return { input: new Request(input, Object.assign({}, init || {}, { headers: headers })), init: undefined };
    }
    return { input: input, init: Object.assign({}, init || {}, { headers: headers }) };
  }

  if (nativeFetch) {
    window.fetch = async function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : input && input.url || ''; } catch (_) {}
      if (!protectedApiUrl(url)) return nativeFetch(input, init);
      var session = await ensureFreshSession('protected-fetch', false);
      var request = withAuthorization(input, init, session);
      return nativeFetch(request.input, request.init);
    };
  }

  window.GuardeerAuthKeepAlive = {
    version: 'r396-auth-refresh-timeout-v1',
    getSession: function () { return normalize(rawSession()); },
    ensureFreshSession: ensureFreshSession,
    writeSession: writeSession,
    diagnostics: function () {
      var session = normalize(rawSession());
      return {
        version: 'r396-auth-refresh-timeout-v1',
        hasSession: Boolean(session),
        hasRefreshToken: hasRefreshToken(session),
        expiresAt: Number(session && session.expiresAt || 0),
        sessionExpiresAt: Number(session && session.sessionExpiresAt || 0),
        softExpiryFabricationDisabled: true
      };
    }
  };

  // Prevent the legacy inline V255 runtime from installing its soft-expiry
  // Storage.getItem monkey-patch. R310 always exposes the real JWT expiry.
  window.__GP_AUTH_KEEPALIVE_V255__ = true;
  schedule(normalize(rawSession()));
  ensureFreshSession('startup', false).catch(function () {});
  window.addEventListener('focus', function () { ensureFreshSession('focus', false).catch(function () {}); });
  window.addEventListener('online', function () { ensureFreshSession('online', true).catch(function () {}); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) ensureFreshSession('visible', false).catch(function () {});
  });
})();
