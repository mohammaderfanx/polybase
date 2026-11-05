import { describe, expect, it } from "vitest";
import { planFollower, type Follower, type LeadPos } from "@/lib/copy";

const lead: LeadPos[] = [{ market_key: "m1", market_title: "M1", venue: "Polymarket", outcome: "Yes", shares: 1000, avg_buy_price: 0.4, current_price: 0.5 }];
const f = (o: Partial<Follower> = {}): Follower => ({ id: "f", label: "F", venue: "Polymarket", available_margin_usd: 50, fee_tier: "standard", max_contracts_per_market: 25000, is_paused: false, ...o });

describe("copy sizing", () => {
  it("sizes in proportion to margin vs lead equity", () => {
    // lead equity $500, follower margin $50 -> 10% -> 100 shares; worst-case cost must fit margin
    const p = planFollower(lead, 500, f({ available_margin_usd: 1000 }), 50, 0);
    expect(p.ratio).toBeCloseTo(0.1);
    expect(p.orders[0]!.contracts).toBe(100);
  });
  it("never spends more than available margin", () => {
    const p = planFollower(lead, 500, f({ available_margin_usd: 50 }), 0, 0.5);
    expect(p.total_cost_usd).toBeLessThanOrEqual(50);
  });
  it("respects per-market contract limit", () => {
    const p = planFollower(lead, 500, f({ available_margin_usd: 10000, max_contracts_per_market: 30 }), 0, 0);
    expect(p.orders[0]!.contracts).toBe(30);
  });
  it("paused followers get no orders", () => {
    expect(planFollower(lead, 500, f({ is_paused: true }), 0, 0).orders).toHaveLength(0);
  });
  it("skips other venues", () => {
    expect(planFollower(lead, 500, f({ venue: "Kalshi", available_margin_usd: 1000 }), 0, 0).orders).toHaveLength(0);
  });
});
