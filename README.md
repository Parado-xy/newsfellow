# NewsFellow

NewsFellow is a private Telegram technology-news companion. This repository implements Phase 0 and Phase 1:

- secure Telegram webhook with an owner chat allowlist;
- `/start`, `/status`, and on-demand `/brief` commands;
- curated RSS/Atom collection;
- URL normalization, exact deduplication, transparent relevance scoring;
- Workers AI summaries using `@cf/meta/llama-3.2-1b-instruct`, with automatic zero-cost extractive fallback;
- Cloudflare D1 persistence, batched writes, and automatic morning/evening round-ups;
- offline unit tests with no paid API dependency.

## Architecture

`Cron → collect feeds → batch into D1 → compose → Telegram`

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
6. Deploy with `npm run deploy`.
7. Register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://newsfellow.<YOUR_SUBDOMAIN>.workers.dev/telegram/webhook","secret_token":"<WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

Do not commit `.dev.vars`, bot tokens, or chat IDs.

Workers AI is enabled through the `AI` binding in `wrangler.jsonc`; it does not require a separate model API key. Set `AI_SUMMARIZER_ENABLED` to `false` to force extractive-only mode.

## Delivery schedule

Cloudflare invokes a lightweight scheduler check once per hour. It uses `OWNER_TIMEZONE` to deliver at 8:00 AM and 7:00 PM local time, including across daylight-saving changes; collection only runs for those two delivery windows. Each delivery stores candidates through batched D1 operations and sends a round-up from the latest 14-hour window. `/brief` deliberately reads already-collected stories so Telegram webhook work stays within its execution window.

## Find your Telegram chat ID

Send a message to the bot, then temporarily inspect Telegram's `getUpdates` response before registering the webhook. Copy `message.chat.id`, store it as `TELEGRAM_OWNER_CHAT_ID`, and avoid retaining the response.

## Test

```bash
npm test
```

The tests run on Node's built-in test runner and do not call the network.

## Phase boundaries

Implemented: secure bot skeleton, health/status, reliable manual briefs, curated collection, batched persistence, Workers AI summarization with bounded deterministic fallback, automatic morning/evening delivery, and tests.

Deferred to Phase 2+: preferences and feedback buttons, saved stories, multi-user onboarding, delivery ledger, and semantic clustering.
