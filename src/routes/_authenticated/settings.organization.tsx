import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Mail, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { accountsQ } from "@/lib/queries";
import { logAudit } from "@/lib/org.functions";
import { VenueBadge } from "@/components/AppHeader";

type Role = Database["public"]["Enums"]["org_role"];
type Perms = { Polymarket: boolean; Kalshi: boolean };
const ROLES: Role[] = ["owner", "admin", "trader", "view_only"];
const roleLabel = (r: string) => (r === "view_only" ? "View-only" : r.charAt(0).toUpperCase() + r.slice(1));

export const Route = createFileRoute("/_authenticated/settings/organization")({
  head: () => ({
    meta: [
      { title: "Team Workspace — PolyBase" },
      { name: "description", content: "Invite your desk, set roles and venue permissions, share venue accounts, and watch a tamper-proof audit log." },
      { property: "og:title", content: "Team Workspace — PolyBase" },
      { property: "og:description", content: "Invite your desk, set roles and venue permissions, share venue accounts, and watch a tamper-proof audit log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrgPage,
});

const meQ = queryOptions({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user });
const orgsQ = queryOptions({
  queryKey: ["orgs"],
  queryFn: async () => { const { data, error } = await supabase.from("organizations").select("*").order("created_at"); if (error) throw error; return data; },
});
const myInvitesQ = queryOptions({
  queryKey: ["my-invites"],
  queryFn: async () => { const { data, error } = await supabase.from("organization_invites").select("*, organizations(name)"); if (error) throw error; return data; },
});
const orgDataQ = (org: string) => queryOptions({
  queryKey: ["org", org],
  queryFn: async () => {
    const [m, i, p] = await Promise.all([
      supabase.from("organization_members").select("*").eq("organization_id", org).order("created_at"),
      supabase.from("organization_invites").select("*").eq("organization_id", org).order("created_at"),
      supabase.from("org_account_assignments").select("*").eq("organization_id", org).order("created_at"),
    ]);
    const err = m.error ?? i.error ?? p.error; if (err) throw err;
    return { members: m.data ?? [], invites: i.data ?? [], pool: p.data ?? [] };
  },
});
const auditQ = (org: string) => queryOptions({
  queryKey: ["audit", org],
  queryFn: async () => { const { data, error } = await supabase.from("audit_telemetry_logs").select("*").eq("organization_id", org).order("timestamp", { ascending: false }).limit(200); if (error) throw error; return data; },
  refetchInterval: 30_000,
});

function OrgPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery(meQ);
  const { data: orgs = [] } = useQuery(orgsQ);
  const { data: invites = [] } = useQuery(myInvitesQ);
  const [sel, setSel] = useState<string | null>(null);
  const org = orgs.find((o) => o.id === sel) ?? orgs[0];
  const audit = useServerFn(logAudit);
  const [form, setForm] = useState({ name: "", slug: "" });

  const create = async () => {
    const slug = form.slug.trim().toLowerCase();
    if (!form.name.trim() || !/^[a-z0-9-]{3,40}$/.test(slug)) { toast.error("Name required; slug 3–40 chars of a–z, 0–9, -"); return; }
    const { data, error } = await supabase.rpc("create_organization", { _name: form.name.trim(), _slug: slug });
    if (error) { toast.error(error.message.includes("duplicate") ? "That slug is taken" : error.message); return; }
    await audit({ data: { organization_id: data, action_type: "WORKSPACE_CREATED", metadata: { name: form.name } } });
    setForm({ name: "", slug: "" }); setSel(data); qc.invalidateQueries({ queryKey: ["orgs"] });
  };
  const accept = async (id: string) => {
    const { data, error } = await supabase.rpc("accept_org_invite", { _invite: id });
    if (error) { toast.error(error.message); return; }
    await audit({ data: { organization_id: data, action_type: "INVITE_ACCEPTED", metadata: {} } });
    setSel(data); qc.invalidateQueries({ queryKey: ["orgs"] }); qc.invalidateQueries({ queryKey: ["my-invites"] });
  };

  const pending = invites.filter((i) => !orgs.some((o) => o.id === i.organization_id));

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-primary" />
        <h1 className="font-mono text-sm font-bold">TEAM WORKSPACE</h1>
        {orgs.length > 0 && (
          <select value={org?.id} onChange={(e) => setSel(e.target.value)} className="rounded-sm border bg-background px-2 py-1 font-mono text-xs">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {pending.length > 0 && (
        <section className="rounded-sm border border-primary/40 bg-primary/5 p-3">
          <h2 className="mb-2 font-mono text-xs font-bold">INVITATIONS FOR YOU</h2>
          {pending.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-1 font-mono text-xs">
              <Mail className="h-3 w-3" /> {(i.organizations as { name: string } | null)?.name ?? "Workspace"} as {roleLabel(i.role)}
              <button onClick={() => accept(i.id)} className="rounded-sm bg-primary px-2 py-0.5 text-primary-foreground">Join</button>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-sm border p-3">
        <h2 className="mb-2 font-mono text-xs font-bold">{orgs.length ? "NEW WORKSPACE" : "CREATE YOUR FIRST WORKSPACE"}</h2>
        <div className="flex flex-wrap gap-2">
          <input placeholder="Desk name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm border bg-background px-2 py-1 font-mono text-xs" />
          <input placeholder="slug (e.g. alpha-desk)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="rounded-sm border bg-background px-2 py-1 font-mono text-xs" />
          <button onClick={create} className="rounded-sm bg-primary px-3 py-1 font-mono text-xs text-primary-foreground">Create</button>
        </div>
      </section>

      {org && me && <Workspace orgId={org.id} orgName={org.name} meId={me.id} />}
    </main>
  );
}

function Workspace({ orgId, orgName, meId }: { orgId: string; orgName: string; meId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery(orgDataQ(orgId));
  const { data: logs = [] } = useQuery(auditQ(orgId));
  const { data: myAccounts = [] } = useQuery(accountsQ);
  const audit = useServerFn(logAudit);
  const [inv, setInv] = useState({ email: "", role: "trader" as Role });
  const myRole = data?.members.find((m) => m.user_id === meId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const refresh = () => { qc.invalidateQueries({ queryKey: ["org", orgId] }); qc.invalidateQueries({ queryKey: ["audit", orgId] }); };
  const log = (action_type: string, metadata: Record<string, unknown>) => audit({ data: { organization_id: orgId, action_type, metadata } }).then(refresh);

  if (!data) return <p className="font-mono text-xs text-muted-foreground">Loading…</p>;
  const emailOf = (id: string | null) => data.members.find((m) => m.user_id === id)?.email || "—";

  const invite = async () => {
    const email = inv.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error("Enter a valid email"); return; }
    const { error } = await supabase.from("organization_invites").insert({ organization_id: orgId, email, role: inv.role, invited_by: meId });
    if (error) { toast.error(error.message); return; }
    setInv({ ...inv, email: "" }); toast.success("Invite created — they'll see it here after signing in with that email");
    log("MEMBER_INVITED", { email, role: inv.role });
  };
  const setRole = async (id: string, email: string, role: Role) => {
    const { error } = await supabase.from("organization_members").update({ role }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    log("ROLE_CHANGED", { email, role });
  };
  const setPerm = async (id: string, email: string, perms: Perms, venue: keyof Perms) => {
    const next = { ...perms, [venue]: !perms[venue] };
    const { error } = await supabase.from("organization_members").update({ venue_permissions: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    log("VENUE_PERMISSION_CHANGED", { email, venue, allowed: next[venue] });
  };
  const removeMember = async (id: string, email: string) => {
    if (!confirm(`Remove ${email}?`)) return;
    const { error } = await supabase.from("organization_members").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    log("MEMBER_REMOVED", { email });
  };
  const cancelInvite = async (id: string, email: string) => {
    await supabase.from("organization_invites").delete().eq("id", id); log("INVITE_REVOKED", { email });
  };
  const share = async (acc: (typeof myAccounts)[number]) => {
    const { error } = await supabase.from("org_account_assignments").insert({ organization_id: orgId, venue_account_id: acc.id, venue: acc.venue, label: acc.identifier, added_by: meId });
    if (error) { toast.error(error.message.includes("duplicate") ? "Already in the pool" : error.message); return; }
    log("ACCOUNT_SHARED", { venue: acc.venue, account: acc.identifier });
  };
  const assign = async (id: string, label: string, to: string) => {
    const { error } = await supabase.from("org_account_assignments").update({ assigned_to: to || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    log("ACCOUNT_ASSIGNED", { account: label, to: to ? emailOf(to) : null });
  };
  const unshare = async (id: string, label: string) => {
    await supabase.from("org_account_assignments").delete().eq("id", id); log("ACCOUNT_UNSHARED", { account: label });
  };

  const unshared = myAccounts.filter((a) => !data.pool.some((p) => p.venue_account_id === a.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <section className="rounded-sm border">
          <header className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="font-mono text-xs font-bold">MEMBERS · {orgName}</h2>
            <span className="font-mono text-[11px] text-muted-foreground">You: {myRole ? roleLabel(myRole) : "—"}</span>
          </header>
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="px-3 py-1.5">Email</th><th>Role</th><th>Polymarket</th><th>Kalshi</th><th /></tr></thead>
            <tbody>
              {data.members.map((m) => {
                const perms = m.venue_permissions as Perms;
                const editable = isAdmin && m.role !== "owner" && m.user_id !== meId;
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{m.email || m.user_id.slice(0, 8)}</td>
                    <td>{editable ? (
                      <select value={m.role} onChange={(e) => setRole(m.id, m.email, e.target.value as Role)} className="rounded-sm border bg-background px-1 py-0.5">
                        {ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                      </select>) : roleLabel(m.role)}</td>
                    {(["Polymarket", "Kalshi"] as const).map((v) => (
                      <td key={v}><input type="checkbox" aria-label={`${v} access for ${m.email}`} checked={!!perms?.[v]} disabled={!editable} onChange={() => setPerm(m.id, m.email, perms, v)} /></td>
                    ))}
                    <td className="pr-3 text-right">{editable && <button onClick={() => removeMember(m.id, m.email)} aria-label="Remove member" className="text-muted-foreground hover:text-loss"><Trash2 className="h-3 w-3" /></button>}</td>
                  </tr>
                );
              })}
              {data.invites.map((i) => (
                <tr key={i.id} className="border-b text-muted-foreground last:border-0">
                  <td className="px-3 py-1.5">{i.email} <span className="text-[10px]">(invited)</span></td><td>{roleLabel(i.role)}</td><td /><td />
                  <td className="pr-3 text-right">{isAdmin && <button onClick={() => cancelInvite(i.id, i.email)} aria-label="Cancel invite" className="hover:text-loss"><Trash2 className="h-3 w-3" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isAdmin && (
            <div className="flex flex-wrap gap-2 border-t p-3">
              <input placeholder="teammate@fund.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} className="flex-1 rounded-sm border bg-background px-2 py-1 font-mono text-xs" />
              <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })} className="rounded-sm border bg-background px-2 py-1 font-mono text-xs">
                {ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
              <button onClick={invite} className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1 font-mono text-xs text-primary-foreground"><UserPlus className="h-3 w-3" /> Invite</button>
            </div>
          )}
        </section>

        <section className="rounded-sm border">
          <header className="border-b px-3 py-2"><h2 className="font-mono text-xs font-bold">SHARED ACCOUNT POOL</h2></header>
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="px-3 py-1.5">Venue</th><th>Account</th><th>Assigned to</th><th /></tr></thead>
            <tbody>
              {data.pool.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-muted-foreground">No accounts shared yet.</td></tr>}
              {data.pool.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5"><VenueBadge venue={p.venue} /></td>
                  <td className="max-w-[240px] truncate">{p.label}</td>
                  <td>{isAdmin ? (
                    <select value={p.assigned_to ?? ""} onChange={(e) => assign(p.id, p.label, e.target.value)} className="rounded-sm border bg-background px-1 py-0.5">
                      <option value="">Unassigned</option>
                      {data.members.filter((m) => (m.venue_permissions as Perms)?.[p.venue] && m.role !== "view_only").map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
                    </select>) : emailOf(p.assigned_to)}</td>
                  <td className="pr-3 text-right">{(isAdmin || p.added_by === meId) && <button onClick={() => unshare(p.id, p.label)} aria-label="Remove from pool" className="text-muted-foreground hover:text-loss"><Trash2 className="h-3 w-3" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {myRole !== "view_only" && unshared.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t p-3 font-mono text-xs">
              <span className="text-muted-foreground">Share one of your accounts:</span>
              {unshared.map((a) => <button key={a.id} onClick={() => share(a)} className="rounded-sm border px-2 py-0.5 hover:bg-accent">{a.venue} · {a.identifier.slice(0, 14)}</button>)}
            </div>
          )}
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Accounts are read-only links. Only members with access to that venue can be assigned. No trading keys are stored.</p>
        </section>
      </div>

      <section className="rounded-sm border">
        <header className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="font-mono text-xs font-bold">AUDIT LOG</h2>
          <span className="flex items-center gap-1 font-mono text-[10px] text-gain"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gain" /> LIVE · append-only</span>
        </header>
        <ul className="max-h-[640px] divide-y overflow-auto font-mono text-[11px]">
          {logs.length === 0 && <li className="px-3 py-3 text-muted-foreground">No activity yet.</li>}
          {logs.map((l) => {
            const md = l.metadata as Record<string, unknown>;
            return (
              <li key={l.id} className="px-3 py-1.5">
                <div className="flex justify-between"><span className="text-primary">{l.action_type}</span><span className="text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</span></div>
                <div className="text-muted-foreground">{String(md["actor_email"] ?? emailOf(l.actor_id))}{l.ip_address && ` · ${l.ip_address}`}</div>
                <div className="truncate">{Object.entries(md).filter(([k]) => k !== "actor_email").map(([k, v]) => `${k}=${v}`).join("  ")}</div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
