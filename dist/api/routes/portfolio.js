import { Router } from 'express';
import { getDb } from '../../db/index.js';
export const portfolioRouter = Router();
// GET /api/bots/:id/portfolio — bot positions & P&L
portfolioRouter.get('/:id/portfolio', (req, res) => {
    const db = getDb();
    const botId = req.params.id;
    const bot = db.prepare('SELECT id, name, wallet_address, balance_usdc, auto_trade_enabled FROM bots WHERE id = ?')
        .get(botId);
    if (!bot) {
        res.status(404).json({ error: 'Bot not found' });
        return;
    }
    const positions = db.prepare(`
    SELECT p.*, m.title as market_title, m.price_yes, m.price_no, m.status as market_status, m.resolution
    FROM positions p
    JOIN markets m ON p.market_id = m.id
    WHERE p.bot_id = ? AND p.shares > 0
    ORDER BY p.shares DESC
  `).all(botId);
    // Calculate unrealized P&L
    let unrealizedPnl = 0;
    for (const pos of positions) {
        const currentPrice = pos.outcome === 'yes' ? pos.price_yes : pos.price_no;
        unrealizedPnl += Math.floor(pos.shares * (currentPrice - pos.avg_price));
    }
    const realizedPnl = db.prepare('SELECT COALESCE(SUM(realized_pnl), 0) as total FROM positions WHERE bot_id = ?').get(botId);
    const tradeCount = db.prepare('SELECT COUNT(*) as count FROM trades WHERE maker_bot_id = ? OR taker_bot_id = ?').get(botId, botId);
    res.json({
        bot: {
            id: bot.id,
            name: bot.name,
            walletAddress: bot.wallet_address,
            balance: bot.balance_usdc,
            autoTrade: !!bot.auto_trade_enabled,
        },
        positions,
        pnl: {
            realized: realizedPnl.total,
            unrealized: unrealizedPnl,
            total: realizedPnl.total + unrealizedPnl,
        },
        tradeCount: tradeCount.count,
    });
});
// GET /api/bots/:id/balance — bot balance
portfolioRouter.get('/:id/balance', (req, res) => {
    const db = getDb();
    const bot = db.prepare('SELECT id, name, balance_usdc, wallet_address FROM bots WHERE id = ?')
        .get(req.params.id);
    if (!bot) {
        res.status(404).json({ error: 'Bot not found' });
        return;
    }
    res.json({
        botId: bot.id,
        name: bot.name,
        balance: bot.balance_usdc,
        walletAddress: bot.wallet_address,
    });
});
// GET /api/bots/:id/trades — bot trade history
portfolioRouter.get('/:id/trades', (req, res) => {
    const db = getDb();
    const limit = req.query.limit || '50';
    const offset = req.query.offset || '0';
    const trades = db.prepare(`
    SELECT t.*, m.title as market_title,
      CASE WHEN t.maker_bot_id = ? THEN 'maker' ELSE 'taker' END as role
    FROM trades t
    JOIN markets m ON t.market_id = m.id
    WHERE t.maker_bot_id = ? OR t.taker_bot_id = ?
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.id, req.params.id, req.params.id, parseInt(limit, 10), parseInt(offset, 10));
    res.json({ trades });
});
//# sourceMappingURL=portfolio.js.map