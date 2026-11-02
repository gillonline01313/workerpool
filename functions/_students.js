// Student Pool tables (created on first use). Profiles hold the typed facts the student confirmed.
// Documents are kept only when the student gives permission: originals go to R2 (RESUMES bucket,
// key students/<profile id>/<doc id>.<ext>) and are listed in student_docs. Without permission they
// are read in memory and never stored.
export async function ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS student_profiles (id TEXT PRIMARY KEY, ref TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, name TEXT, email TEXT, phone TEXT, whatsapp TEXT,
    highest TEXT, english TEXT, plans TEXT, profile TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT, country_seen TEXT)`).run();
  for (const c of ["docs_consent TEXT", "upload_hash TEXT", "upload_exp TEXT"]) { try { await env.DB.prepare(`ALTER TABLE student_profiles ADD COLUMN ${c}`).run(); } catch {} }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS student_docs (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, kind TEXT, name TEXT, size INTEGER, type TEXT, r2_key TEXT NOT NULL, created TEXT NOT NULL)`).run();
}
export const STATUSES = ["new", "working", "options-sent", "closed"];
export const DOC_KINDS = { tenth: "10th", twelfth: "12th", diploma: "Diploma", bachelors: "Bachelor's", masters: "Master's / PG", english: "English test", other: "Other" };
