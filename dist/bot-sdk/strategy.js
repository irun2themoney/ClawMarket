/**
 * Default arbitrage strategy: exploits price differences between
 * ClawMarket and Polymarket reference prices.
 */
export class PolymarketArbStrategy {
    constructor() {
        this.name = 'polymarket-arb';
        // Minimum price divergence to trigger a trade (5%)
        this.threshold = 0.05;
        // Max position size as fraction of balance
        this.maxPositionFraction = 0.1;
    }
    evaluate(ctx) {
        const signals = [];
        if (ctx.balance <= 0)
            return signals;
        for (const snapshot of ctx.markets) {
            const { market } = snapshot;
            if (!market.poly_price_yes || !market.poly_price_no)
                continue;
            // Check YES outcome
            const yesDivergence = market.poly_price_yes - market.price_yes;
            if (Math.abs(yesDivergence) > this.threshold) {
                if (yesDivergence > 0) {
                    // ClawMarket YES is cheaper than Polymarket → buy YES
                    const maxSpend = Math.floor(ctx.balance * this.maxPositionFraction);
                    const size = Math.floor(maxSpend / market.price_yes);
                    if (size > 0) {
                        signals.push({
                            action: 'buy',
                            marketId: market.id,
                            outcome: 'yes',
                            size,
                            price: Math.min(market.price_yes + 0.02, market.poly_price_yes - 0.01),
                            confidence: Math.min(yesDivergence / 0.2, 1),
                            reason: `YES undervalued: claw=${market.price_yes.toFixed(2)} poly=${market.poly_price_yes.toFixed(2)} (${(yesDivergence * 100).toFixed(1)}% edge)`,
                        });
                    }
                }
                else {
                    // ClawMarket YES is more expensive → sell if we hold YES shares
                    const yesPosition = ctx.positions.find(p => p.marketId === market.id && p.outcome === 'yes' && p.shares > 0);
                    if (yesPosition) {
                        signals.push({
                            action: 'sell',
                            marketId: market.id,
                            outcome: 'yes',
                            size: Math.floor(yesPosition.shares * 0.5), // Sell half
                            price: Math.max(market.price_yes - 0.02, market.poly_price_yes + 0.01),
                            confidence: Math.min(Math.abs(yesDivergence) / 0.2, 1),
                            reason: `YES overvalued: claw=${market.price_yes.toFixed(2)} poly=${market.poly_price_yes.toFixed(2)}`,
                        });
                    }
                }
            }
            // Same logic for NO outcome
            const noDivergence = market.poly_price_no - market.price_no;
            if (Math.abs(noDivergence) > this.threshold) {
                if (noDivergence > 0) {
                    const maxSpend = Math.floor(ctx.balance * this.maxPositionFraction);
                    const size = Math.floor(maxSpend / market.price_no);
                    if (size > 0) {
                        signals.push({
                            action: 'buy',
                            marketId: market.id,
                            outcome: 'no',
                            size,
                            price: Math.min(market.price_no + 0.02, market.poly_price_no - 0.01),
                            confidence: Math.min(noDivergence / 0.2, 1),
                            reason: `NO undervalued: claw=${market.price_no.toFixed(2)} poly=${market.poly_price_no.toFixed(2)}`,
                        });
                    }
                }
            }
        }
        // Sort by confidence descending — most confident trades first
        signals.sort((a, b) => b.confidence - a.confidence);
        // Limit to top 3 signals per evaluation
        return signals.slice(0, 3);
    }
}
//# sourceMappingURL=strategy.js.map