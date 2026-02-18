var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { config } from './config.js';
import { getDb, closeDb } from './db/index.js';
import { createServer } from './api/server.js';
import { startMarketSync } from './polymarket/sync.js';
import { PolymarketPriceFeed } from './polymarket/prices.js';
import { ResolutionWatcher } from './polymarket/resolver.js';
import { matchingEngine } from './engine/matching.js';
import { settleMarket } from './engine/settlement.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log(`
   ██████╗██╗      █████╗ ██╗    ██╗
  ██╔════╝██║     ██╔══██╗██║    ██║
  ██║     ██║     ███████║██║ █╗ ██║
  ██║     ██║     ██╔══██║██║███╗██║
  ╚██████╗███████╗██║  ██║╚███╔███╔╝
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝
   M A R K E T
`);
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Initialize database
        console.log('[boot] initializing database...');
        getDb();
        // 2. Create API server
        console.log('[boot] starting API server...');
        const { app, server, broadcast } = createServer();
        // 3. Start Polymarket market sync
        console.log('[boot] starting Polymarket sync...');
        const syncTimer = startMarketSync();
        // 4. Start Polymarket price feed
        console.log('[boot] starting price feed...');
        const priceFeed = new PolymarketPriceFeed();
        priceFeed.start();
        priceFeed.on('price-update', (data) => {
            broadcast('price-update', data);
        });
        // 5. Start resolution watcher
        console.log('[boot] starting resolution watcher...');
        const resolver = new ResolutionWatcher();
        resolver.start();
        resolver.on('market-resolved', ({ marketId, resolution }) => {
            const result = settleMarket(marketId, resolution);
            broadcast('market-resolved', result);
        });
        // 6. Wire matching engine events to WebSocket
        matchingEngine.on('trade', (trade) => {
            broadcast('trade', trade);
        });
        // 7. Serve Dashboard
        app.use('/dashboard', express.static('/Users/illfaded2022/.openclaw/workspace/clawmarket/src/dashboard'));
        // 8. Start listening
        server.listen(config.apiPort, () => {
            console.log(`[boot] ClawMarket API running on http://localhost:${config.apiPort}`);
            console.log(`[boot] Dashboard: http://localhost:${config.apiPort}`);
            console.log(`[boot] Fee rate: ${(config.feeRate * 100).toFixed(1)}%`);
            console.log(`[boot] Treasury: ${config.treasuryAddress || 'NOT SET — configure CLAWMARKET_TREASURY_ADDRESS'}`);
            console.log('[boot] ready.');
        });
        // Graceful shutdown
        const shutdown = () => {
            console.log('\n[shutdown] stopping...');
            clearInterval(syncTimer);
            priceFeed.stop();
            resolver.stop();
            server.close();
            closeDb();
            console.log('[shutdown] done.');
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    });
}
main().catch((err) => {
    console.error('[boot] fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map