export interface TreasuryStats {
    totalFeesCollected: number;
    treasuryBalance: number;
    onChainBalance: string;
    feeRate: number;
    walletAddress: string;
}
/**
 * Get treasury statistics.
 */
export declare function getTreasuryStats(): Promise<TreasuryStats>;
/**
 * Get recent treasury transactions.
 */
export declare function getRecentTreasuryEntries(limit?: number): any[];
/**
 * Withdraw from treasury to an external address.
 * Only callable by admin.
 */
export declare function withdrawTreasury(amount: bigint, toAddress: string): Promise<string>;
