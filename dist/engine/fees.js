import { config } from '../config.js';
/**
 * Calculate the fee for a trade.
 * Fee is a flat percentage of the trade notional value.
 *
 * @param size - Number of shares (in microcents, 6 decimals)
 * @param price - Price per share (0.00 - 1.00)
 * @returns Fee amount in microcents
 */
export function calculateFee(size, price) {
    const notional = size * price;
    const fee = Math.floor(notional * config.feeRate);
    return fee;
}
/**
 * Calculate total cost for a buy order (shares cost + fee).
 * @param size - Number of shares
 * @param price - Price per share
 * @returns Total cost in microcents
 */
export function calculateTotalCost(size, price) {
    const sharesCost = Math.floor(size * price);
    const fee = calculateFee(size, price);
    return sharesCost + fee;
}
/**
 * Calculate proceeds from a sell (shares value - fee).
 * @param size - Number of shares to sell
 * @param price - Price per share
 * @returns Net proceeds in microcents
 */
export function calculateSellProceeds(size, price) {
    const grossProceeds = Math.floor(size * price);
    const fee = calculateFee(size, price);
    return grossProceeds - fee;
}
/**
 * Get the current fee rate.
 */
export function getFeeRate() {
    return config.feeRate;
}
//# sourceMappingURL=fees.js.map