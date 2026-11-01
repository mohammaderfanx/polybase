import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeCheck, Download, ShieldAlert } from "lucide-react";
import { getPublicProfile } from "@/lib/proof.functions";
import { verifyProof } from "@/lib/proof";
import { downloadShareCard, tweetUrl } from "@/components/ShareCard";

const profQ = (handle: string) => queryOptions({ queryKey: ["public-profile", handle.toLowerCase()], queryFn: () => getPublicProfile({ data: { handle } }) });

export const Route = createFileRoute("/u/$handle")({
  loader: async ({ params, context }) => {
    const p = await context.queryClient.ensureQueryData(profQ(params.handle));
    if (!p) throw notFound();
    return p;
  },
  head: ({ params, loaderData }) => {
    const name = loaderData ? (loaderData.display_name || `@${loaderData.handle}`) : "Trader";
    const roi = loaderData?.total_roi_pct;
    const desc = loaderData ? `Verified prediction-market performance${roi != null ? `: ${Number(roi) >= 0 ? "+" : ""}${Number(roi).toFixed(1)}% net ROI` : ""}. ECDSA-signed Proof-of-P&L on PolyBase.` : "Trader profile on PolyBase.";
    const url = `https://polybase.lovable.app/u/${params.handle}`;
    return {
      meta: [
        { title: `${name} — Proof-of-P&L · PolyBase` },
        { name: "description", content: desc },
        { property: "og:title", content: `${name} — Proof-of-P&L` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-loss">{error.message}</div>,
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl p-10 text-center text-sm text-muted-foreground">
      This profile is private or doesn't exist. <Link to="/leaderboard" search={{ sort: "roi" }} className="underline">See the leaderboard</Link>
    </main>
  ),
  component: Profile,
});

function Profile() {
  const { handle } = Route.useParams();
  const { data: p } = useSuspenseQuery(profQ(handle));
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => {
    if (p?.public_jwk && p.proof_payload && p.proof_signature) verifyProof(p.public_jwk, p.proof_payload, p.proof_signature).then(setValid);
    else setValid(false);
  }, [p]);
  if (!p) return null;
  const roi = p.total_roi_pct == null ? null : Number(p.total_roi_pct);
  const card = { handle: p.handle, display_name: p.display_name, roi, win: p.win_rate_pct == null ? null : Number(p.win_rate_pct), sharpe: p.sharpe_ratio == null ? null : Number(p.sharpe_ratio), verified_at: p.verified_at };
  return (
    <main className="mx-auto max-w-4xl space-y-3 p-4">
      <Link to="/leaderboard" search={{ sort: "roi" }} className="font-mono text-xs text-muted-foreground">← Leaderboard</Link>
      <section className="panel p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold">{p.display_name || `@${p.handle}`}</h1>
            <div className="font-mono text-xs text-muted-foreground">@{p.handle}</div>
          </div>
          {valid == null ? <span className="font-mono text-[11px] text-muted-foreground">verifying…</span> : valid ? (
            <span className="flex items-center gap-1 rounded-sm border border-gain/40 px-2 py-1 font-mono text-[11px] text-gain"><BadgeCheck className="h-3.5 w-3.5" /> Signature valid · {p.verified_at && new Date(p.verified_at).toLocaleDateString()}</span>
          ) : (
            <span className="flex items-center gap-1 rounded-sm border border-loss/40 px-2 py-1 font-mono text-[11px] text-loss"><ShieldAlert className="h-3.5 w-3.5" /> Not verified</span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat l="Net ROI" v={roi == null ? "hidden" : `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`} c={roi == null ? "" : roi >= 0 ? "text-gain" : "text-loss"} />
          <Stat l="Win rate" v={card.win == null ? "—" : `${card.win.toFixed(0)}%`} />
          <Stat l="Sharpe" v={card.sharpe == null ? "—" : card.sharpe.toFixed(2)} />
          <Stat l="Volume" v={p.total_volume_usd == null ? "hidden" : `$${Math.round(Number(p.total_volume_usd)).toLocaleString()}`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => downloadShareCard(card)} className="flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] hover:bg-accent"><Download className="h-3 w-3" /> Share image</button>
          <a href={tweetUrl(p.handle, roi)} target="_blank" rel="noreferrer" className="rounded-sm bg-primary px-2 py-1 font-mono text-[11px] font-semibold text-primary-foreground">Post on X</a>
        </div>
      </section>
      {p.holdings.length > 0 && (
        <section className="panel overflow-x-auto">
          <h2 className="label-caps border-b px-3 py-2">Open holdings</h2>
          <table className="w-full text-xs"><tbody>
            {p.holdings.map((h, i) => (
              <tr key={i} className="border-b [&>td]:px-3 [&>td]:py-1.5">
                <td>{h.title}</td><td className="font-mono text-[11px]">{h.outcome}</td><td className="font-mono text-[10px] text-muted-foreground">{h.venue}</td>
                <td className={`num text-right ${h.ret_pct == null ? "" : h.ret_pct >= 0 ? "text-gain" : "text-loss"}`}>{h.ret_pct == null ? "—" : `${h.ret_pct >= 0 ? "+" : ""}${h.ret_pct}%`}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}
      <details className="panel p-3 text-xs">
        <summary className="cursor-pointer label-caps">Verify it yourself</summary>
        <p className="mt-2 text-muted-foreground">ECDSA P-256 / SHA-256 signature over the exact statement below. Check it with the public key using any crypto library.</p>
        <pre className="mt-2 overflow-auto rounded-sm border bg-background p-2 font-mono text-[10px]">{`statement: ${p.proof_payload}\nsignature: ${p.proof_signature}\npublic_key: ${JSON.stringify(p.public_jwk)}`}</pre>
      </details>
    </main>
  );
}

function Stat({ l, v, c = "" }: { l: string; v: string; c?: string }) {
  return <div className="rounded-sm border p-3"><div className="label-caps">{l}</div><div className={`num mt-1 text-2xl font-semibold ${c}`}>{v}</div></div>;
}
