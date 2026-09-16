import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTelegramUpdate, telegramFormatter } from '../src/channels/telegram.ts';
import { createDiscordTransport } from '../src/channels/discord.ts';
import type { Env } from '../src/types.ts';

test('normalizes Telegram commands without leaking Telegram payloads into command handling', () => {
  assert.deepEqual(parseTelegramUpdate({
    update_id: 42,
    message: { message_id: 7, chat: { id: 123 }, text: '/brief@NewsFellowBot now' }
  }), {
    channel: 'telegram', destination: '123', sender: '123', command: 'brief',
    rawCommand: '/brief', eventId: '42'
  });
  assert.equal(parseTelegramUpdate({ update_id: 43 }), null);
});

test('keeps Telegram-specific status and operations markup in the formatter', () => {
  const status = telegramFormatter.status({
    storedStories: 12, lastCollection: 'today', summarizationMode: 'extractive summaries', roundups: 'morning and evening'
  });
  assert.match(status, /<b>NewsFellow status<\/b>/);
  assert.match(status, /Stored stories: 12/);
  const operations = telegramFormatter.operations({
    collection: 'success', delivery: 'sent', failedDeliveries24h: 0,
    unhealthySources: [{ name: 'A <feed>', failures: 2 }], aiHealth: '4/5 successful',
    semanticHealth: '10 enriched • 8 embedded • 6 clusters'
  });
  assert.match(operations, /A &lt;feed&gt;/);
});

test('Discord transport retries rate limits and preserves safe webhook payloads', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  let attempt = 0;
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    attempt++;
    return attempt === 1
      ? Response.json({ retry_after: 1 }, { status: 429 })
      : new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await createDiscordTransport({ DISCORD_NEWS_WEBHOOK_URL: 'https://discord.test/news' } as Env, 'news')
      .send('news', 'hello');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(attempt, 2);
  assert.deepEqual(bodies[1].allowed_mentions, { parse: [] });
});
