import { getDb } from '../../db/index.js';
import { config } from '../../config.js';
/**
 * Wallet-based bot authentication middleware.
 */
export function botAuth(req, res, next) {
    const botId = req.headers['x-bot-id'];
    const walletAddress = req.headers['x-wallet-address'];
    if (!botId && !walletAddress) {
        res.status(401).json({ error: 'Missing X-Bot-Id or X-Wallet-Address header' });
        return;
    }
    const db = getDb();
    let bot;
    if (botId) {
        bot = db.prepare('SELECT id, name, wallet_address, auto_trade_enabled FROM bots WHERE id = ?').get(botId);
    }
    else if (walletAddress) {
        bot = db.prepare('SELECT id, name, wallet_address, auto_trade_enabled FROM bots WHERE wallet_address = ?').get(walletAddress.toLowerCase());
    }
    if (!bot) {
        res.status(401).json({ error: 'Bot not found. Register first: POST /api/bots/register' });
        return;
    }
    req.bot = bot;
    next();
}
export function optionalBotAuth(req, _res, next) {
    const botId = req.headers['x-bot-id'];
    if (botId) {
        const db = getDb();
        const bot = db.prepare('SELECT id, name, wallet_address FROM bots WHERE id = ?').get(botId);
        if (bot) {
            req.bot = bot;
        }
    }
    next();
}
export function adminAuth(req, res, next) {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== config.adminToken) {
        res.status(403).json({ error: 'Invalid admin token' });
        return;
    }
    next();
}
//# sourceMappingURL=auth.js.map