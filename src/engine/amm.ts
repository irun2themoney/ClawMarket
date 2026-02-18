import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { calculateFee } from './fees.js';

const HOUSE_BOT_ID = '__HOUSE__';
const AMM_SPREAD = 0.02; // 2 cent spread on top of poly reference price

export interface AmmFill {
  tradeId: string;
  marketId: string;
  outcome: string;
  price: number;
  size: number;
  feeAmount: number;
  source: 'amm';
}

/**
 * Ensure the __HOUSE__ bot exists in the bots table.
 * Called lazily on first AMM trade so foreign key constraints are satisfied.
 */
function ensureHouseBot(): void {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM bots WHERE id = ?').get(HOUSE_BOT_ID);
  if (!exists) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO bots (id, name, openclaw_agent_id, wallet_address, wallet_encrypted_key, balance_usdc, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, 0, ?, ?)
    `).run(HOUSE_BOT_ID, 'House AMM', `house-amm-${HOUSE_BOT_ID}`, 'none', now, now);
  }
}

/**
 * Get the AMM price for an outcome.
 * Uses the Polymarket reference price + a spread.
 * If no reference price, defaults to 0.50.
 */
export function getAmmPrice(marketId: string, outcome: 'yes' | 'no', side: 'buy' | 'sell'): number {
  const db = getDb();
  const market = db.prepare('SELECT poly_price_yes, poly_price_no, price_yes, price_no FROM markets WHERE id = ?')
    .get(marketId) as { poly_price_yes: number | null; poly_price_no: number | null; price_yes: number | null; price_no: number | null } | undefined;

  if (!market) return 0.50;

  // Use poly reference price if available, otherwise use internal price
  let basePrice: number;
  if (outcome === 'yes') {
    basePrice = market.poly_price_yes || market.price_yes || 0.50;
  } else {
    basePrice = market.poly_price_no || market.price_no || 0.50;
  }

  // Apply spread: buyers pay more, sellers get less
  if (side === 'buy') {
    return Math.min(0.99, basePrice + AMM_SPREAD);
  } else {
    return Math.max(0.01, basePrice - AMM_SPREAD);
  }
}

/**
 * Execute an AMM fill — mint new shares for a buyer.
 * The house takes the opposite position.
 *
 * @param botId - The buyer's bot ID
 * @param marketId - The market to trade on
 * @param outcome - 'yes' or 'no'
 * @param size - Number of shares to buy
 * @param maxPrice - Optional limit price; AMM won't fill above this
 * @param takerOrderId - The taker's order ID (for trade records)
 */
export function ammBuy(
  botId: string,
  marketId: string,
  outcome: 'yes' | 'no',
  size: number,
  maxPrice?: number,
  takerOrderId?: string,
): AmmFill | null {
  const db = getDb();
  const ammPrice = getAmmPrice(marketId, outcome, 'buy');

  // Check if buyer's limit price allows this fill
  if (maxPrice !== undefined && ammPrice > maxPrice) {
    return null; // Price too high for buyer's limit
  }

  const feeAmount = calculateFee(size, ammPrice);
  const cost = Math.floor(size * ammPrice) + feeAmount;
  const now = Date.now();
  const tradeId = uuid();

  // Check buyer has sufficient balance
  const buyer = db.prepare('SELECT balance_usdc FROM bots WHERE id = ?').get(botId) as { balance_usdc: number } | undefined;
  if (!buyer || buyer.balance_usdc < cost) {
    return null; // Insufficient balance
  }

  // Ensure house bot exists for FK constraints
  ensureHouseBot();

  // Deduct cost from buyer
  db.prepare('UPDATE bots SET balance_usdc = balance_usdc - ?, updated_at = ? WHERE id = ?')
    .run(cost, now, botId);

  // Create/update buyer's position
  updatePosition(db, botId, marketId, outcome, size, ammPrice);

  // Create/update house's opposite position (house holds the other side)
  const oppositeOutcome = outcome === 'yes' ? 'no' : 'yes';
  const oppositePrice = Math.max(0.01, Math.min(0.99, 1 - ammPrice));
  updatePosition(db, HOUSE_BOT_ID, marketId, oppositeOutcome, size, oppositePrice);

  // Record the trade (use NULL for maker_order_id since AMM has no order)
  db.prepare(`
    INSERT INTO trades (id, market_id, maker_order_id, taker_order_id, maker_bot_id, taker_bot_id,
      outcome, price, size, fee_amount, fee_rate, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tradeId, marketId, takerOrderId || null, HOUSE_BOT_ID, botId,
    outcome, ammPrice, size, feeAmount, 0.02, now);

  // Record fee in treasury
  const currentTreasury = db.prepare('SELECT COALESCE(MAX(balance_after), 0) as bal FROM treasury').get() as { bal: number };
  const newBalance = (currentTreasury?.bal || 0) + feeAmount;
  db.prepare('INSERT INTO treasury (id, trade_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), tradeId, feeAmount, newBalance, now);

  // Update market volume and price
  db.prepare('UPDATE markets SET volume_total = volume_total + ?, updated_at = ? WHERE id = ?')
    .run(size, now, marketId);

  if (outcome === 'yes') {
    db.prepare('UPDATE markets SET price_yes = ?, price_no = ?, updated_at = ? WHERE id = ?')
      .run(ammPrice, Math.max(0.01, 1 - ammPrice), now, marketId);
  } else {
    db.prepare('UPDATE markets SET price_no = ?, price_yes = ?, updated_at = ? WHERE id = ?')
      .run(ammPrice, Math.max(0.01, 1 - ammPrice), now, marketId);
  }

  return { tradeId, marketId, outcome, price: ammPrice, size, feeAmount, source: 'amm' };
}

/**
 * AMM sell — house buys back shares at a discount.
 *
 * @param botId - The seller's bot ID
 * @param marketId - The market to trade on
 * @param outcome - 'yes' or 'no'
 * @param size - Number of shares to sell
 * @param minPrice - Optional minimum price; AMM won't fill below this
 * @param takerOrderId - The taker's order ID (for trade records)
 */
export function ammSell(
  botId: string,
  marketId: string,
  outcome: 'yes' | 'no',
  size: number,
  minPrice?: number,
  takerOrderId?: string,
): AmmFill | null {
  const db = getDb();
  const ammPrice = getAmmPrice(marketId, outcome, 'sell');

  // Check seller's minimum price
  if (minPrice !== undefined && ammPrice < minPrice) {
    return null;
  }

  // Check seller has shares
  const position = db.prepare(
    'SELECT shares FROM positions WHERE bot_id = ? AND market_id = ? AND outcome = ?'
  ).get(botId, marketId, outcome) as { shares: number } | undefined;

  if (!position || position.shares < size) {
    return null;
  }

  const feeAmount = calculateFee(size, ammPrice);
  const proceeds = Math.floor(size * ammPrice) - feeAmount;
  const now = Date.now();
  const tradeId = uuid();

  // Ensure house bot exists for FK constraints
  ensureHouseBot();

  // Pay seller
  db.prepare('UPDATE bots SET balance_usdc = balance_usdc + ?, updated_at = ? WHERE id = ?')
    .run(proceeds, now, botId);

  // Reduce seller's position
  updatePosition(db, botId, marketId, outcome, -size, ammPrice);

  // House absorbs the shares
  updatePosition(db, HOUSE_BOT_ID, marketId, outcome, size, ammPrice);

  // Record trade (use NULL for maker_order_id since AMM has no order)
  db.prepare(`
    INSERT INTO trades (id, market_id, maker_order_id, taker_order_id, maker_bot_id, taker_bot_id,
      outcome, price, size, fee_amount, fee_rate, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tradeId, marketId, takerOrderId || null, botId, HOUSE_BOT_ID,
    outcome, ammPrice, size, feeAmount, 0.02, now);

  // Record fee in treasury
  const currentTreasury = db.prepare('SELECT COALESCE(MAX(balance_after), 0) as bal FROM treasury').get() as { bal: number };
  const newBalance = (currentTreasury?.bal || 0) + feeAmount;
  db.prepare('INSERT INTO treasury (id, trade_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), tradeId, feeAmount, newBalance, now);

  // Update market volume
  db.prepare('UPDATE markets SET volume_total = volume_total + ?, updated_at = ? WHERE id = ?')
    .run(size, now, marketId);

  return { tradeId, marketId, outcome, price: ammPrice, size, feeAmount, source: 'amm' };
}

function updatePosition(db: ReturnType<typeof getDb>, botId: string, marketId: string, outcome: string, sizeDelta: number, price: number): void {
  const existing = db.prepare(
    'SELECT shares, avg_price FROM positions WHERE bot_id = ? AND market_id = ? AND outcome = ?'
  ).get(botId, marketId, outcome) as { shares: number; avg_price: number } | undefined;

  if (!existing) {
    if (sizeDelta > 0) {
      db.prepare('INSERT INTO positions (bot_id, market_id, outcome, shares, avg_price, realized_pnl) VALUES (?, ?, ?, ?, ?, 0)')
        .run(botId, marketId, outcome, sizeDelta, price);
    }
  } else {
    const newShares = existing.shares + sizeDelta;
    let newAvgPrice = existing.avg_price;
    let realizedPnl = 0;

    if (sizeDelta > 0 && newShares > 0) {
      const totalCost = existing.shares * existing.avg_price + sizeDelta * price;
      newAvgPrice = totalCost / newShares;
    } else if (sizeDelta < 0) {
      realizedPnl = Math.floor(Math.abs(sizeDelta) * (price - existing.avg_price));
    }

    db.prepare('UPDATE positions SET shares = ?, avg_price = ?, realized_pnl = realized_pnl + ? WHERE bot_id = ? AND market_id = ? AND outcome = ?')
      .run(Math.max(0, newShares), newAvgPrice, realizedPnl, botId, marketId, outcome);
  }
}

export { HOUSE_BOT_ID };
