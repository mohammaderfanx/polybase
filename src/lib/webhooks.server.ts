/** Engine B — HMAC-signed, idempotent webhook delivery with dry-run, kill switch and 3-retry backoff. Server-only. */
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
export type Trigger = "arb_found" | "delta_breach" | "stop_loss_hit" | "settlement_imminent";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
export function newSecret() { const b = new Uint8Array(32); crypto.getRandomValues(b); return "whsec_" + hex(b.buffer); }

export async function sign(secret: string, ts: number, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`)));
}

const BACKOFF_MIN = [1, 5, 15]; // retries after attempt 1, 2, 3
export const MAX_ATTEMPTS = 4;  // 1 send + 3 retries

/** One HTTP attempt for an existing delivery row. */
export async function attempt(db: Admin, deliveryId: string) {
  const { data: d } = await db.from("webhook_deliveries").select("*, execution_webhooks(target_url, is_active)").eq("id", deliveryId).single();
  if (!d) return null;
  const hook = d.execution_webhooks as unknown as { target_url: string; is_active: boolean } | null;
  if (!hook) return null;
  const { data: sec } = await db.from("webhook_secrets").select("secret").eq("webhook_id", d.webhook_id).single();
  const body = JSON.stringify(d.payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sign(sec?.secret ?? "", ts, body);
  const t0 = Date.now();
  let status: number | null = null, text = "";
  try {
    const r = await fetch(hook.target_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PolyBase-Webhooks/1",
        "X-PolyBase-Event": d.event_trigger,
        "X-PolyBase-Delivery": d.id,
        "X-PolyBase-Idempotency-Key": d.idempotency_key,
        "X-PolyBase-Signature": `t=${ts},v1=${sig}`,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    status = r.status; text = (await r.text()).slice(0, 2000);
  } catch (e) { text = e instanceof Error ? e.message : "Network error"; }
  const latency = Date.now() - t0;
  const attempts = d.attempts + 1;
  const ok = status != null && status >= 200 && status < 300;
  const giveUp = !ok && (attempts >= MAX_ATTEMPTS || (status != null && status >= 400 && status < 500 && status !== 429) || d.is_test);
  const next = ok || giveUp ? null : new Date(Date.now() + BACKOFF_MIN[attempts - 1]! * 60_000).toISOString();
  const row = { attempts, response_status: status, response_body: text, latency_ms: latency, status: ok ? "delivered" : giveUp ? "failed" : "retrying", next_retry_at: next };
  await db.from("webhook_deliveries").update(row).eq("id", d.id);
  return { id: d.id, ...row };
}

/** Queue + send. Dedupes on (webhook, idempotency key); dry-run records without sending. */
export async function dispatch(db: Admin, hook: { id: string; user_id: string; dry_run: boolean }, trigger: Trigger, idemKey: string, data: Record<string, unknown>, isTest = false) {
  const payload = {
    id: idemKey, type: trigger, created_at: new Date().toISOString(), dry_run: hook.dry_run, test: isTest,
    notice: "PolyBase never places orders. Your bot decides whether to act.", data,
  };
  const { data: row, error } = await db.from("webhook_deliveries")
    .insert({ webhook_id: hook.id, user_id: hook.user_id, event_trigger: trigger, idempotency_key: idemKey, payload: payload as never, status: hook.dry_run && !isTest ? "dry_run" : "pending", is_test: isTest })
    .select("id").single();
  if (error) return null; // duplicate → already handled
  if (hook.dry_run && !isTest) return { id: row.id, status: "dry_run" };
  return attempt(db, row.id);
}

/** Run due retries (called by the scheduler). */
export async function runRetries(db: Admin) {
  const { data } = await db.from("webhook_deliveries").select("id").eq("status", "retrying").lte("next_retry_at", new Date().toISOString()).limit(50);
  for (const d of data ?? []) await attempt(db, d.id);
  return data?.length ?? 0;
}
