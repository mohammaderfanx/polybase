import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const kalshiConfigured = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    configured: !!process.env["KALSHI_API_KEY_ID"] && !!process.env["KALSHI_PRIVATE_KEY"],
  }));

export const syncPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { fetchPolymarket, fetchKalshi } = await import("./venues.server");
    const { netPnlMap } = await import("./fees");

    const [{ data: accounts }, { data: events }] = await Promise.all([
      supabase.from("venue_accounts").select("*"),
      supabase.from("matched_events").select("*"),
    ]);
    const matchEvent = (venue: string, key: string) =>
      events?.find((e) =>
        venue === "Polymarket"
          ? e.polymarket_condition_id && e.polymarket_condition_id === key
          : e.kalshi_ticker && key.toUpperCase().startsWith(e.kalshi_ticker.toUpperCase()),
      )?.id ?? null;

    const results: { id: string; ok: boolean; error?: string; count?: number }[] = [];
    for (const a of accounts ?? []) {
      await supabase.from("venue_accounts").update({ status: "syncing" }).eq("id", a.id);
      try {
        let raw;
        if (a.venue === "Polymarket") raw = await fetchPolymarket(a.identifier);
        else {
          const keyId = process.env["KALSHI_API_KEY_ID"];
          const pem = process.env["KALSHI_PRIVATE_KEY"];
          if (!keyId || !pem) throw new Error("Kalshi API key not configured yet");
          raw = await fetchKalshi(keyId, pem);
        }
        await supabase.from("positions").delete().eq("account_id", a.id);
        if (raw.length) {
          const { error } = await supabase.from("positions").insert(
            raw.map((r) => ({ ...r, user_id: userId, account_id: a.id, venue: a.venue, matched_event_id: matchEvent(a.venue, r.market_key) })),
          );
          if (error) throw new Error(error.message);
        }
        await supabase.from("venue_accounts").update({ status: "active", last_error: null, last_synced_at: new Date().toISOString() }).eq("id", a.id);
        results.push({ id: a.id, ok: true, count: raw.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("venue_accounts").update({ status: "error", last_error: msg.slice(0, 300) }).eq("id", a.id);
        results.push({ id: a.id, ok: false, error: msg });
      }
    }

    const [{ data: positions }, { data: profile }] = await Promise.all([
      supabase.from("positions").select("*"),
      supabase.from("user_fee_profiles").select("*").maybeSingle(),
    ]);
    const map = netPnlMap(positions ?? [], profile ?? null);
    let equity = 0, unreal = 0, realized = 0, fees = 0;
    for (const p of positions ?? []) {
      const b = map.get(p.id)!;
      equity += Number(p.shares) * Number(p.current_price);
      unreal += b.gross;
      realized += b.realized;
      fees += b.feesPaid + b.gas + b.exitFee;
    }
    if (accounts?.length) {
      await supabase.from("historical_snapshots").insert({
        user_id: userId, total_equity_usd: equity, unrealized_pnl_usd: unreal, realized_pnl_usd: realized, net_fees_usd: fees,
      });
    }
    return { results };
  });
