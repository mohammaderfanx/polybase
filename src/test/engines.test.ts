import { describe, expect, it } from "vitest";
import { scanEvent } from "@/lib/arb";
import { exposures, resolutionMatrix } from "@/lib/delta";
import { scanHarvest } from "@/lib/tax";
import { sortBook } from "@/lib/orderbook";
import type { FeeProfile, Position } from "@/lib/portfolio";

const noFees = { kalshi_fee_tier: "none", polymarket_tier: "none", custom_gas_offset_usd: 0 } as FeeProfile;
const pos = (o: Partial<Position>): Position => ({
  id: Math.random().toString(), account_id: "a", avg_buy_price: 0.5, current_price: 0.5, fees_paid: 0,
  market_key: "m", market_title: "M", matched_event_id: "e1", outcome: "Yes", realized_pnl: 0,
  settlement_date: null, shares: 100, updated_at: "2020-01-01T00:00:00Z", user_id: "u", venue: "Polymarket", ...o,
});

describe("arbitrage", () => {
  it("Poly YES 0.42 + Kalshi NO 0.54 nets 4¢/contract with no fees", () => {
    const poly = sortBook({ bids: [], asks: [{ price: 0.42, size: 100 }] });
    const kalshi = sortBook({ bids: [{ price: 0.46, size: 100 }], asks: [] }); // NO ask = 0.54
    const r = scanEvent(poly, kalshi, noFees)!;
    expect(r.direction).toBe("POLY_YES+KALSHI_NO");
    expect(r.contracts).toBe(100);
    expect(r.netProfitUsd).toBeCloseTo(4, 6);
  });
  it("Kalshi standard fees and gas are deducted from the spread", () => {
    const poly = sortBook({ bids: [], asks: [{ price: 0.42, size: 100 }] });
    const kalshi = sortBook({ bids: [{ price: 0.46, size: 100 }], asks: [] });
    const r = scanEvent(poly, kalshi, { ...noFees, kalshi_fee_tier: "standard", custom_gas_offset_usd: 1 })!;
    // fee per contract = 0.07*0.54*0.46 = 0.017388 → 100*(0.04-0.017388) - 1 gas
    expect(r.netProfitUsd).toBeCloseTo(1.2612, 4);
  });
  it("a book summing above $1 is not feasible", () => {
    const poly = sortBook({ bids: [], asks: [{ price: 0.5, size: 100 }] });
    const kalshi = sortBook({ bids: [{ price: 0.45, size: 100 }], asks: [{ price: 0.55, size: 100 }] });
    expect(scanEvent(poly, kalshi, noFees)!.feasible).toBe(false);
  });
});

describe("delta", () => {
  it("100 YES vs 40 NO gives delta 60 and suggests buying 60 NO", () => {
    const [e] = exposures([pos({ shares: 100 }), pos({ outcome: "No", shares: 40, venue: "Kalshi" })], []);
    expect(e!.delta).toBe(60);
    expect(e!.rebalance).toMatchObject({ side: "NO", contracts: 60 });
  });
  it("resolution matrix covers every YES/NO combination", () => {
    const ex = exposures([pos({ matched_event_id: "a" }), pos({ matched_event_id: "b" })], []);
    expect(resolutionMatrix(ex).rows).toHaveLength(4);
  });
});

describe("tax-loss scanner", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  it("only losing positions are candidates", () => {
    const r = scanHarvest([pos({ current_price: 0.3 }), pos({ current_price: 0.7, matched_event_id: "x" })], noFees, 30, now);
    expect(r).toHaveLength(1);
    expect(r[0]!.harvestableLoss).toBeCloseTo(-20);
    expect(r[0]!.estTaxSavings).toBeCloseTo(6);
  });
  it("flags wash-sale when the same side is held on the other venue", () => {
    const r = scanHarvest([pos({ current_price: 0.3 }), pos({ venue: "Kalshi" })], noFees, 30, now);
    expect(r[0]!.washFlags).toContain("replacement_held");
  });
  it("flags positions changed within 30 days", () => {
    const r = scanHarvest([pos({ current_price: 0.3, updated_at: "2026-10-20T00:00:00Z" })], noFees, 30, now);
    expect(r[0]!.washFlags).toEqual(["recent_buy"]);
  });
});
