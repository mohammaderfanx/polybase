import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBooks } from "@/lib/books.functions";
import { bookKey, queueBook, useMarket } from "@/lib/market-store";
import { startPolymarketWs } from "@/lib/feeds/polymarket-ws";

const POLL_MS = 3000;

/** Mounted once in the header: Polymarket over WS (REST fallback), Kalshi over signed REST polling. */
export function FeedManager() {
  const fetchBooks = useServerFn(getBooks);
  const polyDown = useRef(true);
  const tokens = useRef<Record<string, string>>({});

  useEffect(() => {
    let alive = true, stopWs = () => {}, t = 0;
    const st = useMarket.getState();
    const tick = async (bootstrap = false) => {
      try {
        const { books } = await fetchBooks({ data: { poly: bootstrap || polyDown.current, kalshi: true, tokens: tokens.current } });
        if (!alive) return;
        let anyK = false;
        for (const b of books) {
          if (b.polyToken) tokens.current[b.id] = b.polyToken;
          if (b.poly) queueBook(bookKey("Polymarket", b.id), b.poly);
          if (b.kalshi) { anyK = true; queueBook(bookKey("Kalshi", b.id), b.kalshi); }
        }
        st.setStatus("Kalshi", anyK ? "polling" : books.some((b) => b.kalshi === null) ? "error" : "idle");
        if (bootstrap) {
          const map = Object.fromEntries(Object.entries(tokens.current).map(([ev, tok]) => [tok, ev]));
          stopWs = startPolymarketWs(map, (d) => { polyDown.current = d; });
          if (!Object.keys(map).length) st.setStatus("Polymarket", "idle");
        }
      } catch {
        if (alive) st.setStatus("Kalshi", "error");
      }
      if (alive) t = window.setTimeout(() => tick(), POLL_MS);
    };
    tick(true);
    return () => { alive = false; window.clearTimeout(t); stopWs(); };
  }, [fetchBooks]);

  return null;
}

const LABEL: Record<string, { dot: string; text: string }> = {
  ws: { dot: "bg-gain animate-pulse", text: "WS Live" },
  polling: { dot: "bg-gain", text: "REST 3s" },
  degraded: { dot: "bg-warn animate-pulse", text: "Degraded WebSocket — Polling Mode" },
  connecting: { dot: "bg-warn", text: "Connecting" },
  error: { dot: "bg-loss", text: "Feed error" },
  idle: { dot: "bg-muted-foreground", text: "No feed" },
};

export function FeedStatus() {
  const status = useMarket((s) => s.status);
  return (
    <>
      {(["Polymarket", "Kalshi"] as const).map((v) => {
        const l = LABEL[status[v]]!;
        return (
          <span key={v} className={`flex items-center gap-1.5 ${status[v] === "degraded" ? "rounded-sm border border-warn/40 bg-warn/10 px-1.5 text-warn" : "text-muted-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
            {v}: <span className={status[v] === "degraded" ? "" : "text-foreground"}>{l.text}</span>
          </span>
        );
      })}
    </>
  );
}
