import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { scanEvent } from "@/lib/arb";
import { exposures } from "@/lib/delta";
import type { FeeProfile, MatchedEvent, Position } from "@/lib/portfolio";

/** Runs every 5 min: records net spreads, checks each user's risk limits, posts webhook alerts (1/h per alert). */
export const Route = createFileRoute("/api/public/hooks/risk-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
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
        return Response.json({ ok: true, opportunities: opps.length, webhooks: sent });
      },
    },
  },
});
