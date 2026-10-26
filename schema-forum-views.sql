-- Who viewed each forum topic (admin only). Signed-in members are linked to their account; others by approximate location and device. No IP addresses.
CREATE TABLE IF NOT EXISTS forum_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id TEXT NOT NULL, t TEXT NOT NULL, user_id TEXT, username TEXT, vid TEXT,
  country TEXT, region TEXT, city TEXT, tz TEXT, dev TEXT, os TEXT, browser TEXT, lang TEXT, screen TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS forum_views_topic ON forum_views (topic_id, t);
CREATE INDEX IF NOT EXISTS forum_views_t ON forum_views (t);
