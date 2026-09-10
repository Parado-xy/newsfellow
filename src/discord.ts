import type { DiscordRoute, Env, StoredStory } from './types.ts';
import { collectNews, composeDiscordDigest, loadTopStories } from './news/pipeline.ts';
import { withTimeout, workersAiSummarizer } from './news/summarize.ts';
import { correlationId, deliverOnce } from './reliability.ts';

async function postWebhook(env: Env, route: DiscordRoute, content: string): Promise<void> {
  const webhookUrl = route === 'opportunities' ? env.DISCORD_OPPORTUNITIES_WEBHOOK_URL : env.DISCORD_NEWS_WEBHOOK_URL;
  if (!webhookUrl) throw new Error(`DISCORD_${route === 'opportunities' ? 'OPPORTUNITIES' : 'NEWS'}_WEBHOOK_URL is not configured`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, username: route === 'opportunities' ? 'FLA Opportunities' : 'FLA Founder News', allowed_mentions: { parse: [] } })
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

export interface DiscordChannelResult {
  route: DiscordRoute;
  outcome: 'sent' | 'already_sent' | 'in_progress' | 'empty' | 'failed';
  stories: number;
  error?: string;
}

async function deliverChannel(env: Env, route: DiscordRoute, stories: StoredStory[], deliveryKey: string, runId: string): Promise<DiscordChannelResult> {
  if (!stories.length) return { route, outcome: 'empty', stories: 0 };
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? withTimeout(workersAiSummarizer(env.AI), 8_000) : undefined;
  const messages = await composeDiscordDigest(
    stories,
    summarizer,
    route === 'opportunities' ? 'FOUNDER OPPORTUNITIES' : 'LOUISIANA STARTUP RADAR',
    route === 'opportunities'
      ? 'Verified programs, funding, competitions, and events for Louisiana founders.'
      : 'Startup and ecosystem news for Louisiana builders.'
  );
  const outcome = await deliverOnce(env, {
    key: `${deliveryKey}:${route}`, correlationId: runId, audience: 'fla', platform: 'discord', period: `morning:${route}`, stories, messages
  }, (message) => postWebhook(env, route, message));
  return { route, outcome, stories: stories.length };
}

export async function sendFlaRoundup(
  env: Env,
  deliveryKey = `discord:fla:manual:${crypto.randomUUID()}`,
  runId = correlationId(),
  onlyRoute?: DiscordRoute
) {
  const report = await collectNews(env, 'fla', runId);
  const limit = Math.min(10, Math.max(3, Number(env.FLA_MAX_DIGEST_STORIES ?? 6)));
  const routes: DiscordRoute[] = onlyRoute ? [onlyRoute] : ['news', 'opportunities'];
  const channelStories = await Promise.all(routes.map(async (route) => ({
    route,
    stories: await loadTopStories(env, limit, 48, 'fla', route)
  })));
  const settled = await Promise.allSettled(channelStories.map(({ route, stories }) => deliverChannel(env, route, stories, deliveryKey, runId)));
  const channels = settled.map((result, index): DiscordChannelResult => result.status === 'fulfilled'
    ? result.value
    : { route: channelStories[index].route, outcome: 'failed', stories: channelStories[index].stories.length, error: String(result.reason) });
  console.log(JSON.stringify({ event: 'fla_roundup_delivered', channels, ...report }));
  return { report, channels };
}
