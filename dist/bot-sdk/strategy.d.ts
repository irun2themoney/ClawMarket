import type { ClawMarket } from '../polymarket/types.js';
export interface TradeSignal {
    action: 'buy' | 'sell' | 'hold';
    marketId: string;
    outcome: 'yes' | 'no';
    size: number;
    price?: number;
    confidence: number;
    reason: string;
}
export interface MarketSnapshot {
    market: ClawMarket;
    polyPriceYes: number;
    polyPriceNo: number;
    clawPriceYes: number;
    clawPriceNo: number;
    volume: number;
}
export interface StrategyContext {
    balance: number;
    positions: Array<{
        marketId: string;
        outcome: string;
        shares: number;
        avgPrice: number;
    }>;
    markets: MarketSnapshot[];
}
/**
 * Base trading strategy interface.
 * Implement this to create custom AI trading strategies.
 */
export interface TradingStrategy {
    name: string;
    evaluate(ctx: StrategyContext): TradeSignal[];
}
/**
 * Default arbitrage strategy: exploits price differences between
 * ClawMarket and Polymarket reference prices.
 */
export declare class PolymarketArbStrategy implements TradingStrategy {
    name: string;
    private threshold;
    private maxPositionFraction;
    evaluate(ctx: StrategyContext): TradeSignal[];
}
