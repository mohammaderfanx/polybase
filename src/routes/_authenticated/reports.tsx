import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Pnl, VenueBadge } from "@/components/AppHeader";
import { Seg } from "./index";
import { type Venue, grossUnrealized, usd } from "@/lib/portfolio";
import { eventsQ, positionsQ, profileQ } from "@/lib/queries";
import { netPnlMap } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Tax & P&L Export — PolyBase" },
      { name: "description", content: "Export tax-ready realized P&L with separated fee deductions as CSV or JSON." },
      { property: "og:title", content: "Tax & P&L Export — PolyBase" },
      { property: "og:description", content: "Export tax-ready realized P&L with separated fee deductions as CSV or JSON." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reports,
});

function Reports() {
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-12-31");
  const [venue, setVenue] = useState<Venue | "All">("All");

  const { data: positions = [] } = useQuery(positionsQ);
  const { data: events = [] } = useQuery(eventsQ);
  const { data: profile = null } = useQuery(profileQ);
  const rows = useMemo(() => {
    const pnl = netPnlMap(positions, profile);
    return positions
      .filter((p) => (venue === "All" || p.venue === venue) && (!p.settlement_date || (p.settlement_date >= from && p.settlement_date <= to)))
      .map((p) => {
        const b = pnl.get(p.id)!;
        const fees = +(b.feesPaid + b.gas).toFixed(2);
        return {
          id: p.id, venue: p.venue, event: events.find((e) => e.id === p.matched_event_id)?.event_name ?? "", market: p.market_title,
          side: p.outcome, synced: p.updated_at.slice(0, 10), settles: p.settlement_date ?? "",
          realized_gross: Number(p.realized_pnl), fees, realized_net: +(Number(p.realized_pnl) - fees).toFixed(2),
          unrealized: +grossUnrealized(p).toFixed(2),
        };
      });
  }, [positions, events, profile, from, to, venue]);
  const tot = rows.reduce((s, r) => ({ g: s.g + r.realized_gross, f: s.f + r.fees, n: s.n + r.realized_net }), { g: 0, f: 0, n: 0 });

  const download = (kind: "csv" | "json") => {
    let body: string;
    if (kind === "json") body = JSON.stringify({ from, to, venue, totals: tot, rows }, null, 2);
    else {
      const keys = Object.keys(rows[0] ?? { id: "" });
      body = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify((r as Record<string, unknown>)[k] ?? "")).join(","))].join("\n");
    }
    const url = URL.createObjectURL(new Blob([body], { type: kind === "csv" ? "text/csv" : "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `polybase-pnl-${from}_${to}.${kind}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-[1300px] space-y-3 p-4">
      <h1 className="label-caps">Tax & P&L Export</h1>
      <section className="panel flex flex-wrap items-end gap-3 p-3">
        <label><div className="label-caps mb-1">From</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="num rounded-sm border bg-background px-2 py-1 text-xs [color-scheme:dark]" /></label>
        <label><div className="label-caps mb-1">To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="num rounded-sm border bg-background px-2 py-1 text-xs [color-scheme:dark]" /></label>
        <div><div className="label-caps mb-1">Venue</div><Seg value={venue} onChange={setVenue} options={["All", "Polymarket", "Kalshi"]} /></div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => download("csv")} disabled={!rows.length} className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground disabled:opacity-50"><Download className="h-3 w-3" /> CSV</button>
          <button onClick={() => download("json")} disabled={!rows.length} className="flex items-center gap-1 rounded-sm border px-3 py-1.5 font-mono text-[11px] hover:bg-accent disabled:opacity-50"><Download className="h-3 w-3" /> JSON</button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border bg-border">
        {[["Realized (gross)", tot.g], ["Fee deductions", -tot.f], ["Realized (net, taxable)", tot.n]].map(([l, v]) => (
          <div key={l as string} className="bg-card px-4 py-3"><div className="label-caps">{l}</div><div className="mt-1 text-xl font-semibold"><Pnl v={v as number} /></div></div>
        ))}
      </section>

      <section className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal">
              <th>Market</th><th>Venue</th><th>Side</th><th>Synced</th><th>Settles</th>
              <th className="text-right">Realized</th><th className="text-right">Fees</th><th className="text-right">Net</th><th className="text-right">Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b [&>td]:px-3 [&>td]:py-1.5">
                <td className="max-w-[320px] truncate">{r.market}</td>
                <td><VenueBadge venue={r.venue} /></td>
                <td className="num">{r.side.toUpperCase()}</td>
                <td className="num text-muted-foreground">{r.synced}</td>
                <td className="num text-muted-foreground">{r.settles}</td>
                <td className="text-right"><Pnl v={r.realized_gross} /></td>
                <td className="num text-right text-muted-foreground">{usd(r.fees)}</td>
                <td className="text-right"><Pnl v={r.realized_net} /></td>
                <td className="text-right"><Pnl v={r.unrealized} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No positions in this range.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
