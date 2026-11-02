CREATE TABLE public.public_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text NOT NULL DEFAULT '',
  is_public boolean NOT NULL DEFAULT false,
  hide_absolute_values boolean NOT NULL DEFAULT true,
  show_roi boolean NOT NULL DEFAULT true,
  show_holdings boolean NOT NULL DEFAULT false,
  total_roi_pct numeric,
  win_rate_pct numeric,
  sharpe_ratio numeric,
  total_volume_usd numeric,
  net_pnl_usd numeric,
  holdings jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof_payload text,
  proof_signature text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.public_portfolios TO authenticated;
GRANT INSERT (user_id, handle, display_name, is_public, hide_absolute_values, show_roi, show_holdings) ON public.public_portfolios TO authenticated;
GRANT UPDATE (handle, display_name, is_public, hide_absolute_values, show_roi, show_holdings) ON public.public_portfolios TO authenticated;
GRANT ALL ON public.public_portfolios TO service_role;
ALTER TABLE public.public_portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own portfolio read" ON public.public_portfolios FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own portfolio insert" ON public.public_portfolios FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own portfolio update" ON public.public_portfolios FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own portfolio delete" ON public.public_portfolios FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.proof_keys (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  private_jwk jsonb NOT NULL,
  public_jwk jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.proof_keys TO service_role;
ALTER TABLE public.proof_keys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (handle text, display_name text, total_roi_pct numeric, win_rate_pct numeric, sharpe_ratio numeric, total_volume_usd numeric, verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.handle, p.display_name,
    CASE WHEN p.show_roi THEN p.total_roi_pct END,
    p.win_rate_pct, p.sharpe_ratio,
    CASE WHEN p.hide_absolute_values THEN NULL ELSE p.total_volume_usd END,
    p.verified_at
  FROM public.public_portfolios p
  WHERE p.is_public AND p.verified_at IS NOT NULL
  LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile(_handle text)
RETURNS TABLE (handle text, display_name text, total_roi_pct numeric, win_rate_pct numeric, sharpe_ratio numeric, total_volume_usd numeric, net_pnl_usd numeric, holdings jsonb, proof_payload text, proof_signature text, verified_at timestamptz, hide_absolute_values boolean, public_jwk jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.handle, p.display_name,
    CASE WHEN p.show_roi THEN p.total_roi_pct END,
    p.win_rate_pct, p.sharpe_ratio,
    CASE WHEN p.hide_absolute_values THEN NULL ELSE p.total_volume_usd END,
    CASE WHEN p.hide_absolute_values THEN NULL ELSE p.net_pnl_usd END,
    CASE WHEN p.show_holdings THEN p.holdings ELSE '[]'::jsonb END,
    p.proof_payload, p.proof_signature, p.verified_at, p.hide_absolute_values,
    (SELECT k.public_jwk FROM public.proof_keys k WHERE k.id = 1)
  FROM public.public_portfolios p
  WHERE p.is_public AND p.handle = lower(_handle)
$$;
REVOKE ALL ON FUNCTION public.get_leaderboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;