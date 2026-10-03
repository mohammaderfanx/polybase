import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight, ExternalLink } from "lucide-react";
import { Pnl, VenueBadge } from "@/components/AppHeader";
import {
  type Category, type Position, type Venue, cents, costBasis, daysUntil, eventById, marketValue,
  matchedEvents, netPnl, pnl24h, positions, usd,
} from "@/lib/portfolio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Center — PolyBase" },
      { name: "description", content: "Unified, fee-adjusted P&L across Polymarket and Kalshi positions." },
      { property: "og:title", content: "Command Center — PolyBase" },
      { property: "og:description", content: "Unified, fee-adjusted P&L across Polymarket and Kalshi positions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

const categories: Category[] = ["Politics", "Macro / Economics", "Tech / AI", "Pop Culture"];

function Overview() {
  const [group, setGroup] = useState<"market" | "venue">("market");
  const [venue, setVenue] = useState<Venue | "All">("All");
  const [cat, setCat] = useState<Category | "All">("All");

  const filtered = useMemo(
    () => positions.filter((p) => (venue === "All" || p.venue === venue) && (cat === "All" || eventById(p.matched_event_id).category === cat)),
    [venue, cat],
  );

  const totalValue = positions.reduce((s, p) => s + marketValue(p), 0);
  const allTime = positions.reduce((s, p) => s + netPnl(p), 0);
  const day = positions.reduce((s, p) => s + pnl24h(p), 0);
  const exposure = positions.reduce((s, p) => s + costBasis(p), 0);
  const fees = positions.reduce((s, p) => s + p.fees_paid, 0);
  const pending = positions.filter((p) => daysUntil(p.settlement_date) <= 7);

  const groups = useMemo(() => {
    const key = (p: Position) => (group === "market" ? p.matched_event_id : p.venue);
    const m = new Map<string, Position[]>();
    filtered.forEach((p) => m.set(key(p), [...(m.get(key(p)) ?? []), p]));
    return [...m.entries()];
  }, [filtered, group]);

  const catExposure = categories.map((c) => ({
    c,
    v: positions.filter((p) => eventById(p.matched_event_id).category === c).reduce((s, p) => s + marketValue(p), 0),
  }));
  const maxCat = Math.max(...catExposure.map((x) => x.v), 1);

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-4">
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border lg:grid-cols-4">
        <Kpi label="Total Portfolio Value" value={<span className="num">{usd(totalValue)}</span>} sub={`${positions.length} open positions · 2 venues`} />
        <Kpi label="True Net P&L (fee-adj)" value={<Pnl v={allTime} />} sub={<>24h <Pnl v={day} /> · fees {usd(fees)}</>} />
        <Kpi label="Open Exposure" value={<span className="num">{usd(exposure)}</span>} sub="cost basis at risk" />
        <Kpi label="Pending Settlements · 7d" value={<span className="num">{pending.length}</span>} sub={<span className="num">{usd(pending.reduce((s, p) => s + marketValue(p), 0))} resolving</span>} />
      </section>

      <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <h2 className="label-caps mr-auto">Cross-Venue Positions</h2>
            <Seg value={venue} onChange={setVenue} options={["All", "Polymarket", "Kalshi"]} />
            <Seg value={cat} onChange={setCat} options={["All", ...categories]} />
            <Seg value={group} onChange={setGroup} options={["market", "venue"]} labels={{ market: "By Market", venue: "By Venue" }} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal">
                  <th>Event / Market</th><th>Venue</th><th>Side</th>
                  <th className="text-right">Shares</th><th className="text-right">Avg</th><th className="text-right">Current</th>
                  <th className="text-right">Fees</th><th className="text-right">Fee-Adj P&L</th><th />
                </tr>
              </thead>
              <tbody>
                {groups.map(([k, rows]) => {
                  const ev = group === "market" ? eventById(k) : null;
                  const venues = new Set(rows.map((r) => r.venue));
                  return (
                    <GroupRows key={k} rows={rows} title={ev ? ev.event_name : k}
                      meta={ev ? ev.category : `${rows.length} positions`}
                      hedged={!!ev && venues.size > 1} />
                  );
                })}
                {groups.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No positions match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="panel p-3">
            <h2 className="label-caps mb-3">Exposure by Category</h2>
            <div className="space-y-2.5">
              {catExposure.map(({ c, v }) => (
                <button key={c} onClick={() => setCat(cat === c ? "All" : c)} className="block w-full text-left">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className={cat === c ? "text-primary" : ""}>{c}</span>
                    <span className="num text-muted-foreground">{usd(v)} · {((v / totalValue) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-sm bg-muted">
                    <div className="h-full rounded-sm bg-primary transition-all" style={{ width: `${(v / maxCat) * 100}%` }} />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-sm bg-border">
              {matchedEvents.map((e) => {
                const pnl = positions.filter((p) => p.matched_event_id === e.id).reduce((s, p) => s + netPnl(p), 0);
                const a = Math.min(Math.abs(pnl) / 4000, 1) * 0.55 + 0.1;
                return (
                  <div key={e.id} className="bg-card p-2" title={e.event_name}>
                    <div className="absolute" />
                    <div className={`rounded-sm p-1.5 ${pnl >= 0 ? "bg-gain" : "bg-loss"}`} style={{ opacity: a + 0.3 }}>
                      <div className="truncate text-[10px] font-semibold text-primary-foreground">{e.event_name}</div>
                      <div className="num text-[10px] text-primary-foreground">{usd(pnl, true)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel p-3">
            <h2 className="label-caps mb-2">Settlement Calendar</h2>
            <ul className="divide-y">
              {[...positions].sort((a, b) => a.settlement_date.localeCompare(b.settlement_date)).map((p) => {
                const d = daysUntil(p.settlement_date);
                return (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className={`num w-12 text-[11px] ${d <= 7 ? "text-warn" : "text-muted-foreground"}`}>
                      {new Date(p.settlement_date).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}
                    </span>
                    <span className="flex-1 truncate">{p.market_title}</span>
                    <VenueBadge venue={p.venue} />
                    <span className="num w-8 text-right text-[11px] text-muted-foreground">{d}d</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function GroupRows({ rows, title, meta, hedged }: { rows: Position[]; title: string; meta: string; hedged: boolean }) {
  const net = rows.reduce((s, p) => s + netPnl(p), 0);
  return (
    <>
      <tr className="border-b bg-muted/50">
        <td colSpan={7} className="px-3 py-1.5">
          <span className="font-semibold">{title}</span>
          <span className="ml-2 text-[11px] text-muted-foreground">{meta}</span>
          {hedged && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-sm border border-primary/40 px-1.5 font-mono text-[10px] text-primary">
              <ArrowLeftRight className="h-2.5 w-2.5" /> HEDGED
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right font-semibold"><Pnl v={net} /></td>
        <td />
      </tr>
      {rows.map((p) => (
        <tr key={p.id} className="border-b hover:bg-accent/50 [&>td]:px-3 [&>td]:py-1.5">
          <td className="max-w-[280px] truncate pl-6 text-muted-foreground">{p.market_title}</td>
          <td><VenueBadge venue={p.venue} /></td>
          <td><span className={`num font-semibold ${p.outcome === "Yes" ? "text-gain" : "text-loss"}`}>{p.outcome.toUpperCase()}</span></td>
          <td className="num text-right">{p.shares.toLocaleString()}</td>
          <td className="num text-right">{cents(p.avg_buy_price)}</td>
          <td className="num text-right">{cents(p.current_price)}</td>
          <td className="num text-right text-muted-foreground">{usd(p.fees_paid)}</td>
          <td className="text-right"><Pnl v={netPnl(p)} /></td>
          <td className="text-right">
            <button className="text-muted-foreground hover:text-foreground" aria-label="View market"><ExternalLink className="h-3 w-3" /></button>
          </td>
        </tr>
      ))}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, labels }: { value: T; onChange: (v: T) => void; options: T[]; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="flex overflow-hidden rounded-sm border">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`px-2 py-0.5 font-mono text-[10px] ${value === o ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
