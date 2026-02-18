import WebSocket from 'ws';
import { EventEmitter } from 'eventemitter3';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { ClawMarket } from './types.js';

interface PriceEvents {
  'price-update': (data: { marketId: string; priceYes: number; priceNo: number }) => void;
  'connected': () => void;
  'disconnected': () => void;
}

export class PolymarketPriceFeed extends EventEmitter<PriceEvents> {
  private ws: WebSocket | null = null;
  private subscribedTokens = new Set<string>();
  private tokenToMarketId = new Map<string, string>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private alive = false;

  start(): void {
    this.connect();
  }

  stop(): void {
    this.alive = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    this.alive = true;
    console.log('[prices] connecting to Polymarket WebSocket...');

    this.ws = new WebSocket(config.polyClobWs);

    this.ws.on('open', () => {
      console.log('[prices] connected');
      this.emit('connected');
      this.subscribeToActiveMarkets();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      console.log('[prices] disconnected');
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[prices] WebSocket error:', err.message);
    });
  }

  private scheduleReconnect(): void {
    if (!this.alive) return;
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  private subscribeToActiveMarkets(): void {
    const db = getDb();
    const markets = db.prepare(
      `SELECT id, poly_token_id_yes, poly_token_id_no FROM markets WHERE status = 'active' AND poly_token_id_yes IS NOT NULL`
    ).all() as Pick<ClawMarket, 'id' | 'poly_token_id_yes' | 'poly_token_id_no'>[];

    const assetIds: string[] = [];

    for (const m of markets) {
      if (m.poly_token_id_yes) {
        assetIds.push(m.poly_token_id_yes);
        this.tokenToMarketId.set(m.poly_token_id_yes, m.id);
        this.subscribedTokens.add(m.poly_token_id_yes);
      }
      if (m.poly_token_id_no) {
        assetIds.push(m.poly_token_id_no);
        this.tokenToMarketId.set(m.poly_token_id_no, m.id);
        this.subscribedTokens.add(m.poly_token_id_no);
      }
    }

    if (assetIds.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const batchSize = 100;
      for (let i = 0; i < assetIds.length; i += batchSize) {
        const batch = assetIds.slice(i, i + batchSize);
        this.ws.send(JSON.stringify({
          assets_ids: batch,
          type: 'market',
        }));
      }
      console.log(`[prices] subscribed to ${assetIds.length} tokens across ${markets.length} markets`);
    }
  }

  subscribeToMarket(marketId: string, tokenYes: string, tokenNo: string): void {
    this.tokenToMarketId.set(tokenYes, marketId);
    this.tokenToMarketId.set(tokenNo, marketId);

    const newTokens: string[] = [];
    if (!this.subscribedTokens.has(tokenYes)) {
      this.subscribedTokens.add(tokenYes);
      newTokens.push(tokenYes);
    }
    if (!this.subscribedTokens.has(tokenNo)) {
      this.subscribedTokens.add(tokenNo);
      newTokens.push(tokenNo);
    }

    if (newTokens.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        assets_ids: newTokens,
        type: 'market',
      }));
    }
  }

  private handleMessage(msg: any): void {
    if (!msg || !Array.isArray(msg)) {
      this.processPriceEvent(msg);
      return;
    }
    for (const event of msg) {
      this.processPriceEvent(event);
    }
  }

  private processPriceEvent(event: any): void {
    if (!event?.asset_id) return;

    const marketId = this.tokenToMarketId.get(event.asset_id);
    if (!marketId) return;

    const db = getDb();
    const market = db.prepare('SELECT poly_token_id_yes, poly_token_id_no FROM markets WHERE id = ?')
      .get(marketId) as Pick<ClawMarket, 'poly_token_id_yes' | 'poly_token_id_no'> | undefined;
    if (!market) return;

    const price = parseFloat(event.price || '0');
    if (isNaN(price) || price <= 0 || price >= 1) return;

    let priceYes: number;
    let priceNo: number;

    if (event.asset_id === market.poly_token_id_yes) {
      priceYes = price;
      priceNo = Math.max(0.01, 1 - price);
    } else {
      priceNo = price;
      priceYes = Math.max(0.01, 1 - price);
    }

    db.prepare('UPDATE markets SET poly_price_yes = ?, poly_price_no = ?, updated_at = ? WHERE id = ?')
      .run(priceYes, priceNo, Date.now(), marketId);

    this.emit('price-update', { marketId, priceYes, priceNo });
  }
}
