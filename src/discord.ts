import type { Env } from './types.ts';
import { collectNews, composeDiscordDigest, loadTopStories } from './news/pipeline.ts';
import { withTimeout, workersAiSummarizer } from './news/summarize.ts';
import { correlationId, deliverOnce } from './reliability.ts';

async function postWebhook(env: Env, content: string): Promise<void> {
  if (!env.DISCORD_NEWS_WEBHOOK_URL) throw new Error('DISCORD_NEWS_WEBHOOK_URL is not configured');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(env.DISCORD_NEWS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, username: 'FLA Founder News', allowed_mentions: { parse: [] } })
    });
    if (response.ok) return;
    if (response.status === 429 && attempt < 2) {
      const retry: { retry_after?: number } = await response.json<{ retry_after?: number }>().catch(() => ({}));
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, Math.max(250, retry.retry_after ?? 1_000))));
      continue;
    }
    throw new Error(`Discord webhook failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
}

export async function sendFlaRoundup(env: Env, deliveryKey = `discord:fla:manual:${crypto.randomUUID()}`, runId = correlationId()) {
  const report = await collectNews(env, 'fla', runId);
  const limit = Math.min(10, Math.max(3, Number(env.FLA_MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadTopStories(env, limit, 48, 'fla');
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? withTimeout(workersAiSummarizer(env.AI), 8_000) : undefined;
  const messages = await composeDiscordDigest(stories, summarizer);
  const outcome = await deliverOnce(env, {
    key: deliveryKey, correlationId: runId, audience: 'fla', platform: 'discord', period: 'morning', stories, messages
  }, (message) => postWebhook(env, message));
  console.log(JSON.stringify({ event: 'fla_roundup_delivered', outcome, ...report, stories: stories.length }));
  return { report, outcome, stories: stories.length };
}
