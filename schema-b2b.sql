-- Run once in Cloudflare: D1 > workerpool-db > Console (adds the B2B Data Entry portal tables)
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT, stream TEXT, app_type TEXT, app_name TEXT,
  status TEXT DEFAULT 'draft', data TEXT, created TEXT, updated TEXT, submitted TEXT
);
CREATE INDEX IF NOT EXISTS applications_user ON applications (user_id);
CREATE INDEX IF NOT EXISTS applications_status ON applications (status, submitted);
CREATE TABLE IF NOT EXISTS app_docs (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, doc_key TEXT, name TEXT, size INTEGER, r2_key TEXT, uploaded TEXT
);
CREATE INDEX IF NOT EXISTS app_docs_app ON app_docs (app_id);
