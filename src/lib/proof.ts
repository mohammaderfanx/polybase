/** Engine D — Proof-of-P&L metrics + ECDSA P-256 verification. Pure; safe in browser, server and tests. */
export interface PosLite { shares: number; avg_buy_price: number; current_price: number; realized_pnl: number; fees_paid: number; market_title: string; outcome: string; venue: string }
export interface SnapLite { timestamp: string; total_equity_usd: number }

export interface Metrics {
  total_roi_pct: number | null;
  win_rate_pct: number | null;
  sharpe_ratio: number | null;
  total_volume_usd: number;
  net_pnl_usd: number;
  positions: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function positionNet(p: PosLite) {
  const s = Number(p.shares);
  return s * (Number(p.current_price) - Number(p.avg_buy_price)) + Number(p.realized_pnl) - Number(p.fees_paid);
}

/** Annualised Sharpe from end-of-day equity; null with fewer than 5 daily returns. */
export function sharpe(snaps: SnapLite[]): number | null {
  const byDay = new Map<string, number>();
  for (const s of [...snaps].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) byDay.set(s.timestamp.slice(0, 10), Number(s.total_equity_usd));
  const eq = [...byDay.values()];
  const rets: number[] = [];
  for (let i = 1; i < eq.length; i++) if (eq[i - 1]! > 0) rets.push(eq[i]! / eq[i - 1]! - 1);
  if (rets.length < 5) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  return sd === 0 ? null : r2((mean / sd) * Math.sqrt(365));
}

export function computeMetrics(positions: PosLite[], snaps: SnapLite[]): Metrics {
  const volume = positions.reduce((a, p) => a + Number(p.shares) * Number(p.avg_buy_price), 0);
  const nets = positions.map(positionNet);
  const net = nets.reduce((a, b) => a + b, 0);
  return {
    total_roi_pct: volume > 0 ? r2((net / volume) * 100) : null,
    win_rate_pct: positions.length ? r2((nets.filter((n) => n > 0).length / positions.length) * 100) : null,
    sharpe_ratio: sharpe(snaps),
    total_volume_usd: r2(volume),
    net_pnl_usd: r2(net),
    positions: positions.length,
  };
}

/** Signed statement: percentages only, never dollar amounts. */
export function proofPayload(handle: string, m: Metrics, asOf: string) {
  return JSON.stringify({ v: 1, issuer: "polybase", handle, roi_pct: m.total_roi_pct, win_rate_pct: m.win_rate_pct, sharpe: m.sharpe_ratio, positions: m.positions, as_of: asOf });
}

const b64u = {
  enc: (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
const ALG = { name: "ECDSA", hash: "SHA-256" } as const;

export async function signProof(privateJwk: JsonWebKey, payload: string) {
  const k = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return b64u.enc(await crypto.subtle.sign(ALG, k, new TextEncoder().encode(payload)));
}

export async function verifyProof(publicJwk: JsonWebKey, payload: string, sig: string) {
  try {
    const k = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify(ALG, k, b64u.dec(sig), new TextEncoder().encode(payload));
  } catch { return false; }
}
