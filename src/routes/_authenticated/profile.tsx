import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publishProof } from "@/lib/proof.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Public Profile Builder — PolyBase" },
      { name: "description", content: "Publish a signed Proof-of-P&L profile with strict privacy controls." },
      { property: "og:title", content: "Public Profile Builder — PolyBase" },
      { property: "og:description", content: "Publish a signed Proof-of-P&L profile with strict privacy controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileBuilder,
});

const myQ = queryOptions({
  queryKey: ["my-portfolio"],
  queryFn: async () => { const { data, error } = await supabase.from("public_portfolios").select("*").maybeSingle(); if (error) throw error; return data; },
});

function ProfileBuilder() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery(myQ);
  const publish = useServerFn(publishProof);
  const [f, setF] = useState({ handle: "", display_name: "", is_public: false, hide_absolute_values: true, show_roi: true, show_holdings: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) setF({ handle: me.handle, display_name: me.display_name, is_public: me.is_public, hide_absolute_values: me.hide_absolute_values, show_roi: me.show_roi, show_holdings: me.show_holdings }); }, [me]);

  const save = async () => {
    setBusy(true);
    try {
      const handle = f.handle.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new Error("Handle: 3–24 lowercase letters, numbers or _");
      if (!f.hide_absolute_values && !me?.hide_absolute_values === false && !confirm("Show dollar amounts publicly?")) return;
      const row = { ...f, handle };
      if (me) { const { error } = await supabase.from("public_portfolios").update(row).eq("id", me.id); if (error) throw error; }
      else { const { data: u } = await supabase.auth.getUser(); const { error } = await supabase.from("public_portfolios").insert({ ...row, user_id: u.user!.id }); if (error) throw error; }
      await publish();
      toast.success("Profile saved and stats signed");
      qc.invalidateQueries({ queryKey: myQ.queryKey });
    } catch (e) { toast.error((e as Error).message.includes("duplicate") ? "That handle is taken" : (e as Error).message); }
    finally { setBusy(false); }
  };

  const T = ({ k, label, hint }: { k: "is_public" | "hide_absolute_values" | "show_roi" | "show_holdings"; label: string; hint: string }) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-sm border p-2">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="mt-0.5" />
      <span><span className="text-xs font-semibold">{label}</span><span className="block text-[11px] text-muted-foreground">{hint}</span></span>
    </label>
  );

  if (isLoading) return <main className="p-4 text-xs text-muted-foreground">Loading…</main>;
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-4">
      <div>
        <h1 className="text-lg font-semibold">Public profile & Proof-of-P&L</h1>
        <p className="text-xs text-muted-foreground">PolyBase computes your stats from synced venue data and signs them. You can't edit the numbers, only what's shown. Private by default.</p>
      </div>
      <section className="panel space-y-3 p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-xs">Handle<input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="alpha_trader" className="mt-1 w-full rounded-sm border bg-background px-2 py-1 font-mono text-xs" /></label>
          <label className="text-xs">Display name<input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} className="mt-1 w-full rounded-sm border bg-background px-2 py-1 text-xs" /></label>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <T k="is_public" label="Public profile" hint="List me on the leaderboard and make /u/handle visible." />
          <T k="show_roi" label="Show % ROI" hint="Net return after fees, as a percentage." />
          <T k="hide_absolute_values" label="Hide $ balances" hint="Keeps volume and dollar P&L private. Recommended." />
          <T k="show_holdings" label="Show open holdings" hint="Market names, side and % return only — never sizes." />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy} className="rounded-sm bg-primary px-3 py-1 font-mono text-[11px] font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Signing…" : "Save & sign stats"}</button>
          {me?.verified_at && <span className="text-[11px] text-muted-foreground">Last signed {new Date(me.verified_at).toLocaleString()}</span>}
          {me?.is_public && <Link to="/u/$handle" params={{ handle: me.handle }} className="ml-auto font-mono text-[11px] underline">View public page →</Link>}
        </div>
      </section>
    </main>
  );
}
