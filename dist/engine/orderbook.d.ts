export interface OrderbookEntry {
    orderId: string;
    botId: string;
    price: number;
    size: number;
    timestamp: number;
}
export interface OrderbookSnapshot {
    marketId: string;
    outcome: string;
    bids: OrderbookEntry[];
    asks: OrderbookEntry[];
}
export declare class Orderbook {
    private books;
    private key;
    private getOrCreate;
    addBid(marketId: string, outcome: string, entry: OrderbookEntry): void;
    addAsk(marketId: string, outcome: string, entry: OrderbookEntry): void;
    getBestBid(marketId: string, outcome: string): OrderbookEntry | undefined;
    getBestAsk(marketId: string, outcome: string): OrderbookEntry | undefined;
    removeBid(marketId: string, outcome: string, orderId: string): void;
    removeAsk(marketId: string, outcome: string, orderId: string): void;
    updateSize(marketId: string, outcome: string, orderId: string, newSize: number): void;
    getSnapshot(marketId: string, outcome: string): OrderbookSnapshot;
    clearMarket(marketId: string): void;
    getMidpoint(marketId: string, outcome: string): number | null;
}
export declare const orderbook: Orderbook;
