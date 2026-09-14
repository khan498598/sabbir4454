(function () {
  'use strict';

  if (window.__GP_INVESTOR_POLISH_V78__) return;
  window.__GP_INVESTOR_POLISH_V78__ = true;

  var VERSION = 'gp-investor-polish-v78';
  var state = {
    contextKey: '',
    cvdUntil: 0,
    cvdStartedAt: 0,
    lastRealCvd: '+0.00',
    watchPinned: false,
    watchNativeClose: false,
    openInterestKey: '',
    openInterestBusy: false,
    openInterestLastAt: 0,
    primeBaseline: null,
    primeBaselineAt: 0,
    primeBaselineSeq: 0,
    primeBaselineTimers: [],
    lastRuntime: null,
    wallScale: null,
    wallActive: false,
    cvdFinishTimer: 0,
    cvdObserver: null,
    watchObserver: null,
    toolbarObserver: null,
    openInterestTimer: 0
  };

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function now() { return Date.now(); }
  function norm(value) { return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); }
  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    var text = String(value).replace(/,/g, '').trim();
    var multiplier = 1;
    if (/k$/i.test(text)) { multiplier = 1e3; text = text.slice(0, -1); }
    else if (/m$/i.test(text)) { multiplier = 1e6; text = text.slice(0, -1); }
    else if (/b$/i.test(text)) { multiplier = 1e9; text = text.slice(0, -1); }
    text = text.replace(/[^0-9+\-.]/g, '');
    var parsed = Number(text);
    return Number.isFinite(parsed) ? parsed * multiplier : null;
  }
  function runtime() { return window.GuardeerPrimeRuntime || null; }
  function snapshot() {
    try {
      if (typeof window.__gpGetPrimeMarketSnapshot === 'function') return window.__gpGetPrimeMarketSnapshot() || window.__gpPrimeMarketSnapshot || null;
    } catch (_) {}
    return window.__gpPrimeMarketSnapshot || null;
  }
  function context() {
    var rt = runtime();
    var st = rt && rt.state || {};
    var snap = snapshot() || {};
    var exchange = String(st.exchange || snap.exchange || (qs('#exchange-label') && qs('#exchange-label').textContent) || '').trim().toLowerCase();
    var symbol = norm(st.symbol || snap.symbol || (qs('#symbol-label') && qs('#symbol-label').textContent) || (qs('#gp-overview-symbol') && qs('#gp-overview-symbol').textContent) || '');
    var timeframe = String(st.timeframe || snap.timeframe || (qs('.timeframe-btn.active') && qs('.timeframe-btn.active').dataset.tf) || '5m').trim();
    return { exchange: exchange, symbol: symbol, timeframe: timeframe, key: exchange + '|' + symbol + '|' + timeframe };
  }

  /* 1. CVD warm-up: Delta is a rolling 60-second value while CVD is cumulative.
     At launch both are mathematically equal until enough tape exists. Show a clear
     warm-up state instead of two misleading identical numbers. */
  function resetCvdWarmup(key) {
    state.contextKey = key;
    state.cvdStartedAt = now();
    state.cvdUntil = state.cvdStartedAt + 8500;
    state.lastRealCvd = '+0.00';
    if (state.cvdFinishTimer) clearTimeout(state.cvdFinishTimer);
    state.cvdFinishTimer = setTimeout(function () { syncCvdWarmup(); }, 8700);
    var node = qs('#metric-cvd');
    if (node) {
      node.dataset.gpCvdWarmup = '1';
      node.title = 'CVD is cumulative and is building from the incoming live trade tape.';
    }
  }
  function syncCvdWarmup() {
    var ctx = context();
    if (ctx.key && ctx.key !== state.contextKey) resetCvdWarmup(ctx.key);
    var deltaNode = qs('#metric-delta');
    var cvdNode = qs('#metric-cvd');
    if (!deltaNode || !cvdNode) return;
    if (window.GPPrimeCvdIstSyncV172 && window.GPPrimeCvdIstSyncV172.isActive) {
      cvdNode.classList.remove('gp-cvd-building-v78');
      cvdNode.dataset.gpCvdWarmup = '0';
      return;
    }

    var currentText = String(cvdNode.textContent || '').trim();
    if (currentText && currentText !== 'Building…' && currentText !== 'Building...') state.lastRealCvd = currentText;

    var delta = number(deltaNode.textContent);
    var cvd = number(state.lastRealCvd);
    var elapsed = now() - state.cvdStartedAt;
    var distinct = delta !== null && cvd !== null && Math.abs(cvd - delta) > Math.max(0.01, Math.abs(delta) * 0.005);
    var warming = now() < state.cvdUntil && (elapsed < 6000 || !distinct);

    if (warming) {
      if (cvdNode.textContent !== 'Building…') cvdNode.textContent = 'Building…';
      cvdNode.classList.remove('metric__value--positive', 'metric__value--negative');
      cvdNode.classList.add('gp-cvd-building-v78');
      cvdNode.dataset.gpCvdWarmup = '1';
      return;
    }

    cvdNode.classList.remove('gp-cvd-building-v78');
    cvdNode.dataset.gpCvdWarmup = '0';
    if (cvdNode.textContent === 'Building…' || cvdNode.textContent === 'Building...') cvdNode.textContent = state.lastRealCvd || '+0.00';
    var value = number(cvdNode.textContent);
    cvdNode.classList.toggle('metric__value--positive', value !== null && value > 0);
    cvdNode.classList.toggle('metric__value--negative', value !== null && value < 0);
  }

  /* 2 + 7. Keep one fullscreen control and remove the duplicated top-panel CVD button. */
  function polishToolbarButtons() {
    var globalFullscreen = qs('#fullscreen-btn');
    if (globalFullscreen) {
      globalFullscreen.hidden = true;
      globalFullscreen.setAttribute('aria-hidden', 'true');
      globalFullscreen.dataset.gpHiddenDuplicate = 'maximize';
    }
    qsa('[data-tv-action="toggleCvd"]', qs('#timeframes-tools') || document).forEach(function (button) {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.dataset.gpHiddenDuplicate = 'cvd';
    });
  }

  /* 4. Open interest: use a real source when available; otherwise show N/A instead
     of the same hard-coded number on every instrument. */
  function formatCompact(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 'N/A';
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 1 : 2) + 'K';
    return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2);
  }
  function candidateOpenInterest() {
    var rt = runtime() || {};
    var st = rt.state || {};
    var snap = snapshot() || {};
    var candidates = [
      st.openInterest, st.open_interest, st.oi,
      snap.openInterest, snap.open_interest, snap.oi,
      snap.metrics && snap.metrics.openInterest,
      snap.market && snap.market.openInterest,
      snap.quote && snap.quote.openInterest,
      window.__gpOpenInterest, window.__GUARDEER_OPEN_INTEREST
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var n = number(candidates[i]);
      if (n !== null && n >= 0) return { value: n, source: 'live snapshot' };
    }
    return null;
  }
  function fetchJson(url, timeoutMs) {
    var controller = null;
    var timer = 0;
    try {
      controller = new AbortController();
      timer = setTimeout(function () { try { controller.abort(); } catch (_) {} }, timeoutMs || 4500);
    } catch (_) {}
    return fetch(url, { cache: 'no-store', signal: controller && controller.signal }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).finally(function () { if (timer) clearTimeout(timer); });
  }
  async function fetchOpenInterest(ctx) {
    var symbol = ctx.symbol;
    if (!symbol) return null;
    if (ctx.exchange === 'binance' && /USDT$/.test(symbol)) return null;
    if (ctx.exchange === 'bybit' && /USDT$/.test(symbol)) {
      var bybit = await fetchJson('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=' + encodeURIComponent(symbol) + '&intervalTime=5min&limit=1', 4200);
      var list = bybit && bybit.result && bybit.result.list;
      var bybitValue = number(Array.isArray(list) && list[0] && list[0].openInterest);
      return bybitValue !== null ? { value: bybitValue, source: 'Bybit linear futures' } : null;
    }
    if (ctx.exchange === 'okx' && /USDT$/.test(symbol)) {
      var base = symbol.slice(0, -4);
      var instId = base + '-USDT-SWAP';
      var okx = await fetchJson('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=' + encodeURIComponent(instId), 4200);
      var okxList = okx && okx.data;
      var okxValue = number(Array.isArray(okxList) && okxList[0] && (okxList[0].oi || okxList[0].openInterest));
      return okxValue !== null ? { value: okxValue, source: 'OKX perpetual swap' } : null;
    }
    if (ctx.exchange === 'forexgold' && (symbol === 'XAUUSD' || symbol === 'XAGUSD')) {
      var cfg = window.GUARDEER_CONFIG || {};
      var key = String(cfg.FMP_API_KEY || '').trim();
      if (key && key.indexOf('PASTE_') === -1) {
        var fmpSymbol = symbol === 'XAUUSD' ? String(cfg.XAUUSD_FMP_SYMBOL || 'GCUSD') : String(cfg.XAGUSD_FMP_SYMBOL || 'SIUSD');
        var fmp = await fetchJson('https://financialmodelingprep.com/stable/quote?symbol=' + encodeURIComponent(fmpSymbol) + '&apikey=' + encodeURIComponent(key) + '&_=' + now(), 4500);
        var row = Array.isArray(fmp) ? fmp[0] : (fmp && Array.isArray(fmp.data) ? fmp.data[0] : fmp);
        var fmpValue = number(row && (row.openInterest || row.open_interest || row.oi));
        return fmpValue !== null ? { value: fmpValue, source: 'Futures quote feed' } : null;
      }
    }
    return null;
  }
  function writeOpenInterest(result, ctx) {
    var node = qs('#gp-overview-oi');
    if (!node) return;
    if (result && Number.isFinite(Number(result.value))) {
      node.textContent = formatCompact(result.value);
      node.dataset.gpOiSource = result.source || 'live';
      node.title = 'Open interest source: ' + (result.source || 'live');
    } else {
      node.textContent = 'N/A';
      node.dataset.gpOiSource = 'unavailable';
      node.title = 'Open interest is not available for this spot/forex instrument.';
    }
    node.dataset.gpOiContext = ctx.key;
  }
  async function refreshOpenInterest(force) {
    if (state.openInterestBusy) return;
    var ctx = context();
    if (!ctx.symbol) return;
    var changed = ctx.key !== state.openInterestKey;
    if (!force && !changed && now() - state.openInterestLastAt < 30000) return;
    state.openInterestKey = ctx.key;
    state.openInterestBusy = true;
    state.openInterestLastAt = now();
    var node = qs('#gp-overview-oi');
    if (node && changed) node.textContent = '…';
    try {
      var direct = candidateOpenInterest();
      if (direct) writeOpenInterest(direct, ctx);
      else writeOpenInterest(await fetchOpenInterest(ctx), ctx);
    } catch (_) {
      writeOpenInterest(null, ctx);
    } finally {
      state.openInterestBusy = false;
    }
  }

  /* 5. Pin the Watchlist until the explicit X/toggle is used, and dock it away
     from the chart's right price scale. */
  function setWatchPinned(value) {
    state.watchPinned = !!value;
    if (document.body) document.body.classList.toggle('gp-watchlist-pinned-open-v78', state.watchPinned);
    var panel = qs('#watchlist-panel');
    if (panel) panel.setAttribute('aria-hidden', state.watchPinned ? 'false' : 'true');
    qsa('[data-tv-action="toggleWatchlist"], #chart-watchlist-toggle').forEach(function (button) {
      button.classList.toggle('active', state.watchPinned);
      button.setAttribute('aria-pressed', state.watchPinned ? 'true' : 'false');
    });
  }
  function requestNativeWatchlistClose() {
    setWatchPinned(false);
    var panel = qs('#watchlist-panel');
    if (panel) panel.classList.remove('open');
    var close = qs('#watchlist-close');
    if (!close) return;
    state.watchNativeClose = true;
    try { close.click(); } catch (_) {}
    setTimeout(function () { state.watchNativeClose = false; }, 0);
  }
  function bindWatchlistPinning() {
    document.addEventListener('click', function (event) {
      var toggle = event.target && event.target.closest && event.target.closest('[data-tv-action="toggleWatchlist"], #chart-watchlist-toggle');
      if (toggle) {
        if (toggle.dataset && toggle.dataset.gpWatchRestoreBusy === '1') return;
        if (state.watchPinned || (document.body && document.body.classList.contains('gp-watchlist-pinned-open-v78'))) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          requestNativeWatchlistClose();
        } else {
          setTimeout(function () {
            var panel = qs('#watchlist-panel');
            if (panel && panel.classList.contains('open')) setWatchPinned(true);
          }, 0);
        }
        return;
      }
      var close = event.target && event.target.closest && event.target.closest('#watchlist-close');
      if (close && !state.watchNativeClose) setWatchPinned(false);
    }, true);
  }
  function syncPinnedWatchlist() {
    if (!state.watchPinned) return;
    var panel = qs('#watchlist-panel');
    if (!panel) return;

    // The original chart handler closes the watchlist on any chart click and also
    // flips its internal state. Re-open it through the native toggle so both the
    // DOM and the runtime state stay synchronized.
    if (!panel.classList.contains('open') && !state.watchNativeClose) {
      var toggle = qs('[data-tv-action="toggleWatchlist"], #chart-watchlist-toggle');
      if (toggle && !toggle.dataset.gpWatchRestoreBusy) {
        toggle.dataset.gpWatchRestoreBusy = '1';
        try { toggle.click(); } catch (_) { panel.classList.add('open'); }
        setTimeout(function () { try { delete toggle.dataset.gpWatchRestoreBusy; } catch (_) {} }, 60);
      } else {
        panel.classList.add('open');
      }
    }

    panel.setAttribute('aria-hidden', 'false');
    panel.style.removeProperty('display');
    qsa('[data-tv-action="toggleWatchlist"], #chart-watchlist-toggle').forEach(function (button) {
      button.classList.add('active');
      button.setAttribute('aria-pressed', 'true');
    });
  }

  /* 6. Prime Indicator should analyze the existing chart state; it must not
     automatically turn on Order Flow, Heatmap, Bubbles or CVD. */
  function copyToolState(rt) {
    var source = rt && rt.toolState || {};
    var out = {};
    ['flowMode', 'heatmap', 'bubbles', 'cvd', 'dom', 'levels', 'volumeProfile', 'footprint'].forEach(function (key) { out[key] = !!source[key]; });
    out.pureHeatmap = false;
    return out;
  }
  function patchPrimeRuntime(rt) {
    if (!rt || rt.__gpInvestorPolishV78) return;
    rt.__gpInvestorPolishV78 = true;
    rt.__gpOriginalEnableFlowConfirmationV78 = rt.enableFlowConfirmation;
    rt.enableFlowConfirmation = function () {
      try { window.dispatchEvent(new CustomEvent('guardeer:prime-indicator:flow-preserved', { detail: { version: VERSION } })); } catch (_) {}
      return false;
    };
    state.lastRuntime = rt;
  }
  function syncToggleButton(id, active) {
    var button = qs(id);
    if (!button) return;
    button.classList.toggle('active', !!active);
    if (/tool-.*-toggle/.test(String(button.id || '')) && !/prime-enable|gp-prime-enable/.test(String(button.id || ''))) button.textContent = active ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  function toolSelector(key) {
    var map = {
      flowMode: '#tool-flow-toggle',
      heatmap: '#tool-heatmap-toggle',
      bubbles: '#tool-bubbles-toggle',
      cvd: '#tool-cvd-toggle',
      dom: '#tool-dom-toggle',
      levels: '#tool-levels-toggle',
      volumeProfile: '#tool-volume-profile-toggle',
      footprint: '#tool-footprint-toggle'
    };
    return map[key] || '';
  }
  function toggleToolTo(key, desired) {
    var rt = runtime();
    if (!rt || !rt.toolState) return;
    var current = !!rt.toolState[key];
    if (current === !!desired) return;
    var button = qs(toolSelector(key));
    if (button && !button.dataset.gpPrimeRestoreBusy) {
      button.dataset.gpPrimeRestoreBusy = '1';
      try { button.click(); } catch (_) { rt.toolState[key] = !!desired; }
      setTimeout(function () { try { delete button.dataset.gpPrimeRestoreBusy; } catch (_) {} }, 80);
    } else {
      rt.toolState[key] = !!desired;
    }
  }
  function cancelPrimeBaselineRestore() {
    state.primeBaselineSeq += 1;
    state.primeBaselineTimers.forEach(function (timer) { clearTimeout(timer); });
    state.primeBaselineTimers = [];
    state.primeBaseline = null;
    state.primeBaselineAt = 0;
  }
  function restorePrimeBaseline(seq) {
    if (seq !== state.primeBaselineSeq) return;
    var rt = runtime();
    var baseline = state.primeBaseline;
    if (!rt || !baseline || !rt.toolState) return;
    rt.toolState.pureHeatmap = false;

    // Flow Mode turns several overlays on at once, so switch it off first and
    // then reconcile every individual tool to the exact state the user had.
    if (!baseline.flowMode) toggleToolTo('flowMode', false);
    ['heatmap', 'bubbles', 'cvd', 'dom', 'levels', 'volumeProfile', 'footprint'].forEach(function (key) {
      toggleToolTo(key, baseline[key]);
    });
    if (baseline.flowMode) toggleToolTo('flowMode', true);

    // Keep visual button state consistent even when a legacy toggle callback is
    // not present in a particular build.
    Object.keys(baseline).forEach(function (key) { syncToggleButton(toolSelector(key), baseline[key]); });
    qsa('[data-tv-action="toggleHeatmap"]').forEach(function (b) { b.classList.toggle('active', baseline.heatmap); });
    qsa('[data-tv-action="toggleBubbles"]').forEach(function (b) { b.classList.toggle('active', baseline.bubbles); });
    qsa('[data-tv-action="toggleCvd"]').forEach(function (b) { b.classList.toggle('active', baseline.cvd); });
  }
  function capturePrimeBaseline() {
    var rt = runtime();
    if (!rt) return;
    cancelPrimeBaselineRestore();
    patchPrimeRuntime(rt);
    state.primeBaseline = copyToolState(rt);
    state.primeBaselineAt = now();
    var seq = state.primeBaselineSeq;
    state.primeBaselineTimers = [0, 40, 120, 260, 520, 900, 1500].map(function (delay) {
      var timer = setTimeout(function () {
        state.primeBaselineTimers = state.primeBaselineTimers.filter(function (pending) { return pending !== timer; });
        restorePrimeBaseline(seq);
      }, delay);
      return timer;
    });
  }
  function bindPrimePreserve() {
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest && event.target.closest(
        '#prime-indicator-btn, .gp-terminal-side nav button[data-mobile-prime-indicator], [data-prime-chart-mode], ' +
        '[data-prime-load-chart], [data-prime-action="load-chart"], [data-prime-open-chart]'
      );
      if (target) capturePrimeBaseline();
    }, true);
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest && event.target.closest(
        '[data-dashboard-tab="orderflow"], [data-mobile-action="prime-flow"], [data-mobile-action="orderflow"], ' +
        '[data-gp-step44-prime-tool="orderflow"], #prime-orderflow-btn, #prime-enable-flow, #tool-flow-toggle, #flow-mode-btn'
      );
      if (target && event.isTrusted === true) cancelPrimeBaselineRestore();
    }, true);
    window.addEventListener('guardeer:prime-orderflow-entry-intent', cancelPrimeBaselineRestore, { passive: true });
  }


  /* 8. Prime Walls uses its own clean canvas and a dedicated live right price scale.
     The normal candlestick canvas is hidden while the layer is active. */
  function primeWallsApi() { return window.GPTest1V71PrimeWallsBridge || null; }
  function primeWallsActive() {
    var api = primeWallsApi();
    try { if (api && typeof api.isActive === 'function') return api.isActive(); } catch (_) {}
    return !!(document.body && (document.body.classList.contains('gp-prime-walls-active') || document.body.classList.contains('gp-prime-walls-chart-active')));
  }
  function ensureWallScale() {
    var overlay = qs('#gp-prime-walls-overlay');
    if (!overlay) return null;
    var scale = qs('#gp-prime-walls-price-scale-v78', overlay);
    if (!scale) {
      scale = document.createElement('div');
      scale.id = 'gp-prime-walls-price-scale-v78';
      scale.className = 'gp-prime-walls-price-scale-v78';
      scale.setAttribute('aria-hidden', 'true');
      overlay.appendChild(scale);
    }
    state.wallScale = scale;
    return scale;
  }
  function priceDecimals(symbol, value) {
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD') return 2;
    if (symbol.indexOf('JPY') >= 0) return 3;
    return Math.abs(Number(value) || 0) >= 100 ? 2 : 5;
  }
  function formatPrice(symbol, value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: priceDecimals(symbol, n), maximumFractionDigits: priceDecimals(symbol, n) });
  }
  function syncPrimeWallsScale() {
    var active = primeWallsActive();
    if (document.body && active !== state.wallActive) document.body.classList.toggle('gp-prime-walls-clean-v78', active);
    state.wallActive = active;

    // Do no DOM construction or price calculations while PRIME Walls is closed.
    // Order Flow updates many times per second, so this early return is important.
    if (!active) {
      if (state.wallScale) {
        state.wallScale.innerHTML = '';
        state.wallScale.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    var scale = ensureWallScale();
    if (!scale) return;
    var api = primeWallsApi();
    var cs = null;
    try { cs = api && api.getCoordinateState && api.getCoordinateState(); } catch (_) {}
    if (!cs || !Number.isFinite(Number(cs.scaleHigh)) || !Number.isFinite(Number(cs.scaleLow)) || !Number.isFinite(Number(cs.plotH))) return;
    var symbol = context().symbol;
    var ticks = 7;
    var html = '<span class="gp-prime-walls-price-scale-v78__title">PRICE</span>';
    for (var i = 0; i < ticks; i += 1) {
      var ratio = i / (ticks - 1);
      var price = Number(cs.scaleHigh) - (Number(cs.scaleHigh) - Number(cs.scaleLow)) * ratio;
      var y = Number(cs.topPad || 0) + Number(cs.plotH) * ratio;
      html += '<span class="gp-prime-walls-price-scale-v78__tick" style="top:' + y.toFixed(1) + 'px">' + formatPrice(symbol, price) + '</span>';
    }
    var rt = runtime();
    var live = null;
    try { live = rt && typeof rt.getCurrentPrice === 'function' ? Number(rt.getCurrentPrice()) : null; } catch (_) {}
    if (Number.isFinite(live) && api && typeof api.priceToCoordinate === 'function') {
      var liveY = Number(api.priceToCoordinate(live));
      if (Number.isFinite(liveY)) html += '<span class="gp-prime-walls-price-scale-v78__live" style="top:' + liveY.toFixed(1) + 'px">' + formatPrice(symbol, live) + '</span>';
    }
    if (scale.innerHTML !== html) scale.innerHTML = html;
    scale.setAttribute('aria-hidden', 'false');
  }

  function bindRuntime() {
    window.addEventListener('guardeer:prime-runtime-ready', function (event) {
      patchPrimeRuntime(event && event.detail || runtime());
      resetCvdWarmup(context().key);
      setTimeout(function () { refreshOpenInterest(true); }, 100);
    }, { passive: true });
    patchPrimeRuntime(runtime());
  }

  var cvdSyncQueued = false;
  var watchSyncQueued = false;
  var toolbarSyncQueued = false;

  function queueCvdSync() {
    if (cvdSyncQueued) return;
    cvdSyncQueued = true;
    requestAnimationFrame(function () {
      cvdSyncQueued = false;
      syncCvdWarmup();
    });
  }

  function queueWatchSync() {
    if (watchSyncQueued || !state.watchPinned) return;
    watchSyncQueued = true;
    requestAnimationFrame(function () {
      watchSyncQueued = false;
      syncPinnedWatchlist();
    });
  }

  function queueToolbarSync() {
    if (toolbarSyncQueued) return;
    toolbarSyncQueued = true;
    requestAnimationFrame(function () {
      toolbarSyncQueued = false;
      polishToolbarButtons();
    });
  }

  function bindFocusedObservers() {
    var deltaNode = qs('#metric-delta');
    var cvdNode = qs('#metric-cvd');
    var metricRoot = cvdNode && cvdNode.parentElement || deltaNode && deltaNode.parentElement;
    if (metricRoot && !state.cvdObserver) {
      try {
        state.cvdObserver = new MutationObserver(queueCvdSync);
        state.cvdObserver.observe(metricRoot, { subtree: true, childList: true, characterData: true });
      } catch (_) {}
    }

    var watchPanel = qs('#watchlist-panel');
    if (watchPanel && !state.watchObserver) {
      try {
        state.watchObserver = new MutationObserver(queueWatchSync);
        state.watchObserver.observe(watchPanel, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
      } catch (_) {}
    }

    var toolbar = qs('#timeframes-tools');
    if (toolbar && !state.toolbarObserver) {
      try {
        state.toolbarObserver = new MutationObserver(queueToolbarSync);
        state.toolbarObserver.observe(toolbar, { childList: true, subtree: true });
      } catch (_) {}
    }
  }

  function boot() {
    polishToolbarButtons();
    bindWatchlistPinning();
    bindPrimePreserve();
    bindRuntime();
    resetCvdWarmup(context().key);
    refreshOpenInterest(true);
    syncPrimeWallsScale();
    bindFocusedObservers();

    window.addEventListener('guardeer:market-snapshot', function () {
      queueCvdSync();
      refreshOpenInterest(false);
      if (primeWallsActive()) syncPrimeWallsScale();
    }, { passive: true });
    window.addEventListener('guardeer:market-quick-switch', function () {
      setTimeout(function () {
        resetCvdWarmup(context().key);
        refreshOpenInterest(true);
        bindFocusedObservers();
      }, 80);
    }, { passive: true });
    window.addEventListener('guardeer:prime-walls-transform', syncPrimeWallsScale, { passive: true });
    window.addEventListener('guardeer:terminal-visibility-changed', function () {
      bindFocusedObservers();
      queueToolbarSync();
    }, { passive: true });
    window.addEventListener('resize', function () {
      if (primeWallsActive()) setTimeout(syncPrimeWallsScale, 80);
    }, { passive: true });

    // Open interest changes slowly. A 30-second cadence preserves the feature
    // without running unrelated DOM work during every Order Flow frame.
    state.openInterestTimer = setInterval(function () {
      if (!document.hidden) refreshOpenInterest(false);
    }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.GPInvestorPolishV78 = {
    version: VERSION,
    refreshOpenInterest: function () { return refreshOpenInterest(true); },
    resetCvdWarmup: function () { resetCvdWarmup(context().key); },
    pinWatchlist: setWatchPinned,
    syncPrimeWallsScale: syncPrimeWallsScale,
    cancelPrimeBaselineRestore: cancelPrimeBaselineRestore
  };
})();
