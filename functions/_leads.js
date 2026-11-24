// Lead Desk: referral partners ("lead managers") punch client leads for WorkerPool services, and every lead is
// tracked to the end: status, payments received, RCIC attached, comments both ways, and leads sent back to the
// manager for more work. Only admin and lead managers use it. A manager sees only their own leads, and never the
// RCIC's name (only whether an RCIC is attached) or admin's internal notes.
// Admin adds a manager in admin → Lead Desk (name; email and phone optional) and shares a sign-up link by WhatsApp,
// text, email or copy-paste. The manager opens it, signs up with their own email and/or phone and a password, and
// signs in at /leads/ with either. Leads can carry files (the client's CV), kept privately in R2 under leads/.
// Tables are created automatically.
import { randomToken, sha256hex } from "./_lib.js";

export const LEAD_STATUS = {
  new: "New",
  discussion: "In discussion",
  pending: "Pending",
  process: "In process",
  finalized: "Lead finalized",
  completed: "Service completed",
  closed: "Not proceeding",
};
export const PAY_METHODS = ["Interac e-Transfer", "Cash", "Credit / debit card", "Online (Stripe)", "Bank transfer / wire", "Cheque", "UPI / India transfer", "Other"];
export const LEAD_SERVICES = ["Visitor visa (TRV)", "Super visa", "Study permit", "Study permit extension", "College / university admission", "Work permit – LMIA", "Work permit – LMIA-exempt",
  "Work permit extension / new employer", "PGWP", "Spousal open work permit", "Bridging open work permit (BOWP)", "Vulnerable worker OWP", "Restoration of status", "Temporary resident permit (TRP)",
  "Visitor record", "PR – Express Entry", "PR – Provincial nominee (PNP)", "PR – RCIP / FCIP", "Spousal / common-law sponsorship", "Parents & grandparents sponsorship", "Humanitarian & compassionate (H&C)",
  "Citizenship", "PR card / PRTD", "LMIA (employer)", "Federal Court judicial review", "Job search / Employer Match", "Data entry / file preparation", "Other"];
const COOKIE = "wp_lm", SESSION_DAYS = 30;

// email and phone are both optional; a manager signs in with whichever they gave (phone matched on its last 10 digits)
const MGR_TABLE = `id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, phone_key TEXT, company TEXT, note TEXT,
  pass_hash TEXT, status TEXT DEFAULT 'active', created TEXT, invited TEXT, last_login TEXT, fail_count INTEGER DEFAULT 0, locked_until TEXT DEFAULT ''`;
const MGR_COLS = ["id", "name", "email", "phone", "phone_key", "company", "note", "pass_hash", "status", "created", "invited", "last_login", "fail_count", "locked_until"];
export const phoneKey = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-10) : ""; };
// Finds a manager by what they type to sign in: an email address or a phone number.
export async function findManager(env, ident) {
  const v = String(ident || "").trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) return await env.DB.prepare(`SELECT * FROM lead_managers WHERE email = ?1`).bind(v).first();
  const k = phoneKey(v);
  return k ? await env.DB.prepare(`SELECT * FROM lead_managers WHERE phone_key = ?1 ORDER BY created LIMIT 1`).bind(k).first() : null;
}

let ready = false;
export async function ensureLeads(env) {
  if (ready) return;
  for (const q of [
    `CREATE TABLE IF NOT EXISTS lead_managers (${MGR_TABLE})`,
    `CREATE TABLE IF NOT EXISTS lead_sessions (token_hash TEXT PRIMARY KEY, manager_id TEXT NOT NULL, expires TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS lead_resets (token_hash TEXT PRIMARY KEY, manager_id TEXT NOT NULL, expires TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, num INTEGER UNIQUE, manager_id TEXT NOT NULL,
      client_name TEXT, phone TEXT, whatsapp TEXT, email TEXT, location TEXT, service TEXT, details TEXT, consent_at TEXT,
      status TEXT DEFAULT 'new', fee_cents INTEGER, paid_cents INTEGER DEFAULT 0,
      rcic_attached INTEGER DEFAULT 0, rcic_name TEXT, rcic_licence TEXT, rcic_at TEXT,
      action_needed INTEGER DEFAULT 0, action_msg TEXT, action_at TEXT,
      created TEXT, updated TEXT, mgr_at TEXT, admin_at TEXT, admin_seen TEXT, mgr_seen TEXT, finalized_at TEXT, closed_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS leads_manager ON leads (manager_id, updated)`,
    `CREATE INDEX IF NOT EXISTS leads_updated ON leads (updated)`,
    // the lead's timeline. priv = 1: admin only (internal notes, the RCIC's name)
    `CREATE TABLE IF NOT EXISTS lead_events (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, who TEXT NOT NULL, kind TEXT NOT NULL, text TEXT, priv INTEGER DEFAULT 0, created TEXT)`,
    `CREATE INDEX IF NOT EXISTS lead_events_lead ON lead_events (lead_id, id)`,
    `CREATE TABLE IF NOT EXISTS lead_payments (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, received_on TEXT, method TEXT, note TEXT, created TEXT)`,
    `CREATE INDEX IF NOT EXISTS lead_payments_lead ON lead_payments (lead_id)`,
    // files on a lead (kind 'cv' = the client's CV / resume). by: 'manager' or 'admin'
    `CREATE TABLE IF NOT EXISTS lead_files (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, kind TEXT, name TEXT, size INTEGER, type TEXT, r2_key TEXT, by TEXT, created TEXT)`,
    `CREATE INDEX IF NOT EXISTS lead_files_lead ON lead_files (lead_id)`,
  ]) await env.DB.prepare(q).run();
  // The first version required an email for every manager. Rebuild that table once so email is optional.
  const cols = (await env.DB.prepare(`PRAGMA table_info(lead_managers)`).all()).results;
  const em = cols.find((c) => c.name === "email");
  if (em && em.notnull) {
    const keep = cols.map((c) => c.name).filter((n) => MGR_COLS.includes(n)).join(", ");
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE lead_managers_v2 (${MGR_TABLE})`),
      env.DB.prepare(`INSERT INTO lead_managers_v2 (${keep}) SELECT ${keep} FROM lead_managers`),
      env.DB.prepare(`DROP TABLE lead_managers`),
      env.DB.prepare(`ALTER TABLE lead_managers_v2 RENAME TO lead_managers`),
    ]);
  }
  await env.DB.prepare(`UPDATE lead_managers SET phone_key = substr(replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), -10) WHERE phone_key IS NULL AND phone IS NOT NULL AND phone != ''`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS lead_managers_phone ON lead_managers (phone_key)`).run();
  ready = true;
}

export const leadRef = (n) => "L-" + n;
export const money = (c) => "$" + ((c || 0) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- manager sessions (separate from client and partner accounts) ---------- */
export const leadCookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export async function createLeadSession(env, managerId) {
  const token = randomToken(), expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare(`INSERT INTO lead_sessions (token_hash, manager_id, expires) VALUES (?1, ?2, ?3)`).bind(await sha256hex(token), managerId, expires).run();
  return leadCookie(token, SESSION_DAYS * 86400);
}
export function leadToken(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)wp_lm=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
export async function getManager(request, env) {
  const t = leadToken(request);
  if (!t) return null;
  return await env.DB.prepare(`SELECT m.* FROM lead_sessions s JOIN lead_managers m ON m.id = s.manager_id WHERE s.token_hash = ?1 AND s.expires > ?2 AND m.status = 'active'`)
    .bind(await sha256hex(t), new Date().toISOString()).first() || null;
}
// A link to sign up (new manager) or reset the password: 7 days when admin makes it, 1 hour for "forgot password".
export async function passwordLink(env, managerId, hours) {
  const token = randomToken();
  await env.DB.prepare(`DELETE FROM lead_resets WHERE manager_id = ?1`).bind(managerId).run();
  await env.DB.prepare(`INSERT INTO lead_resets (token_hash, manager_id, expires) VALUES (?1, ?2, ?3)`).bind(await sha256hex(token), managerId, new Date(Date.now() + hours * 3600e3).toISOString()).run();
  return `${env.SITE_URL || "https://workerpool.ca"}/leads/?set=${token}`;
}

// Adds a line to the lead's timeline and stamps who touched it last (drives "new for you" on both sides).
export async function leadEvent(env, leadId, who, kind, text, priv = 0) {
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO lead_events (lead_id, who, kind, text, priv, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(leadId, who, kind, text || "", priv ? 1 : 0, now).run();
  const col = who === "manager" ? "mgr_at" : priv ? null : "admin_at";
  await env.DB.prepare(`UPDATE leads SET updated = ?1${col ? `, ${col} = ?1` : ""} WHERE id = ?2`).bind(now, leadId).run();
}
