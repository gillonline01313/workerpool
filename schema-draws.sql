-- Latest draws: admin changes on top of the automatic list in data/draws.json. Run once in Cloudflare: D1 > workerpool-db > Console.
CREATE TABLE IF NOT EXISTS draw_edits (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT, updated TEXT NOT NULL);
