CREATE TABLE IF NOT EXISTS story_intelligence (
  story_id TEXT PRIMARY KEY,
  input_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  model TEXT NOT NULL,
  enrichment_status TEXT NOT NULL CHECK (enrichment_status IN ('success', 'fallback')),
  event_type TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  entities_json TEXT NOT NULL DEFAULT '[]',
  geographies_json TEXT NOT NULL DEFAULT '[]',
  affected_audiences_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  actionability REAL NOT NULL DEFAULT 0,
  novelty REAL NOT NULL DEFAULT 0,
  significance REAL NOT NULL DEFAULT 0,
  developer_relevance REAL NOT NULL DEFAULT 0,
  founder_relevance REAL NOT NULL DEFAULT 0,
  louisiana_relevance REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  embedding_json TEXT,
  embedding_model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_clusters (
  id TEXT PRIMARY KEY,
  canonical_story_id TEXT NOT NULL,
  label TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 1,
  earliest_published_at TEXT NOT NULL,
  latest_published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (canonical_story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_cluster_members (
  cluster_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  similarity REAL NOT NULL,
  match_method TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cluster_id, story_id),
  FOREIGN KEY (cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_intelligence_event_type ON story_intelligence(event_type);
CREATE INDEX IF NOT EXISTS idx_story_clusters_latest ON story_clusters(latest_published_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_cluster_members_story ON story_cluster_members(story_id);
