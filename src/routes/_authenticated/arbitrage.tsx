import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { useArbs } from "@/lib/useArbs";
import { executionPlan } from "@/lib/arb";
import { Flash } from "@/components/Flash";
import { CrossVenueDepth } from "@/components/DepthChart";
import { categories, type Category, usd } from "@/lib/portfolio";
import { logEvent } from "@/lib/books.functions";
import { Seg } from "./index";

export const Route = createFileRoute("/_authenticated/arbitrage")({
  head: () => ({
    meta: [
      { title: "Arbitrage Scanner — PolyBase" },
      { name: "description", content: "Live cross-venue spreads between Polymarket and Kalshi, net of fees, gas and slippage." },
      { property: "og:title", content: "Arbitrage Scanner — PolyBase" },
      { property: "og:description", content: "Live cross-venue spreads between Polymarket and Kalshi, net of fees, gas and slippage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArbPage,
});

const c = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}¢`);

function ArbPage() {
  const rows = useArbs();
  const log = useServerFn(logEvent);
  const [minSpread, setMinSpread] = useState(0);
  const [minLiq, setMinLiq] = useState(0);
  const [cat, setCat] = useState<Category | "All">("All");
  const [feas, setFeas] = useState<"All" | "Executable">("All");
  const [open, setOpen] = useState<string | null>(null);

  const shown = rows.filter(({ event, r }) =>
    (cat === "All" || event.category === cat) &&
    (feas === "All" || r?.feasible) &&
    (minSpread === 0 || (!!r && r.netSpreadPct >= minSpread)) &&
    (minLiq === 0 || (r?.costUsd ?? 0) >= minLiq));

  const copy = async (name: string, id: string, r: NonNullable<(typeof rows)[number]["r"]>) => {
    await navigator.clipboard.writeText(executionPlan(name, r));
    toast.success("Trade plan copied");
    log({ data: { event_type: "rebalance_recommendation", payload: { kind: "arb_plan", event_id: id, net_spread_pct: r.netSpreadPct, contracts: r.contracts } } }).catch(() => {});
  };

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Arbitrage & Opportunity Scanner</h1>
          <p className="text-xs text-muted-foreground">All spreads are net of taker fees, gas and slippage up to the routable size. PolyBase never places orders.</p>
        </div>
        <label className="text-[11px]"><span className="label-caps block">Min net spread %</span>
          <input type="number" step="0.1" value={minSpread} onChange={(e) => setMinSpread(Number(e.target.value))} className="num w-24 rounded-sm border bg-background px-2 py-1" /></label>
        <label className="text-[11px]"><span className="label-caps block">Min liquidity $</span>
          <input type="number" step="100" value={minLiq} onChange={(e) => setMinLiq(Number(e.target.value))} className="num w-24 rounded-sm border bg-background px-2 py-1" /></label>
        <Seg value={cat} onChange={setCat} options={["All", ...categories]} />
        <Seg value={feas} onChange={setFeas} options={["All", "Executable"]} />
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal">
              <th>Event</th><th>Direction</th><th className="text-right">Poly YES</th><th className="text-right">Kalshi YES</th>
              <th className="text-right">Avg pair cost</th><th className="text-right">Net spread</th><th className="text-right">Routable $</th>
              <th className="text-right">Net profit</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ event, r, polyYes, kalshiYes }) => (
              <Fragment key={event.id}>
                <tr onClick={() => setOpen(open === event.id ? null : event.id)} className="cursor-pointer border-b hover:bg-accent/50 [&>td]:px-3 [&>td]:py-1.5">
                  <td><div className="font-semibold">{event.event_name}</div><div className="text-[10px] text-muted-foreground">{event.category}</div></td>
                  <td className="font-mono text-[10px]">{r?.direction.replace("+", " + ").replaceAll("_", " ") ?? "—"}</td>
                  <td className="text-right"><Flash value={polyYes} className="num">{c(polyYes)}</Flash></td>
                  <td className="text-right"><Flash value={kalshiYes} className="num">{c(kalshiYes)}</Flash></td>
                  <td className="num text-right">{r ? c(r.avgPoly + r.avgKalshi) : "—"}</td>
                  <td className="text-right"><Flash value={r?.netSpreadPct} className={`num font-semibold ${r?.feasible ? "text-gain" : "text-muted-foreground"}`}>{r ? `${r.netSpreadPct.toFixed(2)}%` : "—"}</Flash></td>
                  <td className="num text-right">{r?.feasible ? usd(r.costUsd) : "—"}</td>
                  <td className="num text-right">{r?.feasible ? <span className="text-gain">+{usd(r.netProfitUsd)}</span> : <span className="text-muted-foreground">no edge</span>}</td>
                  <td className="text-right">
                    {r?.feasible && (
                      <button onClick={(e) => { e.stopPropagation(); copy(event.event_name, event.id, r); }} className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[10px] hover:bg-accent">
                        <Copy className="h-3 w-3" /> Plan
                      </button>
                    )}
                  </td>
                </tr>
                {open === event.id && (
                  <tr className="border-b bg-muted/30"><td colSpan={9} className="p-3">
                    <CrossVenueDepth eventId={event.id} />
                    {r?.feasible && <pre className="mt-3 whitespace-pre-wrap rounded-sm border bg-background p-2 font-mono text-[10px] text-muted-foreground">{executionPlan(event.event_name, r)}</pre>}
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!shown.length && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                {rows.length ? "No events match these filters." : "No events are linked to both a Polymarket and a Kalshi market yet."}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
