(function () {
  'use strict';

  if (window.__GP_MODULE2_FOOTPRINT_R388_PANEL_CROSSHAIR_DATE__) return;
  window.__GP_MODULE2_FOOTPRINT_R388_PANEL_CROSSHAIR_DATE__ = true;

  var VERSION = 'r390-truthful-freshness-v1';
  var HISTORY_LIMIT = 1200;
  var STANDALONE = window.__GP_MODULE2_STANDALONE__ === true || document.documentElement.hasAttribute('data-gp-module2-standalone');
  var SINGLE_VIEW = window.__GP_MODULE2_SINGLE_VIEW__ === true;
  var INITIAL_VIEW = Math.max(1, Math.min(6, Math.round(Number(window.__GP_MODULE2_INITIAL_VIEW__) || 1)));
  var TOOL_TITLE = String(window.__GP_MODULE2_TOOL_TITLE__ || 'Footprint Bid × Ask Delta');
  var TOOL_MARK = String(window.__GP_MODULE2_TOOL_MARK__ || 'B×A');
  var QUICK_TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h'];
  var KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'BCH', 'TRX', 'SUI', 'PEPE'];
  var VIEW_NAMES = [
    'Bid-Ask Profile',
    'Cluster + Delta',
    'Bid × Ask Ladder',
    'Delta Cluster + DOM',
    'Classic Footprint',
    'Footprint Statistics'
  ];

  var state = {
    open: false,
    overlay: null,
    canvas: null,
    ctx: null,
    resizeObserver: null,
    symbol: 'BTCUSDT',
    exchange: 'binance',
    timeframe: '5m',
    timeframeLocked: false,
    source: 'Waiting for market data',
    status: 'idle',
    statusTone: 'warn',
    activeView: INITIAL_VIEW,
    candles: [],
    buyVolume: 0,
    sellVolume: 0,
    totalVolume: 0,
    prints: 0,
    lastPrice: 0,
    tickSize: 1,
    proxyUnit: 1,
    ws: null,
    feedToken: 0,
    reconnectTimer: 0,
    pollTimer: 0,
    pollBusy: false,
    marketTimer: 0,
    reloadTimer: 0,
    renderFrame: 0,
    loadSeq: 0,
    zoom: 1,
    endOffset: 0,
    hoverIndex: null,
    layout: null,
    metricLayout: null,
    toastTimer: 0,
    lastRuntimeSignature: '',
    lastHistoryError: '',
    lastIntegrityRefreshAt: 0,
    freshHistoryProof: null,
    sideMode: 'unknown',
    chromeMode: '',
    secureRetryTimer: 0,
    secureRetryCount: 0
  };

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function targetOf(event) {
    var target = event && event.target;
    return target && target.nodeType === 1 ? target : target && target.parentElement ? target.parentElement : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
  }

  function setEndOffset(nextOffset) {
    var next = clamp(Math.round(number(nextOffset)), 0, Math.max(0, state.candles.length - 2));
    if (next === state.endOffset) return false;
    state.endOffset = next;
    clearHover(false);
    scheduleRender();
    return true;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function cleanSymbol(value) {
    return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function cleanExchange(value) {
    var text = String(value || '').trim().toLowerCase();
    if (text.indexOf('okx') >= 0) return 'okx';
    if (text.indexOf('bybit') >= 0) return 'bybit';
    if (text.indexOf('binance') >= 0) return 'binance';
    if (text.indexOf('forex') >= 0 || text.indexOf('gold') >= 0 || text.indexOf('polygon') >= 0) return 'forexgold';
    return text || 'binance';
  }

  function normalizeTimeframe(value) {
    var text = String(value || '5m').trim();
    if (/^\d+$/.test(text)) text += 'm';
    if (text === 'H' || text === '1H') text = '1h';
    if (text === 'D' || text === '1D') text = '1d';
    if (!/^\d+[mhdwM]$/.test(text)) return '5m';
    return text;
  }

  function timeframeMs(value) {
    var text = normalizeTimeframe(value);
    var amount = parseInt(text, 10) || 1;
    if (text.slice(-1) === 'm') return amount * 60000;
    if (text.slice(-1) === 'h') return amount * 3600000;
    if (text.slice(-1) === 'd') return amount * 86400000;
    if (text.slice(-1) === 'w') return amount * 604800000;
    return 60000;
  }

  function freshnessVerifierR390() {
    return window.GPForexGoldDataFreshnessR390 || null;
  }

  function requireFreshHistoryR390(rows, timeframe, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.assertFreshHistory !== 'function') {
      var unavailable = new Error('Forex/Gold freshness verifier is unavailable.');
      unavailable.code = 'FRESHNESS_VERIFIER_UNAVAILABLE';
      throw unavailable;
    }
    return verifier.assertFreshHistory(rows, timeframe, source);
  }

  function freshHistoryInspectionR390(rows, timeframe) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.inspectHistory !== 'function') {
      return { ok: false, reason: 'freshness-verifier-unavailable' };
    }
    return verifier.inspectHistory(rows, timeframe);
  }

  function verifiedQuoteResultR390(row, price, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.quoteResult !== 'function') {
      return { price: number(price), source: source, fresh: false, time: 0, freshnessReason: 'freshness-verifier-unavailable' };
    }
    return verifier.quoteResult(row, price, source);
  }

  function freshnessContextR390(symbol, exchange, timeframe) {
    return [cleanExchange(exchange), cleanSymbol(symbol), normalizeTimeframe(timeframe)].join(':');
  }

  function rememberFreshHistoryProofR390(rows, timeframe, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.historyProof !== 'function') {
      state.freshHistoryProof = null;
      return null;
    }
    state.freshHistoryProof = verifier.historyProof(
      rows,
      timeframe,
      freshnessContextR390(state.symbol, state.exchange, timeframe),
      source
    );
    return state.freshHistoryProof;
  }

  function requireFreshQuoteR390(result, source) {
    var verifier = freshnessVerifierR390();
    if (verifier && typeof verifier.assertFreshQuote === 'function') {
      return verifier.assertFreshQuote(result, source);
    }
    var error = new Error('Forex/Gold quote freshness verifier is unavailable.');
    error.code = 'FRESHNESS_VERIFIER_UNAVAILABLE';
    throw error;
  }

  function responseTimeQuoteFallbackR390(result, symbol, exchange, timeframe, source) {
    var verifier = freshnessVerifierR390();
    if (!verifier || typeof verifier.responseTimeFallback !== 'function') return null;
    return verifier.responseTimeFallback(
      result,
      state.freshHistoryProof,
      freshnessContextR390(symbol, exchange, timeframe),
      source
    );
  }

  function runtime() {
    try {
      var root = window.GuardeerPrimeRuntime || null;
      return root && (root.runtime || root);
    } catch (_) {
      return null;
    }
  }

  function config() {
    return window.GUARDEER_CONFIG || {};
  }

  function freshTimestamp(value) {
    var timestamp = number(value);
    if (!(timestamp > 0) && typeof value === 'string') timestamp = Date.parse(value);
    if (timestamp > 0 && timestamp < 100000000000) timestamp *= 1000;
    var age = Date.now() - timestamp;
    return timestamp > 0 && age >= 0 && age < 15000 ? timestamp : 0;
  }

  function quoteEventTime(quote) {
    var verified = quote && quote.fresh === true ? freshTimestamp(quote.time) : 0;
    return verified || Date.now();
  }

  function chartTimeZone() {
    var zone = String(config().PRIME_CHART_TIMEZONE || 'Asia/Kolkata').trim();
    return zone || 'Asia/Kolkata';
  }

  function chartTimeZoneLabel() {
    var label = String(config().PRIME_CHART_TIMEZONE_LABEL || 'IST').trim();
    return label || 'IST';
  }

  function readMarket() {
    var rt = runtime();
    var rtState = rt && rt.state || {};
    var symbolNode = qs('#symbol-label,[data-symbol-label],.symbol-display,#gp-overview-symbol');
    var symbol = cleanSymbol(rtState.symbol || (symbolNode && symbolNode.textContent) || state.symbol || 'BTCUSDT');
    var exchangeHint = rtState.exchange || rtState.market || rtState.provider || '';
    var exchange = cleanExchange(exchangeHint || state.exchange || 'binance');
    if (!exchangeHint && /(?:USDT|USDC|BUSD)$/.test(symbol)) exchange = 'binance';
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD' || (/^[A-Z]{6}$/.test(symbol) && !/(USDT|USDC)$/.test(symbol))) exchange = 'forexgold';
    if (isCrypto(symbol, exchange)) exchange = 'binance';
    var tfNode = qs('.timeframe-btn.active,[data-tf].active,#timeframe-select,#header-timeframe-select,[data-timeframe-select]');
    var timeframe = normalizeTimeframe(rtState.timeframe || (tfNode && (tfNode.value || tfNode.getAttribute('data-tf') || tfNode.textContent)) || state.timeframe);
    return { symbol: symbol || 'BTCUSDT', exchange: exchange || 'binance', timeframe: timeframe };
  }

  function isCrypto(symbol, exchange) {
    symbol = cleanSymbol(symbol);
    if (cleanExchange(exchange) === 'forexgold') return false;
    if (/(USDT|USDC|BUSD|BTC|ETH)$/.test(symbol) && symbol.length > 5) return true;
    if (/USD$/.test(symbol) && KNOWN_CRYPTO.indexOf(symbol.slice(0, -3)) >= 0) return true;
    return KNOWN_CRYPTO.indexOf(symbol) >= 0;
  }

  function usesQuotePressure() {
    return !isCrypto(state.symbol, state.exchange) || state.sideMode !== 'aggressor';
  }

  function binanceSymbol(symbol) {
    symbol = cleanSymbol(symbol).replace(/^XBT/, 'BTC');
    if (/USDT$/.test(symbol)) return symbol;
    if (/USDC$/.test(symbol)) return symbol.slice(0, -4) + 'USDT';
    if (/USD$/.test(symbol)) return symbol.slice(0, -3) + 'USDT';
    if (KNOWN_CRYPTO.indexOf(symbol) >= 0) return symbol + 'USDT';
    return symbol;
  }

  function binancePriceTick(symbol) {
    var ticks = {
      BTCUSDT: .01,
      ETHUSDT: .01,
      BNBUSDT: .01,
      SOLUSDT: .001,
      XRPUSDT: .0001,
      DOGEUSDT: .00001
    };
    return ticks[binanceSymbol(symbol)] || .00000001;
  }

  function binanceInterval(tf) {
    var supported = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    tf = normalizeTimeframe(tf);
    return supported.indexOf(tf) >= 0 ? tf : '5m';
  }

  function formatValue(value) {
    value = number(value);
    var absolute = Math.abs(value);
    var sign = value < 0 ? '-' : '';
    if (absolute >= 1000000000) return sign + (absolute / 1000000000).toFixed(2) + 'B';
    if (absolute >= 1000000) return sign + (absolute / 1000000).toFixed(2) + 'M';
    if (absolute >= 1000) return sign + (absolute / 1000).toFixed(1) + 'K';
    if (absolute >= 100) return sign + absolute.toFixed(0);
    if (absolute >= 10) return sign + absolute.toFixed(1);
    return sign + absolute.toFixed(2);
  }

  function formatCell(value) {
    var absolute = Math.abs(number(value));
    if (absolute >= 1000000) return (absolute / 1000000).toFixed(1) + 'M';
    if (absolute >= 1000) return (absolute / 1000).toFixed(0) + 'K';
    if (absolute >= 100) return absolute.toFixed(0);
    if (absolute >= 10) return absolute.toFixed(1);
    return absolute.toFixed(2);
  }

  function formatPrice(value) {
    value = number(value);
    var absolute = Math.abs(value);
    if (absolute >= 1000) return value.toFixed(2);
    if (absolute >= 100) return value.toFixed(3);
    if (absolute >= 1) return value.toFixed(4);
    return value.toFixed(6);
  }

  function formatTime(value, withSeconds) {
    var date = new Date(number(value));
    if (!Number.isFinite(date.getTime())) return '--:--';
    try {
      return date.toLocaleTimeString('en-GB', {
        timeZone: chartTimeZone(),
        hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined, hour12: false
      }) + ' ' + chartTimeZoneLabel();
    } catch (_) {
      return date.toISOString().slice(11, withSeconds ? 19 : 16) + ' ' + chartTimeZoneLabel();
    }
  }

  function formatTooltipDateTime(value) {
    var date = new Date(number(value));
    if (!Number.isFinite(date.getTime())) return '-- --- ---- \u00b7 --:--:-- ' + chartTimeZoneLabel();
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: chartTimeZone(),
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(date);
      var values = {};
      parts.forEach(function (part) {
        if (part.type !== 'literal') values[part.type] = part.value;
      });
      return (values.day || '--') + ' ' + (values.month || '---') + ' ' + (values.year || '----') +
        ' \u00b7 ' + (values.hour || '--') + ':' + (values.minute || '--') + ':' + (values.second || '--') +
        ' ' + chartTimeZoneLabel();
    } catch (_) {
      return date.toLocaleString('en-GB', {
        timeZone: chartTimeZone(),
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) + ' ' + chartTimeZoneLabel();
    }
  }

  function rgba(hex, alpha) {
    var value = String(hex || '#ffffff').replace('#', '');
    if (value.length === 3) value = value.split('').map(function (char) { return char + char; }).join('');
    var integer = parseInt(value, 16);
    return 'rgba(' + ((integer >> 16) & 255) + ',' + ((integer >> 8) & 255) + ',' + (integer & 255) + ',' + alpha + ')';
  }

  function niceTick(price, range) {
    var raw = Math.max(Math.abs(number(range)) / 11, Math.abs(number(price)) * .000001, .00000001);
    var power = Math.pow(10, Math.floor(Math.log10(raw)));
    var fraction = raw / power;
    var nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return nice * power;
  }

  function historyRow(time, open, high, low, close, volume, buy, sell, prints, sideMode) {
    var vol = Math.max(0, number(volume, 1));
    var range = Math.max(.0000001, Math.abs(number(high) - number(low)));
    var pressure = clamp((number(close) - number(open)) / range, -1, 1);
    var hasExplicitSides = buy != null && sell != null && Number.isFinite(Number(buy)) && Number.isFinite(Number(sell));
    var estimatedBuy = hasExplicitSides ? Math.max(0, Number(buy)) : vol * (.5 + pressure * .32);
    var estimatedSell = hasExplicitSides ? Math.max(0, Number(sell)) : Math.max(0, vol - estimatedBuy);
    return {
      time: number(time), open: number(open), high: number(high), low: number(low), close: number(close),
      volume: vol, buy: estimatedBuy, sell: estimatedSell,
      delta: estimatedBuy - estimatedSell, prints: Math.max(1, number(prints, 1)),
      levelMode: 'estimated-price-levels',
      sideMode: sideMode === 'aggressor' ? 'aggressor' :
        sideMode === 'quote-pressure' ? 'quote-pressure' :
          hasExplicitSides ? 'aggressor' : 'quote-pressure'
    };
  }

  function buildLevels(row) {
    var tick = niceTick(row.close, row.high - row.low);
    var start = Math.floor(row.low / tick) * tick;
    var end = Math.ceil(row.high / tick) * tick;
    var count = Math.round((end - start) / tick) + 1;
    while (count > 18) {
      tick *= 2;
      start = Math.floor(row.low / tick) * tick;
      end = Math.ceil(row.high / tick) * tick;
      count = Math.round((end - start) / tick) + 1;
    }
    if (count < 4) {
      start -= tick;
      end += tick;
      count += 2;
    }
    var weights = [];
    for (var index = 0; index < count; index += 1) {
      var normalized = count === 1 ? .5 : index / (count - 1);
      var center = .52 + clamp((row.close - row.open) / Math.max(.0000001, row.high - row.low), -.45, .45) * .18;
      var weight = .24 + Math.exp(-Math.pow((normalized - center) / .29, 2) * 2.1);
      weights.push(weight);
    }
    var askWeights = [];
    var bidWeights = [];
    var totalAskWeight = 0;
    var totalBidWeight = 0;
    for (var sideIndex = 0; sideIndex < count; sideIndex += 1) {
      var sidePosition = count === 1 ? 0 : sideIndex / (count - 1) - .5;
      var directionalBias = sidePosition * (row.close >= row.open ? .7 : -.7);
      var askWeight = weights[sideIndex] * clamp(1 + directionalBias, .25, 1.75);
      var bidWeight = weights[sideIndex] * clamp(1 - directionalBias, .25, 1.75);
      askWeights.push(askWeight);
      bidWeights.push(bidWeight);
      totalAskWeight += askWeight;
      totalBidWeight += bidWeight;
    }
    var levels = [];
    for (var levelIndex = 0; levelIndex < count; levelIndex += 1) {
      var price = start + levelIndex * tick;
      var ask = Math.max(0, number(row.buy)) * askWeights[levelIndex] / Math.max(.0000001, totalAskWeight);
      var bid = Math.max(0, number(row.sell)) * bidWeights[levelIndex] / Math.max(.0000001, totalBidWeight);
      var levelVolume = ask + bid;
      levels.push({ price: price, bid: bid, ask: ask, delta: ask - bid, volume: levelVolume });
    }
    row.tick = tick;
    row.levels = levels;
    updateCandleStats(row);
    return row;
  }

  function updateCandleStats(candle) {
    var poc = null;
    var maxVolume = -1;
    candle.levels.forEach(function (level) {
      level.volume = number(level.bid) + number(level.ask);
      level.delta = number(level.ask) - number(level.bid);
      if (level.volume > maxVolume) {
        maxVolume = level.volume;
        poc = level.price;
      }
    });
    candle.poc = poc == null ? candle.close : poc;
    candle.delta = number(candle.buy) - number(candle.sell);
    candle.volume = number(candle.buy) + number(candle.sell);
    return candle;
  }

  function fetchJson(url, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = window.setTimeout(function () { if (controller) controller.abort(); }, timeoutMs || 7500);
    return fetch(url, { cache: 'no-store', signal: controller && controller.signal }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || (payload && payload.ok === false)) {
          var message = String(payload && (payload.error || payload.message || payload.code) || ('HTTP ' + response.status));
          var error = new Error(message);
          error.code = payload && payload.code || '';
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    }).finally(function () { window.clearTimeout(timer); });
  }

  function loadBinanceHistory(symbol, tf) {
    var endpoint = 'https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(binanceSymbol(symbol)) + '&interval=' + encodeURIComponent(binanceInterval(tf)) + '&limit=1000';
    return fetchJson(endpoint, 8000).then(function (rows) {
      if (!Array.isArray(rows)) throw new Error('History unavailable');
      var currentBucket = Math.floor(Date.now() / timeframeMs(tf)) * timeframeMs(tf);
      var mapped = rows.filter(function (row) { return number(row[0]) < currentBucket; }).map(function (row) {
        var volume = number(row[5]);
        var buy = number(row[9]);
        return historyRow(row[0], row[1], row[2], row[3], row[4], volume, buy, Math.max(0, volume - buy), row[8], 'aggressor');
      });
      return mapped;
    });
  }

  function rebuildRecentBinanceLevels(rows, symbol, tf) {
    var list = Array.isArray(rows) ? rows : [];
    var exactStart = Math.max(0, list.length - 24);
    var interval = timeframeMs(tf);
    var pair = encodeURIComponent(binanceSymbol(symbol));
    var exactRows = list.slice(exactStart);
    if (!exactRows.length) return Promise.resolve(list);

    function rebuildRow(row) {
      var start = number(row.time);
      var end = start + interval - 1;
      var tick = binancePriceTick(symbol);
      var levels = Object.create(null);
      var cursor = start;
      var pages = 0;
      var buy = 0;
      var sell = 0;
      var prints = 0;

      function page() {
        if (pages >= 20) throw new Error('Aggregate trade page limit reached');
        pages += 1;
        var url = 'https://api.binance.com/api/v3/aggTrades?symbol=' + pair +
          '&startTime=' + cursor + '&endTime=' + end + '&limit=1000';
        return fetchJson(url, 8000).then(function (trades) {
          if (!Array.isArray(trades)) throw new Error('Aggregate trades unavailable');
          trades.forEach(function (trade) {
            var price = number(trade.p);
            var quantity = Math.max(0, number(trade.q));
            if (!(price > 0) || !(quantity > 0)) return;
            var levelPrice = Math.round(price / tick) * tick;
            var key = levelPrice.toFixed(8);
            if (!levels[key]) levels[key] = { price: levelPrice, bid: 0, ask: 0, delta: 0, volume: 0 };
            if (trade.m === true) {
              levels[key].bid += quantity;
              sell += quantity;
            } else {
              levels[key].ask += quantity;
              buy += quantity;
            }
            prints += 1;
          });
          if (trades.length === 1000) {
            var lastTime = number(trades[trades.length - 1].T);
            if (lastTime >= cursor && lastTime < end) {
              cursor = lastTime + 1;
              return page();
            }
          }
          var rebuilt = Object.keys(levels).map(function (key) { return levels[key]; }).sort(function (a, b) { return a.price - b.price; });
          if (!rebuilt.length) return row;
          row.tick = tick;
          row.levels = rebuilt;
          row.buy = buy;
          row.sell = sell;
          row.volume = buy + sell;
          row.delta = buy - sell;
          row.prints = prints;
          row.sideMode = 'aggressor';
          row.levelMode = 'exact-historical-trades';
          updateCandleStats(row);
          return row;
        });
      }
      return page();
    }

    return exactRows.reduce(function (promise, row) {
      return promise.then(function () { return rebuildRow(row); });
    }, Promise.resolve()).then(function () {
      state.source = 'Binance exact aggregate trades · latest 24 candles; older levels estimated';
      return list;
    }).catch(function () {
      state.source = 'Binance kline totals · price levels estimated';
      return list;
    });
  }

  function fmpErrorStatus(error) {
    var numeric = Number(error && error.status);
    if (Number.isFinite(numeric) && numeric >= 100 && numeric <= 599) return numeric;
    var match = String(error && (error.message || error.code) || '').match(/\bHTTP\s+(\d{3})\b/i);
    return match ? Number(match[1]) : 0;
  }

  function isFmpAuthError(error) {
    var status = fmpErrorStatus(error);
    var code = String(error && error.code || '').trim().toUpperCase();
    // Only an explicit user-auth response is allowed to stop provider
    // failover. Proxy/provider 5xx responses can contain words such as AUTH,
    // CREDENTIAL or SESSION even though the signed-in user is still valid.
    if (status === 401 || status === 403) return true;
    if (status === 409) {
      return /^(?:SESSION_(?:SUPERSEDED|REPLACED|REVOKED)|DEVICE_SESSION_(?:SUPERSEDED|REPLACED|REVOKED))$/.test(code);
    }
    // A usable HTTP status is authoritative. Text classification is reserved
    // for local/status-less client errors only.
    if (status) return false;
    if (/^(?:VENDOR_(?:AUTH_FAILED|CREDENTIAL_UNAVAILABLE|KEY_NOT_CONFIGURED)|MARKET_DATA_(?:AUTH_FAILED|CREDENTIAL_UNAVAILABLE)|SESSION_(?:VALIDATION_UNAVAILABLE|BACKEND_NOT_READY|REQUEST_TIMEOUT|NETWORK_ERROR|CONFLICT_UNVERIFIED)|DEVICE_SESSION_ERROR|NETWORK_UNAVAILABLE)$/.test(code)) return false;
    return /(?:TOKEN|SESSION|ACCOUNT|AUTH(?:ORIZATION|ENTICAT(?:ION|ED)?)?|UNAUTHORIZED|FORBIDDEN|ACCESS[ _-]?DENIED|CREDENTIAL|SIGN[ _-]?IN|LOGIN)/i.test(String(error && error.code || '') + ' ' + String(error && error.message || ''));
  }

  function fallbackFromFmp(error, fallback) {
    if (isFmpAuthError(error)) return Promise.reject(error);
    return typeof fallback === 'function' ? Promise.resolve().then(fallback) : Promise.reject(error);
  }

  function fmpInterval(tf) {
    var map = {
      '1m': '1min', '3m': '1min', '5m': '5min', '15m': '5min',
      '30m': '5min', '1h': '1hour', '2h': '1hour', '4h': '4hour',
      '6h': '4hour', '8h': '4hour', '12h': '4hour'
    };
    return map[normalizeTimeframe(tf)] || '5min';
  }

  function fmpHistoryDays(tf) {
    var key = normalizeTimeframe(tf);
    if (key === '1m') return 7;
    if (key === '3m' || key === '5m') return 30;
    if (key === '15m') return 90;
    if (key === '30m') return 150;
    if (key === '1h' || key === '2h') return 370;
    return 730;
  }

  function vendorTime(value) {
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    var text = String(value || '').trim();
    // A timestamp without an explicit zone is vendor-specific. Do not guess
    // here: FMP's naive intraday values are handled by fmpVendorTime below,
    // while Massive normally supplies a numeric epoch.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) return 0;
    var parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmpVendorTime(value) {
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    try {
      var helper = window.GPFmpEasternTimeV1;
      if (helper && typeof helper.parseMilliseconds === 'function') {
        var parsed = helper.parseMilliseconds(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch (_) {}
    // Explicitly zoned values remain safe even if the shared helper did not
    // load. A naive FMP value intentionally fails instead of being shifted by
    // the browser's local timezone.
    return vendorTime(value);
  }

  function estimatedVendorVolume(symbol, open, high, low, close, index) {
    var pip = cleanSymbol(symbol) === 'XAUUSD' ? .01 : /JPY$/.test(cleanSymbol(symbol)) ? .01 : .0001;
    var range = Math.max(pip, Math.abs(number(high) - number(low)));
    var body = Math.abs(number(close) - number(open));
    return Math.max(30, Math.round(range / pip * 6 + body / pip * 4 + 24 + (index % 13) * 3));
  }

  function vendorHistoryRow(row, symbol, index, source) {
    row = row || {};
    var open = number(row.open != null ? row.open : row.o);
    var high = number(row.high != null ? row.high : row.h);
    var low = number(row.low != null ? row.low : row.l);
    var close = number(row.close != null ? row.close : row.c);
    var rawVolume = number(row.volume != null ? row.volume : row.v != null ? row.v : row.n);
    var volume = rawVolume > 0 ? rawVolume : estimatedVendorVolume(symbol, open, high, low, close, index);
    var rawTime = row.time != null ? row.time : row.t != null ? row.t : row.timestamp != null ? row.timestamp : row.date != null ? row.date : row.datetime;
    return historyRow(
      source === 'fmp' ? fmpVendorTime(rawTime) : vendorTime(rawTime),
      open, high, low, close, volume, row.buyVolume, row.sellVolume, row.trades || row.count || row.n || 1,
      'quote-pressure'
    );
  }

  function aggregateHistory(rows, tf) {
    var bucketMs = timeframeMs(tf);
    var buckets = Object.create(null);
    (Array.isArray(rows) ? rows : []).sort(function (a, b) { return a.time - b.time; }).forEach(function (row) {
      var bucket = Math.floor(number(row.time) / bucketMs) * bucketMs;
      if (!bucket) return;
      var current = buckets[bucket];
      if (!current) {
        buckets[bucket] = historyRow(bucket, row.open, row.high, row.low, row.close, row.volume, row.buy, row.sell, row.prints, row.sideMode);
        return;
      }
      current.high = Math.max(current.high, row.high);
      current.low = Math.min(current.low, row.low);
      current.close = row.close;
      current.volume += number(row.volume);
      current.buy += number(row.buy);
      current.sell += number(row.sell);
      current.delta = current.buy - current.sell;
      current.prints += number(row.prints, 1);
      if (current.sideMode !== 'aggressor' || row.sideMode !== 'aggressor') current.sideMode = 'quote-pressure';
    });
    return Object.keys(buckets).map(function (key) { return buckets[key]; }).sort(function (a, b) { return a.time - b.time; });
  }

  function completedHistoryRows(rows, tf) {
    var bucketMs = timeframeMs(tf);
    var currentBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return number(row && row.time) > 0 && number(row && row.time) < currentBucket;
    });
  }

  function prepareSecureMarketSession() {
    if (isCrypto(state.symbol, state.exchange)) return Promise.resolve(null);
    var refresh = Promise.resolve(null);
    try {
      var helper = window.GuardeerAccessTokenRecovery;
      if (helper && typeof helper.refresh === 'function') refresh = Promise.resolve(helper.refresh(false));
    } catch (_) {}
    return refresh.then(function (session) {
      try {
        var keepAlive = window.GuardeerAuthKeepAlive;
        session = session || (keepAlive && typeof keepAlive.getSession === 'function' ? keepAlive.getSession() : null);
      } catch (_) {}
      if (!session) {
        var missingSession = new Error('Sign in to HUNTER and open Module 2 again.');
        missingSession.code = 'SESSION_LOGIN_REQUIRED';
        throw missingSession;
      }
      var device = window.GuardeerDeviceSession;
      if (!device || !session) return session;
      var diagnostics = typeof device.diagnostics === 'function' ? device.diagnostics() : {};
      if (diagnostics.enabled === false) return session;
      var currentBinding = typeof device.getBinding === 'function' ? device.getBinding() : null;
      if (currentBinding && currentBinding.token) return session;
      var missingBinding = new Error('The active device session was not found. Return to the platform and open Module 2 again.');
      missingBinding.code = 'SESSION_LOGIN_REQUIRED';
      throw missingBinding;
    });
  }

  function loadFmpHistory(symbol, tf) {
    var key = String(config().FMP_API_KEY || 'GUARDEER_SECURE_PROXY').trim();
    var interval = fmpInterval(tf);
    var now = Date.now();
    var from = isoDate(now - fmpHistoryDays(tf) * 86400000);
    var to = isoDate(now + 86400000);
    var urls = [
      'https://financialmodelingprep.com/stable/historical-chart/' + encodeURIComponent(interval) +
        '?symbol=' + encodeURIComponent(cleanSymbol(symbol)) + '&from=' + encodeURIComponent(from) +
        '&to=' + encodeURIComponent(to) + '&_=' + Date.now() + '&apikey=' + encodeURIComponent(key)
    ];
    function attempt(index, lastError) {
      if (index >= urls.length) return Promise.reject(lastError || new Error('History unavailable'));
      return fetchJson(urls[index], 17000).then(function (payload) {
        var list = Array.isArray(payload) ? payload : Array.isArray(payload && payload.historical) ? payload.historical : [];
        var rows = list.map(function (row, rowIndex) { return vendorHistoryRow(row, symbol, rowIndex, 'fmp'); })
          .filter(function (row) { return row.time > 0 && row.close > 0; });
        rows = completedHistoryRows(aggregateHistory(rows, tf), tf).slice(-HISTORY_LIMIT);
        if (rows.length < 2) throw new Error('No candles returned');
        requireFreshHistoryR390(rows, tf, 'FMP');
        state.source = 'Secure feed · quote pressure';
        return rows;
      }).catch(function (error) {
        if (isFmpAuthError(error)) throw error;
        return attempt(index + 1, error);
      });
    }
    return attempt(0, null);
  }

  function massiveRange(tf) {
    tf = normalizeTimeframe(tf);
    var amount = parseInt(tf, 10) || 1;
    var unit = tf.slice(-1);
    var timespan = unit === 'm' ? 'minute' : unit === 'h' ? 'hour' : unit === 'd' ? 'day' : 'hour';
    var days = unit === 'm' ? (amount <= 3 ? 10 : amount <= 5 ? 15 : 45) : unit === 'h' ? Math.max(180, amount * 30) : 365;
    return { multiplier: amount, timespan: timespan, days: days };
  }

  function isoDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function loadMassiveHistory(symbol, tf) {
    var range = massiveRange(tf);
    var now = Date.now();
    var from = isoDate(now - range.days * 86400000);
    var to = isoDate(now + 86400000);
    var ticker = 'C:' + cleanSymbol(symbol);
    var url = 'https://api.massive.com/v2/aggs/ticker/' + encodeURIComponent(ticker) + '/range/' + range.multiplier + '/' + range.timespan + '/' + from + '/' + to + '?adjusted=true&sort=asc&limit=50000&apiKey=GUARDEER_SECURE_PROXY';
    return fetchJson(url, 11000).then(function (payload) {
      var list = Array.isArray(payload && payload.results) ? payload.results : [];
      var rows = list.map(function (row, rowIndex) { return vendorHistoryRow(row, symbol, rowIndex); })
        .filter(function (row) { return row.time > 0 && row.close > 0; });
      rows = completedHistoryRows(aggregateHistory(rows, tf), tf).slice(-HISTORY_LIMIT);
      if (rows.length < 2) throw new Error('No candles returned');
      requireFreshHistoryR390(rows, tf, 'Massive');
      state.source = 'Secure feed · quote pressure';
      return rows;
    });
  }

  function loadForexGoldHistory(symbol, tf) {
    return prepareSecureMarketSession().then(function () {
      return loadFmpHistory(symbol, tf).catch(function (fmpError) {
        return fallbackFromFmp(fmpError, function () {
          state.lastHistoryError = fmpError && fmpError.message || 'History unavailable';
          return loadMassiveHistory(symbol, tf);
        });
      });
    }).then(function (rows) {
      state.lastHistoryError = '';
      return rows;
    });
  }

  function runtimeRows() {
    var rt = runtime();
    var rows = [];
    try {
      var rtState = rt && rt.state || {};
      if (cleanSymbol(rtState.symbol) !== cleanSymbol(state.symbol) ||
          cleanExchange(rtState.exchange) !== cleanExchange(state.exchange) ||
          normalizeTimeframe(rtState.timeframe) !== normalizeTimeframe(state.timeframe)) return [];
      if (rt && typeof rt.getLatestKlines === 'function') rows = rt.getLatestKlines() || [];
      else if (rt && rt.state && Array.isArray(rt.state.candles)) rows = rt.state.candles;
      else if (rt && rt.chart && Array.isArray(rt.chart.candles)) rows = rt.chart.candles;
    } catch (_) { rows = []; }
    var mapped = (Array.isArray(rows) ? rows : []).slice(-HISTORY_LIMIT).map(function (row) {
      var time = number(row.time != null ? row.time : row.t);
      if (time > 0 && time < 100000000000) time *= 1000;
      return historyRow(
        time,
        row.open != null ? row.open : row.o,
        row.high != null ? row.high : row.h,
        row.low != null ? row.low : row.l,
        row.close != null ? row.close : row.c,
        row.volume != null ? row.volume : row.v,
        row.buyVolume,
        row.sellVolume,
        row.trades || row.count || 1,
        row.buyVolume != null && row.sellVolume != null ? 'aggressor' : 'quote-pressure'
      );
    }).filter(function (row) { return row.time > 0 && row.close > 0; });
    var freshness = freshHistoryInspectionR390(mapped, state.timeframe);
    if (!freshness.ok) {
      state.lastHistoryError = freshness.reason === 'stale-history'
        ? 'Terminal history is stale; waiting for current candles.'
        : 'Terminal history freshness could not be verified.';
      return [];
    }
    return mapped;
  }

  function loadHistory(symbol, exchange, tf) {
    if (!isCrypto(symbol, exchange)) return loadForexGoldHistory(symbol, tf);
    return loadBinanceHistory(symbol, tf).catch(function (error) {
      var runtimeRowsFallback = runtimeRows();
      if (runtimeRowsFallback.length) return runtimeRowsFallback;
      throw error;
    });
  }

  function applyHistory(rows) {
    if (!isCrypto(state.symbol, state.exchange) && Array.isArray(rows) && rows.length) {
      rememberFreshHistoryProofR390(rows, state.timeframe, state.source || 'verified history');
    } else if (!Array.isArray(rows) || !rows.length || isCrypto(state.symbol, state.exchange)) {
      state.freshHistoryProof = null;
    }
    clearHover(false);
    var candles = (Array.isArray(rows) ? rows : []).map(function (row) {
      return Array.isArray(row && row.levels) && row.levels.length ? updateCandleStats(row) : buildLevels(row);
    }).slice(-HISTORY_LIMIT);
    var buy = 0;
    var sell = 0;
    var prints = 0;
    var ticks = [];
    var volumes = [];
    candles.forEach(function (candle) {
      buy += number(candle.buy);
      sell += number(candle.sell);
      prints += number(candle.prints);
      ticks.push(number(candle.tick));
      volumes.push(number(candle.volume));
      state.lastPrice = candle.close;
    });
    ticks.sort(function (a, b) { return a - b; });
    volumes.sort(function (a, b) { return a - b; });
    state.candles = candles;
    state.buyVolume = buy;
    state.sellVolume = sell;
    state.totalVolume = buy + sell;
    state.prints = prints;
    state.metricLayout = null;
    state.sideMode = candles.length && candles.every(function (candle) { return candle.sideMode === 'aggressor'; })
      ? 'aggressor'
      : 'quote-pressure';
    state.tickSize = ticks.length ? ticks[Math.floor(ticks.length / 2)] : niceTick(state.lastPrice || 1, (state.lastPrice || 1) * .001);
    state.proxyUnit = volumes.length ? Math.max(.00000001, volumes[Math.floor(volumes.length / 2)] / 120) : 1;
    state.endOffset = clamp(state.endOffset, 0, Math.max(0, state.candles.length - 2));
    syncChrome();
    scheduleRender();
  }

  function findOrCreateLevel(candle, price) {
    var tick = Math.max(.00000001, number(candle.tick, state.tickSize));
    var levelPrice = Math.round(price / tick) * tick;
    var level = candle.levels.find(function (item) { return Math.abs(item.price - levelPrice) <= tick * .15; });
    if (!level) {
      level = { price: levelPrice, bid: 0, ask: 0, delta: 0, volume: 0 };
      candle.levels.push(level);
      candle.levels.sort(function (a, b) { return a.price - b.price; });
      if (candle.sideMode !== 'aggressor' && candle.levels.length > 24) {
        var nearest = candle.levels.reduce(function (best, item) {
          var distance = Math.abs(item.price - price);
          return !best || distance < best.distance ? { item: item, distance: distance } : best;
        }, null);
        level = nearest.item;
      }
    }
    return level;
  }

  function approveLiveTradePrice(price, source, fresh) {
    if (cleanSymbol(state.symbol) !== 'XAUUSD') return true;
    var guard = window.GPXauLivePriceStabilityV1;
    if (!guard || typeof guard.approve !== 'function') return false;
    return guard.approve(price, state.lastPrice, String(source || 'module2-unknown'), fresh === true);
  }

  function appendTrade(price, quantity, time, isBuy, source, fresh, sideMode) {
    price = number(price);
    if (!state.open || !price) return;
    if (!approveLiveTradePrice(price, source, fresh)) return false;
    quantity = Math.max(.00000001, number(quantity, 1));
    time = number(time, Date.now());
    var bucketMs = timeframeMs(state.timeframe);
    var bucket = Math.floor(time / bucketMs) * bucketMs;
    var candle = state.candles[state.candles.length - 1];
    if (candle && candle.time > bucket) return false;
    if (!candle || candle.time < bucket) {
      candle = {
        time: bucket, open: price, high: price, low: price, close: price,
        buy: 0, sell: 0, volume: 0, delta: 0, prints: 0,
        tick: binancePriceTick(state.symbol), levels: [],
        sideMode: sideMode === 'aggressor' ? 'aggressor' : 'quote-pressure',
        levelMode: sideMode === 'aggressor' ? 'exact-live-trades' : 'estimated-price-levels'
      };
      state.candles.push(candle);
      if (state.endOffset > 0) state.endOffset += 1;
      if (state.candles.length > HISTORY_LIMIT) state.candles.shift();
    }
    if (candle.sideMode !== 'aggressor' || sideMode !== 'aggressor') candle.sideMode = 'quote-pressure';
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    candle.buy += isBuy ? quantity : 0;
    candle.sell += isBuy ? 0 : quantity;
    candle.prints += 1;
    var level = findOrCreateLevel(candle, price);
    level.ask += isBuy ? quantity : 0;
    level.bid += isBuy ? 0 : quantity;
    updateCandleStats(candle);
    state.buyVolume += isBuy ? quantity : 0;
    state.sellVolume += isBuy ? 0 : quantity;
    state.totalVolume += quantity;
    state.prints += 1;
    state.sideMode = sideMode === 'aggressor' && state.sideMode === 'aggressor' ? 'aggressor' : 'quote-pressure';
    state.lastPrice = price;
    syncChrome();
    scheduleRender();
    return true;
  }

  function stopFeed() {
    state.feedToken += 1;
    if (state.reconnectTimer) window.clearTimeout(state.reconnectTimer);
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.reconnectTimer = 0;
    state.pollTimer = 0;
    if (state.ws) {
      try {
        state.ws.onopen = null;
        state.ws.onmessage = null;
        state.ws.onerror = null;
        state.ws.onclose = null;
        state.ws.close();
      } catch (_) {}
      state.ws = null;
    }
  }

  function scheduleReconnect(token) {
    if (!state.open || token !== state.feedToken) return;
    state.reconnectTimer = window.setTimeout(function () {
      state.reconnectTimer = 0;
      if (state.open && token === state.feedToken) connectFeed();
    }, 2300);
  }

  function connectCryptoFeed() {
    var symbol = binanceSymbol(state.symbol);
    var token = ++state.feedToken;
    setStatus('connecting', 'warn', 'Binance footprint trades');
    try {
      var socket = new WebSocket('wss://stream.binance.com:9443/ws/' + symbol.toLowerCase() + '@trade');
      state.ws = socket;
      socket.onopen = function () {
        if (token !== state.feedToken) return;
        setStatus('live', 'live', 'Binance exact live Bid/Ask · historical levels estimated');
      };
      socket.onmessage = function (event) {
        if (token !== state.feedToken) return;
        try {
          var payload = JSON.parse(event.data);
          appendTrade(payload.p, payload.q, payload.T || payload.E, payload.m === false, 'Binance live trade', true, 'aggressor');
        } catch (_) {}
      };
      socket.onerror = function () {
        if (token === state.feedToken) setStatus('reconnecting', 'warn', 'Binance footprint feed');
      };
      socket.onclose = function () {
        if (token !== state.feedToken) return;
        state.ws = null;
        setStatus('reconnecting', 'warn', 'Binance footprint feed');
        scheduleReconnect(token);
      };
    } catch (_) {
      setStatus('error', 'warn', 'Binance footprint feed');
      scheduleReconnect(token);
    }
  }

  function appendQuote(quote) {
    quote = quote || {};
    var price = number(quote.price);
    if (!(price > 0)) return false;
    if (!isCrypto(state.symbol, state.exchange) && quote.fresh !== true) return false;
    var eventTime = quoteEventTime(quote);
    var bucket = Math.floor(eventTime / timeframeMs(state.timeframe)) * timeframeMs(state.timeframe);
    var last = state.candles[state.candles.length - 1];
    if (last && number(last.time) > bucket) return false;
    if (last && bucket - number(last.time) > timeframeMs(state.timeframe) * 1.5) {
      state.lastHistoryError = 'Live quote held because candle history has a gap.';
      if (Date.now() - number(state.lastIntegrityRefreshAt) >= 30000) {
        state.lastIntegrityRefreshAt = Date.now();
        window.setTimeout(function () {
          if (state.open) reloadData('live-history-gap');
        }, 0);
      }
      return false;
    }
    if (price === state.lastPrice && last && number(last.time) === bucket) return true;
    if (price === state.lastPrice && (!last || number(last.time) < bucket)) {
      if (!approveLiveTradePrice(price, quote.source, quote.fresh === true)) return false;
      state.candles.push({
        time: bucket, open: price, high: price, low: price, close: price,
        buy: 0, sell: 0, volume: 0, delta: 0, prints: 0,
        tick: Math.max(.00000001, state.tickSize || niceTick(price, price * .001)), levels: [],
        sideMode: 'quote-pressure'
      });
      if (state.endOffset > 0) state.endOffset += 1;
      if (state.candles.length > HISTORY_LIMIT) state.candles.shift();
      syncChrome();
      scheduleRender();
      return true;
    }
    return appendTrade(price, state.proxyUnit, eventTime, !state.lastPrice || price >= state.lastPrice,
      quote.source || 'Forex / Gold quote pressure', quote.fresh === true, 'quote-pressure') === true;
  }

  function pollRuntimePrice() {
    if (!state.open || isCrypto(state.symbol, state.exchange)) return false;
    var quoteState = null;
    try { quoteState = window.__gpForexQuoteState && window.__gpForexQuoteState[cleanSymbol(state.symbol)]; } catch (_) {}
    var source = String(quoteState && quoteState.source || '').toLowerCase();
    var quoteTimestamp = freshTimestamp(quoteState && quoteState.time);
    var trusted = Boolean(quoteState && quoteState.fresh === true && quoteState.providerTimestampVerified === true && quoteTimestamp && /fmp|massive/.test(source));
    if (!trusted) return false;
    var rt = runtime();
    var price = number(quoteState.price);
    try {
      if (!price && rt && typeof rt.getCurrentPrice === 'function') price = number(rt.getCurrentPrice());
      if (!price && rt && rt.state) price = number(rt.state.currentPrice || rt.state.price);
    } catch (_) {}
    if (!(price > 0)) return false;
    return appendQuote({ price: price, time: quoteTimestamp, source: 'Module 2 runtime bridge: ' + source, fresh: true });
  }

  function fmpQuote(symbol) {
    var key = String(config().FMP_API_KEY || 'GUARDEER_SECURE_PROXY').trim();
    var clean = cleanSymbol(symbol);
    var urls = [
      'https://financialmodelingprep.com/stable/quote-short?symbol=' + encodeURIComponent(clean) + '&apikey=' + encodeURIComponent(key)
    ];
    function attempt(index, lastError) {
      if (index >= urls.length) return Promise.reject(lastError || new Error('Quote unavailable'));
      return fetchJson(urls[index], 6500).then(function (payload) {
        var row = Array.isArray(payload) ? payload[0] : payload;
        var price = number(row && (row.price != null ? row.price : row.close != null ? row.close : row.value));
        if (!(price > 0)) throw new Error('Quote missing');
        return requireFreshQuoteR390(
          verifiedQuoteResultR390(row, price, 'Secure quote feed'),
          'Secure quote feed'
        );
      }).catch(function (error) {
        if (isFmpAuthError(error)) throw error;
        return attempt(index + 1, error);
      });
    }
    return attempt(0, null);
  }

  function massiveQuote(symbol) {
    var clean = cleanSymbol(symbol);
    var from = clean.slice(0, 3);
    var to = clean.slice(3, 6);
    if (from.length !== 3 || to.length !== 3) return Promise.reject(new Error('Fallback quote symbol unavailable'));
    var url = 'https://api.massive.com/v1/last_quote/currencies/' + encodeURIComponent(from) + '/' + encodeURIComponent(to) + '?apiKey=GUARDEER_SECURE_PROXY';
    return fetchJson(url, 6500).then(function (payload) {
      var row = payload && (payload.last || payload.results || payload);
      var bid = number(row && (row.bid != null ? row.bid : row.bidPrice));
      var ask = number(row && (row.ask != null ? row.ask : row.askPrice));
      var price = bid > 0 && ask > 0 ? (bid + ask) / 2 : ask || bid || number(row && row.price);
      if (!(price > 0)) throw new Error('Fallback quote missing');
      return requireFreshQuoteR390(
        verifiedQuoteResultR390(row, price, 'Secure quote feed'),
        'Secure quote feed'
      );
    });
  }

  function pollForexGoldPrice() {
    if (!state.open || isCrypto(state.symbol, state.exchange) || state.pollBusy) return;
    if (pollRuntimePrice()) return;
    var symbol = state.symbol;
    var exchange = state.exchange;
    var timeframe = state.timeframe;
    var fmpFailure = null;
    state.pollBusy = true;
    prepareSecureMarketSession().then(function () {
      return fmpQuote(symbol).catch(function (fmpError) {
        fmpFailure = fmpError;
        return fallbackFromFmp(fmpError, function () { return massiveQuote(symbol); });
      });
    }).catch(function (providerError) {
      var fallback = responseTimeQuoteFallbackR390(
        fmpFailure && fmpFailure.quoteResult,
        symbol,
        exchange,
        timeframe,
        'Secure quote feed'
      );
      if (fallback) return fallback;
      throw providerError;
    }).then(function (quote) {
      var price = number(quote && quote.price);
      if (state.open && price > 0 && cleanSymbol(state.symbol) === cleanSymbol(symbol) &&
          cleanExchange(state.exchange) === cleanExchange(exchange) &&
          normalizeTimeframe(state.timeframe) === normalizeTimeframe(timeframe)) {
        state.secureRetryCount = 0;
        if (state.secureRetryTimer) window.clearTimeout(state.secureRetryTimer);
        state.secureRetryTimer = 0;
        if (appendQuote(quote)) setStatus('live proxy', 'live', quote.source || 'Forex / Gold quote pressure');
        else setStatus('stale quote', 'warn', 'Provider quote timestamp is stale or unavailable');
      }
    }).catch(function (error) {
      if (isFmpAuthError(error)) {
        stopFeed();
        setStatus('auth required', 'error', 'Secure market data requires sign-in');
      }
    }).finally(function () {
      state.pollBusy = false;
    });
  }

  function connectFeed() {
    stopFeed();
    if (!state.open) return;
    if (isCrypto(state.symbol, state.exchange)) connectCryptoFeed();
    else {
      state.feedToken += 1;
      setStatus('waiting quote', 'warn', 'Awaiting a verified fresh Forex / Gold quote');
      state.pollTimer = window.setInterval(pollForexGoldPrice, 5000);
      pollForexGoldPrice();
    }
  }

  function reloadData(reason) {
    if (!state.open) return Promise.resolve(false);
    var market = readMarket();
    state.symbol = market.symbol;
    state.exchange = market.exchange;
    if (!state.timeframeLocked || reason === 'open') state.timeframe = market.timeframe;
    if (QUICK_TIMEFRAMES.indexOf(state.timeframe) < 0) state.timeframe = '5m';
    var seq = ++state.loadSeq;
    stopFeed();
    if (reason === 'timeframe' || reason === 'market-change') {
      state.endOffset = 0;
      state.zoom = 1;
    }
    setStatus('loading', 'warn', isCrypto(state.symbol, state.exchange) ? 'Loading footprint history' : 'Activating secure market data');
    syncChrome();
    clearHover(true);
    // Do not keep Forex/Gold users on a blocking reconnect screen while the
    // historical providers are warming up.  Start the authenticated live quote
    // feed immediately and let history arrive in the background.
    if (!isCrypto(state.symbol, state.exchange)) connectFeed();
    return loadHistory(state.symbol, state.exchange, state.timeframe).then(function (rows) {
      if (seq !== state.loadSeq || !state.open) return false;
      if (!rows.length && isCrypto(state.symbol, state.exchange)) rows = runtimeRows();
      if (rows.length) state.lastHistoryError = '';
      applyHistory(rows);
      if (!rows.length) {
        setStatus('waiting', 'warn', 'Waiting for footprint data');
        return false;
      }
      state.secureRetryCount = 0;
      if (state.secureRetryTimer) window.clearTimeout(state.secureRetryTimer);
      state.secureRetryTimer = 0;
      connectFeed();
      if (isCrypto(state.symbol, state.exchange) && cleanExchange(state.exchange) === 'binance') {
        rebuildRecentBinanceLevels(rows, state.symbol, state.timeframe).then(function (rebuiltRows) {
          if (seq !== state.loadSeq || !state.open || cleanSymbol(state.symbol) !== cleanSymbol(market.symbol)) return;
          applyHistory(rebuiltRows);
          syncChrome();
        });
      }
      return true;
    }).catch(function (error) {
      if (seq !== state.loadSeq || !state.open) return false;
      state.lastHistoryError = error && error.message || 'Footprint history unavailable';
      if (isFmpAuthError(error)) {
        stopFeed();
        applyHistory([]);
        setStatus('auth required', 'error', 'Secure market data requires sign-in');
        return false;
      }
      var fallback = runtimeRows();
      applyHistory(fallback);
      if (fallback.length) connectFeed();
      else if (!isCrypto(state.symbol, state.exchange) && state.secureRetryCount < 3 && !/SESSION_LOGIN_REQUIRED/.test(String(error && error.code || ''))) {
        state.secureRetryCount += 1;
        setStatus('reconnecting', 'warn', 'Reconnecting secure market data (' + state.secureRetryCount + '/3)');
        if (state.secureRetryTimer) window.clearTimeout(state.secureRetryTimer);
        state.secureRetryTimer = window.setTimeout(function () {
          state.secureRetryTimer = 0;
          if (state.open) reloadData('secure-session-retry');
        }, 1800 + state.secureRetryCount * 700);
      } else if (/SESSION_LOGIN_REQUIRED/.test(String(error && error.code || ''))) {
        setStatus('error', 'warn', state.lastHistoryError || 'Sign in and open Module 2 again.');
      } else {
        setStatus('waiting data', 'warn', 'Current history and quote are unavailable');
      }
      return false;
    });
  }

  function moduleHtml() {
    var tfHtml = QUICK_TIMEFRAMES.map(function (tf) {
      return '<button type="button" class="gp-m2fp-tf" data-gp-m2fp-tf="' + tf + '">' + tf + '</button>';
    }).join('');
    return [
      '<section class="gp-m2fp-window" role="dialog" aria-modal="true" aria-label="MODULE-2 ' + escapeHtml(TOOL_TITLE) + '">',
      '  <header class="gp-m2fp-head">',
      '    <div class="gp-m2fp-mark" aria-hidden="true">' + escapeHtml(TOOL_MARK) + '</div>',
      '    <div class="gp-m2fp-title"><strong data-gp-m2fp-title>MODULE-2 · ' + escapeHtml(TOOL_TITLE) + '</strong><span data-gp-m2fp-subtitle>' + (SINGLE_VIEW ? 'Dedicated live footprint tool' : 'Six professional cluster, profile and statistics views') + '</span></div>',
      '    <div class="gp-m2fp-head-status">',
      '      <span class="gp-m2fp-badge" data-gp-m2fp-source>MARKET FEED</span>',
      '      <span class="gp-m2fp-badge" data-gp-m2fp-status data-tone="warn"><i></i><b>CONNECTING</b></span>',
      '      <button type="button" class="gp-m2fp-icon-btn" data-gp-m2fp-action="maximize" aria-label="Maximize">□</button>',
      '      <button type="button" class="gp-m2fp-icon-btn" data-gp-m2fp-action="close" aria-label="Close">×</button>',
      '    </div>',
      '  </header>',
      '  <div class="gp-m2fp-shell">',
      '    <aside class="gp-m2fp-nav" aria-label="Footprint tools">',
      '      <span class="gp-m2fp-nav-label">Footprint tools</span>',
      '      <button type="button" class="gp-m2fp-tool is-active" data-gp-m2fp-view="1"><b>01</b><span><strong>Bid-Ask Profile</strong><small>Profile + volume + statistics</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m2fp-tool" data-gp-m2fp-view="2"><b>02</b><span><strong>Cluster + Delta</strong><small>Footprint + delta profile</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m2fp-tool" data-gp-m2fp-view="3"><b>03</b><span><strong>Bid × Ask Ladder</strong><small>Volume + delta heatmap</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m2fp-tool" data-gp-m2fp-view="4"><b>04</b><span><strong>Delta Cluster + DOM</strong><small>Clusters + side profile</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m2fp-tool" data-gp-m2fp-view="5"><b>05</b><span><strong>Classic Footprint</strong><small>High-contrast bid × ask</small></span><em>Live</em></button>',
      '      <button type="button" class="gp-m2fp-tool" data-gp-m2fp-view="6"><b>06</b><span><strong>Footprint Statistics</strong><small>Delta + volume + calculated values</small></span><em>Live</em></button>',
      '    </aside>',
      '    <main class="gp-m2fp-stage">',
      '      <div class="gp-m2fp-toolbar">',
      '        <div class="gp-m2fp-market"><strong data-gp-m2fp-symbol>BTCUSDT</strong><span data-gp-m2fp-exchange>BINANCE</span></div>',
      '        <div class="gp-m2fp-timeframes" aria-label="Timeframe">' + tfHtml + '</div>',
      '        <div class="gp-m2fp-toolbar-spacer"></div>',
      '        <button type="button" class="gp-m2fp-btn" data-gp-m2fp-action="zoom-out">Zoom −</button>',
      '        <button type="button" class="gp-m2fp-btn" data-gp-m2fp-action="zoom-in">Zoom +</button>',
      '        <button type="button" class="gp-m2fp-btn" data-gp-m2fp-action="reset-view">Reset view</button>',
      '        <button type="button" class="gp-m2fp-btn" data-gp-m2fp-action="reconnect">Reconnect</button>',
      '      </div>',
      '      <div class="gp-m2fp-chart-wrap">',
      '        <canvas id="gp-m2fp-canvas" aria-label="Footprint Bid by Ask Delta chart"></canvas>',
      '        <div class="gp-m2fp-empty" data-gp-m2fp-empty>Waiting for footprint market data...</div>',
      '        <div class="gp-m2fp-toast" data-gp-m2fp-toast></div>',
      '      </div>',
      '      <div class="gp-m2fp-metrics">',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="bid">Bid volume</span><strong data-gp-m2fp-metric="bid">0</strong></div>',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="ask">Ask volume</span><strong data-gp-m2fp-metric="ask">0</strong></div>',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="delta">Delta</span><strong data-gp-m2fp-metric="delta">0</strong></div>',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="imbalance">Imbalance</span><strong data-gp-m2fp-metric="imbalance">0%</strong></div>',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="poc">POC</span><strong data-gp-m2fp-metric="poc">--</strong></div>',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="volume">Volume</span><strong data-gp-m2fp-metric="volume">0</strong></div>',
      '        <div class="gp-m2fp-metric"><span data-gp-m2fp-metric-label="prints">Trades</span><strong data-gp-m2fp-metric="prints">0</strong></div>',
      '      </div>',
      '    </main>',
      '  </div>',
      '</section>'
    ].join('');
  }

  function ensureOverlay() {
    var overlay = state.overlay || qs('#gp-module2-footprint');
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'gp-module2-footprint';
    overlay.className = 'gp-m2fp-overlay';
    if (SINGLE_VIEW) overlay.classList.add('is-single-tool');
    overlay.innerHTML = moduleHtml();
    document.body.appendChild(overlay);
    state.overlay = overlay;
    state.canvas = qs('#gp-m2fp-canvas', overlay);
    state.ctx = state.canvas && state.canvas.getContext('2d');
    bindCanvas(state.canvas);
    if (window.ResizeObserver && state.canvas) {
      state.resizeObserver = new ResizeObserver(function () { clearHover(false); resizeCanvas(); scheduleRender(); });
      state.resizeObserver.observe(state.canvas);
    }
    syncChrome();
    return overlay;
  }

  function ensureLauncher() {
    if (STANDALONE) return null;
    var grid = qs('#gp-step44-prime-tools-popover .gp-step44-prime-tools-popover__grid');
    if (!grid) return null;
    var button = qs('[data-gp-module2-open]', grid);
    if (button && button.tagName !== 'A') {
      var replacement = document.createElement('a');
      button.replaceWith(replacement);
      button = replacement;
    }
    if (!button) {
      button = document.createElement('a');
      button.className = 'gp-step44-prime-tools-action gp-module2-prime-card';
      var moduleOne = qs('[data-gp-module1-open]', grid);
      if (moduleOne && moduleOne.nextSibling) grid.insertBefore(button, moduleOne.nextSibling);
      else grid.appendChild(button);
    }
    button.className = 'gp-step44-prime-tools-action gp-module2-prime-card';
    button.setAttribute('data-gp-module2-open', 'true');
    button.setAttribute('href', '#module2-footprint');
    button.setAttribute('target', '_blank');
    button.setAttribute('rel', 'noopener');
    button.setAttribute('aria-label', 'Open MODULE-2 Footprint Tools in a new window');
    if (!button.firstElementChild) {
      button.innerHTML = '<span>M2</span><div><strong>MODULE-2 Footprint Tools</strong><small>Open the Footprint catalog and choose a live tool.</small></div><em>Open</em>';
    }
    return button;
  }

  function closePrimeToolsPopover() {
    var pop = qs('#gp-step44-prime-tools-popover');
    if (pop) pop.classList.remove('is-open', 'is-dragging');
    document.body.classList.remove('gp-step44-prime-tools-open');
    var button = qs('[data-gp-step44-top-nav="prime-tools"]');
    if (button) {
      button.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  function setStatus(text, tone, source) {
    state.status = String(text || 'waiting');
    state.statusTone = tone || 'warn';
    if (source) state.source = String(source);
    var status = state.overlay && qs('[data-gp-m2fp-status]', state.overlay);
    var statusText = status && qs('b', status);
    var sourceNode = state.overlay && qs('[data-gp-m2fp-source]', state.overlay);
    if (status) status.setAttribute('data-tone', state.statusTone);
    if (statusText) statusText.textContent = state.status.toUpperCase();
    if (sourceNode) sourceNode.textContent = state.source;
    syncEmpty();
  }

  function showToast(message) {
    var toast = state.overlay && qs('[data-gp-m2fp-toast]', state.overlay);
    if (!toast) return;
    toast.textContent = String(message || '');
    toast.classList.add('is-visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2300);
  }

  function syncEmpty() {
    var empty = state.overlay && qs('[data-gp-m2fp-empty]', state.overlay);
    if (!empty) return;
    var visible = state.candles.length < 2;
    empty.classList.toggle('is-visible', visible);
    if (!visible) return;
    if (state.status === 'loading') empty.textContent = 'Loading footprint candles and bid × ask levels...';
    else if (state.status === 'error') empty.textContent = state.lastHistoryError || 'Footprint feed is unavailable. Verify symbol or use Reconnect.';
    else empty.textContent = 'Waiting for footprint market data...';
  }

  function setMetric(name, value, display) {
    var node = state.overlay && qs('[data-gp-m2fp-metric="' + name + '"]', state.overlay);
    if (!node) return;
    node.textContent = display == null ? formatValue(value) : display;
    node.classList.toggle('is-positive', number(value) > 0);
    node.classList.toggle('is-negative', number(value) < 0);
  }

  function sharedMetricLayout(canvasWidth) {
    var candles = Array.isArray(state.candles) ? state.candles : [];
    var plotWidth = Math.max(100, number(canvasWidth) - 82);
    var baseStep = 68;
    var requested = clamp(baseStep * state.zoom, baseStep * .62, baseStep * 1.9);
    var count = Math.min(candles.length, Math.max(5, Math.floor(plotWidth / requested)));
    return { start: Math.max(0, candles.length - count), count: count };
  }

  function metricRows() {
    var candles = Array.isArray(state.candles) ? state.candles : [];
    var layout = state.metricLayout || {};
    var start = Math.max(0, Math.floor(number(layout.start, -1)));
    var count = Math.max(0, Math.floor(number(layout.count)));
    if (count > 0 && start >= 0 && start < candles.length) {
      return candles.slice(start, Math.min(candles.length, start + count));
    }
    return candles.slice(-Math.min(30, candles.length));
  }

  function sideTotals(rows) {
    var totals = { buy: 0, sell: 0, volume: 0, prints: 0, sideMode: 'aggressor' };
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      totals.buy += Math.max(0, number(row && row.buy));
      totals.sell += Math.max(0, number(row && row.sell));
      totals.prints += Math.max(0, number(row && row.prints));
      if (!row || row.sideMode !== 'aggressor') totals.sideMode = 'quote-pressure';
    });
    totals.volume = totals.buy + totals.sell;
    return totals;
  }

  function activityPeak(rows) {
    var buckets = Object.create(null);
    var best = null;
    function add(price, activity) {
      price = number(price);
      activity = Math.max(0, number(activity));
      if (!price || !activity) return;
      var key = formatPrice(price);
      if (!buckets[key]) buckets[key] = { price: price, activity: 0 };
      buckets[key].activity += activity;
      if (!best || buckets[key].activity > best.activity) best = buckets[key];
    }
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var levels = Array.isArray(row && row.levels) ? row.levels : [];
      if (levels.length) {
        levels.forEach(function (level) { add(level.price, number(level.bid) + number(level.ask)); });
      } else if (row) {
        add(row.poc || row.close, number(row.buy) + number(row.sell));
      }
    });
    return best ? best.price : 0;
  }

  function syncModeCopy(overlay, quotePressure) {
    var mode = quotePressure ? 'quote-pressure' : 'aggressor';
    if (state.chromeMode === mode) return;
    state.chromeMode = mode;
    var title = qs('[data-gp-m2fp-title]', overlay);
    var subtitle = qs('[data-gp-m2fp-subtitle]', overlay);
    var navLabels = quotePressure ? [
      ['Sell-Buy Pressure', 'Visible quote-pressure profile'],
      ['Pressure + Delta', 'Pressure cluster + delta profile'],
      ['Sell × Buy Ladder', 'Directional pressure heatmap'],
      ['Pressure Cluster', 'Clusters + side-pressure profile'],
      ['Classic Pressure', 'High-contrast sell × buy pressure'],
      ['Pressure Statistics', 'Visible pressure + calculated values']
    ] : [
      ['Bid-Ask Profile', 'Profile + volume + statistics'],
      ['Cluster + Delta', 'Footprint + delta profile'],
      ['Bid × Ask Ladder', 'Volume + delta heatmap'],
      ['Delta Cluster + DOM', 'Clusters + side profile'],
      ['Classic Footprint', 'High-contrast bid × ask'],
      ['Footprint Statistics', 'Delta + volume + calculated values']
    ];
    if (title) title.textContent = quotePressure ? 'MODULE-2 · FOREX/GOLD PRICE PRESSURE' : 'MODULE-2 · ' + TOOL_TITLE;
    if (subtitle) subtitle.textContent = quotePressure
      ? 'Quote-derived sell/buy pressure · shared analysis window'
      : (SINGLE_VIEW ? 'Dedicated live footprint tool' : 'Six professional cluster, profile and statistics views');
    qsa('[data-gp-m2fp-view]', overlay).forEach(function (button, index) {
      var copy = navLabels[index];
      var strong = qs('strong', button);
      var small = qs('small', button);
      if (strong && copy) strong.textContent = copy[0];
      if (small && copy) small.textContent = copy[1];
    });
    var metricLabels = quotePressure ? {
      bid: 'Sell pressure', ask: 'Buy pressure', delta: 'Net pressure', imbalance: 'Pressure balance',
      poc: 'Activity peak', volume: 'Total pressure', prints: 'Measured bars'
    } : {
      bid: 'Bid volume', ask: 'Ask volume', delta: 'Delta', imbalance: 'Imbalance',
      poc: 'POC', volume: 'Volume', prints: 'Trades'
    };
    Object.keys(metricLabels).forEach(function (name) {
      var node = qs('[data-gp-m2fp-metric-label="' + name + '"]', overlay);
      if (node) node.textContent = metricLabels[name];
    });
  }

  function syncChrome() {
    var overlay = state.overlay;
    if (!overlay) return;
    var symbolNode = qs('[data-gp-m2fp-symbol]', overlay);
    var exchangeNode = qs('[data-gp-m2fp-exchange]', overlay);
    if (symbolNode) symbolNode.textContent = state.symbol;
    if (exchangeNode) exchangeNode.textContent = state.exchange;
    qsa('[data-gp-m2fp-tf]', overlay).forEach(function (button) {
      var active = normalizeTimeframe(button.getAttribute('data-gp-m2fp-tf')) === state.timeframe;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    qsa('[data-gp-m2fp-view]', overlay).forEach(function (button) {
      var active = number(button.getAttribute('data-gp-m2fp-view')) === state.activeView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var historical = state.endOffset > 0;
    var reset = qs('[data-gp-m2fp-action="reset-view"]', overlay);
    if (reset) {
      reset.textContent = historical ? 'Go live / reset' : 'Reset view';
      reset.setAttribute('aria-label', historical ? 'Return to the live edge and reset chart zoom' : 'Reset chart zoom and remain on the live edge');
      reset.setAttribute('aria-pressed', historical ? 'true' : 'false');
    }
    var zoomOut = qs('[data-gp-m2fp-action="zoom-out"]', overlay);
    var zoomIn = qs('[data-gp-m2fp-action="zoom-in"]', overlay);
    if (zoomOut) { zoomOut.title = 'Show more historical candles'; zoomOut.setAttribute('aria-label', 'Show more historical candles'); zoomOut.disabled = state.zoom <= .621; }
    if (zoomIn) { zoomIn.title = 'Show fewer candles in greater detail'; zoomIn.setAttribute('aria-label', 'Show fewer candles in greater detail'); zoomIn.disabled = state.zoom >= 1.899; }
    var rows = metricRows();
    var metrics = sideTotals(rows);
    var quotePressure = usesQuotePressure() || metrics.sideMode !== 'aggressor';
    syncModeCopy(overlay, quotePressure);
    if (state.canvas) state.canvas.setAttribute('aria-label', quotePressure
      ? 'Forex and Gold quote-derived pressure chart'
      : VIEW_NAMES[state.activeView - 1] + ' footprint chart');
    var delta = metrics.buy - metrics.sell;
    var imbalance = metrics.volume > 0 ? delta / metrics.volume * 100 : 0;
    var peak = activityPeak(rows);
    setMetric('bid', metrics.sell);
    setMetric('ask', metrics.buy);
    setMetric('delta', delta);
    setMetric('imbalance', imbalance, (imbalance >= 0 ? '+' : '') + imbalance.toFixed(1) + '%');
    setMetric('poc', 0, peak ? formatPrice(peak) : '--');
    setMetric('volume', metrics.volume);
    setMetric('prints', 0, (quotePressure ? rows.length : Math.round(metrics.prints)).toLocaleString());
  }

  function resizeCanvas() {
    var canvas = state.canvas;
    if (!canvas) return false;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      clearHover(false);
      canvas.width = width;
      canvas.height = height;
    }
    if (state.ctx) state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function scheduleRender() {
    if (!state.open || state.renderFrame) return;
    state.renderFrame = window.requestAnimationFrame(function () {
      state.renderFrame = 0;
      render();
    });
  }

  function clearHover(renderAfter) {
    var changed = state.hoverIndex != null;
    state.hoverIndex = null;
    if (renderAfter && changed) scheduleRender();
  }

  function pointInsideMainChart(layout, x, y) {
    var rect = layout && layout.mainRect;
    if (!rect) return false;
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  function priceRange(rows) {
    if (!rows.length) return { min: 0, max: 1 };
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      min = Math.min(min, row.low);
      max = Math.max(max, row.high);
    });
    if (min === max) { min -= 1; max += 1; }
    var padding = Math.max(.0000001, (max - min) * .06);
    return { min: min - padding, max: max + padding };
  }

  function yForPrice(value, range, rect) {
    return rect.y + (range.max - number(value)) / Math.max(.0000001, range.max - range.min) * rect.height;
  }

  function visibleFor(plotWidth, baseStep) {
    var requested = clamp(baseStep * state.zoom, baseStep * .62, baseStep * 1.9);
    var count = Math.min(state.candles.length, Math.max(5, Math.floor(plotWidth / requested)));
    var end = clamp(state.candles.length - Math.round(state.endOffset), count, state.candles.length);
    var start = Math.max(0, end - count);
    return { count: count, start: start, end: end, step: count ? plotWidth / count : requested, rows: state.candles.slice(start, end) };
  }

  function drawGrid(ctx, rect, range, theme, rightX) {
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    for (var column = 0; column <= 8; column += 1) {
      var x = rect.x + rect.width * column / 8;
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, rect.y);
      ctx.lineTo(Math.round(x) + .5, rect.y + rect.height);
      ctx.stroke();
    }
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var row = 0; row <= 7; row += 1) {
      var y = rect.y + rect.height * row / 7;
      var value = range.max - (range.max - range.min) * row / 7;
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(rect.x, Math.round(y) + .5);
      ctx.lineTo(rect.x + rect.width, Math.round(y) + .5);
      ctx.stroke();
      ctx.fillStyle = theme.axis;
      ctx.fillText(formatPrice(value), rightX + 6, y);
    }
    ctx.restore();
  }

  function drawFootprints(ctx, rows, rect, range, step, config) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    rows.forEach(function (candle, offset) {
      var isRunning = offset === rows.length - 1 && candle.levelMode === 'exact-live-trades';
      var x = rect.x + step * offset + step / 2;
      var barWidth = Math.min(72, Math.max(8, step * .72));
      var half = barWidth / 2;
      var maxVolume = Math.max(1, candle.levels.reduce(function (max, level) { return Math.max(max, level.volume); }, 0));
      var highY = yForPrice(candle.high, range, rect);
      var lowY = yForPrice(candle.low, range, rect);
      var openY = yForPrice(candle.open, range, rect);
      var closeY = yForPrice(candle.close, range, rect);
      var up = candle.close >= candle.open;
      ctx.strokeStyle = up ? config.up : config.down;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, highY);
      ctx.lineTo(Math.round(x) + .5, lowY);
      ctx.stroke();
      ctx.globalAlpha = .9;
      ctx.fillStyle = up ? config.up : config.down;
      ctx.fillRect(Math.round(x - 1), Math.min(openY, closeY), 3, Math.max(2, Math.abs(closeY - openY)));
      ctx.globalAlpha = 1;

      candle.levels.forEach(function (level) {
        var y = yForPrice(level.price, range, rect);
        var tickPixels = Math.abs(yForPrice(level.price + candle.tick, range, rect) - y);
        var cellHeight = clamp(tickPixels - 1, 6, 18);
        var intensity = .18 + .72 * level.volume / maxVolume;
        var bidImbalance = level.bid >= Math.max(.0000001, level.ask) * 3;
        var askImbalance = level.ask >= Math.max(.0000001, level.bid) * 3;
        var bidFill = rgba(config.bid, config.flat ? .08 : intensity);
        var askFill = rgba(config.ask, config.flat ? .08 : intensity);
        var bidText = config.text;
        var askText = config.text;
        if (bidImbalance && config.highlight) {
          bidFill = config.highlight;
          bidText = config.highlightText || '#111';
        }
        if (askImbalance && config.highlight) {
          askFill = config.highlight;
          askText = config.highlightText || '#111';
        }
        ctx.fillStyle = bidFill;
        ctx.fillRect(Math.round(x - half), Math.round(y - cellHeight / 2), Math.ceil(half), Math.max(5, Math.round(cellHeight)));
        ctx.fillStyle = askFill;
        ctx.fillRect(Math.round(x), Math.round(y - cellHeight / 2), Math.ceil(half), Math.max(5, Math.round(cellHeight)));
        if (Math.abs(level.price - candle.poc) <= candle.tick * .2) {
          ctx.strokeStyle = config.poc;
          ctx.lineWidth = 1.3;
          ctx.strokeRect(Math.round(x - half) + .5, Math.round(y - cellHeight / 2) + .5, Math.round(barWidth) - 1, Math.max(4, Math.round(cellHeight) - 1));
        }
        if (level.volume > 0) {
          ctx.font = (cellHeight >= 11 ? '7.5px' : '6px') + ' "JetBrains Mono", monospace';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = bidText;
          ctx.textAlign = 'right';
          ctx.fillText(formatCell(level.bid), x - 2, y);
          ctx.fillStyle = askText;
          ctx.textAlign = 'left';
          ctx.fillText(formatCell(level.ask), x + 2, y);
        }
      });

      ctx.strokeStyle = up ? rgba(config.up, .78) : rgba(config.down, .78);
      ctx.lineWidth = 1;
      if (isRunning) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffd54a';
        ctx.lineWidth = 2;
      }
      ctx.strokeRect(Math.round(x - barWidth / 2) + .5, Math.round(highY) + .5, Math.round(barWidth) - 1, Math.max(3, Math.round(lowY - highY) - 1));
      if (isRunning) {
        ctx.restore();
        ctx.save();
        ctx.font = '800 7px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText('LIVE', x, Math.min(rect.y + rect.height - 10, lowY + 4));
        ctx.restore();
      }
      ctx.font = '800 7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = candle.delta >= 0 ? config.up : config.down;
      ctx.fillText('Δ ' + formatValue(candle.delta), x, Math.max(rect.y + 30, highY - 3));
    });
    ctx.restore();
  }

  function drawTimeAxis(ctx, rows, rect, step, theme) {
    if (!rows.length) return;
    var every = Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(rect.width / 120))));
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + .5);
    ctx.lineTo(rect.x + rect.width, rect.y + .5);
    ctx.stroke();
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.axis;
    rows.forEach(function (row, offset) {
      if (offset % every !== 0 && offset !== rows.length - 1) return;
      ctx.fillText(formatTime(row.time, false), rect.x + step * offset + step / 2, rect.y + 4);
    });
    ctx.restore();
  }

  function drawVolumeBars(ctx, rows, rect, step, theme) {
    var maxVolume = Math.max(1, rows.reduce(function (max, row) { return Math.max(max, row.volume); }, 0));
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    rows.forEach(function (row, offset) {
      var x = rect.x + step * offset + step / 2;
      var width = clamp(step * .7, 3, 52);
      var height = row.volume / maxVolume * (rect.height - 14);
      ctx.fillStyle = row.delta >= 0 ? theme.positive : theme.negative;
      ctx.globalAlpha = .72;
      ctx.fillRect(x - width / 2, rect.y + rect.height - height, width, height);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.text;
    ctx.font = '850 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('VOLUME', rect.x + 4, rect.y + 3);
    ctx.restore();
  }

  function drawDeltaBars(ctx, rows, rect, step, theme) {
    var maxAbs = Math.max(1, rows.reduce(function (max, row) { return Math.max(max, Math.abs(row.delta)); }, 0));
    var zeroY = rect.y + rect.height / 2;
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(rect.x, zeroY + .5);
    ctx.lineTo(rect.x + rect.width, zeroY + .5);
    ctx.stroke();
    rows.forEach(function (row, offset) {
      var x = rect.x + step * offset + step / 2;
      var width = clamp(step * .7, 3, 52);
      var height = Math.abs(row.delta) / maxAbs * (rect.height / 2 - 11);
      ctx.fillStyle = row.delta >= 0 ? theme.positive : theme.negative;
      ctx.fillRect(x - width / 2, row.delta >= 0 ? zeroY - height : zeroY, width, height);
      ctx.fillStyle = theme.text;
      ctx.font = '700 6.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatValue(row.delta), x, row.delta >= 0 ? zeroY - height - 2 : zeroY + height + 8);
    });
    ctx.fillStyle = theme.text;
    ctx.font = '850 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(usesQuotePressure() ? 'BUY − SELL NET PRESSURE' : 'ASK − BID DELTA', rect.x + 4, rect.y + 3);
    ctx.restore();
  }

  function drawStatsTable(ctx, rows, rect, step, theme) {
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    var rowHeight = rect.height / 4;
    var cvd = 0;
    rows.forEach(function (row, offset) {
      cvd += row.delta;
      var x = rect.x + step * offset;
      ctx.strokeStyle = theme.grid;
      ctx.strokeRect(x + .5, rect.y + .5, step, rect.height - 1);
      var values = [row.volume, row.delta, cvd, row.close];
      values.forEach(function (value, rowIndex) {
        ctx.fillStyle = rowIndex === 1 ? (value >= 0 ? theme.positive : theme.negative) : theme.text;
        ctx.font = '700 6.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowIndex === 3 ? formatPrice(value) : formatValue(value), x + step / 2, rect.y + rowHeight * rowIndex + rowHeight / 2);
      });
    });
    ctx.fillStyle = theme.text;
    ctx.font = '850 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('FOOTPRINT BAR STATISTICS · VOL / DELTA / CVD / CLOSE', rect.x + 4, rect.y + 3);
    ctx.restore();
  }

  function drawSideProfile(ctx, rows, rect, range, theme, currentPrice) {
    var map = {};
    rows.forEach(function (candle) {
      candle.levels.forEach(function (level) {
        var key = String(level.price);
        if (!map[key]) map[key] = { price: level.price, bid: 0, ask: 0, volume: 0 };
        map[key].bid += level.bid;
        map[key].ask += level.ask;
        map[key].volume += level.volume;
      });
    });
    var levels = Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) { return a.price - b.price; });
    var max = Math.max(1, levels.reduce(function (value, level) {
      return Math.max(value, number(level.bid) + number(level.ask));
    }, 0));
    ctx.save();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    levels.forEach(function (level) {
      var y = yForPrice(level.price, range, rect);
      var height = clamp(rect.height / Math.max(14, levels.length) - 1, 2, 10);
      var usableWidth = rect.width - 32;
      var bidWidth = number(level.bid) / max * usableWidth;
      var askWidth = number(level.ask) / max * usableWidth;
      ctx.globalAlpha = .82;
      ctx.fillStyle = '#239ff2';
      ctx.fillRect(rect.x + 4, y - height / 2, bidWidth, height);
      ctx.fillStyle = '#ff5264';
      ctx.fillRect(rect.x + rect.width - 4 - askWidth, y - height / 2, askWidth, height);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.text;
    ctx.font = '850 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('VOLUME PROFILE', rect.x + 4, rect.y + 4);
    ctx.font = '700 6px "JetBrains Mono", monospace';
    ctx.fillStyle = '#239ff2';
    ctx.fillText('BID', rect.x + 4, rect.y + 15);
    ctx.fillStyle = '#ff5264';
    ctx.fillText('ASK', rect.x + rect.width - 22, rect.y + 15);
    ctx.restore();
  }

  function drawHeader(ctx, rect, theme, title, detail) {
    ctx.save();
    ctx.fillStyle = theme.text;
    ctx.font = '900 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, rect.x + 4, rect.y + 4);
    ctx.fillStyle = theme.muted;
    ctx.font = '750 7px "JetBrains Mono", monospace';
    ctx.fillText(detail, rect.x + 4, rect.y + 18);
    ctx.restore();
  }

  function drawCrosshair(ctx, visible, layout, mainRect, theme) {
    var index = state.hoverIndex;
    if (index == null || index < layout.start || index >= state.candles.length) return;
    mainRect = layout.mainRect || mainRect;
    if (!mainRect) return;
    var row = state.candles[index];
    var offset = index - layout.start;
    var x = layout.x + layout.step * offset + layout.step / 2;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = theme.crosshair;
    ctx.beginPath();
    ctx.moveTo(x + .5, mainRect.y);
    ctx.lineTo(x + .5, mainRect.y + mainRect.height);
    ctx.stroke();
    ctx.setLineDash([]);
    var headerLine = formatTooltipDateTime(row.time) + '  ' + state.symbol + '  ' + state.timeframe;
    var ohlLine = 'O ' + formatPrice(row.open) + '  H ' + formatPrice(row.high) + '  L ' + formatPrice(row.low);
    var closeLine = 'C ' + formatPrice(row.close) + '  POC ' + formatPrice(row.poc);
    var flowLine = (usesQuotePressure() ? 'SELL P ' : 'BID ') + formatValue(row.sell) +
      (usesQuotePressure() ? '  BUY P ' : '  ASK ') + formatValue(row.buy) +
      (usesQuotePressure() ? '  NET ' : '  Δ ') + formatValue(row.delta);
    ctx.font = '900 8px "JetBrains Mono", monospace';
    var measuredWidth = Math.max(
      ctx.measureText(headerLine).width,
      ctx.measureText(ohlLine).width,
      ctx.measureText(closeLine).width,
      ctx.measureText(flowLine).width
    );
    var availableWidth = Math.max(40, mainRect.width - 8);
    var desiredWideWidth = Math.max(244, Math.ceil(measuredWidth) + 16);
    var useWideTooltip = desiredWideWidth <= availableWidth;
    var formattedDateTime = formatTooltipDateTime(row.time);
    var separatorAt = formattedDateTime.indexOf(' · ');
    var datePart = separatorAt >= 0 ? formattedDateTime.slice(0, separatorAt) : formattedDateTime;
    var timePart = separatorAt >= 0 ? formattedDateTime.slice(separatorAt + 3) : '';
    var compactLines = [
      datePart,
      timePart,
      state.symbol + ' · ' + state.timeframe,
      'O ' + formatPrice(row.open),
      'H ' + formatPrice(row.high),
      'L ' + formatPrice(row.low),
      'C ' + formatPrice(row.close),
      'POC ' + formatPrice(row.poc),
      (usesQuotePressure() ? 'SELL P ' : 'BID ') + formatValue(row.sell),
      (usesQuotePressure() ? 'BUY P ' : 'ASK ') + formatValue(row.buy),
      (usesQuotePressure() ? 'NET ' : 'Δ ') + formatValue(row.delta)
    ];
    var compactDisplayLines = compactLines;
    var compactFlowStart = 8;
    var compactBoxHeight = 177;
    if (!useWideTooltip && mainRect.height < 185) {
      if (mainRect.height >= 110) {
        compactDisplayLines = [
          datePart,
          timePart,
          state.symbol + ' · ' + state.timeframe,
          'C ' + formatPrice(row.close),
          'POC ' + formatPrice(row.poc),
          (usesQuotePressure() ? 'NET ' : 'Δ ') + formatValue(row.delta)
        ];
        compactFlowStart = 5;
        compactBoxHeight = 102;
      } else if (mainRect.height >= 65) {
        compactDisplayLines = [datePart, timePart, state.symbol + ' · ' + state.timeframe];
        compactFlowStart = compactDisplayLines.length;
        compactBoxHeight = 57;
      } else if (mainRect.height >= 50) {
        compactDisplayLines = [datePart, timePart];
        compactFlowStart = compactDisplayLines.length;
        compactBoxHeight = 42;
      } else {
        ctx.restore();
        return;
      }
    }
    var compactFontSize = 7;
    if (!useWideTooltip) {
      ctx.font = '900 ' + compactFontSize + 'px "JetBrains Mono", monospace';
      var compactMeasuredWidth = compactDisplayLines.reduce(function (maximum, line) {
        return Math.max(maximum, ctx.measureText(line).width);
      }, 0);
      if (compactMeasuredWidth + 16 > availableWidth) {
        compactFontSize = 6;
        ctx.font = '900 ' + compactFontSize + 'px "JetBrains Mono", monospace';
      }
    }
    var boxWidth = useWideTooltip ? desiredWideWidth : availableWidth;
    var boxHeight = useWideTooltip ? 82 : compactBoxHeight;
    if (mainRect.height < boxHeight + 8) {
      ctx.restore();
      return;
    }
    var minBoxX = mainRect.x + 4;
    var maxBoxX = mainRect.x + mainRect.width - boxWidth - 4;
    var boxX = Math.max(minBoxX, Math.min(x + 13, maxBoxX));
    var boxY = Math.max(mainRect.y + 4, Math.min(mainRect.y + 34, mainRect.y + mainRect.height - boxHeight - 4));
    ctx.fillStyle = theme.tooltip;
    ctx.strokeStyle = theme.accent;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (useWideTooltip) {
      ctx.font = '900 8px "JetBrains Mono", monospace';
      ctx.fillText(headerLine, boxX + 8, boxY + 7);
      ctx.fillText(ohlLine, boxX + 8, boxY + 24);
      ctx.fillText(closeLine, boxX + 8, boxY + 41);
      ctx.fillStyle = row.delta >= 0 ? theme.positive : theme.negative;
      ctx.fillText(flowLine, boxX + 8, boxY + 59);
    } else {
      ctx.font = '900 ' + compactFontSize + 'px "JetBrains Mono", monospace';
      compactDisplayLines.forEach(function (line, lineIndex) {
        ctx.fillStyle = lineIndex >= compactFlowStart ? (row.delta >= 0 ? theme.positive : theme.negative) : theme.text;
        ctx.fillText(line, boxX + 8, boxY + 6 + lineIndex * 15);
      });
    }
    ctx.restore();
  }

  var THEMES = {
    black: { bg: '#030405', grid: 'rgba(255,255,255,.055)', axis: 'rgba(235,241,242,.68)', text: '#eef4f5', muted: 'rgba(222,232,234,.48)', positive: '#18dc75', negative: '#ff304d', crosshair: 'rgba(255,255,255,.42)', tooltip: 'rgba(4,6,7,.96)', accent: 'rgba(255,138,31,.55)' },
    blue: { bg: '#16283a', grid: 'rgba(146,177,205,.09)', axis: 'rgba(218,230,240,.67)', text: '#e9f2f7', muted: 'rgba(205,219,231,.5)', positive: '#00a96c', negative: '#b24455', crosshair: 'rgba(212,230,244,.42)', tooltip: 'rgba(13,26,39,.96)', accent: 'rgba(54,168,255,.55)' },
    white: { bg: '#f8f8f5', grid: 'rgba(30,44,54,.09)', axis: 'rgba(25,35,42,.72)', text: '#20282d', muted: 'rgba(35,47,54,.52)', positive: '#24bd64', negative: '#ef5366', crosshair: 'rgba(20,25,28,.38)', tooltip: 'rgba(248,248,245,.97)', accent: 'rgba(20,120,190,.55)' }
  };

  var CONFIGS = {
    profile: { bid: '#e30620', ask: '#5d80bd', up: '#2fd071', down: '#ff304d', text: '#f5f7f8', poc: '#ffea00', highlight: '#ff192f', highlightText: '#fff' },
    cluster: { bid: '#31b873', ask: '#3e86b7', up: '#23d885', down: '#ed5268', text: '#eaf3f7', poc: '#ffee00', highlight: '#ffee00', highlightText: '#111', flat: true },
    ladder: { bid: '#9b532f', ask: '#c46b36', up: '#22bd70', down: '#ef5366', text: '#fff6e9', poc: '#ffea00', highlight: '#ffea00', highlightText: '#111' },
    dom: { bid: '#dc5966', ask: '#40b47b', up: '#19e178', down: '#ff3652', text: '#f4f9f8', poc: '#ff304d', highlight: '#19e178', highlightText: '#07120b' },
    classic: { bid: '#f48b98', ask: '#78d5a1', up: '#13b85f', down: '#ec425b', text: '#283036', poc: '#17191a', highlight: '#ffea00', highlightText: '#111' },
    stats: { bid: '#e2192d', ask: '#19ad55', up: '#00ef63', down: '#ff243e', text: '#f4f7f8', poc: '#fff', highlight: '#10d95b', highlightText: '#06100a' }
  };

  function baseGeometry(width, height, right, bottom) {
    var left = 10;
    var top = 5;
    return { left: left, top: top, right: right, bottom: bottom, width: Math.max(100, width - left - right), height: Math.max(180, height - top - bottom) };
  }

  function setLayout(visible, x, width, mainRect) {
    state.layout = {
      start: visible.start,
      count: visible.count,
      x: x,
      width: width,
      step: visible.step,
      mainRect: mainRect ? { x: mainRect.x, y: mainRect.y, width: mainRect.width, height: mainRect.height } : null
    };
    state.metricLayout = { start: visible.start, count: visible.count };
  }

  function renderViewOne(ctx, width, height) {
    var theme = THEMES.black;
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height);
    var g = baseGeometry(width, height, 72, 24);
    var mainH = Math.floor(g.height * .64);
    var volH = Math.floor(g.height * .13);
    var statsH = g.height - mainH - volH - 7;
    var main = { x: g.left, y: g.top, width: g.width, height: mainH };
    var vol = { x: g.left, y: main.y + main.height + 3, width: g.width, height: volH };
    var stats = { x: g.left, y: vol.y + vol.height + 3, width: g.width, height: statsH };
    var axis = { x: g.left, y: stats.y + stats.height, width: g.width, height: g.bottom };
    var visible = visibleFor(g.width, 68);
    var range = priceRange(visible.rows);
    drawGrid(ctx, main, range, theme, g.left + g.width);
    drawFootprints(ctx, visible.rows, main, range, visible.step, CONFIGS.profile);
    drawHeader(ctx, main, theme,
      state.symbol + (usesQuotePressure() ? ' · SELL-BUY PRESSURE PROFILE · ' : ' · BID-ASK PROFILE · ') + state.timeframe,
      state.source + (usesQuotePressure() ? ' · visible quote-pressure window' : ' · footprint profile adaptive'));
    drawVolumeBars(ctx, visible.rows, vol, visible.step, theme);
    drawStatsTable(ctx, visible.rows, stats, visible.step, theme);
    drawTimeAxis(ctx, visible.rows, axis, visible.step, theme);
    setLayout(visible, g.left, g.width, main);
    drawCrosshair(ctx, visible, state.layout, main, theme);
  }

  function renderViewTwo(ctx, width, height) {
    var theme = THEMES.blue;
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height);
    var g = baseGeometry(width, height, 72, 24);
    var showProfile = g.width >= 300;
    var profileW = showProfile ? clamp(g.width * .16, 105, 170) : 0;
    var profileGap = showProfile ? 5 : 0;
    var plotW = g.width - profileW - profileGap;
    var mainH = Math.floor(g.height * .72);
    var main = { x: g.left, y: g.top, width: plotW, height: mainH };
    var profile = { x: g.left + plotW + profileGap, y: g.top, width: profileW, height: mainH };
    var delta = { x: g.left, y: main.y + main.height + 4, width: g.width, height: g.height - mainH - 4 };
    var axis = { x: g.left, y: delta.y + delta.height, width: g.width, height: g.bottom };
    var visible = visibleFor(plotW, 54);
    var range = priceRange(visible.rows);
    drawGrid(ctx, main, range, theme, g.left + g.width);
    drawFootprints(ctx, visible.rows, main, range, visible.step, CONFIGS.cluster);
    drawHeader(ctx, main, theme,
      state.symbol + (usesQuotePressure() ? ' · PRESSURE CLUSTER + NET' : ' · CLUSTER FOOTPRINT + DELTA'),
      usesQuotePressure() ? 'Sell × Buy pressure · visible directional imbalance' : 'Bid × Ask numbers · yellow LIVE candle = current exact Binance trades');
    if (showProfile) drawSideProfile(ctx, visible.rows, profile, range, theme, state.lastPrice);
    drawDeltaBars(ctx, visible.rows, delta, g.width / Math.max(1, visible.count), theme);
    drawTimeAxis(ctx, visible.rows, axis, g.width / Math.max(1, visible.count), theme);
    setLayout(visible, g.left, plotW, main);
    drawCrosshair(ctx, visible, state.layout, main, theme);
  }

  function renderViewThree(ctx, width, height) {
    var theme = THEMES.blue;
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height);
    var g = baseGeometry(width, height, 72, 25);
    var main = { x: g.left, y: g.top, width: g.width, height: g.height };
    var axis = { x: g.left, y: main.y + main.height, width: g.width, height: g.bottom };
    var visible = visibleFor(g.width, 75);
    var range = priceRange(visible.rows);
    drawGrid(ctx, main, range, theme, g.left + g.width);
    drawFootprints(ctx, visible.rows, main, range, visible.step, CONFIGS.ladder);
    drawHeader(ctx, main, theme,
      state.symbol + (usesQuotePressure() ? ' · SELL × BUY PRESSURE LADDER' : ' · BID × ASK DELTA LADDER'),
      usesQuotePressure() ? 'Quote activity · pressure net · coloring by magnitude' : 'Double data · Volume + Delta · coloring by volume');
    var panel = { x: main.x + 10, y: main.y + main.height - 184, width: 205, height: 174 };
    ctx.save();
    ctx.fillStyle = 'rgba(18,38,54,.93)';
    ctx.strokeStyle = 'rgba(255,138,31,.55)';
    ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    ctx.strokeRect(panel.x + .5, panel.y + .5, panel.width - 1, panel.height - 1);
    ctx.fillStyle = '#dbe7ee';
    ctx.font = '850 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ['TYPE    DOUBLE', 'DATA #1  VOLUME', 'DATA #2  DELTA', 'VISUAL   COLOR BY VOLUME', '● ENABLED'].forEach(function (text, index) {
      ctx.fillStyle = index === 4 ? '#ff8a1f' : '#dbe7ee';
      ctx.fillText(text, panel.x + 12, panel.y + 20 + index * 30);
    });
    ctx.restore();
    drawTimeAxis(ctx, visible.rows, axis, visible.step, theme);
    setLayout(visible, g.left, g.width, main);
    drawCrosshair(ctx, visible, state.layout, main, theme);
  }

  function renderViewFour(ctx, width, height) {
    var theme = THEMES.black;
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height);
    var g = baseGeometry(width, height, 72, 24);
    var showProfile = g.width >= 300;
    var profileW = showProfile ? clamp(g.width * .17, 115, 185) : 0;
    var profileGap = showProfile ? 6 : 0;
    var plotW = g.width - profileW - profileGap;
    var mainH = Math.floor(g.height * .84);
    var main = { x: g.left, y: g.top, width: plotW, height: mainH };
    var profile = { x: g.left + plotW + profileGap, y: g.top, width: profileW, height: mainH };
    var volume = { x: g.left, y: main.y + main.height + 3, width: g.width, height: g.height - mainH - 3 };
    var axis = { x: g.left, y: volume.y + volume.height, width: g.width, height: g.bottom };
    var visible = visibleFor(plotW, 72);
    var range = priceRange(visible.rows);
    drawGrid(ctx, main, range, theme, g.left + g.width);
    drawFootprints(ctx, visible.rows, main, range, visible.step, CONFIGS.dom);
    drawHeader(ctx, main, theme,
      state.symbol + (usesQuotePressure()
        ? (showProfile ? ' · PRESSURE CLUSTER + SIDE PROFILE' : ' · PRESSURE CLUSTER · MOBILE')
        : (showProfile ? ' · DELTA CLUSTER + DOM PROFILE' : ' · DELTA CLUSTER · MOBILE')),
      usesQuotePressure()
        ? (showProfile ? 'Sell × Buy pressure clusters · visible-window profile' : 'Sell × Buy pressure clusters · chart width prioritized on narrow screens')
        : (showProfile ? 'Bid × Ask clusters · absorption markers · session POC' : 'Bid × Ask clusters · chart width prioritized on narrow screens'));
    if (showProfile) drawSideProfile(ctx, visible.rows, profile, range, { bg: '#0b0d0e', text: '#e8edef', positive: '#239ff2', negative: '#ff5264' }, state.lastPrice);
    drawVolumeBars(ctx, visible.rows, volume, g.width / Math.max(1, visible.count), theme);
    drawTimeAxis(ctx, visible.rows, axis, g.width / Math.max(1, visible.count), theme);
    setLayout(visible, g.left, plotW, main);
    drawCrosshair(ctx, visible, state.layout, main, theme);
  }

  function renderViewFive(ctx, width, height) {
    var theme = THEMES.white;
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height);
    var g = baseGeometry(width, height, 72, 27);
    var sidebarW = 27;
    var main = { x: g.left + sidebarW, y: g.top, width: g.width - sidebarW, height: g.height };
    var axis = { x: main.x, y: main.y + main.height, width: main.width, height: g.bottom };
    var visible = visibleFor(main.width, 75);
    var range = priceRange(visible.rows);
    drawGrid(ctx, main, range, theme, g.left + g.width);
    drawFootprints(ctx, visible.rows, main, range, visible.step, CONFIGS.classic);
    drawHeader(ctx, main, theme,
      state.symbol + (usesQuotePressure() ? ' · CLASSIC SELL × BUY PRESSURE' : ' · CLASSIC BID × ASK FOOTPRINT'),
      usesQuotePressure() ? 'High-contrast directional pressure · POC outline' : 'High-contrast clusters · imbalance highlights · POC outline');
    ctx.save();
    ctx.fillStyle = '#f0f2f1';
    ctx.fillRect(g.left, g.top, sidebarW - 3, g.height);
    ctx.fillStyle = '#2b3438';
    ctx.font = '800 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ['VOL', 'TRD', 'BID', 'ASK', 'Δ'].forEach(function (label, index) {
      ctx.save();
      ctx.translate(g.left + 10, g.top + 45 + index * 47);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });
    ctx.restore();
    drawTimeAxis(ctx, visible.rows, axis, visible.step, theme);
    setLayout(visible, main.x, main.width, main);
    drawCrosshair(ctx, visible, state.layout, main, theme);
  }

  function renderViewSix(ctx, width, height) {
    var theme = THEMES.black;
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height);
    var g = baseGeometry(width, height, 72, 24);
    var showProfile = g.width >= 300;
    var profileW = showProfile ? clamp(g.width * .18, 120, 190) : 0;
    var profileGap = showProfile ? 5 : 0;
    var plotW = g.width - profileW - profileGap;
    var mainH = Math.floor(g.height * .60);
    var deltaH = Math.floor(g.height * .13);
    var volumeH = Math.floor(g.height * .11);
    var statsH = g.height - mainH - deltaH - volumeH - 9;
    var main = { x: g.left, y: g.top, width: plotW, height: mainH };
    var profile = { x: g.left + plotW + profileGap, y: g.top, width: profileW, height: mainH };
    var delta = { x: g.left, y: main.y + main.height + 3, width: g.width, height: deltaH };
    var volume = { x: g.left, y: delta.y + delta.height + 3, width: g.width, height: volumeH };
    var stats = { x: g.left, y: volume.y + volume.height + 3, width: g.width, height: statsH };
    var axis = { x: g.left, y: stats.y + stats.height, width: g.width, height: g.bottom };
    var visible = visibleFor(plotW, 76);
    var range = priceRange(visible.rows);
    drawGrid(ctx, main, range, theme, g.left + g.width);
    drawFootprints(ctx, visible.rows, main, range, visible.step, CONFIGS.stats);
    drawHeader(ctx, main, theme,
      state.symbol + (usesQuotePressure() ? ' · PRESSURE + NET/ACTIVITY STATISTICS' : ' · FOOTPRINT + DELTA/VOLUME STATISTICS'),
      usesQuotePressure()
        ? (showProfile ? 'Sell × Buy quote pressure · visible values · right activity profile' : 'Sell × Buy quote pressure · chart width prioritized on narrow screens')
        : (showProfile ? 'Bid × Ask imbalance · calculated values · right volume profile' : 'Bid × Ask imbalance · chart width prioritized on narrow screens'));
    if (showProfile) drawSideProfile(ctx, visible.rows, profile, range, { bg: '#050607', text: '#e8edef', positive: '#171cd0', negative: '#171cd0' }, state.lastPrice);
    var lowerStep = g.width / Math.max(1, visible.count);
    drawDeltaBars(ctx, visible.rows, delta, lowerStep, theme);
    drawVolumeBars(ctx, visible.rows, volume, lowerStep, theme);
    drawStatsTable(ctx, visible.rows, stats, lowerStep, theme);
    drawTimeAxis(ctx, visible.rows, axis, lowerStep, theme);
    setLayout(visible, g.left, plotW, main);
    drawCrosshair(ctx, visible, state.layout, main, theme);
  }

  function render() {
    if (!state.open || !state.canvas || !state.ctx) return;
    if (!resizeCanvas()) return;
    var rect = state.canvas.getBoundingClientRect();
    var ctx = state.ctx;
    state.metricLayout = null;
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (state.activeView === 6) renderViewSix(ctx, rect.width, rect.height);
    else if (state.activeView === 5) renderViewFive(ctx, rect.width, rect.height);
    else if (state.activeView === 4) renderViewFour(ctx, rect.width, rect.height);
    else if (state.activeView === 3) renderViewThree(ctx, rect.width, rect.height);
    else if (state.activeView === 2) renderViewTwo(ctx, rect.width, rect.height);
    else renderViewOne(ctx, rect.width, rect.height);
    syncChrome();
    syncEmpty();
  }

  function bindCanvas(canvas) {
    if (!canvas || canvas.getAttribute('data-gp-m2fp-bound')) return;
    canvas.setAttribute('data-gp-m2fp-bound', VERSION);
    canvas.style.touchAction = 'none';
    var pointers = Object.create(null);
    var dragging = false;
    var dragStartX = 0;
    var dragStartOffset = 0;
    var pinchStartDistance = 0;
    var pinchStartZoom = state.zoom;
    function pointerList() { return Object.keys(pointers).map(function (key) { return pointers[key]; }); }
    function pointerDistance(list) {
      if (list.length < 2) return 0;
      return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
    }
    function updateHoverAt(clientX, clientY) {
      if (!state.layout || !state.layout.count) { clearHover(true); return; }
      var rect = canvas.getBoundingClientRect();
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      var nextHoverIndex = null;
      if (pointInsideMainChart(state.layout, x, y)) {
        var offset = Math.floor((x - state.layout.x) / state.layout.step);
        nextHoverIndex = clamp(state.layout.start + offset, state.layout.start, state.layout.start + state.layout.count - 1);
      }
      if (nextHoverIndex === state.hoverIndex) return;
      state.hoverIndex = nextHoverIndex;
      scheduleRender();
    }
    function resetPointerState(renderAfter) {
      pointers = Object.create(null);
      dragging = false;
      pinchStartDistance = 0;
      pinchStartZoom = state.zoom;
      clearHover(renderAfter !== false);
    }
    canvas.addEventListener('mousemove', function (event) {
      if (!state.layout || !state.layout.count) { clearHover(true); return; }
      if (dragging || pointerList().length) { clearHover(true); return; }
      updateHoverAt(event.clientX, event.clientY);
    });
    canvas.addEventListener('mouseleave', function () { clearHover(true); });
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      clearHover(true);
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        var panDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        setEndOffset(state.endOffset + (panDelta > 0 ? 4 : -4));
        return;
      }
      state.zoom = clamp(state.zoom + (event.deltaY < 0 ? .12 : -.12), .62, 1.9);
      scheduleRender();
    }, { passive: false });
    canvas.addEventListener('pointerdown', function (event) {
      clearHover(true);
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      var list = pointerList();
      if (list.length >= 2) {
        pinchStartDistance = pointerDistance(list);
        pinchStartZoom = state.zoom;
        dragging = false;
      } else {
        dragging = true;
        dragStartX = event.clientX;
        dragStartOffset = state.endOffset;
      }
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!pointers[event.pointerId]) return;
      clearHover(false);
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var list = pointerList();
      if (list.length >= 2 && pinchStartDistance > 0) {
        var distance = pointerDistance(list);
        if (distance > 0) {
          state.zoom = clamp(pinchStartZoom * distance / pinchStartDistance, .62, 1.9);
          scheduleRender();
        }
        return;
      }
      if (!dragging) return;
      var step = Math.max(3, state.layout && state.layout.step || 8);
      setEndOffset(dragStartOffset + (event.clientX - dragStartX) / step);
    });
    function finishPointer(event, restoreHover) {
      clearHover(true);
      delete pointers[event.pointerId];
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
      var list = pointerList();
      pinchStartDistance = list.length >= 2 ? pointerDistance(list) : 0;
      if (list.length === 1) {
        dragging = true;
        dragStartX = list[0].x;
        dragStartOffset = state.endOffset;
      } else if (!list.length) {
        dragging = false;
        if (restoreHover && (!event.pointerType || event.pointerType === 'mouse')) updateHoverAt(event.clientX, event.clientY);
      }
    }
    canvas.addEventListener('pointerup', function (event) { finishPointer(event, true); });
    canvas.addEventListener('pointercancel', function (event) { finishPointer(event, false); });
    canvas.addEventListener('lostpointercapture', function (event) {
      if (!pointers[event.pointerId]) return;
      resetPointerState(true);
    });
    canvas.addEventListener('touchcancel', function () { resetPointerState(true); }, { passive: true });
    window.addEventListener('blur', function () { resetPointerState(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) resetPointerState(true);
    });
  }

  function startMarketMonitor() {
    if (state.marketTimer) window.clearInterval(state.marketTimer);
    state.lastRuntimeSignature = state.symbol + '|' + state.exchange;
    state.marketTimer = window.setInterval(function () {
      if (!state.open) return;
      var market = readMarket();
      var signature = market.symbol + '|' + market.exchange;
      if (signature === state.lastRuntimeSignature) return;
      state.lastRuntimeSignature = signature;
      state.timeframeLocked = false;
      if (state.reloadTimer) window.clearTimeout(state.reloadTimer);
      state.reloadTimer = window.setTimeout(function () { state.reloadTimer = 0; reloadData('market-change'); }, 180);
    }, 900);
  }

  function openModule() {
    var overlay = ensureOverlay();
    closePrimeToolsPopover();
    state.open = true;
    state.secureRetryCount = 0;
    if (state.secureRetryTimer) window.clearTimeout(state.secureRetryTimer);
    state.secureRetryTimer = 0;
    state.timeframeLocked = false;
    document.body.classList.add('gp-m2fp-open');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(function () { resizeCanvas(); scheduleRender(); });
    startMarketMonitor();
    reloadData('open');
    return true;
  }

  function moduleWindowUrl() {
    return window.location.href.split('#')[0] + '#module2-footprint';
  }

  function openModuleWindow() {
    if (STANDALONE) return openModule();
    closePrimeToolsPopover();
    var popup = null;
    try {
      popup = window.open(moduleWindowUrl(), 'guardeer_module2_footprint', 'width=1440,height=920,left=70,top=40,resizable=yes,scrollbars=yes');
    } catch (_) {}
    if (popup) {
      try { popup.focus(); } catch (_) {}
      return popup;
    }
    openModule();
    showToast('Popup blocked. Module 2 opened in this window.');
    return false;
  }

  function closeModule() {
    state.open = false;
    state.loadSeq += 1;
    document.body.classList.remove('gp-m2fp-open');
    var overlay = state.overlay || qs('#gp-module2-footprint');
    if (overlay) {
      overlay.classList.remove('is-open', 'is-maximized');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (state.marketTimer) window.clearInterval(state.marketTimer);
    if (state.reloadTimer) window.clearTimeout(state.reloadTimer);
    state.marketTimer = 0;
    state.reloadTimer = 0;
    stopFeed();
    if (STANDALONE) window.setTimeout(function () { try { window.close(); } catch (_) {} }, 20);
    return true;
  }

  function toggleMaximized() {
    var overlay = ensureOverlay();
    clearHover(false);
    overlay.classList.toggle('is-maximized');
    window.setTimeout(function () { resizeCanvas(); scheduleRender(); }, 40);
  }

  function changeZoom(direction) {
    clearHover(false);
    state.zoom = clamp(state.zoom + direction * .15, .62, 1.9);
    scheduleRender();
  }

  function onDocumentClick(event) {
    var target = targetOf(event);
    if (!target) return;
    var launcher = target.closest('[data-gp-module2-open]');
    if (launcher) {
      event.preventDefault();
      event.stopPropagation();
      openModuleWindow();
      return;
    }
    var overlay = target.closest('#gp-module2-footprint');
    if (!overlay) return;
    if (target === overlay) { closeModule(); return; }
    var action = target.closest('[data-gp-m2fp-action]');
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      var name = action.getAttribute('data-gp-m2fp-action');
      if (name === 'close') closeModule();
      else if (name === 'maximize') toggleMaximized();
      else if (name === 'reconnect') reloadData('reconnect');
      else if (name === 'reset-view') { state.endOffset = 0; state.zoom = 1; clearHover(false); scheduleRender(); showToast('Chart view reset to the latest candle.'); }
      else if (name === 'zoom-in') changeZoom(1);
      else if (name === 'zoom-out') changeZoom(-1);
      return;
    }
    var tf = target.closest('[data-gp-m2fp-tf]');
    if (tf) {
      event.preventDefault();
      event.stopPropagation();
      state.timeframe = normalizeTimeframe(tf.getAttribute('data-gp-m2fp-tf'));
      state.timeframeLocked = true;
      reloadData('timeframe');
      return;
    }
    var view = target.closest('[data-gp-m2fp-view]');
    if (view) {
      event.preventDefault();
      event.stopPropagation();
      state.activeView = clamp(Math.round(number(view.getAttribute('data-gp-m2fp-view'), 1)), 1, 6);
      clearHover(false);
      syncChrome();
      scheduleRender();
      showToast('Tool 0' + state.activeView + ' live: ' + VIEW_NAMES[state.activeView - 1] + '.');
    }
  }

  function bindGlobalEvents() {
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open) { event.preventDefault(); closeModule(); }
    });
    window.addEventListener('resize', function () { if (state.open) { clearHover(false); resizeCanvas(); scheduleRender(); } }, { passive: true });
    window.addEventListener('hashchange', function () {
      if (window.location.hash !== '#module2-footprint') return;
      openModule();
    });
    window.addEventListener('guardeer:open-module2-footprint', openModule);
    window.addEventListener('guardeer:close-module2-footprint', closeModule);
  }

  function start() {
    bindGlobalEvents();
    ensureLauncher();
    if (!STANDALONE) {
      var launcherSyncTimer = 0;
      var observer = new MutationObserver(function () {
        if (launcherSyncTimer) return;
        launcherSyncTimer = window.setTimeout(function () {
          launcherSyncTimer = 0;
          ensureLauncher();
        }, 16);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      [120, 500, 1200, 2400, 4800].forEach(function (delay) { window.setTimeout(ensureLauncher, delay); });
    }
    if (window.location.hash === '#module2-footprint') {
      window.setTimeout(openModule, 650);
    }
  }

  window.GPModule2Footprint = {
    version: VERSION,
    open: STANDALONE ? openModule : openModuleWindow,
    openInline: openModule,
    openWindow: openModuleWindow,
    close: closeModule,
    reload: reloadData,
    confirmsHistoryPrice: function (price) {
      var value = number(price);
      var latest = state.candles[state.candles.length - 1];
      var reference = number(latest && latest.close);
      return Boolean(cleanSymbol(state.symbol) === 'XAUUSD' && value > 0 && reference > 0 &&
        Math.abs(value - reference) / reference <= 0.0045);
    },
    recoverHistory: function () {
      var now = Date.now();
      if (!state.open || now - number(state.lastIntegrityRefreshAt) < 30000) return false;
      state.lastIntegrityRefreshAt = now;
      reloadData('xau-live-jump-unconfirmed');
      return true;
    },
    state: state,
    getSnapshot: function () {
      var rows = metricRows();
      var metrics = sideTotals(rows);
      return {
        version: VERSION,
        standalone: STANDALONE,
        open: state.open,
        symbol: state.symbol,
        exchange: state.exchange,
        timeframe: state.timeframe,
        activeView: state.activeView,
        viewName: VIEW_NAMES[state.activeView - 1],
        singleView: SINGLE_VIEW,
        toolTitle: TOOL_TITLE,
        status: state.status,
        source: state.source,
        candles: state.candles.length,
        buyVolume: state.buyVolume,
        sellVolume: state.sellVolume,
        delta: state.buyVolume - state.sellVolume,
        prints: state.prints,
        metricBars: rows.length,
        metricBuy: metrics.buy,
        metricSell: metrics.sell,
        metricDelta: metrics.buy - metrics.sell,
        metricPeak: activityPeak(rows),
        lastHistoryError: state.lastHistoryError
      };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
