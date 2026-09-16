import type { Env } from '../types.ts';
import { extractiveSummary, type Summarizer, type Summary } from '../news/summarize.ts';
import { hashInput, readCachedArtifact, writeArtifact } from './artifacts.ts';
import { modelFor } from './models.ts';
import { CLUSTER_SYNTHESIS_PROMPT, STORY_SUMMARY_PROMPT, clusterSynthesisUserPrompt, storySummaryUserPrompt } from './prompts.ts';
import { parseJsonObject, validateSummary } from './schema.ts';

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function usageFrom(result: unknown): TokenUsage {
  if (!result || typeof result !== 'object') return {};
  const usage = (result as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object') return {};
  const item = usage as Record<string, unknown>;
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    inputTokens: number(item.prompt_tokens ?? item.input_tokens),
    outputTokens: number(item.completion_tokens ?? item.output_tokens),
    totalTokens: number(item.total_tokens)
  };
}

function responseText(result: unknown): string {
  return result && typeof result === 'object' && 'response' in result
    ? String((result as { response?: unknown }).response ?? '')
    : '';
}

async function cacheRead(env: Env, key: Parameters<typeof readCachedArtifact>[1]): Promise<Summary | null> {
  try {
    const cached = await readCachedArtifact<unknown>(env, key);
    if (!cached) return null;
    const validated = validateSummary(cached);
    return validated.value ?? null;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'ai_artifact_cache_read_failed', operation: key.operation, error: String(error) }));
    return null;
  }
}

async function record(env: Env, artifact: Parameters<typeof writeArtifact>[1]): Promise<void> {
  try { await writeArtifact(env, artifact); }
  catch (error) {
    console.warn(JSON.stringify({ event: 'ai_artifact_write_failed', operation: artifact.operation, error: String(error) }));
  }
}

export function instrumentedSummary(env: Env, timeoutMs = 8_000): Summarizer {
  return async (title, excerpt, topics, context) => {
    const fallback = extractiveSummary(title, excerpt, topics);
    if (!excerpt.trim()) return fallback;

    const isCluster = (context?.clusterContext?.length ?? 0) > 1;
    const prompt = isCluster ? CLUSTER_SYNTHESIS_PROMPT : STORY_SUMMARY_PROMPT;
    const model = modelFor(env, prompt.operation);
    const boundedReports = context?.clusterContext?.slice(0, 5).map((report) => ({
      title: report.title, publisher: report.publisher, excerpt: report.excerpt.slice(0, 1200)
    }));
    const inputHash = await hashInput(isCluster ? { topics, reports: boundedReports } : { title, excerpt: excerpt.slice(0, 2400), topics });
    const key = {
      operation: prompt.operation,
      inputHash,
      promptVersion: prompt.version,
      schemaVersion: prompt.schemaVersion,
      model
    } as const;
    const cached = await cacheRead(env, key);
    if (cached) {
      console.log(JSON.stringify({ event: 'ai_artifact_cache_hit', operation: key.operation, model, inputHash }));
      return cached;
    }

    const started = Date.now();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort('ai_timeout'), timeoutMs);
    try {
      const gateway = env.AI_GATEWAY_ID?.trim() ? {
        id: env.AI_GATEWAY_ID.trim(), cacheKey: inputHash,
        cacheTtl: Math.max(60, Number(env.AI_GATEWAY_CACHE_TTL_SECONDS ?? 86_400)),
        metadata: { operation: key.operation, promptVersion: key.promptVersion, schemaVersion: key.schemaVersion },
        collectLog: true, requestTimeoutMs: timeoutMs,
        retries: { maxAttempts: 2 as const, retryDelayMs: 250, backoff: 'exponential' as const }
      } : undefined;
      const result = await env.AI.run(model, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: isCluster
            ? clusterSynthesisUserPrompt(topics, boundedReports ?? [])
            : storySummaryUserPrompt(title, excerpt, topics) }
        ],
        max_tokens: 260,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, { signal: abort.signal, tags: ['newsfellow', isCluster ? 'cluster-synthesis' : 'story-summary', key.promptVersion], gateway });
      const parsed = parseJsonObject(responseText(result));
      const validated = parsed.value === undefined ? { error: parsed.error } : validateSummary(parsed.value);
      const latencyMs = Date.now() - started;
      const usage = usageFrom(result);
      if (!validated.value) {
        await record(env, { ...key, subjectId: context?.subjectId, correlationId: context?.correlationId,
          status: 'fallback', output: fallback, validationError: validated.error, fallbackUsed: true, latencyMs, ...usage });
        console.warn(JSON.stringify({ event: 'ai_summary_fallback', reason: 'validation', model, latencyMs, error: validated.error }));
        return fallback;
      }
      await record(env, { ...key, subjectId: context?.subjectId, correlationId: context?.correlationId,
        status: 'success', output: validated.value, fallbackUsed: false, latencyMs, ...usage });
      console.log(JSON.stringify({ event: 'ai_inference_completed', operation: key.operation, model, latencyMs,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens }));
      return validated.value;
    } catch (error) {
      const latencyMs = Date.now() - started;
      await record(env, { ...key, subjectId: context?.subjectId, correlationId: context?.correlationId,
        status: 'fallback', output: fallback, validationError: String(error), fallbackUsed: true, latencyMs });
      console.warn(JSON.stringify({ event: 'ai_summary_fallback', reason: abort.signal.aborted ? 'timeout' : 'inference_error', model, latencyMs, error: String(error) }));
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  };
}
