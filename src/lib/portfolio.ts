import type { Database } from "@/integrations/supabase/types";

export type Venue = "Polymarket" | "Kalshi";
export type Category = "Politics" | "Macro / Economics" | "Tech / AI" | "Pop Culture";
export const categories: Category[] = ["Politics", "Macro / Economics", "Tech / AI", "Pop Culture"];

export type Position = Database["public"]["Tables"]["positions"]["Row"];
export type Account = Database["public"]["Tables"]["venue_accounts"]["Row"];
export type MatchedEvent = Database["public"]["Tables"]["matched_events"]["Row"];
export type FeeProfile = Database["public"]["Tables"]["user_fee_profiles"]["Row"];
export type Snapshot = Database["public"]["Tables"]["historical_snapshots"]["Row"];

export const marketValue = (p: Position) => Number(p.shares) * Number(p.current_price);
export const costBasis = (p: Position) => Number(p.shares) * Number(p.avg_buy_price);
export const grossUnrealized = (p: Position) => marketValue(p) - costBasis(p);

export const usd = (n: number, sign = false) => {
  const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return sign ? `${n >= 0 ? "+" : "−"}${s}` : n < 0 ? `−${s}` : s;
};
export const cents = (n: number) => `${(Number(n) * 100).toFixed(1)}¢`;
export const daysUntil = (d: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : Infinity;
