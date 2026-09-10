ALTER TABLE collection_runs ADD COLUMN sources_quarantined INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_source_health_quarantine
  ON source_health(consecutive_failures DESC, last_failure_at DESC);
