ALTER TABLE stories ADD COLUMN opportunity_type TEXT;
ALTER TABLE stories ADD COLUMN deadline_date TEXT;
ALTER TABLE stories ADD COLUMN deadline_text TEXT;
ALTER TABLE stories ADD COLUMN eligibility TEXT;
ALTER TABLE stories ADD COLUMN opportunity_location TEXT;
ALTER TABLE stories ADD COLUMN participation_mode TEXT;
ALTER TABLE stories ADD COLUMN application_url TEXT;
ALTER TABLE stories ADD COLUMN opportunity_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE stories ADD COLUMN is_rolling INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_stories_opportunity_deadline
  ON stories(opportunity_type, deadline_date);
