import type { DiscordRoute, Env, StoredStory } from './types.ts';
import { collectNews } from './news/pipeline.ts';
import { buildFlaRoundup } from './news/service.ts';
import { correlationId, deliverOnce } from './reliability.ts';
import { createDiscordTransport, discordFormatter } from './channels/discord.ts';

export async function testDiscordWebhook(env: Env, route: DiscordRoute): Promise<void> {
  const destination = route === 'opportunities' ? '#opportunities' : '#founder-news';
  await createDiscordTransport(env, route).send(route,
    `**NEWSFELLOW • CONNECTION TEST**\n\n✅ Delivery to ${destination} is configured correctly.\n\n*This is a synthetic test; no news story was published.*`);
}

export interface DiscordChannelResult {
  route: DiscordRoute;
  outcome: 'sent' | 'already_sent' | 'in_progress' | 'empty' | 'failed';
  stories: number;
  error?: string;
}

async function deliverChannel(env: Env, route: DiscordRoute, stories: StoredStory[], messages: string[], deliveryKey: string, runId: string): Promise<DiscordChannelResult> {
  if (!stories.length) return { route, outcome: 'empty', stories: 0 };
  const transport = createDiscordTransport(env, route);
  const outcome = await deliverOnce(env, {
    key: `${deliveryKey}:${route}`, correlationId: runId, audience: 'fla', platform: transport.id,
    period: `morning:${route}`, stories, messages
  }, (message) => transport.send(route, message));
  return { route, outcome, stories: stories.length };
}

export async function sendFlaRoundup(
  env: Env,
  deliveryKey = `discord:fla:manual:${crypto.randomUUID()}`,
  runId = correlationId(),
  onlyRoute?: DiscordRoute
) {
  const report = await collectNews(env, 'fla', runId);
  const routes: DiscordRoute[] = onlyRoute ? [onlyRoute] : ['news', 'opportunities'];
  const prepared = await Promise.all(routes.map(async (route) => ({ route, ...await buildFlaRoundup(env, discordFormatter, route) })));
  const settled = await Promise.allSettled(prepared.map(({ route, stories, messages }) =>
    deliverChannel(env, route, stories, messages, deliveryKey, runId)));
  const channels = settled.map((result, index): DiscordChannelResult => result.status === 'fulfilled'
    ? result.value
    : { route: prepared[index].route, outcome: 'failed', stories: prepared[index].stories.length, error: String(result.reason) });
  console.log(JSON.stringify({ event: 'fla_roundup_delivered', channels, ...report }));
  return { report, channels };
}
