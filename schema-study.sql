-- Study options (Student Pool matcher). Created automatically on first use; run here only if you prefer. D1 > workerpool-db > Console.
CREATE TABLE IF NOT EXISTS study_schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, province TEXT, city TEXT, dli TEXT,
  applyboard INTEGER NOT NULL DEFAULT 0, website TEXT, note TEXT, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS study_programs (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL, level TEXT NOT NULL, field TEXT,
  campus TEXT, intakes TEXT, tuition INTEGER, months INTEGER, min_prior TEXT, min_percent REAL, max_gap INTEGER, max_backlogs INTEGER,
  ielts REAL, ielts_band REAL, pte REAL, toefl REAL, duolingo REAL, pgwp TEXT, link TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1, updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS study_programs_school ON study_programs (school_id);
