import { ClawMarketBot } from './index.js';
/**
 * Parse and execute OpenClaw chat commands for ClawMarket.
 *
 * Commands:
 *   clawmarket status              — balance + positions summary
 *   clawmarket markets [category]  — list active markets
 *   clawmarket buy <market> yes/no <amount> [at <price>]
 *   clawmarket sell <market> yes/no <shares> [at <price>]
 *   clawmarket portfolio           — detailed P&L breakdown
 *   clawmarket wallet              — show wallet address
 *   clawmarket leaderboard         — top bots
 *   clawmarket auto on/off         — toggle auto-trading
 */
export declare function handleCommand(bot: ClawMarketBot, input: string): Promise<string>;
