(() => {
  'use strict';

  // ── Config ───────────────────────────────────────────────
  const API = window.location.origin;
  const WS_RECONNECT_MS = 3000;
  const REFRESH_INTERVAL = 30000;
  const MARKETS_PER_PAGE = 24;

  // ── DOM Refs ─────────────────────────────────────────────
  const $app     = document.getElementById('app');
  const $content = document.getElementById('content');
  const $stats   = document.getElementById('stats-bar');
  const $nav     = document.getElementById('nav');
  const $wsDot   = document.getElementById('ws-dot');
  const $wsLabel = document.getElementById('ws-label');
  const $botName = document.getElementById('active-bot-name');
  const $botBal  = document.getElementById('active-bot-balance');
  const $regModal = document.getElementById('register-modal');

  // ── State ────────────────────────────────────────────────
  let currentView    = 'markets';
  let marketPage     = 0;
  let marketSearch   = '';
  let marketCategory = '';
  let marketsCache   = null;
  let categoriesCache = null;
  let ws = null;

  // Bot state persisted in localStorage
  let activeBotId   = localStorage.getItem('claw_bot_id') || null;
  let activeBotName = localStorage.getItem('claw_bot_name') || null;

  // ── API Helpers ──────────────────────────────────────────
  async function api(path, opts) {
    const headers = { 'Content-Type': 'application/json' };
    if (activeBotId) headers['X-Bot-Id'] = activeBotId;
    const res = await fetch(`${API}/api${path}`, { ...opts, headers: { ...headers, ...(opts?.headers || {}) } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function apiPost(path, body) {
    return api(path, { method: 'POST', body: JSON.stringify(body) });
  }

  // ── Formatting ───────────────────────────────────────────
  function usd(microcents) {
    if (microcents === null || microcents === undefined) return '$0.00';
    return '$' + (microcents / 1_000_000).toFixed(2);
  }

  function usdShort(microcents) {
    const val = microcents / 1_000_000;
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000) return '$' + (val / 1_000).toFixed(1) + 'K';
    return '$' + val.toFixed(2);
  }

  function pct(val) {
    if (val === null || val === undefined) return '—';
    return (val * 100).toFixed(1) + '%';
  }

  function pctInt(val) {
    return Math.round(val * 100) + '%';
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
    return Math.floor(diff / 86_400_000) + 'd ago';
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function truncId(id) {
    return id ? id.slice(0, 8) + '...' : '—';
  }

  // ── WebSocket ────────────────────────────────────────────
  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${proto}//${location.host}/api/ws`);
    } catch { return; }

    ws.onopen = () => {
      $wsDot.classList.add('connected');
      $wsLabel.textContent = 'Live';
    };

    ws.onclose = () => {
      $wsDot.classList.remove('connected');
      $wsLabel.textContent = 'Reconnecting...';
      setTimeout(connectWs, WS_RECONNECT_MS);
    };

    ws.onerror = () => {};

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleWsEvent(msg);
      } catch {}
    };
  }

  function handleWsEvent(msg) {
    if (msg.event === 'trade') {
      // Update stats bar always
      loadStats();
      if (currentView === 'markets') debouncedLoadMarkets();
      if (currentView === 'leaderboard') loadLeaderboard();
    }
    if (msg.event === 'price-update') {
      if (currentView === 'markets') debouncedLoadMarkets();
    }
  }

  let _marketTimer = null;
  function debouncedLoadMarkets() {
    if (_marketTimer) return;
    _marketTimer = setTimeout(() => { _marketTimer = null; loadMarkets(); }, 2000);
  }

  // ── Stats Bar ────────────────────────────────────────────
  async function loadStats() {
    try {
      const [treasury, mData] = await Promise.all([
        api('/treasury'),
        api('/markets?limit=1'),
      ]);

      const totalMarkets = mData.total || 0;
      const feesCollected = treasury.totalFeesCollected || 0;
      const treasuryBal = treasury.treasuryBalance || 0;
      const feeRate = treasury.feeRate || 0.02;

      $stats.innerHTML = `
        <div class="stat-card"><div class="stat-label">Active Markets</div><div class="stat-value">${totalMarkets.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-label">Treasury</div><div class="stat-value green">${usd(treasuryBal)}</div></div>
        <div class="stat-card"><div class="stat-label">Fees Collected</div><div class="stat-value">${usd(feesCollected)}</div></div>
        <div class="stat-card"><div class="stat-label">Fee Rate</div><div class="stat-value">${(feeRate * 100).toFixed(1)}%</div></div>
      `;
    } catch {
      // silent
    }
  }

  // ── Bot Selector ─────────────────────────────────────────
  function updateBotSelector() {
    if (activeBotId) {
      $botName.textContent = activeBotName || 'Bot';
      refreshBotBalance();
    } else {
      $botName.textContent = 'No bot';
      $botBal.textContent = '';
    }
  }

  async function refreshBotBalance() {
    if (!activeBotId) return;
    try {
      const data = await api(`/bots/${activeBotId}/balance`);
      $botBal.textContent = usd(data.balance);
    } catch {
      $botBal.textContent = '';
    }
  }

  document.getElementById('bot-selector').onclick = () => {
    if (activeBotId) {
      navigate('bot');
    } else {
      openRegisterModal();
    }
  };

  // ── Bot Registration Modal ───────────────────────────────
  function openRegisterModal() {
    $regModal.style.display = 'flex';
    document.getElementById('register-bot-name').value = '';
    document.getElementById('register-result').innerHTML = '';
    setTimeout(() => document.getElementById('register-bot-name').focus(), 100);
  }

  window.closeRegisterModal = () => {
    $regModal.style.display = 'none';
  };

  window.registerBot = async () => {
    const name = document.getElementById('register-bot-name').value.trim();
    const $result = document.getElementById('register-result');
    if (!name) {
      $result.innerHTML = '<div class="alert alert-error">Enter a bot name</div>';
      return;
    }

    $result.innerHTML = '<div class="loading" style="padding:10px">Creating bot...</div>';

    try {
      const data = await apiPost('/bots/register', { name });
      activeBotId = data.botId;
      activeBotName = name;
      localStorage.setItem('claw_bot_id', activeBotId);
      localStorage.setItem('claw_bot_name', activeBotName);
      updateBotSelector();

      $result.innerHTML = `
        <div class="alert alert-success">
          ${data.existing ? 'Welcome back!' : 'Bot created!'} Balance: ${usd(data.balance)}<br>
          <span style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">Wallet: ${data.walletAddress}</span>
        </div>
      `;

      setTimeout(() => {
        closeRegisterModal();
        navigate('bot');
      }, 1500);
    } catch (err) {
      $result.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    }
  };

  // Enter key in register input
  document.getElementById('register-bot-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') registerBot();
  });

  // ── Navigation ───────────────────────────────────────────
  window.navigate = function(view, data) {
    currentView = view;
    $nav.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    loadStats();

    switch (view) {
      case 'markets':
        marketPage = 0;
        loadMarkets();
        break;
      case 'leaderboard':
        loadLeaderboard();
        break;
      case 'treasury':
        loadTreasury();
        break;
      case 'bot':
        loadBotPanel();
        break;
      case 'market-detail':
        loadMarketDetail(data);
        break;
    }
  };

  $nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (btn) navigate(btn.dataset.view);
  });

  // ── Markets View ─────────────────────────────────────────
  async function loadCategories() {
    if (categoriesCache) return categoriesCache;
    try {
      const data = await api('/markets/meta/categories');
      categoriesCache = data.categories || [];
      return categoriesCache;
    } catch {
      return [];
    }
  }

  async function loadMarkets() {
    if (currentView !== 'markets') return;

    const isFirstLoad = !marketsCache;
    if (isFirstLoad) {
      $content.innerHTML = '<div class="loading">Loading markets...</div>';
    }

    try {
      const cats = await loadCategories();
      const params = new URLSearchParams({
        limit: String(MARKETS_PER_PAGE),
        offset: String(marketPage * MARKETS_PER_PAGE),
      });
      if (marketSearch) params.set('search', marketSearch);
      if (marketCategory) params.set('category', marketCategory);

      const data = await api(`/markets?${params}`);
      const markets = data.markets || [];
      const total = data.total || 0;
      marketsCache = data;

      renderMarketsView(markets, total, cats);
    } catch (err) {
      $content.innerHTML = `<div class="empty">Failed to load markets: ${escHtml(err.message)}</div>`;
    }
  }

  function renderMarketsView(markets, total, categories) {
    const totalPages = Math.ceil(total / MARKETS_PER_PAGE);

    let html = `
      <div class="search-bar">
        <input class="search-input" id="market-search" type="text" placeholder="Search markets..." value="${escHtml(marketSearch)}">
        <button class="btn btn-accent btn-sm" onclick="doMarketSearch()">Search</button>
        ${marketSearch ? '<button class="btn btn-ghost btn-sm" onclick="clearSearch()">Clear</button>' : ''}
      </div>
    `;

    // Category chips
    if (categories.length > 0) {
      html += '<div class="category-filters">';
      html += `<button class="chip ${!marketCategory ? 'active' : ''}" onclick="filterCategory('')">All</button>`;
      for (const cat of categories.slice(0, 20)) {
        html += `<button class="chip ${marketCategory === cat ? 'active' : ''}" onclick="filterCategory('${escHtml(cat)}')">${escHtml(cat)}</button>`;
      }
      html += '</div>';
    }

    if (markets.length === 0) {
      html += `<div class="empty">${marketSearch || marketCategory ? 'No markets match your filters.' : 'No markets yet. Waiting for Polymarket sync...'}</div>`;
    } else {
      html += '<div class="markets-grid">';
      for (const m of markets) {
        const priceYes = m.poly_price_yes || m.price_yes || 0.5;
        const priceNo = m.poly_price_no || m.price_no || 0.5;

        html += `
          <div class="market-card" onclick="navigate('market-detail','${m.id}')">
            <div class="market-title">${escHtml(m.title)}</div>
            <div class="market-prices">
              <div class="price-pill yes">YES ${pctInt(priceYes)}</div>
              <div class="price-pill no">NO ${pctInt(priceNo)}</div>
            </div>
            ${m.poly_price_yes ? `<div class="poly-ref">Poly ref: <span>${pct(m.poly_price_yes)}</span></div>` : ''}
            <div class="market-meta">
              <span>${m.volume_total > 0 ? 'Vol: ' + usdShort(m.volume_total) : 'No trades yet'}</span>
              <span>${m.category || 'Uncategorized'}</span>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    // Pagination
    if (totalPages > 1) {
      html += '<div class="pagination">';
      html += `<button class="page-btn" ${marketPage === 0 ? 'disabled' : ''} onclick="marketPrev()">&larr; Prev</button>`;

      const startPage = Math.max(0, marketPage - 2);
      const endPage = Math.min(totalPages, startPage + 5);
      for (let i = startPage; i < endPage; i++) {
        html += `<button class="page-btn ${i === marketPage ? 'active' : ''}" onclick="gotoPage(${i})">${i + 1}</button>`;
      }

      html += `<button class="page-btn" ${marketPage >= totalPages - 1 ? 'disabled' : ''} onclick="marketNext()"">Next &rarr;</button>`;
      html += `<span style="color:var(--text-dim);font-size:12px;padding:6px">${total.toLocaleString()} markets</span>`;
      html += '</div>';
    }

    $content.innerHTML = html;

    // Search enter key
    document.getElementById('market-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doMarketSearch();
    });
  }

  window.doMarketSearch = () => {
    marketSearch = document.getElementById('market-search')?.value?.trim() || '';
    marketPage = 0;
    loadMarkets();
  };

  window.clearSearch = () => {
    marketSearch = '';
    marketPage = 0;
    loadMarkets();
  };

  window.filterCategory = (cat) => {
    marketCategory = cat;
    marketPage = 0;
    loadMarkets();
  };

  window.gotoPage = (p) => { marketPage = p; loadMarkets(); };
  window.marketPrev = () => { if (marketPage > 0) { marketPage--; loadMarkets(); } };
  window.marketNext = () => { marketPage++; loadMarkets(); };

  // ── Market Detail View ───────────────────────────────────
  async function loadMarketDetail(marketId) {
    if (!marketId) { navigate('markets'); return; }

    $content.innerHTML = '<div class="loading">Loading market...</div>';

    try {
      const [detail, ammPrices, tradesData] = await Promise.all([
        api(`/markets/${marketId}`),
        api(`/amm/price/${marketId}`).catch(() => null),
        api(`/markets/${marketId}/trades?limit=20`),
      ]);

      const m = detail.market;
      const ob = detail.orderbook;
      const trades = tradesData.trades || [];

      renderMarketDetail(m, ob, ammPrices, trades);
    } catch (err) {
      $content.innerHTML = `<div class="empty">Failed to load market: ${escHtml(err.message)}</div>`;
    }
  }

  function renderMarketDetail(m, ob, ammPrices, trades) {
    const priceYes = m.poly_price_yes || m.price_yes || 0.5;
    const priceNo = m.poly_price_no || m.price_no || 0.5;

    let html = `
      <button class="back-btn" onclick="navigate('markets')">&larr; Back to Markets</button>
      <div class="market-detail">
        <div class="market-detail-main">
          <div>
            <div class="detail-title">${escHtml(m.title)}</div>
            <div class="detail-prices">
              <div class="price-pill yes">YES ${pct(priceYes)}</div>
              <div class="price-pill no">NO ${pct(priceNo)}</div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-dim);margin-top:4px">
              <span>Vol: ${usdShort(m.volume_total)}</span>
              <span>Category: ${m.category || 'None'}</span>
              <span>Status: <span class="badge ${m.status === 'active' ? 'badge-green' : 'badge-accent'}">${m.status}</span></span>
              ${m.end_date ? `<span>Ends: ${new Date(m.end_date).toLocaleDateString()}</span>` : ''}
              ${m.resolution ? `<span>Resolution: <strong style="color:var(--green)">${m.resolution.toUpperCase()}</strong></span>` : ''}
            </div>
            ${m.description ? `<p style="color:var(--text-dim);font-size:13px;margin-top:8px;line-height:1.5">${escHtml(m.description).slice(0, 300)}</p>` : ''}
          </div>

          ${ammPrices ? renderAmmPrices(ammPrices) : ''}

          <div class="panel">
            <h4>Orderbook — YES</h4>
            ${renderOrderbook(ob.yes)}
          </div>

          <div class="panel">
            <h4>Orderbook — NO</h4>
            ${renderOrderbook(ob.no)}
          </div>

          <div class="panel">
            <h4>Recent Trades</h4>
            ${trades.length === 0 ? '<div class="ob-empty">No trades yet</div>' : renderTradeTable(trades)}
          </div>
        </div>

        <div class="market-detail-sidebar">
          ${renderTradeForm(m)}
        </div>
      </div>
    `;

    $content.innerHTML = html;
    initTradeForm(m);
  }

  function renderAmmPrices(amm) {
    if (!amm?.amm) return '';
    const a = amm.amm;
    return `
      <div class="panel">
        <h4>AMM Prices (Instant Fill)</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
          <div>
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">YES</div>
            <div style="display:flex;gap:8px">
              <span class="badge badge-green">Buy ${pct(a.yes.buyPrice)}</span>
              <span class="badge badge-red">Sell ${pct(a.yes.sellPrice)}</span>
            </div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">NO</div>
            <div style="display:flex;gap:8px">
              <span class="badge badge-green">Buy ${pct(a.no.buyPrice)}</span>
              <span class="badge badge-red">Sell ${pct(a.no.sellPrice)}</span>
            </div>
          </div>
        </div>
        ${amm.polyReference?.yes ? `
          <div style="font-size:11px;color:var(--text-dim);margin-top:8px">
            Polymarket ref: YES ${pct(amm.polyReference.yes)} / NO ${pct(amm.polyReference.no)}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderOrderbook(book) {
    const bids = book.bids || [];
    const asks = book.asks || [];

    if (bids.length === 0 && asks.length === 0) {
      return '<div class="ob-empty">Empty — trades go through AMM</div>';
    }

    let html = '';
    // Asks (reversed so highest at top)
    for (const a of asks.slice(0, 5).reverse()) {
      html += `<div class="ob-row ob-ask"><span class="ob-price">${pct(a.price)}</span><span class="ob-size">${usd(a.size)}</span></div>`;
    }
    html += '<div style="text-align:center;padding:2px 0;color:var(--text-dimmer);font-size:11px">— spread —</div>';
    // Bids
    for (const b of bids.slice(0, 5)) {
      html += `<div class="ob-row ob-bid"><span class="ob-price">${pct(b.price)}</span><span class="ob-size">${usd(b.size)}</span></div>`;
    }
    return html;
  }

  function renderTradeTable(trades) {
    let html = '<div style="max-height:300px;overflow:auto">';
    for (const t of trades) {
      const sideClass = t.outcome === 'yes' ? 'badge-green' : 'badge-red';
      html += `
        <div class="trade-row">
          <span><span class="badge ${sideClass}">${t.outcome.toUpperCase()}</span></span>
          <span style="font-family:var(--mono)">${pct(t.price)}</span>
          <span style="font-family:var(--mono)">${usd(t.size)}</span>
          <span style="color:var(--text-dim)">${timeAgo(t.created_at)}</span>
        </div>
      `;
    }
    html += '</div>';
    return html;
  }

  // ── Trade Form ───────────────────────────────────────────
  function renderTradeForm(m) {
    if (m.status !== 'active') {
      return `
        <div class="trade-panel">
          <h4>Trading</h4>
          <div class="ob-empty">
            Market is ${m.status}${m.resolution ? ` — resolved: ${m.resolution.toUpperCase()}` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="trade-panel">
        <h4>Trade</h4>
        ${!activeBotId ? `
          <div style="text-align:center;padding:20px 0">
            <p style="color:var(--text-dim);margin-bottom:12px">Register a bot to start trading</p>
            <button class="btn btn-accent" onclick="openRegisterModal()">Register Bot</button>
          </div>
        ` : `
          <div class="trade-tabs">
            <button class="trade-tab active-buy" id="trade-buy-tab" onclick="setTradeSide('buy')">Buy</button>
            <button class="trade-tab" id="trade-sell-tab" onclick="setTradeSide('sell')">Sell</button>
          </div>

          <div class="outcome-tabs">
            <button class="outcome-tab active-yes" id="outcome-yes-tab" onclick="setTradeOutcome('yes')">Yes</button>
            <button class="outcome-tab" id="outcome-no-tab" onclick="setTradeOutcome('no')">No</button>
          </div>

          <div class="trade-field">
            <label>Amount (shares in USDC)</label>
            <input class="input" id="trade-amount" type="number" min="0.01" step="0.01" value="1.00" placeholder="1.00">
          </div>

          <div class="trade-field">
            <label>Limit Price (0.01 — 0.99)</label>
            <input class="input" id="trade-price" type="number" min="0.01" max="0.99" step="0.01" value="" placeholder="Market price via AMM">
          </div>

          <div class="trade-cost" id="trade-cost-display">
            Cost estimate: <span>—</span>
          </div>

          <button class="btn btn-buy" id="trade-submit-btn" data-market-id="${m.id}" onclick="submitTrade()">
            Buy YES
          </button>

          <div id="trade-result" style="margin-top:10px"></div>
        `}
      </div>

      ${activeBotId ? `
        <div class="panel">
          <h4>Your Position</h4>
          <div id="market-position">
            <div class="loading" style="padding:10px">Loading...</div>
          </div>
        </div>
      ` : ''}
    `;
  }

  let _tradeSide = 'buy';
  let _tradeOutcome = 'yes';

  function initTradeForm(m) {
    _tradeSide = 'buy';
    _tradeOutcome = 'yes';
    updateTradeDisplay();
    if (activeBotId) loadMarketPosition(m.id);

    // Attach input listeners for cost estimate
    document.getElementById('trade-amount')?.addEventListener('input', updateTradeDisplay);
    document.getElementById('trade-price')?.addEventListener('input', updateTradeDisplay);
  }

  window.setTradeSide = (side) => {
    _tradeSide = side;
    document.getElementById('trade-buy-tab').className = `trade-tab ${side === 'buy' ? 'active-buy' : ''}`;
    document.getElementById('trade-sell-tab').className = `trade-tab ${side === 'sell' ? 'active-sell' : ''}`;
    updateTradeDisplay();
  };

  window.setTradeOutcome = (outcome) => {
    _tradeOutcome = outcome;
    document.getElementById('outcome-yes-tab').className = `outcome-tab ${outcome === 'yes' ? 'active-yes' : ''}`;
    document.getElementById('outcome-no-tab').className = `outcome-tab ${outcome === 'no' ? 'active-no' : ''}`;
    updateTradeDisplay();
  };

  function updateTradeDisplay() {
    const $btn = document.getElementById('trade-submit-btn');
    const $cost = document.getElementById('trade-cost-display');
    if (!$btn) return;

    const amount = parseFloat(document.getElementById('trade-amount')?.value || '0');
    const price = parseFloat(document.getElementById('trade-price')?.value || '0');
    const outLabel = _tradeOutcome.toUpperCase();

    if (_tradeSide === 'buy') {
      $btn.className = 'btn btn-buy';
      $btn.textContent = `Buy ${outLabel}`;
      if (price > 0 && amount > 0) {
        const cost = amount * price * 1_000_000;
        const fee = cost * 0.02;
        $cost.innerHTML = `Cost: <span>${usd(cost + fee)}</span> (incl. 2% fee)`;
      } else if (amount > 0) {
        $cost.innerHTML = `<span>Leave price empty for AMM market order</span>`;
      } else {
        $cost.innerHTML = `Cost estimate: <span>—</span>`;
      }
    } else {
      $btn.className = 'btn btn-sell';
      $btn.textContent = `Sell ${outLabel}`;
      if (price > 0 && amount > 0) {
        const proceeds = amount * price * 1_000_000;
        const fee = proceeds * 0.02;
        $cost.innerHTML = `Proceeds: <span>${usd(proceeds - fee)}</span> (after 2% fee)`;
      } else {
        $cost.innerHTML = `<span>Leave price empty for AMM market order</span>`;
      }
    }
  }

  window.submitTrade = async () => {
    const $btn = document.getElementById('trade-submit-btn');
    const $result = document.getElementById('trade-result');
    const marketId = $btn?.dataset.marketId;

    if (!activeBotId) {
      $result.innerHTML = '<div class="alert alert-error">Register a bot first</div>';
      return;
    }

    const amountUsdc = parseFloat(document.getElementById('trade-amount')?.value || '0');
    const priceVal = parseFloat(document.getElementById('trade-price')?.value || '0');

    if (amountUsdc <= 0) {
      $result.innerHTML = '<div class="alert alert-error">Enter a valid amount</div>';
      return;
    }

    const size = Math.floor(amountUsdc * 1_000_000); // Convert to microcents
    const hasPrice = priceVal > 0 && priceVal < 1;

    $btn.disabled = true;
    $btn.textContent = 'Placing order...';
    $result.innerHTML = '';

    try {
      const order = {
        marketId,
        side: _tradeSide,
        outcome: _tradeOutcome,
        size,
        orderType: hasPrice ? 'limit' : 'market',
      };
      if (hasPrice) order.price = priceVal;

      const data = await apiPost('/orders', order);

      const filled = data.totalFilled || 0;
      const fees = data.totalFees || 0;

      $result.innerHTML = `
        <div class="alert alert-success">
          Order ${data.status}! Filled: ${usd(filled)}, Fees: ${usd(fees)}
        </div>
      `;

      refreshBotBalance();
      loadMarketPosition(marketId);
      loadStats();
    } catch (err) {
      $result.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    } finally {
      $btn.disabled = false;
      updateTradeDisplay();
    }
  };

  async function loadMarketPosition(marketId) {
    const $pos = document.getElementById('market-position');
    if (!$pos || !activeBotId) return;

    try {
      const data = await api(`/bots/${activeBotId}/portfolio`);
      const positions = (data.positions || []).filter(p => p.market_id === marketId && p.shares > 0);

      if (positions.length === 0) {
        $pos.innerHTML = '<div style="color:var(--text-dim);font-size:12px">No position in this market</div>';
        return;
      }

      let html = '';
      for (const p of positions) {
        const currentPrice = p.outcome === 'yes' ? p.price_yes : p.price_no;
        const unrealized = Math.floor(p.shares * (currentPrice - p.avg_price));
        const pnlClass = unrealized >= 0 ? 'pnl-pos' : 'pnl-neg';

        html += `
          <div class="trade-row">
            <span><span class="badge ${p.outcome === 'yes' ? 'badge-green' : 'badge-red'}">${p.outcome.toUpperCase()}</span></span>
            <span style="font-family:var(--mono)">${usd(p.shares)} shares</span>
            <span style="font-family:var(--mono)">avg ${pct(p.avg_price)}</span>
            <span class="${pnlClass}">${unrealized >= 0 ? '+' : ''}${usd(unrealized)}</span>
          </div>
        `;
      }
      $pos.innerHTML = html;
    } catch {
      $pos.innerHTML = '<div style="color:var(--text-dim);font-size:12px">—</div>';
    }
  }

  // ── Leaderboard View ─────────────────────────────────────
  async function loadLeaderboard() {
    $content.innerHTML = '<div class="loading">Loading leaderboard...</div>';

    try {
      const data = await api('/leaderboard?limit=50');
      const leaders = data.leaderboard || [];

      if (leaders.length === 0) {
        $content.innerHTML = `
          <div class="section-header">
            <div><div class="section-title">Bot Leaderboard</div><div class="section-subtitle">Ranked by total P&L</div></div>
          </div>
          <div class="empty">
            No bots registered yet.
            <br><button class="btn btn-accent btn-sm" style="margin-top:12px" onclick="openRegisterModal()">Register Your Bot</button>
          </div>
        `;
        return;
      }

      let html = `
        <div class="section-header">
          <div><div class="section-title">Bot Leaderboard</div><div class="section-subtitle">${leaders.length} bots ranked by P&L</div></div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Bot</th>
              <th>Total P&L</th>
              <th>Realized</th>
              <th>Unrealized</th>
              <th>Trades</th>
              <th>Volume</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const bot of leaders) {
        // Skip the house bot from display
        if (bot.id === '__HOUSE__') continue;

        const pnlClass = bot.total_pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
        const isActive = bot.id === activeBotId;

        html += `
          <tr ${isActive ? 'style="background:var(--accent-dim)"' : ''}>
            <td class="rank">#${bot.rank}</td>
            <td>${escHtml(bot.name)} ${isActive ? '<span class="badge badge-accent">You</span>' : ''}</td>
            <td class="${pnlClass}">${bot.total_pnl >= 0 ? '+' : ''}${usd(bot.total_pnl)}</td>
            <td class="mono">${usd(bot.realized_pnl)}</td>
            <td class="mono">${usd(bot.unrealized_pnl)}</td>
            <td class="mono">${bot.trade_count}</td>
            <td class="mono">${usdShort(bot.total_volume)}</td>
            <td class="mono">${usd(bot.balance_usdc)}</td>
          </tr>
        `;
      }

      html += '</tbody></table>';
      $content.innerHTML = html;
    } catch (err) {
      $content.innerHTML = `<div class="empty">Failed to load leaderboard: ${escHtml(err.message)}</div>`;
    }
  }

  // ── Treasury View ────────────────────────────────────────
  async function loadTreasury() {
    $content.innerHTML = '<div class="loading">Loading treasury...</div>';

    try {
      const [stats, entriesData] = await Promise.all([
        api('/treasury'),
        api('/treasury/entries'),
      ]);

      const entries = entriesData.entries || [];

      let html = `
        <div class="treasury-section">
          <div class="section-header">
            <div class="section-title">Treasury</div>
          </div>
          <div class="treasury-grid">
            <div class="stat-card">
              <div class="stat-label">Total Fees Collected</div>
              <div class="stat-value green">${usd(stats.totalFeesCollected || 0)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Treasury Balance</div>
              <div class="stat-value">${usd(stats.treasuryBalance || 0)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">On-Chain USDC</div>
              <div class="stat-value">${stats.onChainBalance || '0'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Wallet Address</div>
              <div class="stat-value" style="font-size:10px;font-family:var(--mono);word-break:break-all">${stats.walletAddress || 'Not configured'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Fee Rate</div>
              <div class="stat-value">${((stats.feeRate || 0.02) * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Trades</div>
              <div class="stat-value">${stats.totalTrades || 0}</div>
            </div>
          </div>
      `;

      if (entries.length > 0) {
        html += `
          <div style="margin-top:16px">
            <h4 style="font-size:14px;margin-bottom:10px;color:var(--text-dim)">Recent Fee Collections</h4>
            <table class="data-table">
              <thead><tr><th>Time</th><th>Fee Amount</th><th>Running Balance</th></tr></thead>
              <tbody>
        `;
        for (const e of entries.slice(0, 30)) {
          html += `
            <tr>
              <td>${new Date(e.created_at).toLocaleString()}</td>
              <td class="pnl-pos mono">+${usd(e.amount)}</td>
              <td class="mono">${usd(e.balance_after)}</td>
            </tr>
          `;
        }
        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty" style="margin-top:16px">No fees collected yet. Trading generates fees!</div>';
      }

      html += '</div>';
      $content.innerHTML = html;
    } catch (err) {
      $content.innerHTML = `<div class="empty">Failed to load treasury: ${escHtml(err.message)}</div>`;
    }
  }

  // ── Bot Panel View ───────────────────────────────────────
  async function loadBotPanel() {
    if (!activeBotId) {
      $content.innerHTML = `
        <div class="empty">
          <div style="font-size:48px;margin-bottom:16px">🦞</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px">No Bot Connected</div>
          <p style="color:var(--text-dim);margin-bottom:20px">Register a bot to start trading on ClawMarket</p>
          <button class="btn btn-accent" onclick="openRegisterModal()">Register Bot</button>
        </div>
      `;
      return;
    }

    $content.innerHTML = '<div class="loading">Loading bot data...</div>';

    try {
      const [portfolio, tradesData] = await Promise.all([
        api(`/bots/${activeBotId}/portfolio`),
        api(`/bots/${activeBotId}/trades?limit=30`),
      ]);

      const bot = portfolio.bot;
      const positions = portfolio.positions || [];
      const pnl = portfolio.pnl;
      const trades = tradesData.trades || [];

      let html = `
        <div class="section-header">
          <div>
            <div class="section-title">${escHtml(bot.name)}</div>
            <div class="section-subtitle" style="font-family:var(--mono);font-size:11px">${bot.walletAddress}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="showDepositDialog()">Deposit</button>
            <button class="btn btn-ghost btn-sm" onclick="disconnectBot()" style="color:var(--red)">Disconnect</button>
          </div>
        </div>

        <div class="bot-panel">
          <div class="bot-card">
            <h4>Balance & P&L</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
              <div>
                <div style="color:var(--text-dim);font-size:11px">USDC Balance</div>
                <div style="font-size:20px;font-weight:700;font-family:var(--mono);color:var(--green)">${usd(bot.balance)}</div>
              </div>
              <div>
                <div style="color:var(--text-dim);font-size:11px">Total P&L</div>
                <div class="${pnl.total >= 0 ? 'pnl-pos' : 'pnl-neg'}" style="font-size:20px;font-weight:700">${pnl.total >= 0 ? '+' : ''}${usd(pnl.total)}</div>
              </div>
              <div>
                <div style="color:var(--text-dim);font-size:11px">Realized</div>
                <div class="mono" style="font-size:14px">${usd(pnl.realized)}</div>
              </div>
              <div>
                <div style="color:var(--text-dim);font-size:11px">Unrealized</div>
                <div class="mono" style="font-size:14px">${usd(pnl.unrealized)}</div>
              </div>
            </div>
          </div>

          <div class="bot-card">
            <h4>Statistics</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
              <div>
                <div style="color:var(--text-dim);font-size:11px">Total Trades</div>
                <div style="font-size:20px;font-weight:700;font-family:var(--mono)">${portfolio.tradeCount}</div>
              </div>
              <div>
                <div style="color:var(--text-dim);font-size:11px">Open Positions</div>
                <div style="font-size:20px;font-weight:700;font-family:var(--mono)">${positions.length}</div>
              </div>
              <div>
                <div style="color:var(--text-dim);font-size:11px">Auto-Trade</div>
                <div style="font-size:14px;font-weight:600">${bot.autoTrade ? '<span style="color:var(--green)">ON</span>' : '<span style="color:var(--red)">OFF</span>'}</div>
              </div>
              <div>
                <div style="color:var(--text-dim);font-size:11px">Bot ID</div>
                <div style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">${truncId(bot.id)}</div>
              </div>
            </div>
          </div>
        </div>

        <div id="deposit-dialog" style="display:none;margin:14px 0">
          <div class="panel">
            <h4>Deposit Funds</h4>
            <div style="display:flex;gap:8px;margin-top:8px">
              <input class="input" id="deposit-amount" type="number" min="1" step="1" placeholder="Amount in USDC" style="flex:1">
              <button class="btn btn-accent btn-sm" onclick="doDeposit()">Deposit</button>
            </div>
            <div id="deposit-result" style="margin-top:8px"></div>
          </div>
        </div>
      `;

      // Positions table
      if (positions.length > 0) {
        html += `
          <div class="panel" style="margin-top:14px">
            <h4>Open Positions</h4>
            <table class="data-table">
              <thead>
                <tr><th>Market</th><th>Side</th><th>Shares</th><th>Avg Price</th><th>Current</th><th>Unrealized P&L</th></tr>
              </thead>
              <tbody>
        `;

        for (const p of positions) {
          const currentPrice = p.outcome === 'yes' ? p.price_yes : p.price_no;
          const unrealized = Math.floor(p.shares * (currentPrice - p.avg_price));
          const pnlClass = unrealized >= 0 ? 'pnl-pos' : 'pnl-neg';

          html += `
            <tr style="cursor:pointer" onclick="navigate('market-detail','${p.market_id}')">
              <td>${escHtml((p.market_title || '').slice(0, 60))}${(p.market_title || '').length > 60 ? '...' : ''}</td>
              <td><span class="badge ${p.outcome === 'yes' ? 'badge-green' : 'badge-red'}">${p.outcome.toUpperCase()}</span></td>
              <td class="mono">${usd(p.shares)}</td>
              <td class="mono">${pct(p.avg_price)}</td>
              <td class="mono">${pct(currentPrice)}</td>
              <td class="${pnlClass}">${unrealized >= 0 ? '+' : ''}${usd(unrealized)}</td>
            </tr>
          `;
        }
        html += '</tbody></table></div>';
      }

      // Trade history
      if (trades.length > 0) {
        html += `
          <div class="panel" style="margin-top:14px">
            <h4>Recent Trades</h4>
            <table class="data-table">
              <thead>
                <tr><th>Time</th><th>Market</th><th>Side</th><th>Outcome</th><th>Price</th><th>Size</th><th>Fee</th><th>Role</th></tr>
              </thead>
              <tbody>
        `;

        for (const t of trades) {
          const isBuy = t.role === 'taker'; // taker typically initiates
          html += `
            <tr>
              <td>${timeAgo(t.created_at)}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml((t.market_title || '').slice(0, 50))}</td>
              <td><span class="badge ${isBuy ? 'badge-green' : 'badge-red'}">${isBuy ? 'BUY' : 'SELL'}</span></td>
              <td>${t.outcome.toUpperCase()}</td>
              <td class="mono">${pct(t.price)}</td>
              <td class="mono">${usd(t.size)}</td>
              <td class="mono" style="color:var(--text-dim)">${usd(t.fee_amount)}</td>
              <td style="color:var(--text-dim)">${t.role}</td>
            </tr>
          `;
        }
        html += '</tbody></table></div>';
      } else {
        html += '<div class="empty" style="margin-top:14px">No trades yet. Go find a market to trade!</div>';
      }

      $content.innerHTML = html;
    } catch (err) {
      $content.innerHTML = `<div class="empty">Failed to load bot data: ${escHtml(err.message)}</div>`;
    }
  }

  window.showDepositDialog = () => {
    const $d = document.getElementById('deposit-dialog');
    if ($d) {
      $d.style.display = $d.style.display === 'none' ? 'block' : 'none';
      if ($d.style.display === 'block') {
        document.getElementById('deposit-amount')?.focus();
      }
    }
  };

  window.doDeposit = async () => {
    const amount = parseFloat(document.getElementById('deposit-amount')?.value || '0');
    const $result = document.getElementById('deposit-result');

    if (amount <= 0) {
      $result.innerHTML = '<div class="alert alert-error">Enter a valid amount</div>';
      return;
    }

    try {
      const data = await apiPost(`/bots/${activeBotId}/deposit`, { amount });
      $result.innerHTML = `<div class="alert alert-success">Deposited $${amount.toFixed(2)}! New balance: ${usd(data.newBalance)}</div>`;
      refreshBotBalance();
      setTimeout(() => loadBotPanel(), 1500);
    } catch (err) {
      $result.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    }
  };

  window.disconnectBot = () => {
    if (!confirm('Disconnect this bot? You can reconnect by registering with the same name.')) return;
    activeBotId = null;
    activeBotName = null;
    localStorage.removeItem('claw_bot_id');
    localStorage.removeItem('claw_bot_name');
    updateBotSelector();
    navigate('markets');
  };

  window.openRegisterModal = openRegisterModal;

  // ── Init ─────────────────────────────────────────────────
  updateBotSelector();
  connectWs();
  navigate('markets');

  // Periodic refresh
  setInterval(() => {
    loadStats();
    if (currentView === 'markets') loadMarkets();
    if (currentView === 'bot') refreshBotBalance();
  }, REFRESH_INTERVAL);
})();
