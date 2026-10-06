/* eslint-disable @typescript-eslint/no-explicit-any */
import { constants, sign } from "node:crypto";
import { type Book, sortBook } from "./orderbook";

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

export async function polyYesToken(conditionId: string): Promise<string | null> {
  const r = await fetch(`https://clob.polymarket.com/markets/${encodeURIComponent(conditionId)}`);
  if (!r.ok) return null;
  const m = (await r.json()) as any;
  const tokens = (m?.tokens ?? []) as any[];
  return String((tokens.find((t) => String(t.outcome).toLowerCase() === "yes") ?? tokens[0])?.token_id ?? "") || null;
}

export async function polyBook(tokenId: string): Promise<Book | null> {
  const r = await fetch(`https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`);
  if (!r.ok) return null;
  const b = (await r.json()) as any;
  const lv = (a: any[]) => (a ?? []).map((l) => ({ price: n(l.price), size: n(l.size) }));
  return sortBook({ bids: lv(b.bids), asks: lv(b.asks) });
}

export async function kalshiBook(ticker: string, keyId: string, pemRaw: string): Promise<Book | null> {
  const pem = pemRaw.replace(/\\n/g, "\n");
  const path = `/trade-api/v2/markets/${encodeURIComponent(ticker)}/orderbook`;
  const ts = Date.now().toString();
  const sig = sign("sha256", Buffer.from(ts + "GET" + path), {
    key: pem, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64");
  const r = await fetch(`https://api.elections.kalshi.com${path}`, {
    headers: { "KALSHI-ACCESS-KEY": keyId, "KALSHI-ACCESS-TIMESTAMP": ts, "KALSHI-ACCESS-SIGNATURE": sig },
  });
  if (!r.ok) return null;
  const ob = ((await r.json()) as any)?.orderbook ?? {};
  const parse = (dollars: any[] | undefined, cents: any[] | undefined) =>
    dollars ? dollars.map(([p, q]: any) => ({ price: n(p), size: n(q) })) : (cents ?? []).map(([p, q]: any) => ({ price: n(p) / 100, size: n(q) }));
  const yesBids = parse(ob.yes_dollars, ob.yes);
  const noBidsL = parse(ob.no_dollars, ob.no);
  // A NO bid at q is a YES ask at 1−q.
  return sortBook({ bids: yesBids, asks: noBidsL.map((l) => ({ price: +(1 - l.price).toFixed(4), size: l.size })) });
}

export interface EventRef { id: string; polymarket_condition_id: string | null; kalshi_ticker: string | null }
export interface EventBooks { id: string; polyToken: string | null; poly: Book | null; kalshi: Book | null }

export async function fetchAllBooks(events: EventRef[], opts: { poly: boolean; kalshi: boolean; tokens?: Record<string, string> }) {
  const keyId = process.env["KALSHI_API_KEY_ID"];
  const pem = process.env["KALSHI_PRIVATE_KEY"];
  return Promise.all(
    events.map(async (e): Promise<EventBooks> => {
      const safe = async <T,>(f: () => Promise<T>) => { try { return await f(); } catch { return null; } };
      const polyToken = e.polymarket_condition_id
        ? opts.tokens?.[e.id] ?? (await safe(() => polyYesToken(e.polymarket_condition_id!)))
        : null;
      const [poly, kalshi] = await Promise.all([
        opts.poly && polyToken ? safe(() => polyBook(polyToken)) : null,
        opts.kalshi && e.kalshi_ticker && keyId && pem ? safe(() => kalshiBook(e.kalshi_ticker!, keyId, pem)) : null,
      ]);
      return { id: e.id, polyToken, poly, kalshi };
    }),
  );
}
