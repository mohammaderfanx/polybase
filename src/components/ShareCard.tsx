/** Client-side 1200x630 share-card renderer (PNG download) + X intent. */
export async function downloadShareCard(p: { handle: string; display_name: string; roi: number | null; win: number | null; sharpe: number | null; verified_at: string | null }) {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  const bg = v("--background", "#0a0a0a"), fg = v("--foreground", "#fafafa"), mute = v("--muted-foreground", "#888");
  const gain = v("--gain", "#22c55e"), loss = v("--loss", "#ef4444"), prim = v("--primary", "#22c55e");
  g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = prim; g.fillRect(0, 0, 1200, 8);
  g.font = "bold 28px ui-monospace, monospace"; g.fillStyle = fg; g.fillText("POLYBASE · PROOF-OF-P&L", 60, 80);
  g.font = "bold 56px ui-sans-serif, system-ui"; g.fillText(p.display_name || `@${p.handle}`, 60, 180);
  g.font = "28px ui-monospace, monospace"; g.fillStyle = mute; g.fillText(`@${p.handle}`, 60, 225);
  const stat = (x: number, label: string, val: string, col: string) => {
    g.fillStyle = mute; g.font = "24px ui-monospace, monospace"; g.fillText(label, x, 360);
    g.fillStyle = col; g.font = "bold 84px ui-monospace, monospace"; g.fillText(val, x, 450);
  };
  stat(60, "NET ROI", p.roi == null ? "—" : `${p.roi >= 0 ? "+" : ""}${p.roi.toFixed(1)}%`, p.roi == null ? mute : p.roi >= 0 ? gain : loss);
  stat(480, "WIN RATE", p.win == null ? "—" : `${p.win.toFixed(0)}%`, fg);
  stat(860, "SHARPE", p.sharpe == null ? "—" : p.sharpe.toFixed(2), fg);
  g.fillStyle = mute; g.font = "22px ui-monospace, monospace";
  g.fillText(`ECDSA-signed · ${p.verified_at ? new Date(p.verified_at).toISOString().slice(0, 10) : "unverified"} · dollar values hidden`, 60, 570);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png"); a.download = `polybase-${p.handle}.png`; a.click();
}

export function tweetUrl(handle: string, roi: number | null) {
  const url = `https://polybase.lovable.app/u/${handle}`;
  const text = `My verified prediction-market performance${roi != null ? `: ${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% net ROI` : ""} — signed Proof-of-P&L on PolyBase`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
