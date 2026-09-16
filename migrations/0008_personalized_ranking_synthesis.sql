CREATE TABLE IF NOT EXISTS audience_preferences (
  audience TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('topic', 'entity', 'event_type')),
  signal_value TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight >= -1 AND weight <= 1),
  source TEXT NOT NULL DEFAULT 'explicit',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audience, signal_type, signal_value)
);

CREATE TABLE IF NOT EXISTS story_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience TEXT NOT NULL,
  story_id TEXT,
  feedback_type TEXT NOT NULL,
  signal_type TEXT,
  signal_value TEXT,
  weight_delta REAL NOT NULL DEFAULT 0,
  channel TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ranking_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience TEXT NOT NULL,
  story_id TEXT NOT NULL,
  cluster_id TEXT,
  ranking_context TEXT NOT NULL,
  base_score REAL NOT NULL,
  interest_score REAL NOT NULL,
  significance_score REAL NOT NULL,
  actionability_score REAL NOT NULL,
  freshness_score REAL NOT NULL,
  trust_score REAL NOT NULL,
  diversity_adjustment REAL NOT NULL,
  final_score REAL NOT NULL,
  explanation_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_audience_created ON story_feedback(audience, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_audience_context_created ON ranking_decisions(audience, ranking_context, created_at DESC);

INSERT OR IGNORE INTO audience_preferences (audience, signal_type, signal_value, weight, source) VALUES
  ('personal', 'topic', 'ai', 0.9, 'default'),
  ('personal', 'topic', 'rust', 0.9, 'default'),
  ('personal', 'topic', 'systems', 0.8, 'default'),
  ('personal', 'topic', 'cybersecurity', 0.8, 'default'),
  ('personal', 'topic', 'startups', 0.7, 'default'),
  ('personal', 'topic', 'developer-infrastructure', 0.8, 'default'),
  ('fla', 'topic', 'louisiana', 1.0, 'default'),
  ('fla', 'topic', 'startups', 0.9, 'default'),
  ('fla', 'topic', 'funding', 0.9, 'default'),
  ('fla', 'topic', 'events', 0.7, 'default');
