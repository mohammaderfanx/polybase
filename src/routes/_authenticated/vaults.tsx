import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, OctagonX, Pause, Play, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accountsQ, positionsQ, thresholdsQ } from "@/lib/queries";
import { batchPayload, planFollower, slippagePct, type Follower, type LeadPos } from "@/lib/copy";
import { logAudit } from "@/lib/org.functions";
import { usd, cents } from "@/lib/portfolio";
import { VenueBadge } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/vaults")({
  head: () => ({
    meta: [
      { title: "Copy-Trading Vaults — PolyBase" },
      { name: "description", content: "Size lead positions across follower accounts, watch fill slippage, and pause everything with one kill switch." },
      { property: "og:title", content: "Copy-Trading Vaults — PolyBase" },
      { property: "og:description", content: "Size lead positions across follower accounts, watch fill slippage, and pause everything with one kill switch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VaultsPage,
});

const vaultsQ = queryOptions({
  queryKey: ["vaults"],
  queryFn: async () => {
    const [v, f, o] = await Promise.all([
      supabase.from("copy_trading_vaults").select("*").order("created_at"),
      supabase.from("vault_followers").select("*").order("created_at"),
      supabase.from("organizations").select("id, name"),
    ]);
    const err = v.error ?? f.error ?? o.error; if (err) throw err;
    return { vaults: v.data ?? [], followers: f.data ?? [], orgs: o.data ?? [] };
  },
});

const inp = "rounded-sm border bg-background px-2 py-1 font-mono text-xs";

function VaultsPage() {
  const qc = useQueryClient();
  const { data } = useQuery(vaultsQ);
  const { data: accounts = [] } = useQuery(accountsQ);
  const { data: positions = [] } = useQuery(positionsQ);
  const { data: thr } = useQuery(thresholdsQ);
  const audit = useServerFn(logAudit);
  const [sel, setSel] = useState<string | null>(null);
  const [nv, setNv] = useState({ name: "", lead_account_id: "", target: "10000", slip: "0.5", org: "" });
  const killed = !!thr?.automation_killed;
  const refresh = () => qc.invalidateQueries({ queryKey: ["vaults"] });

  const vaults = data?.vaults ?? [];
  const vault = vaults.find((v) => v.id === sel) ?? vaults[0];

  const create = async () => {
    if (!nv.name.trim() || !nv.lead_account_id) { toast.error("Name and lead account required"); return; }
    const { data: u } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("copy_trading_vaults").insert({
      name: nv.name.trim(), lead_trader_id: u.user!.id, lead_account_id: nv.lead_account_id,
      target_allocation_usd: Math.max(0, Number(nv.target) || 0), max_slippage_tolerance_pct: Math.min(10, Math.max(0, Number(nv.slip) || 0)),
      organization_id: nv.org || null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    if (nv.org) audit({ data: { organization_id: nv.org, action_type: "VAULT_CREATED", metadata: { name: nv.name } } });
    setNv({ ...nv, name: "" }); setSel(row.id); refresh();
  };

  /** Fail-safe: one round-trip batch that pauses webhooks, syncing, every vault and every follower. */
  const setKill = async (on: boolean) => {
    if (on && !confirm("Pause ALL webhooks, syncing and copy vaults now? No positions are sold.")) return;
    const t0 = performance.now();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    const ops = [supabase.from("user_risk_thresholds").upsert({ user_id: uid, automation_killed: on })];
    if (on) {
      ops.push(supabase.from("copy_trading_vaults").update({ is_active: false }).eq("lead_trader_id", uid) as never);
      ops.push(supabase.from("vault_followers").update({ is_paused: true }).eq("user_id", uid) as never);
    }
    const res = await Promise.all(ops);
    const err = res.find((r) => r.error)?.error;
    if (err) { toast.error(err.message); return; }
    const ms = Math.round(performance.now() - t0);
    toast[on ? "warning" : "success"](on ? `Everything paused in ${ms} ms` : "Kill switch off — re-enable vaults one by one");
    for (const oid of new Set(vaults.filter((v) => v.organization_id && v.lead_trader_id === uid).map((v) => v.organization_id!)))
      audit({ data: { organization_id: oid, action_type: on ? "KILL_SWITCH_ENGAGED" : "KILL_SWITCH_RELEASED", metadata: { latency_ms: ms } } });
    qc.invalidateQueries({ queryKey: thresholdsQ.queryKey }); refresh();
  };

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Copy-Trading & Syndicate Vaults</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">Mirror a lead account across follower accounts in proportion to each one's margin, fee tier and contract limits. PolyBase prepares the orders — it never places them.</p>
        </div>
        <button onClick={() => setKill(!killed)}
          className={`flex items-center gap-2 rounded-sm border px-4 py-2.5 font-mono text-xs font-bold ${killed ? "border-loss bg-loss/20 text-loss" : "border-loss/60 text-loss hover:bg-loss/10"}`}>
          <OctagonX className="h-4 w-4" /> {killed ? "KILL SWITCH ON — click to release" : "EMERGENCY KILL-SWITCH"}
        </button>
      </div>
      {killed && <div className="rounded-sm border border-loss/50 bg-loss/10 px-3 py-2 font-mono text-xs text-loss">All outgoing webhooks, venue syncing and copy vaults are paused. Open positions are untouched.</div>}

      <section className="rounded-sm border p-3">
        <h2 className="mb-2 font-mono text-xs font-bold">NEW VAULT</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="Vault name" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} className={inp} />
          <select value={nv.lead_account_id} onChange={(e) => setNv({ ...nv, lead_account_id: e.target.value })} className={inp}>
            <option value="">Lead account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.venue} · {a.identifier.slice(0, 16)}</option>)}
          </select>
          <label className="font-mono text-[11px] text-muted-foreground">Target $ <input value={nv.target} onChange={(e) => setNv({ ...nv, target: e.target.value })} className={`${inp} w-24`} /></label>
          <label className="font-mono text-[11px] text-muted-foreground">Max slip % <input value={nv.slip} onChange={(e) => setNv({ ...nv, slip: e.target.value })} className={`${inp} w-16`} /></label>
          <select value={nv.org} onChange={(e) => setNv({ ...nv, org: e.target.value })} className={inp}>
            <option value="">Personal</option>
            {data?.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={create} className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1 font-mono text-xs text-primary-foreground"><Plus className="h-3 w-3" /> Create</button>
        </div>
        {accounts.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Add a venue account first — it becomes the lead portfolio.</p>}
      </section>

      {vaults.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {vaults.map((v) => (
            <button key={v.id} onClick={() => setSel(v.id)} className={`rounded-sm border px-3 py-1 font-mono text-xs ${v.id === vault?.id ? "bg-accent" : ""}`}>
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${v.is_active && !killed ? "bg-gain" : "bg-loss"}`} />{v.name}
            </button>
          ))}
        </div>
      )}

      {vault && data && (
        <VaultView key={vault.id} vault={vault} followers={data.followers.filter((f) => f.vault_id === vault.id)}
          accounts={accounts} positions={positions} killed={killed} onChange={refresh}
          log={(a, m) => vault.organization_id && audit({ data: { organization_id: vault.organization_id, action_type: a, metadata: { vault: vault.name, ...m } } })} />
      )}
    </main>
  );
}

type Vault = NonNullable<ReturnType<typeof useVaultType>>;
function useVaultType() { return null as unknown as Awaited<ReturnType<typeof vaultsQ.queryFn>>["vaults"][number]; }
type FRow = Awaited<ReturnType<typeof vaultsQ.queryFn>>["followers"][number];

function VaultView({ vault, followers, accounts, positions, killed, onChange, log }: {
  vault: Vault; followers: FRow[]; accounts: { id: string; venue: "Polymarket" | "Kalshi"; identifier: string }[];
  positions: { account_id: string; market_key: string; market_title: string; venue: "Polymarket" | "Kalshi"; outcome: string; shares: number; avg_buy_price: number; current_price: number; updated_at: string }[];
  killed: boolean; onChange: () => void; log: (a: string, m: Record<string, unknown>) => unknown;
}) {
  const [nf, setNf] = useState({ label: "", venue: "Polymarket" as "Polymarket" | "Kalshi", account: "", margin: "1000", tier: "standard", max: "25000" });
  const lead = positions.filter((p) => p.account_id === vault.lead_account_id);
  const leadPos: LeadPos[] = lead.map((p) => ({ ...p, shares: Number(p.shares), avg_buy_price: Number(p.avg_buy_price), current_price: Number(p.current_price) }));
  const leadEquity = leadPos.reduce((s, p) => s + p.shares * p.current_price, 0);
  const active = vault.is_active && !killed;

  const plans = useMemo(() => followers.map((f) => planFollower(leadPos, leadEquity, {
    ...f, available_margin_usd: Number(f.available_margin_usd), max_contracts_per_market: Number(f.max_contracts_per_market),
    is_paused: f.is_paused || !active,
  } as Follower, Number(vault.target_allocation_usd), Number(vault.max_slippage_tolerance_pct))), [followers, leadPos, leadEquity, vault, active]);

  const addFollower = async () => {
    if (!nf.label.trim()) { toast.error("Label required"); return; }
    const { data: u } = await supabase.auth.getUser();
    const acc = accounts.find((a) => a.id === nf.account);
    const { error } = await supabase.from("vault_followers").insert({
      vault_id: vault.id, user_id: u.user!.id, label: nf.label.trim(), venue: acc?.venue ?? nf.venue, venue_account_id: acc?.id ?? null,
      available_margin_usd: Math.max(0, Number(nf.margin) || 0), fee_tier: nf.tier, max_contracts_per_market: Math.max(1, Number(nf.max) || 1),
    });
    if (error) { toast.error(error.message); return; }
    log("FOLLOWER_ADDED", { follower: nf.label }); setNf({ ...nf, label: "" }); onChange();
  };
  const toggleVault = async () => {
    const { error } = await supabase.from("copy_trading_vaults").update({ is_active: !vault.is_active }).eq("id", vault.id);
    if (error) { toast.error(error.message); return; }
    log(vault.is_active ? "VAULT_PAUSED" : "VAULT_RESUMED", {}); onChange();
  };
  const patchF = async (id: string, p: { is_paused?: boolean; available_margin_usd?: number }) => {
    const { error } = await supabase.from("vault_followers").update(p).eq("id", id);
    if (error) toast.error(error.message); onChange();
  };
  const delF = async (f: FRow) => { await supabase.from("vault_followers").delete().eq("id", f.id); log("FOLLOWER_REMOVED", { follower: f.label }); onChange(); };
  const delVault = async () => { if (!confirm(`Delete vault ${vault.name}?`)) return; await supabase.from("copy_trading_vaults").delete().eq("id", vault.id); log("VAULT_DELETED", {}); onChange(); };
  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(batchPayload(vault, plans), null, 2));
    toast.success("Batch payload copied"); log("BATCH_PAYLOAD_EXPORTED", { accounts: plans.filter((p) => p.orders.length).length });
  };

  // Slippage / delay monitor: follower fills vs lead on the same market.
  const monitor = followers.flatMap((f) => positions.filter((p) => p.account_id === f.venue_account_id).flatMap((fp) => {
    const lp = lead.find((l) => l.market_key === fp.market_key && l.outcome === fp.outcome);
    if (!lp) return [];
    const slip = slippagePct(Number(lp.avg_buy_price), Number(fp.avg_buy_price));
    const lagS = Math.round((new Date(fp.updated_at).getTime() - new Date(lp.updated_at).getTime()) / 1000);
    return [{ f: f.label, title: fp.market_title, lead: Number(lp.avg_buy_price), mine: Number(fp.avg_buy_price), slip, lagS, ratio: Number(lp.shares) ? Number(fp.shares) / Number(lp.shares) : 0 }];
  }));

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border bg-border md:grid-cols-5">
        {[
          ["Status", active ? "LIVE" : killed ? "KILLED" : "PAUSED"],
          ["Lead equity", usd(leadEquity)],
          ["Target allocation", usd(Number(vault.target_allocation_usd))],
          ["Max slippage", `${vault.max_slippage_tolerance_pct}%`],
          ["Followers", String(followers.length)],
        ].map(([k, v]) => (
          <div key={k} className="bg-background px-3 py-2"><div className="font-mono text-[10px] text-muted-foreground">{k}</div><div className={`font-mono text-sm ${v === "LIVE" ? "text-gain" : v === "KILLED" || v === "PAUSED" ? "text-loss" : ""}`}>{v}</div></div>
        ))}
      </section>
      <div className="flex flex-wrap gap-2">
        <button disabled={killed} onClick={toggleVault} className="flex items-center gap-1 rounded-sm border px-3 py-1 font-mono text-xs hover:bg-accent disabled:opacity-40">{vault.is_active ? <><Pause className="h-3 w-3" /> Pause vault</> : <><Play className="h-3 w-3" /> Resume vault</>}</button>
        <button onClick={copyPayload} className="flex items-center gap-1 rounded-sm border px-3 py-1 font-mono text-xs hover:bg-accent"><Copy className="h-3 w-3" /> Copy batch payload</button>
        <button onClick={delVault} className="ml-auto flex items-center gap-1 rounded-sm border px-3 py-1 font-mono text-xs text-muted-foreground hover:text-loss"><Trash2 className="h-3 w-3" /> Delete</button>
      </div>

      <section className="rounded-sm border">
        <header className="border-b px-3 py-2"><h2 className="font-mono text-xs font-bold">FOLLOWER ACCOUNTS & SIZING</h2></header>
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="px-3 py-1.5">Account</th><th>Venue</th><th>Margin</th><th>Fee tier</th><th>Ratio</th><th>Orders</th><th>Est. cost</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {plans.length === 0 && <tr><td colSpan={9} className="px-3 py-3 text-muted-foreground">No followers yet.</td></tr>}
            {plans.map((p) => {
              const f = followers.find((x) => x.id === p.follower.id)!;
              return (
                <tr key={f.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-1.5">{f.label}</td>
                  <td><VenueBadge venue={f.venue} /></td>
                  <td><input defaultValue={Number(f.available_margin_usd)} onBlur={(e) => Number(e.target.value) !== Number(f.available_margin_usd) && patchF(f.id, { available_margin_usd: Math.max(0, Number(e.target.value) || 0) })} className={`${inp} w-24 py-0.5`} aria-label={`Margin for ${f.label}`} /></td>
                  <td>{f.fee_tier}</td>
                  <td className="num">{(p.ratio * 100).toFixed(2)}%</td>
                  <td>{p.orders.length ? p.orders.map((o) => <div key={o.market_key + o.outcome} className="truncate" title={o.market_title}>{o.contracts.toLocaleString()} {o.outcome} @ {cents(o.limit_price)}{o.capped && <span className="text-loss"> (cap)</span>}</div>) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="num">{usd(p.total_cost_usd)}</td>
                  <td className="text-[11px] text-muted-foreground">{p.skipped ?? (p.margin_scaled ? "Scaled to fit margin" : "")}</td>
                  <td className="whitespace-nowrap pr-3 text-right">
                    <button onClick={() => patchF(f.id, { is_paused: !f.is_paused })} aria-label={f.is_paused ? "Resume follower" : "Pause follower"} className="mr-2 text-muted-foreground hover:text-foreground">{f.is_paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}</button>
                    <button onClick={() => delF(f)} aria-label="Remove follower" className="text-muted-foreground hover:text-loss"><Trash2 className="h-3 w-3" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t p-3">
          <input placeholder="Follower label" value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} className={inp} />
          <select value={nf.account} onChange={(e) => setNf({ ...nf, account: e.target.value })} className={inp}>
            <option value="">No linked account</option>
            {accounts.filter((a) => a.id !== vault.lead_account_id).map((a) => <option key={a.id} value={a.id}>{a.venue} · {a.identifier.slice(0, 16)}</option>)}
          </select>
          {!nf.account && <select value={nf.venue} onChange={(e) => setNf({ ...nf, venue: e.target.value as "Polymarket" | "Kalshi" })} className={inp}><option>Polymarket</option><option>Kalshi</option></select>}
          <label className="font-mono text-[11px] text-muted-foreground">Margin $ <input value={nf.margin} onChange={(e) => setNf({ ...nf, margin: e.target.value })} className={`${inp} w-20`} /></label>
          <select value={nf.tier} onChange={(e) => setNf({ ...nf, tier: e.target.value })} className={inp}><option value="standard">standard</option><option value="maker">maker</option><option value="none">none</option></select>
          <label className="font-mono text-[11px] text-muted-foreground">Max/market <input value={nf.max} onChange={(e) => setNf({ ...nf, max: e.target.value })} className={`${inp} w-20`} /></label>
          <button onClick={addFollower} className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1 font-mono text-xs text-primary-foreground"><Plus className="h-3 w-3" /> Add</button>
        </div>
      </section>

      <section className="rounded-sm border">
        <header className="border-b px-3 py-2"><h2 className="font-mono text-xs font-bold">EXECUTION DELAY & SLIPPAGE MONITOR</h2></header>
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="px-3 py-1.5">Follower</th><th>Market</th><th>Lead avg</th><th>Follower avg</th><th>Slippage</th><th>Size ratio</th><th>Sync lag</th></tr></thead>
          <tbody>
            {monitor.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-muted-foreground">Link a follower to a synced account holding the same markets as the lead to see fill differences.</td></tr>}
            {monitor.map((m, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-3 py-1.5">{m.f}</td><td className="max-w-[280px] truncate">{m.title}</td>
                <td className="num">{cents(m.lead)}</td><td className="num">{cents(m.mine)}</td>
                <td className={`num ${Math.abs(m.slip) > Number(vault.max_slippage_tolerance_pct) ? "text-loss" : "text-gain"}`}>{m.slip >= 0 ? "+" : ""}{m.slip.toFixed(2)}%</td>
                <td className="num">{(m.ratio * 100).toFixed(1)}%</td>
                <td className="num">{Math.abs(m.lagS) < 60 ? `${m.lagS}s` : `${Math.round(m.lagS / 60)}m`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Red slippage exceeds the vault's tolerance. Sync lag compares when each account was last synced.</p>
      </section>
    </div>
  );
}
