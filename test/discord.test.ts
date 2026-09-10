import test from 'node:test';
import assert from 'node:assert/strict';
import { testDiscordWebhook } from '../src/discord.ts';
import type { Env } from '../src/types.ts';

test('synthetic opportunity test reaches the dedicated webhook without collecting news', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await testDiscordWebhook({
      DISCORD_NEWS_WEBHOOK_URL: 'https://discord.test/news',
      DISCORD_OPPORTUNITIES_WEBHOOK_URL: 'https://discord.test/opportunities'
    } as Env, 'opportunities');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://discord.test/opportunities');
  assert.match(String(requests[0].body.content), /CONNECTION TEST/);
  assert.match(String(requests[0].body.content), /no news story was published/i);
  assert.deepEqual(requests[0].body.allowed_mentions, { parse: [] });
});
