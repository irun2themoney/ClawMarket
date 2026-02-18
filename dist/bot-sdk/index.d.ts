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
export declare class ClawMarketBot {
    private client;
    private botId;
    private walletAddress;
    private serverUrl;
    private autoTrader;
    private constructor();
    /**
     * Connect to ClawMarket. Auto-registers and creates a wallet if needed.
     */
    static connect(opts: BotConnectOptions): Promise<ClawMarketBot>;
    getId(): string;
    getWalletAddress(): string;
    getServerUrl(): string;
    getMarkets(filter?: {
        status?: string;
        category?: string;
        search?: string;
        limit?: number;
    }): Promise<Market[]>;
    getMarket(id: string): Promise<{
        market: Market;
        orderbook: any;
    }>;
    getPolymarketPrice(marketId: string): Promise<{
        yes: number;
        no: number;
    }>;
    buy(marketId: string, outcome: 'yes' | 'no', size: number, limitPrice?: number): Promise<Order>;
    sell(marketId: string, outcome: 'yes' | 'no', shares: number, limitPrice?: number): Promise<Order>;
    cancelOrder(orderId: string): Promise<void>;
    getBalance(): Promise<{
        balance: number;
        positions: Position[];
    }>;
    getPositions(): Promise<Position[]>;
    getPnL(): Promise<{
        realized: number;
        unrealized: number;
        total: number;
    }>;
    deposit(amountUsdc: number): Promise<any>;
    getOnChainBalance(): Promise<string>;
    startAutoTrading(strategy?: TradingStrategy, config?: {
        intervalMs?: number;
        dryRun?: boolean;
    }): AutoTrader;
    stopAutoTrading(): void;
    isAutoTrading(): boolean;
    getLeaderboard(): Promise<any[]>;
}
export {};
