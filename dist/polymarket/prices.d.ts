import { EventEmitter } from 'eventemitter3';
interface PriceEvents {
    'price-update': (data: {
        marketId: string;
        priceYes: number;
        priceNo: number;
    }) => void;
    'connected': () => void;
    'disconnected': () => void;
}
export declare class PolymarketPriceFeed extends EventEmitter<PriceEvents> {
    private ws;
    private subscribedTokens;
    private tokenToMarketId;
    private reconnectTimer;
    private alive;
    start(): void;
    stop(): void;
    private connect;
    private scheduleReconnect;
    private subscribeToActiveMarkets;
    subscribeToMarket(marketId: string, tokenYes: string, tokenNo: string): void;
    private handleMessage;
    private processPriceEvent;
}
export {};
