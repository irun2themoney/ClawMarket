var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { adminAuth } from '../middleware/auth.js';
import { getTreasuryStats, getRecentTreasuryEntries } from '../../x402/treasury.js';
import { settleMarket } from '../../engine/settlement.js';
export const adminRouter = Router();
// GET /api/treasury — public treasury stats
adminRouter.get('/treasury', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stats = yield getTreasuryStats();
        res.json(stats);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// GET /api/treasury/entries — recent treasury entries
adminRouter.get('/treasury/entries', (_req, res) => {
    const entries = getRecentTreasuryEntries();
    res.json({ entries });
});
// POST /api/admin/markets/:id/resolve — manual market resolution (admin only)
adminRouter.post('/markets/:id/resolve', adminAuth, (req, res) => {
    const { resolution } = req.body;
    if (!['yes', 'no'].includes(resolution)) {
        res.status(400).json({ error: 'resolution must be "yes" or "no"' });
        return;
    }
    const db = getDb();
    const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id);
    if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
    }
    if (market.status === 'resolved') {
        res.status(400).json({ error: 'Market already resolved' });
        return;
    }
    // Mark market as resolved
    const now = Date.now();
    db.prepare('UPDATE markets SET status = ?, resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?')
        .run('resolved', resolution, now, now, req.params.id);
    // Settle positions
    const result = settleMarket(req.params.id, resolution);
    res.json({
        message: `Market resolved: ${resolution}`,
        settlement: result,
    });
});
// POST /api/admin/config — update fee rate (admin only)
adminRouter.post('/config', adminAuth, (req, res) => {
    const { feeRate } = req.body;
    if (feeRate !== undefined) {
        if (typeof feeRate !== 'number' || feeRate < 0 || feeRate > 0.5) {
            res.status(400).json({ error: 'feeRate must be between 0 and 0.5' });
            return;
        }
        process.env.CLAWMARKET_FEE_RATE = feeRate.toString();
    }
    res.json({ message: 'Config updated', feeRate });
});
// GET /api/admin/stats — overall system stats (admin only)
adminRouter.get('/stats', adminAuth, (_req, res) => {
    const db = getDb();
    const stats = {
        bots: db.prepare('SELECT COUNT(*) as count FROM bots').get().count,
        activeMarkets: db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'active'").get().count,
        resolvedMarkets: db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'resolved'").get().count,
        totalTrades: db.prepare('SELECT COUNT(*) as count FROM trades').get().count,
        totalVolume: db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM trades').get().total,
        totalFees: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM treasury').get().total,
        openOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('open', 'partial')").get().count,
    };
    res.json(stats);
});
//# sourceMappingURL=admin.js.map