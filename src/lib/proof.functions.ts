import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/** Recompute metrics from the caller's synced data and sign them with the platform ECDSA key. */
export const publishProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { computeMetrics, proofPayload, signProof } = await import("./proof");
    const { data: prof } = await supabase.from("public_portfolios").select("handle").eq("user_id", userId).maybeSingle();
    if (!prof) throw new Error("Create your profile first");
    const [{ data: pos }, { data: snaps }] = await Promise.all([
      supabase.from("positions").select("*"),
      supabase.from("historical_snapshots").select("timestamp,total_equity_usd").order("timestamp").limit(2000),
    ]);
    const positions = pos ?? [];
    const m = computeMetrics(positions, snaps ?? []);
    const asOf = new Date().toISOString();
    const payload = proofPayload(prof.handle, m, asOf);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let { data: key } = await supabaseAdmin.from("proof_keys").select("private_jwk").eq("id", 1).maybeSingle();
    if (!key) {
      const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
      const private_jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
      const public_jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
      await supabaseAdmin.from("proof_keys").upsert({ id: 1, private_jwk: private_jwk as never, public_jwk: public_jwk as never }, { onConflict: "id", ignoreDuplicates: true });
      ({ data: key } = await supabaseAdmin.from("proof_keys").select("private_jwk").eq("id", 1).maybeSingle());
    }
    const signature = await signProof(key!.private_jwk as JsonWebKey, payload);
    // Holdings: titles, side and % return only — never sizes or dollars.
    const holdings = positions.slice(0, 50).map((p) => {
      const cost = Number(p.shares) * Number(p.avg_buy_price);
      return { title: p.market_title, outcome: p.outcome, venue: p.venue, ret_pct: cost > 0 ? Math.round(((Number(p.current_price) - Number(p.avg_buy_price)) / Number(p.avg_buy_price)) * 1000) / 10 : null };
    });
    const { error } = await supabaseAdmin.from("public_portfolios").update({
      total_roi_pct: m.total_roi_pct, win_rate_pct: m.win_rate_pct, sharpe_ratio: m.sharpe_ratio,
      total_volume_usd: m.total_volume_usd, net_pnl_usd: m.net_pnl_usd, holdings: holdings as never,
      proof_payload: payload, proof_signature: signature, verified_at: asOf,
    }).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, verified_at: asOf };
  });

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    } },
  });
}

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient().rpc("get_leaderboard");
  if (error) { console.error(error); return []; }
  return data ?? [];
});

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) => ({ handle: String(d.handle).toLowerCase().slice(0, 24) }))
  .handler(async ({ data }) => {
    const { data: rows, error } = await publicClient().rpc("get_public_profile", { _handle: data.handle });
    if (error) { console.error(error); return null; }
    const r = rows?.[0];
    return r ? { ...r, holdings: (r.holdings ?? []) as { title: string; outcome: string; venue: string; ret_pct: number | null }[], public_jwk: r.public_jwk as Record<string, string> | null } : null;
  });
