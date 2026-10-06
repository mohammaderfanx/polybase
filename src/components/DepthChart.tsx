import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBook } from "@/lib/market-store";
import { bestAsk, bestBid, depthSeries, type Book } from "@/lib/orderbook";
import { usd } from "@/lib/portfolio";

function One({ venue, book }: { venue: "Polymarket" | "Kalshi"; book: Book | undefined }) {
  const { bids, asks } = depthSeries(book);
  const data = [...bids.map((b) => ({ price: b.price, bid: b.cum })), ...asks.map((a) => ({ price: a.price, ask: a.cum }))];
  const bb = bestBid(book), ba = bestAsk(book);
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
        <span className={venue === "Polymarket" ? "text-poly" : "text-kalshi"}>{venue.toUpperCase()} · YES</span>
        <span className="text-muted-foreground">
          {bb != null ? `${(bb * 100).toFixed(1)}¢` : "—"} / {ba != null ? `${(ba * 100).toFixed(1)}¢` : "—"}
          {bb != null && ba != null && <> · spread {((ba - bb) * 100).toFixed(1)}¢</>}
        </span>
      </div>
      {!data.length ? (
        <div className="grid h-36 place-items-center rounded-sm border border-dashed text-[11px] text-muted-foreground">No orderbook. Market not mapped or the feed is offline.</div>
      ) : (
        <div className="h-36">
          <ResponsiveContainer>
            <AreaChart data={data}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
              <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} stroke="var(--color-muted-foreground)" fontSize={9} tickFormatter={(v) => `${Math.round(v * 100)}¢`} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={9} width={50} tickFormatter={(v) => usd(v)} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", fontSize: 11 }} formatter={(v: number) => usd(v)} labelFormatter={(v) => `${(Number(v) * 100).toFixed(1)}¢`} />
              <Area type="stepAfter" dataKey="bid" stroke="var(--color-gain)" fill="var(--color-gain)" fillOpacity={0.2} isAnimationActive={false} />
              <Area type="stepBefore" dataKey="ask" stroke="var(--color-loss)" fill="var(--color-loss)" fillOpacity={0.2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Engine C — side-by-side cumulative depth for one matched event. */
export function CrossVenueDepth({ eventId }: { eventId: string }) {
  const poly = useBook("Polymarket", eventId);
  const kalshi = useBook("Kalshi", eventId);
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <One venue="Polymarket" book={poly} />
      <One venue="Kalshi" book={kalshi} />
    </div>
  );
}
