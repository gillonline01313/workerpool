// Partner portal API (/partners/): RCICs and immigration law firms sign up, buy intake form credits,
// send personal intake links to their clients, and view and download their own clients' submitted forms.
//
// Partner routes (signed in with the wp_p cookie):
//   POST signup · login · logout · forgot · reset          account
//   GET  me                                                 firm, credits, prices, which forms can be sent
//   GET  dash                                               links, client forms, credit history
//   POST checkout { tr, pr }                                Stripe Checkout for form credits
//   GET  paid?session_id=                                   after payment: confirms with Stripe and adds the credits (once)
//   POST link { f, label, email, note, send }               personal client link (uses one credit)
//   POST link-off { code }                                  turns a link off; the credit comes back if no form was started
//   GET  item?id= · doc?id=[&view=1] · zip?id=              a submitted form, one document, everything as one ZIP
//   POST status { id, status, note } · unlock { id } · destroy { id } · profile { contact, phone, website, password? }
//   GET  setup-info?token=  ·  POST reset { token, password, agree }   set-password link (a firm the admin signed up accepts the terms here)
// Admin routes (x-admin-key) under /api/partners/admin/: list, ledger, status, grant (paid or complimentary), prices (standard),
//   create (sign up a firm: approved, own prices, complimentary forms, set-password link), firm-prices, setup-link.
import { json, readJson, str, isEmail, sendEmail, hashPassword, checkPassword, randomToken, sha256hex } from "../../_lib.js";
import { FORMS, upgradeIntake, missing, applicantName } from "../../../assets/intake-config.js";
import { intakeForm } from "../../_intake_req.js";
import { listReturns, sendBack, returnAction, closeReturns } from "../../_intake_return.js";
import { buildCompleteFile } from "../../_intake_file.js";
import { stripe } from "../../_scanpass.js";
import { ensureIntake, getPartner, createPartnerSession, partnerCookie, partnerToken, addCredits, spendCredit, creditView, prices, kindOf, money,
  KIND_LABEL, MAX_QTY, partnerCatalog, PARTNER_TERMS, PARTNER_TERMS_V } from "../../_partners.js";

const site = (env) => env.SITE_URL || "https://workerpool.ca";
const parse = (s) => { try { return upgradeIntake(JSON.parse(s || "{}")); } catch { return {}; } };
const KINDS = { rcic: "Regulated Canadian Immigration Consultant (RCIC)", lawyer: "Lawyer", notary: "Notary (Quebec)", paralegal: "Paralegal (Law Society of Ontario)", firm: "Immigration law or consulting firm" };
const P_STATUS = ["new", "reviewing", "need-info", "in-progress", "done"];
const MAX_FAILS = 5, LOCK_MIN = 15;
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
const isAdmin = (request, env) => !!env.ADMIN_KEY && same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY);
const withCookie = (o, cookie) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie } });
const readyKinds = () => ({ tr: Object.keys(FORMS).some((k) => kindOf(k) === "tr"), pr: Object.keys(FORMS).some((k) => kindOf(k) === "pr") });
const pub = (p) => ({ id: p.id, firm: p.firm, kind: p.kind, kind_label: KINDS[p.kind] || p.kind, licence: p.licence, contact: p.contact, email: p.email, phone: p.phone,
  website: p.website, city: p.city, province: p.province, status: p.status, credits: creditView(p), created: p.created });
const SETUP_DAYS = 14;
// A set-password link for a firm the admin signed up (or a fresh one to resend). Replaces any older link.
async function setupLink(env, pid) {
  const token = randomToken();
  await env.DB.prepare(`DELETE FROM partner_resets WHERE partner_id = ?1`).bind(pid).run();
  await env.DB.prepare(`INSERT INTO partner_resets (token_hash, partner_id, expires) VALUES (?1, ?2, ?3)`).bind(await sha256hex(token), pid, new Date(Date.now() + SETUP_DAYS * 864e5).toISOString()).run();
  return `${site(env)}/partners/?setup=${token}`;
}
const cents = (v) => { const t = String(v ?? "").trim(); if (!t) return null; const n = Math.round(parseFloat(t) * 100); return Number.isFinite(n) ? n : NaN; };

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 503);
  await ensureIntake(env);
  const route = (params.path || []).join("/"), m = request.method;
  try {
    if (route.startsWith("admin/")) {
      if (!isAdmin(request, env)) return json({ ok: false, error: "Wrong admin key." }, 401);
      return await admin(ctx, route.slice(6), m);
    }
    return await partner(ctx, route, m);
  } catch (e) {
    console.error("partners", route, e);
    return json({ ok: false, error: e && e.message && /Stripe|too large/i.test(e.message) ? e.message : "Something went wrong. Try again." }, 500);
  }
}

/* ======================= partner ======================= */
async function partner({ request, env }, route, m) {
  const url = new URL(request.url);
  if (route === "prices" && m === "GET") return json({ ok: true, prices: await prices(env), ready: readyKinds(), terms: PARTNER_TERMS });
  if (route === "signup" && m === "POST") return await signup(request, env);
  if (route === "login" && m === "POST") return await login(request, env);
  if (route === "logout" && m === "POST") {
    const t = partnerToken(request);
    if (t) await env.DB.prepare(`DELETE FROM partner_sessions WHERE token_hash = ?1`).bind(await sha256hex(t)).run();
    return withCookie({ ok: true }, partnerCookie("", 0));
  }
  if (route === "forgot" && m === "POST") {
    const b = await readJson(request, 1000) || {}, email = str(b.email, 120).toLowerCase();
    const p = email ? await env.DB.prepare(`SELECT id, contact FROM partners WHERE email = ?1`).bind(email).first() : null;
    if (p) {
      const token = randomToken();
      await env.DB.prepare(`DELETE FROM partner_resets WHERE partner_id = ?1`).bind(p.id).run();
      await env.DB.prepare(`INSERT INTO partner_resets (token_hash, partner_id, expires) VALUES (?1, ?2, ?3)`).bind(await sha256hex(token), p.id, new Date(Date.now() + 3600e3).toISOString()).run();
      await sendEmail(env, email, "Reset your WorkerPool partner password",
        `Hi ${String(p.contact || "").split(" ")[0] || "there"},\n\nUse this link to choose a new password for the WorkerPool partner portal. It works for 1 hour:\n${site(env)}/partners/?reset=${token}\n\nIf you didn't ask for this, you can ignore this email.\n\nWorkerPool`);
    }
    return json({ ok: true });   // same answer either way
  }
  if (route === "setup-info" && m === "GET") { // who a set-password / reset link is for, and whether they still have to accept the terms
    const r = await env.DB.prepare(`SELECT p.firm, p.contact, p.email, p.agreed_at FROM partner_resets x JOIN partners p ON p.id = x.partner_id WHERE x.token_hash = ?1 AND x.expires > ?2`)
      .bind(await sha256hex(str(url.searchParams.get("token"), 100)), new Date().toISOString()).first();
    if (!r) return json({ ok: false, error: "This link has expired or was already used. Ask WorkerPool for a new one, or use Forgot your password." }, 404);
    return json({ ok: true, firm: r.firm, contact: r.contact, email: r.email, needTerms: !r.agreed_at, terms: PARTNER_TERMS });
  }
  if (route === "reset" && m === "POST") {
    const b = await readJson(request, 2000) || {}, pass = typeof b.password === "string" ? b.password : "";
    if (pass.length < 10 || pass.length > 200) return json({ ok: false, error: "Password needs at least 10 characters." }, 400);
    const r = await env.DB.prepare(`SELECT x.*, p.agreed_at FROM partner_resets x JOIN partners p ON p.id = x.partner_id WHERE x.token_hash = ?1 AND x.expires > ?2`).bind(await sha256hex(str(b.token, 100)), new Date().toISOString()).first();
    if (!r) return json({ ok: false, error: "This link has expired or was already used. Request a new one." }, 400);
    if (!r.agreed_at && b.agree !== true) return json({ ok: false, error: "Read and accept the partner terms to continue." }, 400);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE partners SET pass_hash = ?1, fail_count = 0, locked_until = '' WHERE id = ?2`).bind(await hashPassword(pass), r.partner_id),
      ...(r.agreed_at ? [] : [env.DB.prepare(`UPDATE partners SET agreed_at = ?1, agreed_text = ?2, ip_hash = ?3 WHERE id = ?4`)
        .bind(now, `[${PARTNER_TERMS_V}] ${PARTNER_TERMS}`, await sha256hex("partner:" + (request.headers.get("cf-connecting-ip") || "")), r.partner_id)]),
      env.DB.prepare(`DELETE FROM partner_resets WHERE partner_id = ?1`).bind(r.partner_id),
      env.DB.prepare(`DELETE FROM partner_sessions WHERE partner_id = ?1`).bind(r.partner_id),
    ]);
    return json({ ok: true });
  }
  // Stripe return: confirms the payment and adds the credits to the firm named in the session (exactly once).
  if (route === "paid" && m === "GET") return await paid(env, str(url.searchParams.get("session_id"), 200));

  const p = await getPartner(request, env);
  if (!p) return json({ ok: false, error: "Sign in to continue." }, 401);
  if (p.status === "pending") { // waiting for WorkerPool to approve the firm: they can sign in and see that, nothing else
    if (route === "me" && m === "GET") return json({ ok: true, pending: true, partner: pub(p), prices: await prices(env, p), ready: readyKinds(), payments: !!env.STRIPE_SECRET_KEY, catalog: partnerCatalog(), forms: Object.keys(FORMS) });
    return json({ ok: false, pending: true, error: "Your partner account is waiting for approval. We'll email you as soon as it's approved." }, 403);
  }
  if (p.status !== "active") return json({ ok: false, error: p.status === "declined" ? "Your partner application wasn't approved. Contact WorkerPool at info@workerpool.ca if you have questions." : "Your partner account is paused. Contact WorkerPool at info@workerpool.ca." }, 403);

  if (route === "me" && m === "GET") {
    const pr = await prices(env, p), rk = readyKinds();
    return json({ ok: true, partner: pub(p), prices: pr, ready: rk, payments: !!env.STRIPE_SECRET_KEY, catalog: partnerCatalog(), forms: Object.keys(FORMS) });
  }
  if (route === "dash" && m === "GET") {
    const links = await env.DB.prepare(`SELECT v.code, v.form_key, v.label, v.email, v.note, v.created, v.opens, v.last_open, v.archived, v.refunded, v.price_kind,
        (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code) AS started, (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code AND i.submitted IS NOT NULL) AS done
      FROM intake_invites v WHERE v.partner_id = ?1 ORDER BY v.created DESC LIMIT 1000`).bind(p.id).all();
    const rows = await env.DB.prepare(`SELECT i.id, i.form_key, i.invite_code, i.status, i.data, i.progress, i.created, i.updated, i.submitted, i.resubmitted, i.partner_seen, i.partner_status,
        i.docs_destroyed_at, i.partner_downloads, i.partial, i.missing_n, (SELECT COUNT(*) FROM intake_returns t WHERE t.intake_id = i.id AND t.status = 'open') AS ret_open, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, v.label AS invite_label,
        (SELECT COUNT(*) FROM intake_docs d WHERE d.intake_id = i.id) AS files
      FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN intake_invites v ON v.code = i.invite_code WHERE i.partner_id = ?1 ORDER BY COALESCE(i.resubmitted, i.submitted, i.updated) DESC LIMIT 2000`).bind(p.id).all();
    const ledger = await env.DB.prepare(`SELECT kind, delta, reason, ref, amount, created, comp FROM partner_ledger WHERE partner_id = ?1 ORDER BY id DESC LIMIT 100`).bind(p.id).all();
    return json({ ok: true, partner: pub(p), links: links.results, ledger: ledger.results,
      rows: rows.results.map((r) => { const d = parse(r.data); delete r.data; return { ...r, name: applicantName(d) }; }) });
  }
  if (route === "checkout" && m === "POST") {
    if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Online payment isn't switched on yet. Contact WorkerPool to add credits." }, 503);
    const b = await readJson(request, 1000) || {}, pr = await prices(env, p), rk = readyKinds();
    const q = { tr: Math.max(0, Math.min(MAX_QTY, parseInt(b.tr) || 0)), pr: Math.max(0, Math.min(MAX_QTY, parseInt(b.pr) || 0)) };
    if (q.pr && !rk.pr) return json({ ok: false, error: "Permanent residence forms aren't available yet." }, 400);
    if (!q.tr && !q.pr) return json({ ok: false, error: "Choose how many forms to buy." }, 400);
    const items = {}; let i = 0;
    for (const k of ["tr", "pr"]) if (q[k]) items[i++] = { quantity: q[k], price_data: { currency: "cad", unit_amount: pr[k],
      product_data: { name: `${KIND_LABEL[k]} intake form`, description: `WorkerPool client intake form credit (${money(pr[k])} each). One credit = one personal client link.` } } };
    const s = await stripe(env, "POST", "checkout/sessions", {
      mode: "payment", line_items: items, customer_email: p.email,
      success_url: `${site(env)}/partners/?paid={CHECKOUT_SESSION_ID}`, cancel_url: `${site(env)}/partners/?cancelled=1`,
      metadata: { product: "partner-credits", partner_id: p.id, tr: String(q.tr), pr: String(q.pr), price_tr: String(pr.tr), price_pr: String(pr.pr) },
      payment_intent_data: { description: `WorkerPool intake form credits – ${p.firm}`, metadata: { product: "partner-credits", partner_id: p.id } },
      ...(env.STRIPE_TAX === "on" ? { automatic_tax: { enabled: "true" } } : {}),
    });
    return json({ ok: true, url: s.url });
  }
  if (route === "link" && m === "POST") {
    const b = await readJson(request, 4000) || {}, fk = str(b.f, 40);
    if (!FORMS[fk]) return json({ ok: false, error: "That form isn't available yet." }, 400);
    const label = str(b.label, 120), email = str(b.email, 120).toLowerCase();
    if (!label) return json({ ok: false, error: "Enter your client's name." }, 400);
    if (email && !isEmail(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
    const kind = kindOf(fk), pr = await prices(env, p), code = randomToken().slice(0, 14);
    const spent = await spendCredit(env, p.id, kind, `Client link: ${FORMS[fk].name} – ${label}`, code);
    if (!spent) return json({ ok: false, error: `You have no ${KIND_LABEL[kind]} form credits left. Buy more to create this link.`, need: kind }, 402);
    await env.DB.prepare(`INSERT INTO intake_invites (code, form_key, label, email, note, created, partner_id, price_kind, price_cents, comp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
      .bind(code, fk, label, email || null, str(b.note, 500) || null, new Date().toISOString(), p.id, kind, spent.comp ? 0 : pr[kind], spent.comp ? 1 : null).run();
    const link = `${site(env)}/intake/?i=${code}`;
    let emailed = false;
    if (b.send && email) emailed = await sendEmail(env, email, `${p.firm}: your ${FORMS[fk].name} form`,
      `Hi ${label.split(/\s+/)[0]},\n\n${p.firm} asked you to fill in your information and upload your documents for: ${FORMS[fk].name}.\n\nUse this secure link:\n${link}\n\nCreate an account (or sign in), then fill the form. Your answers save as you go, so you can come back any time before you submit. When you submit, your information is shared securely with ${p.firm}.\n\nIf you have questions about your application, reply to this email to reach ${p.firm}.\n\nWorkerPool (secure intake for ${p.firm})`, p.email);
    return json({ ok: true, code, link, emailed, credits: await credits(env, p.id) });
  }
  if (route === "link-off" && m === "POST") {
    const b = await readJson(request, 1000) || {};
    const v = await env.DB.prepare(`SELECT * FROM intake_invites WHERE code = ?1 AND partner_id = ?2`).bind(str(b.code, 40), p.id).first();
    if (!v) return json({ ok: false, error: "Link not found." }, 404);
    if (v.archived) return json({ ok: true, already: true });
    const started = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM intakes WHERE invite_code = ?1`).bind(v.code).first()).n;
    await env.DB.prepare(`UPDATE intake_invites SET archived = 1, refunded = ?1 WHERE code = ?2`).bind(started ? 0 : 1, v.code).run();
    if (!started && v.price_kind) await addCredits(env, p.id, v.price_kind, 1, `Refund: link turned off before use – ${v.label || ""}`, v.code, null, !!v.comp);
    return json({ ok: true, refunded: !started, credits: await credits(env, p.id) });
  }
  if (route === "profile" && m === "POST") {
    const b = await readJson(request, 4000) || {};
    if (b.password) {
      if (!(await checkPassword(String(b.current || ""), p.pass_hash))) return json({ ok: false, error: "Your current password doesn't match." }, 400);
      if (String(b.password).length < 10) return json({ ok: false, error: "New password needs at least 10 characters." }, 400);
      await env.DB.prepare(`UPDATE partners SET pass_hash = ?1 WHERE id = ?2`).bind(await hashPassword(String(b.password)), p.id).run();
    }
    await env.DB.prepare(`UPDATE partners SET contact = ?1, phone = ?2, website = ?3 WHERE id = ?4`)
      .bind(str(b.contact, 120) || p.contact, str(b.phone, 40) || p.phone, str(b.website, 200), p.id).run();
    return json({ ok: true });
  }

  /* ---- one client's form (only this firm's, and only once the client has submitted it) ---- */
  const id = m === "GET" ? url.searchParams.get("id") : null;
  const b = m === "POST" ? await readJson(request, 20000) || {} : {};
  if (route === "doc" && m === "GET") {
    const d = await env.DB.prepare(`SELECT d.* FROM intake_docs d JOIN intakes i ON i.id = d.intake_id WHERE d.id = ?1 AND i.partner_id = ?2 AND i.submitted IS NOT NULL`).bind(id || "", p.id).first();
    if (!d || !env.RESUMES) return json({ ok: false, error: "File not found." }, 404);
    const obj = await env.RESUMES.get(d.r2_key);
    if (!obj) return json({ ok: false, error: "That file was removed." }, 404);
    const inline = url.searchParams.get("view") === "1" && /^(application\/pdf|image\/(png|jpeg))$/.test(d.type || "");
    return new Response(obj.body, { headers: { "content-type": d.type || "application/octet-stream", "content-disposition": `${inline ? "inline" : "attachment"}; filename="${String(d.name).replace(/"/g, "")}"`,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }
  const r = await env.DB.prepare(`SELECT i.*, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone, v.label AS invite_label
    FROM intakes i JOIN users u ON u.id = i.user_id LEFT JOIN intake_invites v ON v.code = i.invite_code WHERE i.id = ?1 AND i.partner_id = ?2`).bind(str(id || b.id, 60), p.id).first();
  if (!r) return json({ ok: false, error: "Form not found." }, 404);
  if (!r.submitted) return json({ ok: false, error: "Your client hasn't submitted this form yet. You can open it once they do." }, 409);
  const { form, extra } = await intakeForm(env, r);
  if (route === "item" && m === "GET") {
    const docs = await env.DB.prepare(`SELECT id, doc_key, name, size, type, uploaded FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(r.id).all();
    if (r.status === "submitted" && !r.partner_seen) await env.DB.prepare(`UPDATE intakes SET partner_seen = ?1 WHERE id = ?2`).bind(new Date().toISOString(), r.id).run();
    const row = { id: r.id, form_key: r.form_key, form_v: r.form_v || 1, status: r.status, data: parse(r.data), progress: r.progress, created: r.created, updated: r.updated, submitted: r.submitted, resubmitted: r.resubmitted,
      consent_at: r.consent_at, consent_text: r.consent_text, partner_status: r.partner_status, partner_note: r.partner_note, partner_downloads: r.partner_downloads,
      docs_destroyed_at: r.docs_destroyed_at, docs_destroyed_count: r.docs_destroyed_count, acct_name: r.acct_name, acct_email: r.acct_email, acct_phone: r.acct_phone, invite_label: r.invite_label, partial: !!r.partial, missing_n: r.missing_n || 0 };
    const have = r.docs_destroyed_at ? new Set(form.docs.map((d) => d.k)) : new Set(docs.results.map((d) => d.doc_key));
    return json({ ok: true, row, docs: docs.results, extra, missing: form ? missing(form, row.data, have) : [], returns: await listReturns(env, r.id) });
  }
  if (route === "zip" && m === "GET") {
    if (!env.RESUMES) return json({ ok: false, error: "File storage isn't connected." }, 503);
    const docs = (await env.DB.prepare(`SELECT * FROM intake_docs WHERE intake_id = ?1 ORDER BY uploaded`).bind(r.id).all()).results;
    const built = await buildCompleteFile(env, { ...r, data: parse(r.data), partner_firm: p.firm }, docs, { name: r.acct_name, email: r.acct_email, phone: r.acct_phone }, extra);
    await env.DB.prepare(`UPDATE intakes SET partner_downloads = COALESCE(partner_downloads, 0) + 1 WHERE id = ?1`).bind(r.id).run();
    return new Response(built.bytes, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${built.name.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
  }
  if (m !== "POST") return json({ ok: false, error: "Not found." }, 404);
  if (route === "status") {
    const st = P_STATUS.includes(b.status) ? b.status : r.partner_status;
    await env.DB.prepare(`UPDATE intakes SET partner_status = ?1, partner_note = ?2, partner_seen = COALESCE(partner_seen, ?3) WHERE id = ?4`)
      .bind(st, typeof b.note === "string" ? b.note.slice(0, 5000) : r.partner_note, new Date().toISOString(), r.id).run();
    return json({ ok: true });
  }
  if (route === "unseen") { await env.DB.prepare(`UPDATE intakes SET partner_seen = NULL WHERE id = ?1`).bind(r.id).run(); return json({ ok: true }); }
  if (route === "return") return await sendBack(env, r, b, { statusCol: "partner_status" });
  if (route === "return-remind" || route === "return-cancel") return await returnAction(env, r, route, b.rid);
  if (route === "unlock") {
    if (r.docs_destroyed_at) return json({ ok: false, error: "The documents were already deleted, so the form can't be reopened." }, 409);
    await closeReturns(env, r.id);
    await env.DB.prepare(`UPDATE intakes SET status = 'editing', updated = ?1 WHERE id = ?2 AND status = 'submitted'`).bind(new Date().toISOString(), r.id).run();
    if (b.notify !== false && r.acct_email) await sendEmail(env, r.acct_email, `${p.firm} asked you to update your ${form ? form.name : ""} form`,
      `Hi ${String(r.acct_name || "").split(" ")[0] || "there"},\n\n${p.firm} reopened your intake form so you can make changes or add documents.${typeof b.message === "string" && b.message.trim() ? `\n\nMessage from ${p.firm}:\n${b.message.trim().slice(0, 2000)}` : ""}\n\nSign in, make the changes and press Submit again: ${site(env)}/intake/\n\nWorkerPool (secure intake for ${p.firm})`, p.email);
    return json({ ok: true });
  }
  if (route === "destroy") { // the firm has its complete file: delete the uploaded documents from WorkerPool (the answers stay)
    if (r.docs_destroyed_at) return json({ ok: true, already: true });
    if (!r.partner_downloads) return json({ ok: false, error: "Download the complete file (ZIP) first, so you have every document before they are deleted." }, 409);
    const docs = (await env.DB.prepare(`SELECT r2_key FROM intake_docs WHERE intake_id = ?1`).bind(r.id).all()).results;
    if (env.RESUMES) for (const d of docs) await env.RESUMES.delete(d.r2_key).catch(() => {});
    const now = new Date().toISOString();
    await env.DB.prepare(`DELETE FROM intake_docs WHERE intake_id = ?1`).bind(r.id).run();
    await env.DB.prepare(`UPDATE intakes SET docs_destroyed_at = ?1, docs_destroyed_count = ?2 WHERE id = ?3`).bind(now, docs.length, r.id).run();
    if (r.acct_email) await sendEmail(env, r.acct_email, "Your uploaded documents were deleted from WorkerPool",
      `Hi ${String(r.acct_name || "").split(" ")[0] || "there"},\n\nAs you agreed, the ${docs.length} document${docs.length === 1 ? "" : "s"} you uploaded for ${form ? form.name : "your application"} were permanently deleted from WorkerPool on ${new Date(now).toLocaleDateString("en-CA", { dateStyle: "long" })}, after ${p.firm} received your complete file.\n\nWorkerPool (secure intake for ${p.firm})`, p.email);
    return json({ ok: true, destroyed: docs.length });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

async function credits(env, pid) {
  const c = await env.DB.prepare(`SELECT credits_tr, credits_pr, free_tr, free_pr FROM partners WHERE id = ?1`).bind(pid).first();
  return creditView(c || {});
}

async function signup(request, env) {
  const b = await readJson(request, 6000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  const f = { firm: str(b.firm, 140), kind: KINDS[b.kind] ? b.kind : "", licence: str(b.licence, 60), contact: str(b.contact, 120), email: str(b.email, 120).toLowerCase(),
    phone: str(b.phone, 40), website: str(b.website, 200), city: str(b.city, 80), province: str(b.province, 40) };
  const pass = typeof b.password === "string" ? b.password : "";
  if (!f.firm) return json({ ok: false, error: "Enter your firm or practice name." }, 400);
  if (!f.kind) return json({ ok: false, error: "Choose what kind of representative you are." }, 400);
  if (f.licence.length < 3) return json({ ok: false, error: f.kind === "rcic" ? "Enter your CICC licence number (for example R712345)." : "Enter your law society or licence number." }, 400);
  if (f.kind === "rcic" && !/^R?\d{6}$/i.test(f.licence.replace(/\s/g, ""))) return json({ ok: false, error: "A CICC licence number looks like R712345." }, 400);
  if (!f.contact) return json({ ok: false, error: "Enter the contact person's name." }, 400);
  if (!isEmail(f.email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
  if (f.phone.replace(/\D/g, "").length < 7) return json({ ok: false, error: "Enter a phone number." }, 400);
  if (pass.length < 10 || pass.length > 200) return json({ ok: false, error: "Password needs at least 10 characters." }, 400);
  if (b.agree !== true) return json({ ok: false, error: "Read and accept the partner terms to continue." }, 400);
  const ipHash = await sha256hex("partner:" + (request.headers.get("cf-connecting-ip") || ""));
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM partners WHERE ip_hash = ?1 AND created > ?2`).bind(ipHash, new Date(Date.now() - 36e5).toISOString()).first();
  if (recent && recent.n >= 3) return json({ ok: false, error: "Too many sign-ups from this connection. Try again later." }, 429);
  if (await env.DB.prepare(`SELECT id FROM partners WHERE email = ?1`).bind(f.email).first()) return json({ ok: false, error: "A partner account already uses this email. Sign in instead." }, 409);
  if (f.kind === "rcic") f.licence = "R" + f.licence.replace(/\D/g, "");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO partners (id, firm, kind, licence, contact, email, phone, website, city, province, pass_hash, status, created, agreed_at, agreed_text, ip_hash)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', ?12, ?12, ?13, ?14)`)
    .bind(id, f.firm, f.kind, f.licence, f.contact, f.email, f.phone, f.website || null, f.city || null, f.province || null, await hashPassword(pass), now, `[${PARTNER_TERMS_V}] ${PARTNER_TERMS}`, ipHash).run();
  await sendEmail(env, env.ADMIN_EMAIL, `Approve new intake partner: ${f.firm}`,
    `A firm applied for a partner account for intake forms. It can't buy credits or send forms until you approve it.\n\nFirm: ${f.firm}\nType: ${KINDS[f.kind]}\nLicence: ${f.licence}${f.kind === "rcic" ? " (check it on the CICC public register at https://college-ic.ca/)" : ""}\nContact: ${f.contact} (${f.email}, ${f.phone})\nWebsite: ${f.website || "-"}\nLocation: ${[f.city, f.province].filter(Boolean).join(", ") || "-"}\n\nApprove or decline it in the admin dashboard: ${site(env)}/admin/ (Partners tab)`, f.email);
  await sendEmail(env, f.email, "We received your WorkerPool partner application",
    `Hi ${f.contact.split(" ")[0]},\n\nThank you for applying for a WorkerPool partner account for ${f.firm}. Our team will check your licence and approve your account, usually within one business day. We'll email you as soon as it's approved.\n\nOnce approved, here's how it works (${site(env)}/partners/):\n1. Buy form credits (Temporary residence forms and Permanent residence forms are priced separately).\n2. Create a personal link for each client and send it by email or WhatsApp. Each link uses one credit.\n3. Your client fills the form and uploads documents. You get an email when they submit.\n4. Open the form in your portal to view every answer and document, and download everything as one ZIP.\n\nWorkerPool`);
  const cookie = await createPartnerSession(env, id);
  return withCookie({ ok: true }, cookie);
}

async function login(request, env) {
  const b = await readJson(request, 2000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  const email = str(b.email, 120).toLowerCase(), pass = typeof b.password === "string" ? b.password : "";
  const bad = () => json({ ok: false, error: "Email or password doesn't match." }, 401);
  const p = email ? await env.DB.prepare(`SELECT * FROM partners WHERE email = ?1`).bind(email).first() : null;
  if (!p) return bad();
  const now = new Date();
  if (p.locked_until && p.locked_until > now.toISOString()) return json({ ok: false, error: `Too many attempts. Try again in ${LOCK_MIN} minutes, or reset your password.` }, 429);
  if (!(await checkPassword(pass, p.pass_hash))) {
    const fails = (p.fail_count || 0) + 1;
    await env.DB.prepare(`UPDATE partners SET fail_count = ?1, locked_until = ?2 WHERE id = ?3`)
      .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MIN * 60000).toISOString() : "", p.id).run();
    return bad();
  }
  if (p.status !== "active" && p.status !== "pending") return json({ ok: false, error: p.status === "declined" ? "This partner application wasn't approved. Contact WorkerPool at info@workerpool.ca." : "This partner account is paused. Contact WorkerPool at info@workerpool.ca." }, 403);
  await env.DB.prepare(`UPDATE partners SET fail_count = 0, locked_until = '', last_login = ?1 WHERE id = ?2`).bind(now.toISOString(), p.id).run();
  return withCookie({ ok: true }, await createPartnerSession(env, p.id));
}

async function paid(env, sessionId) {
  if (!sessionId || !env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Payment not found." }, 400);
  const s = await stripe(env, "GET", "checkout/sessions/" + encodeURIComponent(sessionId));
  const md = s.metadata || {};
  if (md.product !== "partner-credits" || !md.partner_id) return json({ ok: false, error: "Payment not found." }, 404);
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return json({ ok: false, error: "The payment isn't complete yet." }, 402);
  const q = { tr: parseInt(md.tr) || 0, pr: parseInt(md.pr) || 0 };
  const ins = await env.DB.prepare(`INSERT OR IGNORE INTO partner_payments (session_id, partner_id, tr, pr, amount, currency, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(s.id, md.partner_id, q.tr, q.pr, s.amount_total || 0, s.currency || "cad", new Date().toISOString()).run();
  if (ins.meta && ins.meta.changes) {
    for (const k of ["tr", "pr"]) if (q[k]) await addCredits(env, md.partner_id, k, q[k], `Purchase: ${q[k]} × ${KIND_LABEL[k]}`, s.id, (parseInt(md["price_" + k]) || 0) * q[k]);
    const p = await env.DB.prepare(`SELECT firm, email FROM partners WHERE id = ?1`).bind(md.partner_id).first();
    if (p) await sendEmail(env, env.ADMIN_EMAIL, `Partner payment: ${p.firm} – ${money(s.amount_total || 0)}`,
      `${p.firm} (${p.email}) bought intake form credits.\n\nTemporary residence: ${q.tr}\nPermanent residence: ${q.pr}\nPaid: ${money(s.amount_total || 0)} ${String(s.currency || "cad").toUpperCase()}\nStripe session: ${s.id}`);
  }
  return json({ ok: true, added: q, first: !!(ins.meta && ins.meta.changes) });
}

/* ======================= admin ======================= */
async function admin({ request, env }, route, m) {
  const url = new URL(request.url);
  if (route === "list" && m === "GET") {
    const r = await env.DB.prepare(`SELECT p.id, p.firm, p.kind, p.licence, p.contact, p.email, p.phone, p.website, p.city, p.province, p.status, p.credits_tr, p.credits_pr, p.created, p.last_login, p.admin_note,
        p.price_tr, p.price_pr, p.free_tr, p.free_pr, p.added_by, p.invited_at, p.agreed_at,
        (SELECT COUNT(*) FROM intake_invites v WHERE v.partner_id = p.id AND v.comp = 1 AND COALESCE(v.refunded, 0) = 0) AS comp_used,
        (SELECT COUNT(*) FROM intake_invites v WHERE v.partner_id = p.id) AS links,
        (SELECT COUNT(*) FROM intakes i WHERE i.partner_id = p.id AND i.submitted IS NOT NULL) AS submitted,
        (SELECT COUNT(*) FROM intakes i WHERE i.partner_id = p.id AND i.submitted IS NULL) AS filling,
        (SELECT COALESCE(SUM(amount), 0) FROM partner_payments x WHERE x.partner_id = p.id) AS paid
      FROM partners p ORDER BY p.created DESC LIMIT 1000`).all();
    const pay = await env.DB.prepare(`SELECT x.session_id, x.tr, x.pr, x.amount, x.currency, x.created, p.firm FROM partner_payments x LEFT JOIN partners p ON p.id = x.partner_id ORDER BY x.created DESC LIMIT 200`).all();
    return json({ ok: true, rows: r.results.map((x) => ({ ...x, kind_label: KINDS[x.kind] || x.kind })), payments: pay.results, prices: await prices(env), stripe: !!env.STRIPE_SECRET_KEY, ready: readyKinds() });
  }
  if (route === "ledger" && m === "GET") {
    const pid = url.searchParams.get("id") || "";
    const l = await env.DB.prepare(`SELECT kind, delta, reason, ref, amount, created, comp FROM partner_ledger WHERE partner_id = ?1 ORDER BY id DESC LIMIT 300`).bind(pid).all();
    const links = await env.DB.prepare(`SELECT v.code, v.form_key, v.label, v.email, v.created, v.opens, v.archived, v.refunded, v.price_kind, v.price_cents, v.comp,
        (SELECT COUNT(*) FROM intakes i WHERE i.invite_code = v.code AND i.submitted IS NOT NULL) AS done FROM intake_invites v WHERE v.partner_id = ?1 ORDER BY v.created DESC LIMIT 500`).bind(pid).all();
    return json({ ok: true, ledger: l.results, links: links.results });
  }
  if (m !== "POST") return json({ ok: false, error: "Not found." }, 404);
  const b = await readJson(request, 6000) || {};
  if (route === "prices") {
    const c = (v) => Math.round(parseFloat(v) * 100);
    const tr = c(b.tr), pr = c(b.pr);
    if (!(tr >= 50 && tr <= 100000) || !(pr >= 50 && pr <= 100000)) return json({ ok: false, error: "Prices must be between $0.50 and $1,000." }, 400);
    await env.DB.batch([env.DB.prepare(`INSERT OR REPLACE INTO partner_settings (k, v) VALUES ('price_tr', ?1)`).bind(String(tr)),
      env.DB.prepare(`INSERT OR REPLACE INTO partner_settings (k, v) VALUES ('price_pr', ?1)`).bind(String(pr))]);
    return json({ ok: true, prices: await prices(env) });
  }
  if (route === "create") return await adminCreate(env, b);
  const p = await env.DB.prepare(`SELECT * FROM partners WHERE id = ?1`).bind(str(b.id, 60)).first();
  if (!p) return json({ ok: false, error: "Partner not found." }, 404);
  if (route === "status") {
    const st = ["active", "suspended", "declined"].includes(b.status) ? b.status : p.status;
    await env.DB.prepare(`UPDATE partners SET status = ?1, admin_note = ?2 WHERE id = ?3`).bind(st, typeof b.note === "string" ? b.note.slice(0, 3000) : p.admin_note, p.id).run();
    if (st !== "active") await env.DB.prepare(`DELETE FROM partner_sessions WHERE partner_id = ?1`).bind(p.id).run();
    const first = String(p.contact || "").split(" ")[0] || "there";
    if (p.status === "pending" && st === "active") await sendEmail(env, p.email, "Your WorkerPool partner account is approved",
      `Hi ${first},\n\nGood news: ${p.firm} is approved as a WorkerPool intake partner. Sign in here: ${site(env)}/partners/\n\n1. Buy form credits (Temporary residence and Permanent residence forms are priced separately).\n2. Create a personal link for each client and send it by email or WhatsApp. Each link uses one credit.\n3. Your client fills the form and uploads documents. You get an email when they submit.\n4. Open the form in your portal to view every answer and document, and download everything as one ZIP.\n\nWorkerPool`);
    if (p.status === "pending" && st === "declined" && b.notify !== false) await sendEmail(env, p.email, "Your WorkerPool partner application",
      `Hi ${first},\n\nThank you for applying for a WorkerPool partner account for ${p.firm}. We weren't able to approve it at this time${typeof b.reason === "string" && b.reason.trim() ? `:\n\n${b.reason.trim().slice(0, 1000)}` : "."}\n\nIf you think this is a mistake, reply to this email.\n\nWorkerPool`);
    return json({ ok: true });
  }
  if (route === "grant") { // comp: complimentary forms (free, used first) · otherwise paid credits (e.g. paid by e-Transfer)
    const kind = b.kind === "pr" ? "pr" : "tr", qty = parseInt(b.qty) || 0, comp = b.comp === true;
    if (!qty || Math.abs(qty) > 1000) return json({ ok: false, error: "Enter a number of forms (use a minus sign to remove)." }, 400);
    const what = comp ? (qty > 0 ? "Complimentary forms from WorkerPool" : "Complimentary forms removed by WorkerPool") : `${qty > 0 ? "Added" : "Removed"} by WorkerPool`;
    const okd = await addCredits(env, p.id, kind, qty, `${what}${b.note ? ": " + str(b.note, 200) : ""}`, null, null, comp);
    if (!okd) return json({ ok: false, error: comp ? "They don't have that many complimentary forms to remove." : "They don't have that many paid credits to remove." }, 400);
    if (comp && qty > 0 && b.notify && p.status === "active") await sendEmail(env, p.email, `${qty} complimentary ${KIND_LABEL[kind]} form${qty === 1 ? "" : "s"} added to your WorkerPool account`,
      `Hi ${String(p.contact || "").split(" ")[0] || "there"},\n\nWe added ${qty} complimentary ${KIND_LABEL[kind]} intake form${qty === 1 ? "" : "s"} to ${p.firm}'s WorkerPool partner account${b.note ? ` (${str(b.note, 200)})` : ""}. They're used before your paid credits whenever you create a client link.\n\nSign in: ${site(env)}/partners/\n\nWorkerPool`);
    return json({ ok: true, credits: await credits(env, p.id) });
  }
  if (route === "firm-prices") { // this firm's own prices; empty = standard price
    const tr = cents(b.tr), pr = cents(b.pr);
    for (const v of [tr, pr]) if (v !== null && !(v >= 50 && v <= 100000)) return json({ ok: false, error: "Prices must be between $0.50 and $1,000, or empty for the standard price. For free forms, add complimentary forms instead." }, 400);
    await env.DB.prepare(`UPDATE partners SET price_tr = ?1, price_pr = ?2 WHERE id = ?3`).bind(tr, pr, p.id).run();
    return json({ ok: true, prices: await prices(env, { price_tr: tr, price_pr: pr }) });
  }
  if (route === "setup-link") { // a new set-password link for a firm the admin signed up (or any firm that lost access)
    const link = await setupLink(env, p.id);
    let emailed = false;
    if (b.send) emailed = await sendEmail(env, p.email, `Set up your WorkerPool partner account – ${p.firm}`, setupEmail(env, p, link, await prices(env, p)));
    await env.DB.prepare(`UPDATE partners SET invited_at = ?1 WHERE id = ?2`).bind(new Date().toISOString(), p.id).run();
    return json({ ok: true, link, emailed });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

function setupEmail(env, p, link, pr) {
  const fr = [p.free_tr && `${p.free_tr} Temporary residence`, p.free_pr && `${p.free_pr} Permanent residence & citizenship`].filter(Boolean);
  return `Hi ${String(p.contact || "").split(" ")[0] || "there"},\n\nWorkerPool has set up a partner account for ${p.firm} so you can send secure intake forms to your clients.\n\nChoose your password and accept the partner terms here (the link works for ${SETUP_DAYS} days):\n${link}\n\nYour sign-in email: ${p.email}\nYour price per form: ${money(pr.tr)} Temporary residence · ${money(pr.pr)} Permanent residence & citizenship${fr.length ? `\nComplimentary forms on your account: ${fr.join(" and ")} (used before paid credits)` : ""}\n\nHow it works:\n1. Create a personal link for each client and send it by email or WhatsApp. Each link uses one form.\n2. Your client fills the form and uploads documents. You get an email when they submit.\n3. Open the form in your portal to view every answer and document, and download everything as one ZIP.\n\nWorkerPool`;
}

// Admin signs up a firm directly: it's approved straight away, can have its own prices and complimentary forms,
// and gets a set-password link (emailed, and returned so the admin can also send it by WhatsApp).
async function adminCreate(env, b) {
  const f = { firm: str(b.firm, 140), kind: KINDS[b.kind] ? b.kind : "", licence: str(b.licence, 60), contact: str(b.contact, 120), email: str(b.email, 120).toLowerCase(),
    phone: str(b.phone, 40), website: str(b.website, 200), city: str(b.city, 80), province: str(b.province, 40) };
  if (!f.firm) return json({ ok: false, error: "Enter the firm or practice name." }, 400);
  if (!f.kind) return json({ ok: false, error: "Choose what kind of representative they are." }, 400);
  if (f.licence.length < 3) return json({ ok: false, error: "Enter their licence number." }, 400);
  if (f.kind === "rcic" && !/^R?\d{6}$/i.test(f.licence.replace(/\s/g, ""))) return json({ ok: false, error: "A CICC licence number looks like R712345." }, 400);
  if (!f.contact) return json({ ok: false, error: "Enter the contact person's name." }, 400);
  if (!isEmail(f.email)) return json({ ok: false, error: "Enter a valid email address (they sign in with it)." }, 400);
  if (await env.DB.prepare(`SELECT id FROM partners WHERE email = ?1`).bind(f.email).first()) return json({ ok: false, error: "A partner account already uses this email." }, 409);
  const tr = cents(b.price_tr), pr = cents(b.price_pr);
  for (const v of [tr, pr]) if (v !== null && !(v >= 50 && v <= 100000)) return json({ ok: false, error: "Prices must be between $0.50 and $1,000, or empty for the standard price." }, 400);
  const free = { tr: Math.max(0, Math.min(1000, parseInt(b.free_tr) || 0)), pr: Math.max(0, Math.min(1000, parseInt(b.free_pr) || 0)) };
  if (f.kind === "rcic") f.licence = "R" + f.licence.replace(/\D/g, "");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO partners (id, firm, kind, licence, contact, email, phone, website, city, province, pass_hash, status, created, admin_note, price_tr, price_pr, added_by, invited_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active', ?12, ?13, ?14, ?15, 'admin', ?12)`)
    .bind(id, f.firm, f.kind, f.licence, f.contact, f.email, f.phone || null, f.website || null, f.city || null, f.province || null,
      await hashPassword(randomToken() + randomToken()), now, str(b.note, 3000) || null, tr, pr).run();   // unusable password until they set their own
  for (const k of ["tr", "pr"]) if (free[k]) await addCredits(env, id, k, free[k], `Complimentary forms from WorkerPool${b.free_note ? ": " + str(b.free_note, 200) : " (welcome)"}`, null, null, true);
  const p = await env.DB.prepare(`SELECT * FROM partners WHERE id = ?1`).bind(id).first();
  const link = await setupLink(env, id);
  const emailed = b.send !== false ? await sendEmail(env, f.email, `Set up your WorkerPool partner account – ${f.firm}`, setupEmail(env, p, link, await prices(env, p))) : false;
  return json({ ok: true, id, link, emailed });
}
