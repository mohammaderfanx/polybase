CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TYPE public.webhook_trigger AS ENUM ('arb_found','delta_breach','stop_loss_hit','settlement_imminent');

CREATE TABLE public.execution_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My bot',
  target_url text NOT NULL CHECK (target_url ~ '^https://'),
  secret_key_hash text NOT NULL,
  secret_hint text NOT NULL DEFAULT '',
  event_trigger public.webhook_trigger NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  dry_run boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.execution_webhooks TO authenticated;
GRANT ALL ON public.execution_webhooks TO service_role;
ALTER TABLE public.execution_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhooks read" ON public.execution_webhooks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own webhooks update" ON public.execution_webhooks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own webhooks delete" ON public.execution_webhooks FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.execution_webhooks(user_id);

-- Signing secrets: server-only, never readable by users after creation
CREATE TABLE public.webhook_secrets (
  webhook_id uuid PRIMARY KEY REFERENCES public.execution_webhooks(id) ON DELETE CASCADE,
  secret text NOT NULL
);
GRANT ALL ON public.webhook_secrets TO service_role;
ALTER TABLE public.webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.execution_webhooks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_trigger public.webhook_trigger NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  response_status int,
  response_body text,
  latency_ms int,
  next_retry_at timestamptz,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (webhook_id, idempotency_key)
);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deliveries read" ON public.webhook_deliveries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.webhook_deliveries(user_id, created_at DESC);
CREATE INDEX ON public.webhook_deliveries(status, next_retry_at);

ALTER TABLE public.user_risk_thresholds ADD COLUMN automation_killed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER t_webhooks_upd BEFORE UPDATE ON public.execution_webhooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_deliv_upd BEFORE UPDATE ON public.webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Scheduler token: lives in a non-API schema; pg_cron reads it, the server checks it via RPC
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE private.cron_config (id int PRIMARY KEY DEFAULT 1, token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'));
INSERT INTO private.cron_config DEFAULT VALUES;
CREATE OR REPLACE FUNCTION public.check_cron_token(t text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private AS $$ SELECT EXISTS (SELECT 1 FROM private.cron_config WHERE token = t) $$;
REVOKE ALL ON FUNCTION public.check_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_token(text) TO service_role;