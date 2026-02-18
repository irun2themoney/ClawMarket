import { Router } from 'express';
import { getAmmPrice, HOUSE_BOT_ID } from '../../engine/amm.js';
import { getDb } from '../../db/index.js';
export const ammRouter = Router();
// GET /api/amm/price/:marketId — get current AMM prices for a market
ammRouter.get('/price/:marketId', (req, res) => {
    const marketId = req.params.marketId;
    const db = getDb();
    const market = db.prepare('SELECT id, title, poly_price_yes, poly_price_no, price_yes, price_no FROM markets WHERE id = ?')
        .get(marketId);
    if (!market) {
        res.status(404).json({ error: 'Market not found' });
        return;
    }
    res.json({
        marketId,
        title: market.title,
        amm: {
            yes: {
                buyPrice: getAmmPrice(marketId, 'yes', 'buy'),
                sellPrice: getAmmPrice(marketId, 'yes', 'sell'),
            },
            no: {
                buyPrice: getAmmPrice(marketId, 'no', 'buy'),
                sellPrice: getAmmPrice(marketId, 'no', 'sell'),
            },
        },
        polyReference: {
            yes: market.poly_price_yes,
            no: market.poly_price_no,
        },
        clawPrice: {
            yes: market.price_yes,
            no: market.price_no,
        },
    });
});
// GET /api/amm/house — house bot position summary
ammRouter.get('/house', (_req, res) => {
    const db = getDb();
    const positions = db.prepare(`
    SELECT p.market_id, p.outcome, p.shares, p.avg_price, m.title
    FROM positions p
    JOIN markets m ON p.market_id = m.id
    WHERE p.bot_id = ? AND p.shares > 0
    ORDER BY p.shares DESC
    LIMIT 50
  `).all(HOUSE_BOT_ID);
    const totalPositions = db.prepare('SELECT COUNT(*) as count FROM positions WHERE bot_id = ? AND shares > 0').get(HOUSE_BOT_ID);
    res.json({
        houseBot: HOUSE_BOT_ID,
        totalPositions: totalPositions.count,
        positions,
    });
});
//# sourceMappingURL=amm.js.map