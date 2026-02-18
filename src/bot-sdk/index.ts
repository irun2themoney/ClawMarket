import { X402Client } from './x402-client.js';
import { AutoTrader } from './auto-trader.js';
import type { TradingStrategy } from './strategy.js';

export interface BotConnectOptions {
  name: string;
  agentId?: string;
  serverUrl?: string;
}

interface Market {
  id: string;
  title: string;
  price_yes: number;
  price_no: number;
  poly_price_yes: number | null;
  poly_price_no: number | null;
  volume_total: number;
  status: string;
  category: string | null;
  [key: string]: any;
}

interface Position {
  market_id: string;
  outcome: string;
  shares: number;
  avg_price: number;
  realized_pnl: number;
  market_title?: string;
  [key: string]: any;
}

interface Order {
  orderId: string;
  fills: any[];
  fillCount: number;
  totalFilled: number;
  totalFees: number;
  status: string;
}

/**
 * ClawMarketBot — plug-and-play SDK for OpenClaw bots to trade on ClawMarket.
 *
 * Usage:
 *   const bot = await ClawMarketBot.connect({ name: "AlphaBot" });
 *   const markets = await bot.getMarkets();
 *   await bot.buy(markets[0].id, "yes", 1000000, 0.45);
 */
export class ClawMarketBot {
  private client: X402Client;
  private botId: string;
  private walletAddress: string;
  private serverUrl: string;
  private autoTrader: AutoTrader | null = null;

  private constructor(client: X402Client, botId: string, walletAddress: string, serverUrl: string) {
    this.client = client;
    this.botId = botId;
    this.walletAddress = walletAddress;
    this.serverUrl = serverUrl;
  }

  /**
   * Connect to ClawMarket. Auto-registers and creates a wallet if needed.
   */
  static async connect(opts: BotConnectOptions): Promise<ClawMarketBot> {
    const serverUrl = opts.serverUrl || 'http://localhost:3457';

    // Register bot (idempotent — returns existing if name/agentId matches)
    const regRes = await fetch(`${serverUrl}/api/bots/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: opts.name, agentId: opts.agentId }),
    });

    if (!regRes.ok) {
      throw new Error(`Registration failed: ${await regRes.text()}`);
    }

    const reg = await regRes.json();

    // Fetch the encrypted key for x402 signing
    let encryptedKey = '';
    try {
      const keyRes = await fetch(`${serverUrl}/api/bots/${reg.botId}/key`, {
        headers: { 'X-Bot-Id': reg.botId },
      });
      if (keyRes.ok) {
        const keyData = await keyRes.json();
        encryptedKey = keyData.encryptedKey || '';
      }
    } catch {
      // Key retrieval failed — will work in dev mode without it
    }

    const client = new X402Client({
      baseUrl: serverUrl,
      botId: reg.botId,
      encryptedKey,
      walletAddress: reg.walletAddress,
    });

    const bot = new ClawMarketBot(client, reg.botId, reg.walletAddress, serverUrl);

    console.log(`[bot] connected as "${opts.name}" (${reg.botId})`);
    console.log(`[bot] wallet: ${reg.walletAddress}`);
    console.log(`[bot] balance: $${((reg.balance || 0) / 1_000_000).toFixed(2)} USDC`);
    if (!reg.existing) {
      console.log(`[bot] new bot created with starting balance.`);
    }

    return bot;
  }

  // --- Identity ---
  getId(): string { return this.botId; }
  getWalletAddress(): string { return this.walletAddress; }
  getServerUrl(): string { return this.serverUrl; }

  // --- Markets (free) ---
  async getMarkets(filter?: { status?: string; category?: string; search?: string; limit?: number }): Promise<Market[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.category) params.set('category', filter.category);
    if (filter?.search) params.set('search', filter.search);
    if (filter?.limit) params.set('limit', filter.limit.toString());
    const qs = params.toString();
    const result = await this.client.get(`/api/markets${qs ? '?' + qs : ''}`);
    return result.markets;
  }

  async getMarket(id: string): Promise<{ market: Market; orderbook: any }> {
    return this.client.get(`/api/markets/${id}`);
  }

  async getPolymarketPrice(marketId: string): Promise<{ yes: number; no: number }> {
    const { market } = await this.getMarket(marketId);
    return {
      yes: market.poly_price_yes || 0.5,
      no: market.poly_price_no || 0.5,
    };
  }

  // --- Trading ---
  async buy(marketId: string, outcome: 'yes' | 'no', size: number, limitPrice?: number): Promise<Order> {
    return this.client.post('/api/orders', {
      marketId,
      side: 'buy',
      outcome,
      size,
      orderType: limitPrice !== undefined ? 'limit' : 'market',
      price: limitPrice,
    });
  }

  async sell(marketId: string, outcome: 'yes' | 'no', shares: number, limitPrice?: number): Promise<Order> {
    return this.client.post('/api/orders', {
      marketId,
      side: 'sell',
      outcome,
      size: shares,
      orderType: limitPrice !== undefined ? 'limit' : 'market',
      price: limitPrice,
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.client.del(`/api/orders/${orderId}`);
  }

  // --- Portfolio ---
  async getBalance(): Promise<{ balance: number; positions: Position[] }> {
    const portfolio = await this.client.get(`/api/bots/${this.botId}/portfolio`);
    return {
      balance: portfolio.bot.balance,
      positions: portfolio.positions,
    };
  }

  async getPositions(): Promise<Position[]> {
    const portfolio = await this.client.get(`/api/bots/${this.botId}/portfolio`);
    return portfolio.positions;
  }

  async getPnL(): Promise<{ realized: number; unrealized: number; total: number }> {
    const portfolio = await this.client.get(`/api/bots/${this.botId}/portfolio`);
    return portfolio.pnl;
  }

  // --- Wallet ---
  async deposit(amountUsdc: number): Promise<any> {
    return this.client.post(`/api/bots/${this.botId}/deposit`, { amount: amountUsdc });
  }

  async getOnChainBalance(): Promise<string> {
    const result = await this.client.get(`/api/wallet/${this.botId}/onchain`);
    return result.onChainBalanceUsdc;
  }

  // --- Auto Trading ---
  startAutoTrading(strategy?: TradingStrategy, config?: { intervalMs?: number; dryRun?: boolean }): AutoTrader {
    if (this.autoTrader?.isRunning()) {
      this.autoTrader.stop();
    }
    this.autoTrader = new AutoTrader(this, strategy, config);
    this.autoTrader.start();
    return this.autoTrader;
  }

  stopAutoTrading(): void {
    this.autoTrader?.stop();
  }

  isAutoTrading(): boolean {
    return this.autoTrader?.isRunning() || false;
  }

  // --- Leaderboard ---
  async getLeaderboard(): Promise<any[]> {
    const result = await this.client.get('/api/leaderboard');
    return result.leaderboard;
  }
}
