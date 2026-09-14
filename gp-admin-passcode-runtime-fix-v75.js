(function(){
  if (window.__GP_ADMIN_PASSCODE_RUNTIME_FIX_V301__) return;
  window.__GP_ADMIN_PASSCODE_RUNTIME_FIX_V301__ = true;

  var PASS_KEY = 'guardeer_prime_admin_monitoring_passcode_v1';
  var ADMIN_API = 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com';
  var PAYMENT_API = ADMIN_API;

  function readPasscode(){
    try { return sessionStorage.getItem(PASS_KEY) || localStorage.getItem(PASS_KEY) || window.__GP_ADMIN_PASSCODE_CACHE__ || ''; }
    catch(e){ return window.__GP_ADMIN_PASSCODE_CACHE__ || ''; }
  }


  function readAuthIdentity(){
    try {
      var keys = ['guardeer_prime_auth_v1'];
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i) || '';
        if (k.toLowerCase().indexOf('guardeer') >= 0 && k.toLowerCase().indexOf('auth') >= 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j += 1) {
        var raw = localStorage.getItem(keys[j]) || sessionStorage.getItem(keys[j]) || '';
        if (!raw) continue;
        var obj = JSON.parse(raw);
        var email = String(obj.email || (obj.profile && obj.profile.email) || '').toLowerCase();
        var userId = String(obj.userId || obj.sub || (obj.profile && obj.profile.sub) || '');
        if (email || userId) return { email: email, userId: userId };
      }
    } catch(e) {}
    return { email: '', userId: '' };
  }

  function savePasscode(v){
    var p = String(v || '').trim();
    if (!p) return '';
    window.__GP_ADMIN_PASSCODE_CACHE__ = p;
    try { sessionStorage.setItem(PASS_KEY, p); } catch(e) {}
    try { localStorage.setItem(PASS_KEY, p); } catch(e) {}
    return p;
  }

  function getPasscodeForAdminRequest(){
    var p = readPasscode();
    if (p) return p;
    p = prompt('Enter Admin Monitoring passcode:', '');
    if (p === null) return '';
    return savePasscode(p);
  }

  function isAdminUrl(url){
    return /\/admin(\/|\?|$)/i.test(String(url || ''));
  }

  function isCheckAccessUrl(url){
    return /\/check-access(\/|\?|$)/i.test(String(url || ''));
  }

  function isPaymentUrl(url){
    // Legacy payment routes remain on the access-control backend and are disabled by R287.
    // /check-access must NOT be treated as payment route, otherwise manual
    // admin grants are not visible to users.
    return /(\/payments\/|\/create-invoice(\/|\?|$)|\/payment-status(\/|\?|$))/i.test(String(url || ''));
  }

  function rewriteBase(url, fromBase, toBase){
    return String(url || '').indexOf(fromBase) !== -1 ? String(url).split(fromBase).join(toBase) : String(url || '');
  }

  function toRequest(input, nextUrl){
    if (typeof input === 'string') return nextUrl;
    try { return new Request(nextUrl, input); } catch(e) { return input; }
  }

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function(input, init){
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var admin = isAdminUrl(url);

        if (admin) {
          var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          if (method === 'GET' && /\/admin\/users\/?(?:\?|$)/i.test(url) && !/\/admin\/users\/(?:grant-full|create-or-approve|revoke-access|ban|unban|delete)/i.test(url)) {
            try {
              var adminListUrl = new URL(url, window.location.href);
              if (!adminListUrl.searchParams.has('limit')) adminListUrl.searchParams.set('limit', '10000');
              input = toRequest(input, adminListUrl.toString());
              url = adminListUrl.toString();
            } catch(e) {}
          }
          if (url.indexOf(PAYMENT_API) !== -1) {
            var adminUrl = rewriteBase(url, PAYMENT_API, ADMIN_API);
            input = toRequest(input, adminUrl);
            url = adminUrl;
          }
          init = init || {};
          var headers = new Headers(init.headers || (input && input.headers) || {});
          var passcode = getPasscodeForAdminRequest();
          if (passcode) {
            headers.set('x-admin-passcode', passcode);
            headers.set('x-monitoring-passcode', passcode);
          }
          // V181: /admin/* backend authenticates admin from Cognito Authorization + passcode.
          // Do NOT send normal user identity headers to /admin/users; Lambda can throw 500
          // on some builds when x-guardeer-userid/email are present on admin endpoints.
          headers.delete('x-guardeer-userid');
          headers.delete('x-guardeer-email');
          init.headers = headers;
        } else if (isCheckAccessUrl(url)) {
          // Manual monthly/yearly grants are written by Admin Panel on access-control backend.
          // Keep user access checks on that same backend, without extra duplicated sync fetches.
          if (url.indexOf(PAYMENT_API) !== -1) {
            var accessUrl = rewriteBase(url, PAYMENT_API, ADMIN_API);
            input = toRequest(input, accessUrl);
            url = accessUrl;
          } else if (url.indexOf(ADMIN_API) === -1 && !/^https?:/i.test(String(url || ''))) {
            var relPath = String(url || '/check-access');
            if (relPath.charAt(0) !== '/') relPath = '/' + relPath;
            var relUrl = ADMIN_API.replace(/\/+$/, '') + relPath;
            input = toRequest(input, relUrl);
            url = relUrl;
          }
        } else if (isPaymentUrl(url)) {
          if ((window.GUARDEER_CONFIG || {}).PRIME_PAYMENTS_ENABLED === false) {
            return Promise.resolve(new Response(JSON.stringify({ ok: false, code: 'PAYMENTS_DISABLED', error: 'Online payments are temporarily unavailable.' }), {
              status: 503,
              headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
            }));
          }
          if (url.indexOf(ADMIN_API) !== -1) {
            var payUrl = rewriteBase(url, ADMIN_API, PAYMENT_API);
            input = toRequest(input, payUrl);
            url = payUrl;
          }
        }
      } catch(e) {}
      return nativeFetch.call(this, input, init);
    };
  }

  try {
    window.GP_PAYMENT_API_BASE_URL = PAYMENT_API;
    window.GP_ADMIN_API_BASE_URL = ADMIN_API;
  } catch(e) {}
})();
