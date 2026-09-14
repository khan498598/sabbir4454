(function () {
  'use strict';

  if (window.__GP_CVD_IST_SYNC_V207__) return;
  window.__GP_CVD_IST_SYNC_V207__ = true;

  var VERSION = 'gp-cvd-ist-sync-v207-loop-guard';
  var SHARED_STORE_KEY = 'gp:canonical-flow-snapshot:v206';
  var SHARED_CHANNEL_NAME = 'gp-canonical-flow-v206';
  var DEFAULT_TZ = 'Asia/Kolkata';
  var DEFAULT_LABEL = 'IST';
  var state = {
    runtime: null,
    snapshotKey: '',
    snapshot: null,
    channel: null,
    observer: null,
    queued: false,
    metricLock: false,
    lastChartTarget: null,
    lastChartSignature: '',
    lastSharedSignature: '',
    lastChartTzAt: 0,
    lastChartSyncAt: 0,
    lastMetricAt: 0,
    interval: 0,
    binanceContext: '',
    binanceRows: new Map()
  };

  function getConfig() {
    var cfg = window.GUARDEER_CONFIG = window.GUARDEER_CONFIG || {};
    cfg.PRIME_CHART_TIMEZONE = cfg.PRIME_CHART_TIMEZONE || DEFAULT_TZ;
    cfg.FOREX_GOLD_CHART_TIMEZONE = cfg.FOREX_GOLD_CHART_TIMEZONE || DEFAULT_TZ;
    cfg.PRIME_CHART_TIMEZONE_LABEL = cfg.PRIME_CHART_TIMEZONE_LABEL || DEFAULT_LABEL;
    return cfg;
  }

  function tz() {
    var cfg = getConfig();
    return String(cfg.FOREX_GOLD_CHART_TIMEZONE || cfg.PRIME_CHART_TIMEZONE || DEFAULT_TZ).trim() || DEFAULT_TZ;
  }

  function tzLabel() {
    var cfg = getConfig();
    return String(cfg.PRIME_CHART_TIMEZONE_LABEL || DEFAULT_LABEL).trim() || DEFAULT_LABEL;
  }

  function runtime() {
    return state.runtime || window.GuardeerPrimeRuntime || null;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function normSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function num(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback === undefined ? null : fallback);
  }

  function normalizeTime(raw) {
    if (raw === null || raw === undefined || raw === '') return NaN;
    if (typeof raw === 'object') {
      if (raw.timestamp !== undefined) return normalizeTime(raw.timestamp);
      if (raw.time !== undefined) return normalizeTime(raw.time);
      if (raw.year && raw.month && raw.day) {
        return Math.floor(Date.UTC(Number(raw.year), Number(raw.month) - 1, Number(raw.day)) / 1000);
      }
    }
    var n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (n > 1e12 || n > 1e10) return Math.floor(n / 1000);
    return Math.floor(n);
  }

  function timeframeSeconds(tf) {
    var rt = runtime();
    var raw = String(tf || (rt && rt.state && rt.state.timeframe) || (qs('.timeframe-btn.active') && qs('.timeframe-btn.active').getAttribute('data-tf')) || '1m').trim();
    var m = raw.match(/^(\d+)([mhdwM])$/);
    if (!m) return 60;
    var n = Math.max(1, Number(m[1]) || 1);
    var u = m[2];
    if (u === 'm') return n * 60;
    if (u === 'h') return n * 3600;
    if (u === 'd') return n * 86400;
    if (u === 'w') return n * 604800;
    if (u === 'M') return n * 2592000;
    return 60;
  }
  function bucketTime(sec, tf) {
    sec = normalizeTime(sec);
    if (!Number.isFinite(sec)) return NaN;
    var step = timeframeSeconds(tf);
    return Math.floor(sec / step) * step;
  }
  function priceDigits(symbol) {
    symbol = normSymbol(symbol);
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD' || symbol.indexOf('GOLD') >= 0) return 2;
    if (symbol.indexOf('JPY') >= 0) return 3;
    if (/^[A-Z]{6}$/.test(symbol)) return 5;
    return 2;
  }
  function roundPrice(value, symbol) {
    value = Number(value);
    if (!Number.isFinite(value)) return value;
    return Number(value.toFixed(priceDigits(symbol)));
  }

  function context() {
    var rt = runtime();
    var st = (rt && rt.state) || {};
    var snap = null;
    try {
      if (typeof window.__gpGetPrimeMarketSnapshot === 'function') snap = window.__gpGetPrimeMarketSnapshot();
    } catch (_) {}
    snap = snap || window.__gpPrimeMarketSnapshot || {};
    var symbol = normSymbol(st.symbol || snap.symbol || (qs('#symbol-label') && qs('#symbol-label').textContent) || (qs('#gp-overview-symbol') && qs('#gp-overview-symbol').textContent) || (qs('#gp-chart-title-symbol') && qs('#gp-chart-title-symbol').textContent));
    var exchange = String(st.exchange || snap.exchange || '').toLowerCase();
    var timeframe = String(st.timeframe || snap.timeframe || (qs('.timeframe-btn.active') && qs('.timeframe-btn.active').getAttribute('data-tf')) || '1m').trim();
    return { symbol: symbol || 'XAUUSD', exchange: exchange, timeframe: timeframe || '1m' };
  }

  function formatParts(date, options) {
    try {
      return new Intl.DateTimeFormat('en-IN', options).format(date);
    } catch (_) {
      return date.toLocaleString();
    }
  }

  function formatAxisTime(raw) {
    var ts = normalizeTime(raw);
    if (!Number.isFinite(ts)) return '';
    var seconds = timeframeSeconds();
    var options = seconds >= 86400
      ? { timeZone: tz(), day: '2-digit', month: 'short' }
      : { timeZone: tz(), hour: '2-digit', minute: '2-digit', hour12: false };
    return formatParts(new Date(ts * 1000), options);
  }

  function formatCrosshairTime(raw) {
    var ts = normalizeTime(raw);
    if (!Number.isFinite(ts)) return '';
    var seconds = timeframeSeconds();
    var options = seconds >= 86400
      ? { timeZone: tz(), day: '2-digit', month: 'short', year: '2-digit' }
      : { timeZone: tz(), day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
    var label = tzLabel();
    return formatParts(new Date(ts * 1000), options) + (label ? ' ' + label : '');
  }

  function istDayKey(sec) {
    var date = new Date(sec * 1000);
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);
      var out = { year: '', month: '', day: '' };
      parts.forEach(function (p) { if (out[p.type] !== undefined) out[p.type] = p.value; });
      return out.year + '-' + out.month + '-' + out.day;
    } catch (_) {
      return date.getUTCFullYear() + '-' + (date.getUTCMonth() + 1) + '-' + date.getUTCDate();
    }
  }

  function getRawCandles() {
    var rt = runtime();
    try {
      if (rt && typeof rt.getLatestKlines === 'function') {
        var list = rt.getLatestKlines();
        if (Array.isArray(list) && list.length) return list.slice();
      }
    } catch (_) {}
    try {
      if (rt && rt.chart && Array.isArray(rt.chart.lastCandleData) && rt.chart.lastCandleData.length) return rt.chart.lastCandleData.slice();
    } catch (_) {}
    try {
      if (Array.isArray(window.__gpPrimeMarketSnapshot && window.__gpPrimeMarketSnapshot.klines)) return window.__gpPrimeMarketSnapshot.klines.slice();
    } catch (_) {}
    return [];
  }

  function normalizeCandle(c) {
    if (!c) return null;
    var ctx = context();
    var time = normalizeTime(c.time !== undefined ? c.time : c.timestamp);
    var open = roundPrice(num(c.open), ctx.symbol);
    var high = roundPrice(num(c.high), ctx.symbol);
    var low = roundPrice(num(c.low), ctx.symbol);
    var close = roundPrice(num(c.close !== undefined ? c.close : c.price), ctx.symbol);
    var volume = num(c.volume !== undefined ? c.volume : c.v, 0);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    return { time: time, open: open, high: high, low: low, close: close, volume: Math.max(0, volume || 0) };
  }

  function getCandles() {
    var ctx = context();
    var raw = getRawCandles();
    var map = Object.create(null);
    var step = timeframeSeconds(ctx.timeframe);
    var nowBucket = Math.floor((Date.now() / 1000) / step) * step;
    raw.forEach(function (item) {
      var c = normalizeCandle(item);
      if (!c) return;
      var bucket = bucketTime(c.time, ctx.timeframe);
      if (!Number.isFinite(bucket) || bucket >= nowBucket) return;
      c.time = bucket;
      map[String(bucket)] = c;
    });
    var candles = Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) { return a.time - b.time; });
    if (!candles.length && raw.length > 2) {
      raw.slice(0, -1).forEach(function (item) {
        var c = normalizeCandle(item);
        if (c) map[String(c.time)] = c;
      });
      candles = Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) { return a.time - b.time; });
    }
    return candles;
  }

  function selectSessionCandles(candles) {
    if (!candles.length) return [];
    var ctx = context();
    var tfSec = timeframeSeconds(ctx.timeframe);
    var maxLen = tfSec <= 60 ? 720 : tfSec <= 300 ? 420 : tfSec <= 3600 ? 240 : 180;
    var minLen = Math.min(80, Math.max(18, Math.ceil(7200 / Math.max(tfSec, 60))));
    var last = candles[candles.length - 1];
    var key = istDayKey(last.time);
    var selected = candles.filter(function (c) { return istDayKey(c.time) === key; });
    if (selected.length < minLen) selected = candles.slice(-Math.max(minLen, Math.min(maxLen, candles.length)));
    if (selected.length > maxLen) selected = selected.slice(-maxLen);
    return selected;
  }

  function hashString(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seeded01(seed) {
    var x = seed >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function syntheticVolume(c, index, ctx) {
    var realVol = Number(c.volume || 0);
    var deterministic = ctx && (ctx.exchange === 'forexgold' || ctx.symbol === 'XAUUSD' || /^[A-Z]{6}$/.test(ctx.symbol || ''));
    if (!deterministic && Number.isFinite(realVol) && realVol > 0) return Math.max(1, realVol);
    var price = Math.max(Math.abs(c.close || c.open || 1), 1);
    var range = Math.max(0, (c.high || price) - (c.low || price));
    var body = Math.abs((c.close || price) - (c.open || price));
    var seed = hashString(ctx.symbol + '|' + ctx.timeframe + '|' + c.time + '|' + index);
    var jitter = 0.82 + seeded01(seed) * 0.36;
    var base = ctx.symbol === 'XAUUSD' ? 42 : (/^[A-Z]{6}$/.test(ctx.symbol) ? 1800 : 28);
    var scaled = (range / price) * 850000 + (body / price) * 460000 + base;
    return Math.max(1, scaled * jitter);
  }

  function signedNotional(c, prev, index, ctx) {
    var price = Math.max(Math.abs(c.close || c.open || 1), 1);
    var range = Math.max((c.high || price) - (c.low || price), price * 1e-6);
    var bodyScore = ((c.close || price) - (c.open || price)) / range;
    var closeMove = prev ? ((c.close || price) - (prev.close || c.open || price)) : ((c.close || price) - (c.open || price));
    var closeScore = closeMove / Math.max(range, Math.abs(closeMove), price * 1e-6);
    var wickScore = (((c.close || price) - (c.low || price)) - ((c.high || price) - (c.close || price))) / range;
    var score = clamp(bodyScore * 0.66 + closeScore * 0.24 + wickScore * 0.10, -1, 1);
    if (Math.abs(score) < 0.025) score = 0;
    return syntheticVolume(c, index, ctx) * price * score;
  }

  function formatNumber(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    if (Math.abs(n) < 0.005) n = 0;
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '+';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(2) + 'K';
    return sign + abs.toFixed(2);
  }
  function contextKey(ctx) {
    ctx = ctx || context();
    return [normSymbol(ctx.symbol), String(ctx.timeframe || '').toLowerCase(), String(ctx.exchange || '').toLowerCase()].join('|');
  }
  function isBinanceContext(ctx) {
    return !!ctx && String(ctx.exchange).toLowerCase() === 'binance';
  }
  function binanceUnit(ctx) {
    var rt = runtime();
    var symbols = rt && rt.state && rt.state.symbols;
    var market = Array.isArray(symbols) && symbols.find(function (row) { return normSymbol(row.symbol) === ctx.symbol; });
    if (market && /^[A-Z0-9]{1,12}$/.test(String(market.quoteAsset || ''))) return market.quoteAsset;
    var units = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'BUSD', 'DAI', 'BTC', 'ETH', 'BNB', 'USD', 'EUR', 'GBP', 'TRY', 'BRL'];
    return units.find(function (unit) { return ctx.symbol.length > unit.length && ctx.symbol.slice(-unit.length) === unit; }) || 'QUOTE';
  }
  function verifiedBinanceRow(row, ctx) {
    var expected = 'binance:' + ctx.symbol + ':' + ctx.timeframe;
    if (!row || row.flowSource !== 'binance-spot-kline' || row.__gpProviderOhlcContextR407 !== expected) return null;
    var fields = ['time', 'open', 'high', 'low', 'close', 'volume', 'takerBuyBaseVolume', 'quoteVolume', 'takerBuyQuoteVolume', 'tradeCount'];
    if (fields.some(function (key) { return typeof row[key] !== 'number' || !Number.isFinite(row[key]); })) return null;
    var value = {};
    fields.forEach(function (key) { value[key] = Number(row[key]); });
    var step = timeframeSeconds(ctx.timeframe);
    if (!Number.isSafeInteger(value.time) || value.time <= 0 || value.time >= 1e11 || (!/[wM]$/.test(ctx.timeframe) && value.time % step !== 0) || value.open <= 0 || value.close <= 0 || value.low <= 0 ||
      value.high < Math.max(value.open, value.close) || value.low > Math.min(value.open, value.close) ||
      value.volume < 0 || value.takerBuyBaseVolume < 0 || value.takerBuyBaseVolume > value.volume ||
      value.quoteVolume < 0 || value.takerBuyQuoteVolume < 0 || value.takerBuyQuoteVolume > value.quoteVolume ||
      !Number.isSafeInteger(value.tradeCount) || value.tradeCount < 0 ||
      (value.volume === 0) !== (value.quoteVolume === 0) || (value.volume === 0) !== (value.tradeCount === 0) ||
      (value.takerBuyBaseVolume === 0) !== (value.takerBuyQuoteVolume === 0) ||
      !Number.isFinite(2 * value.takerBuyQuoteVolume - value.quoteVolume)) return null;
    if (row.priceEventTime !== undefined) {
      if (typeof row.priceEventTime !== 'number' || !Number.isFinite(row.priceEventTime) || row.priceEventTime < value.time * 1000) return null;
      value.priceEventTime = Number(row.priceEventTime);
    }
    return value;
  }
  function binanceDescription(snap) {
    if (snap.available === false && snap.unavailableReason === 'history-gap') return 'Binance taker flow (' + snap.unit + ') unavailable — missing candle interval; waiting for exchange backfill.';
    if (snap.available === false) return 'Binance taker flow (' + snap.unit + ') unavailable — waiting for verified full klines.';
    var first = new Date(snap.firstTime * 1000).toISOString().replace('T', ' ').slice(0, 16);
    var last = new Date(snap.lastTime * 1000).toISOString().replace('T', ' ').slice(0, 16);
    return 'Binance taker flow · ' + snap.unit + ' · candle starts ' + first + ' to ' + last + ' UTC · ' +
      snap.candles + ' bars · ' + (snap.window === 'latest-provider-candle' ? 'latest ' + snap.context.timeframe + ' provider candle' : (snap.completeWindow ? '24h candle window' : 'partial window, up to 24h')) +
      (snap.awaitingSnapshot ? ' · last verified snapshot; waiting for next full kline' : ' · verified full klines, including latest snapshot') +
      (snap.lastProviderEventTime ? ' · exchange event ' + new Date(snap.lastProviderEventTime).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '') +
      ' · Delta = latest candle; CVD = stated calculation window.';
  }
  function binanceCaption(snap) {
    if (snap.available === false && snap.unavailableReason === 'history-gap') return 'Binance taker · ' + snap.unit + ' · unavailable — missing candle interval';
    if (snap.available === false) return 'Binance taker · ' + snap.unit + ' · unavailable / warming';
    var first = new Date(snap.firstTime * 1000).toISOString().replace('T', ' ').slice(5, 16);
    var last = new Date(snap.lastTime * 1000).toISOString().replace('T', ' ').slice(5, 16);
    return 'Binance taker · ' + snap.unit + ' · bar starts ' + first + ' – ' + last + ' UTC · ' +
      snap.candles + ' bars' + (snap.completeWindow ? ' (24h candle window)' : ' (partial window)');
  }
  function buildBinanceSnapshot(ctx) {
    var key = 'binance:' + ctx.symbol + ':' + ctx.timeframe;
    if (state.binanceContext !== key) {
      state.binanceContext = key;
      state.binanceRows = new Map();
      state.snapshotKey = '';
    }
    var rt = runtime();
    var raw;
    // This accessor is fed only by successful full-kline commits. Price previews
    // may replace chart rows between timer ticks, but cannot erase this ledger.
    if (rt && typeof rt.getCryptoFlowKlines === 'function') {
      try { raw = rt.getCryptoFlowKlines(); } catch (_) { raw = []; }
      if (!Array.isArray(raw)) raw = [];
    } else raw = getRawCandles();
    var step = timeframeSeconds(ctx.timeframe);
    var expected = 'binance:' + ctx.symbol + ':' + ctx.timeframe;
    var byTime = new Map();
    var invalid = false;
    var awaiting = false;
    var latestRaw = 0;
    raw.forEach(function (row) {
      var time = row && Number(row.time);
      if (!Number.isFinite(time) || time <= 0) { invalid = true; return; }
      latestRaw = Math.max(latestRaw, time);
      var full = verifiedBinanceRow(row, ctx);
      if (!full && row.__gpProviderOhlcContextR407 === undefined &&
        ['flowSource', 'takerBuyBaseVolume', 'quoteVolume', 'takerBuyQuoteVolume', 'tradeCount', 'priceEventTime'].every(function (field) { return row[field] === undefined; }) &&
        row.__gpProviderOhlcAnchorR407 && row.__gpProviderOhlcAnchorR407.context === expected &&
        Number(row.__gpProviderOhlcAnchorR407.time) === time && state.binanceRows.has(time)) {
        // A trade-only OHLC preview cannot alter flow. Keep only a full snapshot
        // already observed in this page/context; never import another tab's CVD.
        full = state.binanceRows.get(time);
        awaiting = true;
      }
      if (!full) { byTime.set(time, null); return; }
      if (byTime.has(time) && JSON.stringify(byTime.get(time)) !== JSON.stringify(full)) invalid = true;
      byTime.set(time, full);
    });
    // Anchor the selected window to provider candle time, not the device clock.
    var requestedStart = latestRaw + step - Math.max(86400, step);
    var times = Array.from(byTime.keys()).filter(function (time) { return time >= requestedStart; }).sort(function (a, b) { return a - b; });
    var rows = times.map(function (time) { return byTime.get(time); });
    if (!rows.length || rows.some(function (row) { return !row; })) invalid = true;
    var internalGap = times.some(function (time, index) { return index > 0 && time - times[index - 1] !== step; });
    if (internalGap) invalid = true;
    var snap = {
      version: VERSION + '-binance-flow-r473', source: 'binance-spot-kline-taker-quote', context: ctx,
      unit: binanceUnit(ctx), timeZone: tz(), timeZoneLabel: tzLabel(), available: !invalid,
      unavailableReason: invalid ? (internalGap ? 'history-gap' : 'unverified-klines') : null,
      window: step > 86400 ? 'latest-provider-candle' : 'provider-anchored-up-to-24h', requestedStartTime: requestedStart,
      candles: invalid ? 0 : rows.length, firstTime: null, lastTime: null,
      buy: null, sell: null, cvd: null, delta: null, points: [], completeWindow: false,
      awaitingSnapshot: awaiting
    };
    if (!invalid) {
      var signature = [snap.version, key, requestedStart, awaiting, rows.map(function (row) {
        return [row.time, row.open, row.high, row.low, row.close, row.volume, row.takerBuyBaseVolume,
          row.quoteVolume, row.takerBuyQuoteVolume, row.tradeCount, row.priceEventTime || ''].join(',');
      }).join(';')].join('|');
      if (state.snapshotKey === signature && state.snapshot) return state.snapshot;
      var buy = 0, sell = 0;
      rows.forEach(function (row) {
        buy += row.takerBuyQuoteVolume;
        sell += row.quoteVolume - row.takerBuyQuoteVolume;
        var signed = 2 * row.takerBuyQuoteVolume - row.quoteVolume;
        snap.points.push({ time: row.time * 1000, timeSec: row.time, buy: buy, sell: sell, cvd: buy - sell, value: buy - sell, signed: signed });
      });
      snap.firstTime = rows[0].time;
      snap.lastTime = rows[rows.length - 1].time;
      snap.lastProviderEventTime = rows[rows.length - 1].priceEventTime || null;
      snap.buy = buy; snap.sell = sell; snap.cvd = buy - sell;
      snap.delta = snap.points[snap.points.length - 1].signed;
      snap.completeWindow = step <= 86400 && snap.firstTime === requestedStart &&
        rows.every(function (row, index) { return !index || row.time - rows[index - 1].time === step; });
      state.snapshotKey = signature;
      state.binanceRows = new Map(rows.map(function (row) { return [row.time, row]; }));
    } else {
      state.snapshotKey = '';
      state.binanceRows = new Map();
    }
    snap.description = binanceDescription(snap);
    state.snapshot = snap;
    try { window.__gpPrimeCanonicalFlowSnapshot = snap; } catch (_) {}
    return snap;
  }
  function maxSharedAgeMs(ctx) {
    return Math.max(90000, timeframeSeconds(ctx && ctx.timeframe) * 1000 * 2);
  }
  function readSharedSnapshot(ctx) {
    if (isBinanceContext(ctx)) return null;
    try {
      var raw = localStorage.getItem(SHARED_STORE_KEY + ':' + contextKey(ctx));
      var saved = raw ? JSON.parse(raw) : null;
      if (!saved || !saved.snapshot) return null;
      if (Date.now() - Number(saved.savedAt || 0) > maxSharedAgeMs(ctx)) return null;
      return saved.snapshot;
    } catch (_) {
      return null;
    }
  }
  function writeSharedSnapshot(snapshot) {
    if (!snapshot || !snapshot.context) return;
    if (isBinanceContext(snapshot.context)) return;
    try {
      var payload = { savedAt: Date.now(), snapshot: snapshot };
      localStorage.setItem(SHARED_STORE_KEY + ':' + contextKey(snapshot.context), JSON.stringify(payload));
      if (state.channel) state.channel.postMessage(payload);
    } catch (_) {}
  }
  function preferSharedSnapshot(localSnap, ctx) {
    var shared = readSharedSnapshot(ctx || (localSnap && localSnap.context));
    if (!shared) return localSnap;
    if (!localSnap) return shared;
    if (contextKey(shared.context) !== contextKey(localSnap.context)) return localSnap;
    if (Number(shared.lastTime || 0) > Number(localSnap.lastTime || 0)) return shared;
    return localSnap;
  }

  function buildSnapshot() {
    var ctx = context();
    if (isBinanceContext(ctx)) return buildBinanceSnapshot(ctx);
    if (state.binanceContext) { state.binanceContext = ''; state.binanceRows = new Map(); state.snapshotKey = ''; }
    var candles = getCandles();
    if (!candles.length) return preferSharedSnapshot(null, ctx);
    var last = candles[candles.length - 1];
    var first = candles[0];
    var tail = candles.slice(-8).map(function (c) {
      return [c.time, c.open, c.high, c.low, c.close].join(',');
    }).join(';');
    var key = [VERSION, ctx.symbol, ctx.exchange, ctx.timeframe, candles.length, first.time, last.time, tail].join('|');
    if (key === state.snapshotKey && state.snapshot) return state.snapshot;

    var session = selectSessionCandles(candles);
    var buy = 0;
    var sell = 0;
    var cvd = 0;
    var points = [];
    var signedValues = [];
    for (var i = 0; i < session.length; i += 1) {
      var c = session[i];
      var prev = i > 0 ? session[i - 1] : candles[Math.max(0, candles.indexOf(c) - 1)] || c;
      var signed = signedNotional(c, prev, i, ctx);
      if (signed >= 0) buy += signed;
      else sell += Math.abs(signed);
      cvd = buy - sell;
      signedValues.push({ time: c.time, value: signed });
      points.push({ time: c.time * 1000, timeSec: c.time, buy: buy, sell: sell, cvd: cvd, value: cvd, signed: signed });
    }

    var tfSec = timeframeSeconds(ctx.timeframe);
    var lastSec = session.length ? session[session.length - 1].time : last.time;
    var deltaWindow = tfSec <= 60 ? 900 : tfSec <= 300 ? 1800 : tfSec <= 3600 ? tfSec * 3 : tfSec;
    var delta = 0;
    for (var j = 0; j < signedValues.length; j += 1) {
      if (signedValues[j].time >= lastSec - deltaWindow) delta += signedValues[j].value;
    }
    if (!delta && signedValues.length) delta = signedValues[signedValues.length - 1].value;

    var snapshot = {
      version: VERSION,
      source: 'canonical-candle-cvd-ist',
      context: ctx,
      timeZone: tz(),
      timeZoneLabel: tzLabel(),
      candles: session.length,
      firstTime: session.length ? session[0].time : null,
      lastTime: session.length ? session[session.length - 1].time : null,
      buy: buy,
      sell: sell,
      cvd: cvd,
      delta: delta,
      points: points
    };
    snapshot = preferSharedSnapshot(snapshot, ctx) || snapshot;
    state.snapshotKey = key;
    state.snapshot = snapshot;
    writeSharedSnapshot(snapshot);
    try { window.__gpPrimeCanonicalFlowSnapshot = snapshot; } catch (_) {}
    return snapshot;
  }

  function calculateIndexAlpha(book) {
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks) || !book.bids.length || !book.asks.length) return 1;
    var bid = book.bids.reduce(function (sum, row) { return sum + (Number(row && row[1]) || 0); }, 0);
    var ask = book.asks.reduce(function (sum, row) { return sum + (Number(row && row[1]) || 0); }, 0);
    return ask === 0 ? 999 : bid / ask;
  }

  function calculateImbalance(book) {
    if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks) || !book.bids.length || !book.asks.length) return 0;
    var bid = Number(book.bids[0] && book.bids[0][1]) || 0;
    var ask = Number(book.asks[0] && book.asks[0][1]) || 0;
    var total = bid + ask;
    return total === 0 ? 0 : (bid - ask) / total;
  }

  function getMetrics(book) {
    var snap = buildSnapshot();
    if (!snap) return null;
    var alpha = calculateIndexAlpha(book);
    var imbalance = calculateImbalance(book);
    return {
      indexAlpha: alpha.toFixed(2),
      delta: snap.available === false ? '—' : formatNumber(snap.delta),
      cvd: snap.available === false ? '—' : formatNumber(snap.cvd),
      imbalance: (imbalance * 100).toFixed(1) + '%',
      raw: { indexAlpha: alpha, delta: snap.delta, cvd: snap.cvd, imbalance: imbalance },
      source: snap.source,
      timeZone: snap.timeZone,
      available: snap.available !== false,
      unit: snap.unit,
      firstTime: snap.firstTime,
      lastTime: snap.lastTime,
      description: snap.description
    };
  }

  function setMetricClass(node, value) {
    if (!node) return;
    node.classList.toggle('metric__value--positive', value > 0);
    node.classList.toggle('metric__value--negative', value < 0);
    if (node.classList.contains('gp-cvd-building-v78')) node.classList.remove('gp-cvd-building-v78');
  }

  function syncMetrics(snapshot) {
    var snap = snapshot || buildSnapshot();
    if (!snap) return false;
    var deltaNode = qs('#metric-delta');
    var cvdNode = qs('#metric-cvd');
    if (isBinanceContext(snap.context)) {
      state.metricLock = true;
      try { [deltaNode, cvdNode].forEach(function (node, index) {
        if (!node) return;
        var value = index ? snap.cvd : snap.delta;
        var label = node.parentNode && node.parentNode.querySelector('.metric__label');
        var labelText = (index ? 'CVD' : 'Delta') + ' (' + snap.unit + ')';
        if (label && label.textContent !== labelText) label.textContent = labelText;
        var text = snap.available === false ? 'Warming…' : formatNumber(value);
        if (node.textContent !== text) node.textContent = text;
        if (node.title !== snap.description) node.title = snap.description;
        if (node.dataset.gpCvdSource !== snap.source) node.dataset.gpCvdSource = snap.source;
        var warmup = snap.available === false ? '1' : '0';
        if (node.dataset.gpCvdWarmup !== warmup) node.dataset.gpCvdWarmup = warmup;
        setMetricClass(node, value);
      }); } finally { state.metricLock = false; }
      state.lastMetricAt = Date.now();
      return true;
    }
    [deltaNode, cvdNode].forEach(function (node, index) {
      var label = node && node.parentNode && node.parentNode.querySelector('.metric__label');
      if (label && /^(CVD|Delta) \(/.test(label.textContent)) label.textContent = index ? 'CVD' : 'Delta';
    });
    state.metricLock = true;
    try {
      if (deltaNode) {
        var deltaText = formatNumber(snap.delta);
        var deltaTitle = 'Synchronized canonical Delta from chart candles (' + tzLabel() + ').';
        if (deltaNode.textContent !== deltaText) deltaNode.textContent = deltaText;
        if (deltaNode.title !== deltaTitle) deltaNode.title = deltaTitle;
        setMetricClass(deltaNode, snap.delta);
      }
      if (cvdNode) {
        var cvdText = formatNumber(snap.cvd);
        var cvdTitle = 'Shared canonical CVD from closed chart candles, anchored to the current IST session.';
        if (cvdNode.textContent !== cvdText) cvdNode.textContent = cvdText;
        if (cvdNode.dataset.gpCvdWarmup !== '0') cvdNode.dataset.gpCvdWarmup = '0';
        if (cvdNode.dataset.gpCvdSource !== 'canonical-v207') cvdNode.dataset.gpCvdSource = 'canonical-v207';
        if (cvdNode.title !== cvdTitle) cvdNode.title = cvdTitle;
        setMetricClass(cvdNode, snap.cvd);
      }
      state.lastMetricAt = Date.now();
    } finally {
      state.metricLock = false;
    }
    return true;
  }

  function findCvdChart() {
    var rt = runtime();
    if (!rt) return null;
    return rt.cvdChart || rt.cvd || null;
  }

  function syncCvdChart(snapshot) {
    var cvd = findCvdChart();
    if (!cvd || !Array.isArray(cvd.buyData) || !Array.isArray(cvd.sellData) || !Array.isArray(cvd.cvdData)) return false;
    var snap = snapshot || buildSnapshot();
    if (snap && isBinanceContext(snap.context)) {
      var description = snap.description;
      if (cvd.container) {
        cvd.container.dataset.gpCvdSync = snap.source;
        cvd.container.title = description;
        var note = cvd.container.querySelector('[data-gp-binance-flow-caption]');
        if (!note) {
          note = document.createElement('div');
          note.setAttribute('data-gp-binance-flow-caption', '');
          note.style.cssText = 'position:absolute;left:8px;right:8px;bottom:1px;z-index:2;font:9px/1.2 sans-serif;color:#aebdca;background:rgba(10,16,24,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
          cvd.container.appendChild(note);
        }
        var caption = binanceCaption(snap);
        if (note.textContent !== caption) note.textContent = caption;
        if (note.title !== description) note.title = description;
      }
      if (snap.available === false) {
        cvd.buyData = []; cvd.sellData = []; cvd.cvdData = [];
        ['buyLine', 'sellLine', 'cvdLine', 'buyArea', 'sellArea'].forEach(function (key) { if (cvd[key] && typeof cvd[key].attr === 'function') cvd[key].attr('d', null); });
        ['#cvd-buy-value', '#cvd-sell-value', '#cvd-value'].forEach(function (selector) { var node = qs(selector); if (node && node.textContent !== '—') node.textContent = '—'; });
        state.lastChartSignature = '';
        return true;
      }
      if (snap.points.length < 2) {
        ['buyLine', 'sellLine', 'cvdLine', 'buyArea', 'sellArea'].forEach(function (key) { if (cvd[key] && typeof cvd[key].attr === 'function') cvd[key].attr('d', null); });
      }
    } else if (cvd.container) {
      var oldNote = cvd.container.querySelector('[data-gp-binance-flow-caption]');
      if (oldNote) oldNote.remove();
    }
    if (!snap || !snap.points || snap.points.length < (isBinanceContext(snap.context) ? 1 : 2)) return false;
    var max = Number(cvd.options && cvd.options.maxDataPoints) || 100;
    var points = snap.points.slice(-Math.max(20, max));
    var lastPoint = points[points.length - 1] || {};
    var chartSignature = [
      contextKey(snap.context), points.length, snap.lastTime || 0,
      Number(snap.buy || 0).toFixed(4), Number(snap.sell || 0).toFixed(4),
      Number(snap.cvd || 0).toFixed(4), Number(lastPoint.time || 0),
      isBinanceContext(snap.context) ? points.map(function (point) { return [point.time, point.buy, point.sell, point.cvd].join(','); }).join(';') : ''
    ].join('|');
    if (state.lastChartTarget === cvd && state.lastChartSignature === chartSignature) return true;
    cvd.buyData = points.map(function (p) { return { time: p.time, value: p.buy }; });
    cvd.sellData = points.map(function (p) { return { time: p.time, value: p.sell }; });
    cvd.cvdData = points.map(function (p) { return { time: p.time, value: p.cvd }; });
    try {
      if (cvd.container) {
        var chartTitle = isBinanceContext(snap.context) ? snap.description : 'CVD synchronized from shared closed-candle data. Time zone: ' + tzLabel() + ' (' + tz() + ').';
        var chartSource = isBinanceContext(snap.context) ? snap.source : 'canonical-v207';
        if (cvd.container.dataset.gpCvdSync !== chartSource) cvd.container.dataset.gpCvdSync = chartSource;
        if (cvd.container.title !== chartTitle) cvd.container.title = chartTitle;
      }
      if (typeof cvd._render === 'function') cvd._render();
      if (typeof cvd._updateLegend === 'function') cvd._updateLegend(snap.buy, snap.sell, snap.cvd);
      state.lastChartTarget = cvd;
      state.lastChartSignature = chartSignature;
      state.lastChartSyncAt = Date.now();
      return true;
    } catch (_) {
      return false;
    }
  }

  function resolveChartApi() {
    var rt = runtime();
    var shell = rt && rt.chart;
    if (!shell) return null;
    if (typeof shell.getChartInstance === 'function') {
      try { return shell.getChartInstance(); } catch (_) {}
    }
    if (shell.chart && typeof shell.chart.applyOptions === 'function') return shell.chart;
    if (typeof shell.applyOptions === 'function') return shell;
    return null;
  }

  function applyChartTimezone(force) {
    var now = Date.now();
    if (!force && now - state.lastChartTzAt < 2500) return false;
    var chart = resolveChartApi();
    if (!chart || typeof chart.applyOptions !== 'function') return false;
    var axisFormatter = function (time) { return formatAxisTime(time); };
    var crosshairFormatter = function (time) { return formatCrosshairTime(time); };
    try {
      chart.applyOptions({
        localization: {
          locale: 'en-IN',
          timeFormatter: crosshairFormatter
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: axisFormatter
        }
      });
      try {
        if (chart.timeScale && chart.timeScale() && typeof chart.timeScale().applyOptions === 'function') {
          chart.timeScale().applyOptions({ timeVisible: true, secondsVisible: false, tickMarkFormatter: axisFormatter });
        }
      } catch (_) {}
      state.lastChartTzAt = now;
      return true;
    } catch (_) {
      return false;
    }
  }

  function injectBadgeStyle() {
    if (document.getElementById('gp-cvd-ist-sync-v172-style')) return;
    var style = document.createElement('style');
    style.id = 'gp-cvd-ist-sync-v172-style';
    style.textContent = [
      '.gp-ist-timezone-badge-v172{position:absolute;right:54px;top:10px;z-index:36;pointer-events:none;display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;border:1px solid rgba(0,224,255,.24);background:rgba(3,10,18,.48);color:rgba(219,255,255,.82);font:900 10px/1 Inter,system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 8px 18px rgba(0,0,0,.18);backdrop-filter:blur(10px)}',
      '.gp-ist-timezone-badge-v172::before{content:"";width:6px;height:6px;border-radius:999px;background:#00ff9d;box-shadow:0 0 8px rgba(0,255,157,.75)}',
      'body.chart-theme-light .gp-ist-timezone-badge-v172{background:rgba(255,255,255,.72);color:#0f172a;border-color:rgba(14,165,198,.28)}',
      '@media(max-width:720px){.gp-ist-timezone-badge-v172{right:12px;top:8px;font-size:9px;padding:4px 7px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureIstBadge() {
    var host = qs('#chart-area');
    if (!host) return;
    injectBadgeStyle();
    var badge = document.getElementById('gp-ist-timezone-badge-v172');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'gp-ist-timezone-badge-v172';
      badge.className = 'gp-ist-timezone-badge-v172';
      host.appendChild(badge);
    }
    try {
      var pos = window.getComputedStyle(host).position;
      if (pos === 'static') host.style.position = 'relative';
    } catch (_) {}
    var badgeText = 'Time: ' + tzLabel();
    var badgeTitle = 'All chart candle times are displayed in ' + tzLabel() + ' (' + tz() + ').';
    if (badge.textContent !== badgeText) badge.textContent = badgeText;
    if (badge.title !== badgeTitle) badge.title = badgeTitle;
  }

  function syncNow(force) {
    getConfig();
    applyChartTimezone(!!force);
    ensureIstBadge();
    var snap = buildSnapshot();
    if (snap) {
      syncMetrics(snap);
      syncCvdChart(snap);
    }
    return snap;
  }

  function queueSync() {
    if (state.metricLock || state.queued) return;
    state.queued = true;
    setTimeout(function () {
      state.queued = false;
      syncNow(false);
    }, 120);
  }

  function bindObserver() {
    if (state.observer) return;
    var root = qs('#analytics') || document.body;
    if (!root || typeof MutationObserver === 'undefined') return;
    try {
      state.observer = new MutationObserver(queueSync);
      state.observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-gp-cvd-warmup'] });
    } catch (_) {}
  }
  function applySharedPayload(payload) {
    var snap = payload && payload.snapshot;
    if (isBinanceContext(context()) || isBinanceContext(snap && snap.context)) return;
    if (!snap || contextKey(snap.context) !== contextKey(context())) return;
    if (state.snapshot && Number(state.snapshot.lastTime || 0) > Number(snap.lastTime || 0)) return;
    var sharedSignature = [
      contextKey(snap.context), snap.lastTime || 0,
      Number(snap.buy || 0).toFixed(4), Number(snap.sell || 0).toFixed(4),
      Number(snap.cvd || 0).toFixed(4), Number(snap.delta || 0).toFixed(4)
    ].join('|');
    if (state.lastSharedSignature === sharedSignature) return;
    state.lastSharedSignature = sharedSignature;
    state.snapshot = snap;
    syncMetrics(snap);
    syncCvdChart(snap);
  }
  function bindSharedChannel() {
    if (!state.channel && typeof BroadcastChannel !== 'undefined') {
      try {
        state.channel = new BroadcastChannel(SHARED_CHANNEL_NAME);
        state.channel.onmessage = function (event) { applySharedPayload(event && event.data); };
      } catch (_) {
        state.channel = null;
      }
    }
    window.addEventListener('storage', function (event) {
      if (!event || !event.key || event.key.indexOf(SHARED_STORE_KEY + ':') !== 0 || !event.newValue) return;
      try { applySharedPayload(JSON.parse(event.newValue)); } catch (_) {}
    });
  }

  function start() {
    getConfig();
    bindSharedChannel();
    syncNow(true);
    if (!state.interval) {
      state.interval = setInterval(function () {
        if (!document.hidden) syncNow(false);
      }, 850);
    }
  }

  window.addEventListener('guardeer:prime-runtime-ready', function (event) {
    state.runtime = event && event.detail || window.GuardeerPrimeRuntime || null;
    syncNow(true);
  });
  window.addEventListener('guardeer:market-data-state', queueSync);
  window.addEventListener('guardeer:forexgold-live-tick', queueSync);
  window.addEventListener('guardeer:prime-orderflow-enabled', queueSync);
  window.addEventListener('resize', function () { applyChartTimezone(true); syncCvdChart(); }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncNow(true); });

  window.GPPrimeCvdIstSyncV172 = {
    version: VERSION,
    isActive: true,
    getMetrics: getMetrics,
    getSnapshot: buildSnapshot,
    syncNow: syncNow,
    applyChartTimezone: applyChartTimezone,
    formatAxisTime: formatAxisTime,
    formatCrosshairTime: formatCrosshairTime
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
