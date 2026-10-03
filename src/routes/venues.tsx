import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RefreshCw, Plus, Wallet, KeyRound } from "lucide-react";
import { VenueBadge } from "@/components/AppHeader";
import { accounts as seed, type Account, type Venue } from "@/lib/portfolio";

export const Route = createFileRoute("/venues")({
  head: () => ({
    meta: [
      { title: "Venue Sync — PolyBase" },
      { name: "description", content: "Manage Polymarket wallets and Kalshi read-only API connections." },
      { property: "og:title", content: "Venue Sync — PolyBase" },
      { property: "og:description", content: "Manage Polymarket wallets and Kalshi read-only API connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Venues,
});

function Venues() {
  const [list, setList] = useState<Account[]>(seed);
  const [venue, setVenue] = useState<Venue>("Polymarket");
  const [ident, setIdent] = useState("");

  const resync = (id: string) => {
    setList((l) => l.map((a) => (a.id === id ? { ...a, status: "syncing" } : a)));
    setTimeout(() => setList((l) => l.map((a) => (a.id === id ? { ...a, status: "active", last_synced_at: new Date().toISOString() } : a))), 1400);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ident.trim()) return;
    const id = `a${Date.now()}`;
    setList((l) => [...l, { id, venue, identifier: ident.trim().slice(0, 64), status: "syncing", last_synced_at: new Date().toISOString() }]);
    setIdent("");
    setTimeout(() => setList((l) => l.map((a) => (a.id === id ? { ...a, status: "active" } : a))), 1400);
  };

  return (
    <main className="mx-auto max-w-[1100px] space-y-3 p-4">
      <h1 className="label-caps">Venue Sync & Accounts</h1>
      <section className="panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal">
              <th>Venue</th><th>Identifier</th><th>Status</th><th>Last Synced</th><th />
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-b [&>td]:px-3 [&>td]:py-2">
                <td><VenueBadge venue={a.venue} /></td>
                <td className="num">{a.identifier}</td>
                <td>
                  <span className={`flex items-center gap-1.5 font-mono text-[11px] ${a.status === "active" ? "text-gain" : a.status === "syncing" ? "text-warn" : "text-loss"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${a.status === "syncing" ? "animate-pulse" : ""}`} />
                    {a.status.toUpperCase()}
                  </span>
                </td>
                <td className="num text-muted-foreground">{new Date(a.last_synced_at).toISOString().replace("T", " ").slice(0, 19)} UTC</td>
                <td className="text-right">
                  <button onClick={() => resync(a.id)} disabled={a.status === "syncing"}
                    className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] hover:bg-accent disabled:opacity-50">
                    <RefreshCw className={`h-3 w-3 ${a.status === "syncing" ? "animate-spin" : ""}`} /> Re-Sync Now
                  </button>
                </td>
              </tr>
            ))}
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
          <div className="label-caps mb-1">{venue === "Polymarket" ? "Wallet address (read-only)" : "Read-only API key alias"}</div>
          <input value={ident} onChange={(e) => setIdent(e.target.value)} maxLength={64}
            placeholder={venue === "Polymarket" ? "0x…" : "kalshi-readonly-…"}
            className="num w-full rounded-sm border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
        </label>
        <button className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground">
          <Plus className="h-3 w-3" /> Connect
        </button>
      </form>
      <p className="text-[11px] text-muted-foreground">PolyBase is read-only. No trading, order placement or fund movement is ever performed.</p>
    </main>
  );
}
