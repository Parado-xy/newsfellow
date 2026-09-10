# NewsFellow

NewsFellow is a shared news engine with two delivery profiles: a private Telegram technology companion and the Founders LA Discord startup radar.

- secure Telegram webhook with an owner chat allowlist;
- `/start`, `/status`, and on-demand `/brief` commands;
- curated RSS/Atom collection;
- URL normalization, exact deduplication, transparent relevance scoring;
- Workers AI summaries using `@cf/meta/llama-3.2-1b-instruct`, with automatic zero-cost extractive fallback;
- Cloudflare D1 persistence, batched writes, and automatic morning/evening round-ups;
- offline unit tests with no paid API dependency.
- a Louisiana-first FLA source profile and Discord webhook delivery with rate-limit retries;
- audience-aware storage so personal technology stories do not leak into the community feed.
- delivery-window and per-message idempotency with a D1 delivery ledger;
- source-health history, bounded delivery retries, correlation IDs, and private Telegram operations reporting.

## Architecture

`Cron → audience-specific feeds → D1 → audience ranking → Telegram / Discord`

`/brief → read D1 → bounded summary generation → Telegram`

The primary summarizer is Cloudflare's hosted Llama 3.2 1B Instruct model, selected because it explicitly supports summarization and fits the free Workers AI allocation at personal usage. The `extractiveSummary` function remains a deterministic fallback when Workers AI is unavailable, over quota, disabled, or returns malformed output.

## Prerequisites

- Node.js 22+
- A free Cloudflare account
- A Telegram bot token from `@BotFather`

## Setup

1. Install dependencies with `npm install`.
2. Create a D1 database: `npx wrangler d1 create newsfellow`.
3. Put the returned database ID in `wrangler.jsonc`.
4. Apply migrations: `npm run db:migrate:remote`.
5. Set secrets:
   - `npx wrangler secret put TELEGRAM_BOT_TOKEN`
   - `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET`
   - `npx wrangler secret put TELEGRAM_OWNER_CHAT_ID`
   - `npx wrangler secret put DISCORD_NEWS_WEBHOOK_URL`
   - `npx wrangler secret put DISCORD_ADMIN_SECRET`
6. Deploy with `npm run deploy`.
7. Register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://newsfellow.<YOUR_SUBDOMAIN>.workers.dev/telegram/webhook","secret_token":"<WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

Do not commit `.dev.vars`, bot tokens, or chat IDs.

Workers AI is enabled through the `AI` binding in `wrangler.jsonc`; it does not require a separate model API key. Set `AI_SUMMARIZER_ENABLED` to `false` to force extractive-only mode.

For FLA, create an incoming webhook on the Discord news channel, store its URL as `DISCORD_NEWS_WEBHOOK_URL`, then set `FLA_NEWS_ENABLED` to `true`. The protected `POST /discord/test` endpoint queues a manual test when called with `Authorization: Bearer <DISCORD_ADMIN_SECRET>`. Discord mentions are disabled in all generated posts.

The Telegram owner chat is also the private monitoring endpoint. Use `/report` for the latest collection, delivery, and source-health summary. Successful scheduled FLA deliveries send a concise Telegram confirmation; delivery failures and severe source degradation send warning alerts. Apply `0003_reliability_monitoring.sql` before deploying this version.

## Delivery schedule

Cloudflare invokes a lightweight scheduler check once per hour. It uses `OWNER_TIMEZONE` to deliver Telegram at 8:00 AM and 7:00 PM local time, including across daylight-saving changes. When enabled, FLA receives its Discord startup radar during the morning window. Each audience is collected and ranked independently. `/brief` performs a fresh personal-source collection before composing a digest from the last 48 hours, while `/status` reports the most recent completed collection.

## Find your Telegram chat ID

Send a message to the bot, then temporarily inspect Telegram's `getUpdates` response before registering the webhook. Copy `message.chat.id`, store it as `TELEGRAM_OWNER_CHAT_ID`, and avoid retaining the response.

## Test

```bash
npm test
```

The tests run on Node's built-in test runner and do not call the network.

## Phase boundaries

Implemented: secure bot skeleton, health/status, reliable manual briefs, curated collection, batched persistence, Workers AI summarization with bounded deterministic fallback, automatic morning/evening delivery, and tests.

FLA foundation: Discord delivery, Louisiana-first sources, community-specific ranking and formatting, safe mention handling, retry behavior, and a protected test route.

Reliability foundation: delivery and chunk ledgers, stable scheduled-window keys, retry-safe partial delivery, collection correlation IDs, source-health history, and Telegram monitoring.

Deferred to Phase 2+: deadline extraction, event/calendar adapters, moderator approval queue, delivery ledger, feedback signals, and semantic clustering.
