CREATE TABLE public.copy_trading_vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_trader_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  lead_account_id uuid REFERENCES public.venue_accounts(id) ON DELETE SET NULL,
  name text NOT NULL,
  target_allocation_usd numeric NOT NULL DEFAULT 0,
  max_slippage_tolerance_pct numeric NOT NULL DEFAULT 0.5,
  auto_hedge_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vault_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.copy_trading_vaults(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  venue_account_id uuid REFERENCES public.venue_accounts(id) ON DELETE SET NULL,
  label text NOT NULL,
  venue public.venue NOT NULL,
  available_margin_usd numeric NOT NULL DEFAULT 0,
  fee_tier text NOT NULL DEFAULT 'standard',
  max_contracts_per_market numeric NOT NULL DEFAULT 25000,
  is_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copy_trading_vaults TO authenticated;
GRANT ALL ON public.copy_trading_vaults TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_followers TO authenticated;
GRANT ALL ON public.vault_followers TO service_role;
ALTER TABLE public.copy_trading_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead or org member reads vault" ON public.copy_trading_vaults FOR SELECT TO authenticated
  USING (lead_trader_id = auth.uid() OR (organization_id IS NOT NULL AND public.org_role_of(organization_id, auth.uid()) IS NOT NULL));
CREATE POLICY "lead creates vault" ON public.copy_trading_vaults FOR INSERT TO authenticated
  WITH CHECK (lead_trader_id = auth.uid() AND (organization_id IS NULL OR public.org_role_of(organization_id, auth.uid()) IN ('owner','admin','trader')));
CREATE POLICY "lead or org admin updates vault" ON public.copy_trading_vaults FOR UPDATE TO authenticated
  USING (lead_trader_id = auth.uid() OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id, auth.uid())))
  WITH CHECK (organization_id IS NULL OR public.org_role_of(organization_id, auth.uid()) IS NOT NULL);
CREATE POLICY "lead deletes vault" ON public.copy_trading_vaults FOR DELETE TO authenticated USING (lead_trader_id = auth.uid());
CREATE POLICY "own followers" ON public.vault_followers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.copy_trading_vaults v WHERE v.id = vault_id AND v.lead_trader_id = auth.uid()));