import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { getLeaderboard } from "@/lib/proof.functions";

const lbQ = queryOptions({ queryKey: ["leaderboard"], queryFn: () => getLeaderboard() });
type Sort = "roi" | "sharpe" | "volume";

export const Route = createFileRoute("/leaderboard")({
  validateSearch: (s: Record<string, unknown>): { sort: Sort } => ({ sort: s["sort"] === "sharpe" || s["sort"] === "volume" ? s["sort"] : "roi" }),
  loader: ({ context }) => context.queryClient.ensureQueryData(lbQ),
  head: () => ({
    meta: [
      { title: "Verified Leaderboard — PolyBase" },
      { name: "description", content: "Prediction market traders ranked by signed, verifiable net ROI, Sharpe ratio and volume across Polymarket and Kalshi." },
      { property: "og:title", content: "Verified Leaderboard — PolyBase" },
      { property: "og:description", content: "Prediction market traders ranked by signed, verifiable net ROI, Sharpe ratio and volume." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://polybase.lovable.app/leaderboard" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://polybase.lovable.app/leaderboard" }],
  }),
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-loss">{(error as Error).message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
  component: Leaderboard,
});

const pct = (n: number | null, sign = true) => (n == null ? "—" : `${sign && n >= 0 ? "+" : ""}${Number(n).toFixed(1)}%`);

function Leaderboard() {
  const { data } = useSuspenseQuery(lbQ);
  const { sort } = Route.useSearch();
  const key = sort === "roi" ? "total_roi_pct" : sort === "sharpe" ? "sharpe_ratio" : "total_volume_usd";
  const rows = [...data].sort((a, b) => (Number(b[key] ?? -Infinity)) - (Number(a[key] ?? -Infinity)));
  return (
    <main className="mx-auto max-w-5xl space-y-3 p-4">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link to="/" className="font-mono text-xs text-muted-foreground">← POLYBASE</Link>
          <h1 className="text-lg font-semibold">Verified Leaderboard</h1>
          <p className="text-xs text-muted-foreground">Every row is ECDSA-signed by PolyBase from synced venue data. Dollar amounts stay hidden unless a trader unlocks them.</p>
        </div>
        <div className="flex gap-1">
          {(["roi", "sharpe", "volume"] as const).map((s) => (
            <Link key={s} to="/leaderboard" search={{ sort: s }} className={`rounded-sm border px-2 py-1 font-mono text-[11px] ${sort === s ? "bg-accent text-foreground" : "text-muted-foreground"}`}>
              {s === "roi" ? "Net ROI" : s === "sharpe" ? "Sharpe" : "Volume"}
            </Link>
          ))}
        </div>
      </header>
      <section className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="label-caps border-b text-left [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-normal"><th>#</th><th>Trader</th><th className="text-right">Net ROI</th><th className="text-right">Win rate</th><th className="text-right">Sharpe</th><th className="text-right">Volume</th><th className="text-right">Verified</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.handle} className="border-b [&>td]:px-3 [&>td]:py-1.5">
                <td className="num text-muted-foreground">{i + 1}</td>
                <td><Link to="/u/$handle" params={{ handle: r.handle }} className="font-semibold hover:underline">{r.display_name || r.handle}</Link> <span className="font-mono text-[10px] text-muted-foreground">@{r.handle}</span></td>
                <td className={`num text-right ${r.total_roi_pct == null ? "" : Number(r.total_roi_pct) >= 0 ? "text-gain" : "text-loss"}`}>{pct(r.total_roi_pct)}</td>
                <td className="num text-right">{pct(r.win_rate_pct, false)}</td>
                <td className="num text-right">{r.sharpe_ratio == null ? "—" : Number(r.sharpe_ratio).toFixed(2)}</td>
                <td className="num text-right text-muted-foreground">{r.total_volume_usd == null ? "hidden" : `$${Math.round(Number(r.total_volume_usd)).toLocaleString()}`}</td>
                <td className="text-right"><BadgeCheck className="ml-auto h-3.5 w-3.5 text-gain" /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No public traders yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
