import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FeeProfile, Position } from "./portfolio";
import type { EquityPoint, MarketMark } from "./institutional";

const schema = z.object({ positions: z.array(z.unknown()), profiles: z.array(z.unknown()), history: z.array(z.object({ day: z.string(), captured_at: z.string(), equity: z.number(), marks: z.array(z.object({ event_key: z.string(), yes_price: z.number() })) })) });
export const getInstitutional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string | null }) => z.object({ organizationId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: raw, error } = await context.supabase.rpc("institutional_data", data.organizationId ? { _org: data.organizationId } : {});
    if (error) throw new Error(error.message);
    const parsed = schema.parse(raw);
    let history: EquityPoint[] = parsed.history.map((h) => ({ timestamp: h.captured_at, total_equity_usd: h.equity }));
    if (!data.organizationId) {
      const { data: snaps, error: snapshotError } = await context.supabase.from("historical_snapshots").select("timestamp,total_equity_usd").eq("user_id", context.userId).order("timestamp", { ascending: false }).limit(500);
      if (snapshotError) throw new Error(snapshotError.message);
      history = [...(snaps ?? []), ...history];
    }
    const marks: MarketMark[] = parsed.history.flatMap((h) => h.marks.map((m) => ({ ...m, day: h.day })));
    return { positions: parsed.positions as Position[], profiles: parsed.profiles as FeeProfile[], history, marks };
  });