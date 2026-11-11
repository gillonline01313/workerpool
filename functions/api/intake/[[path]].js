// Client intake forms. Clients (signed in with a WorkerPool account) fill a form and upload documents;
// the admin (x-admin-key) creates links, sees every intake and opens the answers and files.
// Tables are created automatically. Files live privately in the RESUMES R2 bucket under intake/.
import { json, readJson, str, isEmail, getUser, sendEmail, randomToken, fileName, fileCheck, fileResponse, FILE_MAX } from "../../_lib.js";
import { FORMS, missing, progress, applicantName, CONSENT_V, CONSENT_TEXT, KEEP_TEXT, partnerConsent } from "../../../assets/intake-config.js";
import { buildCompleteFile, KEEP_DAYS } from "../../_intake_file.js";
import { ensureIntake } from "../../_partners.js";

const MAX_FILES = 150, MAX_PER_DOC = 20;
const ensure = ensureIntake;   // creates every intake, link and partner table and column
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
const mine = (env, u, intakeId) => env.DB.prepare(`SELECT i.*, p.firm AS firm, p.email AS firm_email FROM intakes i LEFT JOIN partners p ON p.id = i.partner_id WHERE i.id = ?1 AND i.user_id = ?2`).bind(intakeId || "", u.id).first();
const clientRow = (r) => ({ id: r.id, form_key: r.form_key, status: r.status, progress: r.progress, created: r.created, updated: r.updated, submitted: r.submitted, name: applicantName(parse(r.data)),
  consent_at: r.consent_at, keep_file: r.keep_file, final_at: r.final_at, final_size: r.final_size, final_name: r.final_name, final_expires: r.final_expires, docs_destroyed_at: r.docs_destroyed_at,
  final_ready: !!r.final_key, invite_code: r.invite_code, firm: r.partner_id ? r.firm || "your representative" : "" });
// A complete file the client didn't ask us to keep is removed after KEEP_DAYS. Runs whenever the admin list or a client's forms load.
async function sweep(env, where = "", bind = []) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(`SELECT id, final_key FROM intakes WHERE final_key IS NOT NULL AND final_expires IS NOT NULL AND final_expires < ?1 ${where} LIMIT 50`).bind(now, ...bind).all();
  for (const x of r.results) {
    if (env.RESUMES) await env.RESUMES.delete(x.final_key).catch(() => {});
    await env.DB.prepare(`UPDATE intakes SET final_key = NULL, final_size = NULL WHERE id = ?1`).bind(x.id).run();
  }
}

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
      inv = await env.DB.prepare(`SELECT v.*, p.firm, p.status AS p_status FROM intake_invites v LEFT JOIN partners p ON p.id = v.partner_id WHERE v.code = ?1 AND v.archived = 0`).bind(code).first();
      if (!inv || (inv.partner_id && inv.p_status !== "active")) return json({ ok: false, error: "This link is no longer active. Ask for a new one." }, 404);
      const now = new Date().toISOString();
      await env.DB.prepare(`UPDATE intake_invites SET opens = opens + 1, last_open = ?1, first_open = COALESCE(first_open, ?1) WHERE code = ?2`).bind(now, code).run();
    }
    const key = inv ? inv.form_key : fk;
    if (!FORMS[key]) return json({ ok: false, error: "This form isn't available yet." }, 404);
    return json({ ok: true, form: key, name: FORMS[key].name, for: inv && inv.label ? inv.label.split(/\s+/)[0] : "", email: inv && inv.email || "",
      firm: inv && inv.partner_id ? inv.firm || "" : "", single: !!(inv && inv.partner_id) });
  }

  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in to continue." }, 401);

  if (route === "mine" && m === "GET") {
    await sweep(env, "AND user_id = ?2", [u.id]);
    const r = await env.DB.prepare(`SELECT i.*, p.firm AS firm FROM intakes i LEFT JOIN partners p ON p.id = i.partner_id WHERE i.user_id = ?1 ORDER BY i.updated DESC LIMIT 50`).bind(u.id).all();
    return json({ ok: true, user: { name: u.name, email: u.email, phone: u.phone }, rows: r.results.map(clientRow) });
  }
  if (route === "start" && m === "POST") {
    const b = await readJson(request, 2000) || {};
    let fk = str(b.f, 40), code = str(b.i, 40) || null, partnerId = null;
    if (code) {
      const inv = await env.DB.prepare(`SELECT v.form_key, v.partner_id, p.status AS p_status FROM intake_invites v LEFT JOIN partners p ON p.id = v.partner_id WHERE v.code = ?1 AND v.archived = 0`).bind(code).first();
      if (inv && inv.partner_id && inv.p_status !== "active") return json({ ok: false, error: "This link is no longer active. Ask for a new one." }, 404);
      if (inv) { fk = inv.form_key; partnerId = inv.partner_id || null; } else code = null;
    }
    if (!FORMS[fk]) return json({ ok: false, error: "This form isn't available yet." }, 400);
    if (partnerId) { // a partner's link is paid per form: it opens one form, for the first account that starts it
      const used = await env.DB.prepare(`SELECT id, user_id FROM intakes WHERE invite_code = ?1 LIMIT 1`).bind(code).first();
      if (used && used.user_id === u.id) return json({ ok: true, id: used.id });
      if (used) return json({ ok: false, error: "This link was already used to start a form. Ask whoever sent it for a new link." }, 409);
    }
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM intakes WHERE user_id = ?1`).bind(u.id).first();
    if (n && n.n >= 20) return json({ ok: false, error: "You have reached the limit of 20 forms. Contact us for help." }, 400);
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const data = { contact: { email: u.email, phone: u.phone } };
    if (!b.other) { const [g, ...rest] = String(u.name || "").trim().split(/\s+/); if (rest.length) data.personal = { given_names: g, family_name: rest.join(" ") }; data.about = { for_whom: "Myself" }; }
    await env.DB.prepare(`INSERT INTO intakes (id, user_id, form_key, invite_code, status, data, progress, created, updated, partner_id) VALUES (?1, ?2, ?3, ?4, 'draft', ?5, 0, ?6, ?6, ?7)`)
      .bind(id, u.id, fk, code, JSON.stringify(data), now, partnerId).run();
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
    if (b.consent !== true) return json({ ok: false, error: "Read the consent and tick the box to agree before submitting." }, 400);
    const now = new Date().toISOString(), resub = !!a.submitted;
    const who = applicantName(data) || u.name, files = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM intake_docs WHERE intake_id = ?1`).bind(a.id).first()).n;
    if (a.partner_id) return await submitForPartner(env, u, a, form, { now, resub, who, files });
    if (b.keep !== "yes" && b.keep !== "no") return json({ ok: false, error: "Choose whether WorkerPool should keep a copy of your complete file." }, 400);
    const keep = b.keep === "yes" ? 1 : 0;
    await env.DB.prepare(`UPDATE intakes SET status = 'submitted', progress = 100, updated = ?1, submitted = COALESCE(submitted, ?1), resubmitted = ?2, admin_seen = NULL,
        consent_at = ?1, consent_text = ?3, keep_file = ?4, keep_changed = ?1 WHERE id = ?5`)
      .bind(now, resub ? now : null, `[${CONSENT_V}] ${CONSENT_TEXT} | Keep a copy: ${KEEP_TEXT[keep]}`, keep, a.id).run();
    await sendEmail(env, env.ADMIN_EMAIL, `${resub ? "Updated" : "New"} intake form: ${form.name} – ${who}`,
      `${resub ? "A client made changes and resubmitted their intake form." : "A client submitted an intake form."}\n\nApplicant: ${who}\nAccount: ${u.name} (${u.email}, ${u.phone})\nForm: ${form.name}\nFiles uploaded: ${files}\nSubmitted: ${now}\nConsent given: yes (documents to be destroyed, complete file to be shared with the client)\nKeep a copy with WorkerPool: ${keep ? "YES" : "NO"}\n\nOpen it in the admin dashboard: ${site(env)}/admin/ (Intake forms tab)`, u.email);
    await sendEmail(env, u.email, `We received your ${form.name} form`,
      `Hi ${String(u.name || "").split(" ")[0] || "there"},\n\nThank you. We received ${resub ? "the changes to " : ""}your information and documents for: ${form.name}${who && who !== u.name ? ` (applicant: ${who})` : ""}.\n\nOur team will review everything and contact you if anything else is needed. As you agreed, once your file is complete we will share the complete file with you and permanently destroy the documents you uploaded. ${keep ? "You asked us to keep a copy of your complete file in your WorkerPool account." : `You chose not to have us keep a copy, so the complete file will be removed ${KEEP_DAYS} days after we share it. Download it when we tell you it's ready.`}\n\nYou can sign in at ${site(env)}/intake/ any time to see what you sent.\n\nWorkerPool`);
    return json({ ok: true });
  }
  if (route === "keep" && m === "POST") { // the client changes their mind about WorkerPool keeping the complete file
    const b = await readJson(request, 2000) || {};
    const a = await mine(env, u, b.id);
    if (!a || !a.consent_at || a.partner_id) return json({ ok: false, error: "Form not found." }, 404);
    const keep = b.keep === "yes" ? 1 : 0, now = new Date().toISOString();
    const exp = keep ? null : a.final_key ? new Date(Math.max(Date.now(), Date.parse(a.final_at || now)) + KEEP_DAYS * 864e5).toISOString() : null;
    await env.DB.prepare(`UPDATE intakes SET keep_file = ?1, keep_changed = ?2, final_expires = ?3, consent_text = COALESCE(consent_text, '') || ?4 WHERE id = ?5`)
      .bind(keep, now, exp, ` | Changed ${now}: ${KEEP_TEXT[keep]}`, a.id).run();
    return json({ ok: true, final_expires: exp });
  }
  if (route === "final" && m === "GET") { // the client downloads their complete file
    const a = await mine(env, u, url.searchParams.get("id"));
    if (!a || !a.final_key || !env.RESUMES) return json({ ok: false, error: "Your complete file isn't available." }, 404);
    const obj = await env.RESUMES.get(a.final_key);
    if (!obj) return json({ ok: false, error: "Your complete file was removed." }, 404);
    await env.DB.prepare(`UPDATE intakes SET final_downloads = COALESCE(final_downloads, 0) + 1 WHERE id = ?1`).bind(a.id).run();
    return fileResponse(obj, a.final_name || "complete-file.zip", "application/zip");
  }
  if (route === "reopen" && m === "POST") {
    const b = await readJson(request, 2000) || {};
    const a = await mine(env, u, b.id);
    if (!a) return json({ ok: false, error: "Form not found." }, 404);
    if (a.status !== "submitted") return json({ ok: true, already: true });
    if (a.docs_destroyed_at) return json({ ok: false, error: "Your documents were already destroyed after your file was completed. Contact us to make a change." }, 409);
    if (a.admin_status === "done") return json({ ok: false, error: "Our team has finished working on this form. Contact us to make a change." }, 409);
    if (a.partner_id && a.partner_status === "done") return json({ ok: false, error: `${a.firm || "Your representative"} has finished working on this form. Contact them to make a change.` }, 409);
    await env.DB.prepare(`UPDATE intakes SET status = 'editing', updated = ?1 WHERE id = ?2`).bind(new Date().toISOString(), a.id).run();
    const form = FORMS[a.form_key];
    if (a.partner_id && a.firm_email) await sendEmail(env, a.firm_email, `Client reopened their form: ${form ? form.name : a.form_key} – ${applicantName(parse(a.data)) || u.name}`,
      `Your client reopened a submitted intake form to make changes. Hold work on it until they resubmit; you'll get another email when they do.\n\nClient account: ${u.name} (${u.email}, ${u.phone})\n\nPartner portal: ${site(env)}/partners/\n\nWorkerPool`, u.email);
    await sendEmail(env, env.ADMIN_EMAIL, `Intake form reopened for changes: ${form ? form.name : a.form_key} – ${applicantName(parse(a.data)) || u.name}`,
      `The client reopened a submitted intake form to make changes. Hold work on it until they resubmit.\n\nAccount: ${u.name} (${u.email}, ${u.phone})\n\n${site(env)}/admin/ (Intake forms tab)`, u.email);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

// A form sent by a partner firm: the consent names the firm, there's no "keep a copy" choice (the firm holds the file),
// and the firm is emailed alongside WorkerPool.
async function submitForPartner(env, u, a, form, { now, resub, who, files }) {
  const firm = a.firm || "your representative";
  await env.DB.prepare(`UPDATE intakes SET status = 'submitted', progress = 100, updated = ?1, submitted = COALESCE(submitted, ?1), resubmitted = ?2, admin_seen = NULL, partner_seen = NULL,
      consent_at = ?1, consent_text = ?3, keep_file = NULL, keep_changed = NULL WHERE id = ?4`)
    .bind(now, resub ? now : null, `[${CONSENT_V}-partner] ${partnerConsent(firm)}`, a.id).run();
  const body = `${resub ? "Your client made changes and resubmitted their intake form." : "Your client submitted an intake form."}\n\nApplicant: ${who}\nClient account: ${u.name} (${u.email}, ${u.phone})\nForm: ${form.name}\nFiles uploaded: ${files}\nSubmitted: ${now}\n\nOpen it in your partner portal to view and download the answers and documents: ${site(env)}/partners/`;
  if (a.firm_email) await sendEmail(env, a.firm_email, `${resub ? "Updated" : "New"} client intake form: ${form.name} – ${who}`, body + "\n\nWorkerPool", u.email);
  await sendEmail(env, env.ADMIN_EMAIL, `${resub ? "Updated" : "New"} partner intake form (${firm}): ${form.name} – ${who}`,
    body.replace("Your client", `${firm}'s client`).replace(`${site(env)}/partners/`, `${site(env)}/admin/ (Intake forms tab)`), u.email);
  await sendEmail(env, u.email, `We received your ${form.name} form`,
    `Hi ${String(u.name || "").split(" ")[0] || "there"},\n\nThank you. We received ${resub ? "the changes to " : ""}your information and documents for: ${form.name}${who && who !== u.name ? ` (applicant: ${who})` : ""}, and shared them securely with ${firm}.\n\n${firm} will review everything and contact you if anything else is needed. You can sign in at ${site(env)}/intake/ any time to see what you sent.\n\nWorkerPool (secure intake for ${firm})`, a.firm_email || undefined);
  return json({ ok: true });
}

/* ======================= admin ======================= */
const INV_COLS = `code, form_key, label, email, note, created, opens, first_open, last_open`;
async function admin({ request, env }, route, m) {
  const url = new URL(request.url);
  if (route === "list" && m === "GET") {
    await sweep(env);
    const rows = await env.DB.prepare(`SELECT i.id, i.form_key, i.invite_code, i.status, i.data, i.progress, i.created, i.updated, i.submitted, i.resubmitted, i.admin_seen, i.admin_status, i.admin_note, i.keep_file, i.final_at, i.docs_destroyed_at,
        u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, v.label AS invite_label, i.partner_id, p.firm AS partner_firm, i.partner_status,
        (SELECT COUNT(*) FROM intake_docs d WHERE d.intake_id = i.id) AS files
      FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN intake_invites v ON v.code = i.invite_code LEFT JOIN partners p ON p.id = i.partner_id ORDER BY COALESCE(i.resubmitted, i.submitted, i.updated) DESC LIMIT 2000`).all();
    const invites = await env.DB.prepare(`SELECT ${INV_COLS}, (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code) AS started,
        (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code AND i.submitted IS NOT NULL) AS done
      FROM intake_invites v WHERE archived = 0 AND partner_id IS NULL ORDER BY created DESC LIMIT 500`).all();
    return json({ ok: true, rows: rows.results.map((r) => { const d = parse(r.data); delete r.data; return { ...r, name: applicantName(d), phone: (d.contact || {}).phone || "", email: (d.contact || {}).email || "" }; }), invites: invites.results });
  }
  if (route === "count" && m === "GET") {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM intakes WHERE status = 'submitted' AND admin_seen IS NULL`).first();
    return json({ ok: true, unseen: (r && r.n) || 0 });
  }
  if (route === "item" && m === "GET") {
    const id = url.searchParams.get("id") || "";
    const r = await env.DB.prepare(`SELECT i.*, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, v.label AS invite_label,
        p.firm AS partner_firm, p.kind AS partner_kind, p.licence AS partner_licence, p.email AS partner_email, p.phone AS partner_phone
      FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN intake_invites v ON v.code = i.invite_code LEFT JOIN partners p ON p.id = i.partner_id WHERE i.id = ?1`).bind(id).first();
    if (!r) return json({ ok: false, error: "Not found." }, 404);
    const docs = await env.DB.prepare(`SELECT id, doc_key, name, size, type, uploaded FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(id).all();
    if (r.status === "submitted" && !r.admin_seen) await env.DB.prepare(`UPDATE intakes SET admin_seen = ?1 WHERE id = ?2`).bind(new Date().toISOString(), id).run();
    const form = FORMS[r.form_key];
    return json({ ok: true, row: { ...r, data: parse(r.data) }, docs: docs.results, missing: form ? missing(form, parse(r.data), r.docs_destroyed_at ? new Set(form.docs.map((d) => d.k)) : new Set(docs.results.map((d) => d.doc_key))) : [] });
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
  if (route === "final" && m === "GET") {
    const r = await env.DB.prepare(`SELECT final_key, final_name FROM intakes WHERE id = ?1`).bind(url.searchParams.get("id") || "").first();
    const obj = r && r.final_key && env.RESUMES ? await env.RESUMES.get(r.final_key) : null;
    if (!obj) return json({ ok: false, error: "No complete file." }, 404);
    return new Response(obj.body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${String(r.final_name || "complete-file.zip").replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
  }
  if (route === "zip" && m === "GET") { // master download: answers summary PDF plus every uploaded document, built on the spot
    const r = await env.DB.prepare(`SELECT i.*, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, p.firm AS partner_firm
      FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN partners p ON p.id = i.partner_id WHERE i.id = ?1`).bind(url.searchParams.get("id") || "").first();
    if (!r || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
    const docs = (await env.DB.prepare(`SELECT * FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(r.id).all()).results;
    let built;
    try { built = await buildCompleteFile(env, { ...r, data: parse(r.data) }, docs, { name: r.acct_name, email: r.acct_email, phone: r.acct_phone }); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    return new Response(built.bytes, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${built.name.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
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
  if (route === "finalize") { // build the complete file and share it with the client (in their account, plus an email)
    if (r.partner_id) return json({ ok: false, error: "This is a partner firm's form: the firm downloads the complete file from its partner portal." }, 409);
    if (r.status !== "submitted" || !r.consent_at) return json({ ok: false, error: "The client hasn't submitted this form with consent yet." }, 409);
    if (r.docs_destroyed_at) return json({ ok: false, error: "The documents were already destroyed, so the file can't be rebuilt." }, 409);
    if (!env.RESUMES) return json({ ok: false, error: "File storage isn't connected." }, 503);
    const acct = await env.DB.prepare(`SELECT name, email, phone FROM users WHERE id = ?1`).bind(r.user_id).first();
    const docs = (await env.DB.prepare(`SELECT * FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(r.id).all()).results;
    let built;
    try { built = await buildCompleteFile(env, { ...r, data: parse(r.data) }, docs, acct); } catch (e) { return json({ ok: false, error: e.message }, 400); }
    const key = `intake/final/${r.id}/${crypto.randomUUID()}.zip`, now = new Date().toISOString();
    await env.RESUMES.put(key, built.bytes, { httpMetadata: { contentType: "application/zip" }, customMetadata: { intake: r.id } });
    if (r.final_key) await env.RESUMES.delete(r.final_key).catch(() => {});
    const exp = r.keep_file ? null : new Date(Date.now() + KEEP_DAYS * 864e5).toISOString();
    await env.DB.prepare(`UPDATE intakes SET final_key = ?1, final_name = ?2, final_size = ?3, final_at = ?4, final_expires = ?5 WHERE id = ?6`).bind(key, built.name, built.bytes.length, now, exp, r.id).run();
    const form = FORMS[r.form_key], first = String(acct.name || "").split(" ")[0] || "there";
    const emailed = b.notify === false ? false : await sendEmail(env, acct.email, `Your complete ${form.name} file is ready`,
      `Hi ${first},\n\nYour complete file for ${form.name} is ready: the summary of your answers and every document you submitted, in one ZIP file.\n\nSign in to download it: ${site(env)}/intake/\n\n${r.keep_file ? "As you asked, we will keep a copy in your WorkerPool account for future reference." : `You chose not to have us keep a copy, so it will be removed on ${new Date(exp).toLocaleDateString("en-CA", { dateStyle: "long" })}. Please download it and keep it safe before then.`}\n\nAs you agreed when you submitted, the documents you uploaded will now be permanently destroyed by our team.\n\nWorkerPool`);
    return json({ ok: true, final_at: now, final_size: built.bytes.length, files: built.count, emailed });
  }
  if (route === "destroy") { // permanently delete every uploaded document (the client's complete file is kept per their choice)
    if (!r.final_key && !r.partner_id && b.force !== true) return json({ ok: false, error: "Share the complete file with the client first." }, 409);
    const docs = (await env.DB.prepare(`SELECT r2_key FROM intake_docs WHERE intake_id = ?1`).bind(r.id).all()).results;
    if (env.RESUMES) for (const d of docs) await env.RESUMES.delete(d.r2_key).catch(() => {});
    const now = new Date().toISOString();
    await env.DB.prepare(`DELETE FROM intake_docs WHERE intake_id = ?1`).bind(r.id).run();
    await env.DB.prepare(`UPDATE intakes SET docs_destroyed_at = ?1, docs_destroyed_count = ?2 WHERE id = ?3`).bind(now, docs.length, r.id).run();
    const acct = await env.DB.prepare(`SELECT name, email FROM users WHERE id = ?1`).bind(r.user_id).first();
    if (acct && b.notify !== false && !r.partner_id) await sendEmail(env, acct.email, "Your uploaded documents were destroyed",
      `Hi ${String(acct.name || "").split(" ")[0] || "there"},\n\nAs you agreed, we permanently destroyed the ${docs.length} document${docs.length === 1 ? "" : "s"} you uploaded for ${FORMS[r.form_key] ? FORMS[r.form_key].name : "your application"} on ${new Date(now).toLocaleDateString("en-CA", { dateStyle: "long" })}.\n\n${r.final_key ? (r.keep_file ? `Your complete file stays in your WorkerPool account for future reference: ${site(env)}/intake/` : `Your complete file is still available to download until ${new Date(r.final_expires).toLocaleDateString("en-CA", { dateStyle: "long" })}: ${site(env)}/intake/`) : ""}\n\nWorkerPool`);
    return json({ ok: true, destroyed: docs.length });
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
    if (env.RESUMES && r.final_key) await env.RESUMES.delete(r.final_key).catch(() => {});
    await env.DB.batch([env.DB.prepare(`DELETE FROM intake_docs WHERE intake_id = ?1`).bind(r.id), env.DB.prepare(`DELETE FROM intakes WHERE id = ?1`).bind(r.id)]);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}
