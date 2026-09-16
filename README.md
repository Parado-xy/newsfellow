# NewsFellow

NewsFellow is a channel-agnostic news engine with private Telegram and WhatsApp technology companions plus the Founders LA Discord startup radar.

- secure Telegram webhook with an owner chat allowlist;
- signed WhatsApp Cloud API webhooks with an owner-phone allowlist, duplicate-event protection, and delivery-status tracking;
- `/start`, `/status`, and on-demand `/brief` commands;
- curated RSS/Atom collection;
- URL normalization, exact deduplication, transparent relevance scoring;
- Workers AI summaries using `@cf/meta/llama-3.2-1b-instruct`, with automatic zero-cost extractive fallback;
- Cloudflare D1 persistence, batched writes, and automatic morning/evening round-ups;
- offline unit tests with no paid API dependency.
- versioned and schema-validated AI summaries with content-addressed D1 caching, artifact history, telemetry, and deterministic fallback;
- a Louisiana-first FLA source profile and Discord webhook delivery with rate-limit retries;
- audience-aware storage so personal technology stories do not leak into the community feed.
- delivery-window and per-message idempotency with a D1 delivery ledger;
- source-health history, bounded delivery retries, correlation IDs, and private Telegram operations reporting.
- deterministic opportunity classification and source-grounded deadline, eligibility, location, format, and application-link extraction.

## Architecture

NewsFellow is split into channel-neutral application services and channel adapters:

`Webhook → adapter normalization → command service → news service → adapter formatter/transport`

`Cron → audience collection → D1 → ranking → semantic digest → adapter formatter/transport`

- `src/news/` owns collection, normalization, ranking, summarization, and semantic brief preparation.
- `src/commands.ts` handles normalized commands and delegates authorization, formatting, and transport through injected channel contracts.
- `src/channels/` owns inbound webhook normalization, platform formatting, API transport, retries, and message-size constraints.
- `src/telegram.ts`, `src/discord.ts`, and `src/whatsapp.ts` are thin orchestration modules for routes, schedules, and webhook lifecycles.
- `src/reliability.ts` provides channel-neutral delivery idempotency, chunk recovery, and operational data.

The channel contracts expose normalized inbound commands, outbound transport receipts, webhook delivery-status events, and platform formatters. Telegram, Discord, and WhatsApp therefore share collection, ranking, summarization, brief generation, and command dispatch without leaking platform payloads into application services.

### WhatsApp Cloud API

The official Meta Cloud API integration exposes `GET` and `POST /whatsapp/webhook`. Subscription verification returns the exact `hub.challenge` only when the configured verify token matches. Event POSTs are verified against the raw request body using the `X-Hub-Signature-256` HMAC before JSON parsing. Messages for any other phone-number ID are ignored.

Text, list-reply, and button-reply events normalize into the same commands used by Telegram. WhatsApp accepts commands with or without a leading slash: `brief`, `weekly`, `preferences`, `more <topic>`, `less <topic>`, `status`, and `report`. Unsupported media and event types are safely ignored. Each Meta message ID is claimed in D1 before dispatch; duplicate deliveries do not repeat a command. Outbound message IDs and `sent`, `delivered`, `read`, and `failed` status webhooks are retained in `channel_messages` for operational diagnosis.

WhatsApp output uses its own markup, URL placement, and message-size limit. Cloud API sends retry boundedly on timeouts, rate limits, and server failures. One malformed or failed webhook event cannot prevent sibling events in the same payload from completing.

This release replies only to owner-initiated conversations. Scheduled proactive WhatsApp round-ups are deliberately disabled: enable them in a later change only after configuring explicit opt-in and an approved utility template for delivery outside Meta's customer-service window. Telegram morning/evening delivery and Discord morning delivery remain unchanged.

The primary summarizer is Cloudflare's hosted Llama 3.2 1B Instruct model, selected because it explicitly supports summarization and fits the free Workers AI allocation at personal usage. The `extractiveSummary` function remains a deterministic fallback when Workers AI is unavailable, over quota, disabled, or returns malformed output.

### AI intelligence foundation

AI inference is routed through `src/ai/` rather than called from channel or news-delivery code. Each operation has an explicit prompt version, output schema version, and configurable model. A SHA-256 hash of the bounded source input provides the cache identity. Successful results are reused only when the input, prompt, schema, and model all match.

The `ai_artifacts` ledger records output, validation state, fallback use, latency, token usage, model, versions, and an optional correlation ID. Invalid output, timeouts, provider errors, and artifact-ledger failures are isolated; digest delivery retains the deterministic extractive fallback. `/report` includes 24-hour inference success, fallback, latency, and token totals.

Set `AI_SUMMARY_MODEL` to change the summary model without changing code. Optionally set `AI_GATEWAY_ID` to route inference through Cloudflare AI Gateway with request logging, retries, gateway caching, cost analytics, and NewsFellow metadata. `AI_GATEWAY_CACHE_TTL_SECONDS` defaults to one day. The D1 artifact cache remains authoritative even when Gateway caching is disabled.

Prompt or schema changes must receive a new version identifier so old artifacts cannot be silently reused. `npm run test:eval` runs deterministic offline quality gates; these fixtures should grow alongside new prompts and AI operations.

### Semantic enrichment and clustering

Before ranking a delivery window, NewsFellow enriches a bounded candidate set with a typed event classification, topics, named entities, geographies, affected audiences, exact evidence excerpts, and relevance scores. Entities, geographies, and evidence must occur in the supplied source text; unsupported fields cause the entire model result to fall back to deterministic metadata. Enrichment is cached by story input and version, and failures never block a brief.

Workers AI embeddings and deterministic title/entity similarity group multiple reports about the same event. Embeddings alone cannot merge unrelated stories: semantic matches require a high vector threshold plus lexical or entity evidence, and conflicting event types are rejected. The highest-trust source becomes the canonical story, while the channel formatter notes multi-source coverage. D1 stores intelligence, embeddings, cluster membership, similarity, and match method so `/report` can expose semantic-index health. This D1 implementation fits the current bounded news volume and leaves a clean path to Vectorize when corpus size or query patterns justify it.

### Personalization and synthesis

Ranking is explicit and inspectable rather than delegated to an LLM. NewsFellow combines the original source score, preference match, significance/novelty, actionability, freshness, source trust, and a diversity adjustment. Every selected cluster creates a bounded 30-day ranking decision with its component scores and matched preferences. Delivered entries name the preference that influenced selection.

The private Telegram profile can be tuned with `/more <topic>` and `/less <topic>` and inspected with `/preferences`. Each adjustment updates a bounded preference weight and records a feedback signal. `/weekly` creates an on-demand seven-day synthesis. When a cluster contains multiple reports, a separate versioned synthesis prompt receives bounded excerpts from up to five sources; single-source stories retain the cheaper summary path. Provider, validation, or persistence failures continue to fall back without blocking delivery.

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
   - `npx wrangler secret put WHATSAPP_ACCESS_TOKEN`
   - `npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID`
   - `npx wrangler secret put WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - `npx wrangler secret put WHATSAPP_APP_SECRET`
   - `npx wrangler secret put WHATSAPP_OWNER_PHONE`
   - optionally configure `AI_GATEWAY_ID` as a Worker variable after creating an AI Gateway
6. Deploy with `npm run deploy`.
7. Register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://newsfellow.<YOUR_SUBDOMAIN>.workers.dev/telegram/webhook","secret_token":"<WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

Do not commit `.dev.vars`, bot tokens, or chat IDs.

For WhatsApp, add the WhatsApp product to a Meta app, provision a production business phone number, and use a system-user access token with the minimum required WhatsApp permissions. Enter `https://newsfellow.<YOUR_SUBDOMAIN>.workers.dev/whatsapp/webhook` as the callback URL, use the same random value stored in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, subscribe the app to the `messages` webhook field, and store the allowed owner number in international digits-only form. `WHATSAPP_APP_SECRET` is the Meta app secret used exclusively for webhook signature verification. `WHATSAPP_API_VERSION` defaults to `v24.0` and should be updated deliberately as part of Meta API-version maintenance.

Apply migration `0009_whatsapp_cloud_api.sql` before registering the webhook. It adds the inbound idempotency ledger and channel-message status history. Never log or commit access tokens, verify tokens, app secrets, complete webhook payloads, or message contents. Rotate a compromised value in Meta first, then replace the corresponding Worker secret.

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

The tests run on Node's built-in test runner and do not call the network. WhatsApp coverage includes payload normalization, phone-number filtering, HMAC verification, subscription verification, platform formatting, Cloud API request shape, message-ID receipts, and transient retry behavior.

## Phase boundaries

Implemented: secure bot skeleton, health/status, reliable manual briefs, curated collection, batched persistence, Workers AI summarization with bounded deterministic fallback, automatic morning/evening delivery, and tests.

FLA foundation: Discord delivery, a tiered Louisiana/founder/opportunity source registry, community-specific ranking and formatting, safe mention handling, retry behavior, 24-hour quarantine after three consecutive source failures, and a protected synthetic webhook test.

Reliability foundation: delivery and chunk ledgers, stable scheduled-window keys, retry-safe partial delivery, collection correlation IDs, source-health history, and Telegram monitoring.

Opportunity foundation: deterministic classification, conservative deadline parsing, eligibility and participation details, direct application-link detection, urgency ranking, and expired-opportunity filtering.

WhatsApp foundation: official Cloud API text transport, verified and idempotent inbound webhooks, owner authorization, delivery-status persistence, isolated event processing, and platform-specific formatting. Proactive template delivery remains deferred.

Deferred to Phase 2+: event/calendar adapters, moderator approval queue, saved opportunities, and proactive WhatsApp template delivery with opt-in management.
