ALTER TABLE collection_runs ADD COLUMN audience TEXT;
ALTER TABLE collection_runs ADD COLUMN correlation_id TEXT;
ALTER TABLE collection_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'running';
ALTER TABLE collection_runs ADD COLUMN error TEXT;

CREATE TABLE IF NOT EXISTS source_health (
  source_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_error TEXT,
  last_duration_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_successes INTEGER NOT NULL DEFAULT 0,
  total_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  platform TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  story_ids_json TEXT NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS delivery_chunks (
  delivery_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_id, chunk_index),
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status_created ON deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_health_failures ON source_health(consecutive_failures DESC);
