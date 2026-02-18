import { Router, Request, Response } from 'express';
import { getDb } from '../../db/index.js';
import { matchingEngine } from '../../engine/matching.js';
import { calculateTotalCost } from '../../engine/fees.js';
import { botAuth } from '../middleware/auth.js';
import { x402Paywall } from '../../x402/paywall.js';

export const ordersRouter = Router();

// POST /api/orders — place an order (x402-gated in production, balance-checked in dev)
ordersRouter.post('/',
  botAuth,
  x402Paywall((req) => {
    const { side, size, price } = req.body;
    if (side === 'buy') {
      const orderPrice = price || 0.5;
      return calculateTotalCost(size, orderPrice);
    }
    return 0;
  }),
  (req: Request, res: Response) => {
    try {
      const bot = (req as any).bot;
      let { marketId, side, outcome, orderType = 'limit', price, size } = req.body;

      console.log('[DEBUG] Incoming order:', req.body);
    if (!marketId || !side || !outcome || !size) {
        res.status(400).json({ error: 'Missing required fields: marketId, side, outcome, size' });
        return;
      }

      if (!['buy', 'sell'].includes(side)) {
        res.status(400).json({ error: 'side must be "buy" or "sell"' });
        return;
      }

      if (!['yes', 'no'].includes(outcome)) {
        res.status(400).json({ error: 'outcome must be "yes" or "no"' });
        return;
      }

      if (typeof size !== 'number' || size <= 0) {
        res.status(400).json({ error: 'size must be a positive number' });
        return;
      }

      if (orderType === 'limit' && (price === undefined || price <= 0 || price >= 1)) {
        console.warn(`[fallback] Invalid or missing price. Setting to default (0.5)`);
        price = 0.5;
      }

      const db = getDb();

      // Balance check for buys
      if (side === 'buy') {
        const orderPrice = price || 0.5;
        const cost = calculateTotalCost(size, orderPrice);
        const botRecord = db.prepare('SELECT balance_usdc FROM bots WHERE id = ?').get(bot.id) as any;
        if (!botRecord || botRecord.balance_usdc < cost) {
          res.status(400).json({
            error: 'Insufficient balance',
            required: cost,
            requiredUsdc: (cost / 1_000_000).toFixed(2),
            available: botRecord?.balance_usdc || 0,
            availableUsdc: ((botRecord?.balance_usdc || 0) / 1_000_000).toFixed(2),
          });
          return;
        }
      }

      if (side === 'sell') {
        // Verify bot has enough shares
        const position = db.prepare(
          'SELECT shares FROM positions WHERE bot_id = ? AND market_id = ? AND outcome = ?'
        ).get(bot.id, marketId, outcome) as { shares: number } | undefined;

        if (!position || position.shares < size) {
          res.status(400).json({
            error: 'Insufficient shares to sell',
            available: position?.shares || 0,
            requested: size,
          });
          return;
        }
      }

      const result = matchingEngine.submitOrder({
        botId: bot.id,
        marketId,
        side,
        outcome,
        orderType,
        price,
        size,
      });

      res.json({
        orderId: result.orderId,
        fills: result.fills,
        fillCount: result.fills.length,
        totalFilled: result.fills.reduce((sum, f) => sum + f.size, 0),
        totalFees: result.fills.reduce((sum, f) => sum + f.feeAmount, 0),
        status: result.fills.length > 0
          ? (result.fills.reduce((s, f) => s + f.size, 0) >= size ? 'filled' : 'partial')
          : 'open',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// DELETE /api/orders/:id — cancel an order
ordersRouter.delete('/:id', botAuth, (req: Request, res: Response) => {
  const bot = (req as any).bot;
  const success = matchingEngine.cancelOrder(req.params.id, bot.id);

  if (!success) {
    res.status(404).json({ error: 'Order not found or already filled/cancelled' });
    return;
  }

  res.json({ cancelled: true, orderId: req.params.id });
});

// GET /api/orders — list bot's orders
ordersRouter.get('/', botAuth, (req: Request, res: Response) => {
  const bot = (req as any).bot;
  const db = getDb();
  const status = (req.query.status as string) || 'open';
  const limit = (req.query.limit as string) || '50';

  let query = 'SELECT o.*, m.title as market_title FROM orders o JOIN markets m ON o.market_id = m.id WHERE o.bot_id = ?';
  const params: any[] = [bot.id];

  if (status && status !== 'all') {
    query += ' AND o.status = ?';
    params.push(status);
  }

  query += ' ORDER BY o.created_at DESC LIMIT ?';
  params.push(parseInt(limit as string, 10));

  const orders = db.prepare(query).all(...params);
  res.json({ orders });
});
