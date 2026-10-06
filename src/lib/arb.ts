/**
 * Engine A — Cross-venue arbitrage scanner.
 * Buys complementary outcomes on both venues (Poly YES + Kalshi NO, or Poly NO + Kalshi YES)
 * walking both ask ladders. Every figure is NET of taker fees, gas and slippage — gross is never surfaced.
 */
import type { FeeProfile } from "./portfolio";
import { type Book, type Level, noAsks } from "./orderbook";

const KALSHI_TAKER: Record<string, number> = { standard: 0.07, maker: 0.0175, none: 0 };
const POLY_TAKER: Record<string, number> = { standard: 0, taker: 0.01, none: 0 };

export type Direction = "POLY_YES+KALSHI_NO" | "POLY_NO+KALSHI_YES";

export interface Fill { polyPrice: number; kalshiPrice: number; contracts: number }
export interface ArbResult {
  direction: Direction;
  contracts: number;
  costUsd: number;        // capital deployed incl. fees
  feesUsd: number;
  netProfitUsd: number;
  netSpreadPct: number;   // net profit / capital
  topNetPct: number;      // net per-contract edge at top of book (after fees, ex-gas)
  avgPoly: number;
  avgKalshi: number;
  limitPoly: number;      // worst price you need to cross on Polymarket
  limitKalshi: number;
  fills: Fill[];
  feasible: boolean;
}

const kFee = (p: number, rate: number) => rate * p * (1 - p);

function walk(polyAsks: Level[], kalshiAsks: Level[], profile: FeeProfile | null, direction: Direction): ArbResult {
  const kr = KALSHI_TAKER[profile?.kalshi_fee_tier ?? "standard"] ?? 0.07;
  const pr = POLY_TAKER[profile?.polymarket_tier ?? "standard"] ?? 0;
  const gas = Number(profile?.custom_gas_offset_usd ?? 0);
  const P = polyAsks.map((l) => ({ ...l })), K = kalshiAsks.map((l) => ({ ...l }));
  let i = 0, j = 0, contracts = 0, cost = 0, fees = 0, sp = 0, sk = 0;
  const fills: Fill[] = [];
  const unit = (pp: number, kp: number) => 1 - pp - kp - pp * pr - kFee(kp, kr);
  const topNet = P[0] && K[0] ? unit(P[0].price, K[0].price) : -1;
  while (i < P.length && j < K.length) {
    const pp = P[i]!.price, kp = K[j]!.price;
    if (unit(pp, kp) <= 0) break;
    const q = Math.min(P[i]!.size, K[j]!.size);
    const f = q * (pp * pr + kFee(kp, kr));
    contracts += q; fees += f; cost += q * (pp + kp) + f; sp += q * pp; sk += q * kp;
    fills.push({ polyPrice: pp, kalshiPrice: kp, contracts: q });
    P[i]!.size -= q; K[j]!.size -= q;
    if (P[i]!.size <= 1e-9) i++;
    if (K[j]!.size <= 1e-9) j++;
  }
  const netProfit = contracts - cost - (contracts ? gas : 0);
  const totalCost = cost + (contracts ? gas : 0);
  return {
    direction, contracts, costUsd: totalCost, feesUsd: fees + (contracts ? gas : 0), netProfitUsd: netProfit,
    netSpreadPct: totalCost > 0 ? (netProfit / totalCost) * 100 : topNet * 100,
    topNetPct: topNet * 100,
    avgPoly: contracts ? sp / contracts : P[0]?.price ?? 0,
    avgKalshi: contracts ? sk / contracts : K[0]?.price ?? 0,
    limitPoly: fills.at(-1)?.polyPrice ?? P[0]?.price ?? 0,
    limitKalshi: fills.at(-1)?.kalshiPrice ?? K[0]?.price ?? 0,
    fills, feasible: netProfit > 0,
  };
}

/** Best of both directions for one matched event. */
export function scanEvent(poly: Book | null | undefined, kalshi: Book | null | undefined, profile: FeeProfile | null): ArbResult | null {
  if (!poly || !kalshi) return null;
  const a = walk(poly.asks, noAsks(kalshi), profile, "POLY_YES+KALSHI_NO");
  const b = walk(noAsks(poly), kalshi.asks, profile, "POLY_NO+KALSHI_YES");
  const score = (r: ArbResult) => (r.feasible ? 1e6 + r.netProfitUsd : r.topNetPct);
  return score(a) >= score(b) ? a : b;
}

export function executionPlan(eventName: string, r: ArbResult) {
  const [polySide, kalshiSide] = r.direction === "POLY_YES+KALSHI_NO" ? ["YES", "NO"] : ["NO", "YES"];
  const n = Math.floor(r.contracts);
  return [
    `PolyBase execution plan — ${eventName}`,
    `Direction: Polymarket ${polySide} + Kalshi ${kalshiSide} (guaranteed $1.00 payout per pair)`,
    ``,
    `1. Polymarket: BUY ${n} ${polySide} shares, LIMIT ${r.limitPoly.toFixed(3)} (avg ≈ ${r.avgPoly.toFixed(3)})`,
    `2. Kalshi: BUY ${n} ${kalshiSide} contracts, LIMIT ${Math.round(r.limitKalshi * 100)}¢ (avg ≈ ${(r.avgKalshi * 100).toFixed(1)}¢)`,
    ``,
    `Capital required: $${r.costUsd.toFixed(2)} (incl. $${r.feesUsd.toFixed(2)} fees + gas)`,
    `Net locked profit: $${r.netProfitUsd.toFixed(2)} (${r.netSpreadPct.toFixed(2)}% net)`,
    `Execute the thinner leg first. If it partially fills, size the second leg to match. Don't cross the limits above.`,
    `PolyBase never places orders. This plan is for you to execute manually.`,
  ].join("\n");
}
