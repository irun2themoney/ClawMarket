/**
 * Calculate the fee for a trade.
 * Fee is a flat percentage of the trade notional value.
 *
 * @param size - Number of shares (in microcents, 6 decimals)
 * @param price - Price per share (0.00 - 1.00)
 * @returns Fee amount in microcents
 */
export declare function calculateFee(size: number, price: number): number;
/**
 * Calculate total cost for a buy order (shares cost + fee).
 * @param size - Number of shares
 * @param price - Price per share
 * @returns Total cost in microcents
 */
export declare function calculateTotalCost(size: number, price: number): number;
/**
 * Calculate proceeds from a sell (shares value - fee).
 * @param size - Number of shares to sell
 * @param price - Price per share
 * @returns Net proceeds in microcents
 */
export declare function calculateSellProceeds(size: number, price: number): number;
/**
 * Get the current fee rate.
 */
export declare function getFeeRate(): number;
