import type { FeeProfile, MatchedEvent, Position } from "./portfolio";
import { breakdown } from "./fees";

export interface EquityPoint { timestamp: string; total_equity_usd: number }
export interface MarketMark { day: string; event_key: string; yes_price: number }
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Only adjacent UTC calendar days count; gaps are not one-day returns. */
export function dailyReturns(points: EquityPoint[]) {
  const days = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (Number.isFinite(p.total_equity_usd)) days.set(p.timestamp.slice(0, 10), p.total_equity_usd);
  }
  const rows = [...days.entries()];
  return rows.flatMap(([day, equity], i) => {
    const prev = rows[i - 1];
    if (!prev || prev[1] <= 0 || Date.parse(day) - Date.parse(prev[0]) !== 86400000) return [];
    return [{ day, value: equity / prev[1] - 1 }];
  });
}

/** Historical one-day VaR/ES at 95% or 99%, annualized ratios, zero risk-free target. */
export function historicalRisk(points: EquityPoint[], equity: number, confidence: 0.95 | 0.99) {
  const values = dailyReturns(points).map((r) => r.value);
  const n = values.length;
  let sharpe: number | null = null, sortino: number | null = null;
  if (n >= 5) {
    const avg = mean(values);
    const sd = Math.sqrt(values.reduce((s, r) => s + (r - avg) ** 2, 0) / (n - 1));
    const downside = Math.sqrt(values.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / n);
    if (sd > 0) sharpe = avg / sd * Math.sqrt(365);
    if (downside > 0) sortino = avg / downside * Math.sqrt(365);
  }
  // Tail precision requires at least one expected observation in the tail.
  const minimum = confidence === 0.99 ? 100 : 20;
  let varUsd: number | null = null, esUsd: number | null = null;
  if (n >= minimum && equity > 0) {
    const sorted = [...values].sort((a, b) => a - b);
    const tailCount = Math.max(1, Math.round(n * (1 - confidence)));
    const tail = sorted.slice(0, tailCount);
    const boundary = tail[tail.length - 1];
    if (boundary != null) varUsd = Math.max(0, -boundary * equity);
    esUsd = Math.max(0, -mean(tail) * equity);
  }
  const latest = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1);
  const peak = Math.max(0, ...points.map((p) => p.total_equity_usd));
  const drawdownPct = latest && peak > 0 ? Math.max(0, (peak - latest.total_equity_usd) / peak * 100) : null;
  return { n, minimum, varUsd, esUsd, sharpe, sortino, drawdownPct };
}

export function allocation(positions: Position[], events: MatchedEvent[], profiles: FeeProfile[]) {
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const feeMap = new Map(profiles.map((p) => [p.user_id, p]));
  const gasCounts = new Map<string, number>();
  positions.filter((p) => p.venue === "Polymarket").forEach((p) => gasCounts.set(p.user_id, (gasCounts.get(p.user_id) ?? 0) + 1));
  const groups = new Map<string, { key: string; name: string; category: string; value: number; cost: number; yes: number; no: number; fees: number; markPnl: number }>();
  for (const p of positions) {
    const key = p.matched_event_id ?? `${p.venue}:${p.market_key}`;
    const event = eventMap.get(key);
    const profile = feeMap.get(p.user_id) ?? null;
    const gas = p.venue === "Polymarket" ? Number(profile?.custom_gas_offset_usd ?? 0) / (gasCounts.get(p.user_id) ?? 1) : 0;
    const b = breakdown(p, profile, gas);
    const g = groups.get(key) ?? { key, name: event?.event_name ?? p.market_title, category: event?.category ?? "Unmatched", value: 0, cost: 0, yes: 0, no: 0, fees: 0, markPnl: 0 };
    g.value += p.shares * p.current_price;
    g.cost += p.shares * p.avg_buy_price;
    g[p.outcome.toLowerCase() === "no" ? "no" : "yes"] += p.shares;
    g.fees += b.feesPaid + b.gas + b.exitFee;
    // Open-position P&L excludes previously realized P&L consistently.
    g.markPnl += b.net - b.realized;
    groups.set(key, g);
  }
  const equity = [...groups.values()].reduce((s, g) => s + g.value, 0);
  const rows = [...groups.values()].map((g) => ({ ...g, pct: equity > 0 ? g.value / equity * 100 : 0,
    ifYes: g.yes - g.cost - g.fees, ifNo: g.no - g.cost - g.fees,
    probability: g.yes + g.no > 0 ? Math.max(0, Math.min(1, (g.value - g.no) / (g.yes - g.no || 1))) : 0.5,
  })).sort((a, b) => b.value - a.value);
  return { equity, rows, worstPnl: rows.reduce((s, g) => s + Math.min(g.ifYes, g.ifNo), 0),
    netOpenPnl: rows.reduce((s, g) => s + g.markPnl, 0), concentration: rows[0]?.pct ?? 0 };
}

/** Pairwise Pearson correlation of YES probability changes on aligned consecutive days. */
export function correlations(marks: MarketMark[], keys: string[]) {
  const series = new Map<string, Map<string, number>>();
  for (const key of keys) {
    const rows = marks.filter((m) => m.event_key === key).sort((a, b) => a.day.localeCompare(b.day));
    const values = new Map<string, number>();
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (prev && Date.parse(r.day) - Date.parse(prev.day) === 86400000) values.set(r.day, r.yes_price - prev.yes_price);
    });
    series.set(key, values);
  }
  return keys.map((a) => keys.map((b) => {
    const x = series.get(a), y = series.get(b);
    const pairs = [...(x?.entries() ?? [])].flatMap(([day, value]) => {
      const other = y?.get(day); return other == null ? [] : [[value, other]];
    });
    if (pairs.length < 5) return null;
    const mx = mean(pairs.map((p) => p[0] ?? 0)), my = mean(pairs.map((p) => p[1] ?? 0));
    let cov = 0, vx = 0, vy = 0;
    pairs.forEach(([u = 0, v = 0]) => { cov += (u - mx) * (v - my); vx += (u - mx) ** 2; vy += (v - my) ** 2; });
    return vx > 0 && vy > 0 ? Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy))) : null;
  }));
}