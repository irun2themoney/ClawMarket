var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { X402Client } from './x402-client.js';
import { AutoTrader } from './auto-trader.js';
/**
 * ClawMarketBot — plug-and-play SDK for OpenClaw bots to trade on ClawMarket.
 *
 * Usage:
 *   const bot = await ClawMarketBot.connect({ name: "AlphaBot" });
 *   const markets = await bot.getMarkets();
 *   await bot.buy(markets[0].id, "yes", 1000000, 0.45);
 */
export class ClawMarketBot {
    constructor(client, botId, walletAddress, serverUrl) {
        this.autoTrader = null;
        this.client = client;
        this.botId = botId;
        this.walletAddress = walletAddress;
        this.serverUrl = serverUrl;
    }
    /**
     * Connect to ClawMarket. Auto-registers and creates a wallet if needed.
     */
    static connect(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const serverUrl = opts.serverUrl || 'http://localhost:3457';
            // Register bot (idempotent — returns existing if name/agentId matches)
            const regRes = yield fetch(`${serverUrl}/api/bots/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: opts.name, agentId: opts.agentId }),
            });
            if (!regRes.ok) {
                throw new Error(`Registration failed: ${yield regRes.text()}`);
            }
            const reg = yield regRes.json();
            // Fetch the encrypted key for x402 signing
            let encryptedKey = '';
            try {
                const keyRes = yield fetch(`${serverUrl}/api/bots/${reg.botId}/key`, {
                    headers: { 'X-Bot-Id': reg.botId },
                });
                if (keyRes.ok) {
                    const keyData = yield keyRes.json();
                    encryptedKey = keyData.encryptedKey || '';
                }
            }
            catch (_a) {
                // Key retrieval failed — will work in dev mode without it
            }
            const client = new X402Client({
                baseUrl: serverUrl,
                botId: reg.botId,
                encryptedKey,
                walletAddress: reg.walletAddress,
            });
            const bot = new ClawMarketBot(client, reg.botId, reg.walletAddress, serverUrl);
            console.log(`[bot] connected as "${opts.name}" (${reg.botId})`);
            console.log(`[bot] wallet: ${reg.walletAddress}`);
            console.log(`[bot] balance: $${((reg.balance || 0) / 1000000).toFixed(2)} USDC`);
            if (!reg.existing) {
                console.log(`[bot] new bot created with starting balance.`);
            }
            return bot;
        });
    }
    // --- Identity ---
    getId() { return this.botId; }
    getWalletAddress() { return this.walletAddress; }
    getServerUrl() { return this.serverUrl; }
    // --- Markets (free) ---
    getMarkets(filter) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = new URLSearchParams();
            if (filter === null || filter === void 0 ? void 0 : filter.status)
                params.set('status', filter.status);
            if (filter === null || filter === void 0 ? void 0 : filter.category)
                params.set('category', filter.category);
            if (filter === null || filter === void 0 ? void 0 : filter.search)
                params.set('search', filter.search);
            if (filter === null || filter === void 0 ? void 0 : filter.limit)
                params.set('limit', filter.limit.toString());
            const qs = params.toString();
            const result = yield this.client.get(`/api/markets${qs ? '?' + qs : ''}`);
            return result.markets;
        });
    }
    getMarket(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.get(`/api/markets/${id}`);
        });
    }
    getPolymarketPrice(marketId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { market } = yield this.getMarket(marketId);
            return {
                yes: market.poly_price_yes || 0.5,
                no: market.poly_price_no || 0.5,
            };
        });
    }
    // --- Trading ---
    buy(marketId, outcome, size, limitPrice) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.post('/api/orders', {
                marketId,
                side: 'buy',
                outcome,
                size,
                orderType: limitPrice !== undefined ? 'limit' : 'market',
                price: limitPrice,
            });
        });
    }
    sell(marketId, outcome, shares, limitPrice) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.post('/api/orders', {
                marketId,
                side: 'sell',
                outcome,
                size: shares,
                orderType: limitPrice !== undefined ? 'limit' : 'market',
                price: limitPrice,
            });
        });
    }
    cancelOrder(orderId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.client.del(`/api/orders/${orderId}`);
        });
    }
    // --- Portfolio ---
    getBalance() {
        return __awaiter(this, void 0, void 0, function* () {
            const portfolio = yield this.client.get(`/api/bots/${this.botId}/portfolio`);
            return {
                balance: portfolio.bot.balance,
                positions: portfolio.positions,
            };
        });
    }
    getPositions() {
        return __awaiter(this, void 0, void 0, function* () {
            const portfolio = yield this.client.get(`/api/bots/${this.botId}/portfolio`);
            return portfolio.positions;
        });
    }
    getPnL() {
        return __awaiter(this, void 0, void 0, function* () {
            const portfolio = yield this.client.get(`/api/bots/${this.botId}/portfolio`);
            return portfolio.pnl;
        });
    }
    // --- Wallet ---
    deposit(amountUsdc) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.client.post(`/api/bots/${this.botId}/deposit`, { amount: amountUsdc });
        });
    }
    getOnChainBalance() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.client.get(`/api/wallet/${this.botId}/onchain`);
            return result.onChainBalanceUsdc;
        });
    }
    // --- Auto Trading ---
    startAutoTrading(strategy, config) {
        var _a;
        if ((_a = this.autoTrader) === null || _a === void 0 ? void 0 : _a.isRunning()) {
            this.autoTrader.stop();
        }
        this.autoTrader = new AutoTrader(this, strategy, config);
        this.autoTrader.start();
        return this.autoTrader;
    }
    stopAutoTrading() {
        var _a;
        (_a = this.autoTrader) === null || _a === void 0 ? void 0 : _a.stop();
    }
    isAutoTrading() {
        var _a;
        return ((_a = this.autoTrader) === null || _a === void 0 ? void 0 : _a.isRunning()) || false;
    }
    // --- Leaderboard ---
    getLeaderboard() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.client.get('/api/leaderboard');
            return result.leaderboard;
        });
    }
}
//# sourceMappingURL=index.js.map