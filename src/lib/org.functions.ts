import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Appends an entry to the workspace audit log. Only the server can write the log
 * (insert-only, no update/delete), and the IP comes from the request, not the browser.
 */
export const logAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      action_type: z.string().regex(/^[A-Z_]{3,60}$/),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("org_role_of", { _org: data.organization_id, _user: context.userId });
    if (!role) throw new Error("Not a member of this workspace");
    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_telemetry_logs").insert({
      organization_id: data.organization_id,
      actor_id: context.userId,
      action_type: data.action_type,
      ip_address: ip,
      metadata: { ...data.metadata, actor_email: context.claims?.email ?? null } as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
