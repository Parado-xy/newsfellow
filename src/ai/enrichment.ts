import type { Env, StoredStory, StoryIntelligence } from '../types.ts';
import { hashInput, readCachedArtifact, writeArtifact } from './artifacts.ts';
import { modelFor } from './models.ts';
import { STORY_ENRICHMENT_PROMPT, storyEnrichmentUserPrompt } from './prompts.ts';
import { parseJsonObject, validateStoryIntelligence } from './schema.ts';

export interface EnrichedStory {
  story: StoredStory;
  intelligence: StoryIntelligence;
  embedding?: number[];
  enrichmentStatus: 'success' | 'fallback';
}

interface IntelligenceRow {
  input_hash: string;
  prompt_version: string;
  schema_version: string;
  model: string;
  enrichment_status: 'success' | 'fallback';
  event_type: StoryIntelligence['eventType'];
  topics_json: string;
  entities_json: string;
  geographies_json: string;
  affected_audiences_json: string;
  evidence_json: string;
  actionability: number;
  novelty: number;
  significance: number;
  developer_relevance: number;
  founder_relevance: number;
  louisiana_relevance: number;
  confidence: number;
  embedding_json: string | null;
  embedding_model: string | null;
}

function sourceText(story: StoredStory): string {
  return `${story.title}\n${story.publisher}\n${story.excerpt}`;
}

function fallbackIntelligence(story: StoredStory): StoryIntelligence {
  const topics = JSON.parse(story.topics_json) as string[];
  const text = sourceText(story);
  const eventType = story.opportunity_type && story.opportunity_type !== 'news'
    ? 'opportunity'
    : /security|vulnerab|breach|attack/i.test(text) ? 'security'
    : /launch|release|introduc|announce/i.test(text) ? 'launch'
    : /funding|raised|investment|grant/i.test(text) ? 'funding'
    : /research|study|paper|survey/i.test(text) ? 'research'
    : 'other';
  return {
    eventType,
    topics,
    entities: [],
    geographies: /louisiana/i.test(text) ? ['Louisiana'] : [],
    affectedAudiences: [],
    evidence: [],
    actionability: story.opportunity_type && story.opportunity_type !== 'news' ? 0.8 : 0.3,
    novelty: 0.5,
    significance: Math.min(1, Math.max(0, story.score / 2)),
    developerRelevance: topics.some((topic) => ['rust', 'systems', 'cloud', 'developer-infrastructure', 'cybersecurity'].includes(topic)) ? 0.75 : 0.25,
    founderRelevance: topics.some((topic) => ['startups', 'venture', 'funding', 'louisiana'].includes(topic)) ? 0.75 : 0.25,
    louisianaRelevance: topics.includes('louisiana') ? 0.9 : 0.1,
    confidence: 0.35
  };
}

function fromRow(row: IntelligenceRow): StoryIntelligence {
  return {
    eventType: row.event_type,
    topics: JSON.parse(row.topics_json) as string[],
    entities: JSON.parse(row.entities_json) as string[],
    geographies: JSON.parse(row.geographies_json) as string[],
    affectedAudiences: JSON.parse(row.affected_audiences_json) as string[],
    evidence: JSON.parse(row.evidence_json) as string[],
    actionability: row.actionability,
    novelty: row.novelty,
    significance: row.significance,
    developerRelevance: row.developer_relevance,
    founderRelevance: row.founder_relevance,
    louisianaRelevance: row.louisiana_relevance,
    confidence: row.confidence
  };
}

function responseText(result: unknown): string {
  return result && typeof result === 'object' && 'response' in result
    ? String((result as { response?: unknown }).response ?? '') : '';
}

function tokenUsage(result: unknown) {
  const usage = result && typeof result === 'object' ? (result as Record<string, unknown>).usage : undefined;
  const item = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    inputTokens: number(item.prompt_tokens ?? item.input_tokens),
    outputTokens: number(item.completion_tokens ?? item.output_tokens),
    totalTokens: number(item.total_tokens)
  };
}

function gateway(env: Env, inputHash: string, operation: string, timeoutMs: number) {
  return env.AI_GATEWAY_ID?.trim() ? {
    id: env.AI_GATEWAY_ID.trim(), cacheKey: `${operation}:${inputHash}`,
    cacheTtl: Math.max(60, Number(env.AI_GATEWAY_CACHE_TTL_SECONDS ?? 86_400)),
    metadata: { operation }, collectLog: true, requestTimeoutMs: timeoutMs,
    retries: { maxAttempts: 2 as const, retryDelayMs: 250, backoff: 'exponential' as const }
  } : undefined;
}

async function recordArtifact(env: Env, artifact: Parameters<typeof writeArtifact>[1]): Promise<void> {
  try { await writeArtifact(env, artifact); }
  catch (error) {
    console.warn(JSON.stringify({ event: 'ai_artifact_write_failed', operation: artifact.operation,
      subjectId: artifact.subjectId, error: String(error) }));
  }
}

async function generateIntelligence(env: Env, story: StoredStory, inputHash: string, timeoutMs: number): Promise<{ intelligence: StoryIntelligence; status: 'success' | 'fallback' }> {
  const model = modelFor(env, 'story_enrichment');
  const key = { operation: STORY_ENRICHMENT_PROMPT.operation, inputHash, promptVersion: STORY_ENRICHMENT_PROMPT.version,
    schemaVersion: STORY_ENRICHMENT_PROMPT.schemaVersion, model } as const;
  const fallback = fallbackIntelligence(story);
  try {
    const cached = await readCachedArtifact<unknown>(env, key);
    if (cached) {
      const validation = validateStoryIntelligence(cached, sourceText(story));
      if (validation.value) {
        console.log(JSON.stringify({ event: 'ai_artifact_cache_hit', operation: key.operation, storyId: story.id, inputHash }));
        return { intelligence: validation.value, status: 'success' };
      }
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: 'ai_artifact_cache_read_failed', operation: key.operation, storyId: story.id, error: String(error) }));
  }
  if (env.AI_ENRICHMENT_ENABLED === 'false') return { intelligence: fallback, status: 'fallback' };

  const started = Date.now();
  try {
    const result = await env.AI.run(model, {
      messages: [
        { role: 'system', content: STORY_ENRICHMENT_PROMPT.system },
        { role: 'user', content: storyEnrichmentUserPrompt(story.title, story.publisher, story.excerpt, JSON.parse(story.topics_json) as string[]) }
      ],
      max_tokens: 650, temperature: 0.1, response_format: { type: 'json_object' }
    }, { signal: AbortSignal.timeout(timeoutMs), tags: ['newsfellow', 'story-enrichment', STORY_ENRICHMENT_PROMPT.version],
      gateway: gateway(env, inputHash, key.operation, timeoutMs) });
    const parsed = parseJsonObject(responseText(result));
    const validation = parsed.value === undefined ? { error: parsed.error } : validateStoryIntelligence(parsed.value, sourceText(story));
    const latencyMs = Date.now() - started;
    if (!validation.value) {
      await recordArtifact(env, { ...key, subjectId: story.id, status: 'fallback', output: fallback,
        validationError: validation.error, fallbackUsed: true, latencyMs, ...tokenUsage(result) });
      console.warn(JSON.stringify({ event: 'ai_enrichment_fallback', reason: 'validation', storyId: story.id, error: validation.error }));
      return { intelligence: fallback, status: 'fallback' };
    }
    await recordArtifact(env, { ...key, subjectId: story.id, status: 'success', output: validation.value,
      fallbackUsed: false, latencyMs, ...tokenUsage(result) });
    console.log(JSON.stringify({ event: 'ai_enrichment_completed', storyId: story.id, model, latencyMs }));
    return { intelligence: validation.value, status: 'success' };
  } catch (error) {
    const latencyMs = Date.now() - started;
    await recordArtifact(env, { ...key, subjectId: story.id, status: 'fallback', output: fallback,
      validationError: String(error), fallbackUsed: true, latencyMs });
    console.warn(JSON.stringify({ event: 'ai_enrichment_fallback', reason: 'inference_error', storyId: story.id, error: String(error) }));
    return { intelligence: fallback, status: 'fallback' };
  }
}

async function generateEmbedding(env: Env, story: StoredStory, inputHash: string, timeoutMs: number): Promise<number[] | undefined> {
  if (env.AI_ENRICHMENT_ENABLED === 'false') return undefined;
  const model = modelFor(env, 'story_embedding');
  const started = Date.now();
  try {
    const result = await env.AI.run(model, { text: [`${story.title}\n${story.excerpt.slice(0, 1200)}`] },
      { signal: AbortSignal.timeout(timeoutMs), tags: ['newsfellow', 'story-embedding'], gateway: gateway(env, inputHash, 'story_embedding', timeoutMs) });
    const data = result && typeof result === 'object' ? (result as Record<string, unknown>).data : undefined;
    const vector = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : undefined;
    const embedding = vector?.every((value) => typeof value === 'number' && Number.isFinite(value)) ? vector as number[] : undefined;
    if (embedding) console.log(JSON.stringify({ event: 'ai_embedding_completed', storyId: story.id, model,
      dimensions: embedding.length, latencyMs: Date.now() - started }));
    else console.warn(JSON.stringify({ event: 'ai_embedding_failed', storyId: story.id, model, reason: 'invalid_output' }));
    return embedding;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'ai_embedding_failed', storyId: story.id, model, error: String(error) }));
    return undefined;
  }
}

async function persist(env: Env, story: StoredStory, inputHash: string, enriched: Omit<EnrichedStory, 'story'>): Promise<void> {
  const item = enriched.intelligence;
  await env.DB.prepare(`INSERT INTO story_intelligence
    (story_id, input_hash, prompt_version, schema_version, model, enrichment_status, event_type, topics_json,
      entities_json, geographies_json, affected_audiences_json, evidence_json, actionability, novelty, significance,
      developer_relevance, founder_relevance, louisiana_relevance, confidence, embedding_json, embedding_model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(story_id) DO UPDATE SET input_hash = excluded.input_hash, prompt_version = excluded.prompt_version,
      schema_version = excluded.schema_version, model = excluded.model, enrichment_status = excluded.enrichment_status,
      event_type = excluded.event_type, topics_json = excluded.topics_json, entities_json = excluded.entities_json,
      geographies_json = excluded.geographies_json, affected_audiences_json = excluded.affected_audiences_json,
      evidence_json = excluded.evidence_json, actionability = excluded.actionability, novelty = excluded.novelty,
      significance = excluded.significance, developer_relevance = excluded.developer_relevance,
      founder_relevance = excluded.founder_relevance, louisiana_relevance = excluded.louisiana_relevance,
      confidence = excluded.confidence, embedding_json = COALESCE(excluded.embedding_json, story_intelligence.embedding_json),
      embedding_model = COALESCE(excluded.embedding_model, story_intelligence.embedding_model), updated_at = CURRENT_TIMESTAMP`)
    .bind(story.id, inputHash, STORY_ENRICHMENT_PROMPT.version, STORY_ENRICHMENT_PROMPT.schemaVersion,
      modelFor(env, 'story_enrichment'), enriched.enrichmentStatus, item.eventType, JSON.stringify(item.topics),
      JSON.stringify(item.entities), JSON.stringify(item.geographies), JSON.stringify(item.affectedAudiences),
      JSON.stringify(item.evidence), item.actionability, item.novelty, item.significance, item.developerRelevance,
      item.founderRelevance, item.louisianaRelevance, item.confidence,
      enriched.embedding ? JSON.stringify(enriched.embedding) : null,
      enriched.embedding ? modelFor(env, 'story_embedding') : null).run();
}

export async function enrichStory(env: Env, story: StoredStory, timeoutMs = 8_000): Promise<EnrichedStory> {
  const inputHash = await hashInput({ title: story.title, publisher: story.publisher, excerpt: story.excerpt.slice(0, 2400), topics: story.topics_json });
  const enrichmentModel = modelFor(env, 'story_enrichment');
  const embeddingModel = modelFor(env, 'story_embedding');
  try {
    const row = await env.DB.prepare('SELECT * FROM story_intelligence WHERE story_id = ?').bind(story.id).first<IntelligenceRow>();
    if (row?.enrichment_status === 'success' && row.input_hash === inputHash && row.prompt_version === STORY_ENRICHMENT_PROMPT.version &&
      row.schema_version === STORY_ENRICHMENT_PROMPT.schemaVersion && row.model === enrichmentModel) {
      return { story, intelligence: fromRow(row), embedding: row.embedding_model === embeddingModel && row.embedding_json ? JSON.parse(row.embedding_json) as number[] : undefined, enrichmentStatus: 'success' };
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: 'story_intelligence_cache_read_failed', storyId: story.id, error: String(error) }));
  }
  const [generated, embedding] = await Promise.all([
    generateIntelligence(env, story, inputHash, timeoutMs),
    generateEmbedding(env, story, inputHash, timeoutMs)
  ]);
  const enriched = { story, intelligence: generated.intelligence, embedding, enrichmentStatus: generated.status };
  try { await persist(env, story, inputHash, enriched); }
  catch (error) { console.warn(JSON.stringify({ event: 'story_intelligence_write_failed', storyId: story.id, error: String(error) })); }
  return enriched;
}

export async function enrichStories(env: Env, stories: StoredStory[], concurrency = 4): Promise<EnrichedStory[]> {
  const results: EnrichedStory[] = [];
  for (let index = 0; index < stories.length; index += concurrency) {
    results.push(...await Promise.all(stories.slice(index, index + concurrency).map((story) => enrichStory(env, story))));
  }
  return results;
}
