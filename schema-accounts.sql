-- Run once in Cloudflare: D1 > workerpool-db > Console (adds accounts to the existing database)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT, pass_hash TEXT NOT NULL, created TEXT,
  step TEXT, profile TEXT, fail_count INTEGER DEFAULT 0, locked_until TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL);
