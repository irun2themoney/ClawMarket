var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { EventEmitter } from 'eventemitter3';
export class ResolutionWatcher extends EventEmitter {
    constructor() {
        super(...arguments);
        this.timer = null;
    }
    start() {
        console.log(`[resolver] starting resolution watcher (interval: ${config.polyResolutionInterval}ms)`);
        this.checkResolutions();
        this.timer = setInterval(() => this.checkResolutions(), config.polyResolutionInterval);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    checkResolutions() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = getDb();
            const activeMarkets = db.prepare(`SELECT id, poly_condition_id FROM markets WHERE status = 'active' AND poly_condition_id IS NOT NULL`).all();
            if (activeMarkets.length === 0)
                return;
            // Check markets in batches via Gamma API
            const batchSize = 50;
            for (let i = 0; i < activeMarkets.length; i += batchSize) {
                const batch = activeMarkets.slice(i, i + batchSize);
                for (const market of batch) {
                    try {
                        const url = `${config.polyGammaApi}/markets?condition_id=${market.poly_condition_id}`;
                        const response = yield fetch(url);
                        if (!response.ok)
                            continue;
                        const markets = yield response.json();
                        if (!Array.isArray(markets) || markets.length === 0)
                            continue;
                        const polyMarket = markets[0];
                        // Check if market is closed/resolved
                        if (polyMarket.closed === true || polyMarket.active === false) {
                            const outcomes = typeof polyMarket.outcomes === 'string'
                                ? JSON.parse(polyMarket.outcomes) : (polyMarket.outcomes || []);
                            const outcomePrices = typeof polyMarket.outcomePrices === 'string'
                                ? JSON.parse(polyMarket.outcomePrices) : (polyMarket.outcomePrices || []);
                            if (outcomes.length >= 2 && outcomePrices.length >= 2) {
                                const yesPrice = parseFloat(outcomePrices[0]);
                                const noPrice = parseFloat(outcomePrices[1]);
                                // A resolved market has one outcome at ~1.0 and the other at ~0.0
                                let resolution = null;
                                if (yesPrice >= 0.95)
                                    resolution = 'yes';
                                else if (noPrice >= 0.95)
                                    resolution = 'no';
                                if (resolution) {
                                    const now = Date.now();
                                    db.prepare(`UPDATE markets SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?`).run(resolution, now, now, market.id);
                                    console.log(`[resolver] market ${market.id} resolved: ${resolution}`);
                                    this.emit('market-resolved', { marketId: market.id, resolution });
                                }
                            }
                        }
                    }
                    catch (_a) {
                        // Individual market failures shouldn't block others
                    }
                }
                // Rate limit between batches
                if (i + batchSize < activeMarkets.length) {
                    yield new Promise(r => setTimeout(r, 1000));
                }
            }
        });
    }
}
//# sourceMappingURL=resolver.js.map