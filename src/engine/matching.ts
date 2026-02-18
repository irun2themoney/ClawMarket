import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { orderbook } from './orderbook.js';
import { calculateFee, getFeeRate } from './fees.js';
import { ammBuy, ammSell } from './amm.js';
import { EventEmitter } from 'eventemitter3';

export interface TradeResult {
  tradeId: string;
  marketId: string;
  outcome: string;
  price: number;
  size: number;
  makerOrderId: string;
  takerOrderId: string;
  makerBotId: string;
  takerBotId: string;
  feeAmount: number;
}

export interface OrderInput {
  botId: string;
  marketId: string;
  side: 'buy' | 'sell';
  outcome: 'yes' | 'no';
  orderType: 'limit' | 'market';
  price?: number;       // required for limit orders
  size: number;         // shares in microcents
}

interface MatchingEvents {
  'trade': (trade: TradeResult) => void;
  'order-placed': (order: { orderId: string; marketId: string; botId: string }) => void;
  'order-filled': (order: { orderId: string }) => void;
}

export class MatchingEngine extends EventEmitter<MatchingEvents> {
  /**
   * Submit an order to the matching engine.
   * Returns the order ID and any immediate fills.
   */
  submitOrder(input: OrderInput): { orderId: string; fills: TradeResult[] } {
    const db = getDb();
    const now = Date.now();
    const orderId = uuid();

    // Validate market is active
    console.log('[DEBUG] Submitting order:', input);
    const market = db.prepare('SELECT status FROM markets WHERE id = ?').get(input.marketId) as any;
    if (!market || market.status !== 'active') {
      throw new Error(`Market ${input.marketId} is not active`);
    }

    // For limit orders, price is required
    if (input.orderType === 'limit' && (input.price === undefined || input.price <= 0 || input.price >= 1)) {
      console.warn('[fallback] Invalid or missing limit price. Using default (0.5).');
        input.price = 0.5;
    }

    // Insert order into DB
    db.prepare(`
      INSERT INTO orders (id, bot_id, market_id, side, outcome, order_type, price, size, filled, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?)
    `).run(orderId, input.botId, input.marketId, input.side, input.outcome, input.orderType, input.price || null, input.size, now, now);

    this.emit('order-placed', { orderId, marketId: input.marketId, botId: input.botId });

    // Try to match
    const fills = this.matchOrder(orderId, input);

    return { orderId, fills };
  }

  private matchOrder(orderId: string, input: OrderInput): TradeResult[] {
    const db = getDb();
    const fills: TradeResult[] = [];
    let remaining = input.size;

    // Determine which side of the book to match against
    // A buy order matches against asks; a sell matches against bids
    const getCounterparty = input.side === 'buy'
      ? () => orderbook.getBestAsk(input.marketId, input.outcome)
      : () => orderbook.getBestBid(input.marketId, input.outcome);

    while (remaining > 0) {
      const counter = getCounterparty();
      if (!counter) break;

      // Check price compatibility
      if (input.orderType === 'limit') {
        if (input.side === 'buy' && counter.price > input.price!) break;
        if (input.side === 'sell' && counter.price < input.price!) break;
      }

      // Determine fill size and price
      const fillSize = Math.min(remaining, counter.size);
      const fillPrice = counter.price; // Price-time priority: fill at resting order's price

      // Calculate fee (charged to taker)
      const feeAmount = calculateFee(fillSize, fillPrice);
      const feeRate = getFeeRate();

      const tradeId = uuid();
      const now = Date.now();

      // Determine maker/taker
      const makerOrderId = counter.orderId;
      const takerOrderId = orderId;
      const makerBotId = counter.botId;
      const takerBotId = input.botId;

      // Record trade
      db.prepare(`
        INSERT INTO trades (id, market_id, maker_order_id, taker_order_id, maker_bot_id, taker_bot_id,
          outcome, price, size, fee_amount, fee_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tradeId, input.marketId, makerOrderId, takerOrderId, makerBotId, takerBotId,
        input.outcome, fillPrice, fillSize, feeAmount, feeRate, now);

      // Update maker order
      const makerFilled = counter.size === fillSize;
      db.prepare(`
        UPDATE orders SET filled = filled + ?, status = ?, updated_at = ? WHERE id = ?
      `).run(fillSize, makerFilled ? 'filled' : 'partial', now, makerOrderId);

      // Update orderbook
      if (makerFilled) {
        if (input.side === 'buy') {
          orderbook.removeAsk(input.marketId, input.outcome, makerOrderId);
        } else {
          orderbook.removeBid(input.marketId, input.outcome, makerOrderId);
        }
      } else {
        orderbook.updateSize(input.marketId, input.outcome, makerOrderId, counter.size - fillSize);
      }

      // Update positions for both parties
      this.updatePosition(makerBotId, input.marketId, input.outcome, input.side === 'buy' ? -fillSize : fillSize, fillPrice);
      this.updatePosition(takerBotId, input.marketId, input.outcome, input.side === 'buy' ? fillSize : -fillSize, fillPrice);

      // Update bot balances
      if (input.side === 'buy') {
        // Taker (buyer) pays: fillSize * fillPrice + fee
        const cost = Math.floor(fillSize * fillPrice) + feeAmount;
        db.prepare('UPDATE bots SET balance_usdc = balance_usdc - ?, updated_at = ? WHERE id = ?')
          .run(cost, now, takerBotId);
        // Maker (seller) receives: fillSize * fillPrice
        db.prepare('UPDATE bots SET balance_usdc = balance_usdc + ?, updated_at = ? WHERE id = ?')
          .run(Math.floor(fillSize * fillPrice), now, makerBotId);
      } else {
        // Taker (seller) receives: fillSize * fillPrice - fee
        const proceeds = Math.floor(fillSize * fillPrice) - feeAmount;
        db.prepare('UPDATE bots SET balance_usdc = balance_usdc + ?, updated_at = ? WHERE id = ?')
          .run(proceeds, now, takerBotId);
        // Maker (buyer) pays: fillSize * fillPrice
        db.prepare('UPDATE bots SET balance_usdc = balance_usdc - ?, updated_at = ? WHERE id = ?')
          .run(Math.floor(fillSize * fillPrice), now, makerBotId);
      }

      // Record fee in treasury
      const currentTreasury = db.prepare('SELECT COALESCE(MAX(balance_after), 0) as bal FROM treasury').get() as any;
      const newBalance = (currentTreasury?.bal || 0) + feeAmount;
      db.prepare(`
        INSERT INTO treasury (id, trade_id, amount, balance_after, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), tradeId, feeAmount, newBalance, now);

      // Update market volume
      db.prepare('UPDATE markets SET volume_total = volume_total + ?, updated_at = ? WHERE id = ?')
        .run(fillSize, now, input.marketId);

      remaining -= fillSize;

      const trade: TradeResult = {
        tradeId, marketId: input.marketId, outcome: input.outcome,
        price: fillPrice, size: fillSize, makerOrderId, takerOrderId,
        makerBotId, takerBotId, feeAmount
      };
      fills.push(trade);
      this.emit('trade', trade);
    }

    // AMM fallback: fill remaining via AMM if no orderbook match
    if (remaining > 0) {
      const ammFillResult = input.side === 'buy'
        ? ammBuy(input.botId, input.marketId, input.outcome, remaining, input.price, orderId)
        : ammSell(input.botId, input.marketId, input.outcome, remaining, input.price, orderId);

      if (ammFillResult) {
        const trade: TradeResult = {
          tradeId: ammFillResult.tradeId,
          marketId: ammFillResult.marketId,
          outcome: ammFillResult.outcome,
          price: ammFillResult.price,
          size: ammFillResult.size,
          makerOrderId: 'AMM',
          takerOrderId: orderId,
          makerBotId: '__HOUSE__',
          takerBotId: input.botId,
          feeAmount: ammFillResult.feeAmount,
        };
        fills.push(trade);
        this.emit('trade', trade);
        remaining -= ammFillResult.size;
      }
    }

    // Update taker order status
    const filled = input.size - remaining;
    const now = Date.now();
    if (remaining === 0) {
      db.prepare('UPDATE orders SET filled = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(input.size, 'filled', now, orderId);
      this.emit('order-filled', { orderId });
    } else if (filled > 0) {
      db.prepare('UPDATE orders SET filled = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(filled, 'partial', now, orderId);
    }

    // If limit order has remaining, add to orderbook
    if (remaining > 0 && input.orderType === 'limit') {
      const entry = {
        orderId,
        botId: input.botId,
        price: input.price!,
        size: remaining,
        timestamp: now,
      };
      if (input.side === 'buy') {
        orderbook.addBid(input.marketId, input.outcome, entry);
      } else {
        orderbook.addAsk(input.marketId, input.outcome, entry);
      }
    } else if (remaining > 0 && input.orderType === 'market') {
      // Market order couldn't fully fill — cancel remainder
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
        .run(filled > 0 ? 'partial' : 'cancelled', now, orderId);
    }

    // Update market price based on last trade
    if (fills.length > 0) {
      const lastPrice = fills[fills.length - 1].price;
      const complementPrice = Math.max(0.01, Math.min(0.99, 1 - lastPrice));
      if (input.outcome === 'yes') {
        db.prepare('UPDATE markets SET price_yes = ?, price_no = ?, updated_at = ? WHERE id = ?')
          .run(lastPrice, complementPrice, now, input.marketId);
      } else {
        db.prepare('UPDATE markets SET price_no = ?, price_yes = ?, updated_at = ? WHERE id = ?')
          .run(lastPrice, complementPrice, now, input.marketId);
      }
    }

    return fills;
  }

  private updatePosition(botId: string, marketId: string, outcome: string, sizeDelta: number, price: number): void {
    const db = getDb();
    const existing = db.prepare(
      'SELECT shares, avg_price FROM positions WHERE bot_id = ? AND market_id = ? AND outcome = ?'
    ).get(botId, marketId, outcome) as { shares: number; avg_price: number } | undefined;

    if (!existing) {
      db.prepare(`
        INSERT INTO positions (bot_id, market_id, outcome, shares, avg_price, realized_pnl)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(botId, marketId, outcome, Math.max(0, sizeDelta), price);
    } else {
      const newShares = existing.shares + sizeDelta;
      let newAvgPrice = existing.avg_price;
      let realizedPnl = 0;

      if (sizeDelta > 0) {
        // Adding to position — update weighted average price
        const totalCost = existing.shares * existing.avg_price + sizeDelta * price;
        newAvgPrice = newShares > 0 ? totalCost / newShares : 0;
      } else {
        // Reducing position — realize P&L
        const soldShares = Math.abs(sizeDelta);
        realizedPnl = Math.floor(soldShares * (price - existing.avg_price));
      }

      db.prepare(`
        UPDATE positions SET shares = ?, avg_price = ?, realized_pnl = realized_pnl + ?
        WHERE bot_id = ? AND market_id = ? AND outcome = ?
      `).run(Math.max(0, newShares), newAvgPrice, realizedPnl, botId, marketId, outcome);
    }
  }

  cancelOrder(orderId: string, botId: string): boolean {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND bot_id = ?').get(orderId, botId) as any;
    if (!order || order.status === 'filled' || order.status === 'cancelled') return false;

    const now = Date.now();
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run('cancelled', now, orderId);

    // Remove from orderbook
    if (order.side === 'buy') {
      orderbook.removeBid(order.market_id, order.outcome, orderId);
    } else {
      orderbook.removeAsk(order.market_id, order.outcome, orderId);
    }

    return true;
  }
}

export const matchingEngine = new MatchingEngine();
