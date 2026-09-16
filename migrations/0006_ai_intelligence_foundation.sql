CREATE TABLE IF NOT EXISTS ai_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  subject_id TEXT,
  prompt_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'fallback', 'failed')),
  output_json TEXT,
  validation_error TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  correlation_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(operation, input_hash, prompt_version, schema_version, model)
);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_subject_created
  ON ai_artifacts(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_operation_status_created
  ON ai_artifacts(operation, status, created_at DESC);
