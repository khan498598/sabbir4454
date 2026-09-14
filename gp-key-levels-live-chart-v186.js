(function () {
  'use strict';

  if (window.__GP_KEY_LEVELS_LIVE_CHART_V186__) return;
  window.__GP_KEY_LEVELS_LIVE_CHART_V186__ = true;

  var VERSION = 'v190-main-chart-live-fixed-levels';
  var MAX_PER_SIDE = 3;
  var state = {
    runtime: null,
    contextKey: '',
    lines: { support: [], resistance: [] },
    levels: { support: [], resistance: [] },
    lastGoodAt: 0,
    lastRenderAt: 0,
    timer: 0,
    scheduled: 0,
    summaryObserver: null,
    writingSummary: false,
    chartSubscriptions: [],
    badge: null,
    overlay: null,
    overlaySignature: '',
    overlayResizeObserver: null,
    wrappedChart: null,
    cachedResult: null,
    lastCalculationAt: 0,
    lastStructureKey: '',
    lastCommitAt: 0,
    overlayFrame: 0,
    overlayLoop: 0,
    overlaySyncUntil: 0,
    interactionArea: null,
    initialOffDone: false,
    userToggled: false
  };

  function runtime() {
    var candidate = window.GuardeerPrimeRuntime || state.runtime || null;
    if (candidate && candidate.runtime && candidate.runtime.chart) candidate = candidate.runtime;
    return candidate || null;
  }

  function finite(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function median(values) {
    var list = values.filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (!list.length) return 0;
    var middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  }

  function percentile(values, ratio) {
    var list = values.filter(Number.isFinite).sort(function (a, b) { return a - b; });
    if (!list.length) return 0;
    var index = clamp((list.length - 1) * ratio, 0, list.length - 1);
    var low = Math.floor(index);
    var high = Math.ceil(index);
    if (low === high) return list[low];
    return list[low] + (list[high] - list[low]) * (index - low);
  }

  function symbolOf(rt) {
    return String(rt && rt.state && rt.state.symbol || 'XAUUSD').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  function timeframeOf(rt) {
    return String(rt && rt.state && rt.state.timeframe || '5m');
  }

  function decimalsFor(symbol, price) {
    var value = Math.abs(Number(price) || 0);
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD') return 2;
    if (/JPY$/.test(symbol) && /^[A-Z]{6}$/.test(symbol)) return 3;
    if (/^[A-Z]{6}$/.test(symbol)) return 5;
    if (value >= 1000) return 2;
    if (value >= 100) return 3;
    if (value >= 1) return 4;
    return 6;
  }

  function formatPrice(price, symbol) {
    var value = finite(price);
    if (value === null) return '—';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimalsFor(symbol, value),
      maximumFractionDigits: decimalsFor(symbol, value)
    });
  }

  function normalizeSide(rows, currentPrice, type) {
    if (!Array.isArray(rows)) return [];
    var output = [];
    rows.forEach(function (row) {
      if (!Array.isArray(row)) return;
      var price = finite(row[0]);
      var volume = finite(row[1]);
      if (price === null || volume === null || price <= 0 || volume <= 0) return;
      if (Number.isFinite(currentPrice) && currentPrice > 0) {
        if (type === 'support' && price > currentPrice * 1.003) return;
        if (type === 'resistance' && price < currentPrice * 0.997) return;
        if (Math.abs(price - currentPrice) / currentPrice > 0.10) return;
      }
      output.push({ price: price, volume: volume });
    });
    output.sort(function (a, b) { return a.price - b.price; });
    return output;
  }

  function averageTrueRange(candles, count) {
    if (!Array.isArray(candles) || candles.length < 2) return 0;
    var start = Math.max(1, candles.length - (count || 30));
    var ranges = [];
    for (var i = start; i < candles.length; i += 1) {
      var candle = candles[i] || {};
      var previous = candles[i - 1] || candle;
      var high = finite(candle.high);
      var low = finite(candle.low);
      var previousClose = finite(previous.close);
      if (high === null || low === null || previousClose === null) continue;
      ranges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
    }
    return median(ranges) || (ranges.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, ranges.length));
  }

  function bookTick(bookRows) {
    if (!Array.isArray(bookRows) || bookRows.length < 2) return 0;
    var gaps = [];
    for (var i = 1; i < bookRows.length; i += 1) {
      var a = finite(bookRows[i - 1] && bookRows[i - 1][0]);
      var b = finite(bookRows[i] && bookRows[i][0]);
      if (a !== null && b !== null && Math.abs(a - b) > 0) gaps.push(Math.abs(a - b));
    }
    return median(gaps);
  }

  function clusterCandidates(candidates, tolerance) {
    var sorted = candidates.filter(function (item) {
      return item && Number.isFinite(item.price) && Number.isFinite(item.score);
    }).sort(function (a, b) { return a.price - b.price; });
    var clusters = [];
    sorted.forEach(function (candidate) {
      var target = null;
      for (var i = clusters.length - 1; i >= 0; i -= 1) {
        if (Math.abs(clusters[i].price - candidate.price) <= tolerance) {
          target = clusters[i];
          break;
        }
        if (candidate.price - clusters[i].price > tolerance) break;
      }
      if (!target) {
        clusters.push({
          price: candidate.price,
          score: candidate.score,
          weight: candidate.weight || 1,
          volume: candidate.volume || 0,
          touches: candidate.touches || 1,
          source: candidate.source || 'market',
          sources: [candidate.source || 'market']
        });
        return;
      }
      var weight = Math.max(0.001, candidate.weight || 1);
      var totalWeight = target.weight + weight;
      target.price = (target.price * target.weight + candidate.price * weight) / totalWeight;
      target.weight = totalWeight;
      target.score = Math.max(target.score, candidate.score) + Math.min(12, candidate.score * 0.10);
      target.volume += candidate.volume || 0;
      target.touches += candidate.touches || 1;
      if (target.sources.indexOf(candidate.source || 'market') < 0) target.sources.push(candidate.source || 'market');
      target.source = target.sources.length > 1 ? 'confluence' : target.sources[0];
    });
    return clusters;
  }

  function bookCandidates(rows, type, currentPrice, tolerance) {
    if (!rows.length) return [];
    var volumes = rows.map(function (item) { return item.volume; });
    var q55 = percentile(volumes, 0.55);
    var maximum = Math.max.apply(Math, volumes.concat([1]));
    var medianVolume = median(volumes) || 1;
    var selected = rows.slice().sort(function (a, b) { return b.volume - a.volume; }).slice(0, 16);
    rows.forEach(function (item) {
      if (item.volume >= q55 && selected.indexOf(item) < 0) selected.push(item);
    });
    var candidates = selected.map(function (item) {
      var distance = Math.abs(item.price - currentPrice);
      var proximity = 1 / (1 + distance / Math.max(tolerance * 5, currentPrice * 0.0005));
      var volumeRatio = item.volume / Math.max(maximum, 1e-9);
      var relative = item.volume / Math.max(medianVolume, 1e-9);
      var score = 42 + Math.sqrt(volumeRatio) * 37 + Math.min(14, Math.max(0, relative - 1) * 7) + proximity * 7;
      return {
        price: item.price,
        score: clamp(score, 20, 100),
        weight: Math.max(1, item.volume),
        volume: item.volume,
        touches: 1,
        source: 'book',
        type: type
      };
    });
    return clusterCandidates(candidates, tolerance);
  }

  function pivotCandidates(candles, type, currentPrice, tolerance) {
    if (!Array.isArray(candles) || candles.length < 8) return [];
    var clean = candles.slice(-240).map(function (candle, index) {
      return {
        index: index,
        high: finite(candle && candle.high),
        low: finite(candle && candle.low),
        close: finite(candle && candle.close),
        volume: Math.max(0, finite(candle && candle.volume) || 0)
      };
    }).filter(function (candle) {
      return candle.high !== null && candle.low !== null && candle.close !== null;
    });
    if (clean.length < 8) return [];
    var medianVolume = median(clean.map(function (candle) { return candle.volume; })) || 1;
    var candidates = [];
    var radius = 2;
    for (var i = radius; i < clean.length - radius; i += 1) {
      var item = clean[i];
      var isPivot = true;
      for (var offset = 1; offset <= radius; offset += 1) {
        if (type === 'support' && (item.low > clean[i - offset].low || item.low > clean[i + offset].low)) isPivot = false;
        if (type === 'resistance' && (item.high < clean[i - offset].high || item.high < clean[i + offset].high)) isPivot = false;
      }
      if (!isPivot) continue;
      var price = type === 'support' ? item.low : item.high;
      if (type === 'support' && price >= currentPrice) continue;
      if (type === 'resistance' && price <= currentPrice) continue;
      var age = clean.length - 1 - i;
      var recency = 1 - Math.min(1, age / clean.length);
      var volumeBoost = Math.min(1.8, item.volume / Math.max(medianVolume, 1e-9));
      candidates.push({
        price: price,
        score: 42 + recency * 25 + volumeBoost * 10,
        weight: 1 + recency + volumeBoost * 0.5,
        volume: item.volume,
        touches: 1,
        source: 'swing',
        type: type
      });
    }
    return clusterCandidates(candidates, tolerance * 1.15).map(function (cluster) {
      cluster.score = clamp(cluster.score + Math.min(24, Math.max(0, cluster.touches - 1) * 7), 25, 98);
      return cluster;
    });
  }

  function chooseLevels(bookLevels, pivotLevels, type, currentPrice, tolerance, atr) {
    var combined = clusterCandidates(bookLevels.concat(pivotLevels), tolerance * 1.2).map(function (level) {
      var distance = Math.abs(level.price - currentPrice);
      var proximity = 1 / (1 + distance / Math.max(atr || tolerance * 8, tolerance * 5));
      var confluence = level.sources && level.sources.length > 1 ? 10 : 0;
      level.score = clamp(level.score + proximity * 8 + confluence, 20, 100);
      level.type = type;
      return level;
    }).filter(function (level) {
      return type === 'support' ? level.price < currentPrice : level.price > currentPrice;
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    var chosen = [];
    combined.forEach(function (candidate) {
      if (chosen.length >= MAX_PER_SIDE) return;
      var duplicate = chosen.some(function (selected) {
        return Math.abs(selected.price - candidate.price) <= tolerance * 1.4;
      });
      if (!duplicate) chosen.push(candidate);
    });

    var fallbackAtr = Math.max(atr || 0, tolerance * 8, currentPrice * 0.0015);
    var multipliers = type === 'support' ? [-0.75, -1.45, -2.25] : [0.75, 1.45, 2.25];
    for (var i = 0; chosen.length < MAX_PER_SIDE && i < multipliers.length; i += 1) {
      var fallbackPrice = currentPrice + fallbackAtr * multipliers[i];
      if (fallbackPrice <= 0) continue;
      var tooClose = chosen.some(function (selected) {
        return Math.abs(selected.price - fallbackPrice) <= tolerance * 1.4;
      });
      if (!tooClose) {
        chosen.push({
          price: fallbackPrice,
          score: Math.max(38, 58 - i * 7),
          weight: 1,
          volume: 0,
          touches: 1,
          source: 'structure',
          sources: ['structure'],
          type: type
        });
      }
    }

    chosen.sort(function (a, b) {
      return Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice);
    });
    chosen.forEach(function (level, index) {
      level.rank = index + 1;
      level.strength = Math.round(clamp(level.score, 1, 99));
    });
    return chosen.slice(0, MAX_PER_SIDE);
  }

  function calculateLevels(rt) {
    if (!rt) return null;
    var candles = typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : [];
    var book = typeof rt.getLatestOrderBook === 'function' ? rt.getLatestOrderBook() : null;
    var currentPrice = finite(typeof rt.getCurrentPrice === 'function' ? rt.getCurrentPrice() : rt.state && rt.state.currentPrice);
    if ((currentPrice === null || currentPrice <= 0) && Array.isArray(candles) && candles.length) {
      currentPrice = finite(candles[candles.length - 1] && candles[candles.length - 1].close);
    }
    if (currentPrice === null || currentPrice <= 0) return null;

    var bids = normalizeSide(book && book.bids, currentPrice, 'support');
    var asks = normalizeSide(book && book.asks, currentPrice, 'resistance');
    var atr = averageTrueRange(candles, 36);
    var tick = median([bookTick(book && book.bids), bookTick(book && book.asks)].filter(function (value) { return value > 0; }));
    var tolerance = Math.max(
      tick > 0 ? tick * 2.2 : 0,
      atr > 0 ? atr * 0.12 : 0,
      currentPrice * 0.00016,
      Math.pow(10, -decimalsFor(symbolOf(rt), currentPrice)) * 4
    );

    var supportBook = bookCandidates(bids, 'support', currentPrice, tolerance);
    var resistanceBook = bookCandidates(asks, 'resistance', currentPrice, tolerance);
    var supportPivots = pivotCandidates(candles, 'support', currentPrice, tolerance);
    var resistancePivots = pivotCandidates(candles, 'resistance', currentPrice, tolerance);

    var support = chooseLevels(supportBook, supportPivots, 'support', currentPrice, tolerance, atr);
    var resistance = chooseLevels(resistanceBook, resistancePivots, 'resistance', currentPrice, tolerance, atr);

    return {
      currentPrice: currentPrice,
      tolerance: tolerance,
      atr: atr,
      support: support,
      resistance: resistance,
      bidVolume: bids.reduce(function (sum, row) { return sum + row.volume; }, 0),
      askVolume: asks.reduce(function (sum, row) { return sum + row.volume; }, 0)
    };
  }

  function cleanChartActive() {
    return document.body.classList.contains('gp-clean-chart-active') || document.body.classList.contains('gp-clean-chart-visuals-only');
  }

  function enabled(rt) {
    var body = document.body;
    var chartTab = body && body.classList.contains('gp-dashboard-tab-chart');
    var chartButton = document.querySelector('[data-dashboard-tab="chart"].active');
    return !!(chartTab || chartButton);
  }

  function contextKey(rt) {
    return [symbolOf(rt), timeframeOf(rt), rt && rt.state && rt.state.exchange || ''].join('|');
  }

  function candlesOf(rt) {
    var candles = [];
    try { candles = typeof rt.getLatestKlines === 'function' ? rt.getLatestKlines() : []; } catch (_) {}
    if ((!Array.isArray(candles) || !candles.length) && rt && rt.chart && Array.isArray(rt.chart.lastCandleData)) candles = rt.chart.lastCandleData;
    return Array.isArray(candles) ? candles : [];
  }

  function currentPriceOf(rt) {
    var current = finite(typeof rt.getCurrentPrice === 'function' ? rt.getCurrentPrice() : rt && rt.state && rt.state.currentPrice);
    if ((current === null || current <= 0)) {
      var candles = candlesOf(rt);
      if (candles.length) current = finite(candles[candles.length - 1] && candles[candles.length - 1].close);
    }
    return current !== null && current > 0 ? current : null;
  }

  function latestCandleStructureKey(rt) {
    var candles = candlesOf(rt);
    if (!candles.length) return '';
    var last = candles[candles.length - 1] || {};
    var time = finite(last.time) || finite(last.openTime) || finite(last.t) || candles.length;
    return String(candles.length) + '|' + String(time);
  }

  function cloneLevel(level) {
    var copy = Object.assign({}, level || {});
    if (Array.isArray(level && level.sources)) copy.sources = level.sources.slice();
    return copy;
  }

  function cloneResult(result) {
    if (!result) return null;
    return {
      currentPrice: result.currentPrice,
      tolerance: result.tolerance || 0,
      atr: result.atr || 0,
      support: (result.support || []).map(cloneLevel),
      resistance: (result.resistance || []).map(cloneLevel),
      bidVolume: result.bidVolume || 0,
      askVolume: result.askVolume || 0
    };
  }

  function lockTolerance(rt, result) {
    var price = Math.abs(Number(result && result.currentPrice) || 0);
    var tick = Math.pow(10, -decimalsFor(symbolOf(rt), price || 1)) * 8;
    return Math.max(
      (result && result.tolerance || 0) * 3.25,
      (result && result.atr || 0) * 0.30,
      price * 0.00055,
      tick
    );
  }

  function nearestPreviousIndex(previous, targetPrice, used, tolerance, preferredIndex) {
    var best = -1;
    var bestDistance = Infinity;
    if (previous[preferredIndex] && !used[preferredIndex]) {
      var preferredDistance = Math.abs(previous[preferredIndex].price - targetPrice);
      if (preferredDistance <= tolerance * 1.35) return preferredIndex;
    }
    previous.forEach(function (item, index) {
      if (!item || used[index]) return;
      var distance = Math.abs(item.price - targetPrice);
      if (distance <= tolerance && distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  }

  function reconcileSide(rt, previousLevels, nextLevels, result, allowFresh) {
    var previous = Array.isArray(previousLevels) ? previousLevels : [];
    var next = Array.isArray(nextLevels) ? nextLevels : [];
    if (!previous.length) return next.map(cloneLevel).slice(0, MAX_PER_SIDE);
    var tolerance = lockTolerance(rt, result);
    var used = {};
    var output = [];

    for (var i = 0; i < MAX_PER_SIDE; i += 1) {
      var nextLevel = next[i];
      if (!nextLevel) {
        if (previous[i]) output.push(cloneLevel(previous[i]));
        continue;
      }
      var matchIndex = nearestPreviousIndex(previous, nextLevel.price, used, tolerance, i);
      if (matchIndex >= 0) {
        used[matchIndex] = true;
        var anchored = cloneLevel(nextLevel);
        anchored.price = previous[matchIndex].price;
        anchored.strength = Math.round(clamp((previous[matchIndex].strength || anchored.strength || 50) * 0.70 + (nextLevel.strength || 50) * 0.30, 1, 99));
        anchored.rank = i + 1;
        anchored.anchorLocked = true;
        output.push(anchored);
      } else if (allowFresh) {
        output.push(cloneLevel(nextLevel));
      } else if (previous[i]) {
        output.push(cloneLevel(previous[i]));
      }
    }

    for (var fill = 0; output.length < MAX_PER_SIDE && fill < previous.length; fill += 1) {
      if (!used[fill]) output.push(cloneLevel(previous[fill]));
    }

    output = output.slice(0, MAX_PER_SIDE);
    output.forEach(function (level, index) {
      level.rank = index + 1;
      level.strength = Math.round(clamp(level.strength || 50, 1, 99));
    });
    return output;
  }

  function stabilizeResult(rt, raw, forceFresh, structureChanged) {
    var fresh = cloneResult(raw);
    var previous = state.cachedResult || null;
    if (!fresh) return null;
    if (forceFresh || !previous || !previous.support.length || !previous.resistance.length) {
      state.lastCommitAt = Date.now();
      return fresh;
    }

    if (!structureChanged) {
      var held = cloneResult(previous);
      held.currentPrice = fresh.currentPrice;
      held.tolerance = fresh.tolerance;
      held.atr = fresh.atr;
      held.bidVolume = fresh.bidVolume;
      held.askVolume = fresh.askVolume;
      return held;
    }

    fresh.support = reconcileSide(rt, previous.support, fresh.support, fresh, true);
    fresh.resistance = reconcileSide(rt, previous.resistance, fresh.resistance, fresh, true);
    state.lastCommitAt = Date.now();
    return fresh;
  }

  function resultFromState(rt) {
    var result = cloneResult(state.cachedResult);
    if (!result && (state.levels.support.length || state.levels.resistance.length)) {
      result = { support: state.levels.support.map(cloneLevel), resistance: state.levels.resistance.map(cloneLevel), tolerance: 0, atr: 0, bidVolume: 0, askVolume: 0 };
    }
    if (!result) return null;
    var current = currentPriceOf(rt);
    if (current !== null) result.currentPrice = current;
    return result;
  }

  function removeLine(rt, line) {
    if (!line) return;
    try {
      if (rt && rt.chart && typeof rt.chart.removePriceLine === 'function') rt.chart.removePriceLine(line);
      else if (rt && rt.chart && rt.chart.candleSeries && typeof rt.chart.candleSeries.removePriceLine === 'function') rt.chart.candleSeries.removePriceLine(line);
    } catch (_) {}
  }

  function clearLines() {
    var rt = runtime();
    ['support', 'resistance'].forEach(function (side) {
      state.lines[side].forEach(function (line) { removeLine(rt, line); });
      state.lines[side] = [];
    });
    state.levels = { support: [], resistance: [] };
    state.cachedResult = null;
    state.overlaySignature = '';
    state.lastStructureKey = '';
    if (state.badge) state.badge.classList.remove('visible');
    clearOverlay();
  }

  function createLine(rt, side, index, price) {
    if (!rt || !rt.chart) return null;
    var color = side === 'support' ? '#00e5a8' : '#ff4f79';
    try {
      if (typeof rt.chart.addPriceLine === 'function') {
        return rt.chart.addPriceLine(price, {
          color: color,
          lineWidth: index === 0 ? 2 : 1,
          lineStyle: index === 0 ? 2 : 3,
          title: ''
        });
      }
      if (rt.chart.candleSeries && typeof rt.chart.candleSeries.createPriceLine === 'function') {
        return rt.chart.candleSeries.createPriceLine({
          price: price,
          color: color,
          lineWidth: index === 0 ? 2 : 1,
          lineStyle: index === 0 ? 2 : 3,
          lineVisible: true,
          axisLabelVisible: true,
          title: ''
        });
      }
    } catch (_) {}
    return null;
  }

  function ensureBadge(rt) {
    var chartArea = rt && rt.chartArea || document.getElementById('chart-area');
    if (!chartArea) return null;
    var badge = document.getElementById('gp-key-levels-live-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'gp-key-levels-live-badge';
      badge.className = 'gp-key-levels-live-badge';
      badge.setAttribute('aria-live', 'polite');
      chartArea.appendChild(badge);
    }
    state.badge = badge;
    return badge;
  }


  function chartParts(rt) {
    rt = rt || runtime();
    if (!rt || !rt.chart) return null;
    var wrapper = rt.chart;
    var chart = null;
    try { chart = typeof wrapper.getChartInstance === 'function' ? wrapper.getChartInstance() : wrapper.chart; } catch (_) {}
    chart = chart || wrapper.chart || null;
    var series = wrapper.candleSeries || null;
    var area = rt.chartArea || document.getElementById('chart-area');
    if (!area) return null;
    var timeScale = null;
    try { timeScale = chart && chart.timeScale && chart.timeScale(); } catch (_) {}
    return { rt: rt, wrapper: wrapper, chart: chart, series: series, timeScale: timeScale, area: area };
  }

  function plotMetrics(parts) {
    var area = parts && parts.area;
    var width = Math.max(1, area && (area.clientWidth || area.getBoundingClientRect().width) || 1);
    var height = Math.max(1, area && (area.clientHeight || area.getBoundingClientRect().height) || 1);
    var axisWidth = 0;
    var timeHeight = 0;
    try {
      var scale = parts.chart && parts.chart.priceScale && parts.chart.priceScale('right');
      if (scale && typeof scale.width === 'function') axisWidth = Math.max(0, Number(scale.width()) || 0);
    } catch (_) {}
    try {
      if (parts.timeScale && typeof parts.timeScale.height === 'function') timeHeight = Math.max(0, Number(parts.timeScale.height()) || 0);
    } catch (_) {}
    if (!timeHeight) timeHeight = 28;
    return {
      width: width,
      height: height,
      plotWidth: Math.max(40, width - axisWidth),
      plotHeight: Math.max(40, height - timeHeight),
      axisWidth: axisWidth,
      timeHeight: timeHeight
    };
  }

  function visibleCandles(rt) {
    var candles = [];
    candles = candlesOf(rt);
    var rows = candles.slice(-320).map(function (candle) {
      var high = finite(candle && candle.high);
      var low = finite(candle && candle.low);
      var close = finite(candle && candle.close);
      return high !== null && low !== null && close !== null && high > 0 && low > 0 ? { high: high, low: low, close: close } : null;
    }).filter(Boolean);
    return rows;
  }

  function fallbackPriceToY(rt, price, metrics) {
    var rows = visibleCandles(rt);
    var current = finite(typeof rt.getCurrentPrice === 'function' ? rt.getCurrentPrice() : rt.state && rt.state.currentPrice);
    var highs = rows.map(function (row) { return row.high; });
    var lows = rows.map(function (row) { return row.low; });
    if (current !== null) { highs.push(current); lows.push(current); }
    highs.push(price); lows.push(price);
    var high = Math.max.apply(Math, highs.filter(Number.isFinite).concat([price]));
    var low = Math.min.apply(Math, lows.filter(Number.isFinite).concat([price]));
    if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) {
      high = price * 1.01;
      low = price * 0.99;
    }
    var pad = Math.max((high - low) * 0.10, Math.abs(price) * 0.0008, 1e-9);
    high += pad;
    low -= pad;
    return ((high - price) / Math.max(1e-9, high - low)) * metrics.plotHeight;
  }

  function priceToY(parts, price, metrics) {
    var y = null;
    try {
      if (parts.series && typeof parts.series.priceToCoordinate === 'function') y = finite(parts.series.priceToCoordinate(price));
    } catch (_) {}
    if (y !== null) return y;
    try {
      if (parts.wrapper && typeof parts.wrapper.priceToCoordinate === 'function') y = finite(parts.wrapper.priceToCoordinate(price));
    } catch (_) {}
    if (y !== null) return y;
    return fallbackPriceToY(parts.rt, price, metrics);
  }

  function svgNode(name, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function ensureOverlay(rt) {
    var parts = chartParts(rt);
    if (!parts || !parts.area) return null;
    var overlay = document.getElementById('gp-key-levels-chart-overlay-v186');
    if (!overlay) {
      overlay = svgNode('svg', {
        id: 'gp-key-levels-chart-overlay-v186',
        class: 'gp-key-levels-chart-overlay-v186',
        'aria-hidden': 'true',
        focusable: 'false'
      });
      parts.area.appendChild(overlay);
    }
    state.overlay = overlay;
    if (!state.overlayResizeObserver && typeof ResizeObserver === 'function') {
      state.overlayResizeObserver = new ResizeObserver(function () { schedule(false, 24); });
      try { state.overlayResizeObserver.observe(parts.area); } catch (_) {}
    }
    return overlay;
  }

  function clearOverlay() {
    var overlay = state.overlay || document.getElementById('gp-key-levels-chart-overlay-v186');
    if (!overlay) return;
    try { overlay.replaceChildren(); } catch (_) { overlay.innerHTML = ''; }
    overlay.classList.remove('is-visible');
  }

  function estimateTextWidth(text, size) {
    return Math.max(46, String(text || '').length * (size || 7));
  }

  function drawOverlayLine(group, metrics, side, level, index, y, symbol) {
    var support = side === 'support';
    var color = support ? (index === 0 ? '#00f0b5' : '#00e5a8') : (index === 0 ? '#ff4f79' : '#ff7897');
    var dim = support ? 'rgba(0,229,168,.20)' : 'rgba(255,79,121,.20)';
    var plotRight = Math.max(80, metrics.plotWidth - 2);
    var label = (support ? 'KEY S' : 'KEY R') + (index + 1) + ' ' + (level.strength || 0) + '%';
    var price = formatPrice(level.price, symbol);
    var line = svgNode('line', {
      x1: '0', y1: y.toFixed(1), x2: String(plotRight), y2: y.toFixed(1),
      stroke: color,
      'stroke-width': index === 0 ? '1.65' : '1.1',
      'stroke-dasharray': index === 0 ? '7 5' : '4 5',
      opacity: index === 0 ? '.88' : '.64'
    });
    group.appendChild(line);

    var tagWidth = estimateTextWidth(label, 6.3) + 14;
    var tagX = Math.max(8, Math.min(plotRight - tagWidth - 92, plotRight - tagWidth - 104));
    var tag = svgNode('g', { transform: 'translate(' + tagX.toFixed(1) + ',' + (y - 11).toFixed(1) + ')' });
    tag.appendChild(svgNode('rect', { x: '0', y: '0', width: String(tagWidth), height: '22', rx: '7', fill: dim, stroke: color, 'stroke-opacity': '.52' }));
    var txt = svgNode('text', { x: '8', y: '14.5', fill: color, 'font-size': '10', 'font-weight': '900', 'font-family': 'Inter, Arial, sans-serif', 'letter-spacing': '.45' });
    txt.textContent = label;
    tag.appendChild(txt);
    group.appendChild(tag);

    var priceWidth = Math.max(68, estimateTextWidth(price, 6.1) + 16);
    var priceX = metrics.axisWidth > 34 ? metrics.plotWidth + 4 : Math.max(8, metrics.width - priceWidth - 6);
    if (priceX + priceWidth > metrics.width - 2) priceX = Math.max(8, metrics.width - priceWidth - 4);
    var priceTag = svgNode('g', { transform: 'translate(' + priceX.toFixed(1) + ',' + (y - 10).toFixed(1) + ')' });
    priceTag.appendChild(svgNode('rect', { x: '0', y: '0', width: String(priceWidth), height: '20', rx: '5', fill: color, opacity: '.88' }));
    var priceTxt = svgNode('text', { x: String(priceWidth / 2), y: '13.5', fill: '#fff', 'font-size': '10', 'font-weight': '950', 'font-family': 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace', 'text-anchor': 'middle' });
    priceTxt.textContent = price;
    priceTag.appendChild(priceTxt);
    group.appendChild(priceTag);
  }

  function updateOverlay(rt, result) {
    if (!result || !enabled(rt)) { clearOverlay(); return; }
    var parts = chartParts(rt);
    var overlay = ensureOverlay(rt);
    if (!parts || !overlay) return;
    var metrics = plotMetrics(parts);
    overlay.setAttribute('width', String(metrics.width));
    overlay.setAttribute('height', String(metrics.height));
    overlay.setAttribute('viewBox', '0 0 ' + metrics.width + ' ' + metrics.height);
    overlay.style.width = metrics.width + 'px';
    overlay.style.height = metrics.height + 'px';
    try { overlay.replaceChildren(); } catch (_) { overlay.innerHTML = ''; }

    var defs = svgNode('defs', {});
    var glow = svgNode('filter', { id: 'gp-kl-glow-v186', x: '-12%', y: '-220%', width: '124%', height: '540%' });
    glow.appendChild(svgNode('feGaussianBlur', { stdDeviation: '1.4', result: 'blur' }));
    var merge = svgNode('feMerge', {});
    merge.appendChild(svgNode('feMergeNode', { in: 'blur' }));
    merge.appendChild(svgNode('feMergeNode', { in: 'SourceGraphic' }));
    glow.appendChild(merge);
    defs.appendChild(glow);
    overlay.appendChild(defs);

    var group = svgNode('g', { filter: 'url(#gp-kl-glow-v186)' });
    var symbol = symbolOf(rt);
    var drawn = 0;
    ['resistance', 'support'].forEach(function (side) {
      (result[side] || []).forEach(function (level, index) {
        var y = priceToY(parts, level.price, metrics);
        if (!Number.isFinite(y) || y < -24 || y > metrics.plotHeight + 24) return;
        drawOverlayLine(group, metrics, side, level, index, y, symbol);
        drawn += 1;
      });
    });
    overlay.appendChild(group);
    overlay.classList.toggle('is-visible', drawn > 0);
  }

  function repaintOverlayFromState() {
    var rt = runtime();
    if (!rt || !enabled(rt)) { clearOverlay(); return; }
    var result = resultFromState(rt);
    if (!result || (!result.support.length && !result.resistance.length)) return;
    updateOverlay(rt, result);
  }

  function requestOverlayRepaint() {
    if (state.overlayFrame) return;
    var raf = window.requestAnimationFrame || function (callback) { return setTimeout(callback, 16); };
    state.overlayFrame = raf(function () {
      state.overlayFrame = 0;
      repaintOverlayFromState();
    });
  }

  function keepOverlaySynced(duration) {
    state.overlaySyncUntil = Date.now() + Math.max(120, duration || 700);
    requestOverlayRepaint();
    if (state.overlayLoop) return;
    var raf = window.requestAnimationFrame || function (callback) { return setTimeout(callback, 16); };
    var loop = function () {
      state.overlayLoop = 0;
      if (Date.now() <= state.overlaySyncUntil && enabled(runtime())) {
        repaintOverlayFromState();
        state.overlayLoop = raf(loop);
      }
    };
    state.overlayLoop = raf(loop);
  }

  function bindChartAreaInteractions(rt) {
    var area = rt && rt.chartArea || document.getElementById('chart-area');
    if (!area || area === state.interactionArea) return;
    state.interactionArea = area;
    var sync = function (event) {
      var type = event && event.type || '';
      keepOverlaySynced(type === 'pointerup' || type === 'mouseup' || type === 'touchend' ? 900 : 420);
    };
    ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'wheel', 'touchstart', 'touchmove', 'touchend'].forEach(function (name) {
      try { area.addEventListener(name, sync, { passive: true }); } catch (_) {}
    });
  }

  function wrapChartRefresh(rt) {
    if (!rt || !rt.chart || state.wrappedChart === rt.chart) return;
    state.wrappedChart = rt.chart;
    ['setData', 'updateCandle', 'resize', 'resetPriceScale'].forEach(function (method) {
      if (typeof rt.chart[method] !== 'function' || rt.chart[method].__gpKeyLevelsWrappedV186) return;
      var original = rt.chart[method];
      var wrapped = function () {
        var output = original.apply(this, arguments);
        if (method === 'setData' || method === 'resetPriceScale') schedule(true, method === 'setData' ? 90 : 24);
        else schedule(false, 24);
        keepOverlaySynced(method === 'resize' || method === 'resetPriceScale' ? 900 : 420);
        return output;
      };
      wrapped.__gpKeyLevelsWrappedV186 = true;
      try { rt.chart[method] = wrapped; } catch (_) {}
    });
  }

  function applySide(rt, side, levels) {
    var lines = state.lines[side];
    for (var i = 0; i < MAX_PER_SIDE; i += 1) {
      var level = levels[i];
      var line = lines[i];
      if (!level) {
        if (line && typeof line.applyOptions === 'function') {
          try { line.applyOptions({ lineVisible: false, axisLabelVisible: false, title: '' }); } catch (_) {}
        }
        continue;
      }
      if (!line) {
        line = createLine(rt, side, i, level.price);
        lines[i] = line;
      }
      if (!line || typeof line.applyOptions !== 'function') continue;
      var color = side === 'support' ? (i === 0 ? '#00f0b5' : 'rgba(0, 229, 168, 0.82)') : (i === 0 ? '#ff4f79' : 'rgba(255, 79, 121, 0.82)');
      var title = (side === 'support' ? 'KEY S' : 'KEY R') + (i + 1) + ' ' + level.strength + '%';
      try {
        line.applyOptions({
          price: level.price,
          color: color,
          lineWidth: i === 0 ? 2 : 1,
          lineStyle: i === 0 ? 2 : 3,
          lineVisible: true,
          axisLabelVisible: true,
          title: title
        });
      } catch (_) {}
    }
    state.lines[side] = lines;
  }

  function updateBadge(rt, result) {
    var badge = ensureBadge(rt);
    if (!badge) return;
    var symbol = symbolOf(rt);
    var support = result.support.slice(0, 2).map(function (level, index) {
      return '<span class="gp-kl-chip gp-kl-chip--support">S' + (index + 1) + ' ' + formatPrice(level.price, symbol) + '</span>';
    }).join('');
    var resistance = result.resistance.slice(0, 2).map(function (level, index) {
      return '<span class="gp-kl-chip gp-kl-chip--resistance">R' + (index + 1) + ' ' + formatPrice(level.price, symbol) + '</span>';
    }).join('');
    var badgeHtml = '<strong>KEY LEVELS</strong>' + support + resistance;
    if (badge.innerHTML !== badgeHtml) badge.innerHTML = badgeHtml;
    if (!badge.classList.contains('visible')) badge.classList.add('visible');
  }

  function formatVolume(value) {
    var number = Math.abs(Number(value) || 0);
    if (number >= 1e6) return (number / 1e6).toFixed(2) + 'M';
    if (number >= 1e3) return (number / 1e3).toFixed(2) + 'K';
    return number.toFixed(2);
  }

  function updateSummary(rt, result) {
    var container = document.getElementById('levels-summary');
    if (!container || !result) return;
    var symbol = symbolOf(rt);
    var ratio = result.askVolume > 0 ? result.bidVolume / result.askVolume : result.bidVolume > 0 ? 99 : 1;
    var count = document.getElementById('levels-count');
    var ratioNode = document.getElementById('stat-ratio');
    var supportNode = document.getElementById('stat-support');
    var resistanceNode = document.getElementById('stat-resistance');
    var supportList = document.getElementById('support-levels');
    var resistanceList = document.getElementById('resistance-levels');

    state.writingSummary = true;
    try {
      container.dataset.gpKeyLevelsV186 = 'true';
      var countText = String(result.support.length + result.resistance.length);
      if (count && count.textContent !== countText) count.textContent = countText;
      if (ratioNode) {
        var ratioText = Number.isFinite(ratio) ? ratio.toFixed(2) : '1.00';
        if (ratioNode.textContent !== ratioText) ratioNode.textContent = ratioText;
        ratioNode.classList.toggle('levels-summary__stat-value--positive', ratio > 1);
        ratioNode.classList.toggle('levels-summary__stat-value--negative', ratio < 1);
      }
      var supportText = result.support[0] ? formatPrice(result.support[0].price, symbol) + ' (' + result.support[0].strength + '%)' : '—';
      var resistanceText = result.resistance[0] ? formatPrice(result.resistance[0].price, symbol) + ' (' + result.resistance[0].strength + '%)' : '—';
      if (supportNode && supportNode.textContent !== supportText) supportNode.textContent = supportText;
      if (resistanceNode && resistanceNode.textContent !== resistanceText) resistanceNode.textContent = resistanceText;

      function rows(levels, side) {
        if (!levels.length) return '<div class="levels-summary__empty">Waiting for market structure...</div>';
        return levels.map(function (level, index) {
          var source = level.source === 'confluence' ? 'BOOK + SWING' : String(level.source || 'MARKET').toUpperCase();
          return '<div class="levels-summary__item gp-kl-summary-row gp-kl-summary-row--' + side + '">' +
            '<div class="levels-summary__item-info">' +
              '<span class="levels-summary__item-price">' + (side === 'support' ? 'S' : 'R') + (index + 1) + ' · ' + formatPrice(level.price, symbol) + '</span>' +
              '<span class="levels-summary__item-volume">' + (level.volume ? formatVolume(level.volume) : source) + '</span>' +
              '<span class="levels-summary__item-ratio">' + level.strength + '%</span>' +
            '</div>' +
            '<div class="levels-summary__strength-bar">' +
              '<div class="levels-summary__strength-fill levels-summary__strength-fill--' + side + '" style="width:' + level.strength + '%"></div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
      var supportHtml = rows(result.support, 'support');
      var resistanceHtml = rows(result.resistance, 'resistance');
      if (supportList && supportList.innerHTML !== supportHtml) supportList.innerHTML = supportHtml;
      if (resistanceList && resistanceList.innerHTML !== resistanceHtml) resistanceList.innerHTML = resistanceHtml;
    } finally {
      state.writingSummary = false;
    }
  }

  function materiallyChanged(previous, next, tolerance) {
    if (!previous || previous.length !== next.length) return true;
    for (var i = 0; i < next.length; i += 1) {
      if (Math.abs((previous[i] && previous[i].price || 0) - next[i].price) > tolerance * 0.35) return true;
      if (Math.abs((previous[i] && previous[i].strength || 0) - next[i].strength) >= 8) return true;
    }
    return false;
  }

  function render(force) {
    state.scheduled = 0;
    var rt = runtime();
    if (!rt || !rt.chart || !rt.toolState) return;
    state.runtime = rt;
    wrapChartRefresh(rt);
    bindChartAreaInteractions(rt);

    var key = contextKey(rt);
    if (key !== state.contextKey) {
      clearLines();
      state.contextKey = key;
      force = true;
    }

    if (!enabled(rt)) {
      if (state.lines.support.length || state.lines.resistance.length || state.overlay) clearLines();
      return;
    }

    var now = Date.now();
    if (!force && now - state.lastRenderAt < 240) {
      requestOverlayRepaint();
      return;
    }
    state.lastRenderAt = now;

    var structureKey = latestCandleStructureKey(rt);
    var structureChanged = !!(structureKey && structureKey !== state.lastStructureKey);
    var hasCached = !!(state.cachedResult && state.cachedResult.support.length && state.cachedResult.resistance.length);
    var shouldCalculate = !!force || !hasCached || structureChanged || now - state.lastCalculationAt > 60000;

    if (!shouldCalculate) {
      var heldResult = resultFromState(rt);
      if (heldResult) {
        updateBadge(rt, heldResult);
        updateOverlay(rt, heldResult);
        updateSummary(rt, heldResult);
      }
      return;
    }

    var raw = calculateLevels(rt);
    state.lastCalculationAt = now;
    if (!raw || !raw.support.length || !raw.resistance.length) {
      if (now - state.lastGoodAt > 6000) clearLines();
      return;
    }
    state.lastGoodAt = now;

    var result = stabilizeResult(rt, raw, !!force || !hasCached, structureChanged);
    if (!result) return;
    if (structureKey) state.lastStructureKey = structureKey;
    state.cachedResult = cloneResult(result);

    var changed = force || materiallyChanged(state.levels.support, result.support, result.tolerance) || materiallyChanged(state.levels.resistance, result.resistance, result.tolerance);
    if (changed) {
      applySide(rt, 'support', result.support);
      applySide(rt, 'resistance', result.resistance);
      state.levels = { support: result.support.map(cloneLevel), resistance: result.resistance.map(cloneLevel) };
    }
    updateBadge(rt, result);
    updateOverlay(rt, result);
    updateSummary(rt, result);

    try {
      window.dispatchEvent(new CustomEvent('guardeer:key-levels-updated', {
        detail: { version: VERSION, symbol: symbolOf(rt), timeframe: timeframeOf(rt), levels: state.levels }
      }));
    } catch (_) {}
  }

  function schedule(force, delay) {
    if (force && state.scheduled) {
      clearTimeout(state.scheduled);
      state.scheduled = 0;
    }
    if (state.scheduled) return;
    state.scheduled = setTimeout(function () { render(!!force); }, Math.max(0, delay || 0));
  }

  function bindSummaryObserver() {
    var container = document.getElementById('levels-summary');
    if (!container || state.summaryObserver) return;
    state.summaryObserver = new MutationObserver(function () {
      if (state.writingSummary) return;
      var rt = runtime();
      if (enabled(rt) && state.levels.support.length && state.levels.resistance.length) schedule(false, 20);
    });
    state.summaryObserver.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function bindChart(rt) {
    if (!rt || !rt.chart) return;
    bindChartAreaInteractions(rt);
    if (rt.chart.__gpKeyLevelsBoundV186) return;
    rt.chart.__gpKeyLevelsBoundV186 = true;
    try {
      var chart = rt.chart.getChartInstance && rt.chart.getChartInstance();
      var timeScale = chart && chart.timeScale && chart.timeScale();
      var handler = function () { if (enabled(runtime())) { schedule(false, 16); keepOverlaySynced(420); } };
      if (timeScale && typeof timeScale.subscribeVisibleLogicalRangeChange === 'function') {
        timeScale.subscribeVisibleLogicalRangeChange(handler);
        state.chartSubscriptions.push({ target: timeScale, method: 'unsubscribeVisibleLogicalRangeChange', handler: handler });
      }
      if (timeScale && typeof timeScale.subscribeVisibleTimeRangeChange === 'function') {
        timeScale.subscribeVisibleTimeRangeChange(handler);
        state.chartSubscriptions.push({ target: timeScale, method: 'unsubscribeVisibleTimeRangeChange', handler: handler });
      }
      if (chart && typeof chart.subscribeCrosshairMove === 'function') {
        var crosshairHandler = function () { if (enabled(runtime())) keepOverlaySynced(360); };
        chart.subscribeCrosshairMove(crosshairHandler);
        state.chartSubscriptions.push({ target: chart, method: 'unsubscribeCrosshairMove', handler: crosshairHandler });
      }
      wrapChartRefresh(rt);
    } catch (_) {}
  }

  function injectStyles() {
    if (document.getElementById('gp-key-levels-live-v186-styles')) return;
    var style = document.createElement('style');
    style.id = 'gp-key-levels-live-v186-styles';
    style.textContent = [
      '#chart-area{position:relative;}',
      '.gp-key-levels-live-badge{position:absolute;left:12px;top:12px;z-index:46;display:flex;align-items:center;gap:6px;max-width:calc(100% - 110px);padding:6px 8px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(5,10,18,.78);box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(9px);opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .16s ease,transform .16s ease;pointer-events:none;font:800 10px/1.1 Inter,Arial,sans-serif;white-space:nowrap;overflow:hidden;}',
      '.gp-key-levels-live-badge.visible{opacity:1;visibility:visible;transform:translateY(0);}',
      '.gp-key-levels-live-badge>strong{color:#e8f7ff;letter-spacing:.08em;}',
      '#gp-key-levels-chart-overlay-v186{position:absolute;inset:0;z-index:67;display:block;pointer-events:none;overflow:visible;opacity:0;visibility:hidden;transition:opacity .14s ease;}',
      '#gp-key-levels-chart-overlay-v186.is-visible{opacity:1;visibility:visible;}',
      'body.gp-clean-chart-active #gp-key-levels-chart-overlay-v186,body.gp-clean-chart-visuals-only #gp-key-levels-chart-overlay-v186{opacity:0!important;visibility:hidden!important;}',
      '.gp-kl-chip{display:inline-flex;padding:3px 6px;border-radius:7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:900;}',
      '.gp-kl-chip--support{color:#70ffd2;background:rgba(0,229,168,.12);border:1px solid rgba(0,229,168,.28);}',
      '.gp-kl-chip--resistance{color:#ff9ab2;background:rgba(255,79,121,.12);border:1px solid rgba(255,79,121,.28);}',
      '#levels-summary[data-gp-key-levels-v186="true"] .levels-summary__item-price{font-weight:800;}',
      '#levels-summary[data-gp-key-levels-v186="true"] .gp-kl-summary-row--support{border-left:2px solid rgba(0,229,168,.72);}',
      '#levels-summary[data-gp-key-levels-v186="true"] .gp-kl-summary-row--resistance{border-left:2px solid rgba(255,79,121,.72);}',
      '@media(max-width:760px){.gp-key-levels-live-badge{left:8px;top:8px;gap:4px;padding:5px 6px;max-width:calc(100% - 76px)}.gp-key-levels-live-badge .gp-kl-chip:nth-of-type(n+3){display:none;}}'
    ].join('');
    document.head.appendChild(style);
  }


  function setRuntimeLevelsOn(rt) {
    try {
      rt = rt || runtime();
      if (rt && rt.runtime && rt.runtime.chart) rt = rt.runtime;
      if (rt && rt.toolState) {
        rt.toolState.levels = true;
        rt.toolState.keyLevels = true;
      }
    } catch (_) {}
  }

  function setKeyLevelsButtonsOn() {
    ['#tool-levels-toggle', '[data-tv-action="toggleLevels"]'].forEach(function (selector) {
      var node = document.querySelector(selector);
      if (!node) return;
      node.classList.add('active');
      node.setAttribute('aria-pressed', 'true');
      if (selector === '#tool-levels-toggle') node.textContent = 'ON';
    });
    document.body && document.body.classList.add('gp-key-levels-active', 'gp-key-levels-live-active');
  }

  function enableInitialKeyLevels() {
    if (state.initialOffDone) return;
    state.initialOffDone = true;
    [0, 80, 240, 650, 1300].forEach(function (delay) {
      setTimeout(function () {
        if (state.userToggled) return;
        setRuntimeLevelsOn(runtime());
        setKeyLevelsButtonsOn();
        bindChart(runtime());
      }, delay);
    });
  }

  function bindGlobal() {
    injectStyles();
    bindSummaryObserver();
    enableInitialKeyLevels();

    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest && event.target.closest('#tool-levels-toggle,[data-tv-action="toggleLevels"]');
      if (!target) return;
      state.userToggled = true;
      state.lastCalculationAt = 0;
      state.lastGoodAt = 0;
      [0, 35, 100, 220, 480, 900].forEach(function (delay) {
        setTimeout(function () {
          bindChart(runtime());
          if (enabled(runtime())) schedule(true, 0);
          else clearLines();
        }, delay);
      });
    }, true);

    ['guardeer:orderbook-live-tick', 'guardeer:forexgold-live-tick', 'guardeer:market-snapshot'].forEach(function (name) {
      window.addEventListener(name, function () {
        state.lastCalculationAt = 0;
        schedule(true, 30);
      }, { passive: true });
    });
    ['guardeer:terminal-visibility-changed', 'guardeer:chart-layout-stabilized'].forEach(function (name) {
      window.addEventListener(name, function () { schedule(false, 30); }, { passive: true });
    });

    window.addEventListener('guardeer:prime-runtime-ready', function (event) {
      state.runtime = event && event.detail || window.GuardeerPrimeRuntime || null;
      if (state.runtime && state.runtime.runtime && state.runtime.runtime.chart) state.runtime = state.runtime.runtime;
      bindChart(state.runtime);
      bindSummaryObserver();
      if (enabled(state.runtime)) schedule(true, 40);
    }, { passive: true });

    window.addEventListener('resize', function () { schedule(false, 80); }, { passive: true });
    window.addEventListener('orientationchange', function () { schedule(false, 220); }, { passive: true });

    var bodyObserver = new MutationObserver(function () { schedule(false, 30); });
    if (document.body) bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    state.timer = setInterval(function () {
      var rt = runtime();
      if (rt) bindChart(rt);
      bindSummaryObserver();
      schedule(false, 0);
    }, 850);

    if (window.GuardeerPrimeRuntime) {
      state.runtime = window.GuardeerPrimeRuntime;
      bindChart(state.runtime);
      enableInitialKeyLevels();
      if (enabled(state.runtime)) schedule(true, 60);
    }
  }

  var api = {
    version: VERSION,
    refresh: function () { schedule(true, 0); },
    clear: clearLines,
    getLevels: function () {
      return {
        support: state.levels.support.map(function (item) { return Object.assign({}, item); }),
        resistance: state.levels.resistance.map(function (item) { return Object.assign({}, item); })
      };
    }
  };

  window.GuardeerKeyLevelsV186 = api;
  window.GuardeerKeyLevelsV185 = api;
  window.GuardeerKeyLevelsV122 = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindGlobal, { once: true });
  else bindGlobal();
})();
