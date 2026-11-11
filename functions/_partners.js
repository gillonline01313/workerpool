// Partner firms (RCICs and immigration law firms) who use WorkerPool intake forms for their own clients.
// A partner signs up at /partners/, buys form credits (Temporary residence and Permanent residence are priced
// separately), and spends one credit for each personal client link. Their clients fill the normal intake form
// (/intake/?i=CODE); the partner sees, views and downloads only their own clients' forms. WorkerPool admin
// sees every form (master view) under admin → Intake forms, and manages firms under admin → Partners.
// Tables are created automatically.
import { CATALOG, catalogEntry } from "../assets/intake-config.js";
import { randomToken, sha256hex } from "./_lib.js";

export const PRICE_DEFAULT = { tr: 1000, pr: 2000 };   // cents CAD per intake form: $10 Temporary, $20 Permanent
export const KIND_LABEL = { tr: "Temporary residence", pr: "Permanent residence" };
export const MAX_QTY = 200;                            // credits of one kind in a single purchase
const COOKIE = "wp_p", SESSION_DAYS = 30;

// Which price applies to a form: Permanent residence catalog → "pr", everything else → "tr".
export function kindOf(formKey) {
  const e = catalogEntry(formKey);
  return e && e.cat.key === "permanent" ? "pr" : "tr";
}
export const money = (c) => "$" + (c / 100).toFixed(2);

let ready = false;
export async function ensurePartners(env) {
  if (ready) return;
  for (const q of [
    `CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, firm TEXT NOT NULL, kind TEXT, licence TEXT, contact TEXT, email TEXT UNIQUE NOT NULL,
      phone TEXT, website TEXT, city TEXT, province TEXT, pass_hash TEXT NOT NULL, status TEXT DEFAULT 'active', credits_tr INTEGER DEFAULT 0, credits_pr INTEGER DEFAULT 0,
      created TEXT, last_login TEXT, fail_count INTEGER DEFAULT 0, locked_until TEXT DEFAULT '', admin_note TEXT, agreed_at TEXT, agreed_text TEXT, ip_hash TEXT)`,
    `CREATE TABLE IF NOT EXISTS partner_sessions (token_hash TEXT PRIMARY KEY, partner_id TEXT NOT NULL, expires TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS partner_resets (token_hash TEXT PRIMARY KEY, partner_id TEXT NOT NULL, expires TEXT NOT NULL)`,
    // every change to a firm's credits: purchases (+), links made (-), refunds for unused links (+), admin grants (+/-)
    `CREATE TABLE IF NOT EXISTS partner_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, partner_id TEXT NOT NULL, kind TEXT NOT NULL, delta INTEGER NOT NULL,
      reason TEXT, ref TEXT, amount INTEGER, created TEXT)`,
    `CREATE INDEX IF NOT EXISTS partner_ledger_p ON partner_ledger (partner_id, id)`,
    // Stripe Checkout sessions already credited (the session id makes crediting happen exactly once)
    `CREATE TABLE IF NOT EXISTS partner_payments (session_id TEXT PRIMARY KEY, partner_id TEXT NOT NULL, tr INTEGER, pr INTEGER, amount INTEGER, currency TEXT, created TEXT)`,
    `CREATE TABLE IF NOT EXISTS partner_settings (k TEXT PRIMARY KEY, v TEXT)`,
  ]) await env.DB.prepare(q).run();
  ready = true;
}

// Every intake table and column (client forms, links, consent, partner ownership). Used by the intake and partner APIs.
let intakeReady = false;
export async function ensureIntake(env) {
  if (intakeReady) return;
  for (const q of [
    `CREATE TABLE IF NOT EXISTS intakes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, form_key TEXT NOT NULL, invite_code TEXT,
      status TEXT DEFAULT 'draft', data TEXT, progress INTEGER DEFAULT 0, created TEXT, updated TEXT, submitted TEXT, resubmitted TEXT,
      admin_seen TEXT, admin_status TEXT DEFAULT 'new', admin_note TEXT)`,
    `CREATE INDEX IF NOT EXISTS intakes_user ON intakes (user_id)`,
    `CREATE TABLE IF NOT EXISTS intake_docs (id TEXT PRIMARY KEY, intake_id TEXT NOT NULL, doc_key TEXT, name TEXT, size INTEGER, type TEXT, r2_key TEXT, uploaded TEXT)`,
    `CREATE INDEX IF NOT EXISTS intake_docs_intake ON intake_docs (intake_id)`,
    `CREATE TABLE IF NOT EXISTS intake_invites (code TEXT PRIMARY KEY, form_key TEXT NOT NULL, label TEXT, email TEXT, note TEXT,
      created TEXT, opens INTEGER DEFAULT 0, first_open TEXT, last_open TEXT, archived INTEGER DEFAULT 0)`,
  ]) await env.DB.prepare(q).run();
  const add = async (table, cols) => { for (const c of cols) { try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${c}`).run(); } catch {} } };
  // consent, the client's choice to keep a copy, the complete file and document destruction
  await add("intakes", ["consent_at TEXT", "consent_text TEXT", "keep_file INTEGER", "keep_changed TEXT", "final_key TEXT", "final_name TEXT", "final_size INTEGER", "final_at TEXT",
    "final_expires TEXT", "final_downloads INTEGER DEFAULT 0", "docs_destroyed_at TEXT", "docs_destroyed_count INTEGER",
    // partner firms: who owns the form, and the firm's own work status, notes and downloads
    "partner_id TEXT", "partner_seen TEXT", "partner_status TEXT DEFAULT 'new'", "partner_note TEXT", "partner_downloads INTEGER DEFAULT 0"]);
  await add("intake_invites", ["partner_id TEXT", "price_kind TEXT", "price_cents INTEGER", "refunded INTEGER DEFAULT 0"]);
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS intakes_partner ON intakes (partner_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS intake_invites_partner ON intake_invites (partner_id)`).run();
  await ensurePartners(env);
  intakeReady = true;
}

export async function prices(env) {
  const r = await env.DB.prepare(`SELECT k, v FROM partner_settings WHERE k IN ('price_tr', 'price_pr')`).all();
  const p = { ...PRICE_DEFAULT };
  for (const x of r.results) { const n = parseInt(x.v); if (n >= 50) p[x.k.slice(6)] = n; }
  return p;
}

/* ---------- partner sessions (separate from client accounts) ---------- */
export const partnerCookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export async function createPartnerSession(env, partnerId) {
  const token = randomToken(), expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare(`INSERT INTO partner_sessions (token_hash, partner_id, expires) VALUES (?1, ?2, ?3)`).bind(await sha256hex(token), partnerId, expires).run();
  return partnerCookie(token, SESSION_DAYS * 86400);
}
export function partnerToken(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)wp_p=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
export async function getPartner(request, env) {
  const t = partnerToken(request);
  if (!t) return null;
  return await env.DB.prepare(`SELECT p.* FROM partner_sessions s JOIN partners p ON p.id = s.partner_id WHERE s.token_hash = ?1 AND s.expires > ?2`)
    .bind(await sha256hex(t), new Date().toISOString()).first() || null;
}

// Changes a firm's balance and writes the ledger line. Spending (delta < 0) only succeeds if the credit is there.
export async function addCredits(env, partnerId, kind, delta, reason, ref = null, amount = null) {
  if (kind !== "tr" && kind !== "pr" || !delta) return false;
  const col = kind === "tr" ? "credits_tr" : "credits_pr";
  const r = await env.DB.prepare(`UPDATE partners SET ${col} = ${col} + ?1 WHERE id = ?2${delta < 0 ? ` AND ${col} >= ?3` : ""}`)
    .bind(delta, partnerId, ...(delta < 0 ? [-delta] : [])).run();
  if (!r.meta || !r.meta.changes) return false;
  await env.DB.prepare(`INSERT INTO partner_ledger (partner_id, kind, delta, reason, ref, amount, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(partnerId, kind, delta, reason, ref, amount, new Date().toISOString()).run();
  return true;
}

// Forms a partner can send, grouped like the admin catalog, with the price kind of each.
export const partnerCatalog = () => CATALOG.map((c) => ({ key: c.key, label: c.label, kind: c.key === "permanent" ? "pr" : "tr",
  groups: c.groups.map((g) => ({ label: g.label, forms: g.forms.map((f) => ({ key: f.key, name: f.name })) })) }));

export const PARTNER_TERMS_V = "2026-11-06";
export const PARTNER_TERMS = "I confirm that I am authorized to represent clients in Canadian immigration matters (a licensed RCIC in good standing with the College of Immigration and Citizenship Consultants, a lawyer or notary in good standing with a Canadian law society, or a firm employing them). I will send WorkerPool intake links only to my own clients, I am responsible for my clients' files and for any advice given to them, and I will keep the information and documents I download confidential. I understand that WorkerPool is a data processing company, not an immigration representative, that each personal client link uses one prepaid form credit, and that credits are not refundable except for links turned off before a client starts the form.";
