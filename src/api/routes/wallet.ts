import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../db/index.js';
import { createBotWallet, getUsdcBalance } from '../../x402/wallet.js';
import { config } from '../../config.js';

export const walletRouter = Router();

// POST /api/bots/register — register a new bot + auto-create wallet
walletRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, agentId } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const db = getDb();

    // Check if agent already registered
    if (agentId) {
      const existing = db.prepare('SELECT id, wallet_address, balance_usdc FROM bots WHERE openclaw_agent_id = ?').get(agentId) as any;
      if (existing) {
        res.json({
          botId: existing.id,
          walletAddress: existing.wallet_address,
          balance: existing.balance_usdc,
          message: 'Bot already registered',
          existing: true,
        });
        return;
      }
    }

    // Check if name already registered
    const existingName = db.prepare('SELECT id, wallet_address, balance_usdc FROM bots WHERE name = ?').get(name) as any;
    if (existingName) {
      res.json({
        botId: existingName.id,
        walletAddress: existingName.wallet_address,
        balance: existingName.balance_usdc,
        message: 'Bot already registered',
        existing: true,
      });
      return;
    }

    // Generate wallet
    const { address, encryptedKey } = createBotWallet();
    const botId = uuid();
    const now = Date.now();
    const initialBalance = config.defaultBotBalance;

    db.prepare(`
      INSERT INTO bots (id, name, openclaw_agent_id, wallet_address, wallet_encrypted_key, balance_usdc, auto_trade_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(botId, name, agentId || null, address.toLowerCase(), encryptedKey, initialBalance, now, now);

    console.log(`[wallet] registered bot "${name}" (${botId}) with wallet ${address}, balance: $${(initialBalance / 1_000_000).toFixed(2)}`);

    res.json({
      botId,
      walletAddress: address,
      balance: initialBalance,
      message: `Bot registered with $${(initialBalance / 1_000_000).toFixed(2)} USDC starting balance.`,
      existing: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bots/:id/deposit — add funds to bot balance (dev mode / admin)
walletRouter.post('/:id/deposit', (req: Request, res: Response) => {
  const { amount } = req.body;
  const botId = req.params.id;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number (in USDC, e.g. 100 for $100)' });
    return;
  }

  const db = getDb();
  const bot = db.prepare('SELECT id, name, balance_usdc FROM bots WHERE id = ?').get(botId) as any;

  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const amountMicro = Math.floor(amount * 1_000_000);
  const now = Date.now();

  db.prepare('UPDATE bots SET balance_usdc = balance_usdc + ?, updated_at = ? WHERE id = ?')
    .run(amountMicro, now, botId);

  // Record transaction
  db.prepare(
    'INSERT INTO transactions (id, bot_id, type, amount, chain, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uuid(), botId, 'deposit', amountMicro, 'internal', 'confirmed', now);

  const newBalance = bot.balance_usdc + amountMicro;
  console.log(`[wallet] deposited $${amount.toFixed(2)} to bot "${bot.name}" (${botId}), new balance: $${(newBalance / 1_000_000).toFixed(2)}`);

  res.json({
    botId,
    deposited: amountMicro,
    depositedUsdc: amount,
    newBalance,
    newBalanceUsdc: newBalance / 1_000_000,
  });
});

// GET /api/bots/:id/key — get encrypted key for SDK (requires bot auth)
walletRouter.get('/:id/key', (req: Request, res: Response) => {
  const botId = req.params.id;
  const authBotId = req.headers['x-bot-id'] as string;

  // Only allow bot to retrieve its own key
  if (authBotId !== botId) {
    res.status(403).json({ error: 'Can only retrieve your own key' });
    return;
  }

  const db = getDb();
  const bot = db.prepare('SELECT wallet_encrypted_key FROM bots WHERE id = ?').get(botId) as any;

  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  res.json({ encryptedKey: bot.wallet_encrypted_key });
});

// GET /api/wallet/:botId/address — get deposit address
walletRouter.get('/:botId/address', (req: Request, res: Response) => {
  const db = getDb();
  const bot = db.prepare('SELECT wallet_address FROM bots WHERE id = ?').get(req.params.botId) as any;

  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  res.json({
    walletAddress: bot.wallet_address,
    chain: 'Base L2 (eip155:8453)',
    currency: 'USDC',
    instructions: 'Send USDC to this address on Base L2 to fund your trading account.',
  });
});

// GET /api/wallet/:botId/onchain — get on-chain USDC balance
walletRouter.get('/:botId/onchain', async (req: Request, res: Response) => {
  const db = getDb();
  const bot = db.prepare('SELECT wallet_address FROM bots WHERE id = ?').get(req.params.botId) as any;

  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  try {
    const balance = await getUsdcBalance(bot.wallet_address);
    res.json({
      walletAddress: bot.wallet_address,
      onChainBalance: balance.toString(),
      onChainBalanceUsdc: (Number(balance) / 1_000_000).toFixed(6),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to query on-chain balance: ${err.message}` });
  }
});
