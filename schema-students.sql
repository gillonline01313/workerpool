-- Student Pool profiles (typed facts only; uploaded documents are read in memory and never stored).
-- The table is also created automatically on first use. Run once in Cloudflare: D1 > workerpool-db > Console.
CREATE TABLE IF NOT EXISTS student_profiles (id TEXT PRIMARY KEY, ref TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, name TEXT, email TEXT, phone TEXT, whatsapp TEXT,
  highest TEXT, english TEXT, plans TEXT, profile TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT, country_seen TEXT);
CREATE INDEX IF NOT EXISTS student_profiles_created ON student_profiles (created);
