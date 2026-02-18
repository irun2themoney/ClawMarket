declare const HOUSE_BOT_ID = "__HOUSE__";
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
 * Get the AMM price for an outcome.
 * Uses the Polymarket reference price + a spread.
 * If no reference price, defaults to 0.50.
 */
export declare function getAmmPrice(marketId: string, outcome: 'yes' | 'no', side: 'buy' | 'sell'): number;
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
export declare function ammBuy(botId: string, marketId: string, outcome: 'yes' | 'no', size: number, maxPrice?: number, takerOrderId?: string): AmmFill | null;
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
export declare function ammSell(botId: string, marketId: string, outcome: 'yes' | 'no', size: number, minPrice?: number, takerOrderId?: string): AmmFill | null;
export { HOUSE_BOT_ID };
