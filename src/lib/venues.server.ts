/* eslint-disable @typescript-eslint/no-explicit-any */
import { constants, sign } from "node:crypto";

export interface RawPosition {
  market_key: string;
  market_title: string;
  outcome: string;
  shares: number;
  avg_buy_price: number;
  current_price: number;
  realized_pnl: number;
  fees_paid: number;
  settlement_date: string | null;
}

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

export async function fetchPolymarket(wallet: string): Promise<RawPosition[]> {
  const res = await fetch(
    `https://data-api.polymarket.com/positions?user=${encodeURIComponent(wallet)}&sizeThreshold=0.01&limit=500`,
  );
  if (!res.ok) throw new Error(`Polymarket returned ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, any>>;
  return rows.map((r) => ({
    market_key: String(r["conditionId"] ?? r["asset"]),
    market_title: String(r["title"] ?? "Unknown market"),
    outcome: String(r["outcome"] ?? "Yes"),
    shares: num(r["size"]),
    avg_buy_price: num(r["avgPrice"]),
    current_price: num(r["curPrice"]),
    realized_pnl: num(r["realizedPnl"]),
    fees_paid: 0,
    settlement_date: r["endDate"] ? String(r["endDate"]).slice(0, 10) : null,
  }));
}

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";

async function kalshiGet(path: string, keyId: string, pem: string) {
  const ts = Date.now().toString();
  const signPath = `/trade-api/v2${path.split("?")[0]}`;
  const sig = sign("sha256", Buffer.from(ts + "GET" + signPath), {
    key: pem,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64");
  const res = await fetch(KALSHI + path, {
    headers: { "KALSHI-ACCESS-KEY": keyId, "KALSHI-ACCESS-TIMESTAMP": ts, "KALSHI-ACCESS-SIGNATURE": sig },
  });
  if (!res.ok) throw new Error(`Kalshi returned ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json() as Promise<Record<string, any>>;
}

/** Dollar value from Kalshi field pairs (legacy cents vs new *_dollars). */
const dollars = (o: Record<string, any>, k: string) =>
  o[`${k}_dollars`] != null ? num(o[`${k}_dollars`]) : num(o[k]) / 100;

export async function fetchKalshi(keyId: string, pemRaw: string): Promise<RawPosition[]> {
  const pem = pemRaw.replace(/\\n/g, "\n");
  const data = await kalshiGet("/portfolio/positions?limit=1000&count_filter=position", keyId, pem);
  const list = (data["market_positions"] ?? []) as Array<Record<string, any>>;
  const out: RawPosition[] = [];
  for (const p of list) {
    const pos = p["position_fp"] != null ? num(p["position_fp"]) : num(p["position"]);
    if (!pos) continue;
    const side = pos > 0 ? "Yes" : "No";
    const contracts = Math.abs(pos);
    const exposure = dollars(p, "market_exposure");
    const m = (await kalshiGet(`/markets/${encodeURIComponent(p["ticker"])}`, keyId, pem))["market"] ?? {};
    const bid = side === "Yes" ? dollars(m, "yes_bid") : dollars(m, "no_bid");
    out.push({
      market_key: String(p["ticker"]),
      market_title: String(m["title"] ?? p["ticker"]),
      outcome: side,
      shares: contracts,
      avg_buy_price: contracts ? exposure / contracts : 0,
      current_price: bid,
      realized_pnl: dollars(p, "realized_pnl"),
      fees_paid: dollars(p, "fees_paid"),
      settlement_date: m["close_time"] ? String(m["close_time"]).slice(0, 10) : null,
    });
  }
  return out;
}
