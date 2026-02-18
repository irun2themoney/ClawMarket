import { EventEmitter } from 'eventemitter3';
export interface TradeResult {
    tradeId: string;
    marketId: string;
    outcome: string;
    price: number;
    size: number;
    makerOrderId: string;
    takerOrderId: string;
    makerBotId: string;
    takerBotId: string;
    feeAmount: number;
}
export interface OrderInput {
    botId: string;
    marketId: string;
    side: 'buy' | 'sell';
    outcome: 'yes' | 'no';
    orderType: 'limit' | 'market';
    price?: number;
    size: number;
}
interface MatchingEvents {
    'trade': (trade: TradeResult) => void;
    'order-placed': (order: {
        orderId: string;
        marketId: string;
        botId: string;
    }) => void;
    'order-filled': (order: {
        orderId: string;
    }) => void;
}
export declare class MatchingEngine extends EventEmitter<MatchingEvents> {
    /**
     * Submit an order to the matching engine.
     * Returns the order ID and any immediate fills.
     */
    submitOrder(input: OrderInput): {
        orderId: string;
        fills: TradeResult[];
    };
    private matchOrder;
    private updatePosition;
    cancelOrder(orderId: string, botId: string): boolean;
}
export declare const matchingEngine: MatchingEngine;
export {};
