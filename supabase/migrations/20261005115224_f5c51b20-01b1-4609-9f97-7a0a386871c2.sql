CREATE TYPE public.market_category AS ENUM ('Politics','Macro / Economics','Tech / AI','Pop Culture');
CREATE TYPE public.venue AS ENUM ('Polymarket','Kalshi');

CREATE TABLE public.matched_events (
  id text PRIMARY KEY,
  event_name text NOT NULL,
  category public.market_category NOT NULL,
  polymarket_condition_id text,
  kalshi_ticker text,
  normalized_outcomes_map jsonb NOT NULL DEFAULT '{"Yes":"Yes","No":"No"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matched_events TO authenticated;
GRANT ALL ON public.matched_events TO service_role;
ALTER TABLE public.matched_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read matched events" ON public.matched_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.user_fee_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  polymarket_tier text NOT NULL DEFAULT 'standard',
  kalshi_fee_tier text NOT NULL DEFAULT 'standard',
  custom_gas_offset_usd numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_fee_profiles TO authenticated;
GRANT ALL ON public.user_fee_profiles TO service_role;
ALTER TABLE public.user_fee_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own fee profile" ON public.user_fee_profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.historical_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  total_equity_usd numeric NOT NULL DEFAULT 0,
  unrealized_pnl_usd numeric NOT NULL DEFAULT 0,
  realized_pnl_usd numeric NOT NULL DEFAULT 0,
  net_fees_usd numeric NOT NULL DEFAULT 0
);
CREATE INDEX ON public.historical_snapshots (user_id, "timestamp");
GRANT SELECT, INSERT, DELETE ON public.historical_snapshots TO authenticated;
GRANT ALL ON public.historical_snapshots TO service_role;
ALTER TABLE public.historical_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own snapshots" ON public.historical_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.venue_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue public.venue NOT NULL,
  identifier text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue, identifier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_accounts TO authenticated;
GRANT ALL ON public.venue_accounts TO service_role;
ALTER TABLE public.venue_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own venue accounts" ON public.venue_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.venue_accounts(id) ON DELETE CASCADE,
  venue public.venue NOT NULL,
  market_key text NOT NULL,
  matched_event_id text REFERENCES public.matched_events(id) ON DELETE SET NULL,
  market_title text NOT NULL,
  outcome text NOT NULL,
  shares numeric NOT NULL DEFAULT 0,
  avg_buy_price numeric NOT NULL DEFAULT 0,
  current_price numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  fees_paid numeric NOT NULL DEFAULT 0,
  settlement_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, market_key, outcome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own positions" ON public.positions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

INSERT INTO public.matched_events (id, event_name, category, polymarket_condition_id, kalshi_ticker) VALUES
 ('FED-RATE-CUT-NOV-2026','Fed Rate Cut November','Macro / Economics',NULL,'FED'),
 ('GPT6-RELEASE-2026','GPT-6 Released Before 2027','Tech / AI',NULL,'OAIGPT6'),
 ('HOUSE-2026','Democrats Win House 2026','Politics',NULL,'CONTROLH'),
 ('CPI-OCT-2026','October CPI Above 3.0%','Macro / Economics',NULL,'CPI');