-- Run once in Cloudflare: D1 > workerpool-db > Console (adds the live chat tables)
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
CREATE TABLE IF NOT EXISTS chat_files (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, msg_id INTEGER, sender TEXT, name TEXT, size INTEGER, type TEXT, r2_key TEXT, created TEXT
);
CREATE INDEX IF NOT EXISTS chat_files_msg ON chat_files (msg_id);
