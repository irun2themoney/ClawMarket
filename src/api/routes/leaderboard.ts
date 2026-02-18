import { Router, Request, Response } from 'express';
import { getDb } from '../../db/index.js';

export const leaderboardRouter = Router();

// GET /api/leaderboard — ranked bots by P&L
leaderboardRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const limit = (req.query.limit as string) || '20';

  const bots = db.prepare(`
    SELECT
      b.id,
      b.name,
      b.wallet_address,
      b.balance_usdc,
      b.created_at,
      COALESCE(SUM(p.realized_pnl), 0) as realized_pnl,
      COUNT(DISTINCT CASE WHEN p.shares > 0 THEN p.market_id END) as active_markets,
      (SELECT COUNT(*) FROM trades WHERE maker_bot_id = b.id OR taker_bot_id = b.id) as trade_count,
      (SELECT COALESCE(SUM(size), 0) FROM trades WHERE maker_bot_id = b.id OR taker_bot_id = b.id) as total_volume
    FROM bots b
    LEFT JOIN positions p ON b.id = p.bot_id
    GROUP BY b.id
    ORDER BY COALESCE(SUM(p.realized_pnl), 0) DESC
    LIMIT ?
  `).all(parseInt(limit as string, 10));

  // Calculate unrealized P&L for each bot
  const enriched = bots.map((bot: any) => {
    const positions = db.prepare(`
      SELECT p.shares, p.avg_price, p.outcome, m.price_yes, m.price_no
      FROM positions p
      JOIN markets m ON p.market_id = m.id
      WHERE p.bot_id = ? AND p.shares > 0
    `).all(bot.id) as any[];

    let unrealizedPnl = 0;
    for (const pos of positions) {
      const currentPrice = pos.outcome === 'yes' ? pos.price_yes : pos.price_no;
      unrealizedPnl += Math.floor(pos.shares * (currentPrice - pos.avg_price));
    }

    return {
      ...bot,
      unrealized_pnl: unrealizedPnl,
      total_pnl: bot.realized_pnl + unrealizedPnl,
    };
  });

  // Re-sort by total P&L
  enriched.sort((a: any, b: any) => b.total_pnl - a.total_pnl);

  res.json({
    leaderboard: enriched.map((bot: any, i: number) => ({
      rank: i + 1,
      ...bot,
    })),
  });
});
