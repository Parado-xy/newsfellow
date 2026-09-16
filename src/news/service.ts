import type { ChannelFormatter, StatusContent } from '../channels/types.ts';
import type { DiscordRoute, Env, NewsAudience } from '../types.ts';
import { collectNews } from './pipeline.ts';
import { loadClusteredTopStories } from './clustering.ts';
import { prepareDigest } from './brief.ts';
import { instrumentedSummary } from '../ai/summary.ts';

function summarizer(env: Env) {
  return env.AI_SUMMARIZER_ENABLED === 'true' ? instrumentedSummary(env, 8_000) : undefined;
}

export async function buildBrief(env: Env, formatter: ChannelFormatter): Promise<string[]> {
  await collectNews(env, 'personal');
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadClusteredTopStories(env, limit, 48, 'personal');
  return formatter.digest(await prepareDigest(stories, summarizer(env)));
}

export async function buildWeeklyBrief(env: Env, formatter: ChannelFormatter): Promise<string[]> {
  await collectNews(env, 'personal');
  const limit = Math.min(12, Math.max(5, Number(env.WEEKLY_MAX_DIGEST_STORIES ?? 8)));
  const stories = await loadClusteredTopStories(env, limit, 168, 'personal', undefined, 'weekly');
  return formatter.digest(await prepareDigest(stories, summarizer(env), 'WEEKLY SYNTHESIS',
    'The strongest developments from the past seven days, consolidated across reporting.'));
}

export async function buildPersonalRoundup(env: Env, formatter: ChannelFormatter, period: 'morning' | 'evening', runId: string) {
  const report = await collectNews(env, 'personal', runId);
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadClusteredTopStories(env, limit, 14, 'personal', undefined, period);
  const heading = period === 'morning' ? 'MORNING ROUND-UP' : 'EVENING ROUND-UP';
  const messages = formatter.digest(await prepareDigest(stories, summarizer(env), heading));
  messages.push(formatter.collectionFooter(report.sourcesOk, report.inserted));
  return { report, stories, messages };
}

export async function buildFlaRoundup(env: Env, formatter: ChannelFormatter, route: DiscordRoute) {
  const limit = Math.min(10, Math.max(3, Number(env.FLA_MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadClusteredTopStories(env, limit, 48, 'fla', route, `fla:${route}`);
  const heading = route === 'opportunities' ? 'FOUNDER OPPORTUNITIES' : 'LOUISIANA STARTUP RADAR';
  const description = route === 'opportunities'
    ? 'Verified programs, funding, competitions, and events for Louisiana founders.'
    : 'Startup and ecosystem news for Louisiana builders.';
  return { stories, messages: formatter.digest(await prepareDigest(stories, summarizer(env), heading, description)) };
}

export async function loadStatus(env: Env): Promise<StatusContent> {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM stories').first<{ count: number }>();
  const lastCollection = await env.DB.prepare(`SELECT completed_at, sources_ok, sources_failed, sources_quarantined, inserted
    FROM collection_runs WHERE completed_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .first<{ completed_at: string; sources_ok: number; sources_failed: number; sources_quarantined: number; inserted: number }>();
  return {
    storedStories: count?.count ?? 0,
    lastCollection: lastCollection
      ? `${lastCollection.completed_at} (${lastCollection.sources_ok} sources OK, ${lastCollection.sources_failed} failed, ${lastCollection.sources_quarantined ?? 0} quarantined, ${lastCollection.inserted} new)`
      : 'No completed collection recorded',
    summarizationMode: env.AI_SUMMARIZER_ENABLED === 'true' ? 'Workers AI with extractive fallback' : 'extractive summaries',
    roundups: 'morning, evening, and weekly on demand'
  };
}

export interface RoundupDefinition {
  audience: NewsAudience;
  period: string;
}
