import { SOURCES } from '../config/sources.ts';
import type { DiscordRoute, Env, NewsAudience, StoredStory } from '../types.ts';
import { enrichStories, type EnrichedStory } from '../ai/enrichment.ts';
import { discordRoute, loadStoryCandidates } from './pipeline.ts';
import { personalizedRank } from './ranking.ts';

export interface StoryCluster {
  id: string;
  canonical: EnrichedStory;
  members: EnrichedStory[];
  similarities: Map<string, { score: number; method: string }>;
}

const STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'the', 'to', 'with']);
const TRUST = new Map(SOURCES.map((source) => [source.id, source.trustWeight]));

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

export function cosineSimilarity(left?: number[], right?: number[]): number {
  if (!left?.length || !right?.length || left.length !== right.length) return 0;
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index]; leftMagnitude += left[index] ** 2; rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
}

export function storySimilarity(left: EnrichedStory, right: EnrichedStory): { score: number; method: string } {
  if (left.intelligence.eventType !== 'other' && right.intelligence.eventType !== 'other' &&
      left.intelligence.eventType !== right.intelligence.eventType) return { score: 0, method: 'event_type_mismatch' };
  const title = jaccard(tokens(left.story.title), tokens(right.story.title));
  const entities = jaccard(new Set(left.intelligence.entities.map((entity) => entity.toLowerCase())),
    new Set(right.intelligence.entities.map((entity) => entity.toLowerCase())));
  const embedding = cosineSimilarity(left.embedding, right.embedding);
  const embeddingMatch = embedding >= 0.88 && (title >= 0.18 || entities > 0) ? embedding : 0;
  const score = Math.max(title, embeddingMatch, title * 0.72 + entities * 0.28);
  const method = title >= embeddingMatch ? (entities > 0 ? 'title_entities' : 'title') : 'embedding';
  return { score, method };
}

function canonical(members: EnrichedStory[]): EnrichedStory {
  return [...members].sort((left, right) => {
    const trust = (TRUST.get(right.story.source_id ?? '') ?? 0) - (TRUST.get(left.story.source_id ?? '') ?? 0);
    if (trust) return trust;
    const confidence = right.intelligence.confidence - left.intelligence.confidence;
    if (confidence) return confidence;
    const detail = right.story.excerpt.length - left.story.excerpt.length;
    if (detail) return detail;
    return left.story.id.localeCompare(right.story.id);
  })[0];
}

export function clusterStories(stories: EnrichedStory[], threshold = 0.68): StoryCluster[] {
  const clusters: StoryCluster[] = [];
  for (const story of [...stories].sort((a, b) => a.story.published_at.localeCompare(b.story.published_at) || a.story.id.localeCompare(b.story.id))) {
    let best: { cluster: StoryCluster; similarity: { score: number; method: string } } | undefined;
    for (const cluster of clusters) {
      const similarity = storySimilarity(story, cluster.canonical);
      if (similarity.score >= threshold && (!best || similarity.score > best.similarity.score)) best = { cluster, similarity };
    }
    if (!best) {
      clusters.push({ id: `cluster:${story.story.id}`, canonical: story, members: [story],
        similarities: new Map([[story.story.id, { score: 1, method: 'canonical' }]]) });
      continue;
    }
    best.cluster.members.push(story);
    best.cluster.similarities.set(story.story.id, best.similarity);
    best.cluster.canonical = canonical(best.cluster.members);
    best.cluster.similarities.set(best.cluster.canonical.story.id, { score: 1, method: 'canonical' });
    best.cluster.id = `cluster:${best.cluster.canonical.story.id}`;
  }
  return clusters;
}

async function persistClusters(env: Env, clusters: StoryCluster[]): Promise<void> {
  if (!clusters.length) return;
  const storyIds = clusters.flatMap((cluster) => cluster.members.map((member) => member.story.id));
  for (let index = 0; index < storyIds.length; index += 50) {
    const slice = storyIds.slice(index, index + 50);
    await env.DB.prepare(`DELETE FROM story_cluster_members WHERE story_id IN (${slice.map(() => '?').join(',')})`).bind(...slice).run();
  }
  for (const cluster of clusters) {
    const dates = cluster.members.map((member) => member.story.published_at).sort();
    await env.DB.prepare(`INSERT INTO story_clusters
      (id, canonical_story_id, label, source_count, earliest_published_at, latest_published_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET canonical_story_id = excluded.canonical_story_id,
      label = excluded.label, source_count = excluded.source_count, earliest_published_at = excluded.earliest_published_at,
      latest_published_at = excluded.latest_published_at, updated_at = CURRENT_TIMESTAMP`)
      .bind(cluster.id, cluster.canonical.story.id, cluster.canonical.story.title,
        new Set(cluster.members.map((member) => member.story.publisher)).size, dates[0], dates.at(-1)).run();
    await env.DB.batch(cluster.members.map((member) => {
      const similarity = cluster.similarities.get(member.story.id) ?? { score: 1, method: 'canonical' };
      return env.DB.prepare(`INSERT OR REPLACE INTO story_cluster_members
        (cluster_id, story_id, similarity, match_method) VALUES (?, ?, ?, ?)`)
        .bind(cluster.id, member.story.id, similarity.score, similarity.method);
    }));
  }
  await env.DB.prepare('DELETE FROM story_clusters WHERE id NOT IN (SELECT DISTINCT cluster_id FROM story_cluster_members)').run();
}

export async function loadClusteredTopStories(
  env: Env,
  limit: number,
  windowHours: number,
  audience: NewsAudience,
  route?: DiscordRoute,
  rankingContext = 'brief'
): Promise<StoredStory[]> {
  const candidates = (await loadStoryCandidates(env, Math.max(12, limit * 3), windowHours, audience))
    .filter((story) => !route || discordRoute(story) === route);
  const enriched = await enrichStories(env, candidates);
  const clusters = clusterStories(enriched);
  try { await persistClusters(env, clusters); }
  catch (error) { console.warn(JSON.stringify({ event: 'story_cluster_write_failed', audience, route, error: String(error) })); }
  const ranked = await personalizedRank(env, clusters, audience, limit, rankingContext);
  return ranked.map(({ cluster, ranking }) => ({
      ...cluster.canonical.story,
      cluster_id: cluster.id,
      cluster_source_count: new Set(cluster.members.map((member) => member.story.publisher)).size,
      cluster_match_method: cluster.members.length > 1 ? 'semantic' : 'single',
      ranking_explanation: ranking.matchedPreferences,
      cluster_context: cluster.members.slice(0, 5).map((member) => ({ title: member.story.title,
        publisher: member.story.publisher, excerpt: member.story.excerpt.slice(0, 1200), url: member.story.canonical_url }))
    }));
}
