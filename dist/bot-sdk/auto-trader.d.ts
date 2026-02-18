import type { TradingStrategy } from './strategy.js';
import type { ClawMarketBot } from './index.js';
export interface AutoTraderConfig {
    intervalMs: number;
    maxTradesPerCycle: number;
    dryRun: boolean;
}
export declare class AutoTrader {
    private bot;
    private strategy;
    private config;
    private timer;
    private running;
    constructor(bot: ClawMarketBot, strategy?: TradingStrategy, config?: Partial<AutoTraderConfig>);
    setStrategy(strategy: TradingStrategy): void;
    start(): void;
    stop(): void;
    isRunning(): boolean;
    private evaluate;
}
