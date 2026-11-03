// Client intake forms. Clients (signed in with a WorkerPool account) fill a form and upload documents;
// the admin (x-admin-key) creates links, sees every intake and opens the answers and files.
// Tables are created automatically. Files live privately in the RESUMES R2 bucket under intake/.
import { json, readJson, str, isEmail, getUser, sendEmail, randomToken, fileName, fileCheck, fileResponse, FILE_MAX } from "../../_lib.js";
import { FORMS, missing, progress, applicantName } from "../../../assets/intake-config.js";

const MAX_FILES = 150, MAX_PER_DOC = 20;
let ready = false;
async function ensure(env) {
  if (ready) return;
  for (const q of [
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS intakes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, form_key TEXT NOT NULL, invite_code TEXT,
      status TEXT DEFAULT 'draft', data TEXT, progress INTEGER DEFAULT 0, created TEXT, updated TEXT, submitted TEXT, resubmitted TEXT,
      admin_seen TEXT, admin_status TEXT DEFAULT 'new', admin_note TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS intakes_user ON intakes (user_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS intake_docs (id TEXT PRIMARY KEY, intake_id TEXT NOT NULL, doc_key TEXT, name TEXT, size INTEGER, type TEXT, r2_key TEXT, uploaded TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS intake_docs_intake ON intake_docs (intake_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS intake_invites (code TEXT PRIMARY KEY, form_key TEXT NOT NULL, label TEXT, email TEXT, note TEXT,
      created TEXT, opens INTEGER DEFAULT 0, first_open TEXT, last_open TEXT, archived INTEGER DEFAULT 0)`),
  ]) await q.run();
  ready = true;
}
const site = (env) => env.SITE_URL || "https://workerpool.ca";
const parse = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
const isAdmin = (request, env) => !!env.ADMIN_KEY && same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY);
async function docKeys(env, intakeId) {
  const r = await env.DB.prepare(`SELECT DISTINCT doc_key FROM intake_docs WHERE intake_id = ?1`).bind(intakeId).all();
  return new Set(r.results.map((d) => d.doc_key));
}
const mine = (env, u, intakeId) => env.DB.prepare(`SELECT * FROM intakes WHERE id = ?1 AND user_id = ?2`).bind(intakeId || "", u.id).first();
const clientRow = (r) => ({ id: r.id, form_key: r.form_key, status: r.status, progress: r.progress, created: r.created, updated: r.updated, submitted: r.submitted, name: applicantName(parse(r.data)) });

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 503);
  await ensure(env);
  const route = (params.path || []).join("/");
  const m = request.method;
  try {
    if (route.startsWith("admin/")) {
      if (!isAdmin(request, env)) return json({ ok: false, error: "Wrong admin key." }, 401);
      return await admin(ctx, route.slice(6), m);
    }
    return await client(ctx, route, m);
  } catch (e) {
    console.error("intake", route, e);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}

/* ======================= client ======================= */
async function client({ request, env }, route, m) {
  const url = new URL(request.url);
  // Public: what a link opens (form name, and the first name it was prepared for). Counts the open.
  if (route === "link" && m === "GET") {
    const code = str(url.searchParams.get("i"), 40), fk = str(url.searchParams.get("f"), 40);
    let inv = null;
    if (code) {
      inv = await env.DB.prepare(`SELECT * FROM intake_invites WHERE code = ?1 AND archived = 0`).bind(code).first();
      if (!inv) return json({ ok: false, error: "This link is no longer active. Ask us for a new one." }, 404);
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE intake_invites SET opens = opens + 1, last_open = ?1, first_open = COALESCE(first_open, ?1) WHERE code = ?2`).bind(now, code).run();
    }
    const key = inv ? inv.form_key : fk;
    if (!FORMS[key]) return json({ ok: false, error: "This form isn't available yet." }, 404);
    return json({ ok: true, form: key, name: FORMS[key].name, for: inv && inv.label ? inv.label.split(/\s+/)[0] : "", email: inv && inv.email || "" });
  }

  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in to continue." }, 401);

  if (route === "mine" && m === "GET") {
    const r = await env.DB.prepare(`SELECT * FROM intakes WHERE user_id = ?1 ORDER BY updated DESC LIMIT 50`).bind(u.id).all();
    return json({ ok: true, user: { name: u.name, email: u.email, phone: u.phone }, rows: r.results.map(clientRow) });
  }
  if (route === "start" && m === "POST") {
    const b = await readJson(request, 2000) || {};
    let fk = str(b.f, 40), code = str(b.i, 40) || null;
    if (code) { const inv = await env.DB.prepare(`SELECT form_key FROM intake_invites WHERE code = ?1 AND archived = 0`).bind(code).first(); if (inv) fk = inv.form_key; else code = null; }
    if (!FORMS[fk]) return json({ ok: false, error: "This form isn't available yet." }, 400);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM intakes WHERE user_id = ?1`).bind(u.id).first();
    if (n && n.n >= 20) return json({ ok: false, error: "You have reached the limit of 20 forms. Contact us for help." }, 400);
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const data = { contact: { email: u.email, phone: u.phone } };
    if (!b.other) { const [g, ...rest] = String(u.name || "").trim().split(/\s+/); if (rest.length) data.personal = { given_names: g, family_name: rest.join(" ") }; data.about = { for_whom: "Myself" }; }
    await env.DB.prepare(`INSERT INTO intakes (id, user_id, form_key, invite_code, status, data, progress, created, updated) VALUES (?1, ?2, ?3, ?4, 'draft', ?5, 0, ?6, ?6)`)
      .bind(id, u.id, fk, code, JSON.stringify(data), now).run();
    return json({ ok: true, id });
  }
  if (route === "item" && m === "GET") {
    const a = await mine(env, u, url.searchParams.get("id"));
    if (!a) return json({ ok: false, error: "Form not found." }, 404);
    const docs = await env.DB.prepare(`SELECT id, doc_key, name, size, uploaded FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(a.id).all();
    return json({ ok: true, row: { ...clientRow(a), data: parse(a.data) }, docs: docs.results });
  }
  if (route === "item" && m === "PUT") {
    const b = await readJson(request, 400000);
    if (!b || typeof b.data !== "object" || Array.isArray(b.data)) return json({ ok: false, error: "Invalid request." }, 400);
    const a = await mine(env, u, b.id);
    if (!a) return json({ ok: false, error: "Form not found." }, 404);
    if (a.status === "submitted") return json({ ok: false, error: "This form was already submitted. Press Make changes to edit it." }, 409);
    const form = FORMS[a.form_key];
    const pct = form ? progress(form, b.data, await docKeys(env, a.id)) : 0;
    await env.DB.prepare(`UPDATE intakes SET data = ?1, progress = ?2, updated = ?3 WHERE id = ?4`).bind(JSON.stringify(b.data), pct, new Date().toISOString(), a.id).run();
    return json({ ok: true, progress: pct });
  }
  if (route === "doc" && m === "POST") {
    if (!env.RESUMES) return json({ ok: false, error: "Document upload isn't switched on yet." }, 503);
    const a = await mine(env, u, request.headers.get("x-intake-id"));
    if (!a) return json({ ok: false, error: "Form not found." }, 404);
    if (a.status === "submitted") return json({ ok: false, error: "This form was already submitted. Press Make changes to add documents." }, 409);
    const form = FORMS[a.form_key], dk = request.headers.get("x-doc-key") || "";
    if (!form || !form.docs.some((d) => d.k === dk)) return json({ ok: false, error: "Unknown document type." }, 400);
    if (parseInt(request.headers.get("content-length") || "0") > FILE_MAX + 1024) return json({ ok: false, error: "That file is over 10 MB." }, 413);
    const name = fileName(request), buf = await request.arrayBuffer();
    const chk = fileCheck(name, buf);
    if (chk.error) return json({ ok: false, error: chk.error }, 400);
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN doc_key = ?2 THEN 1 ELSE 0 END) AS k FROM intake_docs WHERE intake_id = ?1`).bind(a.id, dk).first();
    if ((c && c.n) >= MAX_FILES) return json({ ok: false, error: `This form has reached the ${MAX_FILES}-file limit.` }, 400);
    if ((c && c.k) >= MAX_PER_DOC) return json({ ok: false, error: `Up to ${MAX_PER_DOC} files per document. Combine pages into one PDF.` }, 400);
    const docId = crypto.randomUUID(), key = `intake/${u.id}/${a.id}/${docId}.${chk.ext}`, now = new Date().toISOString();
    await env.RESUMES.put(key, buf, { httpMetadata: { contentType: chk.type }, customMetadata: { name, intake: a.id, doc: dk } });
    await env.DB.prepare(`INSERT INTO intake_docs (id, intake_id, doc_key, name, size, type, r2_key, uploaded) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(docId, a.id, dk, name, buf.byteLength, chk.type, key, now).run();
    const pct = progress(form, parse(a.data), await docKeys(env, a.id));
    await env.DB.prepare(`UPDATE intakes SET progress = ?1, updated = ?2 WHERE id = ?3`).bind(pct, now, a.id).run();
    return json({ ok: true, doc: { id: docId, doc_key: dk, name, size: buf.byteLength, uploaded: now }, progress: pct });
  }
  if (route === "doc" && m === "DELETE") {
    const d = await env.DB.prepare(`SELECT d.*, i.status, i.form_key, i.data FROM intake_docs d JOIN intakes i ON i.id = d.intake_id WHERE d.id = ?1 AND i.user_id = ?2`)
      .bind(url.searchParams.get("id") || "", u.id).first();
    if (!d) return json({ ok: false, error: "File not found." }, 404);
    if (d.status === "submitted") return json({ ok: false, error: "This form was already submitted. Press Make changes first." }, 409);
    if (env.RESUMES) await env.RESUMES.delete(d.r2_key).catch(() => {});
    await env.DB.prepare(`DELETE FROM intake_docs WHERE id = ?1`).bind(d.id).run();
    const form = FORMS[d.form_key], pct = form ? progress(form, parse(d.data), await docKeys(env, d.intake_id)) : 0;
    await env.DB.prepare(`UPDATE intakes SET progress = ?1, updated = ?2 WHERE id = ?3`).bind(pct, new Date().toISOString(), d.intake_id).run();
    return json({ ok: true, progress: pct });
  }
  if (route === "doc" && m === "GET") {
    const d = await env.DB.prepare(`SELECT d.* FROM intake_docs d JOIN intakes i ON i.id = d.intake_id WHERE d.id = ?1 AND i.user_id = ?2`).bind(url.searchParams.get("id") || "", u.id).first();
    if (!d || !env.RESUMES) return json({ ok: false, error: "File not found." }, 404);
    const obj = await env.RESUMES.get(d.r2_key);
    if (!obj) return json({ ok: false, error: "That file was removed." }, 404);
    return fileResponse(obj, d.name, d.type);
  }
  if (route === "submit" && m === "POST") {
    const b = await readJson(request, 2000) || {};
    const a = await mine(env, u, b.id);
    if (!a) return json({ ok: false, error: "Form not found." }, 404);
    if (a.status === "submitted") return json({ ok: true, already: true });
    const form = FORMS[a.form_key], data = parse(a.data), keys = await docKeys(env, a.id);
    const miss = missing(form, data, keys);
    if (miss.length) return json({ ok: false, error: `Still needed: ${miss[0]}${miss.length > 1 ? ` (and ${miss.length - 1} more)` : ""}.`, missing: miss }, 400);
    const now = new Date().toISOString(), resub = !!a.submitted;
    await env.DB.prepare(`UPDATE intakes SET status = 'submitted', progress = 100, updated = ?1, submitted = COALESCE(submitted, ?1), resubmitted = ?2, admin_seen = NULL WHERE id = ?3`)
      .bind(now, resub ? now : null, a.id).run();
    const who = applicantName(data) || u.name, files = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM intake_docs WHERE intake_id = ?1`).bind(a.id).first()).n;
    await sendEmail(env, env.ADMIN_EMAIL, `${resub ? "Updated" : "New"} intake form: ${form.name} – ${who}`,
      `${resub ? "A client made changes and resubmitted their intake form." : "A client submitted an intake form."}\n\nApplicant: ${who}\nAccount: ${u.name} (${u.email}, ${u.phone})\nForm: ${form.name}\nFiles uploaded: ${files}\nSubmitted: ${now}\n\nOpen it in the admin dashboard: ${site(env)}/admin/ (Intake forms tab)`, u.email);
    await sendEmail(env, u.email, `We received your ${form.name} form`,
      `Hi ${String(u.name || "").split(" ")[0] || "there"},\n\nThank you. We received ${resub ? "the changes to " : ""}your information and documents for: ${form.name}${who && who !== u.name ? ` (applicant: ${who})` : ""}.\n\nOur team will review everything and contact you if anything else is needed. You can sign in at ${site(env)}/intake/ any time to see what you sent.\n\nWorkerPool`);
    return json({ ok: true });
  }
  if (route === "reopen" && m === "POST") {
    const b = await readJson(request, 2000) || {};
    const a = await mine(env, u, b.id);
    if (!a) return json({ ok: false, error: "Form not found." }, 404);
    if (a.status !== "submitted") return json({ ok: true, already: true });
    if (a.admin_status === "done") return json({ ok: false, error: "Our team has finished working on this form. Contact us to make a change." }, 409);
    await env.DB.prepare(`UPDATE intakes SET status = 'editing', updated = ?1 WHERE id = ?2`).bind(new Date().toISOString(), a.id).run();
    const form = FORMS[a.form_key];
    await sendEmail(env, env.ADMIN_EMAIL, `Intake form reopened for changes: ${form ? form.name : a.form_key} – ${applicantName(parse(a.data)) || u.name}`,
      `The client reopened a submitted intake form to make changes. Hold work on it until they resubmit.\n\nAccount: ${u.name} (${u.email}, ${u.phone})\n\n${site(env)}/admin/ (Intake forms tab)`, u.email);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

/* ======================= admin ======================= */
const INV_COLS = `code, form_key, label, email, note, created, opens, first_open, last_open`;
async function admin({ request, env }, route, m) {
  const url = new URL(request.url);
  if (route === "list" && m === "GET") {
    const rows = await env.DB.prepare(`SELECT i.id, i.form_key, i.invite_code, i.status, i.data, i.progress, i.created, i.updated, i.submitted, i.resubmitted, i.admin_seen, i.admin_status, i.admin_note,
        u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, v.label AS invite_label,
        (SELECT COUNT(*) FROM intake_docs d WHERE d.intake_id = i.id) AS files
      FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN intake_invites v ON v.code = i.invite_code ORDER BY COALESCE(i.resubmitted, i.submitted, i.updated) DESC LIMIT 2000`).all();
    const invites = await env.DB.prepare(`SELECT ${INV_COLS}, (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code) AS started,
        (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code AND i.submitted IS NOT NULL) AS done
      FROM intake_invites v WHERE archived = 0 ORDER BY created DESC LIMIT 500`).all();
    return json({ ok: true, rows: rows.results.map((r) => { const d = parse(r.data); delete r.data; return { ...r, name: applicantName(d), phone: (d.contact || {}).phone || "", email: (d.contact || {}).email || "" }; }), invites: invites.results });
  }
  if (route === "count" && m === "GET") {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM intakes WHERE status = 'submitted' AND admin_seen IS NULL`).first();
    return json({ ok: true, unseen: (r && r.n) || 0 });
  }
  if (route === "item" && m === "GET") {
    const id = url.searchParams.get("id") || "";
    const r = await env.DB.prepare(`SELECT i.*, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, v.label AS invite_label
      FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN intake_invites v ON v.code = i.invite_code WHERE i.id = ?1`).bind(id).first();
    if (!r) return json({ ok: false, error: "Not found." }, 404);
    const docs = await env.DB.prepare(`SELECT id, doc_key, name, size, type, uploaded FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(id).all();
    if (r.status === "submitted" && !r.admin_seen) await env.DB.prepare(`UPDATE intakes SET admin_seen = ?1 WHERE id = ?2`).bind(new Date().toISOString(), id).run();
    const form = FORMS[r.form_key];
    return json({ ok: true, row: { ...r, data: parse(r.data) }, docs: docs.results, missing: form ? missing(form, parse(r.data), new Set(docs.results.map((d) => d.doc_key))) : [] });
  }
  if (route === "doc" && m === "GET") {
    const d = await env.DB.prepare(`SELECT * FROM intake_docs WHERE id = ?1`).bind(url.searchParams.get("id") || "").first();
    if (!d || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
    const obj = await env.RESUMES.get(d.r2_key);
    if (!obj) return json({ ok: false, error: "That file was removed." }, 404);
    const inline = url.searchParams.get("view") === "1" && /^(application\/pdf|image\/(png|jpeg))$/.test(d.type || "");
    return new Response(obj.body, { headers: { "content-type": d.type || "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${String(d.name).replace(/"/g, "")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }
  if (m !== "POST") return json({ ok: false, error: "Not found." }, 404);
  const b = await readJson(request, 20000) || {};
  if (route === "invite") {
    const fk = str(b.f, 40);
    if (!FORMS[fk]) return json({ ok: false, error: "That form isn't ready yet." }, 400);
    const email = str(b.email, 120).toLowerCase();
    if (email && !isEmail(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
    const code = randomToken().slice(0, 12), now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO intake_invites (code, form_key, label, email, note, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(code, fk, str(b.label, 120) || null, email || null, str(b.note, 500) || null, now).run();
    let emailed = false;
    if (b.send && email) {
      const link = `${site(env)}/intake/?i=${code}`, first = (str(b.label, 120).split(/\s+/)[0]) || "there";
      emailed = await sendEmail(env, email, `Your ${FORMS[fk].name} form`,
        `Hi ${first},\n\nPlease use this secure link to fill in your information and upload your documents for: ${FORMS[fk].name}.\n\n${link}\n\nCreate an account (or sign in), then fill the form. Your answers save as you go, so you can come back to it any time before you submit.\n\nIf you have questions, reply to this email.\n\nWorkerPool`);
    }
    return json({ ok: true, code, link: `${site(env)}/intake/?i=${code}`, emailed });
  }
  if (route === "invite-archive") {
    await env.DB.prepare(`UPDATE intake_invites SET archived = 1 WHERE code = ?1`).bind(str(b.code, 40)).run();
    return json({ ok: true });
  }
  const r = await env.DB.prepare(`SELECT * FROM intakes WHERE id = ?1`).bind(str(b.id, 60)).first();
  if (!r) return json({ ok: false, error: "Not found." }, 404);
  if (route === "status") {
    const st = ["new", "reviewing", "need-info", "in-progress", "done"].includes(b.status) ? b.status : r.admin_status;
    await env.DB.prepare(`UPDATE intakes SET admin_status = ?1, admin_note = ?2, admin_seen = COALESCE(admin_seen, ?3) WHERE id = ?4`)
      .bind(st, typeof b.note === "string" ? b.note.slice(0, 5000) : r.admin_note, new Date().toISOString(), r.id).run();
    return json({ ok: true });
  }
  if (route === "unseen") {
    await env.DB.prepare(`UPDATE intakes SET admin_seen = NULL WHERE id = ?1`).bind(r.id).run();
    return json({ ok: true });
  }
  if (route === "unlock") { // let the client edit again (e.g. after asking for corrections)
    await env.DB.prepare(`UPDATE intakes SET status = 'editing', updated = ?1 WHERE id = ?2 AND status = 'submitted'`).bind(new Date().toISOString(), r.id).run();
    return json({ ok: true });
  }
  if (route === "delete") { // permanent: answers and every file
    const docs = await env.DB.prepare(`SELECT r2_key FROM intake_docs WHERE intake_id = ?1`).bind(r.id).all();
    if (env.RESUMES) for (const d of docs.results) await env.RESUMES.delete(d.r2_key).catch(() => {});
    await env.DB.batch([env.DB.prepare(`DELETE FROM intake_docs WHERE intake_id = ?1`).bind(r.id), env.DB.prepare(`DELETE FROM intakes WHERE id = ?1`).bind(r.id)]);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}
