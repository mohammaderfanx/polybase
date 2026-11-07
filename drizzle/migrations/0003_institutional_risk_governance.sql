CREATE TABLE public.risk_observations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, organization_id uuid REFERENCES public.organizations(id), day date NOT NULL DEFAULT current_date, captured_at timestamptz NOT NULL DEFAULT now(), equity numeric NOT NULL, marks jsonb NOT NULL DEFAULT '[]', UNIQUE NULLS NOT DISTINCT (user_id, organization_id, day));
GRANT SELECT ON public.risk_observations TO authenticated;
GRANT ALL ON public.risk_observations TO service_role;
ALTER TABLE public.risk_observations ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_read_team_risk(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=auth.uid() AND venue_permissions @> '{"Polymarket":true,"Kalshi":true}'::jsonb) $$;
REVOKE ALL ON FUNCTION public.can_read_team_risk(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_team_risk(uuid) TO authenticated;
CREATE POLICY "scoped risk observations" ON public.risk_observations FOR SELECT TO authenticated USING ((organization_id IS NULL AND user_id=auth.uid()) OR (organization_id IS NOT NULL AND public.can_read_team_risk(organization_id)));
CREATE TABLE public.organization_risk_limits (organization_id uuid PRIMARY KEY REFERENCES public.organizations(id), max_drawdown_pct numeric NOT NULL DEFAULT 10 CHECK(max_drawdown_pct>0 AND max_drawdown_pct<=100), max_concentration_pct numeric NOT NULL DEFAULT 25 CHECK(max_concentration_pct>0 AND max_concentration_pct<=100), revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.organization_risk_limits TO authenticated;
GRANT ALL ON public.organization_risk_limits TO service_role;
ALTER TABLE public.organization_risk_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read limits" ON public.organization_risk_limits FOR SELECT TO authenticated USING (public.org_role_of(organization_id,auth.uid()) IS NOT NULL);
CREATE TABLE public.risk_limit_proposals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), proposed_by uuid NOT NULL, approved_by uuid, max_drawdown_pct numeric NOT NULL CHECK(max_drawdown_pct>0 AND max_drawdown_pct<=100), max_concentration_pct numeric NOT NULL CHECK(max_concentration_pct>0 AND max_concentration_pct<=100), base_revision integer NOT NULL, reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','stale')), created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, CHECK(approved_by IS NULL OR approved_by<>proposed_by));
GRANT SELECT ON public.risk_limit_proposals TO authenticated;
GRANT ALL ON public.risk_limit_proposals TO service_role;
ALTER TABLE public.risk_limit_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read proposals" ON public.risk_limit_proposals FOR SELECT TO authenticated USING (public.org_role_of(organization_id,auth.uid()) IS NOT NULL);
CREATE OR REPLACE FUNCTION public.propose_risk_limits(_org uuid,_drawdown numeric,_concentration numeric,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p uuid; r integer; BEGIN
IF auth.uid() IS NULL OR NOT public.is_org_admin(_org,auth.uid()) THEN RAISE EXCEPTION 'Only team owners and admins can propose limits'; END IF;
INSERT INTO public.organization_risk_limits(organization_id) VALUES(_org) ON CONFLICT DO NOTHING;
SELECT revision INTO r FROM public.organization_risk_limits WHERE organization_id=_org FOR UPDATE;
INSERT INTO public.risk_limit_proposals(organization_id,proposed_by,max_drawdown_pct,max_concentration_pct,reason,base_revision) VALUES(_org,auth.uid(),_drawdown,_concentration,trim(_reason),r) RETURNING id INTO p;
INSERT INTO public.audit_telemetry_logs(organization_id,actor_id,action_type,metadata) VALUES(_org,auth.uid(),'RISK_LIMIT_PROPOSED',jsonb_build_object('proposal',p,'drawdown',_drawdown,'concentration',_concentration,'reason',trim(_reason)));
RETURN p; END $$;
CREATE OR REPLACE FUNCTION public.decide_risk_limits(_proposal uuid,_decision text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.risk_limit_proposals; r integer; s text; BEGIN
SELECT * INTO p FROM public.risk_limit_proposals WHERE id=_proposal FOR UPDATE;
IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_org_admin(p.organization_id,auth.uid()) THEN RAISE EXCEPTION 'Only team owners and admins can decide limits'; END IF;
IF p.status<>'pending' THEN RAISE EXCEPTION 'Proposal is no longer pending'; END IF;
IF _decision='cancelled' THEN IF p.proposed_by<>auth.uid() THEN RAISE EXCEPTION 'Only proposer can cancel'; END IF;
ELSIF _decision IN ('approved','rejected') THEN
IF p.proposed_by=auth.uid() THEN RAISE EXCEPTION 'A different admin must sign off'; END IF;
IF NOT public.is_org_admin(p.organization_id,p.proposed_by) THEN RAISE EXCEPTION 'Proposer is no longer an admin'; END IF;
ELSE RAISE EXCEPTION 'Invalid decision'; END IF;
SELECT revision INTO r FROM public.organization_risk_limits WHERE organization_id=p.organization_id FOR UPDATE;
s:=_decision;
IF _decision='approved' THEN
IF r<>p.base_revision THEN s:='stale'; ELSE UPDATE public.organization_risk_limits SET max_drawdown_pct=p.max_drawdown_pct,max_concentration_pct=p.max_concentration_pct,revision=revision+1,updated_at=now() WHERE organization_id=p.organization_id; END IF;
END IF;
UPDATE public.risk_limit_proposals SET status=s,approved_by=CASE WHEN s='approved' THEN auth.uid() ELSE NULL END,decided_at=now() WHERE id=p.id;
INSERT INTO public.audit_telemetry_logs(organization_id,actor_id,action_type,metadata) VALUES(p.organization_id,auth.uid(),'RISK_LIMIT_DECIDED',jsonb_build_object('proposal',p.id,'status',s));
RETURN s; END $$;
CREATE OR REPLACE FUNCTION public.institutional_data(_org uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE ps jsonb; fs jsonb; hs jsonb; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
IF _org IS NOT NULL AND NOT public.can_read_team_risk(_org) THEN RAISE EXCEPTION 'Team membership and access to both venues required'; END IF;
SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO ps FROM public.positions p JOIN public.venue_accounts v ON v.id=p.account_id AND v.user_id=p.user_id WHERE (_org IS NULL AND p.user_id=auth.uid()) OR (_org IS NOT NULL AND EXISTS(SELECT 1 FROM public.org_account_assignments a WHERE a.organization_id=_org AND a.venue_account_id=v.id AND a.venue=v.venue));
SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO fs FROM public.user_fee_profiles f WHERE (_org IS NULL AND f.user_id=auth.uid()) OR (_org IS NOT NULL AND EXISTS(SELECT 1 FROM public.org_account_assignments a JOIN public.venue_accounts v ON v.id=a.venue_account_id WHERE a.organization_id=_org AND v.user_id=f.user_id));
SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.day),'[]') INTO hs FROM (SELECT day,captured_at,equity,marks FROM public.risk_observations WHERE (_org IS NULL AND organization_id IS NULL AND user_id=auth.uid()) OR (_org IS NOT NULL AND organization_id=_org) ORDER BY day DESC LIMIT 366) h;
RETURN jsonb_build_object('positions',ps,'profiles',fs,'history',hs); END $$;
CREATE OR REPLACE FUNCTION public.capture_risk_observation(_org uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE payload jsonb; eq numeric; ms jsonb; owner_id uuid; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
IF _org IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_account_assignments a JOIN public.venue_accounts v ON v.id=a.venue_account_id WHERE a.organization_id=_org AND v.user_id=auth.uid()) THEN RAISE EXCEPTION 'Only synced account owners may capture team history'; END IF;
payload:=public.institutional_data(_org);
SELECT coalesce(sum((p->>'shares')::numeric*(p->>'current_price')::numeric),0) INTO eq FROM jsonb_array_elements(payload->'positions') p;
SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO ms FROM (SELECT coalesce(p->>'matched_event_id',(p->>'venue')||':'||(p->>'market_key')) event_key, avg(CASE WHEN lower(p->>'outcome')='no' THEN 1-(p->>'current_price')::numeric ELSE (p->>'current_price')::numeric END) yes_price FROM jsonb_array_elements(payload->'positions') p GROUP BY 1) x;
IF _org IS NULL THEN owner_id:=auth.uid(); ELSE SELECT user_id INTO owner_id FROM public.organization_members WHERE organization_id=_org AND role='owner' ORDER BY created_at LIMIT 1; END IF;
INSERT INTO public.risk_observations(user_id,organization_id,equity,marks) VALUES(owner_id,_org,eq,ms) ON CONFLICT (user_id,organization_id,day) DO UPDATE SET equity=excluded.equity,marks=excluded.marks,captured_at=now(); END $$;
REVOKE ALL ON FUNCTION public.propose_risk_limits(uuid,numeric,numeric,text),public.decide_risk_limits(uuid,text),public.institutional_data(uuid),public.capture_risk_observation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.propose_risk_limits(uuid,numeric,numeric,text),public.decide_risk_limits(uuid,text),public.institutional_data(uuid),public.capture_risk_observation(uuid) TO authenticated;