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
