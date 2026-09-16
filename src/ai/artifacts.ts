import type { AiOperation } from './models.ts';
import type { Env } from '../types.ts';

export interface AiArtifactKey {
  operation: AiOperation;
  inputHash: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
}

export interface AiArtifactWrite extends AiArtifactKey {
  subjectId?: string;
  status: 'success' | 'fallback' | 'failed';
  output?: unknown;
  validationError?: string;
  fallbackUsed: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  correlationId?: string;
}

export async function hashInput(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readCachedArtifact<T>(env: Env, key: AiArtifactKey): Promise<T | null> {
  const row = await env.DB.prepare(`SELECT output_json FROM ai_artifacts
    WHERE operation = ? AND input_hash = ? AND prompt_version = ? AND schema_version = ? AND model = ?
      AND status = 'success' AND output_json IS NOT NULL LIMIT 1`)
    .bind(key.operation, key.inputHash, key.promptVersion, key.schemaVersion, key.model)
    .first<{ output_json: string }>();
  if (!row) return null;
  try { return JSON.parse(row.output_json) as T; }
  catch { return null; }
}

export async function writeArtifact(env: Env, artifact: AiArtifactWrite): Promise<void> {
  await env.DB.prepare(`INSERT INTO ai_artifacts
    (operation, input_hash, subject_id, prompt_version, schema_version, model, status, output_json,
      validation_error, fallback_used, latency_ms, input_tokens, output_tokens, total_tokens, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operation, input_hash, prompt_version, schema_version, model) DO UPDATE SET
      subject_id = COALESCE(excluded.subject_id, ai_artifacts.subject_id), status = excluded.status,
      output_json = excluded.output_json, validation_error = excluded.validation_error,
      fallback_used = excluded.fallback_used, latency_ms = excluded.latency_ms,
      input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
      total_tokens = excluded.total_tokens, correlation_id = excluded.correlation_id,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(artifact.operation, artifact.inputHash, artifact.subjectId ?? null, artifact.promptVersion,
      artifact.schemaVersion, artifact.model, artifact.status,
      artifact.output === undefined ? null : JSON.stringify(artifact.output), artifact.validationError ?? null,
      artifact.fallbackUsed ? 1 : 0, artifact.latencyMs, artifact.inputTokens ?? null,
      artifact.outputTokens ?? null, artifact.totalTokens ?? null, artifact.correlationId ?? null).run();
}
