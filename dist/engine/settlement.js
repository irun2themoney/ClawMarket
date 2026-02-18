import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { orderbook } from './orderbook.js';
/**
 * Settle a resolved market: pay out winning positions, zero out losing ones.
 * Winning shares pay $1.00 (1_000_000 microcents) per share.
 * Losing shares pay $0.00.
 */
export function settleMarket(marketId, resolution) {
    const db = getDb();
    const now = Date.now();
    // Get all positions for this market
    const positions = db.prepare('SELECT bot_id, outcome, shares, avg_price FROM positions WHERE market_id = ? AND shares > 0').all(marketId);
    let payoutsCount = 0;
    let totalPayout = 0;
    const payoutBot = db.prepare('UPDATE bots SET balance_usdc = balance_usdc + ?, updated_at = ? WHERE id = ?');
    const updatePosition = db.prepare('UPDATE positions SET shares = 0, realized_pnl = realized_pnl + ? WHERE bot_id = ? AND market_id = ? AND outcome = ?');
    const insertTx = db.prepare('INSERT INTO transactions (id, bot_id, type, amount, chain, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const settle = db.transaction(() => {
        for (const pos of positions) {
            if (pos.outcome === resolution) {
                // Winner: pays $1.00 per share
                const payout = pos.shares; // 1 share = 1_000_000 microcents = $1.00
                const profit = Math.floor(payout - pos.shares * pos.avg_price);
                payoutBot.run(payout, now, pos.bot_id);
                updatePosition.run(profit, pos.bot_id, marketId, pos.outcome);
                insertTx.run(uuid(), pos.bot_id, 'payout', payout, 'base', 'confirmed', now);
                totalPayout += payout;
                payoutsCount++;
            }
            else {
                // Loser: shares are worthless
                const loss = -Math.floor(pos.shares * pos.avg_price);
                updatePosition.run(loss, pos.bot_id, marketId, pos.outcome);
            }
        }
        // Cancel all open orders for this market
        db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE market_id = ? AND status IN ('open', 'partial')")
            .run(now, marketId);
    });
    settle();
    // Clear the orderbook for this market
    orderbook.clearMarket(marketId);
    console.log(`[settlement] market ${marketId} resolved ${resolution}: ${payoutsCount} payouts, total ${totalPayout} microcents`);
    return { marketId, resolution, payoutsCount, totalPayout };
}
//# sourceMappingURL=settlement.js.map