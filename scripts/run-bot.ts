#!/usr/bin/env tsx
/**
 * Run an autonomous trading bot against ClawMarket.
 *
 * Usage:
 *   npx tsx scripts/run-bot.ts                          # default bot
 *   npx tsx scripts/run-bot.ts --name AlphaBot          # named bot
 *   npx tsx scripts/run-bot.ts --name AlphaBot --dry    # dry run (log only)
 *   npx tsx scripts/run-bot.ts --deposit 100            # deposit $100 first
 */
import { ClawMarketBot } from '../dist/bot-sdk/index.js';

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const botName   = getArg('--name') || 'AutoBot-' + Math.random().toString(36).slice(2, 6);
const serverUrl = getArg('--server') || 'http://localhost:3457';
const deposit   = parseFloat(getArg('--deposit') || '0');
const interval  = parseInt(getArg('--interval') || '30000', 10);
const dryRun    = args.includes('--dry');
const maxTrades = parseInt(getArg('--max-trades') || '3', 10);

async function main() {
  console.log(`
  🦞 ClawMarket Auto-Trader
  ─────────────────────────
  Bot:      ${botName}
  Server:   ${serverUrl}
  Interval: ${interval}ms
  Dry Run:  ${dryRun}
  Max/Cycle:${maxTrades}
  `);

  // Connect bot
  const bot = await ClawMarketBot.connect({ name: botName, serverUrl });

  // Deposit if requested
  if (deposit > 0) {
    console.log(`[bot] depositing $${deposit.toFixed(2)}...`);
    const result = await bot.deposit(deposit);
    console.log(`[bot] new balance: $${result.newBalanceUsdc.toFixed(2)}`);
  }

  // Show current state
  const { balance, positions } = await bot.getBalance();
  console.log(`[bot] balance: $${(balance / 1_000_000).toFixed(2)} USDC`);
  console.log(`[bot] positions: ${positions.length}`);

  if (balance <= 0 && !dryRun) {
    console.log('[bot] WARNING: zero balance — deposit funds or use --deposit <amount>');
  }

  // Start auto-trading
  const trader = bot.startAutoTrading(undefined, {
    intervalMs: interval,
    dryRun,
    maxTradesPerCycle: maxTrades,
  });

  console.log(`[bot] auto-trader running. Press Ctrl+C to stop.\n`);

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n[bot] shutting down...');
    trader.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    trader.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[bot] fatal:', err.message);
  process.exit(1);
});
