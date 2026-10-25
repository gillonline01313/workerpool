-- Run once in Cloudflare: D1 > workerpool-db > Console
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY, vid TEXT NOT NULL, page TEXT, t TEXT NOT NULL, tz TEXT, lang TEXT, src TEXT, dev TEXT,
  country TEXT, region TEXT, city TEXT, sec TEXT, clk TEXT, dur INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visits_t ON visits (t);
CREATE TABLE IF NOT EXISTS interest (
  id TEXT PRIMARY KEY, type TEXT, business TEXT, email TEXT, phone TEXT, country TEXT, created TEXT
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, created TEXT, name TEXT, email TEXT, phone TEXT, location TEXT, country TEXT, province TEXT,
  status TEXT, wants_imm INTEGER, wants_match INTEGER, consent_imm INTEGER, consent_emp INTEGER, consent_mkt INTEGER, profile TEXT
);
CREATE INDEX IF NOT EXISTS submissions_created ON submissions (created);
-- Run once in Cloudflare: D1 > workerpool-db > Console (adds accounts to the existing database)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT, pass_hash TEXT NOT NULL, created TEXT,
  step TEXT, profile TEXT, fail_count INTEGER DEFAULT 0, locked_until TEXT DEFAULT '',
  resume_key TEXT, resume_name TEXT, resume_size INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL);
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
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, province TEXT, name TEXT, summary TEXT, inputs TEXT, consent_at TEXT, created TEXT, updated TEXT
);
CREATE INDEX IF NOT EXISTS assessments_user ON assessments (user_id, province);
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE, name TEXT, email TEXT, page TEXT, ip_hash TEXT,
  status TEXT DEFAULT 'open', created TEXT, updated TEXT, visitor_seen TEXT, admin_read INTEGER DEFAULT 0, last_notified TEXT
);
CREATE INDEX IF NOT EXISTS chat_threads_updated ON chat_threads (updated);
CREATE INDEX IF NOT EXISTS chat_threads_ip ON chat_threads (ip_hash, created);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, sender TEXT NOT NULL, body TEXT, created TEXT
);
CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages (thread_id, id);
