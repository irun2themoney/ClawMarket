import type { TradingStrategy, StrategyContext, MarketSnapshot } from './strategy.js';
import type { ClawMarketBot } from './index.js';
import { PolymarketArbStrategy } from './strategy.js';

export interface AutoTraderConfig {
  intervalMs: number;        // How often to evaluate (default: 30000)
  maxTradesPerCycle: number;  // Max trades per evaluation cycle
  dryRun: boolean;           // If true, log signals but don't execute
}

const DEFAULT_CONFIG: AutoTraderConfig = {
  intervalMs: 30_000,
  maxTradesPerCycle: 3,
  dryRun: false,
};

export class AutoTrader {
  private bot: ClawMarketBot;
  private strategy: TradingStrategy;
  private config: AutoTraderConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(bot: ClawMarketBot, strategy?: TradingStrategy, config?: Partial<AutoTraderConfig>) {
    this.bot = bot;
    this.strategy = strategy || new PolymarketArbStrategy();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setStrategy(strategy: TradingStrategy): void {
    this.strategy = strategy;
    console.log(`[auto-trader] strategy changed to: ${strategy.name}`);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[auto-trader] started (strategy: ${this.strategy.name}, interval: ${this.config.intervalMs}ms)`);

    // Run first evaluation immediately
    this.evaluate();
    this.timer = setInterval(() => this.evaluate(), this.config.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[auto-trader] stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private async evaluate(): Promise<void> {
    try {
      // Build context
      const [balance, positions, markets] = await Promise.all([
        this.bot.getBalance(),
        this.bot.getPositions(),
        this.bot.getMarkets({ status: 'active' }),
      ]);

      const snapshots: MarketSnapshot[] = markets.map((m: any) => ({
        market: m,
        polyPriceYes: m.poly_price_yes || 0.5,
        polyPriceNo: m.poly_price_no || 0.5,
        clawPriceYes: m.price_yes,
        clawPriceNo: m.price_no,
        volume: m.volume_total,
      }));

      const ctx: StrategyContext = {
        balance: balance.balance,
        positions: positions.map((p: any) => ({
          marketId: p.market_id,
          outcome: p.outcome,
          shares: p.shares,
          avgPrice: p.avg_price,
        })),
        markets: snapshots,
      };

      // Get trade signals
      const signals = this.strategy.evaluate(ctx);

      if (signals.length === 0) return;

      console.log(`[auto-trader] ${signals.length} signals from ${this.strategy.name}`);

      // Execute signals (up to maxTradesPerCycle)
      const toExecute = signals.slice(0, this.config.maxTradesPerCycle);

      for (const signal of toExecute) {
        if (signal.action === 'hold') continue;

        if (this.config.dryRun) {
          console.log(`[auto-trader] DRY RUN: ${signal.action} ${signal.outcome} on ${signal.marketId} — ${signal.reason}`);
          continue;
        }

        try {
          if (signal.action === 'buy') {
            await this.bot.buy(signal.marketId, signal.outcome, signal.size, signal.price);
            console.log(`[auto-trader] BUY ${signal.outcome} ${signal.size} @ ${signal.price} — ${signal.reason}`);
          } else if (signal.action === 'sell') {
            await this.bot.sell(signal.marketId, signal.outcome, signal.size, signal.price);
            console.log(`[auto-trader] SELL ${signal.outcome} ${signal.size} @ ${signal.price} — ${signal.reason}`);
          }
        } catch (err: any) {
          console.error(`[auto-trader] trade failed: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[auto-trader] evaluation error: ${err.message}`);
    }
  }
}
