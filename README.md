# NewsFellow

NewsFellow is a private Telegram technology-news companion. This repository implements Phase 0 and Phase 1:

- secure Telegram webhook with an owner chat allowlist;
- `/start`, `/status`, and on-demand `/brief` commands;
- curated RSS/Atom collection;
- URL normalization, exact deduplication, transparent relevance scoring;
- Workers AI summaries using `@cf/meta/llama-3.2-1b-instruct`, with automatic zero-cost extractive fallback;
- Cloudflare D1 persistence and a scheduled collection trigger;
- offline unit tests with no paid API dependency.

## Architecture

`Cron or /brief → collect feeds → normalize → score/dedupe → D1 → compose → Telegram`

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

## Find your Telegram chat ID

Send a message to the bot, then temporarily inspect Telegram's `getUpdates` response before registering the webhook. Copy `message.chat.id`, store it as `TELEGRAM_OWNER_CHAT_ID`, and avoid retaining the response.

## Test

```bash
npm test
```

The tests run on Node's built-in test runner and do not call the network.

## Phase boundaries

Implemented: secure bot skeleton, health/status, manual brief, curated collection, persistence, Workers AI summarization with deterministic fallback, and tests.

Deferred to Phase 2+: automatic digest delivery, preferences and feedback buttons, saved stories, multi-user onboarding, delivery ledger, and semantic clustering.
