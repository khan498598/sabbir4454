(function () {
  'use strict';
  if (window.__GP_MODULE5_LAUNCHER_V1__) return;
  window.__GP_MODULE5_LAUNCHER_V1__ = true;

  var VERSION = 'r386-all-module-history-navigation-v1';
  var BUILD = 'r386-all-module-history-navigation-v1';
  var KNOWN_CRYPTO = ['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','TRX','SUI','PEPE'];
  var timer = 0, observer = null, stopTimer = 0;
  var overlay = null, refreshTimer = 0;
  function qs(selector, root) { return (root || document).querySelector(selector); }
  function cleanSymbol(value) { return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); }
  function cleanExchange(value) { var text = String(value || '').toLowerCase(); if (text.indexOf('okx') >= 0) return 'okx'; if (text.indexOf('bybit') >= 0) return 'bybit'; if (text.indexOf('binance') >= 0) return 'binance'; if (/forex|gold|massive|polygon/.test(text)) return 'forexgold'; return ''; }
  function normalizeTimeframe(value) { var text = String(value || '5m').trim(); if (/^\d+$/.test(text)) text += 'm'; if (/^1H$/i.test(text)) text = '1h'; return /^(1m|3m|5m|15m|1h)$/.test(text) ? text : '5m'; }
  function runtime() { try { var root = window.GuardeerPrimeRuntime; return root && (root.runtime || root); } catch (_) { return null; } }
  function readMarket() {
    var rt = runtime(), rtState = rt && rt.state || {}, symbolNode = qs('#symbol-label,[data-symbol-label],.symbol-display,#gp-overview-symbol');
    var symbol = cleanSymbol(rtState.symbol || (symbolNode && symbolNode.textContent) || 'XAUUSD'), exchange = cleanExchange(rtState.exchange || rtState.market || rtState.provider || '');
    if (!exchange && (/(USDT|USDC|BUSD)$/.test(symbol) || (/USD$/.test(symbol) && KNOWN_CRYPTO.indexOf(symbol.slice(0,-3)) >= 0))) exchange = 'binance';
    if (!exchange) exchange = 'forexgold';
    var tfNode = qs('.timeframe-btn.active,[data-tf].active,#timeframe-select,#header-timeframe-select,[data-timeframe-select]');
    return { symbol: symbol || 'XAUUSD', exchange: exchange, timeframe: normalizeTimeframe(rtState.timeframe || (tfNode && (tfNode.value || tfNode.getAttribute('data-tf') || tfNode.textContent)) || '5m') };
  }
  function isCrypto(market) { var symbol = cleanSymbol(market && market.symbol); return market && market.exchange !== 'forexgold' && (/(USDT|USDC|BUSD)$/.test(symbol) || KNOWN_CRYPTO.indexOf(symbol.replace(/USD$/, '')) >= 0); }
  function moduleUrl() { return '#module5-cvd-analysis'; }
  function format(value) { value = Number(value) || 0; var abs = Math.abs(value), sign = value < 0 ? '-' : ''; if (abs >= 1000000) return sign + (abs / 1000000).toFixed(2) + 'M'; if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'K'; return sign + abs.toFixed(2); }
  function calculate() {
    var footprint = window.GPModule2Footprint, cumulative = window.GPModule1CumulativeDelta;
    var state = footprint && footprint.state;
    var rows = state && Array.isArray(state.candles) ? state.candles.slice(-48) : [];
    var rt = runtime(), rtState = rt && rt.state || {};
    if (rt && typeof rt.getLatestKlines === 'function' && rtState.symbol && isCrypto({ symbol: rtState.symbol, exchange: rtState.exchange })) {
      var runtimeRows = rt.getLatestKlines() || [];
      rows = runtimeRows.slice(-48).map(function (row) {
        var volume = Number(row.volume) || 0;
        var takerBuy = Number(row.takerBuyBaseVolume);
        var delta = Number.isFinite(takerBuy) ? takerBuy * 2 - volume : 0;
        return { close: row.close, delta: delta };
      });
      state = { symbol: rtState.symbol, timeframe: rtState.timeframe };
    }
    if (!rows.length && cumulative && cumulative.state && Array.isArray(cumulative.state.candles)) {
      state = cumulative.state;
      rows = state.candles.slice(-48);
    }
    if (!rows.length && cumulative && cumulative.state && Array.isArray(cumulative.state.priceCandles)) {
      state = cumulative.state;
      rows = state.priceCandles.slice(-48);
    }
    var cvd = 0, anchored = 0, previous = rows.length ? Number(rows[0].close) || 0 : 0;
    rows.forEach(function (row) { var delta = Number(row.delta); if (!Number.isFinite(delta)) delta = (Number(row.buy) || 0) - (Number(row.sell) || 0); cvd += delta; anchored += delta; });
    var lastRow = rows.length ? rows[rows.length - 1] : null;
    var firstRow = rows.length ? rows[0] : null;
    var firstClose = firstRow && (firstRow.close != null ? firstRow.close : firstRow.closePrice);
    var lastClose = lastRow && (lastRow.close != null ? lastRow.close : lastRow.closePrice);
    previous = Number(firstClose) || 0;
    var last = Number(lastClose) || 0;
    var priceChange = last - previous;
    var divergence = rows.length >= 2 && ((priceChange > 0 && cvd < 0) || (priceChange < 0 && cvd > 0));
    return { rows: rows.length, cvd: cvd, anchored: anchored, priceChange: priceChange, divergence: divergence, symbol: state && state.symbol || readMarket().symbol, timeframe: state && state.timeframe || readMarket().timeframe };
  }
  function render() {
    if (!overlay) return;
    var data = calculate();
    var nodes = { cvd: qs('[data-m5="cvd"]', overlay), anchored: qs('[data-m5="anchored"]', overlay), move: qs('[data-m5="move"]', overlay), divergence: qs('[data-m5="divergence"]', overlay), bars: qs('[data-m5="bars"]', overlay) };
    if (nodes.cvd) nodes.cvd.textContent = format(data.cvd);
    if (nodes.anchored) nodes.anchored.textContent = format(data.anchored);
    if (nodes.move) nodes.move.textContent = (data.priceChange >= 0 ? '+' : '') + format(data.priceChange);
    if (nodes.divergence) { nodes.divergence.textContent = data.divergence ? 'DETECTED' : 'NONE'; nodes.divergence.style.color = data.divergence ? '#ff9a37' : '#00ef63'; }
    if (nodes.bars) nodes.bars.textContent = String(data.rows);
  }
  function closeInline() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = 0; if (overlay) overlay.remove(); overlay = null; }
  function openInline() {
    var market = readMarket();
    if (!isCrypto(market)) return null;
    closeInline(); closePopover();
    overlay = document.createElement('section'); overlay.className = 'gp-module5-inline'; overlay.setAttribute('role', 'dialog'); overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(3,7,10,.95);color:#edf7f5;padding:clamp(18px,4vw,48px);overflow:auto;font:15px/1.45 Segoe UI,sans-serif;';
    overlay.innerHTML = '<div style="max-width:980px;margin:0 auto;border:1px solid rgba(224,241,245,.16);background:#10161b;padding:clamp(18px,3vw,34px)"><header style="display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid rgba(224,241,245,.14);padding-bottom:20px"><div><span style="color:#24e6d2;font:800 12px/1 Segoe UI;letter-spacing:.14em">PRIME ORDERFLOW WORKSPACE</span><h2 style="margin:12px 0 0;font-size:clamp(26px,4vw,44px)">MODULE-5 Price × CVD Analysis</h2><p style="margin:8px 0 0;color:#8ea2a8">' + market.symbol + ' · ' + market.exchange.toUpperCase() + ' · <select data-m5-timeframe style="background:#0b1114;color:#edf7f5;border:1px solid #60727a;padding:4px"><option>1m</option><option>3m</option><option>5m</option><option>15m</option><option>1h</option></select> · last 48 candles</p></div><button type="button" data-m5-close style="background:transparent;color:#edf7f5;border:1px solid #60727a;padding:10px 14px;cursor:pointer">Close</button></header><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:24px"><article style="padding:18px;border-top:3px solid #00ef63;background:#0b1114"><small>CVD</small><strong data-m5="cvd" style="display:block;margin-top:10px;font-size:28px">0</strong></article><article style="padding:18px;border-top:3px solid #24e6d2;background:#0b1114"><small>ANCHORED DELTA</small><strong data-m5="anchored" style="display:block;margin-top:10px;font-size:28px">0</strong></article><article style="padding:18px;border-top:3px solid #ff9a37;background:#0b1114"><small>PRICE MOVE</small><strong data-m5="move" style="display:block;margin-top:10px;font-size:28px">0</strong></article></div><div style="margin-top:12px;padding:18px;background:#0b1114;color:#8ea2a8">Divergence: <strong data-m5="divergence" style="color:#00ef63">NONE</strong> · Calculation window: <strong data-m5="bars">0</strong> candles</div><p style="color:#8ea2a8;font-size:12px">CVD = Σ(Buy volume − Sell volume). Anchored delta uses the same selected 48-candle window. Divergence is flagged when price direction and cumulative delta direction disagree.</p></div>';
    document.body.appendChild(overlay);
    var timeframeSelect = qs('[data-m5-timeframe]', overlay);
    if (timeframeSelect) {
      timeframeSelect.value = market.timeframe;
      timeframeSelect.addEventListener('change', function () {
        var rt = runtime();
        if (rt && typeof rt.switchTimeframe === 'function') rt.switchTimeframe(timeframeSelect.value);
        render();
      });
    }
    overlay.addEventListener('click', function (event) { if (event.target.closest('[data-m5-close]')) closeInline(); }); render(); refreshTimer = setInterval(render, 2000); return overlay;
  }
  function ensure() {
    var grid = qs('#gp-step44-prime-tools-popover .gp-step44-prime-tools-popover__grid'); if (!grid) return null;
    var launcher = qs('[data-gp-module5-open]', grid); if (launcher && launcher.tagName !== 'A') { var replacement = document.createElement('a'); launcher.replaceWith(replacement); launcher = replacement; } if (!launcher) launcher = document.createElement('a');
    launcher.className = 'gp-step44-prime-tools-action gp-module5-prime-card'; launcher.setAttribute('data-gp-module5-open','true'); launcher.setAttribute('href',moduleUrl()); launcher.removeAttribute('target'); launcher.setAttribute('aria-label','Open MODULE-5 CVD Analysis'); launcher.setAttribute('aria-haspopup','dialog');
    if (!qs('[data-gp-module5-launcher-title]',launcher)) launcher.innerHTML = '<span>CVD</span><div><strong data-gp-module5-launcher-title>MODULE-5 CVD Analysis</strong><small>Price/CVD divergence and precise anchored delta measurement.</small></div><em>Open</em>';
    var predecessor = qs('[data-gp-module4-open]',grid) || qs('[data-gp-module3-open]',grid) || qs('[data-gp-module2-open]',grid) || qs('[data-gp-module1-open]',grid);
    if (predecessor) { if (predecessor.nextSibling !== launcher) grid.insertBefore(launcher, predecessor.nextSibling); } else if (launcher.parentElement !== grid) grid.appendChild(launcher);
    return launcher;
  }
  function closePopover() { var popover = qs('#gp-step44-prime-tools-popover'); if (popover) popover.classList.remove('is-open','is-dragging'); if (document.body) document.body.classList.remove('gp-step44-prime-tools-open'); var top = qs('[data-gp-step44-top-nav="prime-tools"]'); if (top) { top.classList.remove('is-open'); top.setAttribute('aria-expanded','false'); } }
  function openWindow() { return openInline(); }
  function schedule(delay) { if (timer) return; timer = setTimeout(function(){ timer=0; ensure(); }, delay == null ? 24 : delay); }
  function observe() { if (observer) observer.disconnect(); if (!document.body || typeof MutationObserver !== 'function') return; observer = new MutationObserver(function(){ schedule(24); }); observer.observe(document.body,{childList:true,subtree:true}); clearTimeout(stopTimer); stopTimer=setTimeout(function(){ if(observer) observer.disconnect(); observer=null; },5000); }
  function click(event) { var target = event.target && (event.target.nodeType === 1 ? event.target : event.target.parentElement); if (!target) return; if (target.closest('[data-gp-step44-top-nav="prime-tools"]')) { observe(); schedule(0); return; } var launcher = target.closest('[data-gp-module5-open]'); if (!launcher) return; if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); event.stopPropagation(); openWindow(); }
  function start(){ensure();observe();document.addEventListener('click',click,true);['guardeer:market-quick-switch','guardeer:prime-runtime-ready'].forEach(function(name){window.addEventListener(name,function(){schedule(0);});});[120,500,1200,2400,4800].forEach(function(delay){setTimeout(schedule,delay,0);});}
  window.GPModule5Launcher={version:VERSION,sync:ensure,url:moduleUrl,open:openWindow,openInline:openInline,close:closeInline}; if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
