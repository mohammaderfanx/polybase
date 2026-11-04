<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Venue API calls (Polymarket data API, Kalshi signed REST) live in `src/lib/venues.server.ts` and run only inside the `syncPortfolio` server fn — keeps keys and signing server-side.
- Fee-adjusted P&L is computed by the pure `src/lib/fees.ts` engine on read, not stored — fee-tier changes apply instantly without resync.
- Kalshi credentials are app-level secrets (single owner account), not per-user — per-user Kalshi keys would need encrypted storage.
- Live orderbooks: browser connects directly to Polymarket's public WS; Kalshi books come from a signed REST poll via the `getBooks` server fn — Workers can't hold long-lived venue sockets.
- Tick state lives in a Zustand store with rAF-batched writes (`market-store.ts`); components subscribe to slices to avoid re-render storms.
- Arbitrage math (`arb.ts`) and delta/hedging math (`delta.ts`) are pure and shared by UI and the alert route; spreads are always net of fees, gas and slippage.
- The 5-min scheduler calls `/api/public/hooks/risk-alerts` with a token kept in the non-API `private.cron_config` table (checked via the service-only `check_cron_token` RPC) — pg_cron cannot read app secrets.
- Webhook bridge (`webhooks.server.ts`): signing keys live in service-only `webhook_secrets`; deliveries dedupe on (webhook, idempotency key), new hooks start in dry-run, a per-user kill switch on `user_risk_thresholds` stops all sends, retries back off over 3 attempts.
- Proof-of-P&L (`proof.ts`, `proof.functions.ts`): metrics are computed and ECDSA P-256 signed server-side; users can only update display/privacy columns (column-level GRANTs), so stats can't be forged. The signing key lives in service-only `proof_keys`; public pages read masked data only through security-definer `get_leaderboard` / `get_public_profile`, which null out $ values when hidden.
- Team workspaces: membership checks go through security-definer `org_role_of` / `is_org_admin` (avoids RLS recursion); orgs and invite-acceptance are created only via `create_organization` / `accept_org_invite` RPCs so the owner row can't be forged. `audit_telemetry_logs` is written only by the `logAudit` server fn (service role, IP from request headers) and a trigger blocks UPDATE/DELETE for everyone — keeps it tamper-proof.
