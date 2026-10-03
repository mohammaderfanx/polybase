export type Venue = "Polymarket" | "Kalshi";
export type Category = "Politics" | "Macro / Economics" | "Tech / AI" | "Pop Culture";

export interface MatchedEvent {
  id: string;
  event_name: string;
  category: Category;
  polymarket_market_id: string | null;
  kalshi_market_id: string | null;
}

export interface Position {
  id: string;
  venue: Venue;
  matched_event_id: string;
  market_title: string;
  outcome: "Yes" | "No";
  shares: number;
  avg_buy_price: number;
  current_price: number;
  realized_pnl: number;
  fees_paid: number; // venue taker/maker fees + gas/settlement costs
  settlement_date: string;
  opened_at: string;
}

export interface Account {
  id: string;
  venue: Venue;
  identifier: string;
  status: "active" | "syncing" | "error";
  last_synced_at: string;
}

export const matchedEvents: MatchedEvent[] = [
  { id: "fed-cut-nov", event_name: "Fed Rate Cut November", category: "Macro / Economics", polymarket_market_id: "0x7a1f…fed", kalshi_market_id: "FED-26NOV-T4.25" },
  { id: "gpt6-release", event_name: "GPT-6 Released Before 2027", category: "Tech / AI", polymarket_market_id: "0x9c2e…gpt", kalshi_market_id: "OAI-GPT6-26DEC" },
  { id: "house-2026", event_name: "Democrats Win House 2026", category: "Politics", polymarket_market_id: "0x3b8d…hse", kalshi_market_id: "CTRLHOUSE-26-D" },
  { id: "cpi-oct", event_name: "October CPI Above 3.0%", category: "Macro / Economics", polymarket_market_id: null, kalshi_market_id: "CPI-26OCT-T3.0" },
];

export const positions: Position[] = [
  { id: "p1", venue: "Polymarket", matched_event_id: "fed-cut-nov", market_title: "Fed cuts 25bp in November?", outcome: "Yes", shares: 12000, avg_buy_price: 0.58, current_price: 0.67, realized_pnl: 340, fees_paid: 18.4, settlement_date: "2026-11-05", opened_at: "2026-08-14" },
  { id: "p2", venue: "Kalshi", matched_event_id: "fed-cut-nov", market_title: "Fed funds upper bound ≤ 4.25% after Nov FOMC", outcome: "No", shares: 6000, avg_buy_price: 0.38, current_price: 0.34, realized_pnl: 0, fees_paid: 84.0, settlement_date: "2026-11-05", opened_at: "2026-08-20" },
  { id: "p3", venue: "Polymarket", matched_event_id: "gpt6-release", market_title: "GPT-6 released by Dec 31?", outcome: "Yes", shares: 8500, avg_buy_price: 0.41, current_price: 0.29, realized_pnl: -120, fees_paid: 11.2, settlement_date: "2026-12-31", opened_at: "2026-06-02" },
  { id: "p4", venue: "Kalshi", matched_event_id: "gpt6-release", market_title: "OpenAI releases GPT-6 in 2026", outcome: "No", shares: 4000, avg_buy_price: 0.55, current_price: 0.70, realized_pnl: 210, fees_paid: 61.5, settlement_date: "2026-12-31", opened_at: "2026-07-11" },
  { id: "p5", venue: "Polymarket", matched_event_id: "house-2026", market_title: "Democrats win House in 2026 midterms?", outcome: "Yes", shares: 20000, avg_buy_price: 0.62, current_price: 0.71, realized_pnl: 1250, fees_paid: 26.9, settlement_date: "2026-10-08", opened_at: "2026-03-18" },
  { id: "p6", venue: "Kalshi", matched_event_id: "cpi-oct", market_title: "CPI YoY above 3.0% for October", outcome: "Yes", shares: 5000, avg_buy_price: 0.47, current_price: 0.52, realized_pnl: 0, fees_paid: 43.8, settlement_date: "2026-10-09", opened_at: "2026-09-21" },
];

export const accounts: Account[] = [
  { id: "a1", venue: "Polymarket", identifier: "0x4f2C…9b1E", status: "active", last_synced_at: "2026-10-03T23:06:00Z" },
  { id: "a2", venue: "Kalshi", identifier: "kalshi-readonly-main", status: "active", last_synced_at: "2026-10-03T23:04:00Z" },
];

export const eventById = (id: string) => matchedEvents.find((e) => e.id === id)!;

export const marketValue = (p: Position) => p.shares * p.current_price;
export const costBasis = (p: Position) => p.shares * p.avg_buy_price;
export const grossUnrealized = (p: Position) => marketValue(p) - costBasis(p);
/** True net P&L: unrealized + realized, minus every fee/gas/settlement cost. */
export const netPnl = (p: Position) => grossUnrealized(p) + p.realized_pnl - p.fees_paid;
/** Rough 24h move proxy for demo data (deterministic). */
export const pnl24h = (p: Position) => p.shares * p.current_price * ((p.id.charCodeAt(1) % 5) - 2) * 0.006;

export const usd = (n: number, sign = false) => {
  const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return sign ? `${n >= 0 ? "+" : "−"}${s}` : n < 0 ? `−${s}` : s;
};
export const cents = (n: number) => `${(n * 100).toFixed(1)}¢`;

export const NOW = new Date("2026-10-03T23:08:00Z");
export const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - NOW.getTime()) / 86400000);
