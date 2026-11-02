import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pnl, VenueBadge } from "@/components/AppHeader";
import { positionsQ, profileQ } from "@/lib/queries";
import { scanHarvest, WASH_WINDOW_DAYS } from "@/lib/tax";
import { cents, usd } from "@/lib/portfolio";

export const Route = createFileRoute("/_authenticated/tax")({
  head: () => ({
    meta: [
      { title: "Tax-Loss Scanner — PolyBase" },
      { name: "description", content: "Find fee-adjusted losing positions to harvest, with wash-sale risk flags." },
      { property: "og:title", content: "Tax-Loss Scanner — PolyBase" },
      { property: "og:description", content: "Find fee-adjusted losing positions to harvest, with wash-sale risk flags." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tax,
});

function Tax() {
  const [rate, setRate] = useState(30);
  const [hideFlagged, setHideFlagged] = useState(false);
  const { data: positions = [] } = useQuery(positionsQ);
  const { data: profile = null } = useQuery(profileQ);
  const all = useMemo(() => scanHarvest(positions, profile, rate), [positions, profile, rate]);
  const rows = hideFlagged ? all.filter((c) => !c.washFlags.length) : all;
  const clean = all.filter((c) => !c.washFlags.length);
  const totalLoss = clean.reduce((s, c) => s + c.harvestableLoss, 0);
  const totalSave = clean.reduce((s, c) => s + c.estTaxSavings, 0);

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-bold">Tax-Loss Scanner</h1>
          <p className="text-xs text-muted-foreground">Open positions you could sell at a loss to offset gains. Losses are after exit fees and gas. Not tax advice.</p>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <label className="flex items-center gap-2">Tax rate
            <input type="number" min={0} max={60} value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="w-16 rounded-sm border bg-background px-2 py-1" />%
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hideFlagged} onChange={(e) => setHideFlagged(e.target.checked)} /> Hide wash-sale risks
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Clean harvestable loss" value={<Pnl v={totalLoss} />} />
        <Stat label="Est. tax savings" value={<span className="num text-gain">{usd(totalSave)}</span>} />
        <Stat label="Flagged for wash-sale" value={<span className="num">{all.length - clean.length} / {all.length}</span>} />
      </div>

      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full font-mono text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-left">
              <th className="p-2">Market</th><th className="p-2">Venue</th><th className="p-2">Side</th>
              <th className="p-2 text-right">Shares</th><th className="p-2 text-right">Avg / Bid</th>
              <th className="p-2 text-right">Harvestable</th><th className="p-2 text-right">Tax saved</th>
              <th className="p-2">Wash-sale</th><th className="p-2">Rebuy after</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No losing positions to harvest. Sync your venues to refresh.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.position.id} className="border-t">
                <td className="max-w-[320px] truncate p-2">{c.position.market_title}</td>
                <td className="p-2"><VenueBadge venue={c.position.venue} /></td>
                <td className="p-2">{c.position.outcome}</td>
                <td className="num p-2 text-right">{Number(c.position.shares).toLocaleString()}</td>
                <td className="num p-2 text-right">{cents(Number(c.position.avg_buy_price))} / {cents(Number(c.position.current_price))}</td>
                <td className="p-2 text-right"><Pnl v={c.harvestableLoss} /></td>
                <td className="num p-2 text-right">{usd(c.estTaxSavings)}</td>
                <td className="p-2">
                  {c.washFlags.length === 0 ? <span className="text-gain">Clear</span> : (
                    <span className="text-loss">
                      {c.washFlags.map((f) => (f === "replacement_held" ? "Same bet held on other venue" : `Bought < ${WASH_WINDOW_DAYS}d ago`)).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="num p-2">{c.safeRebuyDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Wash-sale flags are a cautious guide: “bought recently” uses the last time the position changed. PolyBase never places the sale for you.</p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-sm border p-3">
      <div className="font-mono text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg">{value}</div>
    </div>
  );
}
