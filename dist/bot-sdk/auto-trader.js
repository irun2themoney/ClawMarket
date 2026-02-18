var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { PolymarketArbStrategy } from './strategy.js';
const DEFAULT_CONFIG = {
    intervalMs: 30000,
    maxTradesPerCycle: 3,
    dryRun: false,
};
export class AutoTrader {
    constructor(bot, strategy, config) {
        this.timer = null;
        this.running = false;
        this.bot = bot;
        this.strategy = strategy || new PolymarketArbStrategy();
        this.config = Object.assign(Object.assign({}, DEFAULT_CONFIG), config);
    }
    setStrategy(strategy) {
        this.strategy = strategy;
        console.log(`[auto-trader] strategy changed to: ${strategy.name}`);
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        console.log(`[auto-trader] started (strategy: ${this.strategy.name}, interval: ${this.config.intervalMs}ms)`);
        // Run first evaluation immediately
        this.evaluate();
        this.timer = setInterval(() => this.evaluate(), this.config.intervalMs);
    }
    stop() {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('[auto-trader] stopped');
    }
    isRunning() {
        return this.running;
    }
    evaluate() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Build context
                const [balance, positions, markets] = yield Promise.all([
                    this.bot.getBalance(),
                    this.bot.getPositions(),
                    this.bot.getMarkets({ status: 'active' }),
                ]);
                const snapshots = markets.map((m) => ({
                    market: m,
                    polyPriceYes: m.poly_price_yes || 0.5,
                    polyPriceNo: m.poly_price_no || 0.5,
                    clawPriceYes: m.price_yes,
                    clawPriceNo: m.price_no,
                    volume: m.volume_total,
                }));
                const ctx = {
                    balance: balance.balance,
                    positions: positions.map((p) => ({
                        marketId: p.market_id,
                        outcome: p.outcome,
                        shares: p.shares,
                        avgPrice: p.avg_price,
                    })),
                    markets: snapshots,
                };
                // Get trade signals
                const signals = this.strategy.evaluate(ctx);
                if (signals.length === 0)
                    return;
                console.log(`[auto-trader] ${signals.length} signals from ${this.strategy.name}`);
                // Execute signals (up to maxTradesPerCycle)
                const toExecute = signals.slice(0, this.config.maxTradesPerCycle);
                for (const signal of toExecute) {
                    if (signal.action === 'hold')
                        continue;
                    if (this.config.dryRun) {
                        console.log(`[auto-trader] DRY RUN: ${signal.action} ${signal.outcome} on ${signal.marketId} — ${signal.reason}`);
                        continue;
                    }
                    try {
                        if (signal.action === 'buy') {
                            yield this.bot.buy(signal.marketId, signal.outcome, signal.size, signal.price);
                            console.log(`[auto-trader] BUY ${signal.outcome} ${signal.size} @ ${signal.price} — ${signal.reason}`);
                        }
                        else if (signal.action === 'sell') {
                            yield this.bot.sell(signal.marketId, signal.outcome, signal.size, signal.price);
                            console.log(`[auto-trader] SELL ${signal.outcome} ${signal.size} @ ${signal.price} — ${signal.reason}`);
                        }
                    }
                    catch (err) {
                        console.error(`[auto-trader] trade failed: ${err.message}`);
                    }
                }
            }
            catch (err) {
                console.error(`[auto-trader] evaluation error: ${err.message}`);
            }
        });
    }
}
//# sourceMappingURL=auto-trader.js.map