export interface OrderbookEntry {
  orderId: string;
  botId: string;
  price: number;
  size: number;        // remaining unfilled size
  timestamp: number;
}

export interface OrderbookSnapshot {
  marketId: string;
  outcome: string;
  bids: OrderbookEntry[];  // sorted price descending (best bid first)
  asks: OrderbookEntry[];  // sorted price ascending (best ask first)
}

export class Orderbook {
  // marketId:outcome -> { bids, asks }
  private books = new Map<string, { bids: OrderbookEntry[]; asks: OrderbookEntry[] }>();

  private key(marketId: string, outcome: string): string {
    return `${marketId}:${outcome}`;
  }

  private getOrCreate(marketId: string, outcome: string) {
    const k = this.key(marketId, outcome);
    let book = this.books.get(k);
    if (!book) {
      book = { bids: [], asks: [] };
      this.books.set(k, book);
    }
    return book;
  }

  addBid(marketId: string, outcome: string, entry: OrderbookEntry): void {
    const book = this.getOrCreate(marketId, outcome);
    book.bids.push(entry);
    // Sort descending by price, then ascending by timestamp (price-time priority)
    book.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
  }

  addAsk(marketId: string, outcome: string, entry: OrderbookEntry): void {
    const book = this.getOrCreate(marketId, outcome);
    book.asks.push(entry);
    // Sort ascending by price, then ascending by timestamp
    book.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
  }

  getBestBid(marketId: string, outcome: string): OrderbookEntry | undefined {
    return this.getOrCreate(marketId, outcome).bids[0];
  }

  getBestAsk(marketId: string, outcome: string): OrderbookEntry | undefined {
    return this.getOrCreate(marketId, outcome).asks[0];
  }

  removeBid(marketId: string, outcome: string, orderId: string): void {
    const book = this.getOrCreate(marketId, outcome);
    book.bids = book.bids.filter(b => b.orderId !== orderId);
  }

  removeAsk(marketId: string, outcome: string, orderId: string): void {
    const book = this.getOrCreate(marketId, outcome);
    book.asks = book.asks.filter(a => a.orderId !== orderId);
  }

  updateSize(marketId: string, outcome: string, orderId: string, newSize: number): void {
    const book = this.getOrCreate(marketId, outcome);
    for (const entry of [...book.bids, ...book.asks]) {
      if (entry.orderId === orderId) {
        entry.size = newSize;
        return;
      }
    }
  }

  getSnapshot(marketId: string, outcome: string): OrderbookSnapshot {
    const book = this.getOrCreate(marketId, outcome);
    return {
      marketId,
      outcome,
      bids: [...book.bids],
      asks: [...book.asks],
    };
  }

  clearMarket(marketId: string): void {
    for (const key of this.books.keys()) {
      if (key.startsWith(marketId + ':')) {
        this.books.delete(key);
      }
    }
  }

  getMidpoint(marketId: string, outcome: string): number | null {
    const bestBid = this.getBestBid(marketId, outcome);
    const bestAsk = this.getBestAsk(marketId, outcome);
    if (bestBid && bestAsk) {
      return (bestBid.price + bestAsk.price) / 2;
    }
    return bestBid?.price ?? bestAsk?.price ?? null;
  }
}

// Singleton orderbook instance
export const orderbook = new Orderbook();
