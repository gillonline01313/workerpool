// Student Pool table (created on first use). Stores typed profile facts only, never documents.
export async function ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS student_profiles (id TEXT PRIMARY KEY, ref TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, name TEXT, email TEXT, phone TEXT, whatsapp TEXT,
    highest TEXT, english TEXT, plans TEXT, profile TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT, country_seen TEXT)`).run();
}
export const STATUSES = ["new", "working", "options-sent", "closed"];
