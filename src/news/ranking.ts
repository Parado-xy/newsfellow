import { SOURCES } from '../config/sources.ts';
import type { Env, NewsAudience } from '../types.ts';
import type { StoryCluster } from './clustering.ts';
import { loadPreferences, type AudiencePreference } from './preferences.ts';

export interface RankingComponents {
  base: number;
  interest: number;
  significance: number;
  actionability: number;
  freshness: number;
  trust: number;
  diversityAdjustment: number;
  final: number;
  matchedPreferences: string[];
}

export interface RankedCluster {
  cluster: StoryCluster;
  ranking: RankingComponents;
}

const TRUST = new Map(SOURCES.map((source) => [source.id, source.trustWeight]));
const clamp = (value: number) => Math.min(1, Math.max(0, value));

function preferenceMatch(cluster: StoryCluster, preference: AudiencePreference): boolean {
  const intelligence = cluster.canonical.intelligence;
  const value = preference.value.toLowerCase();
  if (preference.signalType === 'event_type') return intelligence.eventType === value;
  if (preference.signalType === 'entity') return intelligence.entities.some((entity) => entity.toLowerCase() === value);
  return intelligence.topics.some((topic) => topic.toLowerCase() === value) ||
    JSON.parse(cluster.canonical.story.topics_json).some((topic: string) => topic.toLowerCase() === value);
}

export function scoreCluster(cluster: StoryCluster, preferences: AudiencePreference[], now = new Date()): RankingComponents {
  const story = cluster.canonical.story;
  const intelligence = cluster.canonical.intelligence;
  const matched = preferences.filter((preference) => preferenceMatch(cluster, preference));
  const preferenceWeight = matched.reduce((total, preference) => total + preference.weight, 0);
  const interest = clamp(0.45 + preferenceWeight * 0.25);
  const ageHours = Math.max(0, (now.getTime() - Date.parse(story.published_at)) / 3_600_000);
  const freshness = clamp(1 - ageHours / 168);
  const significance = clamp(intelligence.significance * 0.7 + intelligence.novelty * 0.3);
  const base = clamp(story.score / 2);
  const trust = clamp(TRUST.get(story.source_id ?? '') ?? 0.5);
  const final = base * 0.15 + interest * 0.30 + significance * 0.15 + intelligence.actionability * 0.15 +
    freshness * 0.15 + trust * 0.10;
  return {
    base, interest, significance, actionability: intelligence.actionability, freshness, trust,
    diversityAdjustment: 0, final,
    matchedPreferences: matched.map((preference) => `${preference.signalType}:${preference.value}:${preference.weight}`)
  };
}

function diversityKey(cluster: StoryCluster): string {
  return cluster.canonical.intelligence.topics[0] ?? cluster.canonical.intelligence.eventType;
}

export function rankClusters(clusters: StoryCluster[], preferences: AudiencePreference[], limit: number, now = new Date()): RankedCluster[] {
  const remaining = clusters.map((cluster) => ({ cluster, ranking: scoreCluster(cluster, preferences, now) }));
  const selected: RankedCluster[] = [];
  const seen = new Map<string, number>();
  while (remaining.length && selected.length < limit) {
    for (const item of remaining) {
      const repetitions = seen.get(diversityKey(item.cluster)) ?? 0;
      item.ranking.diversityAdjustment = -Math.min(0.24, repetitions * 0.12);
    }
    remaining.sort((left, right) =>
      (right.ranking.final + right.ranking.diversityAdjustment) - (left.ranking.final + left.ranking.diversityAdjustment) ||
      left.cluster.canonical.story.id.localeCompare(right.cluster.canonical.story.id));
    const next = remaining.shift()!;
    next.ranking.final = clamp(next.ranking.final + next.ranking.diversityAdjustment);
    selected.push(next);
    const key = diversityKey(next.cluster);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return selected;
}

async function persistDecisions(env: Env, audience: NewsAudience, context: string, ranked: RankedCluster[]): Promise<void> {
  if (!ranked.length) return;
  await env.DB.batch(ranked.map(({ cluster, ranking }) => env.DB.prepare(`INSERT INTO ranking_decisions
    (audience, story_id, cluster_id, ranking_context, base_score, interest_score, significance_score,
      actionability_score, freshness_score, trust_score, diversity_adjustment, final_score, explanation_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(audience, cluster.canonical.story.id, cluster.id, context, ranking.base, ranking.interest,
      ranking.significance, ranking.actionability, ranking.freshness, ranking.trust,
      ranking.diversityAdjustment, ranking.final, JSON.stringify({ matchedPreferences: ranking.matchedPreferences,
        primaryTopic: diversityKey(cluster), memberCount: cluster.members.length }))));
  await env.DB.prepare(`DELETE FROM ranking_decisions WHERE created_at < datetime('now', '-30 days')`).run();
}

export async function personalizedRank(
  env: Env,
  clusters: StoryCluster[],
  audience: NewsAudience,
  limit: number,
  context: string
): Promise<RankedCluster[]> {
  let preferences: AudiencePreference[] = [];
  try { preferences = await loadPreferences(env, audience); }
  catch (error) { console.warn(JSON.stringify({ event: 'preferences_load_failed', audience, error: String(error) })); }
  const ranked = rankClusters(clusters, preferences, limit);
  try { await persistDecisions(env, audience, context, ranked); }
  catch (error) { console.warn(JSON.stringify({ event: 'ranking_decisions_write_failed', audience, context, error: String(error) })); }
  console.log(JSON.stringify({ event: 'stories_ranked', audience, context, candidates: clusters.length,
    selected: ranked.length, preferences: preferences.length }));
  return ranked;
}
