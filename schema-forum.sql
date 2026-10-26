-- Run once in Cloudflare: D1 > workerpool-db > Console (adds the discussion forum to the existing database)
-- Forum usernames, linked to the existing accounts (users table). One username per account.
CREATE TABLE IF NOT EXISTS forum_users (
  user_id TEXT PRIMARY KEY, username TEXT NOT NULL, username_lc TEXT NOT NULL UNIQUE,
  created TEXT NOT NULL, banned INTEGER DEFAULT 0, posts INTEGER DEFAULT 0
);
-- A topic. "created" is the date and time it was opened (UTC); "last_post" is the newest reply.
-- loc is only used in the Jobs forums: a city id like "ab:edmonton", or "ab:other".
CREATE TABLE IF NOT EXISTS forum_topics (
  id TEXT PRIMARY KEY, cat TEXT NOT NULL, loc TEXT, title TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL,
  created TEXT NOT NULL, last_post TEXT NOT NULL, last_user TEXT, replies INTEGER DEFAULT 0, views INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open', pinned INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS forum_topics_cat ON forum_topics (cat, status, pinned, last_post);
CREATE INDEX IF NOT EXISTS forum_topics_loc ON forum_topics (cat, loc, last_post);
CREATE INDEX IF NOT EXISTS forum_topics_last ON forum_topics (status, last_post);
-- Every message, including the opening post (n = 1). "created" is the exact date and time it was received (UTC).
-- Posts are never edited; a removed post keeps its number and time and shows as removed.
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id TEXT NOT NULL, n INTEGER NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL,
  body TEXT NOT NULL, created TEXT NOT NULL, status TEXT DEFAULT 'live', removed_at TEXT, removed_by TEXT, ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS forum_posts_topic ON forum_posts (topic_id, n);
CREATE INDEX IF NOT EXISTS forum_posts_user ON forum_posts (user_id, created);
CREATE TABLE IF NOT EXISTS forum_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id TEXT NOT NULL, reason TEXT, created TEXT NOT NULL, resolved INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS forum_reports_once ON forum_reports (post_id, user_id);
-- Who viewed each forum topic (admin only). Signed-in members are linked to their account; others by approximate location and device. No IP addresses.
CREATE TABLE IF NOT EXISTS forum_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id TEXT NOT NULL, t TEXT NOT NULL, user_id TEXT, username TEXT, vid TEXT,
  country TEXT, region TEXT, city TEXT, tz TEXT, dev TEXT, os TEXT, browser TEXT, lang TEXT, screen TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS forum_views_topic ON forum_views (topic_id, t);
CREATE INDEX IF NOT EXISTS forum_views_t ON forum_views (t);
