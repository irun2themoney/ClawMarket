import request from 'supertest';
import app from '../src/app.js'; // Assuming app.js is the Express server instance
import { getDb } from '../src/db/index.js';

describe('Markets API', () => {
  let db;

  beforeAll(() => {
    db = getDb();
    // Prepare the database
    db.exec(`
      INSERT INTO markets (id, title, description, category, outcome_yes, outcome_no, end_date, created_at, updated_at)
      VALUES ('test-market-1', 'Test Market 1', 'Description 1', 'Sports', 'Win', 'Lose', ${Date.now() + 3600 * 1000}, ${Date.now()}, ${Date.now()});
    `);
  });

  afterAll(() => {
    db.exec(`DELETE FROM markets WHERE id IN ('test-market-1', 'test-market-created')`); // Cleanup
  });

  test('POST /api/markets - Create a new market', async () => {
    const response = await request(app)
      .post('/api/markets')
      .send({
        title: 'Test Market 2',
        description: 'This is a test market',
        category: 'Tech',
        outcomeYes: 'Yes',
        outcomeNo: 'No',
        endDate: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('marketId');
  });

  test('PATCH /api/markets/:id - Resolve a market', async () => {
    const response = await request(app)
      .patch('/api/markets/test-market-1')
      .send({ resolution: 'yes' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Market resolved successfully');
    expect(response.body).toHaveProperty('resolution', 'yes');
  });
});