(function () {
  'use strict';

  if (window.__GP_BINANCE_LIVE_CANDLE_BRIDGE_V1__) return;
  window.__GP_BINANCE_LIVE_CANDLE_BRIDGE_V1__ = true;

  var timer = 0;
  var lastApplied = 0;

  function timeframeSeconds(value) {
    var map = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200,
      '4h': 14400, '6h': 21600, '8h': 28800, '12h': 43200, '1d': 86400, '3d': 259200, '1w': 604800, '1M': 2592000 };
    return map[String(value || '5m')] || 300;
  }

  function applyLivePrice() {
    var rt = window.GuardeerPrimeRuntime || null;
    var state = rt && rt.state || null;
    var chart = rt && rt.chart || null;
    if (!state || String(state.exchange || '').toLowerCase() !== 'binance' || !chart || typeof chart.updateCandle !== 'function') return;
    if (typeof rt.getCryptoPriceStatus !== 'function') return;

    var evidence;
    try { evidence = rt.getCryptoPriceStatus(); } catch (_) { return; }
    var price = Number(evidence && evidence.price);
    var providerTime = Number(evidence && evidence.providerTime);
    if (!evidence || evidence.fresh !== true || !(price > 0) || !(providerTime > 0) || providerTime === lastApplied) return;

    var rows = Array.isArray(chart.lastCandleData) ? chart.lastCandleData : [];
    var previous = rows.length ? rows[rows.length - 1] : null;
    if (!previous || !(Number(previous.close) > 0)) return;

    var interval = timeframeSeconds(state.timeframe);
    var bucket = Math.floor(providerTime / 1000 / interval) * interval;
    var previousTime = Number(previous.time);
    if (!(bucket >= previousTime) || bucket - previousTime > interval) return;

    var next = Object.assign({}, previous, {
      time: bucket,
      high: Math.max(Number(previous.high), price),
      low: Math.min(Number(previous.low), price),
      close: price
    });
    delete next.__gpProviderOhlcContextR407;
    delete next.__gpProviderOhlcAnchorR407;
    delete next.isClosed;
    delete next.flowSource;
    delete next.quoteVolume;
    delete next.takerBuyBaseVolume;
    delete next.takerBuyQuoteVolume;
    delete next.tradeCount;
    delete next.priceEventTime;

    try {
      chart.updateCandle(next);
      var committed = Array.isArray(chart.lastCandleData) && chart.lastCandleData.length
        ? chart.lastCandleData[chart.lastCandleData.length - 1]
        : null;
      if (!committed || Number(committed.time) !== bucket || Number(committed.close) !== price) {
        if (chart.candleSeries && typeof chart.candleSeries.update === 'function') {
          chart.candleSeries.update(next);
        }
        if (Array.isArray(chart.lastCandleData) && chart.lastCandleData.length) {
          chart.lastCandleData[chart.lastCandleData.length - 1] = next;
        }
      }
      lastApplied = providerTime;
    } catch (_) {}
  }

  function start() {
    applyLivePrice();
    timer = window.setInterval(applyLivePrice, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
