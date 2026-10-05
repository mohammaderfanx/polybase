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
