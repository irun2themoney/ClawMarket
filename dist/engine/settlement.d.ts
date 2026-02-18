interface SettlementResult {
    marketId: string;
    resolution: 'yes' | 'no';
    payoutsCount: number;
    totalPayout: number;
}
/**
 * Settle a resolved market: pay out winning positions, zero out losing ones.
 * Winning shares pay $1.00 (1_000_000 microcents) per share.
 * Losing shares pay $0.00.
 */
export declare function settleMarket(marketId: string, resolution: 'yes' | 'no'): SettlementResult;
export {};
