import type { Env } from '../types.ts';

export type AiOperation = 'story_summary' | 'cluster_synthesis' | 'story_enrichment' | 'story_embedding';

const DEFAULT_MODELS: Record<AiOperation, string> = {
  story_summary: '@cf/meta/llama-3.2-1b-instruct',
  cluster_synthesis: '@cf/meta/llama-3.2-3b-instruct',
  story_enrichment: '@cf/meta/llama-3.2-3b-instruct',
  story_embedding: '@cf/baai/bge-small-en-v1.5'
};

export function modelFor(env: Env, operation: AiOperation): string {
  if (operation === 'story_summary' && env.AI_SUMMARY_MODEL?.trim()) return env.AI_SUMMARY_MODEL.trim();
  if (operation === 'cluster_synthesis') return env.AI_SYNTHESIS_MODEL?.trim() || env.AI_SUMMARY_MODEL?.trim() || DEFAULT_MODELS.cluster_synthesis;
  if (operation === 'story_enrichment' && env.AI_ENRICHMENT_MODEL?.trim()) return env.AI_ENRICHMENT_MODEL.trim();
  if (operation === 'story_embedding' && env.AI_EMBEDDING_MODEL?.trim()) return env.AI_EMBEDDING_MODEL.trim();
  return DEFAULT_MODELS[operation];
}
