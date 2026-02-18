import { Router, Request, Response } from 'express';
import { getDb } from '../../db/index.js';
import { adminAuth } from '../middleware/auth.js';
import { getTreasuryStats, getRecentTreasuryEntries } from '../../x402/treasury.js';
import { settleMarket } from '../../engine/settlement.js';

export const adminRouter = Router();

// GET /api/treasury — public treasury stats
adminRouter.get('/treasury', async (_req: Request, res: Response) => {
  try {
    const stats = await getTreasuryStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/treasury/entries — recent treasury entries
adminRouter.get('/treasury/entries', (_req: Request, res: Response) => {
  const entries = getRecentTreasuryEntries();
  res.json({ entries });
});

// POST /api/admin/markets/:id/resolve — manual market resolution (admin only)
adminRouter.post('/markets/:id/resolve', adminAuth, (req: Request, res: Response) => {
  const { resolution } = req.body;

  if (!['yes', 'no'].includes(resolution)) {
    res.status(400).json({ error: 'resolution must be "yes" or "no"' });
    return;
  }

  const db = getDb();
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id) as any;

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
adminRouter.post('/config', adminAuth, (req: Request, res: Response) => {
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
adminRouter.get('/stats', adminAuth, (_req: Request, res: Response) => {
  const db = getDb();

  const stats = {
    bots: (db.prepare('SELECT COUNT(*) as count FROM bots').get() as any).count,
    activeMarkets: (db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'active'").get() as any).count,
    resolvedMarkets: (db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'resolved'").get() as any).count,
    totalTrades: (db.prepare('SELECT COUNT(*) as count FROM trades').get() as any).count,
    totalVolume: (db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM trades').get() as any).total,
    totalFees: (db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM treasury').get() as any).total,
    openOrders: (db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('open', 'partial')").get() as any).count,
  };

  res.json(stats);
});
