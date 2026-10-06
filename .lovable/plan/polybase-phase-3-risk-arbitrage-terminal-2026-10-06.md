# PolyBase Phase 3 — Risk & Arbitrage Terminal

## Constraints and how they are handled
- **Live streaming:** The app's server can't hold long-lived venue WebSockets. So the browser connects straight to Polymarket's public CLOB market feed. Kalshi's feed needs signed auth, so Kalshi prices come from a short-interval server poll (about 3s) using the existing key. If a feed drops, the app switches to polling and shows a "Degraded WebSocket — Polling Mode" badge on the venue status bar. Nothing on screen resets when this happens.
- **Push alerts:** Alerts run from a server endpoint that a scheduled job calls every minute. It checks your limits and posts JSON to your webhook. This turn I'll skip browser push notifications and email (email needs a sender domain), but the settings toggle is saved for later.
- **No trading:** The app only prepares order details for you to copy. It never places orders.

## Database
- `arbitrage_opportunities`: the fields from the spec. Signed-in users can read them; only the server writes them. Live updates are on.
- `user_risk_thresholds`: one row per user, with the spec's defaults. Each user sees only their own row.
- `execution_logs`: has an `event_type` enum (sync, alert_triggered, export, rebalance_recommendation). Each user sees only their own logs. Sync, export and alerts write entries.

## Engines (pure, tested)
- **Arbitrage (A):** For each matched event, it checks both directions: Poly YES + Kalshi NO, and Poly NO + Kalshi YES. It walks the ask ladders level by level and stops at the size where the net spread hits zero. The net figure takes off Kalshi taker fees, Polymarket fees and a gas share, so a gross spread is never shown. Output: net spread %, the executable USD depth, and a step-by-step plan you can copy.
- **Delta (B):** For each event it shows YES-vs-NO exposure, imbalance % and directional bias, plus a rebalance suggestion ("Buy N Kalshi NO at $P"). It also builds a resolution matrix: total P&L for every YES/NO outcome combination across events (top 6 events by exposure).
- **Depth (C):** Cumulative bid/ask curves for each venue, drawn as charts side by side.

## Pages and UI
- **/arbitrage:** a dense scanner table with green/red flashes when prices tick. Filters: minimum net %, minimum liquidity, category, and whether the trade is executable. Each row opens a depth chart and a copy-plan button.
- **/risk:** an exposure heatmap (category × event), a scenario slider per event ("probability Fed holds") with live P&L impact, and an alert settings form (limits, webhook, email toggle).
- **Dashboard:** a Spread Scanner snapshot in the top right, and a depth toggle when you expand a position row.
- **Header:** links to the new pages, plus feed status dots for each venue.

## Technical details
- Zustand store with per-market selectors (`useBook(venue, key)`), and ticks batched through requestAnimationFrame.
- `src/lib/feeds/polymarket-ws.ts` (in the browser, reconnects with backoff, then falls back to polling), plus a `getKalshiBooks` server function and a `getPolyBooks` REST fallback.
- `src/routes/api/public/alerts-tick.ts` is protected by the cron secret. It scans for opportunities, stores them, evaluates thresholds, calls webhooks and logs alerts. pg_cron runs it every minute.
- Vitest tests for the arbitrage, delta and scenario engines.
- AGENTS.md gets updated with the feed and alert architecture rules.
