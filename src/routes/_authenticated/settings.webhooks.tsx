import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, Play, Power, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { thresholdsQ } from "@/lib/queries";
import { createWebhook, rotateSecret, testWebhook } from "@/lib/webhooks.functions";

export const Route = createFileRoute("/_authenticated/settings/webhooks")({
  head: () => ({
    meta: [
      { title: "Automation & Webhooks — PolyBase" },
      { name: "description", content: "Send signed, execution-ready alerts to your own trading bots when PolyBase spots spreads or risk breaches." },
      { property: "og:title", content: "Automation & Webhooks — PolyBase" },
      { property: "og:description", content: "Send signed, execution-ready alerts to your own trading bots when PolyBase spots spreads or risk breaches." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WebhooksPage,
});

const TRIGGERS = [
  { v: "arb_found", l: "Arbitrage found" },
  { v: "delta_breach", l: "Delta breach" },
  { v: "stop_loss_hit", l: "Stop-loss hit" },
  { v: "settlement_imminent", l: "Settlement < 24h" },
] as const;
type Trig = (typeof TRIGGERS)[number]["v"];
const tl = (v: string) => TRIGGERS.find((t) => t.v === v)?.l ?? v;

const hooksQ = queryOptions({
  queryKey: ["webhooks"],
  queryFn: async () => { const { data, error } = await supabase.from("execution_webhooks").select("*").order("created_at"); if (error) throw error; return data; },
});
const deliveriesQ = queryOptions({
  queryKey: ["deliveries"],
  queryFn: async () => { const { data, error } = await supabase.from("webhook_deliveries").select("*").order("created_at", { ascending: false }).limit(100); if (error) throw error; return data; },
  refetchInterval: 15_000,
});

const VERIFY = (secret: string) => `# Python — verify a PolyBase webhook
import hmac, hashlib, time
SECRET = b"${secret}"
def verify(headers, raw_body: bytes) -> bool:
    parts = dict(p.split("=", 1) for p in headers["X-PolyBase-Signature"].split(","))
    if abs(time.time() - int(parts["t"])) > 300: return False   # replay window
    mac = hmac.new(SECRET, f"{parts['t']}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, parts["v1"])
# Dedupe on headers["X-PolyBase-Idempotency-Key"] before acting.`;

function WebhooksPage() {
  const qc = useQueryClient();
  const { data: hooks = [] } = useQuery(hooksQ);
  const { data: deliveries = [] } = useQuery(deliveriesQ);
  const { data: thr } = useQuery(thresholdsQ);
  const create = useServerFn(createWebhook);
  const rotate = useServerFn(rotateSecret);
  const test = useServerFn(testWebhook);
  const [form, setForm] = useState({ name: "", target_url: "", event_trigger: "arb_found" as Trig });
  const [secret, setSecret] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); qc.invalidateQueries({ queryKey: ["deliveries"] }); };

  const add = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: (r) => { setSecret(r.secret); setForm({ ...form, name: "", target_url: "" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const patch = async (id: string, p: { is_active?: boolean; dry_run?: boolean }) => {
    const { error } = await supabase.from("execution_webhooks").update(p).eq("id", id);
    if (error) toast.error(error.message); refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this webhook and its delivery log?")) return;
    await supabase.from("execution_webhooks").delete().eq("id", id); refresh();
  };
  const kill = useMutation({
    mutationFn: async (v: boolean) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("user_risk_thresholds").upsert({ user_id: u.user!.id, automation_killed: v });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: thresholdsQ.queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });
  const killed = !!thr?.automation_killed;

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Automation & Webhook Manager</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">PolyBase sends signed, execution-ready instructions to your own bot. It never holds trading keys or places orders. Checks run every 5 minutes; each alert fires once (retried up to 3 times if your endpoint fails).</p>
        </div>
        <button onClick={() => kill.mutate(!killed)}
          className={`flex items-center gap-2 rounded-sm border px-3 py-2 font-mono text-xs font-semibold ${killed ? "border-loss bg-loss/15 text-loss" : "border-gain/40 text-gain"}`}>
          <Power className="h-3.5 w-3.5" /> {killed ? "KILL SWITCH ON — all webhooks paused" : "Automation live · click to kill"}
        </button>
      </div>

      <section className="panel p-3">
        <h2 className="label-caps mb-2">New webhook</h2>
        <div className="grid gap-2 md:grid-cols-[160px_1fr_180px_auto]">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name (e.g. ccxt-bot)" className="rounded-sm border bg-background px-2 py-1 text-xs" />
          <input value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} placeholder="https://your-bot.example.com/polybase" className="rounded-sm border bg-background px-2 py-1 font-mono text-xs" />
          <select value={form.event_trigger} onChange={(e) => setForm({ ...form, event_trigger: e.target.value as Trig })} className="rounded-sm border bg-background px-2 py-1 text-xs">
            {TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <button onClick={() => add.mutate()} disabled={add.isPending || !form.name || !form.target_url} className="rounded-sm bg-primary px-3 py-1 font-mono text-[11px] font-semibold text-primary-foreground disabled:opacity-50">Create</button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">New webhooks start in dry-run: payloads are recorded in the log but not sent until you switch dry-run off.</p>
        {secret && (
          <div className="mt-3 space-y-2 rounded-sm border border-warn/40 bg-warn/5 p-3">
            <div className="flex items-center gap-2 text-xs"><KeyRound className="h-3.5 w-3.5 text-warn" /> Signing key. Copy it now; it won't be shown again.</div>
            <div className="flex gap-2">
              <code className="flex-1 truncate rounded-sm border bg-background px-2 py-1 font-mono text-[11px]">{secret}</code>
              <button onClick={() => { navigator.clipboard.writeText(secret); toast.success("Key copied"); }} className="rounded-sm border px-2 text-[11px]"><Copy className="h-3 w-3" /></button>
              <button onClick={() => setSecret(null)} className="rounded-sm border px-2 text-[11px]">Done</button>
            </div>
            <pre className="whitespace-pre-wrap rounded-sm border bg-background p-2 font-mono text-[10px] text-muted-foreground">{VERIFY(secret)}</pre>
          </div>
        )}
      </section>

      <section className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal"><th>Name</th><th>Trigger</th><th>Endpoint</th><th>Key</th><th>Active</th><th>Dry-run</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {hooks.map((h) => (
              <tr key={h.id} className="border-b [&>td]:px-3 [&>td]:py-1.5">
                <td className="font-semibold">{h.name}</td>
                <td>{tl(h.event_trigger)}</td>
                <td className="max-w-[280px] truncate font-mono text-[11px] text-muted-foreground">{h.target_url}</td>
                <td className="font-mono text-[11px] text-muted-foreground">…{h.secret_hint}</td>
                <td><Toggle on={h.is_active} onClick={() => patch(h.id, { is_active: !h.is_active })} /></td>
                <td><Toggle on={h.dry_run} warn onClick={() => patch(h.id, { dry_run: !h.dry_run })} /></td>
                <td className="space-x-1 text-right">
                  <button title="Send test payload" onClick={async () => { try { const r = await test({ data: { id: h.id } }); toast[r && r.status === "delivered" ? "success" : "error"](r ? `Test ${r.status}${"response_status" in r && r.response_status ? ` · HTTP ${r.response_status}` : ""}${"latency_ms" in r ? ` · ${r.latency_ms}ms` : ""}` : "Test failed"); } catch (e) { toast.error((e as Error).message); } refresh(); }} className="rounded-sm border p-1 hover:bg-accent"><Play className="h-3 w-3" /></button>
                  <button title="Rotate signing key" onClick={async () => { if (!confirm("Rotate key? Your bot must use the new key.")) return; const r = await rotate({ data: { id: h.id } }); setSecret(r.secret); refresh(); }} className="rounded-sm border p-1 hover:bg-accent"><KeyRound className="h-3 w-3" /></button>
                  <button title="Delete" onClick={() => remove(h.id)} className="rounded-sm border p-1 hover:bg-accent"><Trash2 className="h-3 w-3" /></button>
                </td>
              </tr>
            ))}
            {!hooks.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No webhooks yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto">
        <h2 className="label-caps border-b px-3 py-2">Delivery log</h2>
        <table className="w-full text-xs">
          <thead><tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal"><th>Time</th><th>Webhook</th><th>Event</th><th>Status</th><th className="text-right">HTTP</th><th className="text-right">Latency</th><th className="text-right">Attempts</th></tr></thead>
          <tbody>
            {deliveries.map((d) => (
              <Fragment key={d.id}>
                <tr onClick={() => setOpenLog(openLog === d.id ? null : d.id)} className="cursor-pointer border-b hover:bg-accent/50 [&>td]:px-3 [&>td]:py-1.5">
                  <td className="num text-muted-foreground">{new Date(d.created_at).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                  <td>{hooks.find((h) => h.id === d.webhook_id)?.name ?? "—"}{d.is_test && <span className="ml-1 text-[10px] text-muted-foreground">(test)</span>}</td>
                  <td>{tl(d.event_trigger)}</td>
                  <td><Status s={d.status} /></td>
                  <td className="num text-right">{d.response_status ?? "—"}</td>
                  <td className="num text-right">{d.latency_ms != null ? `${d.latency_ms}ms` : "—"}</td>
                  <td className="num text-right">{d.attempts}/4</td>
                </tr>
                {openLog === d.id && (
                  <tr className="border-b bg-muted/30"><td colSpan={7} className="grid gap-2 p-3 md:grid-cols-2">
                    <div><div className="label-caps mb-1">Payload</div><pre className="max-h-64 overflow-auto rounded-sm border bg-background p-2 font-mono text-[10px]">{JSON.stringify(d.payload, null, 2)}</pre></div>
                    <div><div className="label-caps mb-1">Response{d.next_retry_at ? ` · next retry ${new Date(d.next_retry_at).toLocaleTimeString()}` : ""}</div><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border bg-background p-2 font-mono text-[10px]">{d.response_body || "—"}</pre></div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!deliveries.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No deliveries yet. Use the ▶ button to send a test.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Toggle({ on, onClick, warn }: { on: boolean; onClick: () => void; warn?: boolean }) {
  return <button onClick={onClick} className={`rounded-sm border px-2 py-px font-mono text-[10px] ${on ? (warn ? "border-warn/50 text-warn" : "border-gain/50 text-gain") : "text-muted-foreground"}`}>{on ? "ON" : "OFF"}</button>;
}
function Status({ s }: { s: string }) {
  const c = s === "delivered" ? "text-gain" : s === "failed" ? "text-loss" : s === "dry_run" ? "text-muted-foreground" : "text-warn";
  return <span className={`font-mono text-[10px] uppercase ${c}`}>{s.replace("_", "-")}</span>;
}
