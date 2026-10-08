import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const trigger = z.enum(["arb_found", "delta_breach", "stop_loss_hit", "settlement_imminent"]);
const httpsUrl = z.string().trim().url().max(500).refine((u) => u.startsWith("https://"), "Must start with https://");

/** Creates a webhook and returns its signing key ONCE. */
export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(60), target_url: httpsUrl, event_trigger: trigger }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { newSecret, sha256 } = await import("./webhooks.server");
    const secret = newSecret();
    const { data: hook, error } = await db.from("execution_webhooks").insert({
      user_id: context.userId, ...data, secret_key_hash: await sha256(secret), secret_hint: secret.slice(-4), dry_run: true,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await db.from("webhook_secrets").insert({ webhook_id: hook.id, secret });
    return { id: hook.id, secret };
  });

export const rotateSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: own } = await context.supabase.from("execution_webhooks").select("id").eq("id", data.id).maybeSingle();
    if (!own) throw new Error("Webhook not found");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { newSecret, sha256 } = await import("./webhooks.server");
    const secret = newSecret();
    await db.from("webhook_secrets").upsert({ webhook_id: data.id, secret });
    await db.from("execution_webhooks").update({ secret_key_hash: await sha256(secret), secret_hint: secret.slice(-4) }).eq("id", data.id);
    return { secret };
  });

/** Sends a signed sample payload right now (ignores dry-run; never retried). */
export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: hook } = await context.supabase.from("execution_webhooks").select("id, user_id, dry_run, event_trigger").eq("id", data.id).maybeSingle();
    if (!hook) throw new Error("Webhook not found");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { dispatch } = await import("./webhooks.server");
    const sample = SAMPLE[hook.event_trigger];
    const r = await dispatch(db, hook, hook.event_trigger, `test:${crypto.randomUUID()}`, sample, true);
    return r;
  });

const SAMPLE = {
  arb_found: {
    event_id: "fed-cut-dec", event_name: "Fed cuts rates in December", direction: "POLY_YES+KALSHI_NO", net_spread_pct: 2.4, net_profit_usd: 18.2,
    legs: [
      { venue: "Polymarket", side: "BUY", outcome: "YES", token_id: "<polymarket token id>", limit_price: 0.42, size: 250 },
      { venue: "Kalshi", side: "BUY", outcome: "NO", ticker: "<KALSHI-TICKER>", limit_price_cents: 54, count: 250 },
    ],
  },
  delta_breach: { event_id: "fed-cut-dec", event_name: "Fed cuts rates in December", imbalance_pct: 41, threshold_pct: 25, rebalance: { venue: "Kalshi", side: "BUY", outcome: "NO", count: 250, limit_price: 0.48 } },
  stop_loss_hit: { position_id: "<id>", market_title: "Example market", venue: "Kalshi", outcome: "YES", loss_pct: 12.5, limit_pct: 10, exit: { side: "SELL", outcome: "YES", count: 100, limit_price: 0.31 } },
  settlement_imminent: { position_id: "<id>", market_title: "Example market", venue: "Polymarket", settles_at: new Date(Date.now() + 6 * 3600_000).toISOString(), hours_left: 6 },
} as const;
