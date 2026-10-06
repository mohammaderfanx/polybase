CREATE TYPE public.execution_event_type AS ENUM ('sync','alert_triggered','export','rebalance_recommendation');

CREATE TABLE public.arbitrage_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matched_event_id text NOT NULL REFERENCES public.matched_events(id) ON DELETE CASCADE,
  poly_price_yes numeric NOT NULL DEFAULT 0,
  kalshi_price_yes numeric NOT NULL DEFAULT 0,
  gross_spread_pct numeric NOT NULL DEFAULT 0,
  net_spread_pct numeric NOT NULL DEFAULT 0,
  liquidity_at_spread_usd numeric NOT NULL DEFAULT 0,
  direction text NOT NULL DEFAULT 'poly_yes_kalshi_no',
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.arbitrage_opportunities (detected_at DESC);
GRANT SELECT ON public.arbitrage_opportunities TO authenticated;
GRANT ALL ON public.arbitrage_opportunities TO service_role;
ALTER TABLE public.arbitrage_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read arbs" ON public.arbitrage_opportunities FOR SELECT TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.arbitrage_opportunities;

CREATE TABLE public.user_risk_thresholds (
  user_id uuid PRIMARY KEY,
  max_portfolio_drawdown_pct numeric NOT NULL DEFAULT 10.0,
  max_single_event_exposure_usd numeric NOT NULL DEFAULT 5000,
  delta_imbalance_threshold_pct numeric NOT NULL DEFAULT 25.0,
  auto_alert_email boolean NOT NULL DEFAULT true,
  webhook_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_risk_thresholds TO authenticated;
GRANT ALL ON public.user_risk_thresholds TO service_role;
ALTER TABLE public.user_risk_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own thresholds" ON public.user_risk_thresholds FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type public.execution_event_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.execution_logs (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.execution_logs TO authenticated;
GRANT ALL ON public.execution_logs TO service_role;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own logs read" ON public.execution_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own logs insert" ON public.execution_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);