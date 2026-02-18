// Gamma API response types

export interface PolyEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  tags: Array<{ label: string; slug: string }>;
  markets: PolyMarket[];
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolyMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string;
  outcomes: string[];             // ["Yes", "No"]
  outcomePrices: string[];        // ["0.65", "0.35"]
  clobTokenIds: string[];         // [yesTokenId, noTokenId]
  volume: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  enableOrderBook: boolean;
  endDate?: string;
  startDate?: string;
  createdAt: string;
  updatedAt: string;
}

// CLOB API types

export interface ClobMarket {
  condition_id: string;
  question: string;
  tokens: ClobToken[];
  minimum_order_size: string;
  minimum_tick_size: string;
  active: boolean;
  closed: boolean;
  end_date_iso: string;
}

export interface ClobToken {
  token_id: string;
  outcome: string;      // "Yes" | "No"
  price: number;
  winner: boolean;
}

export interface ClobOrderbook {
  market: string;
  asset_id: string;
  bids: ClobOrderbookLevel[];
  asks: ClobOrderbookLevel[];
  timestamp: string;
  hash: string;
}

export interface ClobOrderbookLevel {
  price: string;
  size: string;
}

export interface ClobPriceUpdate {
  event_type: string;
  asset_id: string;
  market: string;
  price: string;
  timestamp: string;
  changes?: Array<{ price: string; size: string; side: string }>;
}

// Internal ClawMarket types

export interface ClawMarket {
  id: string;
  poly_condition_id: string | null;
  poly_slug: string | null;
  poly_event_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  outcome_yes: string;
  outcome_no: string;
  price_yes: number;
  price_no: number;
  poly_price_yes: number | null;
  poly_price_no: number | null;
  poly_token_id_yes: string | null;
  poly_token_id_no: string | null;
  volume_total: number;
  status: 'active' | 'paused' | 'resolved' | 'voided';
  resolution: string | null;
  resolved_at: number | null;
  end_date: number | null;
  created_at: number;
  updated_at: number;
}
