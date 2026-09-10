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
- deterministic opportunity classification and source-grounded deadline, eligibility, location, format, and application-link extraction.

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
   - `npx wrangler secret put DISCORD_OPPORTUNITIES_WEBHOOK_URL`
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

For FLA, create incoming webhooks on `#founder-news` and `#opportunities`, stored as `DISCORD_NEWS_WEBHOOK_URL` and `DISCORD_OPPORTUNITIES_WEBHOOK_URL`, then set `FLA_NEWS_ENABLED` to `true`. General ecosystem stories route to the news channel. Recognized opportunities with supporting structured evidence route to the opportunities channel. Stories are not duplicated across channels. The protected `POST /discord/test` endpoint sends synthetic connection messages to both channels; append `?channel=news` or `?channel=opportunities` to test one. It does not collect or publish live news. Discord mentions are disabled in all generated posts.

The FLA registry currently contains 20 feeds: four Louisiana ecosystem sources plus founder, venture, product, accelerator, small-business, and technology reporting. Known dead Nexus Louisiana and SBA RSS URLs were removed. A feed that fails three consecutive collections is automatically quarantined for 24 hours before the collector probes it again.

The Telegram owner chat is also the private monitoring endpoint. Use `/report` for the latest collection, delivery, quarantine, and source-health summary. Successful scheduled FLA deliveries and empty opportunity windows send a concise Telegram report; delivery failures and severe source degradation send warning alerts. Apply all migrations before deploying this version.

FLA opportunity intelligence recognizes grants, accelerators, pitch competitions, founder programs, and events. It adds `CLOSING SOON`, `THIS MONTH`, `ROLLING`, and `NEW` labels; excludes opportunities with verified expired deadlines; and only publishes structured details supported by the feed content. Existing stored stories are enriched during their next collection. Apply `0004_opportunity_intelligence.sql` before deploying this version.

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

FLA foundation: Discord delivery, a tiered Louisiana/founder/opportunity source registry, community-specific ranking and formatting, safe mention handling, retry behavior, 24-hour quarantine after three consecutive source failures, and a protected synthetic webhook test.

Reliability foundation: delivery and chunk ledgers, stable scheduled-window keys, retry-safe partial delivery, collection correlation IDs, source-health history, and Telegram monitoring.

Opportunity foundation: deterministic classification, conservative deadline parsing, eligibility and participation details, direct application-link detection, urgency ranking, and expired-opportunity filtering.

Deferred to Phase 2+: event/calendar adapters, moderator approval queue, feedback signals, saved opportunities, and semantic clustering.
