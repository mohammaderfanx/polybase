import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getInstitutional } from "@/lib/institutional.functions";
import { allocation, correlations, historicalRisk } from "@/lib/institutional";
import { eventsQ } from "@/lib/queries";
import { usd } from "@/lib/portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const riskQ = (organizationId: string | null) => queryOptions({ queryKey: ["institutional", organizationId], queryFn: () => getInstitutional({ data: { organizationId } }) });
const orgsQ = queryOptions({ queryKey: ["orgs"], queryFn: async () => { const { data, error } = await supabase.from("organizations").select("*").order("name"); if (error) throw error; return data; } });
export const Route = createFileRoute("/_authenticated/analytics/institutional")({
  head: () => ({ meta: [
    { title: "Institutional Risk & VaR — PolyBase" },
    { name: "description", content: "Team-scoped historical VaR, expected shortfall, concentration, correlations and dual-admin risk governance." },
    { property: "og:title", content: "Institutional Risk & VaR — PolyBase" },
    { property: "og:description", content: "Fee-adjusted risk analytics and two-admin limit approvals for prediction market desks." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(riskQ(null)), context.queryClient.ensureQueryData(eventsQ), context.queryClient.ensureQueryData(orgsQ)]); },
  component: InstitutionalPage,
});

function InstitutionalPage() {
  const qc = useQueryClient();
  const { data: orgs } = useSuspenseQuery(orgsQ);
  const [org, setOrg] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<0.95 | 0.99>(0.95);
  return <main className="mx-auto max-w-[1600px] space-y-5 p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><h1 className="font-mono text-base font-semibold">INSTITUTIONAL RISK</h1></div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <label className="flex items-center gap-2">Portfolio<select aria-label="Portfolio scope" value={org ?? ""} onChange={(e) => setOrg(e.target.value || null)} className="max-w-60 rounded-sm border bg-background px-2 py-1.5"><option value="">Personal portfolio</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label className="flex items-center gap-2">Confidence<select aria-label="Confidence" value={confidence} onChange={(e) => setConfidence(e.target.value === "0.99" ? 0.99 : 0.95)} className="rounded-sm border bg-background px-2 py-1.5"><option value={0.95}>95%</option><option value={0.99}>99%</option></select></label>
        <Button variant="outline" size="icon" aria-label="Refresh analytics" title="Refresh analytics" onClick={() => qc.invalidateQueries({ queryKey: ["institutional", org] })}><RefreshCw /></Button>
      </div>
    </header>
    <RiskView key={org ?? "personal"} org={org} confidence={confidence} />
    {org && <Governance key={org} org={org} />}
  </main>;
}

function RiskView({ org, confidence }: { org: string | null; confidence: 0.95 | 0.99 }) {
  const { data, error, isPending } = useQuery(riskQ(org));
  const { data: events } = useSuspenseQuery(eventsQ);
  const [stress, setStress] = useState<Record<string, number>>({});
  if (error) return <p role="alert" className="border-y py-4 text-loss">{error.message}</p>;
  if (isPending || !data) return <p className="py-10 text-muted-foreground">Loading risk analytics…</p>;
  const a = allocation(data.positions, events, data.profiles);
  const h = historicalRisk(data.history, a.equity, confidence);
  const top = a.rows.slice(0, 8);
  const matrix = correlations(data.marks, top.map((r) => r.key));
  const stressPnl = a.rows.reduce((s, r) => { const probability = stress[r.key]; return s + (probability == null ? r.markPnl : probability * r.ifYes + (1 - probability) * r.ifNo); }, 0);
  const metrics = [
    ["Open equity", usd(a.equity)], ["1-day VaR", h.varUsd == null ? "—" : usd(h.varUsd)], ["Expected shortfall", h.esUsd == null ? "—" : usd(h.esUsd)],
    ["Sharpe", h.sharpe?.toFixed(2) ?? "—"], ["Sortino", h.sortino?.toFixed(2) ?? "—"], ["Drawdown", h.drawdownPct == null ? "—" : `${h.drawdownPct.toFixed(1)}%`],
  ];
  return <>
    <section className="grid grid-cols-2 gap-y-4 border-y py-4 md:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, value]) => <div key={label} className="border-l px-3"><h2 className="font-mono text-[10px] uppercase text-muted-foreground">{label}</h2><p className="num mt-1 text-xl font-semibold">{value}</p></div>)}</section>
    <div className="flex flex-wrap justify-between gap-2 font-mono text-[11px] text-muted-foreground"><span>{h.n} daily returns · {h.minimum} required for {(confidence * 100).toFixed(0)}% VaR</span><span>Historical equity · zero risk-free target · 365-day annualization</span></div>
    <p className="text-[11px] text-muted-foreground">Equity changes include deposits, withdrawals and position changes; returns are not cash-flow adjusted. VaR is an estimate, not a loss limit. {org ? "Team history starts with successful shared-account syncs; personal history is excluded." : "Correlations use daily YES marks captured after successful syncs."}</p>
    {!a.rows.length && <div className="flex flex-wrap items-center gap-3 border-y py-8"><p className="text-muted-foreground">{org ? "No synced positions in this team's shared account pool." : "No synced positions yet."}</p><Button asChild variant="outline" size="sm"><Link to={org ? "/settings/organization" : "/venues"}>{org ? "Team accounts" : "Venues"}</Link></Button></div>}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="min-w-0"><h2 className="mb-3 font-mono text-xs font-semibold">CAPITAL ALLOCATION · largest event {a.concentration.toFixed(1)}%</h2>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="font-mono text-[10px] text-muted-foreground"><tr className="border-b text-left"><th className="py-2">Event / category</th><th className="text-right">Equity</th><th className="text-right">Weight</th><th className="text-right">Capital / mark</th></tr></thead><tbody>{a.rows.map((r) => <tr key={r.key} className="border-b"><td className="max-w-56 py-2 pr-2"><div className="truncate" title={r.name}>{r.name}</div><span className="text-[10px] text-muted-foreground">{r.category}</span></td><td className="num text-right">{usd(r.value)}</td><td className={`num text-right ${r.pct > 25 ? "text-warn" : "text-foreground"}`}>{r.pct.toFixed(1)}%</td><td className="num text-right">{r.value > 0 ? `${(r.cost / r.value * 100).toFixed(0)}%` : "—"}</td></tr>)}</tbody></table></div>
        <div className="mt-3 flex flex-wrap gap-3">{[...new Set(a.rows.map((r) => r.category))].map((category) => <div key={category} className="min-w-32 border-l-2 border-primary pl-2"><div className="text-[10px] text-muted-foreground">{category}</div><div className="num">{usd(a.rows.filter((r) => r.category === category).reduce((s, r) => s + r.value, 0))}</div></div>)}</div>
      </section>
      <section><div className="mb-3 flex justify-between gap-2"><h2 className="font-mono text-xs font-semibold">RESOLUTION STRESS</h2><Button variant="ghost" size="sm" onClick={() => setStress({})}><RefreshCw />Reset</Button></div>
        <div className="mb-3 grid grid-cols-2 gap-3 border-y py-3"><div><div className="text-[10px] text-muted-foreground">Scenario open P&L</div><p className={`num text-lg ${stressPnl >= 0 ? "text-gain" : "text-loss"}`}>{usd(stressPnl, true)}</p></div><div><div className="text-[10px] text-muted-foreground">All-event worst resolution</div><p className={`num text-lg ${a.worstPnl >= 0 ? "text-gain" : "text-loss"}`}>{usd(a.worstPnl, true)}</p></div></div>
        <p className="mb-3 text-[11px] text-muted-foreground">Open cost and paid fees deducted; current estimated exit fees and gas reserved conservatively for either outcome. Realized P&L excluded.</p>
        <div className="space-y-3">{top.map((r) => { const probability = stress[r.key] ?? 0.5; return <label key={r.key} className="block text-xs"><span className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.name}</span><span className="num shrink-0 text-muted-foreground">{stress[r.key] == null ? "Mark" : `YES ${(probability * 100).toFixed(0)}%`}</span></span><input aria-label={`YES probability for ${r.name}`} type="range" min={0} max={1} step={0.01} value={probability} onChange={(e) => setStress({ ...stress, [r.key]: Number(e.target.value) })} className="mt-1 w-full accent-primary" /></label>; })}</div>
      </section>
    </div>
    <section className="border-t pt-4"><h2 className="mb-3 font-mono text-xs font-semibold">CROSS-MARKET CORRELATION · daily YES probability changes</h2>
      {!top.length ? <p className="text-xs text-muted-foreground">No market history yet.</p> : <div className="overflow-x-auto"><table className="text-[11px]"><thead><tr><th />{top.map((r, i) => <th key={r.key} className="w-16 px-2 py-2 font-mono" title={r.name}>{i + 1}</th>)}</tr></thead><tbody>{top.map((r, i) => <tr key={r.key}><th className="max-w-72 truncate pr-4 text-left font-normal" title={r.name}>{i + 1}. {r.name}</th>{top.map((c, j) => { const value = matrix[i]?.[j]; return <td key={c.key} className={`num h-10 min-w-16 border text-center ${value == null ? "text-muted-foreground" : value > 0.5 ? "bg-gain/20 text-gain" : value < -0.5 ? "bg-loss/20 text-loss" : "bg-muted text-foreground"}`} title={`${r.name} / ${c.name}`}>{value == null ? "—" : value.toFixed(2)}</td>; })}</tr>)}</tbody></table></div>}
      <p className="mt-2 text-[11px] text-muted-foreground">At least 5 aligned daily changes and non-zero variance required; missing history is never estimated.</p>
    </section>
  </>;
}

const governanceQ = (org: string) => queryOptions({ queryKey: ["risk-governance", org], queryFn: async () => {
  const [limits, proposals, members, user] = await Promise.all([
    supabase.from("organization_risk_limits").select("*").eq("organization_id", org).maybeSingle(),
    supabase.from("risk_limit_proposals").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(50),
    supabase.from("organization_members").select("user_id,role,email").eq("organization_id", org), supabase.auth.getUser(),
  ]);
  const error = limits.error ?? proposals.error ?? members.error ?? user.error; if (error) throw error;
  return { limits: limits.data, proposals: proposals.data ?? [], members: members.data ?? [], userId: user.data.user?.id };
} });
function Governance({ org }: { org: string }) {
  const qc = useQueryClient();
  const { data, error } = useQuery(governanceQ(org));
  const [drawdown, setDrawdown] = useState(10), [concentration, setConcentration] = useState(25), [reason, setReason] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["risk-governance", org] }); qc.invalidateQueries({ queryKey: ["audit", org] }); };
  const propose = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc("propose_risk_limits", { _org: org, _drawdown: drawdown, _concentration: concentration, _reason: reason }); if (error) throw error;
  }, onSuccess: () => { setReason(""); refresh(); toast.success("Awaiting a different admin's approval"); }, onError: (e) => toast.error(e.message) });
  const decide = useMutation({ mutationFn: async ({ id, decision }: { id: string; decision: string }) => { const { data, error } = await supabase.rpc("decide_risk_limits", { _proposal: id, _decision: decision }); if (error) throw error; return data; }, onSuccess: (status) => { refresh(); toast.success(status === "stale" ? "Limits changed since proposal — submit a new proposal" : `Proposal ${status}`); }, onError: (e) => toast.error(e.message) });
  if (error) return <p role="alert" className="text-loss">{error.message}</p>;
  if (!data) return null;
  const role = data.members.find((m) => m.user_id === data.userId)?.role;
  const admin = role === "owner" || role === "admin";
  const pending = data.proposals.filter((p) => p.status === "pending");
  const limitDrawdown = data.limits?.max_drawdown_pct ?? 10, limitConcentration = data.limits?.max_concentration_pct ?? 25;
  return <section className="space-y-3 border-t pt-4">
    <h2 className="flex items-center gap-2 font-mono text-xs font-semibold"><ShieldCheck className="size-4 text-primary" />TEAM RISK GOVERNANCE</h2>
    <div className="flex flex-wrap gap-5 font-mono text-xs"><span>Active drawdown limit: {limitDrawdown}%</span><span>Active concentration limit: {limitConcentration}%</span><span className="text-muted-foreground">Revision {data.limits?.revision ?? 0}</span></div>
    <RiskBreaches org={org} drawdown={limitDrawdown} concentration={limitConcentration} />
    <p className="text-[11px] text-muted-foreground">Every change requires two distinct current owners/admins. These are monitoring limits; they do not place orders or alter personal alert settings.</p>
    {admin && <form onSubmit={(e) => { e.preventDefault(); propose.mutate(); }} className="flex flex-wrap items-end gap-3">
      <label className="text-xs">Max drawdown %<Input aria-label="Team max drawdown" type="number" min={0.01} max={100} step={0.01} required value={drawdown} onChange={(e) => setDrawdown(Number(e.target.value))} className="mt-1 w-36 font-mono" /></label>
      <label className="text-xs">Max event weight %<Input aria-label="Team max event weight" type="number" min={0.01} max={100} step={0.01} required value={concentration} onChange={(e) => setConcentration(Number(e.target.value))} className="mt-1 w-36 font-mono" /></label>
      <label className="min-w-48 flex-1 text-xs">Reason<Input aria-label="Risk limit change reason" minLength={3} maxLength={500} required value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" /></label>
      <Button size="sm" disabled={propose.isPending} type="submit">Propose limits</Button>
    </form>}
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left font-mono text-[10px] text-muted-foreground"><tr className="border-b"><th className="py-2">Proposer / reason</th><th>Drawdown</th><th>Weight</th><th>Status</th><th>Decision</th></tr></thead><tbody>{data.proposals.map((p) => <tr key={p.id} className="border-b"><td className="max-w-64 py-2 pr-3"><div className="truncate">{data.members.find((m) => m.user_id === p.proposed_by)?.email ?? "Former member"}</div><div className="break-words text-[11px] text-muted-foreground">{p.reason}</div></td><td className="num">{p.max_drawdown_pct}%</td><td className="num">{p.max_concentration_pct}%</td><td className={p.status === "pending" ? "text-warn" : "text-muted-foreground"}>{p.status}</td><td>{admin && p.status === "pending" && (p.proposed_by === data.userId ? <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: "cancelled" })}><X />Cancel</Button> : <div className="flex gap-1"><Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: "approved" })}><Check />Approve</Button><Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: "rejected" })}><X />Reject</Button></div>)}</td></tr>)}</tbody></table></div>
    {!data.proposals.length && <p className="text-xs text-muted-foreground">No limit changes proposed.</p>}
    {pending.length > 0 && data.members.filter((m) => m.role === "owner" || m.role === "admin").length < 2 && <p className="text-xs text-warn">A second owner/admin must join before any proposal can be approved.</p>}
  </section>;
}
function RiskBreaches({ org, drawdown, concentration }: { org: string; drawdown: number; concentration: number }) {
  const { data } = useQuery(riskQ(org)); const { data: events } = useSuspenseQuery(eventsQ);
  if (!data) return null;
  const a = allocation(data.positions, events, data.profiles); const h = historicalRisk(data.history, a.equity, 0.95);
  const breaches = [a.concentration > concentration ? `Largest event ${a.concentration.toFixed(1)}% exceeds ${concentration}%` : null, h.drawdownPct != null && h.drawdownPct > drawdown ? `Drawdown ${h.drawdownPct.toFixed(1)}% exceeds ${drawdown}%` : null].filter(Boolean);
  return breaches.length ? <p role="status" className="text-xs text-loss">{breaches.join(" · ")}</p> : <p className="text-xs text-muted-foreground">No observed limit breaches{h.drawdownPct == null ? " · drawdown history unavailable" : ""}.</p>;
}