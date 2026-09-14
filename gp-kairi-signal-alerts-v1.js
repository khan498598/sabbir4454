(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.GuardeerKairiSignalAlerts = api;
    var start = function () { api.boot(root); };
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RELEASE = 'gp-kairi-signal-alerts-v1';
  var BUILD = 'kairi-research-20260905-pending-issuance-alerts-candidate';
  var PREFERENCE_PREFIX = 'guardeer_prime_kairi_signal_alerts_v1:';
  var INSTRUMENTS = Object.freeze(['XAUUSD', 'EURUSD']);
  var SIGNAL_ACTIONS = Object.freeze(['BUY', 'SELL']);
  var ARMED_NEXT_SIGNAL_KEY = '@armed:next-eligible';
  // Notification freshness is not trade validity or a claim of execution.
  var MAX_SIGNAL_AGE_MS = 5 * 60 * 1000;
  var MAX_RECEIPT_AGE_MS = 180 * 1000;

  function text(value) {
    return String(value == null ? '' : value);
  }

  function preferenceKey(userId) {
    return PREFERENCE_PREFIX + encodeURIComponent(text(userId).trim().slice(0, 256));
  }

  function normalizeInstrument(value) {
    var instrument = text(value).trim().toUpperCase();
    return INSTRUMENTS.indexOf(instrument) >= 0 ? instrument : null;
  }

  function selectedInstrument(win, catalog) {
    var fallback = normalizeInstrument(catalog && catalog.defaultInstrument) || 'XAUUSD';
    var selected = '';
    try {
      selected = win && win.localStorage && catalog && catalog.selectionStorageKey
        ? win.localStorage.getItem(catalog.selectionStorageKey) || ''
        : '';
    } catch (_) {
      selected = '';
    }
    return normalizeInstrument(selected) || fallback;
  }

  function normalizePreference(value) {
    value = value && typeof value === 'object' ? value : {};
    var key = typeof value.lastSeenSignalKey === 'string' && value.lastSeenSignalKey.length <= 200
      ? value.lastSeenSignalKey
      : null;
    return Object.freeze({
      enabled: value.enabled === true,
      sound: value.sound !== false,
      lastSeenSignalKey: key,
      armedAt: Number.isSafeInteger(value.armedAt) && value.armedAt > 0 ? value.armedAt : null
    });
  }

  function eligibleSignal(envelope, nowMs) {
    nowMs = nowMs === undefined ? Date.now() : nowMs;
    var record = envelope && envelope.current;
    if (!envelope || !record || typeof record !== 'object') return false;
    if (envelope.stale === true || envelope.receiptStale === true) return false;
    // Core/data quality PENDING can mean only the forward outcome is pending.
    // Signal inputs and calendar must independently be complete; never relax
    // DEGRADED/MISSING or notify on a completed historical trade.
    if (['COMPLETE', 'PENDING'].indexOf(envelope.dataQualityStatus) < 0 ||
        ['COMPLETE', 'PENDING'].indexOf(envelope.coreDataStatus) < 0 ||
        envelope.signalInputStatus !== 'COMPLETE') return false;
    if (SIGNAL_ACTIONS.indexOf(record.action) < 0 || record.status !== 'FINAL_ADVISORY') return false;
    if (record.outcome !== 'PENDING') return false;
    if (record.signalInputStatus !== 'COMPLETE' ||
        ['COMPLETE', 'COMPLETE_EMPTY'].indexOf(record.calendarEnrichmentStatus) < 0 ||
        record.calendarFailureCode !== null) return false;
    if (!/^[a-f0-9]{64}$/.test(text(record.semanticHash))) return false;
    var decisionMs = Date.parse(record.decisionAt);
    var receiptMs = Date.parse(envelope.generatedAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(decisionMs) || !Number.isFinite(receiptMs)) return false;
    if (decisionMs > nowMs || decisionMs > receiptMs || receiptMs > nowMs + 60000) return false;
    if (nowMs - decisionMs > MAX_SIGNAL_AGE_MS || nowMs - receiptMs > MAX_RECEIPT_AGE_MS) return false;
    return true;
  }

  function signalKey(record, instrument) {
    if (!record || typeof record !== 'object') return null;
    var market = normalizeInstrument(instrument) || normalizeInstrument(record.instrument) || normalizeInstrument(record.marketSymbol);
    var day = text(record.marketDay).trim();
    var hash = text(record.semanticHash).trim();
    if (!market || !day || !/^[a-f0-9]{64}$/.test(hash)) return null;
    return market + ':' + day + ':' + hash;
  }

  function isArmedForNextSignal(preference) {
    return normalizePreference(preference).lastSeenSignalKey === ARMED_NEXT_SIGNAL_KEY;
  }

  function decisionDayKey(key) {
    var match = /^(XAUUSD|EURUSD):(\d{4}-\d{2}-\d{2}):[a-f0-9]{64}$/.exec(text(key));
    return match ? match[1] + ':' + match[2] : null;
  }

  function transition(preference, envelope, instrument, nowMs) {
    nowMs = nowMs === undefined ? Date.now() : nowMs;
    var current = normalizePreference(preference);
    if (!current.enabled || !Number.isSafeInteger(nowMs) || nowMs <= 0) {
      return Object.freeze({ kind: 'idle', preference: current, record: null });
    }
    var eligible = eligibleSignal(envelope, nowMs);
    var record = eligible ? envelope.current : null;
    var key = record && signalKey(record, instrument);
    if (!current.armedAt) {
      // An existing signal is a baseline, never an immediate alert. Legacy
      // preferences without an arm timestamp migrate through this same gate.
      return Object.freeze({
        kind: key ? 'baseline' : 'armed',
        preference: normalizePreference({ enabled: true, sound: current.sound,
          lastSeenSignalKey: key || current.lastSeenSignalKey || ARMED_NEXT_SIGNAL_KEY,
          armedAt: nowMs }),
        record: key ? record : null
      });
    }
    if (!eligible) {
      return Object.freeze({ kind: 'idle', preference: current, record: null });
    }
    if (!key) return Object.freeze({ kind: 'idle', preference: current, record: null });
    var next = Object.freeze({
      enabled: true,
      sound: current.sound,
      lastSeenSignalKey: key,
      armedAt: current.armedAt
    });
    var previousDay = decisionDayKey(current.lastSeenSignalKey);
    var incomingDay = decisionDayKey(key);
    // The authenticated contract permits only one decision per instrument/day.
    // A new outcome seal or changed hash is not a new issuance notification.
    if (previousDay && previousDay === incomingDay) {
      return Object.freeze({ kind: 'unchanged', preference: next, record: record });
    }
    if (previousDay && incomingDay && previousDay.slice(0, 6) === incomingDay.slice(0, 6) && previousDay > incomingDay) {
      return Object.freeze({ kind: 'idle', preference: current, record: null });
    }
    if (Date.parse(record.decisionAt) <= current.armedAt) {
      return Object.freeze({ kind: 'baseline', preference: next, record: record });
    }
    if (current.lastSeenSignalKey === ARMED_NEXT_SIGNAL_KEY) {
      return Object.freeze({ kind: 'notify', preference: next, record: record });
    }
    if (!current.lastSeenSignalKey) return Object.freeze({ kind: 'baseline', preference: next, record: record });
    if (current.lastSeenSignalKey === key) return Object.freeze({ kind: 'unchanged', preference: next, record: record });
    return Object.freeze({ kind: 'notify', preference: next, record: record });
  }

  function sessionUserId(win) {
    try {
      var bridge = win.GuardeerAuthKeepAlive;
      var session = bridge && typeof bridge.getSession === 'function' ? bridge.getSession() : null;
      var profile = session && session.profile && typeof session.profile === 'object' ? session.profile : {};
      var value = session && (session.userId || session.email) || profile.sub || profile['cognito:username'] || profile.email || '';
      return text(value).trim().slice(0, 256);
    } catch (_) {
      return '';
    }
  }

  function readPreference(win, userId) {
    if (!userId) return normalizePreference(null);
    try {
      var raw = win.localStorage.getItem(preferenceKey(userId));
      return normalizePreference(raw ? JSON.parse(raw) : null);
    } catch (_) {
      return normalizePreference(null);
    }
  }

  function writePreference(win, userId, preference) {
    if (!userId) return normalizePreference(preference);
    var safe = normalizePreference(preference);
    try {
      win.localStorage.setItem(preferenceKey(userId), JSON.stringify(safe));
    } catch (_) {}
    return safe;
  }

  function formatNumber(value, instrument) {
    var digits = normalizeInstrument(instrument) === 'EURUSD' ? 5 : 2;
    return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
  }

  function setText(node, value) {
    if (node) node.textContent = text(value);
  }

  function showToast(win, message, tone) {
    var host = win.document.getElementById('toast-container');
    if (!host) return;
    var item = win.document.createElement('div');
    item.className = 'gp-kairi-alert-toast gp-kairi-alert-toast--' + tone;
    item.setAttribute('role', 'status');
    item.textContent = message;
    host.appendChild(item);
    win.setTimeout(function () {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 9000);
  }

  function primeAudio(win, state) {
    if (state.audioContext) return state.audioContext;
    var Context = win.AudioContext || win.webkitAudioContext;
    if (!Context) return null;
    try {
      state.audioContext = new Context();
      if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(function () {});
      return state.audioContext;
    } catch (_) {
      return null;
    }
  }

  function playAlertTone(state) {
    var context = state.audioContext;
    if (!context) return;
    try {
      if (context.state === 'suspended') context.resume().catch(function () {});
      [0, 0.22].forEach(function (offset) {
        var oscillator = context.createOscillator();
        var gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.19);
      });
    } catch (_) {}
  }

  function describeSignal(record, instrument) {
    var market = normalizeInstrument(instrument) || normalizeInstrument(record && record.instrument) || normalizeInstrument(record && record.marketSymbol) || 'KAIRI';
    return market + ' · ' + record.action + ' · entry ' + formatNumber(record.entry, market) + ' · SL ' + formatNumber(record.stopLoss, market) + ' · TP ' + formatNumber(record.takeProfit, market);
  }

  function emitSignalAlert(win, state, preference, record, instrument) {
    instrument = normalizeInstrument(instrument) || normalizeInstrument(record && record.instrument) || normalizeInstrument(record && record.marketSymbol) || 'XAUUSD';
    var message = 'KAIRI advisory: ' + describeSignal(record, instrument);
    showToast(win, message, record.action === 'BUY' ? 'buy' : 'sell');
    if (preference.sound) playAlertTone(state);
    try {
      if (win.Notification && win.Notification.permission === 'granted') {
        new win.Notification('KAIRI ' + instrument + ' ' + record.action + ' advisory', {
          body: describeSignal(record, instrument),
          tag: 'guardeer-kairi-' + instrument.toLowerCase() + '-' + record.semanticHash,
          renotify: true
        });
      }
    } catch (_) {}
    try {
      win.dispatchEvent(new win.CustomEvent('guardeer:kairi-signal-alert', {
        detail: Object.freeze({ instrument: instrument, action: record.action, marketDay: record.marketDay, semanticHash: record.semanticHash })
      }));
    } catch (_) {}
  }

  function boot(win) {
    if (!win || !win.document) return;
    var container = win.document.getElementById('gp-kairi-signal-alerts');
    if (!container || container.dataset.kairiAlertsBooted === 'true') return;
    container.dataset.kairiAlertsBooted = 'true';

    var toggle = win.document.getElementById('gp-kairi-alert-toggle');
    var permission = win.document.getElementById('gp-kairi-alert-permission');
    var sound = win.document.getElementById('gp-kairi-alert-sound');
    var status = win.document.getElementById('gp-kairi-alert-status');
    var detail = win.document.getElementById('gp-kairi-alert-detail');
    var bell = win.document.getElementById('gp-kairi-alert-bell');
    var state = { catalog: null, configs: Object.create(null), instrument: null, flight: null, refreshAfterFlight: false, preferenceRevision: 0, poll: null, audioContext: null, currentUserId: '' };

    function currentPreference() {
      state.currentUserId = sessionUserId(win);
      return readPreference(win, state.currentUserId);
    }

    function render(preference, message, more) {
      preference = normalizePreference(preference);
      if (toggle) {
        toggle.textContent = preference.enabled ? 'Alerts enabled' : 'Enable KAIRI alerts';
        toggle.setAttribute('aria-pressed', preference.enabled ? 'true' : 'false');
        toggle.classList.toggle('is-enabled', preference.enabled);
      }
      if (sound) {
        sound.checked = preference.sound;
        sound.disabled = !preference.enabled;
      }
      setText(status, message || (preference.enabled ? 'Monitoring KAIRI' : 'Alerts are off'));
      setText(detail, more || (preference.enabled ? 'Advisories are checked from the authenticated central ledger.' : 'Enable alerts to monitor the next eligible KAIRI advisory.'));
      if (permission) {
        var available = !!win.Notification;
        permission.hidden = !available;
        permission.disabled = !available || win.Notification.permission === 'denied';
        permission.textContent = !available ? 'Browser notifications unavailable' : win.Notification.permission === 'granted' ? 'Browser notifications enabled' : win.Notification.permission === 'denied' ? 'Browser notifications blocked' : 'Enable browser notification';
      }
      if (bell) {
        bell.classList.toggle('is-active', preference.enabled);
        bell.setAttribute('aria-label', preference.enabled ? 'KAIRI alerts enabled. Open Alerts Center.' : 'Open KAIRI alerts in Alerts Center.');
      }
    }

    async function refresh() {
      if (state.flight) {
        state.refreshAfterFlight = true;
        return state.flight;
      }
      state.refreshAfterFlight = false;
      var preference = currentPreference();
      var requestUserId = state.currentUserId;
      if (!state.currentUserId) {
        render(preference, 'Sign in required', 'Sign in to HUNTER before enabling KAIRI alerts.');
        return null;
      }
      if (!preference.enabled) {
        render(preference, 'Alerts are off', 'Enable alerts to monitor the next eligible KAIRI advisory.');
        return null;
      }
      var runtime = win.KairiAdvisory;
      if (!runtime || typeof runtime.validateInstrumentCatalog !== 'function' || typeof runtime.validateConfig !== 'function' || typeof runtime.readAdvisoryLedger !== 'function') {
        render(preference, 'KAIRI alert unavailable', 'The trusted KAIRI catalog or advisory reader is unavailable. No alert was generated.');
        return null;
      }
      try {
        if (!state.catalog) state.catalog = runtime.validateInstrumentCatalog(win.KAIRI_ADVISORY_CONFIG || {});
      } catch (_) {
        render(preference, 'KAIRI alert unavailable', 'The trusted KAIRI instrument catalog could not be validated. No alert was generated.');
        return null;
      }
      var instrument = selectedInstrument(win, state.catalog);
      if (state.instrument !== instrument) {
        state.instrument = instrument;
        state.preferenceRevision += 1;
        preference = writePreference(win, state.currentUserId, {
          enabled: true,
          sound: preference.sound,
          lastSeenSignalKey: null
        });
      }
      var requestRevision = state.preferenceRevision;
      state.flight = (async function () {
        try {
          if (!state.configs[instrument]) {
            state.configs[instrument] = await runtime.validateConfig(state.catalog.profiles[instrument], {
              cryptoObject: win.crypto,
              instrument: instrument
            });
          }
          var envelope = await runtime.readAdvisoryLedger(win, state.configs[instrument]);
          var latestUserId = sessionUserId(win);
          if (latestUserId !== requestUserId || state.preferenceRevision !== requestRevision) return;
          if (selectedInstrument(win, state.catalog) !== instrument) {
            state.refreshAfterFlight = true;
            return;
          }
          var latestPreference = readPreference(win, requestUserId);
          if (!latestPreference.enabled) {
            render(latestPreference, 'Alerts are off', 'Enable alerts to monitor the next eligible KAIRI advisory.');
            return;
          }
          var next = transition(latestPreference, envelope, instrument);
          if (next.kind === 'idle') {
            render(next.preference, isArmedForNextSignal(next.preference) ? 'Collecting the next complete ' + instrument + ' market cycle' : 'No eligible ' + instrument + ' advisory', 'The next final advisory may be BUY, SELL, or NO_TRADE. Alerts require complete inputs and a pending outcome, issued after monitoring began and within the last five minutes. No trade execution is inferred.');
            return;
          }
          writePreference(win, state.currentUserId, next.preference);
          if (next.kind === 'armed') {
            render(next.preference, 'Collecting the next complete ' + instrument + ' market cycle', 'Monitoring is armed for a future BUY or SELL with complete inputs and a pending outcome. Signals older than five minutes and completed outcomes do not generate issuance alerts.');
          } else if (next.kind === 'baseline') {
            render(next.preference, 'Monitoring KAIRI ' + instrument, 'Current ' + instrument + ' signal captured. The next eligible BUY or SELL change will alert you.');
          } else if (next.kind === 'notify') {
            emitSignalAlert(win, state, next.preference, next.record, instrument);
            render(next.preference, 'New KAIRI ' + instrument + ' ' + next.record.action + ' signal', describeSignal(next.record, instrument));
          } else {
            render(next.preference, 'Monitoring KAIRI ' + instrument + ' ' + next.record.action, describeSignal(next.record, instrument));
          }
        } catch (error) {
          var latestUserId = sessionUserId(win);
          if (latestUserId !== requestUserId || state.preferenceRevision !== requestRevision) return;
          var latestPreference = readPreference(win, requestUserId);
          if (!latestPreference.enabled) {
            render(latestPreference, 'Alerts are off', 'Enable alerts to monitor the next eligible KAIRI advisory.');
            return;
          }
          if (error && error.code === 'EULA_ACCEPTANCE_REQUIRED') {
            render(latestPreference, 'KAIRI EULA acceptance required', 'Open KAIRI, review the EULA and Privacy Notice, and accept EULA version 1.0 before alerts can read advisory data.');
          } else {
            render(latestPreference, 'KAIRI alert unavailable', 'The authenticated advisory ledger could not be read. No alert was generated.');
          }
        } finally {
          state.flight = null;
          if (state.refreshAfterFlight) {
            state.refreshAfterFlight = false;
            win.setTimeout(function () { refresh().catch(function () {}); }, 0);
          }
        }
      })();
      return state.flight;
    }

    function schedule() {
      if (state.poll) return;
      state.poll = win.setInterval(function () { refresh().catch(function () {}); }, 60000);
    }

    if (toggle) toggle.addEventListener('click', function () {
      var preference = currentPreference();
      if (!state.currentUserId) {
        render(preference, 'Sign in required', 'Sign in to HUNTER before enabling KAIRI alerts.');
        return;
      }
      if (preference.enabled) {
        state.preferenceRevision += 1;
        state.refreshAfterFlight = false;
        preference = writePreference(win, state.currentUserId, { enabled: false, sound: preference.sound, lastSeenSignalKey: null });
        render(preference, 'Alerts are off', 'The current signal was cleared. Re-enabling will safely baseline the next observed signal.');
        return;
      }
      primeAudio(win, state);
      state.preferenceRevision += 1;
      preference = writePreference(win, state.currentUserId, { enabled: true, sound: sound ? sound.checked : true, lastSeenSignalKey: null });
      render(preference, 'Starting KAIRI monitoring', 'Checking the current ledger. An existing signal will be baselined; if none exists, the first future eligible signal will alert you.');
      schedule();
      refresh().catch(function () {});
    });

    if (sound) sound.addEventListener('change', function () {
      var preference = currentPreference();
      if (!state.currentUserId || !preference.enabled) return;
      state.preferenceRevision += 1;
      writePreference(win, state.currentUserId, { enabled: true, sound: sound.checked, lastSeenSignalKey: preference.lastSeenSignalKey, armedAt: preference.armedAt });
    });

    if (permission) permission.addEventListener('click', function () {
      if (!win.Notification || typeof win.Notification.requestPermission !== 'function') return;
      win.Notification.requestPermission().then(function () { render(currentPreference()); }).catch(function () { render(currentPreference()); });
    });

    function revealAlertControls() {
      var alertsTab = win.document.querySelector('[data-dashboard-tab="alerts"]');
      if (alertsTab) alertsTab.click();
      win.setTimeout(function () { container.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 0);
    }

    function revealFromHash() {
      var hash = '';
      try { hash = text(win.location && win.location.hash).toLowerCase(); } catch (_) {}
      if (hash === '#kairi-signal-alerts') revealAlertControls();
    }

    if (bell) bell.addEventListener('click', revealAlertControls);
    win.addEventListener('hashchange', revealFromHash);

    ['guardeer:auth-updated', 'guardeer:auth-token-refreshed', 'guardeer:device-session-activated', 'guardeer:device-session-synced'].forEach(function (eventName) {
      win.addEventListener(eventName, function () {
        state.preferenceRevision += 1;
        state.catalog = null;
        state.configs = Object.create(null);
        refresh().catch(function () {});
      });
    });
    win.document.addEventListener('visibilitychange', function () {
      if (!win.document.hidden) refresh().catch(function () {});
    });
    render(currentPreference());
    schedule();
    revealFromHash();
  }

  return Object.freeze({
    release: RELEASE,
    build: BUILD,
    preferenceKey: preferenceKey,
    normalizeInstrument: normalizeInstrument,
    selectedInstrument: selectedInstrument,
    normalizePreference: normalizePreference,
    eligibleSignal: eligibleSignal,
    signalKey: signalKey,
    isArmedForNextSignal: isArmedForNextSignal,
    transition: transition,
    formatNumber: formatNumber,
    describeSignal: describeSignal,
    boot: boot
  });
});
