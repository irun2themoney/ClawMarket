import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import http from 'http';
import { config } from '../config.js';
import { marketsRouter } from './routes/markets.js';
import { ordersRouter } from './routes/orders.js';
import { portfolioRouter } from './routes/portfolio.js';
import { walletRouter } from './routes/wallet.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { adminRouter } from './routes/admin.js';
import { ammRouter } from './routes/amm.js';
import botsRouter from "./routes/bots";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = express();
  const server = http.createServer(app);

  // Middleware
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[api] ${req.method} ${req.path}`);
    }
    next();
  });

  // CORS for dashboard
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bot-Id, X-Wallet-Address, X-Admin-Token, X-Payment-Signature');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // API Routes
  app.use('/api/markets', marketsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api', adminRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/amm', ammRouter);
  app.use('/api/bots', botsRouter); // Added bots route

  // Serve dashboard
  const dashboardPath = path.resolve(__dirname, '../dashboard');
  app.use(express.static(dashboardPath));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(dashboardPath, 'index.html'));
  });

  // WebSocket for real-time updates
  const wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (ws) => {
    console.log('[ws] client connected');
    ws.on('close', () => console.log('[ws] client disconnected'));
  });

  // Broadcast function for real-time updates
  const broadcast = (event: string, data: any) => {
    const msg = JSON.stringify({ event, data, timestamp: Date.now() });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(msg);
      }
    });
  };

  return { app, server, wss, broadcast };
}

export function startServer(broadcast: (event: string, data: any) => void) {
  // This is called from index.ts after creating the server
  // The broadcast function is used by the matching engine and price feed
  return broadcast;
}
