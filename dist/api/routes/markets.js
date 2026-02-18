import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../db/index.js';
import { orderbook } from '../../engine/orderbook.js';
export const marketsRouter = Router();
// GET /api/markets — list all markets
marketsRouter.get('/', (req, res) => {
    const db = getDb();
    const status = req.query.status || 'active';
    const category = req.query.category;
    const limit = req.query.limit || '50';
    const offset = req.query.offset || '0';
    const search = req.query.search;
    let query = 'SELECT * FROM markets WHERE 1=1';
    const params = [];
    if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
    }
    if (category) {
        query += ' AND category = ?';
        params.push(category);
    }
    if (search) {
        query += ' AND (title LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY volume_total DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    const markets = db.prepare(query).all(...params);
    const total = db.prepare(query.replace(/SELECT \*/, 'SELECT COUNT(*) as count').replace(/ ORDER BY.*$/, '')).get(...params.slice(0, -2));
    res.json({
        markets,
        total: total.count,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
    });
});
// GET /api/markets/:id — market detail + orderbook
marketsRouter.get('/:id', (req, res) => {
    const db = getDb();
    const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id);
    if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
    }
    const yesBook = orderbook.getSnapshot(req.params.id, 'yes');
    const noBook = orderbook.getSnapshot(req.params.id, 'no');
    res.json({
        market,
        orderbook: {
            yes: {
                bids: yesBook.bids.map(b => ({ price: b.price, size: b.size })),
                asks: yesBook.asks.map(a => ({ price: a.price, size: a.size })),
            },
            no: {
                bids: noBook.bids.map(b => ({ price: b.price, size: b.size })),
                asks: noBook.asks.map(a => ({ price: a.price, size: a.size })),
            },
        },
    });
});
// GET /api/markets/:id/trades — trade history
marketsRouter.get('/:id/trades', (req, res) => {
    const db = getDb();
    const limit = req.query.limit || '50';
    const offset = req.query.offset || '0';
    const trades = db.prepare(`
    SELECT t.*, b1.name as maker_name, b2.name as taker_name
    FROM trades t
    LEFT JOIN bots b1 ON t.maker_bot_id = b1.id
    LEFT JOIN bots b2 ON t.taker_bot_id = b2.id
    WHERE t.market_id = ?
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.params.id, parseInt(limit, 10), parseInt(offset, 10));
    res.json({ trades });
});
// GET /api/markets/meta/categories — list unique categories
marketsRouter.get('/meta/categories', (_req, res) => {
    const db = getDb();
    const categories = db.prepare("SELECT DISTINCT category FROM markets WHERE category IS NOT NULL AND status = 'active' ORDER BY category").all();
    res.json({ categories: categories.map((c) => c.category) });
});
// POST /api/markets — Create a new custom market
marketsRouter.post('/', (req, res) => {
    const db = getDb();
    const { title, description = null, category = null, outcomeYes = 'Yes', outcomeNo = 'No', endDate, } = req.body;
    if (!title || !endDate) {
        res.status(400).json({ error: 'Title and endDate are required' });
        return;
    }
    const now = Date.now();
    const id = uuid();
    try {
        db.prepare(`
      INSERT INTO markets (id, title, description, category, outcome_yes, outcome_no,
        price_yes, price_no, volume_total, status, end_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0.5, 0.5, 0, 'active', ?, ?, ?)
    `).run(id, title, description, category, outcomeYes, outcomeNo, new Date(endDate).getTime(), now, now);
        res.status(201).json({ message: 'Market created successfully', marketId: id });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/markets/:id — Resolve a market
marketsRouter.patch('/:id', (req, res) => {
    const db = getDb();
    const { resolution } = req.body;
    if (!['yes', 'no', 'invalid'].includes(resolution)) {
        res.status(400).json({ error: 'Resolution must be one of: yes, no, invalid' });
        return;
    }
    try {
        const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id);
        if (!market) {
            res.status(404).json({ error: 'Market not found' });
            return;
        }
        if (market.status !== 'active') {
            res.status(400).json({ error: 'Market is not active and cannot be resolved' });
            return;
        }
        const now = Date.now();
        db.prepare('UPDATE markets SET status = ?, resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?')
            .run('resolved', resolution, now, now, req.params.id);
        res.json({ message: 'Market resolved successfully', marketId: req.params.id, resolution });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
//# sourceMappingURL=markets.js.map