/**
 * Seed test markets for development.
 * Run with: npm run seed
 */

import 'dotenv/config';
import { v4 as uuid } from 'uuid';
import { getDb } from '../dist/db/index.js';
import { createBotWallet } from '../dist/x402/wallet.js';

const testMarkets = [
  {
    title: 'Will Bitcoin reach $150k by end of 2026?',
    category: 'Crypto',
    price_yes: 0.35,
    description: 'Resolves YES if Bitcoin price exceeds $150,000 USD on any major exchange before January 1, 2027.',
  },
  {
    title: 'Will the US Federal Reserve cut rates in March 2026?',
    category: 'Economics',
    price_yes: 0.62,
    description: 'Resolves YES if the Federal Reserve announces a rate cut at the March 2026 FOMC meeting.',
  },
  {
    title: 'Will SpaceX successfully land Starship on Mars by 2030?',
    category: 'Science',
    price_yes: 0.12,
    description: 'Resolves YES if SpaceX successfully lands a Starship vehicle on Mars before January 1, 2030.',
  },
  {
    title: 'Will AI pass the Turing Test convincingly by 2027?',
    category: 'AI',
    price_yes: 0.48,
    description: 'Resolves YES if an AI system passes a formally administered Turing Test before January 1, 2027.',
  },
  {
    title: 'Will Ethereum flip Bitcoin by market cap in 2026?',
    category: 'Crypto',
    price_yes: 0.08,
    description: 'Resolves YES if Ethereum market capitalization exceeds Bitcoin market capitalization at any point in 2026.',
  },
  {
    title: 'Will there be a US government shutdown in 2026?',
    category: 'Politics',
    price_yes: 0.71,
    description: 'Resolves YES if there is a partial or full US federal government shutdown lasting at least 24 hours in 2026.',
  },
  {
    title: 'Will Apple release AR glasses in 2026?',
    category: 'Tech',
    price_yes: 0.28,
    description: 'Resolves YES if Apple announces and begins shipping dedicated AR glasses (not Vision Pro) before January 1, 2027.',
  },
  {
    title: 'Will global temperatures set a new record in 2026?',
    category: 'Science',
    price_yes: 0.82,
    description: 'Resolves YES if 2026 sets a new record for highest global average temperature according to NASA or NOAA.',
  },
];

function seed() {
  const db = getDb();
  const now = Date.now();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO markets (id, title, description, category, outcome_yes, outcome_no,
      price_yes, price_no, poly_price_yes, poly_price_no, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Yes', 'No', ?, ?, ?, ?, 'active', ?, ?)
  `);

  for (const m of testMarkets) {
    const priceNo = Math.max(0.01, 1 - m.price_yes);
    insert.run(
      uuid(), m.title, m.description, m.category,
      m.price_yes, priceNo,
      m.price_yes, priceNo,
      now, now
    );
  }

  console.log(`Seeded ${testMarkets.length} test markets.`);

  // Also create a test bot if master key is set
  if (process.env.CLAWMARKET_MASTER_KEY) {
    const { address, encryptedKey } = createBotWallet();
    const botId = uuid();
    db.prepare(`
      INSERT OR IGNORE INTO bots (id, name, wallet_address, wallet_encrypted_key, balance_usdc, auto_trade_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(botId, 'TestBot', address.toLowerCase(), encryptedKey, 100_000_000, now, now);

    console.log(`Created test bot: ${botId}`);
    console.log(`Test bot wallet: ${address}`);
    console.log(`Test bot balance: $100.00 USDC`);
  } else {
    console.log('Skipping test bot creation — set CLAWMARKET_MASTER_KEY first.');
  }
}

seed();
