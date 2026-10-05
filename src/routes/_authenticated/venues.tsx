import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Plus, Wallet, KeyRound, Trash2 } from "lucide-react";
import { VenueBadge } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { type Venue } from "@/lib/portfolio";
import { FEE_TIERS } from "@/lib/fees";
import { accountsQ, profileQ } from "@/lib/queries";
import { kalshiConfigured, syncPortfolio } from "@/lib/sync.functions";

export const Route = createFileRoute("/_authenticated/venues")({
  head: () => ({
    meta: [
      { title: "Venue Sync — PolyBase" },
      { name: "description", content: "Manage Polymarket wallets, Kalshi read-only connections and fee profiles." },
      { property: "og:title", content: "Venue Sync — PolyBase" },
      { property: "og:description", content: "Manage Polymarket wallets, Kalshi read-only connections and fee profiles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Venues,
});

function Venues() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery(accountsQ);
  const { data: profile } = useQuery(profileQ);
  const kalshiFn = useServerFn(kalshiConfigured);
  const { data: kalshi } = useQuery({ queryKey: ["kalshi-cfg"], queryFn: () => kalshiFn() });
  const sync = useServerFn(syncPortfolio);
  const syncM = useMutation({ mutationFn: () => sync(), onSettled: () => qc.invalidateQueries() });

  const [venue, setVenue] = useState<Venue>("Polymarket");
  const [ident, setIdent] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const v = ident.trim();
    if (venue === "Polymarket" && !/^0x[a-fA-F0-9]{40}$/.test(v)) return setErr("Enter a valid 0x wallet address (42 characters).");
    if (!v) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("venue_accounts").insert({ user_id: u.user!.id, venue, identifier: v.slice(0, 64) });
    if (error) return setErr(error.message);
    setIdent("");
    await qc.invalidateQueries({ queryKey: ["accounts"] });
    syncM.mutate();
  };

  const remove = async (id: string) => {
    await supabase.from("venue_accounts").delete().eq("id", id);
    qc.invalidateQueries();
  };

  return (
    <main className="mx-auto max-w-[1100px] space-y-3 p-4">
      <div className="flex items-center">
        <h1 className="label-caps mr-auto">Venue Sync & Accounts</h1>
        <button onClick={() => syncM.mutate()} disabled={syncM.isPending || !list.length}
          className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] hover:bg-accent disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${syncM.isPending ? "animate-spin" : ""}`} /> Re-Sync All
        </button>
      </div>
      <section className="panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal">
              <th>Venue</th><th>Identifier</th><th>Status</th><th>Last Synced</th><th />
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const st = syncM.isPending ? "syncing" : a.status;
              return (
                <tr key={a.id} className="border-b [&>td]:px-3 [&>td]:py-2">
                  <td><VenueBadge venue={a.venue} /></td>
                  <td className="num">{a.identifier}</td>
                  <td>
                    <span title={a.last_error ?? ""} className={`flex items-center gap-1.5 font-mono text-[11px] ${st === "active" ? "text-gain" : st === "error" ? "text-loss" : "text-warn"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full bg-current ${st === "syncing" ? "animate-pulse" : ""}`} />
                      {st.toUpperCase()}
                    </span>
                    {a.status === "error" && a.last_error && <div className="mt-0.5 max-w-[280px] truncate text-[10px] text-loss">{a.last_error}</div>}
                  </td>
                  <td className="num text-muted-foreground">{a.last_synced_at ? new Date(a.last_synced_at).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—"}</td>
                  <td className="text-right">
                    <button onClick={() => remove(a.id)} aria-label="Remove account" className="text-muted-foreground hover:text-loss"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No venues connected yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <form onSubmit={add} className="panel flex flex-wrap items-end gap-3 p-3">
        <div>
          <div className="label-caps mb-1">Venue</div>
          <div className="flex overflow-hidden rounded-sm border">
            {(["Polymarket", "Kalshi"] as Venue[]).map((v) => (
              <button type="button" key={v} onClick={() => setVenue(v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 font-mono text-[11px] ${venue === v ? "bg-accent" : "text-muted-foreground"}`}>
                {v === "Polymarket" ? <Wallet className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />} {v}
              </button>
            ))}
          </div>
        </div>
        <label className="min-w-[260px] flex-1">
          <div className="label-caps mb-1">{venue === "Polymarket" ? "Wallet address (read-only)" : "Account label"}</div>
          <input value={ident} onChange={(e) => setIdent(e.target.value)} maxLength={64}
            placeholder={venue === "Polymarket" ? "0x…" : "kalshi-main"}
            className="num w-full rounded-sm border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
        </label>
        <button className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground">
          <Plus className="h-3 w-3" /> Connect
        </button>
        {venue === "Kalshi" && (
          <p className={`w-full text-[11px] ${kalshi?.configured ? "text-gain" : "text-warn"}`}>
            {kalshi?.configured ? "Kalshi read-only API key is set up." : "Kalshi API key not added yet — syncing Kalshi will fail until it is."}
          </p>
        )}
        {err && <p className="w-full text-[11px] text-loss">{err}</p>}
      </form>

      <FeeProfileForm key={profile?.id ?? "new"} profile={profile ?? null} />
      <p className="text-[11px] text-muted-foreground">PolyBase is read-only. No trading, order placement or fund movement is ever performed.</p>
    </main>
  );
}

function FeeProfileForm({ profile }: { profile: { polymarket_tier: string; kalshi_fee_tier: string; custom_gas_offset_usd: number } | null }) {
  const qc = useQueryClient();
  const [poly, setPoly] = useState(profile?.polymarket_tier ?? "standard");
  const [kal, setKal] = useState(profile?.kalshi_fee_tier ?? "standard");
  const [gas, setGas] = useState(String(profile?.custom_gas_offset_usd ?? 0));
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(t); } }, [saved]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const g = Math.max(0, Math.min(100000, Number(gas) || 0));
    await supabase.from("user_fee_profiles").upsert(
      { user_id: u.user!.id, polymarket_tier: poly, kalshi_fee_tier: kal, custom_gas_offset_usd: g, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    qc.invalidateQueries({ queryKey: ["profile"] });
    setSaved(true);
  };
  const sel = "num rounded-sm border bg-background px-2 py-1.5 text-xs";
  return (
    <form onSubmit={save} className="panel flex flex-wrap items-end gap-3 p-3">
      <h2 className="label-caps w-full">Fee Profile</h2>
      <label><div className="label-caps mb-1">Polymarket tier</div>
        <select value={poly} onChange={(e) => setPoly(e.target.value)} className={sel}>{FEE_TIERS.polymarket.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label><div className="label-caps mb-1">Kalshi tier</div>
        <select value={kal} onChange={(e) => setKal(e.target.value)} className={sel}>{FEE_TIERS.kalshi.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label><div className="label-caps mb-1">Gas offset (USD)</div>
        <input type="number" min={0} step="0.01" value={gas} onChange={(e) => setGas(e.target.value)} className={`${sel} w-28`} /></label>
      <button className="rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground">Save</button>
      {saved && <span className="text-[11px] text-gain">Saved</span>}
    </form>
  );
}
