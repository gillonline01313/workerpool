-- Run once in Cloudflare: D1 > workerpool-db > Console (adds the "Hot & New" ticker table)
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  tag TEXT DEFAULT 'new',          /* hot | new | trending | update */
  link TEXT,                       /* /express-entry-2026/#calculator or https://... */
  pinned INTEGER DEFAULT 0,        /* pinned items always lead the ticker */
  status TEXT DEFAULT 'live',      /* live | archived */
  clicks INTEGER DEFAULT 0,        /* ticker clicks, used to rank what's trending */
  expires TEXT,                    /* optional: auto-hides after this date (YYYY-MM-DD) */
  created TEXT, updated TEXT, archived_at TEXT
);
CREATE INDEX IF NOT EXISTS news_status ON news (status, created);
