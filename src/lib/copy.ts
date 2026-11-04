/**
 * Engine A (Phase 5) — Copy-trading proportional sizing.
 * Pure: turns a lead portfolio into per-follower order plans. PolyBase never sends these
 * orders; the payload is for the user's own execution tooling.
 */
import { kalshiExitFee } from "./fees";

export interface LeadPos { market_key: string; market_title: string; venue: "Polymarket" | "Kalshi"; outcome: string; shares: number; avg_buy_price: number; current_price: number }
export interface Follower { id: string; label: string; venue: "Polymarket" | "Kalshi"; available_margin_usd: number; fee_tier: string; max_contracts_per_market: number; is_paused: boolean }
export interface Order { market_key: string; market_title: string; outcome: string; contracts: number; limit_price: number; est_cost_usd: number; est_fee_usd: number; capped: boolean }
export interface FollowerPlan { follower: Follower; ratio: number; orders: Order[]; total_cost_usd: number; margin_scaled: boolean; skipped?: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

export function entryFee(venue: Follower["venue"], contracts: number, price: number, tier: string) {
  return venue === "Kalshi" ? kalshiExitFee(contracts, price, tier) : 0;
}

export function planFollower(lead: LeadPos[], leadEquity: number, f: Follower, targetAllocationUsd: number, slippagePct: number): FollowerPlan {
  const empty = { follower: f, ratio: 0, orders: [], total_cost_usd: 0, margin_scaled: false };
  if (f.is_paused) return { ...empty, skipped: "Paused" };
  if (leadEquity <= 0) return { ...empty, skipped: "Lead portfolio has no value" };
  const budget = Math.min(f.available_margin_usd, targetAllocationUsd > 0 ? targetAllocationUsd : Infinity);
  if (budget <= 0) return { ...empty, skipped: "No margin" };
  const ratio = budget / leadEquity;
  const mine = lead.filter((p) => p.venue === f.venue && p.shares > 0);

  const build = (scale: number) =>
    mine.map((p) => {
      const limit = Math.min(0.99, round2(p.current_price * (1 + slippagePct / 100) + 0.004));
      let contracts = Math.floor(p.shares * ratio * scale);
      const capped = contracts > f.max_contracts_per_market;
      if (capped) contracts = Math.floor(f.max_contracts_per_market);
      const fee = entryFee(f.venue, contracts, limit, f.fee_tier);
      return { market_key: p.market_key, market_title: p.market_title, outcome: p.outcome, contracts, limit_price: limit, est_cost_usd: round2(contracts * limit + fee), est_fee_usd: fee, capped };
    }).filter((o) => o.contracts > 0);

  let orders = build(1);
  let total = orders.reduce((s, o) => s + o.est_cost_usd, 0);
  let scaled = false;
  // Worst-case fills at the limit price plus fees must fit in margin.
  for (let i = 0; i < 6 && total > f.available_margin_usd; i++) {
    orders = build((f.available_margin_usd / total) * 0.995 * (i === 0 ? 1 : 1 - i * 0.01));
    total = orders.reduce((s, o) => s + o.est_cost_usd, 0);
    scaled = true;
  }
  return { follower: f, ratio, orders, total_cost_usd: round2(total), margin_scaled: scaled };
}

export function batchPayload(vault: { id: string; name: string }, plans: FollowerPlan[]) {
  return {
    vault_id: vault.id,
    vault: vault.name,
    generated_at: new Date().toISOString(),
    note: "Prepared by PolyBase. Not executed — submit through your own tooling.",
    accounts: plans.filter((p) => p.orders.length).map((p) => ({
      account: p.follower.label,
      venue: p.follower.venue,
      orders: p.orders.map((o) => ({ market_key: o.market_key, outcome: o.outcome, side: "BUY", type: "LIMIT", contracts: o.contracts, limit_price: o.limit_price })),
    })),
  };
}

/** Signed % difference of the follower's fill vs the lead's (positive = follower paid more). */
export const slippagePct = (leadAvg: number, followerAvg: number) => (leadAvg > 0 ? ((followerAvg - leadAvg) / leadAvg) * 100 : 0);
