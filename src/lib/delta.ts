/** Engine B — Portfolio delta, rebalance suggestions, resolution matrix & scenarios. */
import type { Category, MatchedEvent, Position } from "./portfolio";

export interface EventExposure {
  key: string;
  name: string;
  category: Category | "Unmatched";
  positions: Position[];
  yesShares: number;
  noShares: number;
  delta: number;           // + = long YES, contracts
  imbalancePct: number;
  bias: "YES" | "NO" | "NEUTRAL";
  cost: number;
  markValue: number;
  pnlIfYes: number;
  pnlIfNo: number;
  worstCase: number;
  rebalance: { side: "YES" | "NO"; venue: "Polymarket" | "Kalshi"; contracts: number; price: number } | null;
}

export function exposures(positions: Position[], events: MatchedEvent[]): EventExposure[] {
  const ev = new Map(events.map((e) => [e.id, e]));
  const groups = new Map<string, Position[]>();
  for (const p of positions) {
    const k = p.matched_event_id ?? `u:${p.market_key}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].map(([key, ps]) => {
    const e = ev.get(key);
    let yes = 0, no = 0, cost = 0, mark = 0;
    for (const p of ps) {
      const s = Number(p.shares);
      if (p.outcome.toLowerCase() === "no") no += s; else yes += s;
      cost += s * Number(p.avg_buy_price);
      mark += s * Number(p.current_price);
    }
    const delta = yes - no;
    const imb = yes + no ? (Math.abs(delta) / (yes + no)) * 100 : 0;
    const bias = imb < 5 ? "NEUTRAL" : delta > 0 ? "YES" : "NO";
    // Cheapest venue for the offsetting side, from current marks
    let rebalance: EventExposure["rebalance"] = null;
    if (Math.abs(delta) >= 1 && bias !== "NEUTRAL") {
      const side = delta > 0 ? "NO" : "YES";
      const quotes = ps.map((p) => ({
        venue: p.venue,
        price: p.outcome.toUpperCase() === side ? Number(p.current_price) : 1 - Number(p.current_price),
      }));
      const best = quotes.sort((a, b) => a.price - b.price)[0]!;
      rebalance = { side, venue: best.venue, contracts: Math.round(Math.abs(delta)), price: +best.price.toFixed(2) };
    }
    return {
      key, name: e?.event_name ?? ps[0]!.market_title, category: e?.category ?? "Unmatched",
      positions: ps, yesShares: yes, noShares: no, delta, imbalancePct: imb, bias, cost, markValue: mark,
      pnlIfYes: yes - cost, pnlIfNo: no - cost, worstCase: Math.min(yes - cost, no - cost), rebalance,
    };
  });
}

/** Every YES/NO combination over the top-N events; remaining events marked to market. */
export function resolutionMatrix(ex: EventExposure[], n = 6) {
  const top = [...ex].sort((a, b) => b.cost - a.cost).slice(0, n);
  const restMtm = ex.filter((e) => !top.includes(e)).reduce((s, e) => s + e.markValue - e.cost, 0);
  const rows: { outcomes: ("Y" | "N")[]; pnl: number }[] = [];
  for (let m = 0; m < 1 << top.length; m++) {
    const outcomes = top.map((_, i) => ((m >> i) & 1 ? "Y" : "N") as "Y" | "N");
    const pnl = top.reduce((s, e, i) => s + (outcomes[i] === "Y" ? e.pnlIfYes : e.pnlIfNo), restMtm);
    rows.push({ outcomes, pnl });
  }
  return { events: top, rows: rows.sort((a, b) => a.pnl - b.pnl) };
}

/** Expected P&L given user-set YES probabilities (defaults to current mark). */
export function scenarioPnl(ex: EventExposure[], probs: Record<string, number>) {
  return ex.reduce((s, e) => {
    const p = probs[e.key];
    if (p == null) return s + e.markValue - e.cost;
    return s + p * e.pnlIfYes + (1 - p) * e.pnlIfNo;
  }, 0);
}

/** Implied YES probability from the positions' marks. */
export function impliedYes(e: EventExposure) {
  const p = e.positions[0];
  if (!p) return 0.5;
  const c = Number(p.current_price);
  return p.outcome.toLowerCase() === "no" ? 1 - c : c;
}
