/**
 * Tax-loss harvesting scanner (pure). Finds open positions whose fee-adjusted unrealized
 * P&L is a loss and flags wash-sale risk (30-day window) when a substantially identical
 * exposure is still held or was recently added.
 */
import { breakdown } from "./fees";
import type { FeeProfile, Position } from "./portfolio";

export const WASH_WINDOW_DAYS = 30;
const DAY = 86400000;

export type WashFlag = "replacement_held" | "recent_buy";

export interface HarvestCandidate {
  position: Position;
  /** Loss realized if sold at the current bid, after exit fees and gas (negative number). */
  harvestableLoss: number;
  estTaxSavings: number;
  washFlags: WashFlag[];
  /** Earliest date a repurchase avoids the wash-sale window, if sold today. */
  safeRebuyDate: string;
}

/** Side of the event a position is long, so YES on one venue matches YES on the other. */
const side = (p: Position) => (p.outcome.toLowerCase() === "no" ? "NO" : "YES");
const exposureKey = (p: Position) => `${p.matched_event_id ?? `u:${p.market_key}`}|${side(p)}`;

export function scanHarvest(
  positions: Position[],
  profile: FeeProfile | null,
  taxRatePct: number,
  now = Date.now(),
): HarvestCandidate[] {
  const polyCount = positions.filter((p) => p.venue === "Polymarket").length || 1;
  const gasShare = Number(profile?.custom_gas_offset_usd ?? 0) / polyCount;
  const out: HarvestCandidate[] = [];
  for (const p of positions) {
    if (Number(p.shares) <= 0) continue;
    const b = breakdown(p, profile, p.venue === "Polymarket" ? gasShare : 0);
    const loss = b.gross - b.exitFee - b.gas - b.feesPaid; // unrealized only, realized excluded
    if (loss >= 0) continue;
    const flags: WashFlag[] = [];
    const twins = positions.filter((q) => q.id !== p.id && Number(q.shares) > 0 && exposureKey(q) === exposureKey(p));
    if (twins.length) flags.push("replacement_held");
    if (now - new Date(p.updated_at).getTime() < WASH_WINDOW_DAYS * DAY) flags.push("recent_buy");
    out.push({
      position: p,
      harvestableLoss: loss,
      estTaxSavings: (-loss * Math.max(0, taxRatePct)) / 100,
      washFlags: flags,
      safeRebuyDate: new Date(now + (WASH_WINDOW_DAYS + 1) * DAY).toISOString().slice(0, 10),
    });
  }
  return out.sort((a, b) => a.harvestableLoss - b.harvestableLoss);
}
