import test from 'node:test';
import assert from 'node:assert/strict';
import { rankClusters, scoreCluster } from '../src/news/ranking.ts';
import type { StoryCluster } from '../src/news/clustering.ts';
import type { EnrichedStory } from '../src/ai/enrichment.ts';
import type { StoredStory, StoryIntelligence } from '../src/types.ts';

function cluster(id: string, topic: string, score = 1): StoryCluster {
  const story: StoredStory = {
    id, source_id: 'openai', title: `${topic} development ${id}`, canonical_url: `https://example.com/${id}`,
    excerpt: 'A detailed report about a meaningful development.', publisher: 'Example', published_at: '2026-09-16T12:00:00Z',
    topics_json: JSON.stringify([topic]), score, audiences_json: '["personal"]', opportunity_type: 'news',
    deadline_date: null, deadline_text: null, eligibility: null, opportunity_location: null,
    participation_mode: null, application_url: null, opportunity_confidence: 0, is_rolling: 0
  };
  const intelligence: StoryIntelligence = {
    eventType: 'launch', topics: [topic], entities: [], geographies: [], affectedAudiences: [], evidence: [],
    actionability: 0.6, novelty: 0.7, significance: 0.7, developerRelevance: 0.8,
    founderRelevance: 0.4, louisianaRelevance: 0.1, confidence: 0.9
  };
  const enriched: EnrichedStory = { story, intelligence, enrichmentStatus: 'success' };
  return { id: `cluster:${id}`, canonical: enriched, members: [enriched], similarities: new Map() };
}

test('makes explicit preference matches visible in ranking components', () => {
  const preferred = scoreCluster(cluster('1', 'rust'), [
    { signalType: 'topic', value: 'rust', weight: 0.9, source: 'explicit' }
  ], new Date('2026-09-16T13:00:00Z'));
  const neutral = scoreCluster(cluster('2', 'cloud'), [
    { signalType: 'topic', value: 'rust', weight: 0.9, source: 'explicit' }
  ], new Date('2026-09-16T13:00:00Z'));
  assert.ok(preferred.interest > neutral.interest);
  assert.deepEqual(preferred.matchedPreferences, ['topic:rust:0.9']);
});

test('applies a diversity penalty when selecting repeated primary topics', () => {
  const ranked = rankClusters([cluster('1', 'ai'), cluster('2', 'ai'), cluster('3', 'rust')], [], 2,
    new Date('2026-09-16T13:00:00Z'));
  assert.equal(ranked[0].cluster.canonical.intelligence.topics[0], 'ai');
  assert.equal(ranked[1].cluster.canonical.intelligence.topics[0], 'rust');
  assert.ok(ranked[1].ranking.diversityAdjustment === 0);
});
