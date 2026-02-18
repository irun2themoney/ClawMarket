import WebSocket from 'ws';
import { EventEmitter } from 'eventemitter3';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
export class PolymarketPriceFeed extends EventEmitter {
    constructor() {
        super(...arguments);
        this.ws = null;
        this.subscribedTokens = new Set();
        this.tokenToMarketId = new Map();
        this.reconnectTimer = null;
        this.alive = false;
    }
    start() {
        this.connect();
    }
    stop() {
        this.alive = false;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    connect() {
        this.alive = true;
        console.log('[prices] connecting to Polymarket WebSocket...');
        this.ws = new WebSocket(config.polyClobWs);
        this.ws.on('open', () => {
            console.log('[prices] connected');
            this.emit('connected');
            this.subscribeToActiveMarkets();
        });
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this.handleMessage(msg);
            }
            catch (_a) {
                // ignore malformed messages
            }
        });
        this.ws.on('close', () => {
            console.log('[prices] disconnected');
            this.emit('disconnected');
            this.scheduleReconnect();
        });
        this.ws.on('error', (err) => {
            console.error('[prices] WebSocket error:', err.message);
        });
    }
    scheduleReconnect() {
        if (!this.alive)
            return;
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    }
    subscribeToActiveMarkets() {
        var _a;
        const db = getDb();
        const markets = db.prepare(`SELECT id, poly_token_id_yes, poly_token_id_no FROM markets WHERE status = 'active' AND poly_token_id_yes IS NOT NULL`).all();
        const assetIds = [];
        for (const m of markets) {
            if (m.poly_token_id_yes) {
                assetIds.push(m.poly_token_id_yes);
                this.tokenToMarketId.set(m.poly_token_id_yes, m.id);
                this.subscribedTokens.add(m.poly_token_id_yes);
            }
            if (m.poly_token_id_no) {
                assetIds.push(m.poly_token_id_no);
                this.tokenToMarketId.set(m.poly_token_id_no, m.id);
                this.subscribedTokens.add(m.poly_token_id_no);
            }
        }
        if (assetIds.length > 0 && ((_a = this.ws) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
            const batchSize = 100;
            for (let i = 0; i < assetIds.length; i += batchSize) {
                const batch = assetIds.slice(i, i + batchSize);
                this.ws.send(JSON.stringify({
                    assets_ids: batch,
                    type: 'market',
                }));
            }
            console.log(`[prices] subscribed to ${assetIds.length} tokens across ${markets.length} markets`);
        }
    }
    subscribeToMarket(marketId, tokenYes, tokenNo) {
        var _a;
        this.tokenToMarketId.set(tokenYes, marketId);
        this.tokenToMarketId.set(tokenNo, marketId);
        const newTokens = [];
        if (!this.subscribedTokens.has(tokenYes)) {
            this.subscribedTokens.add(tokenYes);
            newTokens.push(tokenYes);
        }
        if (!this.subscribedTokens.has(tokenNo)) {
            this.subscribedTokens.add(tokenNo);
            newTokens.push(tokenNo);
        }
        if (newTokens.length > 0 && ((_a = this.ws) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                assets_ids: newTokens,
                type: 'market',
            }));
        }
    }
    handleMessage(msg) {
        if (!msg || !Array.isArray(msg)) {
            this.processPriceEvent(msg);
            return;
        }
        for (const event of msg) {
            this.processPriceEvent(event);
        }
    }
    processPriceEvent(event) {
        if (!(event === null || event === void 0 ? void 0 : event.asset_id))
            return;
        const marketId = this.tokenToMarketId.get(event.asset_id);
        if (!marketId)
            return;
        const db = getDb();
        const market = db.prepare('SELECT poly_token_id_yes, poly_token_id_no FROM markets WHERE id = ?')
            .get(marketId);
        if (!market)
            return;
        const price = parseFloat(event.price || '0');
        if (isNaN(price) || price <= 0 || price >= 1)
            return;
        let priceYes;
        let priceNo;
        if (event.asset_id === market.poly_token_id_yes) {
            priceYes = price;
            priceNo = Math.max(0.01, 1 - price);
        }
        else {
            priceNo = price;
            priceYes = Math.max(0.01, 1 - price);
        }
        db.prepare('UPDATE markets SET poly_price_yes = ?, poly_price_no = ?, updated_at = ? WHERE id = ?')
            .run(priceYes, priceNo, Date.now(), marketId);
        this.emit('price-update', { marketId, priceYes, priceNo });
    }
}
//# sourceMappingURL=prices.js.map