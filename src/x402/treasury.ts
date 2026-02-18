import { getDb } from '../db/index.js';
import { getUsdcBalance, transferUsdc } from './wallet.js';
import { config } from '../config.js';

export interface TreasuryStats {
  totalFeesCollected: number;     // microcents
  treasuryBalance: number;        // microcents (from DB ledger)
  onChainBalance: string;         // USDC on-chain (raw bigint as string)
  feeRate: number;
  walletAddress: string;
}

/**
 * Get treasury statistics.
 */
export async function getTreasuryStats(): Promise<TreasuryStats> {
  const db = getDb();

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_fees,
      COALESCE(MAX(balance_after), 0) as current_balance
    FROM treasury
  `).get() as { total_fees: number; current_balance: number };

  let onChainBalance = '0';
  if (config.treasuryAddress) {
    try {
      const bal = await getUsdcBalance(config.treasuryAddress);
      onChainBalance = bal.toString();
    } catch {
      // RPC may be unavailable
    }
  }

  return {
    totalFeesCollected: totals.total_fees,
    treasuryBalance: totals.current_balance,
    onChainBalance,
    feeRate: config.feeRate,
    walletAddress: config.treasuryAddress,
  };
}

/**
 * Get recent treasury transactions.
 */
export function getRecentTreasuryEntries(limit = 50): any[] {
  const db = getDb();
  return db.prepare(`
    SELECT t.*, tr.market_id, tr.outcome, tr.price, tr.size
    FROM treasury t
    LEFT JOIN trades tr ON t.trade_id = tr.id
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Withdraw from treasury to an external address.
 * Only callable by admin.
 */
export async function withdrawTreasury(amount: bigint, toAddress: string): Promise<string> {
  if (!config.treasuryPrivateKey) {
    throw new Error('Treasury private key not configured');
  }

  // Use the treasury wallet's encrypted key for transfer
  // For treasury, we store the key directly in config (not in DB)
  const txHash = await transferUsdc(
    config.treasuryPrivateKey, // This should be the encrypted key
    toAddress,
    amount
  );

  return txHash;
}
