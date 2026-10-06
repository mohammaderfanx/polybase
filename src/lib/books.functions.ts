import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Orderbooks for all matched events. Kalshi is always REST (signed); Polymarket only when WS is down or on bootstrap. */
export const getBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ poly: z.boolean(), kalshi: z.boolean(), tokens: z.record(z.string(), z.string()).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { fetchAllBooks } = await import("./books.server");
    const { data: events } = await context.supabase.from("matched_events").select("id, polymarket_condition_id, kalshi_ticker");
    return { books: await fetchAllBooks(events ?? [], data), ts: Date.now() };
  });

export const logEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    event_type: z.enum(["sync", "alert_triggered", "export", "rebalance_recommendation"]),
    payload: z.record(z.string(), z.unknown()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("execution_logs").insert({ user_id: context.userId, event_type: data.event_type, payload: data.payload as never });
    return { ok: true };
  });
