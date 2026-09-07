CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL,
  published_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stories_published_score ON stories(published_at DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_stories_fingerprint ON stories(fingerprint);

CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  sources_ok INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,
  candidates INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0
);
