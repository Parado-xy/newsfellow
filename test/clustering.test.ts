import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterStories, cosineSimilarity, jaccard, storySimilarity } from '../src/news/clustering.ts';
import type { EnrichedStory } from '../src/ai/enrichment.ts';
import type { StoredStory, StoryIntelligence } from '../src/types.ts';

function enriched(id: string, title: string, sourceId: string, publisher: string, overrides: Partial<StoryIntelligence> = {}, embedding?: number[]): EnrichedStory {
  const story: StoredStory = {
    id, source_id: sourceId, title, canonical_url: `https://example.com/${id}`,
    excerpt: `${title} with detailed source reporting.`, publisher, published_at: `2026-09-16T1${id}:00:00Z`,
    fingerprint: id, topics_json: '["ai"]', score: 0.8, audiences_json: '["personal"]',
    opportunity_type: 'news', deadline_date: null, deadline_text: null, eligibility: null,
    opportunity_location: null, participation_mode: null, application_url: null,
    opportunity_confidence: 0, is_rolling: 0
  };
  return {
    story, embedding, enrichmentStatus: 'success',
    intelligence: {
      eventType: 'launch', topics: ['ai'], entities: ['OpenAI'], geographies: [], affectedAudiences: ['developers'],
      evidence: [], actionability: 0.5, novelty: 0.8, significance: 0.8, developerRelevance: 0.9,
      founderRelevance: 0.6, louisianaRelevance: 0.1, confidence: 0.9, ...overrides
    }
  };
}

test('calculates bounded lexical and vector similarity', () => {
  assert.equal(jaccard(new Set(['openai', 'model']), new Set(['openai', 'release'])), 1 / 3);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('clusters reports about the same event and selects the more trusted canonical source', () => {
  const official = enriched('1', 'OpenAI launches Atlas model for developers', 'openai', 'OpenAI');
  const coverage = enriched('2', 'OpenAI launches new Atlas model for developers', 'techcrunch', 'TechCrunch');
  const clusters = clusterStories([coverage, official]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].canonical.story.id, '1');
});

test('does not cluster event-type conflicts or unrelated stories on embeddings alone', () => {
  const launch = enriched('1', 'OpenAI launches Atlas model', 'openai', 'OpenAI', {}, [1, 0]);
  const policy = enriched('2', 'OpenAI faces new model regulation', 'ars', 'Ars', { eventType: 'policy' }, [1, 0]);
  const unrelated = enriched('3', 'Louisiana startup grant applications open', 'silicon-bayou', 'Silicon Bayou',
    { eventType: 'opportunity', entities: [] }, [1, 0]);
  assert.equal(storySimilarity(launch, policy).score, 0);
  assert.equal(clusterStories([launch, policy, unrelated]).length, 3);
});
