export const SCHEMA = `
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  openclaw_agent_id TEXT UNIQUE,
  wallet_address TEXT UNIQUE NOT NULL,
  wallet_encrypted_key TEXT NOT NULL,
  balance_usdc INTEGER DEFAULT 0,
  max_position_size INTEGER,
  max_daily_volume INTEGER,
  auto_trade_enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  poly_condition_id TEXT UNIQUE,
  poly_slug TEXT,
  poly_event_id TEXT,
  poly_event_title TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  outcome_yes TEXT DEFAULT 'Yes',
  outcome_no TEXT DEFAULT 'No',
  price_yes REAL DEFAULT 0.5,
  price_no REAL DEFAULT 0.5,
  poly_price_yes REAL,
  poly_price_no REAL,
  poly_token_id_yes TEXT,
  poly_token_id_no TEXT,
  volume_total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  resolution TEXT,
  resolved_at INTEGER,
  end_date INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id),
  market_id TEXT NOT NULL REFERENCES markets(id),
  side TEXT NOT NULL,
  outcome TEXT NOT NULL,
  order_type TEXT DEFAULT 'limit',
  price REAL,
  size INTEGER NOT NULL,
  filled INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  x402_tx_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id),
  maker_order_id TEXT REFERENCES orders(id),
  taker_order_id TEXT REFERENCES orders(id),
  maker_bot_id TEXT REFERENCES bots(id),
  taker_bot_id TEXT REFERENCES bots(id),
  outcome TEXT NOT NULL,
  price REAL NOT NULL,
  size INTEGER NOT NULL,
  fee_amount INTEGER NOT NULL,
  fee_rate REAL NOT NULL,
  x402_tx_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  bot_id TEXT NOT NULL REFERENCES bots(id),
  market_id TEXT NOT NULL REFERENCES markets(id),
  outcome TEXT NOT NULL,
  shares INTEGER DEFAULT 0,
  avg_price REAL DEFAULT 0,
  realized_pnl INTEGER DEFAULT 0,
  PRIMARY KEY (bot_id, market_id, outcome)
);

CREATE TABLE IF NOT EXISTS treasury (
  id TEXT PRIMARY KEY,
  trade_id TEXT REFERENCES trades(id),
  amount INTEGER NOT NULL,
  tx_hash TEXT,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  bot_id TEXT REFERENCES bots(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tx_hash TEXT,
  chain TEXT DEFAULT 'base',
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_bot ON orders(bot_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_id, status, outcome, side);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id, created_at);
CREATE INDEX IF NOT EXISTS idx_positions_bot ON positions(bot_id);
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_poly ON markets(poly_condition_id);
CREATE INDEX IF NOT EXISTS idx_markets_event ON markets(poly_event_id);
`;
//# sourceMappingURL=schema.js.map