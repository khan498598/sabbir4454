// HUNTER runtime config
// Never place vendor API keys in this browser file, including for local testing.
// Rotated FMP/Massive keys live only in AWS Secrets Manager behind the authenticated proxy.
window.GUARDEER_CONFIG = {
  TWELVE_DATA_API_KEY: '',

  // Non-secret compatibility markers enable the existing chart adapter. The
  // secure proxy removes these values before forwarding the request; real
  // vendor credentials stay only in AWS Secrets Manager.
  MASSIVE_API_KEY: 'GUARDEER_SECURE_PROXY',
  MASSIVE_FEED_ENABLED: true,

  // Admin emergency access only. Prime access must come from an approved backend entitlement.
  // Keep MANUAL_PREMIUM_EMAILS and EMERGENCY_FULL_ACCESS disabled so existing/free users cannot bypass payment.
  MANUAL_PREMIUM_EMAILS: [],
  MANUAL_ADMIN_EMAILS: [],
  EMERGENCY_FULL_ACCESS: false,

  // Link used by Viewer/free accounts when they click Get Access / Buy Access.
  ACCESS_PURCHASE_URL: 'https://www.guardeer.in/latest-offers',


  // AWS backend for access control. Legacy NOWPayments checkout is intentionally disabled.
  // Example: PRIME_ACCESS_API_BASE_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com'
  PRIME_ACCESS_API_BASE_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com',
  PRIME_CHECK_ACCESS_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com/check-access',

  // Discord Access is exposed only through the canonical same-origin Amplify
  // proxy. The OAuth binding cookie is host-only, so fail closed on www until
  // www redirects to the exact registered callback host.
  DISCORD_ACCESS_API_BASE_URL:
    window.location.origin === 'https://guardeerprime.com' ? '/' : '',

  // R291 strict one-active-device session service.
  // A second browser/device is blocked until the active device signs out or its lease expires.
  PRIME_DEVICE_SESSION_ENABLED: true,
  PRIME_DEVICE_SESSION_API_BASE_URL: 'https://rew1h6zbe9.execute-api.ap-southeast-2.amazonaws.com',
  PRIME_MARKET_PROXY_BASE_URL: 'https://hov6jr6ywd.execute-api.ap-southeast-2.amazonaws.com',
  PRIME_MARKET_PROXY_ENABLED: true,
  PRIME_MARKET_DATA_SECURE_MARKER: 'GUARDEER_SECURE_PROXY',
  PRIME_MARKET_DATA_ALLOW_SYNTHETIC: false,
  PRIME_DEVICE_SESSION_HEARTBEAT_MS: 45000,

  // Isolated EKQR/UPI payment adapter. Keep disabled until the production
  // payment service and webhook are available.
  // USD catalog prices are display-only; they must never be sent to EKQR as INR.
  // No EKQR credential is ever stored in this browser file.
  PRIME_PAYMENTS_ENABLED: false,
  PRIME_PAYMENT_API_BASE_URL: 'https://vfd5rktjp8.execute-api.ap-southeast-2.amazonaws.com',
  EKQR_CREATE_ORDER_URL: 'https://vfd5rktjp8.execute-api.ap-southeast-2.amazonaws.com/payments/ekqr/create',
  EKQR_PAYMENT_STATUS_URL: 'https://vfd5rktjp8.execute-api.ap-southeast-2.amazonaws.com/payments/ekqr/status',
  PRIME_PAYMENT_PLANS: {
    monthly: {
      displayAmount: '35.00',
      displayCurrency: 'USD',
      chargeAmount: '3300.00',
      chargeCurrency: 'INR',
      priceBookVersion: '2026-09-05-monthly35-inr3300-v2',
      network: 'UPI'
    }
  },

  // Legacy fields remain blank for backward compatibility only.
  NOWPAYMENTS_CREATE_INVOICE_URL: '',
  NOWPAYMENTS_PAYMENT_STATUS_URL: '',

  // Admin monitoring API. Only admin users can see/use the Monitoring dashboard.
  PRIME_ADMIN_API_BASE_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com',
  ADMIN_API_BASE_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com',
  ACCESS_API_BASE_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com',
  CHECK_ACCESS_URL: 'https://zcf6ayq2pe.execute-api.ap-southeast-2.amazonaws.com/check-access',
  CREATE_INVOICE_URL: '',
  NOWPAYMENTS_IPN_URL: '',
  ADMIN_DASHBOARD_PREVIEW: false,


  // Prime FXBook / Trading Journal backend connector.
  // For local-only testing set PRIME_FXBOOK_BACKEND_MODE: 'local'.
  // For production MT4/MT5, broker APIs, exchanges and webhooks, keep 'aws'
  // and deploy the secure backend connector. Browser stores only safe setup;
  // real credentials/secrets must be handled by backend/Secrets Manager.
  PRIME_FXBOOK_BACKEND_MODE: 'aws',
  PRIME_FXBOOK_API_BASE_URL: 'https://uhhkpq9fb1.execute-api.ap-southeast-2.amazonaws.com',
  PRIME_FXBOOK_AWS_REGION: 'ap-southeast-2',
  PRIME_FXBOOK_AUTH_TOKEN_STORAGE_KEY: 'guardeer_prime_auth_v1',

  // Legacy browser-computed Prime/KAIRI signal publication is retired.
  // The authenticated KAIRI early-access advisory reads only its separately pinned GET ledger after EULA acceptance.
  PRIME_INDICATOR_SIGNAL_SYNC_ENABLED: false,
  PRIME_INDICATOR_SIGNAL_SYNC_URL: '',
  PRIME_KAIRI_SIGNAL_SYNC_ENABLED: false,
  PRIME_KAIRI_SIGNAL_SYNC_URL: '',
  PRIME_INDICATOR_SIGNAL_SYNC_FALLBACK_URLS: [],
  PRIME_INDICATOR_SHARED_SIGNAL_WINDOW_MS: 30000,
  PRIME_INDICATOR_SIGNAL_SYNC_TIMEOUT_MS: 3200,
  PRIME_INDICATOR_MIN_SIGNAL_CONFIDENCE: 80,
  PRIME_INDICATOR_MIN_SCORE_MULTIPLIER: 1.35,
  PRIME_INDICATOR_POST_SL_COOLDOWN_CANDLES: 3,
  PRIME_INDICATOR_POST_TP_COOLDOWN_CANDLES: 1,

  // Prime Indicator fundamental calendar uses the authenticated AWS proxy.
  PRIME_CALENDAR_PROXY_URL: 'https://hov6jr6ywd.execute-api.ap-southeast-2.amazonaws.com/market-proxy/fmp?path=%2Fstable%2Feconomic-calendar',
  TRADING_ECONOMICS_API_KEY: '',
  // This is a non-secret compatibility marker, never a real FMP key.
  FMP_API_KEY: 'GUARDEER_SECURE_PROXY',
  // When true and FMP_API_KEY is set, Forex/Gold historical candles try FMP first.
  FMP_MARKET_DATA_ENABLED: true,

  // Free calendar is only used when no official key/proxy exists.
  // Keep PRIME_USE_FREE_CALENDAR_FALLBACK false so FMP data is not mixed with prototype/free data.
  PRIME_FREE_FOREX_FACTORY_ENABLED: true,
  PRIME_USE_FREE_CALENDAR_FALLBACK: false,

  // Keep FMP as official release source, but merge ForexFactory/Faireconomy bank holidays as liquidity schedule events.
  PRIME_MERGE_FOREX_FACTORY_HOLIDAYS: true,


  // Chart time zone. Candle axis, crosshair labels and Prime Order Flow time labels are fixed to IST.
  PRIME_CHART_TIMEZONE: 'Asia/Kolkata',
  FOREX_GOLD_CHART_TIMEZONE: 'Asia/Kolkata',
  PRIME_CHART_TIMEZONE_LABEL: 'IST',
};


// Prime FX Book / Trading Journal runtime bridge.
window.GUARDEER_PRIME_CONFIG = window.GUARDEER_PRIME_CONFIG || {};
window.GUARDEER_PRIME_CONFIG.fxBookBackendMode = window.GUARDEER_PRIME_CONFIG.fxBookBackendMode || window.GUARDEER_CONFIG?.PRIME_FXBOOK_BACKEND_MODE || window.GUARDEER_CONFIG?.FXBOOK_BACKEND_MODE || 'aws';
window.GUARDEER_PRIME_CONFIG.fxBookApiBaseUrl = window.GUARDEER_PRIME_CONFIG.fxBookApiBaseUrl || window.GUARDEER_CONFIG?.PRIME_FXBOOK_API_BASE_URL || window.GUARDEER_CONFIG?.FXBOOK_API_BASE_URL || 'https://uhhkpq9fb1.execute-api.ap-southeast-2.amazonaws.com';
window.GUARDEER_PRIME_CONFIG.fxBookAwsRegion = window.GUARDEER_PRIME_CONFIG.fxBookAwsRegion || window.GUARDEER_CONFIG?.PRIME_FXBOOK_AWS_REGION || window.GUARDEER_CONFIG?.FXBOOK_AWS_REGION || 'ap-southeast-2';
window.GUARDEER_PRIME_CONFIG.fxBookAuthTokenStorageKey = window.GUARDEER_PRIME_CONFIG.fxBookAuthTokenStorageKey || window.GUARDEER_CONFIG?.PRIME_FXBOOK_AUTH_TOKEN_STORAGE_KEY || window.GUARDEER_CONFIG?.FXBOOK_AUTH_TOKEN_STORAGE_KEY || 'guardeer_prime_auth_v1';
window.PRIME_FXBOOK_CONFIG = window.PRIME_FXBOOK_CONFIG || window.GUARDEER_PRIME_CONFIG;
