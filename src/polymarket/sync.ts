import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { PolyEvent } from './types.js';

const BATCH_SIZE = 100;

export async function syncMarkets(): Promise<number> {
  let imported = 0;
  let offset = 0;
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO markets (id, poly_condition_id, poly_slug, poly_event_id, title, description, category,
      outcome_yes, outcome_no, price_yes, price_no, poly_price_yes, poly_price_no,
      poly_token_id_yes, poly_token_id_no, status, end_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(poly_condition_id) DO UPDATE SET
      poly_price_yes = excluded.poly_price_yes,
      poly_price_no = excluded.poly_price_no,
      updated_at = excluded.updated_at
  `);

  try {
    while (true) {
      const url = `${config.polyGammaApi}/events?active=true&closed=false&limit=${BATCH_SIZE}&offset=${offset}`;

      // Retry logic for transient failures
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch(url);
          if (res.ok) break;
          console.warn(`[sync] Gamma API returned ${res.status}, retry ${attempt + 1}/3`);
        } catch (err: any) {
          console.warn(`[sync] fetch error: ${err.message}, retry ${attempt + 1}/3`);
        }
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
      }

      if (!res || !res.ok) {
        console.error(`[sync] Gamma API error after retries`);
        break;
      }

      const events: PolyEvent[] = await res.json();
      if (events.length === 0) break;

      const now = Date.now();

      for (const event of events) {
        const category = event.tags?.[0]?.label || null;

        for (const market of event.markets) {
          if (!market.conditionId || !market.clobTokenIds) continue;

          // Gamma API returns these as JSON strings, not arrays
          const outcomes = typeof market.outcomes === 'string'
            ? JSON.parse(market.outcomes) : (market.outcomes || ['Yes', 'No']);
          const outcomePrices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices) : (market.outcomePrices || ['0.5', '0.5']);
          const clobTokenIds = typeof market.clobTokenIds === 'string'
            ? JSON.parse(market.clobTokenIds) : (market.clobTokenIds || []);

          if (!clobTokenIds.length) continue;

          const priceYes = parseFloat(outcomePrices[0] || '0.5');
          const priceNo = parseFloat(outcomePrices[1] || '0.5');
          const endDate = market.endDate ? new Date(market.endDate).getTime() : null;

          upsert.run(
            uuid(),
            market.conditionId,
            market.slug,
            event.id,
            market.question,
            market.description || null,
            category,
            outcomes[0] || 'Yes',
            outcomes[1] || 'No',
            priceYes,
            priceNo,
            priceYes,
            priceNo,
            clobTokenIds[0] || null,
            clobTokenIds[1] || null,
            endDate,
            now,
            now
          );
          imported++;
        }
      }

      if (events.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  } catch (err) {
    console.error('[sync] error:', err);
  }

  console.log(`[sync] imported/updated ${imported} markets`);
  return imported;
}

export function startMarketSync(): NodeJS.Timeout {
  console.log(`[sync] starting market sync (interval: ${config.polySyncInterval}ms)`);
  syncMarkets();
  return setInterval(syncMarkets, config.polySyncInterval);
}
