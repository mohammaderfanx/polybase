import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Pnl, VenueBadge } from "@/components/AppHeader";
import { categories, usd } from "@/lib/portfolio";
import { eventsQ, positionsQ, thresholdsQ } from "@/lib/queries";
import { exposures, impliedYes, resolutionMatrix, scenarioPnl } from "@/lib/delta";
import { logEvent } from "@/lib/books.functions";

export const Route = createFileRoute("/_authenticated/risk")({
  head: () => ({
    meta: [
      { title: "Risk Command & Stress Testing — PolyBase" },
      { name: "description", content: "Delta exposure heatmap, resolution scenarios and automated risk alerts across Polymarket and Kalshi." },
      { property: "og:title", content: "Risk Command & Stress Testing — PolyBase" },
      { property: "og:description", content: "Delta exposure heatmap, resolution scenarios and automated risk alerts across Polymarket and Kalshi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskPage,
});

function RiskPage() {
  const { data: positions = [] } = useQuery(positionsQ);
  const { data: events = [] } = useQuery(eventsQ);
  const ex = useMemo(() => exposures(positions, events), [positions, events]);
  const matrix = useMemo(() => resolutionMatrix(ex), [ex]);
  const [probs, setProbs] = useState<Record<string, number>>({});
  const base = scenarioPnl(ex, {});
  const scen = scenarioPnl(ex, probs);
  const log = useServerFn(logEvent);
  const maxAbs = Math.max(1, ...ex.map((e) => Math.abs(e.delta)));
  const cats = [...categories, "Unmatched"] as const;

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-4">
      <h1 className="text-lg font-semibold">Risk Command & Stress Testing</h1>

      <section className="panel p-3">
        <h2 className="label-caps mb-2">Delta Exposure Heatmap</h2>
        {!ex.length ? <p className="py-6 text-center text-xs text-muted-foreground">No positions yet.</p> : (
          <div className="grid gap-2 md:grid-cols-5">
            {cats.map((c) => {
              const items = ex.filter((e) => e.category === c);
              return (
                <div key={c}>
                  <div className="label-caps mb-1">{c} · <span className="num">{usd(items.reduce((s, e) => s + e.markValue, 0))}</span></div>
                  <div className="space-y-1">
                    {items.map((e) => {
                      const a = Math.min(1, Math.abs(e.delta) / maxAbs);
                      return (
                        <div key={e.key} title={`Δ ${e.delta.toFixed(0)} · worst ${usd(e.worstCase)}`}
                          className="rounded-sm border px-2 py-1 text-[11px]"
                          style={{ background: `color-mix(in oklab, var(--color-${e.delta >= 0 ? "gain" : "loss"}) ${Math.round(a * 45)}%, transparent)` }}>
                          <div className="truncate">{e.name}</div>
                          <div className="num flex justify-between text-[10px] text-muted-foreground"><span>Δ {e.delta >= 0 ? "+" : ""}{e.delta.toFixed(0)} · {e.bias}</span><span>{e.imbalancePct.toFixed(0)}%</span></div>
                        </div>
                      );
                    })}
                    {!items.length && <div className="text-[10px] text-muted-foreground">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="label-caps">Scenario Stress Tester</h2>
            <button onClick={() => setProbs({})} className="font-mono text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
          </div>
          <div className="mb-3 flex gap-6 text-xs">
            <div><div className="label-caps">Current (mark)</div><Pnl v={base} className="text-lg font-semibold" /></div>
            <div><div className="label-caps">Scenario P&L</div><Pnl v={scen} className="text-lg font-semibold" /></div>
            <div><div className="label-caps">Impact</div><Pnl v={scen - base} className="text-lg font-semibold" /></div>
          </div>
          <div className="space-y-2">
            {ex.slice(0, 20).map((e) => {
              const p = probs[e.key] ?? impliedYes(e);
              return (
                <div key={e.key} className="text-[11px]">
                  <div className="flex justify-between"><span className="truncate">{e.name}</span><span className="num text-muted-foreground">P(YES) {(p * 100).toFixed(0)}%</span></div>
                  <input type="range" min={0} max={1} step={0.01} value={p} onChange={(ev) => setProbs({ ...probs, [e.key]: Number(ev.target.value) })} className="w-full accent-primary" />
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel p-3">
          <h2 className="label-caps mb-2">Hedging Assistant</h2>
          <table className="w-full text-xs">
            <thead><tr className="label-caps text-left [&>th]:py-1 [&>th]:font-normal"><th>Event</th><th className="text-right">Δ</th><th className="text-right">If YES</th><th className="text-right">If NO</th><th>Rebalance</th></tr></thead>
            <tbody>
              {ex.map((e) => (
                <tr key={e.key} className="border-t [&>td]:py-1.5">
                  <td className="max-w-[200px] truncate">{e.name}</td>
                  <td className="num text-right">{e.delta.toFixed(0)}</td>
                  <td className="text-right"><Pnl v={e.pnlIfYes} /></td>
                  <td className="text-right"><Pnl v={e.pnlIfNo} /></td>
                  <td className="pl-2">
                    {e.rebalance ? (
                      <button onClick={async () => {
                        const t = `Buy ${e.rebalance!.contracts} ${e.rebalance!.venue} ${e.rebalance!.side} at $${e.rebalance!.price.toFixed(2)} to make "${e.name}" delta-neutral`;
                        await navigator.clipboard.writeText(t); toast.success("Rebalance order copied");
                        log({ data: { event_type: "rebalance_recommendation", payload: { event: e.key, ...e.rebalance! } } }).catch(() => {});
                      }} className="flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent">
                        Buy {e.rebalance.contracts} <VenueBadge venue={e.rebalance.venue} /> {e.rebalance.side} @ {e.rebalance.price.toFixed(2)}
                      </button>
                    ) : <span className="text-[10px] text-muted-foreground">neutral</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel overflow-x-auto p-3">
        <h2 className="label-caps mb-2">Black Swan / Resolution Impact Matrix · top {matrix.events.length} events, rest marked to market</h2>
        {!matrix.events.length ? <p className="py-6 text-center text-xs text-muted-foreground">No positions yet.</p> : (
          <table className="text-[11px]">
            <thead><tr className="label-caps [&>th]:px-2 [&>th]:py-1 [&>th]:font-normal">{matrix.events.map((e) => <th key={e.key} className="max-w-[120px] truncate text-left" title={e.name}>{e.name}</th>)}<th className="text-right">Portfolio P&L</th></tr></thead>
            <tbody>
              {[...matrix.rows.slice(0, 8), ...(matrix.rows.length > 16 ? [null] : []), ...matrix.rows.slice(Math.max(8, matrix.rows.length - 8))].map((r, i) => r ? (
                <tr key={i} className="border-t [&>td]:px-2 [&>td]:py-1">
                  {r.outcomes.map((o, j) => <td key={j} className={`num ${o === "Y" ? "text-gain" : "text-loss"}`}>{o === "Y" ? "YES" : "NO"}</td>)}
                  <td className="text-right font-semibold"><Pnl v={r.pnl} /></td>
                </tr>
              ) : <tr key="gap"><td colSpan={matrix.events.length + 1} className="py-1 text-center text-muted-foreground">⋯ {matrix.rows.length - 16} more ⋯</td></tr>)}
            </tbody>
          </table>
        )}
      </section>

      <AlertConfig />
    </main>
  );
}

function AlertConfig() {
  const qc = useQueryClient();
  const { data } = useQuery(thresholdsQ);
  const [f, setF] = useState({ max_portfolio_drawdown_pct: 10, max_single_event_exposure_usd: 5000, delta_imbalance_threshold_pct: 25, auto_alert_email: true, webhook_url: "" });
  useEffect(() => { if (data) setF({ ...data, webhook_url: data.webhook_url ?? "" }); }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const url = f.webhook_url.trim();
      if (url && !/^https:\/\//.test(url)) throw new Error("Webhook must start with https://");
      const { error } = await supabase.from("user_risk_thresholds").upsert({ user_id: u.user!.id, max_portfolio_drawdown_pct: f.max_portfolio_drawdown_pct, max_single_event_exposure_usd: f.max_single_event_exposure_usd, delta_imbalance_threshold_pct: f.delta_imbalance_threshold_pct, auto_alert_email: f.auto_alert_email, webhook_url: url || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Alert limits saved"); qc.invalidateQueries({ queryKey: thresholdsQ.queryKey }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const num = (k: "max_portfolio_drawdown_pct" | "max_single_event_exposure_usd" | "delta_imbalance_threshold_pct", label: string) => (
    <label className="text-[11px]"><span className="label-caps block">{label}</span>
      <input type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} className="num w-full rounded-sm border bg-background px-2 py-1" /></label>
  );
  return (
    <section className="panel p-3">
      <h2 className="label-caps mb-2">Risk Alerts Configurator</h2>
      <div className="grid gap-3 md:grid-cols-4">
        {num("max_portfolio_drawdown_pct", "Max drawdown %")}
        {num("max_single_event_exposure_usd", "Max single-event exposure $")}
        {num("delta_imbalance_threshold_pct", "Delta imbalance alert %")}
        <label className="text-[11px]"><span className="label-caps block">Webhook URL (Slack, Discord…)</span>
          <input value={f.webhook_url} onChange={(e) => setF({ ...f, webhook_url: e.target.value })} placeholder="https://hooks…" className="w-full rounded-sm border bg-background px-2 py-1 font-mono" /></label>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={f.auto_alert_email} onChange={(e) => setF({ ...f, auto_alert_email: e.target.checked })} /> Email alerts (coming soon)</label>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="ml-auto rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground disabled:opacity-50">Save limits</button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Checked automatically every 5 minutes. Alerts for net spreads opening, exposure over limit, and delta imbalance post to your webhook (max once per hour per alert).</p>
    </section>
  );
}
