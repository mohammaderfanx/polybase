/**
 * Engine A — Fee-Adjusted True P&L.
 * Polymarket: Net = (Bid - Avg) * Shares + Realized - Gas
 * Kalshi:     Net = (Bid - Avg) * Contracts + Realized - Contract fees paid - Est. exit/settlement fee
 */
import type { FeeProfile, Position } from "./portfolio";

/** Kalshi fee multiplier per tier (fee = ceil(rate * C * P * (1-P)), capped by schedule). */
const KALSHI_RATE: Record<string, number> = { standard: 0.07, maker: 0.0175, none: 0 };
/** Polymarket taker fee rate per tier (most markets are fee-free). */
const POLY_RATE: Record<string, number> = { standard: 0, taker: 0.01, none: 0 };

export const FEE_TIERS = {
  polymarket: Object.keys(POLY_RATE),
  kalshi: Object.keys(KALSHI_RATE),
};

export function kalshiExitFee(contracts: number, price: number, tier = "standard") {
  const rate = KALSHI_RATE[tier] ?? 0.07;
  return Math.ceil(rate * contracts * price * (1 - price) * 100) / 100;
}

export interface PnlBreakdown {
  gross: number;
  realized: number;
  feesPaid: number;
  gas: number;
  exitFee: number;
  net: number;
}

export function breakdown(p: Position, profile: FeeProfile | null, gasShare = 0): PnlBreakdown {
  const shares = Number(p.shares);
  const bid = Number(p.current_price);
  const gross = (bid - Number(p.avg_buy_price)) * shares;
  const realized = Number(p.realized_pnl);
  const feesPaid = Number(p.fees_paid);
  let gas = 0;
  let exitFee = 0;
  if (p.venue === "Polymarket") {
    gas = gasShare;
    exitFee = (POLY_RATE[profile?.polymarket_tier ?? "standard"] ?? 0) * shares * bid;
  } else {
    exitFee = kalshiExitFee(shares, bid, profile?.kalshi_fee_tier ?? "standard");
  }
  return { gross, realized, feesPaid, gas, exitFee, net: gross + realized - feesPaid - gas - exitFee };
}

/** Spreads the user's gas offset across Polymarket positions. */
export function netPnlMap(positions: Position[], profile: FeeProfile | null) {
  const polyCount = positions.filter((p) => p.venue === "Polymarket").length || 1;
  const gasShare = Number(profile?.custom_gas_offset_usd ?? 0) / polyCount;
  return new Map(positions.map((p) => [p.id, breakdown(p, profile, p.venue === "Polymarket" ? gasShare : 0)]));
}
