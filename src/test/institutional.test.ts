import { describe, expect, it } from "vitest";
import { allocation, correlations, dailyReturns, historicalRisk } from "@/lib/institutional";
import type { FeeProfile, Position } from "@/lib/portfolio";
import { readFileSync } from "node:fs";

const points = (returns: number[]) => {
  let equity = 1000;
  return [0, ...returns].map((r, i) => {
    if (i) equity *= 1 + r;
    return { timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), total_equity_usd: equity };
  });
};
describe("institutional risk", () => {
  it("computes historical VaR and expected shortfall from the loss tail", () => {
    const risk = historicalRisk(points([-0.1, -0.05, ...Array(38).fill(0.01)]), 1000, 0.95);
    expect(risk.varUsd).toBeCloseTo(50);
    expect(risk.esUsd).toBeCloseTo(75);
  });
  it("does not invent VaR from insufficient history", () => {
    expect(historicalRisk(points(Array(19).fill(-0.01)), 1000, 0.95).varUsd).toBeNull();
    expect(historicalRisk(points(Array(99).fill(-0.01)), 1000, 0.99).varUsd).toBeNull();
  });
  it("skips missing days and uses the last observation per day", () => {
    expect(dailyReturns([{ timestamp: "2026-01-01T00:00:00Z", total_equity_usd: 100 }, { timestamp: "2026-01-01T23:00:00Z", total_equity_usd: 200 }, { timestamp: "2026-01-02T23:00:00Z", total_equity_usd: 180 }, { timestamp: "2026-01-04T23:00:00Z", total_equity_usd: 200 }])).toEqual([{ day: "2026-01-02", value: -0.09999999999999998 }]);
  });
  it("deducts fees from both resolution outcomes and nets matched YES/NO", () => {
    const p = { user_id: "u", venue: "Kalshi", shares: 100, avg_buy_price: 0.4, current_price: 0.5, fees_paid: 2, realized_pnl: 0, matched_event_id: "e", outcome: "Yes", id: "p" } as Position;
    const r = allocation([p, { ...p, id: "q", outcome: "No", shares: 40 }], [], [{ user_id: "u", kalshi_fee_tier: "none" } as FeeProfile]);
    expect(r.rows[0]?.ifYes).toBe(40);
    expect(r.rows[0]?.ifNo).toBe(-20);
    expect(r.worstPnl).toBe(-20);
    expect(r.concentration).toBe(100);
  });
  it("computes positive and negative cross-market correlation", () => {
    const marks = [0.5, 0.51, 0.49, 0.53, 0.5, 0.52].flatMap((p, i) => [{ day: `2026-01-0${i + 1}`, event_key: "a", yes_price: p }, { day: `2026-01-0${i + 1}`, event_key: "b", yes_price: 1 - p }]);
    expect(correlations(marks, ["a", "b"])[0]?.[0]).toBeCloseTo(1);
    expect(correlations(marks, ["a", "b"])[0]?.[1]).toBeCloseTo(-1);
  });
  it("enforces distinct current admins and locks revision checks for risk approval", () => {
    const sql = readFileSync("drizzle/migrations/0003_institutional_risk_governance.sql", "utf8");
    expect(sql).toContain("CHECK(approved_by IS NULL OR approved_by<>proposed_by)");
    expect(sql).toContain("IF p.proposed_by=auth.uid() THEN RAISE EXCEPTION 'A different admin must sign off'");
    expect(sql).toContain("IF NOT public.is_org_admin(p.organization_id,p.proposed_by)");
    expect(sql).toContain("WHERE organization_id=p.organization_id FOR UPDATE");
    expect(sql).toContain("IF r<>p.base_revision THEN s:='stale'");
  });
});