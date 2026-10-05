import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pnl, VenueBadge } from "@/components/AppHeader";
import { type Category, type Position, type Venue, categories, cents, costBasis, daysUntil, marketValue, usd } from "@/lib/portfolio";
import { netPnlMap, type PnlBreakdown } from "@/lib/fees";
import { accountsQ, eventsQ, positionsQ, profileQ, snapshotsQ } from "@/lib/queries";
import { syncPortfolio } from "@/lib/sync.functions";

export const Route = createFileRoute("/_authenticated/")({
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

function Overview() {
  const qc = useQueryClient();
  const { data: positions = [] } = useQuery(positionsQ);
  const { data: events = [] } = useQuery(eventsQ);
  const { data: profile = null } = useQuery(profileQ);
  const { data: accounts = [] } = useQuery(accountsQ);
  const { data: snaps = [] } = useQuery(snapshotsQ);
  const sync = useServerFn(syncPortfolio);
  const m = useMutation({ mutationFn: () => sync(), onSettled: () => qc.invalidateQueries() });

  const [group, setGroup] = useState<"market" | "venue">("market");
  const [venue, setVenue] = useState<Venue | "All">("All");
  const [cat, setCat] = useState<Category | "All">("All");

  const evMap = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const catOf = (p: Position) => (p.matched_event_id ? evMap.get(p.matched_event_id)?.category : undefined) ?? "Unmatched";
  const pnl = useMemo(() => netPnlMap(positions, profile), [positions, profile]);

  const filtered = positions.filter((p) => (venue === "All" || p.venue === venue) && (cat === "All" || catOf(p) === cat));
  const totalValue = positions.reduce((s, p) => s + marketValue(p), 0);
  const allTime = positions.reduce((s, p) => s + pnl.get(p.id)!.net, 0);
  const exposure = positions.reduce((s, p) => s + costBasis(p), 0);
  const fees = positions.reduce((s, p) => { const b = pnl.get(p.id)!; return s + b.feesPaid + b.gas + b.exitFee; }, 0);
  const pending = positions.filter((p) => daysUntil(p.settlement_date) <= 7);
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const day = prev ? totalValue - Number(prev.total_equity_usd) : 0;

  const groups = useMemo(() => {
    const key = (p: Position) => (group === "market" ? p.matched_event_id ?? `u:${p.market_key}` : p.venue);
    const mm = new Map<string, Position[]>();
    filtered.forEach((p) => mm.set(key(p), [...(mm.get(key(p)) ?? []), p]));
    return [...mm.entries()];
  }, [filtered, group]);

  const catExposure = categories.map((c) => ({ c, v: positions.filter((p) => catOf(p) === c).reduce((s, p) => s + marketValue(p), 0) }));
  const maxCat = Math.max(...catExposure.map((x) => x.v), 1);

  const venueCmp = (["Polymarket", "Kalshi"] as Venue[]).map((v) => {
    const ps = positions.filter((p) => p.venue === v);
    const t = ps.reduce((a, p) => { const b = pnl.get(p.id)!; return { gross: a.gross + b.gross + b.realized, fees: a.fees + b.feesPaid + b.gas + b.exitFee, net: a.net + b.net }; }, { gross: 0, fees: 0, net: 0 });
    return { v, ...t, n: ps.length };
  });

  if (!accounts.length) {
    return (
      <main className="mx-auto grid max-w-xl place-items-center p-12 text-center">
        <div className="panel space-y-3 p-8">
          <h1 className="text-lg font-semibold">Connect your first venue</h1>
          <p className="text-sm text-muted-foreground">Add a Polymarket wallet address or your Kalshi account to start tracking fee-adjusted P&L.</p>
          <Link to="/venues" className="inline-block rounded-sm bg-primary px-4 py-2 font-mono text-xs font-semibold text-primary-foreground">Go to Venues</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-4">
      <div className="flex items-center justify-end gap-2">
        {m.data?.results.filter((r) => !r.ok).map((r) => <span key={r.id} className="text-[11px] text-loss">{r.error}</span>)}
        <button onClick={() => m.mutate()} disabled={m.isPending} className="flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] hover:bg-accent disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${m.isPending ? "animate-spin" : ""}`} /> Sync all venues
        </button>
      </div>
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border lg:grid-cols-4">
        <Kpi label="Total Portfolio Value" value={<span className="num">{usd(totalValue)}</span>} sub={`${positions.length} open positions · ${accounts.length} accounts`} />
        <Kpi label="True Net P&L (fee-adj)" value={<Pnl v={allTime} />} sub={<>since last sync <Pnl v={day} /> · fees {usd(fees)}</>} />
        <Kpi label="Open Exposure" value={<span className="num">{usd(exposure)}</span>} sub="cost basis at risk" />
        <Kpi label="Pending Settlements · 7d" value={<span className="num">{pending.length}</span>} sub={<span className="num">{usd(pending.reduce((s, p) => s + marketValue(p), 0))} resolving</span>} />
      </section>

      <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
        <section className="panel p-3">
          <h2 className="label-caps mb-2">Equity & Net P&L History</h2>
          {snaps.length < 2 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">History builds up each time you sync. Sync again later to see your chart.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={snaps.map((s) => ({ t: new Date(s.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }), equity: Number(s.total_equity_usd), net: Number(s.unrealized_pnl_usd) + Number(s.realized_pnl_usd) - Number(s.net_fees_usd) }))}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
                  <XAxis dataKey="t" stroke="var(--color-muted-foreground)" fontSize={10} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickFormatter={(v) => usd(v)} width={70} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", fontSize: 11 }} formatter={(v: number) => usd(v)} />
                  <Area dataKey="equity" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
                  <Area dataKey="net" stroke="var(--color-gain)" fill="var(--color-gain)" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="panel p-3">
          <h2 className="label-caps mb-2">Venue Comparison (fee-adjusted)</h2>
          <table className="w-full text-xs">
            <thead><tr className="label-caps text-left [&>th]:py-1 [&>th]:font-normal"><th>Venue</th><th className="text-right">Gross</th><th className="text-right">Fees</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {venueCmp.map((r) => (
                <tr key={r.v} className="border-t [&>td]:py-1.5">
                  <td><VenueBadge venue={r.v} /> <span className="text-[10px] text-muted-foreground">{r.n}</span></td>
                  <td className="text-right"><Pnl v={r.gross} /></td>
                  <td className="num text-right text-muted-foreground">{usd(r.fees)}</td>
                  <td className="text-right font-semibold"><Pnl v={r.net} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted-foreground">Polymarket: (bid − avg) × shares − gas. Kalshi: (bid − avg) × contracts − contract fees − est. exit fee.</p>
        </section>
      </div>

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
                  <th className="text-right">Shares</th><th className="text-right">Avg</th><th className="text-right">Bid</th>
                  <th className="text-right">Fees</th><th className="text-right">Fee-Adj P&L</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([k, rows]) => {
                  const ev = group === "market" ? evMap.get(k) : null;
                  const title = group === "venue" ? k : ev ? ev.event_name : rows[0].market_title;
                  return <GroupRows key={k} rows={rows} pnl={pnl} title={title}
                    meta={group === "venue" ? `${rows.length} positions` : ev ? ev.category : "Unmatched"}
                    hedged={!!ev && new Set(rows.map((r) => r.venue)).size > 1} />;
                })}
                {groups.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No positions yet. Hit "Sync all venues" to pull them in.</td></tr>
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
                    <span className="num text-muted-foreground">{usd(v)} · {totalValue ? ((v / totalValue) * 100).toFixed(0) : 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-sm bg-muted"><div className="h-full rounded-sm bg-primary transition-all" style={{ width: `${(v / maxCat) * 100}%` }} /></div>
                </button>
              ))}
            </div>
          </section>
          <section className="panel p-3">
            <h2 className="label-caps mb-2">Settlement Calendar</h2>
            <ul className="divide-y">
              {[...positions].filter((p) => p.settlement_date).sort((a, b) => a.settlement_date!.localeCompare(b.settlement_date!)).slice(0, 12).map((p) => {
                const d = daysUntil(p.settlement_date);
                return (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className={`num w-12 text-[11px] ${d <= 7 ? "text-warn" : "text-muted-foreground"}`}>
                      {new Date(p.settlement_date!).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}
                    </span>
                    <span className="flex-1 truncate">{p.market_title}</span>
                    <VenueBadge venue={p.venue} />
                    <span className="num w-10 text-right text-[11px] text-muted-foreground">{d}d</span>
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

function GroupRows({ rows, pnl, title, meta, hedged }: { rows: Position[]; pnl: Map<string, PnlBreakdown>; title: string; meta: string; hedged: boolean }) {
  const net = rows.reduce((s, p) => s + pnl.get(p.id)!.net, 0);
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
      </tr>
      {rows.map((p) => {
        const b = pnl.get(p.id)!;
        return (
          <tr key={p.id} className="border-b hover:bg-accent/50 [&>td]:px-3 [&>td]:py-1.5">
            <td className="max-w-[280px] truncate pl-6 text-muted-foreground">{p.market_title}</td>
            <td><VenueBadge venue={p.venue} /></td>
            <td><span className={`num font-semibold ${p.outcome === "Yes" ? "text-gain" : "text-loss"}`}>{p.outcome.toUpperCase()}</span></td>
            <td className="num text-right">{Number(p.shares).toLocaleString()}</td>
            <td className="num text-right">{cents(Number(p.avg_buy_price))}</td>
            <td className="num text-right">{cents(Number(p.current_price))}</td>
            <td className="num text-right text-muted-foreground" title={`paid ${usd(b.feesPaid)} · gas ${usd(b.gas)} · est. exit ${usd(b.exitFee)}`}>{usd(b.feesPaid + b.gas + b.exitFee)}</td>
            <td className="text-right"><Pnl v={b.net} /></td>
          </tr>
        );
      })}
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
