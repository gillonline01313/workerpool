// Admin CRM: every person who contacts WorkerPool, matched by phone number (or email), with a dated history of each
// call, email, WhatsApp or query, plus retention, service type, RCIC retention, intake forms sent and internal notes.
// Admin only (x-admin-key). Tables are created automatically.
//
// GET  list?q=&status=&service=     contacts (also pulls in new website candidates who asked for a consultant call)
// GET  lookup?phone=&email=          an existing contact for a number/email being typed
// GET  item?id=                      one contact: details, history, intake forms
// POST capture { phone, name, email, channel, at, detail, service }   punch a query (new person or existing)
// POST update  { id, name, phone, email, location, status, service, pinned }
// POST event   { id, type, channel, at, detail }      type: query | call | email | whatsapp | meeting | note
// POST event-delete { id, eid }
// POST retain  { id, at, service, fee, detail }      POST unretain { id }
// POST rcic    { id, at, name, firm, licence, detail }
// POST intake  { id, form, email, send }               send an intake form link (a personal link tied to this contact)
// POST task   { id, tid?, kind, title, due, note }      add or edit a task (deadline = due date)
// POST task-done { id, tid, done }   POST task-delete { id, tid }
// POST delete  { id }
import { json, readJson, str, isEmail, sendEmail, randomToken } from "../../_lib.js";
import { ensureIntake } from "../../_partners.js";
import { FORMS, applicantName, upgradeIntake } from "../../../assets/intake-config.js";

const site = (env) => env.SITE_URL || "https://workerpool.ca";
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
function same(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const isAdmin = (request, env) => !!env.ADMIN_KEY && same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY);
// Phone numbers are matched on their last 10 digits, so +1 780…, (780) … and 780… are the same person.
export const phoneKey = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-10) : ""; };
const emailKey = (e) => String(e || "").trim().toLowerCase();
const parse = (s) => { try { return upgradeIntake(JSON.parse(s || "{}")); } catch { return {}; } };

export const STATUSES = { new: "New query", "follow-up": "Following up", retained: "Retained", "in-progress": "File in progress", submitted: "Application submitted", done: "Completed", lost: "Not proceeding", cancelled: "Cancelled", refunded: "Refunded" };
export const CHANNELS = ["Phone call", "WhatsApp", "Email", "Text / SMS", "In person", "Website", "Referral", "Other"];
export const SERVICES = ["Visitor visa (TRV)", "Super visa", "Study permit", "Study permit extension", "College / university admission", "Work permit – LMIA", "Work permit – LMIA-exempt",
  "Work permit extension / new employer", "PGWP", "Spousal open work permit", "Bridging open work permit (BOWP)", "Vulnerable worker OWP", "Restoration of status", "Temporary resident permit (TRP)",
  "Visitor record", "PR – Express Entry", "PR – Provincial nominee (PNP)", "PR – RCIP / FCIP", "Spousal / common-law sponsorship", "Parents & grandparents sponsorship", "Humanitarian & compassionate (H&C)",
  "Citizenship", "PR card / PRTD", "LMIA (employer)", "Federal Court judicial review", "Job search / Employer Match", "Other"];
const TYPES = ["query", "call", "email", "whatsapp", "meeting", "note"];
export const TASK_KINDS = ["File preparation", "File review", "Document collection", "Submit application", "Follow up", "Call back", "Payment follow-up", "Refund", "Send intake form", "Other"];

let ready = false;
async function ensure(env) {
  if (ready) return;
  await ensureIntake(env);
  for (const q of [
    `CREATE TABLE IF NOT EXISTS crm_contacts (id TEXT PRIMARY KEY, name TEXT, phone TEXT, phone_key TEXT, email TEXT, location TEXT, status TEXT DEFAULT 'new', service TEXT,
      retained_at TEXT, fee TEXT, rcic_name TEXT, rcic_firm TEXT, rcic_licence TEXT, rcic_at TEXT, pinned TEXT, source TEXT, created TEXT, updated TEXT, last_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS crm_contacts_phone ON crm_contacts (phone_key)`,
    `CREATE INDEX IF NOT EXISTS crm_contacts_email ON crm_contacts (email)`,
    `CREATE TABLE IF NOT EXISTS crm_events (id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, type TEXT NOT NULL, channel TEXT, at TEXT NOT NULL, detail TEXT, meta TEXT, ref TEXT, created TEXT)`,
    `CREATE INDEX IF NOT EXISTS crm_events_contact ON crm_events (contact_id, at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS crm_events_ref ON crm_events (ref)`,
    `CREATE TABLE IF NOT EXISTS crm_tasks (id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, kind TEXT, title TEXT, note TEXT, due TEXT, status TEXT DEFAULT 'open', created TEXT, updated TEXT, done_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS crm_tasks_contact ON crm_tasks (contact_id)`,
    `CREATE INDEX IF NOT EXISTS crm_tasks_open ON crm_tasks (status, due)`,
  ]) await env.DB.prepare(q).run();
  try { await env.DB.prepare(`ALTER TABLE intake_invites ADD COLUMN crm_id TEXT`).run(); } catch {}
  ready = true;
}
// A date/time typed in the admin (datetime-local, browser's local time) arrives as ISO already; anything else → now.
const atOf = (v) => { const t = Date.parse(v || ""); return isNaN(t) ? nowIso() : new Date(Math.min(t, Date.now() + 864e5)).toISOString(); };

async function findContact(env, phone, email) {
  const pk = phoneKey(phone), ek = emailKey(email);
  if (pk) { const c = await env.DB.prepare(`SELECT * FROM crm_contacts WHERE phone_key = ?1 ORDER BY created LIMIT 1`).bind(pk).first(); if (c) return c; }
  if (ek) { const c = await env.DB.prepare(`SELECT * FROM crm_contacts WHERE email = ?1 ORDER BY created LIMIT 1`).bind(ek).first(); if (c) return c; }
  return null;
}
async function addEvent(env, contactId, { type, channel, at, detail, meta, ref }) {
  const e = { id: uid(), contact_id: contactId, type, channel: channel || null, at: at || nowIso(), detail: detail || null, meta: meta ? JSON.stringify(meta) : null, ref: ref || null, created: nowIso() };
  await env.DB.prepare(`INSERT OR IGNORE INTO crm_events (id, contact_id, type, channel, at, detail, meta, ref, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(e.id, e.contact_id, e.type, e.channel, e.at, e.detail, e.meta, e.ref, e.created).run();
  // "Last contact" counts only real contact with the person, not notes, status changes or forms
  const talk = ["query", "call", "email", "whatsapp", "meeting"].includes(type) ? 1 : 0;
  await env.DB.prepare(`UPDATE crm_contacts SET updated = ?1, last_at = CASE WHEN ?3 = 1 AND (last_at IS NULL OR last_at < ?2) THEN ?2 ELSE last_at END WHERE id = ?4`)
    .bind(nowIso(), e.at, talk, contactId).run();
  return e;
}
// New person or the same person again: fills in anything we didn't have (name, email, phone) without overwriting.
async function upsert(env, { phone, name, email, location, service, source }) {
  let c = await findContact(env, phone, email);
  const now = nowIso();
  if (c) {
    const fill = { name: c.name || name, email: c.email || emailKey(email) || null, phone: c.phone || phone || null, phone_key: c.phone_key || phoneKey(phone) || null,
      location: c.location || location || null, service: c.service || service || null };
    await env.DB.prepare(`UPDATE crm_contacts SET name = ?1, email = ?2, phone = ?3, phone_key = ?4, location = ?5, service = ?6, updated = ?7 WHERE id = ?8`)
      .bind(fill.name, fill.email, fill.phone, fill.phone_key, fill.location, fill.service, now, c.id).run();
    return { contact: { ...c, ...fill }, created: false };
  }
  c = { id: uid(), name: name || null, phone: phone || null, phone_key: phoneKey(phone) || null, email: emailKey(email) || null, location: location || null, service: service || null, source: source || null };
  await env.DB.prepare(`INSERT INTO crm_contacts (id, name, phone, phone_key, email, location, status, service, source, created, updated) VALUES (?1,?2,?3,?4,?5,?6,'new',?7,?8,?9,?9)`)
    .bind(c.id, c.name, c.phone, c.phone_key, c.email, c.location, c.service, c.source, now).run();
  return { contact: c, created: true };
}

// Website candidates who asked for a consultant call become CRM queries automatically (once each).
async function syncWebsite(env) {
  let rows = [];
  try {
    rows = (await env.DB.prepare(`SELECT s.id, s.created, s.name, s.email, s.phone, s.location, s.country, s.province, s.profile, s.wants_match FROM submissions s
      WHERE s.wants_imm = 1 AND NOT EXISTS (SELECT 1 FROM crm_events e WHERE e.ref = 'sub:' || s.id) ORDER BY s.created LIMIT 200`).all()).results;
  } catch { return 0; }
  for (const s of rows) {
    let p = {}; try { p = JSON.parse(s.profile || "{}"); } catch {}
    const where = [p.city, s.location === "outside" ? s.country : s.province].filter(Boolean).join(", ");
    const { contact } = await upsert(env, { phone: s.phone, name: s.name, email: s.email, location: where, source: "Website" });
    await addEvent(env, contact.id, { type: "query", channel: "Website", at: s.created, ref: "sub:" + s.id,
      detail: `Filled the WorkerPool profile and asked for a call back from a consultant${s.wants_match ? " (also wants Employer Match)" : ""}.${where ? ` Location: ${where}.` : ""}${p.status ? ` Status: ${p.status}.` : ""}` });
  }
  return rows.length;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 503);
  if (!isAdmin(request, env)) return json({ ok: false, error: "Wrong admin key." }, 401);
  await ensure(env);
  const route = (params.path || []).join("/"), m = request.method, url = new URL(request.url), q = (k) => url.searchParams.get(k) || "";
  try {
    if (route === "list" && m === "GET") return await list(env, q);
    if (route === "count" && m === "GET") {   // for the CRM tab button: tasks overdue or due today (by the admin's own date)
      const d = /^\d{4}-\d{2}-\d{2}$/.test(q("today")) ? q("today") : nowIso().slice(0, 10);
      const r = await env.DB.prepare(`SELECT SUM(CASE WHEN due < ?1 THEN 1 ELSE 0 END) AS over, SUM(CASE WHEN due = ?1 THEN 1 ELSE 0 END) AS today FROM crm_tasks WHERE status = 'open'`).bind(d).first();
      return json({ ok: true, over: (r && r.over) || 0, today: (r && r.today) || 0 });
    }
    if (route === "lookup" && m === "GET") {
      const c = await findContact(env, q("phone"), q("email"));
      if (!c) return json({ ok: true, contact: null });
      const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_events WHERE contact_id = ?1 AND type IN ('query','call','email','whatsapp','meeting')`).bind(c.id).first();
      return json({ ok: true, contact: { id: c.id, name: c.name, phone: c.phone, email: c.email, status: c.status, service: c.service, last_at: c.last_at, contacts: n ? n.n : 0, rcic_name: c.rcic_name } });
    }
    if (route === "item" && m === "GET") return await item(env, q("id"));
    if (m !== "POST") return json({ ok: false, error: "Not found." }, 404);
    const b = await readJson(request, 40000) || {};
    if (route === "capture") return await capture(env, b);
    const c = await env.DB.prepare(`SELECT * FROM crm_contacts WHERE id = ?1`).bind(str(b.id, 60)).first();
    if (!c) return json({ ok: false, error: "Contact not found." }, 404);
    if (route === "update") return await update(env, c, b);
    if (route === "event") {
      const type = TYPES.includes(b.type) ? b.type : "query", detail = str(b.detail, 8000);
      if (!detail && type === "note") return json({ ok: false, error: "Write the note first." }, 400);
      const e = await addEvent(env, c.id, { type, channel: type === "note" ? null : str(b.channel, 40) || null, at: atOf(b.at), detail });
      if (type !== "note" && ["lost", "cancelled", "refunded"].includes(c.status)) await env.DB.prepare(`UPDATE crm_contacts SET status = 'follow-up' WHERE id = ?1`).bind(c.id).run();
      return json({ ok: true, event: e });
    }
    if (route === "event-delete") {
      await env.DB.prepare(`DELETE FROM crm_events WHERE id = ?1 AND contact_id = ?2`).bind(str(b.eid, 60), c.id).run();
      const l = await env.DB.prepare(`SELECT MAX(at) AS at FROM crm_events WHERE contact_id = ?1 AND type IN ('query','call','email','whatsapp','meeting')`).bind(c.id).first();
      await env.DB.prepare(`UPDATE crm_contacts SET last_at = ?1, updated = ?2 WHERE id = ?3`).bind(l && l.at, nowIso(), c.id).run();
      return json({ ok: true });
    }
    if (route === "retain") {
      const at = atOf(b.at), service = str(b.service, 120) || c.service, fee = str(b.fee, 60) || null;
      await env.DB.prepare(`UPDATE crm_contacts SET status = CASE WHEN status IN ('in-progress','submitted','done') THEN status ELSE 'retained' END, retained_at = ?1, service = ?2, fee = ?3, updated = ?4 WHERE id = ?5`)
        .bind(at, service, fee, nowIso(), c.id).run();
      await addEvent(env, c.id, { type: "retained", at, detail: [`Retained WorkerPool${service ? ` for ${service}` : ""}${fee ? ` · fee ${fee}` : ""}.`, str(b.detail, 4000)].filter(Boolean).join("\n"), meta: { service, fee } });
      return json({ ok: true });
    }
    if (route === "unretain") {
      await env.DB.prepare(`UPDATE crm_contacts SET status = 'follow-up', retained_at = NULL, fee = NULL, updated = ?1 WHERE id = ?2`).bind(nowIso(), c.id).run();
      await addEvent(env, c.id, { type: "status", at: nowIso(), detail: "Retention removed." });
      return json({ ok: true });
    }
    if (route === "rcic") {
      const name = str(b.name, 120), firm = str(b.firm, 160), lic = str(b.licence, 40), at = atOf(b.at);
      if (!name && !firm) return json({ ok: false, error: "Enter the RCIC's name or firm." }, 400);
      await env.DB.prepare(`UPDATE crm_contacts SET rcic_name = ?1, rcic_firm = ?2, rcic_licence = ?3, rcic_at = ?4, updated = ?5 WHERE id = ?6`).bind(name || null, firm || null, lic || null, at, nowIso(), c.id).run();
      await addEvent(env, c.id, { type: "rcic", at, detail: [`Retained RCIC: ${[name, firm].filter(Boolean).join(" – ")}${lic ? ` (licence ${lic})` : ""}.`, str(b.detail, 4000)].filter(Boolean).join("\n"), meta: { name, firm, licence: lic } });
      return json({ ok: true });
    }
    if (route === "intake") return await sendIntake(env, c, b);
    if (route === "task") {
      const kind = TASK_KINDS.includes(b.kind) ? b.kind : "Other", title = str(b.title, 300), note = str(b.note, 4000) || null;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || "") ? b.due : null;   // a calendar date (deadline), no time
      if (!due) return json({ ok: false, error: "Pick a deadline." }, 400);
      const now = nowIso(), label = title || kind;
      if (b.tid) {
        const t = await env.DB.prepare(`SELECT * FROM crm_tasks WHERE id = ?1 AND contact_id = ?2`).bind(str(b.tid, 60), c.id).first();
        if (!t) return json({ ok: false, error: "Task not found." }, 404);
        await env.DB.prepare(`UPDATE crm_tasks SET kind = ?1, title = ?2, note = ?3, due = ?4, updated = ?5 WHERE id = ?6`).bind(kind, title || null, note, due, now, t.id).run();
        if (t.due !== due) await addEvent(env, c.id, { type: "task", at: now, detail: `Task deadline moved: ${label} · ${t.due} → ${due}` });
        return json({ ok: true, id: t.id });
      }
      const id = uid();
      await env.DB.prepare(`INSERT INTO crm_tasks (id, contact_id, kind, title, note, due, status, created, updated) VALUES (?1,?2,?3,?4,?5,?6,'open',?7,?7)`).bind(id, c.id, kind, title || null, note, due, now).run();
      await addEvent(env, c.id, { type: "task", at: now, detail: `Task added: ${kind}${title ? ` – ${title}` : ""} · due ${due}${note ? `\n${note}` : ""}` });
      return json({ ok: true, id });
    }
    if (route === "task-done" || route === "task-delete") {
      const t = await env.DB.prepare(`SELECT * FROM crm_tasks WHERE id = ?1 AND contact_id = ?2`).bind(str(b.tid, 60), c.id).first();
      if (!t) return json({ ok: false, error: "Task not found." }, 404);
      const now = nowIso(), label = `${t.kind}${t.title ? ` – ${t.title}` : ""}`;
      if (route === "task-delete") { await env.DB.prepare(`DELETE FROM crm_tasks WHERE id = ?1`).bind(t.id).run(); await addEvent(env, c.id, { type: "task", at: now, detail: `Task removed: ${label}` }); return json({ ok: true }); }
      const done = b.done !== false;
      await env.DB.prepare(`UPDATE crm_tasks SET status = ?1, done_at = ?2, updated = ?3 WHERE id = ?4`).bind(done ? "done" : "open", done ? now : null, now, t.id).run();
      await addEvent(env, c.id, { type: "task", at: now, detail: done ? `Task done: ${label}${t.due < now.slice(0, 10) ? ` (was due ${t.due})` : ""}` : `Task reopened: ${label}` });
      return json({ ok: true });
    }
    if (route === "delete") {
      await env.DB.batch([env.DB.prepare(`DELETE FROM crm_tasks WHERE contact_id = ?1`).bind(c.id), env.DB.prepare(`DELETE FROM crm_events WHERE contact_id = ?1`).bind(c.id), env.DB.prepare(`DELETE FROM crm_contacts WHERE id = ?1`).bind(c.id)]);
      return json({ ok: true });
    }
    return json({ ok: false, error: "Not found." }, 404);
  } catch (e) {
    console.error("crm", route, e);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}

async function list(env, q) {
  const synced = await syncWebsite(env);
  const r = await env.DB.prepare(`SELECT c.*, (SELECT COUNT(*) FROM crm_events e WHERE e.contact_id = c.id AND e.type IN ('query','call','email','whatsapp','meeting')) AS touches,
      (SELECT e.channel FROM crm_events e WHERE e.contact_id = c.id AND e.type IN ('query','call','email','whatsapp','meeting') ORDER BY e.at DESC LIMIT 1) AS last_channel,
      (SELECT COUNT(*) FROM intake_invites v WHERE v.crm_id = c.id) AS intakes_sent,
      (SELECT COUNT(*) FROM crm_tasks t WHERE t.contact_id = c.id AND t.status = 'open') AS tasks_open,
      (SELECT MIN(t.due) FROM crm_tasks t WHERE t.contact_id = c.id AND t.status = 'open') AS next_due
    FROM crm_contacts c ORDER BY COALESCE(c.last_at, c.created) DESC LIMIT 5000`).all();
  const used = await env.DB.prepare(`SELECT DISTINCT service FROM crm_contacts WHERE service IS NOT NULL AND service != ''`).all();
  const rc = await env.DB.prepare(`SELECT rcic_name AS name, rcic_firm AS firm, rcic_licence AS licence, MAX(rcic_at) AS at FROM crm_contacts WHERE rcic_name IS NOT NULL OR rcic_firm IS NOT NULL GROUP BY LOWER(COALESCE(rcic_name,'')), LOWER(COALESCE(rcic_firm,'')) ORDER BY at DESC LIMIT 100`).all();
  let firms = []; try { firms = (await env.DB.prepare(`SELECT contact AS name, firm, licence FROM partners WHERE status = 'active' ORDER BY firm LIMIT 200`).all()).results; } catch {}
  const tasks = (await env.DB.prepare(`SELECT t.*, c.name, c.phone, c.service, c.status AS c_status FROM crm_tasks t JOIN crm_contacts c ON c.id = t.contact_id
    WHERE t.status = 'open' ORDER BY t.due, t.created LIMIT 2000`).all()).results;
  return json({ ok: true, synced, rows: r.results, tasks, task_kinds: TASK_KINDS, statuses: STATUSES, channels: CHANNELS,
    services: [...new Set([...SERVICES, ...used.results.map((x) => x.service)])], rcics: [...rc.results, ...firms] });
}

async function capture(env, b) {
  const phone = str(b.phone, 40), email = str(b.email, 160), name = str(b.name, 120), detail = str(b.detail, 8000);
  if (!phoneKey(phone) && !isEmail(emailKey(email))) return json({ ok: false, error: "Enter a phone number (or an email if there's no phone)." }, 400);
  if (email && !isEmail(emailKey(email))) return json({ ok: false, error: "That email doesn't look right." }, 400);
  if (!detail) return json({ ok: false, error: "Write what they asked about." }, 400);
  const service = str(b.service, 120) || null;
  const { contact, created } = await upsert(env, { phone, name, email, location: str(b.location, 120), service, source: str(b.channel, 40) });
  if (!created && service && !contact.service) await env.DB.prepare(`UPDATE crm_contacts SET service = ?1 WHERE id = ?2`).bind(service, contact.id).run();
  if (!created && ["lost", "cancelled", "refunded"].includes(contact.status)) await env.DB.prepare(`UPDATE crm_contacts SET status = 'follow-up' WHERE id = ?1`).bind(contact.id).run();
  await addEvent(env, contact.id, { type: "query", channel: str(b.channel, 40) || null, at: atOf(b.at), detail: service && !created && service !== contact.service ? `${detail}\n(Asked about: ${service})` : detail });
  return json({ ok: true, id: contact.id, created });
}

async function update(env, c, b) {
  const f = {
    name: b.name !== undefined ? str(b.name, 120) || null : c.name,
    phone: b.phone !== undefined ? str(b.phone, 40) || null : c.phone,
    email: b.email !== undefined ? emailKey(str(b.email, 160)) || null : c.email,
    location: b.location !== undefined ? str(b.location, 120) || null : c.location,
    status: STATUSES[b.status] ? b.status : c.status,
    service: b.service !== undefined ? str(b.service, 120) || null : c.service,
    pinned: b.pinned !== undefined ? str(b.pinned, 8000) || null : c.pinned,
  };
  if (f.email && !isEmail(f.email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
  const pk = phoneKey(f.phone);
  if (pk && pk !== c.phone_key) {
    const other = await env.DB.prepare(`SELECT id, name FROM crm_contacts WHERE phone_key = ?1 AND id != ?2 LIMIT 1`).bind(pk, c.id).first();
    if (other) return json({ ok: false, error: `That number already belongs to ${other.name || "another contact"}.` }, 409);
  }
  await env.DB.prepare(`UPDATE crm_contacts SET name = ?1, phone = ?2, phone_key = ?3, email = ?4, location = ?5, status = ?6, service = ?7, pinned = ?8, updated = ?9 WHERE id = ?10`)
    .bind(f.name, f.phone, pk || null, f.email, f.location, f.status, f.service, f.pinned, nowIso(), c.id).run();
  if (f.status !== c.status) await addEvent(env, c.id, { type: "status", at: nowIso(), detail: `Status: ${STATUSES[c.status] || c.status || "–"} → ${STATUSES[f.status]}` });
  if ((f.service || "") !== (c.service || "")) await addEvent(env, c.id, { type: "status", at: nowIso(), detail: `Service type: ${c.service || "–"} → ${f.service || "–"}` });
  return json({ ok: true });
}

async function item(env, id) {
  const c = await env.DB.prepare(`SELECT * FROM crm_contacts WHERE id = ?1`).bind(id).first();
  if (!c) return json({ ok: false, error: "Contact not found." }, 404);
  const ev = (await env.DB.prepare(`SELECT * FROM crm_events WHERE contact_id = ?1 ORDER BY at DESC, created DESC LIMIT 1000`).bind(c.id).all()).results
    .map((e) => ({ ...e, meta: e.meta ? JSON.parse(e.meta) : null }));
  const invites = (await env.DB.prepare(`SELECT code, form_key, label, email, created, opens, last_open, archived FROM intake_invites WHERE crm_id = ?1 ORDER BY created DESC`).bind(c.id).all()).results;
  // Intake forms: started from a link sent here, or filled by an account with this contact's email.
  const codes = invites.map((v) => v.code), ph = codes.map((_, i) => `?${i + 2}`).join(",");
  const forms = (await env.DB.prepare(`SELECT i.id, i.form_key, i.status, i.progress, i.partial, i.created, i.updated, i.submitted, i.resubmitted, i.admin_status, i.invite_code, i.data
      FROM intakes i JOIN users u ON u.id = i.user_id WHERE ${c.email ? "LOWER(u.email) = ?1" : "0"}${codes.length ? ` OR i.invite_code IN (${ph})` : ""} ORDER BY i.created DESC LIMIT 50`)
    .bind(c.email || "", ...codes).all()).results.map((x) => { const d = parse(x.data); delete x.data; return { ...x, name: applicantName(d), form: (FORMS[x.form_key] || {}).name || x.form_key }; });
  const tasks = (await env.DB.prepare(`SELECT * FROM crm_tasks WHERE contact_id = ?1 ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, due, created`).bind(c.id).all()).results;
  return json({ ok: true, contact: c, events: ev, invites, forms, tasks, task_kinds: TASK_KINDS, link: site(env) });
}

async function sendIntake(env, c, b) {
  const fk = str(b.form, 40);
  if (!FORMS[fk]) return json({ ok: false, error: "Pick a form that's ready." }, 400);
  const email = emailKey(str(b.email, 160) || c.email || "");
  if (email && !isEmail(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
  const code = randomToken().slice(0, 12), now = nowIso(), link = `${site(env)}/intake/?i=${code}`;
  await env.DB.prepare(`INSERT INTO intake_invites (code, form_key, label, email, note, created, crm_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(code, fk, c.name || null, email || null, "Sent from CRM", now, c.id).run();
  let emailed = false;
  if (b.send && email) {
    const first = String(c.name || "").split(/\s+/)[0] || "there";
    emailed = await sendEmail(env, email, `Your ${FORMS[fk].name} form`,
      `Hi ${first},\n\nPlease use this secure link to fill in your information and upload your documents for: ${FORMS[fk].name}.\n\n${link}\n\nCreate an account (or sign in), then fill the form. Your answers save as you go, so you can come back to it any time before you submit.\n\nIf you have questions, reply to this email.\n\nWorkerPool`);
  }
  if (email && !c.email) await env.DB.prepare(`UPDATE crm_contacts SET email = ?1 WHERE id = ?2`).bind(email, c.id).run();
  await addEvent(env, c.id, { type: "intake", at: now, detail: `Intake form sent: ${FORMS[fk].name}${emailed ? ` (emailed to ${email})` : " (link copied to send)"}`, meta: { code, form: fk, link } });
  if (["new", "follow-up"].includes(c.status) && b.mark !== false) await env.DB.prepare(`UPDATE crm_contacts SET status = CASE WHEN retained_at IS NOT NULL THEN 'in-progress' ELSE status END WHERE id = ?1`).bind(c.id).run();
  return json({ ok: true, link, emailed, code });
}
