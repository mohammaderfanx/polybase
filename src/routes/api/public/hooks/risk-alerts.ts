import { createFileRoute } from "@tanstack/react-router";
import { scanEvent } from "@/lib/arb";
import { exposures } from "@/lib/delta";
import type { FeeProfile, MatchedEvent, Position } from "@/lib/portfolio";

/** Runs every 5 min: records net spreads, checks each user's risk limits, posts webhook alerts (1/h per alert). */
export const Route = createFileRoute("/api/public/hooks/risk-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: okTok } = await db.rpc("check_cron_token", { t: token });
        if (!okTok) return new Response("Unauthorized", { status: 401 });
        const { dispatch, runRetries } = await import("@/lib/webhooks.server");
        const retried = await runRetries(db);
        const { fetchAllBooks } = await import("@/lib/books.server");

        const { data: events = [] } = await db.from("matched_events").select("*");
        const evs = (events ?? []) as MatchedEvent[];
        const books = await fetchAllBooks(evs.filter((e) => e.polymarket_condition_id && e.kalshi_ticker), { poly: true, kalshi: true });
        const byId = new Map(books.map((b) => [b.id, b]));

        // Global opportunity record (default fee profile)
        const opps = books.map((b) => ({ b, r: scanEvent(b.poly, b.kalshi, null) })).filter((x) => x.r?.feasible);
        if (opps.length) {
          await db.from("arbitrage_opportunities").insert(opps.map(({ b, r }) => ({
            matched_event_id: b.id, poly_price_yes: b.poly?.asks[0]?.price ?? 0, kalshi_price_yes: b.kalshi?.asks[0]?.price ?? 0,
            gross_spread_pct: (1 - r!.avgPoly - r!.avgKalshi) * 100, net_spread_pct: r!.netSpreadPct, liquidity_at_spread_usd: r!.costUsd,
          })));
        }

        const { data: users } = await db.from("user_risk_thresholds").select("*").not("webhook_url", "is", null);
        const since = new Date(Date.now() - 3600_000).toISOString();
        let sent = 0;
        for (const t of users ?? []) {
          const [{ data: pos }, { data: prof }, { data: recent }, { data: snaps }] = await Promise.all([
            db.from("positions").select("*").eq("user_id", t.user_id),
            db.from("user_fee_profiles").select("*").eq("user_id", t.user_id).maybeSingle(),
            db.from("execution_logs").select("payload").eq("user_id", t.user_id).eq("event_type", "alert_triggered").gte("created_at", since),
            db.from("historical_snapshots").select("total_equity_usd").eq("user_id", t.user_id).order("timestamp", { ascending: false }).limit(200),
          ]);
          const seen = new Set((recent ?? []).map((r) => (r.payload as { key?: string })?.key));
          const alerts: { key: string; text: string }[] = [];
          for (const e of evs) {
            const b = byId.get(e.id); const r = b && scanEvent(b.poly, b.kalshi, prof as FeeProfile | null);
            if (r?.feasible) alerts.push({ key: `spread:${e.id}`, text: `Net spread ${r.netSpreadPct.toFixed(2)}% open on "${e.event_name}" — ${Math.floor(r.contracts)} pairs, $${r.netProfitUsd.toFixed(2)} net` });
          }
          for (const x of exposures((pos ?? []) as Position[], evs)) {
            if (x.cost > Number(t.max_single_event_exposure_usd)) alerts.push({ key: `exp:${x.key}`, text: `Exposure $${x.cost.toFixed(0)} on "${x.name}" exceeds your $${t.max_single_event_exposure_usd} limit` });
            if (x.imbalancePct > Number(t.delta_imbalance_threshold_pct) && x.yesShares > 0 && x.noShares > 0) alerts.push({ key: `delta:${x.key}`, text: `Delta imbalance ${x.imbalancePct.toFixed(0)}% on "${x.name}" (limit ${t.delta_imbalance_threshold_pct}%)` });
          }
          const eq = (snaps ?? []).map((s) => Number(s.total_equity_usd));
          if (eq.length > 1) {
            const peak = Math.max(...eq), dd = peak > 0 ? ((peak - eq[0]!) / peak) * 100 : 0;
            if (dd > Number(t.max_portfolio_drawdown_pct)) alerts.push({ key: "drawdown", text: `Portfolio drawdown ${dd.toFixed(1)}% exceeds your ${t.max_portfolio_drawdown_pct}% limit` });
          }
          const fresh = alerts.filter((a) => !seen.has(a.key));
          if (!fresh.length) continue;
          const text = `PolyBase alerts:\n${fresh.map((a) => `• ${a.text}`).join("\n")}`;
          try {
            await fetch(t.webhook_url!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text, alerts: fresh }), signal: AbortSignal.timeout(5000) });
            sent++;
          } catch { /* webhook unreachable — still logged */ }
          await db.from("execution_logs").insert(fresh.map((a) => ({ user_id: t.user_id, event_type: "alert_triggered" as const, payload: { key: a.key, text: a.text } })));
        }
        const hooksSent = await fireWebhooks(db, dispatch, evs, byId);
        return Response.json({ ok: true, opportunities: opps.length, webhooks: sent, hooks: hooksSent, retried });
      },
    },
  },
});

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
type Dispatch = (typeof import("@/lib/webhooks.server"))["dispatch"];
type EB = Awaited<ReturnType<(typeof import("@/lib/books.server"))["fetchAllBooks"]>>[number];

/** Engine B — turns engine output into execution-ready, idempotent webhook payloads. */
async function fireWebhooks(db: Admin, dispatch: Dispatch, evs: MatchedEvent[], byId: Map<string, EB>) {
  const { data: hooks } = await db.from("execution_webhooks").select("id, user_id, dry_run, event_trigger").eq("is_active", true);
  if (!hooks?.length) return 0;
  const userIds = [...new Set(hooks.map((h) => h.user_id))];
  const { data: thr } = await db.from("user_risk_thresholds").select("*").in("user_id", userIds);
  const tmap = new Map((thr ?? []).map((t) => [t.user_id, t]));
  const hour = new Date().toISOString().slice(0, 13);
  const day = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const uid of userIds) {
    const t = tmap.get(uid);
    if (t?.automation_killed) continue; // global kill switch
    const mine = hooks.filter((h) => h.user_id === uid);
    const [{ data: pos }, { data: prof }] = await Promise.all([
      db.from("positions").select("*").eq("user_id", uid),
      db.from("user_fee_profiles").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const positions = (pos ?? []) as Position[];
    const events: { trigger: string; key: string; data: Record<string, unknown> }[] = [];
    for (const e of evs) {
      const b = byId.get(e.id); const r = b && scanEvent(b.poly, b.kalshi, prof as FeeProfile | null);
      if (!r?.feasible) continue;
      const [ps, ks] = r.direction === "POLY_YES+KALSHI_NO" ? ["YES", "NO"] : ["NO", "YES"];
      const count = Math.floor(r.contracts);
      events.push({ trigger: "arb_found", key: `arb:${e.id}:${r.direction}:${hour}`, data: {
        event_id: e.id, event_name: e.event_name, direction: r.direction, net_spread_pct: +r.netSpreadPct.toFixed(3), net_profit_usd: +r.netProfitUsd.toFixed(2), capital_usd: +r.costUsd.toFixed(2),
        legs: [
          { venue: "Polymarket", side: "BUY", outcome: ps, condition_id: e.polymarket_condition_id, token_id: ps === "YES" ? b!.polyToken : null, limit_price: r.limitPoly, size: count },
          { venue: "Kalshi", side: "BUY", outcome: ks, ticker: e.kalshi_ticker, limit_price_cents: Math.round(r.limitKalshi * 100), count },
        ],
      } });
    }
    const limit = Number(t?.delta_imbalance_threshold_pct ?? 25);
    for (const x of exposures(positions, evs)) {
      if (x.imbalancePct > limit && x.rebalance && x.yesShares > 0 && x.noShares > 0)
        events.push({ trigger: "delta_breach", key: `delta:${x.key}:${hour}`, data: { event_key: x.key, event_name: x.name, imbalance_pct: +x.imbalancePct.toFixed(1), threshold_pct: limit, delta: x.delta, rebalance: { ...x.rebalance, order_side: "BUY" } } });
    }
    const stop = Number(t?.max_portfolio_drawdown_pct ?? 10);
    for (const p of positions) {
      const cost = Number(p.avg_buy_price), cur = Number(p.current_price);
      const lossPct = cost > 0 ? ((cost - cur) / cost) * 100 : 0;
      if (lossPct > stop) events.push({ trigger: "stop_loss_hit", key: `stop:${p.id}:${day}`, data: { position_id: p.id, market_key: p.market_key, market_title: p.market_title, venue: p.venue, outcome: p.outcome, loss_pct: +lossPct.toFixed(2), limit_pct: stop, exit: { side: "SELL", outcome: p.outcome, count: Number(p.shares), limit_price: cur } } });
      if (p.settlement_date) {
        const hrs = (new Date(p.settlement_date).getTime() - Date.now()) / 3600_000;
        if (hrs > 0 && hrs <= 24) events.push({ trigger: "settlement_imminent", key: `settle:${p.id}:${p.settlement_date}`, data: { position_id: p.id, market_key: p.market_key, market_title: p.market_title, venue: p.venue, settles_at: p.settlement_date, hours_left: Math.round(hrs) } });
      }
    }
    for (const h of mine) for (const ev of events.filter((x) => x.trigger === h.event_trigger)) {
      if (await dispatch(db, h, h.event_trigger, ev.key, ev.data)) n++;
    }
  }
  return n;
}
