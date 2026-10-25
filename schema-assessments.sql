-- Run once in Cloudflare: D1 > workerpool-db > Console (pathway tool assessments shared with consent)
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, province TEXT, name TEXT, summary TEXT, inputs TEXT, consent_at TEXT, created TEXT, updated TEXT
);
CREATE INDEX IF NOT EXISTS assessments_user ON assessments (user_id, province);
