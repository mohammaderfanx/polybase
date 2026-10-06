/** Normalized L2 book for the YES outcome of a binary market. Prices in dollars (0–1), sizes in contracts. */
export interface Level { price: number; size: number }
export interface Book { bids: Level[]; asks: Level[]; ts: number }

export const sortBook = (b: { bids: Level[]; asks: Level[] }, ts = Date.now()): Book => ({
  bids: b.bids.filter((l) => l.size > 0).sort((x, y) => y.price - x.price),
  asks: b.asks.filter((l) => l.size > 0).sort((x, y) => x.price - y.price),
  ts,
});

/** NO-outcome asks derived from YES bids (buying NO at 1−p matches a YES bid at p). */
export const noAsks = (b: Book): Level[] => b.bids.map((l) => ({ price: +(1 - l.price).toFixed(4), size: l.size }));
export const noBids = (b: Book): Level[] => b.asks.map((l) => ({ price: +(1 - l.price).toFixed(4), size: l.size }));

export const bestAsk = (b?: Book | null) => b?.asks[0]?.price ?? null;
export const bestBid = (b?: Book | null) => b?.bids[0]?.price ?? null;
export const mid = (b?: Book | null) => {
  const a = bestAsk(b), d = bestBid(b);
  return a != null && d != null ? (a + d) / 2 : a ?? d;
};

/** Cumulative depth series for charting. */
export function depthSeries(b: Book | null | undefined) {
  if (!b) return { bids: [], asks: [] };
  let c = 0;
  const bids = b.bids.slice(0, 25).map((l) => ({ price: l.price, cum: (c += l.size * l.price) }));
  c = 0;
  const asks = b.asks.slice(0, 25).map((l) => ({ price: l.price, cum: (c += l.size * l.price) }));
  return { bids: bids.reverse(), asks };
}

/** Apply a single level change (size 0 removes). */
export function applyLevel(b: Book, side: "bids" | "asks", price: number, size: number): Book {
  const lv = b[side].filter((l) => Math.abs(l.price - price) > 1e-9);
  if (size > 0) lv.push({ price, size });
  return sortBook({ ...b, [side]: lv } as Book);
}
