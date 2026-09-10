ALTER TABLE stories ADD COLUMN audiences_json TEXT NOT NULL DEFAULT '["personal"]';
CREATE INDEX IF NOT EXISTS idx_stories_audiences ON stories(audiences_json);
