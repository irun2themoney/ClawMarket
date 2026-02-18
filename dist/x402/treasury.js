var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getDb } from '../db/index.js';
import { getUsdcBalance, transferUsdc } from './wallet.js';
import { config } from '../config.js';
/**
 * Get treasury statistics.
 */
export function getTreasuryStats() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = getDb();
        const totals = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_fees,
      COALESCE(MAX(balance_after), 0) as current_balance
    FROM treasury
  `).get();
        let onChainBalance = '0';
        if (config.treasuryAddress) {
            try {
                const bal = yield getUsdcBalance(config.treasuryAddress);
                onChainBalance = bal.toString();
            }
            catch (_a) {
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
    });
}
/**
 * Get recent treasury transactions.
 */
export function getRecentTreasuryEntries(limit = 50) {
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
export function withdrawTreasury(amount, toAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!config.treasuryPrivateKey) {
            throw new Error('Treasury private key not configured');
        }
        // Use the treasury wallet's encrypted key for transfer
        // For treasury, we store the key directly in config (not in DB)
        const txHash = yield transferUsdc(config.treasuryPrivateKey, // This should be the encrypted key
        toAddress, amount);
        return txHash;
    });
}
//# sourceMappingURL=treasury.js.map