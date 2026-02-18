var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
export function handleCommand(bot, input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const parts = input.trim().split(/\s+/);
        if (((_a = parts[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== 'clawmarket') {
            return '';
        }
        const cmd = (_b = parts[1]) === null || _b === void 0 ? void 0 : _b.toLowerCase();
        try {
            switch (cmd) {
                case 'status':
                    return yield cmdStatus(bot);
                case 'markets':
                    return yield cmdMarkets(bot, parts.slice(2));
                case 'buy':
                    return yield cmdBuy(bot, parts.slice(2));
                case 'sell':
                    return yield cmdSell(bot, parts.slice(2));
                case 'portfolio':
                    return yield cmdPortfolio(bot);
                case 'wallet':
                    return cmdWallet(bot);
                case 'leaderboard':
                    return yield cmdLeaderboard(bot);
                case 'auto':
                    return cmdAuto(bot, parts[2]);
                default:
                    return `Unknown command: ${cmd}. Available: status, markets, buy, sell, portfolio, wallet, leaderboard, auto`;
            }
        }
        catch (err) {
            return `Error: ${err.message}`;
        }
    });
}
function cmdStatus(bot) {
    return __awaiter(this, void 0, void 0, function* () {
        const { balance, positions } = yield bot.getBalance();
        const pnl = yield bot.getPnL();
        let msg = `**ClawMarket Status**\n`;
        msg += `Balance: $${(balance / 1000000).toFixed(2)} USDC\n`;
        msg += `P&L: $${(pnl.total / 1000000).toFixed(2)} (realized: $${(pnl.realized / 1000000).toFixed(2)}, unrealized: $${(pnl.unrealized / 1000000).toFixed(2)})\n`;
        msg += `Active positions: ${positions.length}\n`;
        msg += `Auto-trading: ${bot.isAutoTrading() ? 'ON' : 'OFF'}`;
        return msg;
    });
}
function cmdMarkets(bot, args) {
    return __awaiter(this, void 0, void 0, function* () {
        const category = args[0] || undefined;
        const markets = yield bot.getMarkets({ category });
        if (markets.length === 0)
            return 'No active markets found.';
        let msg = `**Active Markets** (${markets.length})\n\n`;
        for (const m of markets.slice(0, 10)) {
            const polyRef = m.poly_price_yes ? ` [Poly: ${(m.poly_price_yes * 100).toFixed(0)}%]` : '';
            msg += `- **${m.title}**\n  YES: ${(m.price_yes * 100).toFixed(1)}% / NO: ${(m.price_no * 100).toFixed(1)}%${polyRef}\n  ID: \`${m.id}\`\n\n`;
        }
        if (markets.length > 10) {
            msg += `... and ${markets.length - 10} more`;
        }
        return msg;
    });
}
function cmdBuy(bot, args) {
    return __awaiter(this, void 0, void 0, function* () {
        // clawmarket buy <marketId> yes/no <amount> [at <price>]
        const [marketId, outcome, amountStr, _, priceStr] = args;
        if (!marketId || !outcome || !amountStr) {
            return 'Usage: clawmarket buy <marketId> yes/no <amount> [at <price>]';
        }
        const amount = parseInt(amountStr, 10);
        if (isNaN(amount) || amount <= 0)
            return 'Invalid amount';
        const price = priceStr ? parseFloat(priceStr) : undefined;
        const result = yield bot.buy(marketId, outcome, amount, price);
        return `Order placed: ${result.fillCount} fills, ${result.totalFilled} shares filled, $${(result.totalFees / 1000000).toFixed(4)} fees`;
    });
}
function cmdSell(bot, args) {
    return __awaiter(this, void 0, void 0, function* () {
        const [marketId, outcome, sharesStr, _, priceStr] = args;
        if (!marketId || !outcome || !sharesStr) {
            return 'Usage: clawmarket sell <marketId> yes/no <shares> [at <price>]';
        }
        const shares = parseInt(sharesStr, 10);
        if (isNaN(shares) || shares <= 0)
            return 'Invalid shares amount';
        const price = priceStr ? parseFloat(priceStr) : undefined;
        const result = yield bot.sell(marketId, outcome, shares, price);
        return `Sell order placed: ${result.fillCount} fills, ${result.totalFilled} shares sold`;
    });
}
function cmdPortfolio(bot) {
    return __awaiter(this, void 0, void 0, function* () {
        const { balance, positions } = yield bot.getBalance();
        const pnl = yield bot.getPnL();
        let msg = `**Portfolio**\n`;
        msg += `Balance: $${(balance / 1000000).toFixed(2)}\n`;
        msg += `Total P&L: $${(pnl.total / 1000000).toFixed(2)}\n\n`;
        if (positions.length === 0) {
            msg += 'No open positions.';
        }
        else {
            msg += '**Positions:**\n';
            for (const p of positions) {
                const value = (p.shares * (p.outcome === 'yes' ? p.price_yes : p.price_no));
                msg += `- ${p.market_title || p.market_id}: ${p.shares} ${p.outcome.toUpperCase()} shares @ ${p.avg_price.toFixed(3)} (value: $${(value / 1000000).toFixed(2)})\n`;
            }
        }
        return msg;
    });
}
function cmdWallet(bot) {
    return `**Wallet**\nAddress: \`${bot.getWalletAddress()}\`\nChain: Base L2 (eip155:8453)\nFund with USDC to start trading.`;
}
function cmdLeaderboard(bot) {
    return __awaiter(this, void 0, void 0, function* () {
        const leaders = yield bot.getLeaderboard();
        if (leaders.length === 0)
            return 'No bots on the leaderboard yet.';
        let msg = `**Leaderboard**\n\n`;
        for (const l of leaders.slice(0, 10)) {
            const pnlStr = (l.total_pnl / 1000000).toFixed(2);
            const prefix = l.total_pnl >= 0 ? '+' : '';
            msg += `${l.rank}. **${l.name}** — ${prefix}$${pnlStr} (${l.trade_count} trades)\n`;
        }
        return msg;
    });
}
function cmdAuto(bot, toggle) {
    if (toggle === 'on') {
        bot.startAutoTrading();
        return 'Auto-trading enabled. Using polymarket-arb strategy.';
    }
    else if (toggle === 'off') {
        bot.stopAutoTrading();
        return 'Auto-trading disabled.';
    }
    return `Auto-trading is ${bot.isAutoTrading() ? 'ON' : 'OFF'}. Use: clawmarket auto on/off`;
}
//# sourceMappingURL=commands.js.map