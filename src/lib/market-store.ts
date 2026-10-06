import { create } from "zustand";
import type { Book } from "./orderbook";

export type FeedStatus = "idle" | "connecting" | "ws" | "polling" | "degraded" | "error";
type V = "Polymarket" | "Kalshi";

interface MarketState {
  books: Record<string, Book>;           // `${venue}:${eventId}`
  status: Record<V, FeedStatus>;
  lastTick: number;
  setBooks: (patch: Record<string, Book>) => void;
  setStatus: (v: V, s: FeedStatus) => void;
}

export const useMarket = create<MarketState>((set) => ({
  books: {},
  status: { Polymarket: "idle", Kalshi: "idle" },
  lastTick: 0,
  setBooks: (patch) => set((s) => ({ books: { ...s.books, ...patch }, lastTick: Date.now() })),
  setStatus: (v, st) => set((s) => (s.status[v] === st ? s : { status: { ...s.status, [v]: st } })),
}));

export const bookKey = (v: V, id: string) => `${v}:${id}`;
/** Slice selector — re-renders only when this exact book object changes. */
export const useBook = (v: V, id: string) => useMarket((s) => s.books[bookKey(v, id)]);

/** rAF-batched writer: many WS ticks per frame → one store update. */
let pending: Record<string, Book> = {};
let raf = 0;
export function queueBook(key: string, b: Book) {
  pending[key] = b;
  if (raf) return;
  const flush = () => { raf = 0; const p = pending; pending = {}; useMarket.getState().setBooks(p); };
  raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
}

/** Latest book including not-yet-flushed ticks (for incremental updates). */
export const currentBook = (key: string): Book | undefined => pending[key] ?? useMarket.getState().books[key];
