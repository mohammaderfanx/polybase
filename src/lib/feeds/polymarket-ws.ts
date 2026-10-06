/* eslint-disable @typescript-eslint/no-explicit-any */
import { applyLevel, sortBook } from "../orderbook";
import { bookKey, currentBook, queueBook, useMarket } from "../market-store";

const URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

/** Browser WS client for Polymarket CLOB. Calls onDown when the socket is lost so callers can poll. Returns a stop fn. */
export function startPolymarketWs(tokenToEvent: Record<string, string>, onDown: (down: boolean) => void) {
  const ids = Object.keys(tokenToEvent);
  if (!ids.length) return () => {};
  let ws: WebSocket | null = null, stopped = false, retry = 0, ping = 0, timer = 0;
  const st = useMarket.getState();

  const connect = () => {
    if (stopped) return;
    st.setStatus("Polymarket", "connecting");
    ws = new WebSocket(URL);
    ws.onopen = () => {
      retry = 0;
      ws!.send(JSON.stringify({ assets_ids: ids, type: "market" }));
      useMarket.getState().setStatus("Polymarket", "ws");
      onDown(false);
      ping = window.setInterval(() => ws?.readyState === 1 && ws.send("PING"), 10000);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string" || ev.data === "PONG") return;
      let msgs: any;
      try { msgs = JSON.parse(ev.data); } catch { return; }
      for (const m of Array.isArray(msgs) ? msgs : [msgs]) handle(m);
    };
    ws.onclose = ws.onerror = () => {
      window.clearInterval(ping);
      if (stopped) return;
      useMarket.getState().setStatus("Polymarket", "degraded");
      onDown(true);
      ws?.close();
      ws = null;
      timer = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  };

  const handle = (m: any) => {
    if (m.event_type === "book") {
      const ev = tokenToEvent[m.asset_id];
      if (!ev) return;
      const lv = (a: any[]) => (a ?? []).map((l) => ({ price: +l.price, size: +l.size }));
      queueBook(bookKey("Polymarket", ev), sortBook({ bids: lv(m.bids ?? m.buys), asks: lv(m.asks ?? m.sells) }));
    } else if (m.event_type === "price_change") {
      const changes: any[] = m.price_changes ?? m.changes ?? [];
      for (const c of changes) {
        const ev = tokenToEvent[c.asset_id ?? m.asset_id];
        if (!ev) continue;
        const k = bookKey("Polymarket", ev);
        const cur = currentBook(k) ?? { bids: [], asks: [], ts: 0 };
        queueBook(k, applyLevel(cur, c.side === "BUY" ? "bids" : "asks", +c.price, +c.size));
      }
    }
  };

  connect();
  return () => { stopped = true; window.clearInterval(ping); window.clearTimeout(timer); ws?.close(); };
}
