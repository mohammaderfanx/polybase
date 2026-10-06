import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventsQ, profileQ } from "./queries";
import { bookKey, useMarket } from "./market-store";
import { type ArbResult, scanEvent } from "./arb";
import { bestAsk } from "./orderbook";
import type { MatchedEvent } from "./portfolio";

export interface ArbRow { event: MatchedEvent; r: ArbResult | null; polyYes: number | null; kalshiYes: number | null }

/** Live arbitrage rows recomputed on every flushed tick. */
export function useArbs(): ArbRow[] {
  const { data: events = [] } = useQuery(eventsQ);
  const { data: profile = null } = useQuery(profileQ);
  const books = useMarket((s) => s.books);
  return useMemo(
    () =>
      events
        .filter((e) => e.polymarket_condition_id && e.kalshi_ticker)
        .map((event) => {
          const p = books[bookKey("Polymarket", event.id)], k = books[bookKey("Kalshi", event.id)];
          return { event, r: scanEvent(p, k, profile), polyYes: bestAsk(p), kalshiYes: bestAsk(k) };
        })
        .sort((a, b) => (b.r?.netSpreadPct ?? -999) - (a.r?.netSpreadPct ?? -999)),
    [events, profile, books],
  );
}
