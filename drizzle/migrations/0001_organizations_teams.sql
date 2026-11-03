CREATE TYPE public.plan_tier AS ENUM ('pro','syndicate','enterprise');
CREATE TYPE public.org_role AS ENUM ('owner','admin','trader','view_only');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan_tier public.plan_tier NOT NULL DEFAULT 'pro',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  role public.org_role NOT NULL DEFAULT 'view_only',
  venue_permissions jsonb NOT NULL DEFAULT '{"Polymarket": true, "Kalshi": true}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE TABLE public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'view_only',
  venue_permissions jsonb NOT NULL DEFAULT '{"Polymarket": true, "Kalshi": true}'::jsonb,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE TABLE public.org_account_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  venue_account_id uuid NOT NULL REFERENCES public.venue_accounts(id) ON DELETE CASCADE,
  venue public.venue NOT NULL,
  label text NOT NULL,
  added_by uuid NOT NULL,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, venue_account_id)
);
CREATE TABLE public.audit_telemetry_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action_type text NOT NULL,
  ip_address text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.audit_telemetry_logs (organization_id, "timestamp" DESC);

CREATE OR REPLACE FUNCTION public.org_role_of(_org uuid, _user uuid)
RETURNS public.org_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.organization_members WHERE organization_id = _org AND user_id = _user
$$;
CREATE OR REPLACE FUNCTION public.is_org_admin(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org AND user_id = _user AND role IN ('owner','admin'))
$$;

GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
GRANT SELECT, INSERT, DELETE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_account_assignments TO authenticated;
GRANT ALL ON public.org_account_assignments TO service_role;
GRANT SELECT ON public.audit_telemetry_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_telemetry_logs TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_account_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_telemetry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read org" ON public.organizations FOR SELECT TO authenticated
  USING (public.org_role_of(id, auth.uid()) IS NOT NULL);
CREATE POLICY "members read members" ON public.organization_members FOR SELECT TO authenticated
  USING (public.org_role_of(organization_id, auth.uid()) IS NOT NULL);
CREATE POLICY "admins update members" ON public.organization_members FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()) AND role <> 'owner')
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()) AND role <> 'owner');
CREATE POLICY "admins remove members or self leave" ON public.organization_members FOR DELETE TO authenticated
  USING (role <> 'owner' AND (public.is_org_admin(organization_id, auth.uid()) OR user_id = auth.uid()));
CREATE POLICY "admins read invites or invitee" ON public.organization_invites FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()) OR lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY "admins create invites" ON public.organization_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()) AND invited_by = auth.uid() AND role <> 'owner');
CREATE POLICY "admins or invitee delete invites" ON public.organization_invites FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()) OR lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY "members read pool" ON public.org_account_assignments FOR SELECT TO authenticated
  USING (public.org_role_of(organization_id, auth.uid()) IS NOT NULL);
CREATE POLICY "owner of account adds to pool" ON public.org_account_assignments FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND public.org_role_of(organization_id, auth.uid()) IN ('owner','admin','trader')
    AND EXISTS (SELECT 1 FROM public.venue_accounts v WHERE v.id = venue_account_id AND v.user_id = auth.uid()));
CREATE POLICY "admins assign pool" ON public.org_account_assignments FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid())) WITH CHECK (public.is_org_admin(organization_id, auth.uid()));
CREATE POLICY "admins or adder remove pool" ON public.org_account_assignments FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()) OR added_by = auth.uid());
CREATE POLICY "members read audit" ON public.audit_telemetry_logs FOR SELECT TO authenticated
  USING (public.org_role_of(organization_id, auth.uid()) IS NOT NULL);

-- Immutable audit log: block UPDATE/DELETE for everyone, including service role
CREATE OR REPLACE FUNCTION public.block_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_telemetry_logs is append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON public.audit_telemetry_logs
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

CREATE OR REPLACE FUNCTION public.create_organization(_name text, _slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  INSERT INTO public.organizations(name, slug) VALUES (_name, lower(_slug)) RETURNING id INTO _id;
  INSERT INTO public.organization_members(organization_id, user_id, email, role)
    VALUES (_id, auth.uid(), coalesce(auth.jwt() ->> 'email',''), 'owner');
  RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.accept_org_invite(_invite uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.organization_invites;
BEGIN
  SELECT * INTO i FROM public.organization_invites WHERE id = _invite AND lower(email) = lower(auth.jwt() ->> 'email');
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  INSERT INTO public.organization_members(organization_id, user_id, email, role, venue_permissions)
    VALUES (i.organization_id, auth.uid(), i.email, i.role, i.venue_permissions)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  DELETE FROM public.organization_invites WHERE id = _invite;
  RETURN i.organization_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_organization(text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.accept_org_invite(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_organization(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(uuid) TO authenticated;