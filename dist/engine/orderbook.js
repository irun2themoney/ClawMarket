export class Orderbook {
    constructor() {
        // marketId:outcome -> { bids, asks }
        this.books = new Map();
    }
    key(marketId, outcome) {
        return `${marketId}:${outcome}`;
    }
    getOrCreate(marketId, outcome) {
        const k = this.key(marketId, outcome);
        let book = this.books.get(k);
        if (!book) {
            book = { bids: [], asks: [] };
            this.books.set(k, book);
        }
        return book;
    }
    addBid(marketId, outcome, entry) {
        const book = this.getOrCreate(marketId, outcome);
        book.bids.push(entry);
        // Sort descending by price, then ascending by timestamp (price-time priority)
        book.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    }
    addAsk(marketId, outcome, entry) {
        const book = this.getOrCreate(marketId, outcome);
        book.asks.push(entry);
        // Sort ascending by price, then ascending by timestamp
        book.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
    }
    getBestBid(marketId, outcome) {
        return this.getOrCreate(marketId, outcome).bids[0];
    }
    getBestAsk(marketId, outcome) {
        return this.getOrCreate(marketId, outcome).asks[0];
    }
    removeBid(marketId, outcome, orderId) {
        const book = this.getOrCreate(marketId, outcome);
        book.bids = book.bids.filter(b => b.orderId !== orderId);
    }
    removeAsk(marketId, outcome, orderId) {
        const book = this.getOrCreate(marketId, outcome);
        book.asks = book.asks.filter(a => a.orderId !== orderId);
    }
    updateSize(marketId, outcome, orderId, newSize) {
        const book = this.getOrCreate(marketId, outcome);
        for (const entry of [...book.bids, ...book.asks]) {
            if (entry.orderId === orderId) {
                entry.size = newSize;
                return;
            }
        }
    }
    getSnapshot(marketId, outcome) {
        const book = this.getOrCreate(marketId, outcome);
        return {
            marketId,
            outcome,
            bids: [...book.bids],
            asks: [...book.asks],
        };
    }
    clearMarket(marketId) {
        for (const key of this.books.keys()) {
            if (key.startsWith(marketId + ':')) {
                this.books.delete(key);
            }
        }
    }
    getMidpoint(marketId, outcome) {
        var _a, _b;
        const bestBid = this.getBestBid(marketId, outcome);
        const bestAsk = this.getBestAsk(marketId, outcome);
        if (bestBid && bestAsk) {
            return (bestBid.price + bestAsk.price) / 2;
        }
        return (_b = (_a = bestBid === null || bestBid === void 0 ? void 0 : bestBid.price) !== null && _a !== void 0 ? _a : bestAsk === null || bestAsk === void 0 ? void 0 : bestAsk.price) !== null && _b !== void 0 ? _b : null;
    }
}
// Singleton orderbook instance
export const orderbook = new Orderbook();
//# sourceMappingURL=orderbook.js.map