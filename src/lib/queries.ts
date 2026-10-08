import type { Database } from "@/integrations/supabase/types";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const unwrap = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};

export const positionsQ = queryOptions({
  queryKey: ["positions"],
  queryFn: () => unwrap(supabase.from("positions").select("*").order("market_title")),
});
export const accountsQ = queryOptions({
  queryKey: ["accounts"],
  queryFn: () => unwrap(supabase.from("venue_accounts").select("*").order("created_at")),
});
export const eventsQ = queryOptions({
  queryKey: ["events"],
  queryFn: () => unwrap(supabase.from("matched_events").select("*").order("event_name")),
});
export const profileQ = queryOptions({
  queryKey: ["profile"],
  queryFn: () => unwrap(supabase.from("user_fee_profiles").select("*").maybeSingle()),
});
export const snapshotsQ = queryOptions({
  queryKey: ["snapshots"],
  queryFn: () => unwrap(supabase.from("historical_snapshots").select("*").order("timestamp").limit(500)),
});
export const thresholdsQ = queryOptions({
  queryKey: ["thresholds"],
  queryFn: async () => (await unwrap(supabase.from("user_risk_thresholds").select("*").maybeSingle())) as Database["public"]["Tables"]["user_risk_thresholds"]["Row"] | null,
});
