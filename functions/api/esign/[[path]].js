// WorkerPool eSign API. See functions/_esign.js for how envelopes, the audit trail and subscriptions work.
//
// Senders
//   /api/esign/admin/*   WorkerPool admin (x-admin-key). Sees every envelope (master view), no limits.
//   /api/esign/app/*     Subscribers, signed in with their WorkerPool account (wp_s cookie).
//   Shared routes:  GET list · GET item?id= · POST new {title} · POST upload?id= (raw file, x-file-name) · POST clear {id}
//                   GET doc?id= (original) · GET final?id= · GET cert?id= · POST save {...} · POST send {id} · POST void {id, reason}
//                   POST remind {id} · POST copy {id} · POST delete {id} · POST rebuild {id}
//   Admin only:     GET bill · POST plan-save · plan-delete · promo-save · promo-delete · comp · sub-end · settings
//   Subscriber:     GET me · POST promo-check · POST checkout · GET paid?session_id= · POST cancel · POST resume · POST portal
// Signers (personal link token t, then a session s from the one-time code)
//   GET s/info?t= · POST s/start {t, access} · POST s/verify {t, code} · GET s/doc?t=&s= · POST s/sign · POST s/decline · GET s/final?t=
// Public
//   GET plans · POST verify {sha} or GET verify?id= · POST tick (reminders and expiry; called by the cron Worker)
import { json, readJson, str, isEmail, getUser, fileName, sha256hex, randomToken } from "../../_lib.js";
import { stripe } from "../../_scanpass.js";
import {
  ensureEsign, now, envId, rid, parse, same, clientIp, clientGeo, clientUa, logEvent, checkChain, mail, emailHtml, sendInvite, signLink,
  recipientFromToken, uploadKind, appendToPdf, pngOk, complete, routeNext, plans, setting, setSetting, findPromo, autoPromo, promoText, planText,
  normCode, syncStripeSub, access, maskEmail, fmtDate, fmtTime, sendCompleted, SITE, BRAND, MAX_ENVELOPE, MAX_RECIPIENTS, MAX_FIELDS, FIELD_TYPES,
  DISCLOSURE, DISCLOSURE_V, hmac,
} from "../../_esign.js";

const isAdminKey = (request, env) => !!env.ADMIN_KEY && same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY);
const bad = (error, status = 400) => json({ ok: false, error }, status);
const pdfResponse = (obj, name, inline) => new Response(obj.body, { headers: {
  "content-type": "application/pdf", "content-disposition": `${inline ? "inline" : "attachment"}; filename="${String(name || "document.pdf").replace(/["\\\r\n]/g, "")}"`,
  "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
const fileTitle = (t) => String(t || "document").replace(/[^\w .()-]/g, "_").slice(0, 80);

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return bad("Database not connected.", 503);
  await ensureEsign(env);
  const parts = params.path || [], area = parts[0] || "", route = parts.slice(1).join("/"), m = request.method;
  try {
    if (area === "admin") {
      if (!isAdminKey(request, env)) return bad("Wrong admin key.", 401);
      const owner = { id: "admin", admin: true, name: env.ESIGN_SENDER_NAME || "WorkerPool", email: env.ESIGN_SENDER_EMAIL || env.ADMIN_EMAIL || "" };
      if (ADMIN_BILL[route]) return await ADMIN_BILL[route](ctx, m);
      return await ownerRoutes(ctx, owner, route, m);
    }
    if (area === "app") {
      const u = await getUser(request, env);
      if (route === "me" && m === "GET") return await me(env, u);
      if (!u) return bad("Sign in to continue.", 401);
      const owner = { id: u.id, admin: false, name: u.name || u.email, email: u.email, user: u };
      if (SUB_BILL[route]) return await SUB_BILL[route](ctx, owner, m);
      const a = await access(env, u, stripe);
      // without an active plan you can still open, download and manage what you already sent
      if (!a.ok && ["new", "upload", "save", "send", "copy"].includes(route)) return json({ ok: false, error: a.reason || "Subscribe to send documents.", needPlan: true }, 402);
      owner.access = a;
      return await ownerRoutes(ctx, owner, route, m);
    }
    if (area === "s") return await signerRoutes(ctx, route, m);
    if (area === "plans" && m === "GET") return await publicPlans(env);
    if (area === "verify") return await verify(ctx, m);
    if (area === "tick" && m === "POST") return await tick(env);
    return bad("Not found.", 404);
  } catch (e) {
    console.error("esign", area, route, e);
    return bad(e && e.message && /Stripe|PDF|password|read|storage|large|signature/i.test(e.message) ? e.message : "Something went wrong. Try again.", 500);
  }
}

/* ======================= senders (admin and subscribers) ======================= */
async function loadEnv(env, owner, id) {
  const e = await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE id = ?1`).bind(str(id, 60)).first();
  if (!e || (!owner.admin && e.owner !== owner.id)) return null;
  return e;
}
const pubEnv = (e) => ({ id: e.id, owner: e.owner, owner_name: e.owner_name, owner_email: e.owner_email, title: e.title, message: e.message, status: e.status, seq: e.seq,
  expires_days: e.expires_days, remind_days: e.remind_days, names: parse(e.orig_names, []), size: e.orig_size, pages: e.pages, page_sizes: parse(e.page_sizes, []),
  orig_sha: e.orig_sha, final_sha: e.final_sha, cert_sha: e.cert_sha, has_final: !!e.final_key, final_error: e.final_error, created: e.created, updated: e.updated,
  sent_at: e.sent_at, completed_at: e.completed_at, expires_at: e.expires_at, ended_at: e.ended_at, end_reason: e.end_reason, last_hash: e.last_hash });
const pubRcpt = (r) => ({ id: r.id, role: r.role, name: r.name, email: r.email, ord: r.ord, color: r.color, has_access: !!r.access_hash, status: r.status,
  sent_at: r.sent_at, viewed_at: r.viewed_at, verified_at: r.verified_at, consent_at: r.consent_at, signed_at: r.signed_at, declined_at: r.declined_at,
  decline_reason: r.decline_reason, ip: r.ip, geo: r.geo, ua: r.ua, sig_kind: r.sig_kind, sig_png: r.sig_png || null, remind_count: r.remind_count, last_remind: r.last_remind });

async function ownerRoutes({ request, env }, owner, route, m) {
  const url = new URL(request.url), q = (k) => url.searchParams.get(k);
  if (route === "list" && m === "GET") {
    const scope = owner.admin ? (q("scope") || "mine") : "mine";
    const where = owner.admin ? (scope === "all" ? "1 = 1" : scope === "subs" ? "e.owner != 'admin'" : "e.owner = 'admin'") : "e.owner = ?1";
    const r = await env.DB.prepare(`SELECT e.id, e.owner, e.owner_name, e.owner_email, e.title, e.status, e.pages, e.created, e.updated, e.sent_at, e.completed_at, e.expires_at, e.final_error,
        (SELECT COUNT(*) FROM esign_recipients x WHERE x.env_id = e.id AND x.role = 'signer') AS signers,
        (SELECT COUNT(*) FROM esign_recipients x WHERE x.env_id = e.id AND x.role = 'signer' AND x.status = 'signed') AS signed,
        (SELECT group_concat(x.name, ', ') FROM esign_recipients x WHERE x.env_id = e.id AND x.role = 'signer') AS names
      FROM esign_envelopes e WHERE ${where} ORDER BY COALESCE(e.updated, e.created) DESC LIMIT 1000`).bind(...(owner.admin ? [] : [owner.id])).all();
    return json({ ok: true, rows: r.results, ...(owner.access ? { access: accessView(owner.access) } : {}) });
  }
  if (route === "new" && m === "POST") {
    const b = await readJson(request, 4000) || {};
    const id = envId(), t = now();
    await env.DB.prepare(`INSERT INTO esign_envelopes (id, owner, owner_name, owner_email, title, message, status, seq, expires_days, remind_days, created, updated, owner_ip)
      VALUES (?1,?2,?3,?4,?5,'', 'draft', 0, 30, 3, ?6, ?6, ?7)`).bind(id, owner.id, owner.name, owner.email, str(b.title, 160) || "Untitled document", t, clientIp(request)).run();
    const e = await loadEnv(env, owner, id);
    await logEvent(env, e, { actor: `${owner.name} <${owner.email}>`, action: "Envelope created", request });
    return json({ ok: true, id });
  }
  const id = q("id");
  let b = null;
  if (m === "POST" && route !== "upload") b = await readJson(request, 400000) || {};
  const e = await loadEnv(env, owner, id || (b && b.id));
  if (!e) return bad("That envelope wasn't found.", 404);
  const actor = `${owner.name} <${owner.email}>`;

  if (route === "item" && m === "GET") {
    const rs = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1 ORDER BY ord, rowid`).bind(e.id).all()).results;
    const fs = (await env.DB.prepare(`SELECT id, rcpt_id, type, page, x, y, w, h, required, label, value FROM esign_fields WHERE env_id = ?1`).bind(e.id).all()).results;
    const ev = (await env.DB.prepare(`SELECT id, rcpt_id, actor, action, detail, ip, geo, ua, at FROM esign_events WHERE env_id = ?1 ORDER BY id`).bind(e.id).all()).results;
    const chain = await checkChain(env, e.id);
    return json({ ok: true, env: pubEnv(e), recipients: rs.map(pubRcpt), fields: fs, events: ev, chain, mine: e.owner === owner.id });
  }
  if ((route === "doc" || route === "final" || route === "cert") && m === "GET") {
    const key = route === "doc" ? e.orig_key : route === "final" ? e.final_key : e.cert_key;
    const obj = key && await env.RESUMES.get(key);
    if (!obj) return bad(route === "doc" ? "No document uploaded yet." : "The completed document isn't ready.", 404);
    const name = route === "doc" ? `${fileTitle(e.title)}.pdf` : route === "final" ? `${fileTitle(e.title)} (signed).pdf` : `${fileTitle(e.title)} - Certificate of Completion.pdf`;
    return pdfResponse(obj, name, q("view") === "1");
  }
  const draft = e.status === "draft";
  if (route === "upload" && m === "POST") {
    if (!draft) return bad("The document can't change after the envelope is sent.");
    if (!env.RESUMES) return bad("File storage isn't switched on (R2 bucket RESUMES).", 503);
    const name = fileName(request), buf = await request.arrayBuffer(), k = uploadKind(name, buf);
    if (k.error) return bad(k.error);
    const prev = e.orig_key ? await env.RESUMES.get(e.orig_key) : null;
    const { bytes, sizes } = await appendToPdf(prev ? await prev.arrayBuffer() : null, buf, k.kind);
    if (bytes.byteLength > MAX_ENVELOPE) return bad("The envelope's document would be over 25 MB. Upload smaller files.");
    const key = `esign/${e.id}/original.pdf`, names = [...parse(e.orig_names, []), name];
    await env.RESUMES.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    const sha = await sha256hex_bytes(bytes);
    await env.DB.prepare(`UPDATE esign_envelopes SET orig_key = ?1, orig_names = ?2, orig_size = ?3, pages = ?4, page_sizes = ?5, orig_sha = ?6, updated = ?7 WHERE id = ?8`)
      .bind(key, JSON.stringify(names), bytes.byteLength, sizes.length, JSON.stringify(sizes), sha, now(), e.id).run();
    await logEvent(env, e, { actor, action: "Document added", detail: `${name} (${sizes.length} pages in envelope)`, request });
    return json({ ok: true, pages: sizes.length, page_sizes: sizes, names, size: bytes.byteLength });
  }
  if (route === "clear" && m === "POST") {
    if (!draft) return bad("The document can't change after the envelope is sent.");
    if (e.orig_key) await env.RESUMES.delete(e.orig_key);
    await env.DB.batch([
      env.DB.prepare(`UPDATE esign_envelopes SET orig_key = NULL, orig_names = NULL, orig_size = NULL, pages = 0, page_sizes = NULL, orig_sha = NULL, updated = ?1 WHERE id = ?2`).bind(now(), e.id),
      env.DB.prepare(`DELETE FROM esign_fields WHERE env_id = ?1`).bind(e.id),
    ]);
    await logEvent(env, e, { actor, action: "Document removed", request });
    return json({ ok: true });
  }
  if (route === "save" && m === "POST") {
    if (!draft) return bad("A sent envelope can't be edited. Void it and make a copy instead.");
    const rsIn = Array.isArray(b.recipients) ? b.recipients.slice(0, MAX_RECIPIENTS) : [];
    const fsIn = Array.isArray(b.fields) ? b.fields.slice(0, MAX_FIELDS) : [];
    const old = Object.fromEntries((await env.DB.prepare(`SELECT id, access_hash FROM esign_recipients WHERE env_id = ?1`).bind(e.id).all()).results.map((r) => [r.id, r]));
    const idMap = {}, stmts = [env.DB.prepare(`DELETE FROM esign_recipients WHERE env_id = ?1`).bind(e.id), env.DB.prepare(`DELETE FROM esign_fields WHERE env_id = ?1`).bind(e.id)];
    let n = 0;
    for (const r of rsIn) {
      const name = str(r.name, 120), email = str(r.email, 160).toLowerCase(), role = r.role === "cc" ? "cc" : "signer";
      if (!name && !email) continue;
      const keep = r.id && old[r.id] ? r.id : rid();
      idMap[r.id || r.key || keep] = keep; if (r.key) idMap[r.key] = keep;
      let ah = old[keep] ? old[keep].access_hash : null;
      if (typeof r.access === "string") ah = r.access.trim() ? await sha256hex("esign-access|" + r.access.trim()) : null;
      stmts.push(env.DB.prepare(`INSERT INTO esign_recipients (id, env_id, role, name, email, ord, color, access_hash, nonce, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'created')`)
        .bind(keep, e.id, role, name, email, Math.max(1, Math.min(20, parseInt(r.ord) || 1)), n++ % 8, ah, randomToken().slice(0, 16)));
    }
    for (const f of fsIn) {
      const rk = idMap[f.rcpt_id];
      if (!rk || !FIELD_TYPES.includes(f.type)) continue;
      const page = parseInt(f.page);
      if (!(page >= 0 && page < (e.pages || 0))) continue;
      const cl = (v) => Math.max(0, Math.min(1, Number(v) || 0));
      stmts.push(env.DB.prepare(`INSERT INTO esign_fields (id, env_id, rcpt_id, type, page, x, y, w, h, required, label) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
        .bind(rid(), e.id, rk, f.type, page, cl(f.x), cl(f.y), Math.max(0.005, cl(f.w)), Math.max(0.005, cl(f.h)), f.type === "checkbox" || f.type === "text" ? (f.required ? 1 : 0) : 1, str(f.label, 80)));
    }
    stmts.push(env.DB.prepare(`UPDATE esign_envelopes SET title = ?1, message = ?2, seq = ?3, expires_days = ?4, remind_days = ?5, updated = ?6 WHERE id = ?7`)
      .bind(str(b.title, 160) || e.title, str(b.message, 2000), b.seq ? 1 : 0, Math.max(1, Math.min(120, parseInt(b.expires_days) || 30)), Math.max(0, Math.min(30, isNaN(parseInt(b.remind_days)) ? 3 : parseInt(b.remind_days))), now(), e.id));
    await env.DB.batch(stmts);
    return json({ ok: true, ids: idMap });
  }
  if (route === "send" && m === "POST") {
    if (!draft) return bad("This envelope was already sent.");
    if (!e.orig_key || !e.pages) return bad("Upload the document first.");
    const rs = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1`).bind(e.id).all()).results;
    const fs = (await env.DB.prepare(`SELECT rcpt_id, type FROM esign_fields WHERE env_id = ?1`).bind(e.id).all()).results;
    const signers = rs.filter((r) => r.role === "signer");
    if (!signers.length) return bad("Add at least one signer.");
    for (const r of rs) {
      if (!r.name) return bad("Every recipient needs a name.");
      if (!isEmail(r.email)) return bad(`${r.name}'s email doesn't look right.`);
    }
    const dup = new Set(); for (const r of signers) { if (dup.has(r.email)) return bad(`${r.email} is listed twice as a signer.`); dup.add(r.email); }
    for (const r of signers) if (!fs.some((f) => f.rcpt_id === r.id && f.type === "signature")) return bad(`Place at least one Signature field for ${r.name}.`);
    if (owner.access && owner.access.limit && owner.access.used >= owner.access.limit)
      return json({ ok: false, needPlan: true, error: `You've sent ${owner.access.used} of ${owner.access.limit} envelopes this billing period. Upgrade your plan to send more.` }, 402);
    // fingerprint the exact document being sent
    const obj = await env.RESUMES.get(e.orig_key);
    const sha = await sha256hex_bytes(new Uint8Array(await obj.arrayBuffer()));
    const t = now(), exp = new Date(Date.now() + (e.expires_days || 30) * 864e5).toISOString();
    await env.DB.prepare(`UPDATE esign_envelopes SET status = 'sent', sent_at = ?1, expires_at = ?2, orig_sha = ?3, updated = ?1, owner_ip = ?4 WHERE id = ?5`).bind(t, exp, sha, clientIp(request), e.id).run();
    Object.assign(e, { status: "sent", sent_at: t, expires_at: exp, orig_sha: sha });
    await logEvent(env, e, { actor, action: "Envelope sent", detail: `${signers.length} signer(s), ${rs.length - signers.length} CC; ${e.seq ? "sequential" : "parallel"} signing; document SHA-256 ${sha}`, request });
    await routeNext(env, e, request);
    return json({ ok: true });
  }
  if (route === "void" && m === "POST") {
    if (e.status !== "sent") return bad("Only an envelope that is out for signature can be voided.");
    const reason = str(b.reason, 300) || "No reason given";
    await env.DB.batch([
      env.DB.prepare(`UPDATE esign_envelopes SET status = 'voided', ended_at = ?1, end_reason = ?2 WHERE id = ?3`).bind(now(), reason, e.id),
      env.DB.prepare(`UPDATE esign_recipients SET nonce = ?1 WHERE env_id = ?2`).bind(randomToken().slice(0, 16), e.id), // old links stop working
    ]);
    await logEvent(env, e, { actor, action: "Envelope voided", detail: reason, request });
    const rs = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1 AND role = 'signer' AND status != 'created'`).bind(e.id).all()).results;
    for (const r of rs) await mail(env, { to: r.email, subject: `Voided: ${e.title}`, fromName: `${e.owner_name} via ${BRAND}`, replyTo: e.owner_email,
      text: `${e.owner_name} voided "${e.title}". You no longer need to sign it.\n\nReason: ${reason}\n\nEnvelope ID: ${e.id}`,
      html: emailHtml({ heading: "This document was voided", lines: [`${esc(e.owner_name)} voided <b>${esc(e.title)}</b>. You no longer need to sign it.`, `Reason: ${esc(reason)}`], foot: [`Envelope ID: ${e.id}`] }) });
    return json({ ok: true });
  }
  if (route === "remind" && m === "POST") {
    if (e.status !== "sent") return bad("Only an envelope that is out for signature can be resent.");
    const rs = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1 AND role = 'signer' AND status IN ('sent','viewed','verified')${b.rcpt ? " AND id = ?2" : ""}`).bind(e.id, ...(b.rcpt ? [str(b.rcpt, 40)] : [])).all()).results;
    if (!rs.length) return bad("No one is waiting to sign right now.");
    for (const r of rs) {
      await sendInvite(env, e, r, true);
      await env.DB.prepare(`UPDATE esign_recipients SET last_remind = ?1, remind_count = remind_count + 1 WHERE id = ?2`).bind(now(), r.id).run();
      await logEvent(env, e, { rcpt: r.id, actor, action: "Reminder sent", detail: `${r.name} <${r.email}>`, request });
    }
    return json({ ok: true, sent: rs.length });
  }
  if (route === "copy" && m === "POST") {
    const nid = envId(), t = now();
    await env.DB.prepare(`INSERT INTO esign_envelopes (id, owner, owner_name, owner_email, title, message, status, seq, expires_days, remind_days, orig_names, orig_size, pages, page_sizes, created, updated)
      VALUES (?1,?2,?3,?4,?5,?6,'draft',?7,?8,?9,?10,?11,?12,?13,?14,?14)`).bind(nid, owner.id, owner.name, owner.email, "Copy of " + (e.title || ""), e.message || "", e.seq, e.expires_days, e.remind_days,
      e.orig_names, e.orig_size, e.pages, e.page_sizes, t).run();
    if (e.orig_key) { const o = await env.RESUMES.get(e.orig_key); if (o) { const bytes = new Uint8Array(await o.arrayBuffer()); await env.RESUMES.put(`esign/${nid}/original.pdf`, bytes, { httpMetadata: { contentType: "application/pdf" } });
      await env.DB.prepare(`UPDATE esign_envelopes SET orig_key = ?1, orig_sha = ?2 WHERE id = ?3`).bind(`esign/${nid}/original.pdf`, await sha256hex_bytes(bytes), nid).run(); } }
    const rs = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1 ORDER BY ord, rowid`).bind(e.id).all()).results;
    const map = {}, stmts = [];
    rs.forEach((r, i) => { map[r.id] = rid(); stmts.push(env.DB.prepare(`INSERT INTO esign_recipients (id, env_id, role, name, email, ord, color, access_hash, nonce, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'created')`)
      .bind(map[r.id], nid, r.role, r.name, r.email, r.ord, i % 8, r.access_hash, randomToken().slice(0, 16))); });
    for (const f of (await env.DB.prepare(`SELECT * FROM esign_fields WHERE env_id = ?1`).bind(e.id).all()).results)
      if (map[f.rcpt_id]) stmts.push(env.DB.prepare(`INSERT INTO esign_fields (id, env_id, rcpt_id, type, page, x, y, w, h, required, label) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
        .bind(rid(), nid, map[f.rcpt_id], f.type, f.page, f.x, f.y, f.w, f.h, f.required, f.label));
    if (stmts.length) await env.DB.batch(stmts);
    const ne = await loadEnv(env, owner, nid);
    await logEvent(env, ne, { actor, action: "Envelope created", detail: `Copied from ${e.id}`, request });
    return json({ ok: true, id: nid });
  }
  if (route === "delete" && m === "POST") {
    if (e.status === "sent") return bad("Void the envelope before deleting it.");
    if (e.status === "completed" && !owner.admin && !b.confirm) return bad("Confirm deleting a completed envelope.");
    for (const k of [e.orig_key, e.final_key, e.cert_key]) if (k) await env.RESUMES.delete(k);
    await env.DB.batch(["esign_fields", "esign_recipients", "esign_events"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE env_id = ?1`).bind(e.id))
      .concat([env.DB.prepare(`DELETE FROM esign_envelopes WHERE id = ?1`).bind(e.id)]));
    return json({ ok: true });
  }
  if (route === "rebuild" && m === "POST") {
    if (e.status !== "completed") return bad("Only a completed envelope has a final PDF.");
    const ok = await complete(env, e, request);
    return ok ? json({ ok: true }) : bad("The final PDF still couldn't be built. Check that the Pages project is on the Workers Paid plan (PDF building needs more CPU time).", 500);
  }
  return bad("Not found.", 404);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function sha256hex_bytes(bytes) { const d = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

/* ======================= signers ======================= */
const SESSION_MS = 3 * 3600e3, OTP_MS = 10 * 60e3;
async function signerCtx(env, t, s) {
  const r = await recipientFromToken(env, t);
  if (!r) return { error: "This signing link isn't valid. It may have been replaced by a newer email, or the sender voided the request." };
  const e = await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE id = ?1`).bind(r.env_id).first();
  if (!e) return { error: "This document no longer exists." };
  const sess = !!(s && r.sess_hash && r.sess_expires > now() && same(await sha256hex("esign-sess|" + s), r.sess_hash));
  return { r, e, sess };
}
async function signerRoutes({ request, env }, route, m) {
  const url = new URL(request.url);
  const b = m === "POST" ? await readJson(request, 900000) || {} : {};
  const t = b.t || url.searchParams.get("t"), s = b.s || url.searchParams.get("s") || request.headers.get("x-sign-session");
  const c = await signerCtx(env, t, s);
  if (c.error) return bad(c.error, 404);
  const { r, e } = c;
  const who = `${r.name} <${r.email}>`;
  const ended = e.status === "voided" ? `${e.owner_name} voided this document${e.end_reason ? `: ${e.end_reason}` : "."}` : e.status === "declined" ? "This document was declined, so signing has stopped." :
    e.status === "expired" ? "This signing request has expired. Contact the sender if you still need to sign." : e.status === "draft" ? "This document hasn't been sent yet." : "";
  // expire lazily too, in case the scheduled job hasn't run
  if (e.status === "sent" && e.expires_at && e.expires_at < now()) { await expire(env, e); return bad("This signing request has expired. Contact the sender if you still need to sign.", 410); }

  if (route === "info" && m === "GET") {
    if (!r.viewed_at && e.status === "sent" && r.role === "signer") {
      await env.DB.prepare(`UPDATE esign_recipients SET viewed_at = ?1, status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE id = ?2`).bind(now(), r.id).run();
      await logEvent(env, e, { rcpt: r.id, actor: who, action: "Opened the signing link", request });
    }
    const signers = (await env.DB.prepare(`SELECT id, name, ord, status FROM esign_recipients WHERE env_id = ?1 AND role = 'signer' ORDER BY ord`).bind(e.id).all()).results;
    const waitingFor = e.seq && r.status !== "signed" ? signers.filter((x) => x.status !== "signed" && x.ord < r.ord).map((x) => x.name) : [];
    const fields = c.sess ? (await env.DB.prepare(`SELECT id, rcpt_id, type, page, x, y, w, h, required, label, value FROM esign_fields WHERE env_id = ?1`).bind(e.id).all()).results
      .map((f) => ({ ...f, mine: f.rcpt_id === r.id, rcpt_id: undefined, value: f.rcpt_id === r.id ? f.value : undefined })) : [];
    return json({ ok: true, ended, envelope: { id: e.id, title: e.title, message: e.message, from: e.owner_name, from_email: e.owner_email, status: e.status, pages: e.pages, page_sizes: parse(e.page_sizes, []),
        expires_at: e.expires_at, completed_at: e.completed_at, has_final: !!e.final_key },
      me: { name: r.name, email: c.sess ? r.email : maskEmail(r.email), role: r.role, status: r.status, signed_at: r.signed_at, needs_access: !!r.access_hash, verified: c.sess, consent: !!r.consent_at },
      waiting_for: waitingFor, signers: signers.map((x) => ({ name: x.name, status: x.status, me: x.id === r.id })), fields, disclosure: DISCLOSURE, disclosure_v: DISCLOSURE_V });
  }
  if (route === "final" && m === "GET") {
    if (e.status !== "completed" || !e.final_key) return bad("The completed document isn't ready yet.", 404);
    const obj = await env.RESUMES.get(e.final_key);
    if (!obj) return bad("The completed document isn't available.", 404);
    await logEvent(env, e, { rcpt: r.id, actor: who, action: "Downloaded the completed document", request });
    return pdfResponse(obj, `${fileTitle(e.title)} (signed).pdf`, url.searchParams.get("view") === "1");
  }
  if (ended) return bad(ended, 410);
  if (r.role !== "signer") return bad("You're receiving a copy of this document; there's nothing for you to sign.", 403);
  if (r.status === "signed") return bad("You've already signed this document.", 409);
  if (r.status === "declined") return bad("You declined this document.", 409);
  if (e.seq) {
    const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM esign_recipients WHERE env_id = ?1 AND role = 'signer' AND ord < ?2 AND status != 'signed'`).bind(e.id, r.ord).first();
    if (before.n) return bad("It isn't your turn to sign yet. You'll get an email when it is.", 409);
  }

  if (route === "start" && m === "POST") {
    if (r.access_hash) {
      const ok = typeof b.access === "string" && same(await sha256hex("esign-access|" + b.access.trim()), r.access_hash);
      if (!ok) {
        await logEvent(env, e, { rcpt: r.id, actor: who, action: "Access code failed", request });
        return bad("That access code isn't right. The sender gives it to you separately (not in the email).");
      }
    }
    if (r.otp_sent_at && Date.now() - Date.parse(r.otp_sent_at) < 45e3) return bad("A code was just sent. Wait a minute before asking for another.");
    if ((r.otp_count || 0) >= 8) return bad("Too many codes requested. Contact the sender for a new signing link.");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await env.DB.prepare(`UPDATE esign_recipients SET otp_hash = ?1, otp_expires = ?2, otp_tries = 0, otp_sent_at = ?3, otp_count = otp_count + 1 WHERE id = ?4`)
      .bind(await sha256hex("esign-otp|" + r.id + "|" + code), new Date(Date.now() + OTP_MS).toISOString(), now(), r.id).run();
    const ok = await mail(env, { to: r.email, subject: `${code} is your code to sign "${e.title}"`, fromName: BRAND,
      text: `Your one-time code to open "${e.title}" is:\n\n${code}\n\nIt works for 10 minutes. If you didn't open a signing link just now, ignore this email and don't share the code.\n\nEnvelope ID: ${e.id}`,
      html: emailHtml({ heading: "Your one-time signing code", lines: [`Use this code to open <b>${esc(e.title)}</b>:`, `<span style="font-size:30px;font-weight:700;letter-spacing:6px">${code}</span>`, "It works for 10 minutes."], foot: ["If you didn't open a signing link just now, ignore this email and don't share the code.", `Envelope ID: ${e.id}`] }) });
    await logEvent(env, e, { rcpt: r.id, actor: who, action: "One-time code sent", detail: `to ${r.email}${r.access_hash ? "; access code accepted" : ""}${ok ? "" : " (email not delivered)"}`, request });
    if (!ok && !env.RESEND_API_KEY) return bad("Email isn't set up on this site yet, so the code can't be sent.", 503);
    return json({ ok: true, email: maskEmail(r.email) });
  }
  if (route === "verify" && m === "POST") {
    if (!r.otp_hash || !r.otp_expires || r.otp_expires < now()) return bad("That code has expired. Ask for a new one.");
    if ((r.otp_tries || 0) >= 5) return bad("Too many wrong codes. Ask for a new one.");
    const code = String(b.code || "").replace(/\D/g, "");
    if (!same(await sha256hex("esign-otp|" + r.id + "|" + code), r.otp_hash)) {
      await env.DB.prepare(`UPDATE esign_recipients SET otp_tries = otp_tries + 1 WHERE id = ?1`).bind(r.id).run();
      return bad("That code isn't right. Check the latest email and try again.");
    }
    const sess = randomToken(), t2 = now();
    await env.DB.prepare(`UPDATE esign_recipients SET otp_hash = NULL, sess_hash = ?1, sess_expires = ?2, verified_at = COALESCE(verified_at, ?3), status = CASE WHEN status IN ('sent','viewed') THEN 'verified' ELSE status END WHERE id = ?4`)
      .bind(await sha256hex("esign-sess|" + sess), new Date(Date.now() + SESSION_MS).toISOString(), t2, r.id).run();
    await logEvent(env, e, { rcpt: r.id, actor: who, action: "Identity confirmed", detail: `Email one-time code verified${r.access_hash ? " and access code" : ""}`, request });
    return json({ ok: true, s: sess });
  }
  if (!c.sess) return bad("Confirm your one-time code first.", 401);
  if (route === "doc" && m === "GET") {
    const obj = await env.RESUMES.get(e.orig_key);
    if (!obj) return bad("The document isn't available.", 404);
    return pdfResponse(obj, `${fileTitle(e.title)}.pdf`, true);
  }
  if (route === "consent" && m === "POST") {
    if (!r.consent_at) {
      await env.DB.prepare(`UPDATE esign_recipients SET consent_at = ?1 WHERE id = ?2`).bind(now(), r.id).run();
      await logEvent(env, e, { rcpt: r.id, actor: who, action: "Accepted the Electronic Record and Signature Disclosure", detail: `Version ${DISCLOSURE_V}`, request });
    }
    return json({ ok: true });
  }
  if (route === "decline" && m === "POST") {
    const reason = str(b.reason, 500);
    if (!reason) return bad("Tell the sender why you're declining.");
    const t2 = now();
    await env.DB.batch([
      env.DB.prepare(`UPDATE esign_recipients SET status = 'declined', declined_at = ?1, decline_reason = ?2, ip = ?3, ua = ?4, geo = ?5 WHERE id = ?6`).bind(t2, reason, clientIp(request), clientUa(request), clientGeo(request), r.id),
      env.DB.prepare(`UPDATE esign_envelopes SET status = 'declined', ended_at = ?1, end_reason = ?2 WHERE id = ?3`).bind(t2, `Declined by ${r.name}: ${reason}`, e.id),
    ]);
    await logEvent(env, e, { rcpt: r.id, actor: who, action: "Declined to sign", detail: reason, request });
    if (e.owner_email) await mail(env, { to: e.owner_email, subject: `Declined: ${e.title}`, fromName: BRAND, replyTo: r.email,
      text: `${r.name} (${r.email}) declined to sign "${e.title}".\n\nReason: ${reason}\n\nEnvelope ID: ${e.id}\n${SITE(env)}${e.owner === "admin" ? "/admin/" : "/esign/"}`,
      html: emailHtml({ heading: `${r.name} declined to sign`, lines: [`<b>${esc(e.title)}</b>`, `Reason: ${esc(reason)}`], button: "OPEN ESIGN", link: `${SITE(env)}${e.owner === "admin" ? "/admin/" : "/esign/"}`, foot: [`Envelope ID: ${e.id}`] }) });
    return json({ ok: true });
  }
  if (route === "sign" && m === "POST") {
    if (!r.consent_at && !b.consent) return bad("Agree to the Electronic Record and Signature Disclosure first.");
    const fields = (await env.DB.prepare(`SELECT * FROM esign_fields WHERE env_id = ?1 AND rcpt_id = ?2`).bind(e.id, r.id).all()).results;
    const vals = b.values && typeof b.values === "object" ? b.values : {};
    const needSig = fields.some((f) => f.type === "signature"), needInit = fields.some((f) => f.type === "initials");
    if (needSig && !pngOk(b.sig)) return bad("Adopt your signature first.");
    if (needInit && !pngOk(b.init, 150000)) return bad("Adopt your initials first.");
    const stmts = [];
    for (const f of fields) {
      if (f.type === "text") {
        const v = str(vals[f.id], 300);
        if (f.required && !v) return bad(`Fill in "${f.label || "the text field"}" on page ${f.page + 1}.`);
        stmts.push(env.DB.prepare(`UPDATE esign_fields SET value = ?1 WHERE id = ?2`).bind(v, f.id));
      } else if (f.type === "checkbox") {
        const v = vals[f.id] === true || vals[f.id] === "1" ? "1" : "0";
        if (f.required && v !== "1") return bad(`Tick the required checkbox${f.label ? ` "${f.label}"` : ""} on page ${f.page + 1}.`);
        stmts.push(env.DB.prepare(`UPDATE esign_fields SET value = ?1 WHERE id = ?2`).bind(v, f.id));
      }
    }
    const t2 = now(), kind = b.kind === "typed" ? "typed" : "drawn", tz = /^[A-Za-z_\/+-]{3,40}$/.test(String(b.tz || "")) ? b.tz : null;
    let tzOk = tz; try { if (tz) new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tzOk = null; }
    stmts.push(env.DB.prepare(`UPDATE esign_recipients SET status = 'signed', signed_at = ?1, consent_at = COALESCE(consent_at, ?1), sig_png = ?2, init_png = ?3, sig_kind = ?4, sig_text = ?5,
      ip = ?6, ua = ?7, geo = ?8, tz = ?9, sess_hash = NULL WHERE id = ?10 AND status != 'signed'`)
      .bind(t2, needSig ? b.sig : null, needInit ? b.init : null, kind, kind === "typed" ? str(b.typed, 80) : null, clientIp(request), clientUa(request), clientGeo(request), tzOk, r.id));
    await env.DB.batch(stmts);
    if (!r.consent_at) await logEvent(env, e, { rcpt: r.id, actor: who, action: "Accepted the Electronic Record and Signature Disclosure", detail: `Version ${DISCLOSURE_V}`, request });
    const sigFields = fields.filter((f) => f.type === "signature").length, initFields = fields.filter((f) => f.type === "initials").length;
    await logEvent(env, e, { rcpt: r.id, actor: who, action: "Signed", detail: `${kind === "typed" ? "Typed" : "Drawn"} signature adopted; ${sigFields} signature${sigFields === 1 ? "" : "s"}${initFields ? `, ${initFields} initial${initFields === 1 ? "" : "s"}` : ""}, ${fields.length} field${fields.length === 1 ? "" : "s"} completed`, request });
    if (e.owner_email) await mail(env, { to: e.owner_email, subject: `${r.name} signed: ${e.title}`, fromName: BRAND,
      text: `${r.name} (${r.email}) signed "${e.title}" on ${fmtTime(t2)}.\n\nEnvelope ID: ${e.id}`, html: emailHtml({ heading: `${r.name} signed`, lines: [`<b>${esc(e.title)}</b>`, `Signed ${esc(fmtTime(t2))}`], foot: [`Envelope ID: ${e.id}`] }) });
    const next = await routeNext(env, e, request);
    let done = false;
    if (next === "done") {
      const fresh = await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE id = ?1`).bind(e.id).first();
      if (fresh.status === "sent") done = await complete(env, fresh, request);
    }
    return json({ ok: true, completed: next === "done", final: done });
  }
  return bad("Not found.", 404);
}

/* ======================= public ======================= */
async function verify({ request, env }, m) {
  const url = new URL(request.url);
  let sha = "", id = "";
  if (m === "POST") { const b = await readJson(request, 2000) || {}; sha = String(b.sha || "").toLowerCase(); id = str(b.id, 60).toUpperCase(); }
  else { sha = String(url.searchParams.get("sha") || "").toLowerCase(); id = str(url.searchParams.get("id"), 60).toUpperCase(); }
  if (sha && /^[a-f0-9]{64}$/.test(sha)) {
    const e = await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE final_sha = ?1 OR cert_sha = ?1 OR (orig_sha = ?1 AND status != 'draft') LIMIT 1`).bind(sha).first();
    if (!e) return json({ ok: true, match: false });
    const kind = e.final_sha === sha ? "signed" : e.cert_sha === sha ? "certificate" : "original";
    const rs = (await env.DB.prepare(`SELECT name, role, status, signed_at FROM esign_recipients WHERE env_id = ?1 AND role = 'signer' ORDER BY ord`).bind(e.id).all()).results;
    const chain = await checkChain(env, e.id);
    const sealOk = !!e.seal && e.seal === await hmac(env, ["seal", e.id, e.orig_sha, e.final_sha, e.cert_sha, e.last_hash].join("|"));
    return json({ ok: true, match: true, kind, envelope: { id: e.id, title: e.title, status: e.status, from: e.owner_name, sent_at: e.sent_at, completed_at: e.completed_at, pages: e.pages },
      signers: rs.map((x) => ({ name: x.name, status: x.status, signed_at: x.signed_at })), chain: chain.ok, events: chain.count, seal: kind === "original" ? null : sealOk });
  }
  if (id) {
    const e = await env.DB.prepare(`SELECT id, status, sent_at, completed_at FROM esign_envelopes WHERE id = ?1`).bind(id).first();
    if (!e || e.status === "draft") return json({ ok: true, match: false });
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM esign_recipients WHERE env_id = ?1 AND role = 'signer'`).bind(e.id).first();
    return json({ ok: true, match: true, kind: "id", envelope: { id: e.id, status: e.status, sent_at: e.sent_at, completed_at: e.completed_at, signers: n.n } });
  }
  return bad("Upload a PDF or enter an envelope ID.");
}

async function expire(env, e) {
  await env.DB.prepare(`UPDATE esign_envelopes SET status = 'expired', ended_at = ?1, end_reason = 'Expired before everyone signed' WHERE id = ?2 AND status = 'sent'`).bind(now(), e.id).run();
  await logEvent(env, e, { actor: BRAND, action: "Envelope expired", detail: "Not everyone signed before the expiry date" });
  if (e.owner_email) await mail(env, { to: e.owner_email, subject: `Expired: ${e.title}`, fromName: BRAND,
    text: `"${e.title}" expired before everyone signed. Open eSign to make a copy and send it again.\n\nEnvelope ID: ${e.id}` });
}
// Reminders and expiry. Safe to call any time; does only what is due. Called by the cron Worker every 3 hours.
async function tick(env) {
  const t = now(), out = { expired: 0, reminded: 0 };
  const exp = (await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE status = 'sent' AND expires_at < ?1 LIMIT 50`).bind(t).all()).results;
  for (const e of exp) { await expire(env, e); out.expired++; }
  const due = (await env.DB.prepare(`SELECT r.*, e.remind_days FROM esign_recipients r JOIN esign_envelopes e ON e.id = r.env_id
    WHERE e.status = 'sent' AND e.remind_days > 0 AND r.role = 'signer' AND r.status IN ('sent','viewed','verified') AND r.remind_count < 5 LIMIT 200`).all()).results;
  for (const r of due) {
    const last = Date.parse(r.last_remind || r.sent_at || t);
    if (Date.now() - last < r.remind_days * 864e5) continue;
    const e = await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE id = ?1`).bind(r.env_id).first();
    await sendInvite(env, e, r, true);
    await env.DB.prepare(`UPDATE esign_recipients SET last_remind = ?1, remind_count = remind_count + 1 WHERE id = ?2`).bind(t, r.id).run();
    await logEvent(env, e, { rcpt: r.id, actor: BRAND, action: "Automatic reminder sent", detail: `${r.name} <${r.email}>` });
    out.reminded++;
  }
  return json({ ok: true, ...out });
}

/* ======================= subscriptions: public + subscriber ======================= */
const planPub = (p) => ({ id: p.id, name: p.name, blurb: p.blurb, price_cents: p.price_cents, interval: p.interval, envelopes: p.envelopes, trial_days: p.trial_days, card_upfront: p.card_upfront, text: planText(p) });
async function publicPlans(env) {
  const ps = await plans(env);
  const offers = {};
  for (const p of ps) { const a = await autoPromo(env, p.id); if (a) offers[p.id] = promoText(a, p); }
  return json({ ok: true, plans: ps.map(planPub), offers, open: (await setting(env, "open")) !== "0", stripe: !!env.STRIPE_SECRET_KEY });
}
const accessView = (a) => ({ ok: a.ok, reason: a.reason, used: a.used, limit: a.limit, since: a.since,
  plan: a.plan ? planPub(a.plan) : null, sub: a.sub ? { status: a.sub.status, period_end: a.sub.period_end, trial_end: a.sub.trial_end, cancel_at_end: !!a.sub.cancel_at_end,
    comp_until: a.sub.comp_until, promo: a.sub.promo, stripe: !!a.sub.stripe_sub, trial_used: !!a.sub.trial_used } : null });
async function me(env, u) {
  const pp = await publicPlans(env), base = await pp.json();
  if (!u) return json({ ...base, user: null });
  const a = await access(env, u, stripe);
  return json({ ...base, user: { name: u.name, email: u.email }, access: accessView(a) });
}
// Works out what a checkout would give: trial days, Stripe coupon, or free access without Stripe.
async function offerFor(env, u, plan, code) {
  let promo = null;
  if (code) { const f = await findPromo(env, code, plan.id); if (f.error) return { error: f.error }; promo = f.promo; }
  else promo = await autoPromo(env, plan.id);
  const sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(u.id).first();
  const trialOk = !(sub && sub.trial_used);
  let trial = trialOk ? plan.trial_days || 0 : 0, percent = 0, months = 0, free = plan.price_cents === 0;
  if (promo) {
    if (promo.kind === "free_months") trial = (trialOk ? trial : 0) + promo.value * 30;
    else if (promo.kind === "free_forever") free = true;
    else if (promo.kind === "percent") { percent = Math.max(1, Math.min(100, promo.value)); months = promo.months || 0; if (percent === 100 && months >= 999) free = true; }
  }
  const lines = [];
  if (free) lines.push("Free access, no card needed");
  else {
    if (trial) lines.push(`${trial % 30 === 0 ? `${trial / 30} month${trial / 30 > 1 ? "s" : ""}` : `${trial} days`} free, then ${planText(plan).price}`);
    if (percent) lines.push(promoText(promo, plan));
    if (!trial && !percent) lines.push(`${planText(plan).price}, billed today`);
    if (!trialOk && plan.trial_days) lines.push("(The free trial applies once per account.)");
  }
  return { promo, trial, percent, months, free, summary: lines.join(" · ") };
}
const SUB_BILL = {
  async "promo-check"({ request, env }, owner, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 2000) || {}, plan = (await plans(env)).find((p) => p.id === b.plan);
    if (!plan) return bad("Choose a plan.");
    const o = await offerFor(env, owner.user, plan, normCode(b.code));
    return o.error ? bad(o.error) : json({ ok: true, summary: o.summary, promo: o.promo ? promoText(o.promo, plan) : "" });
  },
  async checkout({ request, env }, owner, m) {
    if (m !== "POST") return bad("Not found.", 404);
    if ((await setting(env, "open")) === "0") return bad("New eSign subscriptions are paused right now. Contact info@workerpool.ca.");
    const b = await readJson(request, 2000) || {}, plan = (await plans(env)).find((p) => p.id === b.plan);
    if (!plan) return bad("Choose a plan.");
    const u = owner.user, o = await offerFor(env, u, plan, normCode(b.code));
    if (o.error) return bad(o.error);
    const sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(u.id).first();
    if (sub && sub.stripe_sub && ["trialing", "active", "past_due"].includes(sub.status)) return bad("You already have a subscription. Use Manage billing to change it.");
    const t = now();
    if (o.free) { // no Stripe needed
      await upsertSub(env, u.id, { plan_id: plan.id, status: "free", promo: o.promo ? o.promo.code : null, period_start: t, period_end: null, stripe_sub: null });
      if (o.promo) await env.DB.prepare(`UPDATE esign_promos SET uses = uses + 1 WHERE code = ?1`).bind(o.promo.code).run();
      return json({ ok: true, done: true });
    }
    if (!env.STRIPE_SECRET_KEY) return bad("Online payment isn't switched on yet. Contact WorkerPool to get access.", 503);
    let coupon = null;
    if (o.percent) {
      coupon = o.promo.stripe_coupon;
      if (!coupon) {
        const cp = await stripe(env, "POST", "coupons", { percent_off: o.percent, currency: "cad", name: `${o.promo.code} (${promoText(o.promo, plan)})`.slice(0, 40),
          ...(o.months >= 999 ? { duration: "forever" } : o.months ? { duration: "repeating", duration_in_months: o.months } : { duration: "once" }) });
        coupon = cp.id;
        await env.DB.prepare(`UPDATE esign_promos SET stripe_coupon = ?1 WHERE code = ?2`).bind(coupon, o.promo.code).run();
      }
    }
    const s = await stripe(env, "POST", "checkout/sessions", {
      mode: "subscription",
      ...(sub && sub.stripe_customer ? { customer: sub.stripe_customer } : { customer_email: u.email }),
      line_items: { 0: { quantity: 1, price_data: { currency: "cad", unit_amount: plan.price_cents, recurring: { interval: plan.interval === "year" ? "year" : "month" },
        product_data: { name: `${BRAND} – ${plan.name}` } } } },
      subscription_data: { ...(o.trial ? { trial_period_days: o.trial } : {}), metadata: { product: "esign", user_id: u.id, plan_id: plan.id, promo: o.promo ? o.promo.code : "" },
        description: `${BRAND} ${plan.name}` },
      ...(o.trial && !plan.card_upfront ? { payment_method_collection: "if_required" } : {}),
      ...(coupon ? { discounts: { 0: { coupon } } } : {}),
      metadata: { product: "esign", user_id: u.id, plan_id: plan.id, promo: o.promo ? o.promo.code : "" },
      success_url: `${SITE(env)}/esign/?paid={CHECKOUT_SESSION_ID}`, cancel_url: `${SITE(env)}/esign/?cancelled=1`,
      ...(env.STRIPE_TAX === "on" ? { automatic_tax: { enabled: "true" } } : {}),
    });
    return json({ ok: true, url: s.url });
  },
  async paid({ request, env }, owner, m) {
    const sid = str(new URL(request.url).searchParams.get("session_id"), 200);
    if (!sid) return bad("Missing payment reference.");
    const s = await stripe(env, "GET", "checkout/sessions/" + encodeURIComponent(sid));
    if (!s.metadata || s.metadata.product !== "esign" || s.metadata.user_id !== owner.id) return bad("That payment isn't for this account.", 403);
    if (s.status !== "complete" || !s.subscription) return bad("The payment isn't complete yet.");
    const sub = await stripe(env, "GET", "subscriptions/" + s.subscription);
    const first = !(await env.DB.prepare(`SELECT session_id FROM esign_payments WHERE session_id = ?1`).bind(sid).first());
    await upsertSub(env, owner.id, { plan_id: s.metadata.plan_id, status: sub.status, promo: s.metadata.promo || null, stripe_sub: sub.id, stripe_customer: typeof s.customer === "string" ? s.customer : null });
    await syncStripeSub(env, owner.id, sub);
    if (sub.trial_end) await env.DB.prepare(`UPDATE esign_subs SET trial_used = 1 WHERE user_id = ?1`).bind(owner.id).run();
    if (first) {
      await env.DB.prepare(`INSERT OR IGNORE INTO esign_payments (session_id, user_id, plan_id, promo, created) VALUES (?1,?2,?3,?4,?5)`).bind(sid, owner.id, s.metadata.plan_id, s.metadata.promo || null, now()).run();
      if (s.metadata.promo) await env.DB.prepare(`UPDATE esign_promos SET uses = uses + 1 WHERE code = ?1`).bind(s.metadata.promo).run();
      await mail(env, { to: env.ADMIN_EMAIL, subject: `New eSign subscriber: ${owner.name}`, text: `${owner.name} <${owner.email}> subscribed to ${s.metadata.plan_id}${s.metadata.promo ? ` with ${s.metadata.promo}` : ""} (status: ${sub.status}).` });
    }
    return json({ ok: true });
  },
  async cancel({ env }, owner, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(owner.id).first();
    if (!sub) return bad("You don't have a subscription.");
    if (!sub.stripe_sub) { await env.DB.prepare(`UPDATE esign_subs SET status = 'canceled', updated = ?1 WHERE user_id = ?2`).bind(now(), owner.id).run(); return json({ ok: true }); }
    await syncStripeSub(env, owner.id, await stripe(env, "POST", "subscriptions/" + sub.stripe_sub, { cancel_at_period_end: "true" }));
    return json({ ok: true });
  },
  async resume({ env }, owner, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(owner.id).first();
    if (!sub || !sub.stripe_sub) return bad("There's no subscription to resume.");
    await syncStripeSub(env, owner.id, await stripe(env, "POST", "subscriptions/" + sub.stripe_sub, { cancel_at_period_end: "false" }));
    return json({ ok: true });
  },
  async portal({ env }, owner, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(owner.id).first();
    if (!sub || !sub.stripe_customer) return bad("There's no billing account yet.");
    const p = await stripe(env, "POST", "billing_portal/sessions", { customer: sub.stripe_customer, return_url: `${SITE(env)}/esign/` });
    return json({ ok: true, url: p.url });
  },
};
async function upsertSub(env, userId, f) {
  const t = now();
  await env.DB.prepare(`INSERT INTO esign_subs (user_id, plan_id, status, promo, period_start, period_end, stripe_sub, stripe_customer, comp_until, comp_note, created, updated)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)
    ON CONFLICT(user_id) DO UPDATE SET plan_id = excluded.plan_id, status = excluded.status, promo = excluded.promo, period_start = excluded.period_start, period_end = excluded.period_end,
      stripe_sub = excluded.stripe_sub, stripe_customer = COALESCE(excluded.stripe_customer, esign_subs.stripe_customer), comp_until = excluded.comp_until, comp_note = excluded.comp_note, updated = excluded.updated`)
    .bind(userId, f.plan_id, f.status, f.promo || null, f.period_start || t, f.period_end || null, f.stripe_sub || null, f.stripe_customer || null, f.comp_until || null, f.comp_note || null, t).run();
}

/* ======================= subscriptions: admin ======================= */
const ADMIN_BILL = {
  async bill({ env }) {
    const ps = await plans(env, true), pr = (await env.DB.prepare(`SELECT * FROM esign_promos ORDER BY created DESC`).all()).results;
    const subs = (await env.DB.prepare(`SELECT s.*, u.name, u.email, (SELECT COUNT(*) FROM esign_envelopes e WHERE e.owner = s.user_id AND e.sent_at IS NOT NULL) AS sent,
        (SELECT COUNT(*) FROM esign_envelopes e WHERE e.owner = s.user_id AND e.status = 'completed') AS completed
      FROM esign_subs s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.updated DESC LIMIT 2000`).all()).results;
    return json({ ok: true, plans: ps.map((p) => ({ ...p, text: planText(p) })), promos: pr.map((p) => ({ ...p, text: promoText(p) })), subs, open: (await setting(env, "open")) !== "0", stripe: !!env.STRIPE_SECRET_KEY });
  },
  async "plan-save"({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 4000) || {};
    const name = str(b.name, 60);
    if (!name) return bad("Give the plan a name.");
    const id = str(b.id, 40) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) + "-" + rid().slice(0, 4);
    const price = Math.round((parseFloat(b.price) || 0) * 100);
    if (price && price < 50) return bad("Stripe's smallest price is $0.50. Use $0 for a free plan.");
    const f = { name, blurb: str(b.blurb, 160), price, interval: b.interval === "year" ? "year" : "month", envelopes: Math.max(0, parseInt(b.envelopes) || 0),
      trial: Math.max(0, Math.min(365, parseInt(b.trial_days) || 0)), card: b.card_upfront === false || b.card_upfront === 0 ? 0 : 1, active: b.active === false || b.active === 0 ? 0 : 1, sort: parseInt(b.sort) || 0 };
    await env.DB.prepare(`INSERT INTO esign_plans (id, name, blurb, price_cents, interval, envelopes, trial_days, card_upfront, active, sort, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, blurb = excluded.blurb, price_cents = excluded.price_cents, interval = excluded.interval, envelopes = excluded.envelopes,
        trial_days = excluded.trial_days, card_upfront = excluded.card_upfront, active = excluded.active, sort = excluded.sort`)
      .bind(id, f.name, f.blurb, f.price, f.interval, f.envelopes, f.trial, f.card, f.active, f.sort, now()).run();
    await setSetting(env, "plans_seeded", "1");
    return json({ ok: true, id });
  },
  async "plan-delete"({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 1000) || {}, id = str(b.id, 40);
    const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM esign_subs WHERE plan_id = ?1`).bind(id).first();
    if (used.n) { await env.DB.prepare(`UPDATE esign_plans SET active = 0 WHERE id = ?1`).bind(id).run(); return json({ ok: true, hidden: true }); }
    await env.DB.prepare(`DELETE FROM esign_plans WHERE id = ?1`).bind(id).run();
    return json({ ok: true });
  },
  async "promo-save"({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 4000) || {}, code = normCode(b.code);
    if (!code) return bad("Enter a code (letters and numbers).");
    const kind = ["percent", "free_months", "free_forever"].includes(b.kind) ? b.kind : "percent";
    const value = kind === "free_forever" ? 100 : Math.max(1, Math.min(kind === "percent" ? 100 : 24, parseInt(b.value) || 0));
    if (!value) return bad(kind === "percent" ? "Enter the percent off." : "Enter how many free months.");
    const months = kind === "percent" ? (b.months === "forever" ? 999 : Math.max(0, Math.min(36, parseInt(b.months) || 0))) : 0;
    const old = await env.DB.prepare(`SELECT * FROM esign_promos WHERE code = ?1`).bind(code).first();
    // the Stripe coupon is made at first use; changing the discount needs a new one
    const keepCoupon = old && old.kind === kind && old.value === value && old.months === months ? old.stripe_coupon : null;
    await env.DB.prepare(`INSERT INTO esign_promos (code, kind, value, months, plan_id, auto, max_uses, uses, expires, active, stripe_coupon, note, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
      ON CONFLICT(code) DO UPDATE SET kind = excluded.kind, value = excluded.value, months = excluded.months, plan_id = excluded.plan_id, auto = excluded.auto, max_uses = excluded.max_uses,
        expires = excluded.expires, active = excluded.active, stripe_coupon = excluded.stripe_coupon, note = excluded.note`)
      .bind(code, kind, value, months, str(b.plan_id, 40) || null, b.auto ? 1 : 0, parseInt(b.max_uses) > 0 ? parseInt(b.max_uses) : null, old ? old.uses : 0,
        /^\d{4}-\d{2}-\d{2}$/.test(String(b.expires || "")) ? b.expires : null, b.active === false || b.active === 0 ? 0 : 1, keepCoupon, str(b.note, 200), old ? old.created : now()).run();
    return json({ ok: true });
  },
  async "promo-delete"({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 1000) || {};
    await env.DB.prepare(`DELETE FROM esign_promos WHERE code = ?1`).bind(normCode(b.code)).run();
    return json({ ok: true });
  },
  async comp({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 2000) || {}, email = str(b.email, 160).toLowerCase();
    const u = await env.DB.prepare(`SELECT id, name, email FROM users WHERE email = ?1`).bind(email).first();
    if (!u) return bad("No WorkerPool account uses that email. Ask them to create one at workerpool.ca/esign/ first.");
    const plan = (await plans(env, true)).find((p) => p.id === b.plan_id);
    if (!plan) return bad("Choose which plan's limits apply.");
    const until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.until || "")) ? b.until : null;
    const sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(u.id).first();
    if (sub && sub.stripe_sub && ["trialing", "active", "past_due"].includes(sub.status)) return bad("This person has a paid subscription. Cancel it in Stripe first, or give them a promo code instead.");
    await upsertSub(env, u.id, { plan_id: plan.id, status: "comp", comp_until: until, comp_note: str(b.note, 200), period_start: now() });
    if (b.notify) await mail(env, { to: u.email, subject: `You have free access to ${BRAND}`, fromName: BRAND,
      text: `Hi ${String(u.name || "").split(" ")[0] || "there"},\n\nWe've given you free access to ${BRAND} (${plan.name} plan)${until ? ` until ${fmtDate(until + "T12:00:00Z")}` : ""}.\nSend documents for signature at ${SITE(env)}/esign/ using your WorkerPool account.\n\nWorkerPool` });
    return json({ ok: true });
  },
  async "sub-end"({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 1000) || {}, sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(str(b.user_id, 60)).first();
    if (!sub) return bad("Not found.", 404);
    if (sub.stripe_sub && env.STRIPE_SECRET_KEY && ["trialing", "active", "past_due"].includes(sub.status)) {
      if (b.now) await syncStripeSub(env, sub.user_id, await stripe(env, "DELETE", "subscriptions/" + sub.stripe_sub));
      else await syncStripeSub(env, sub.user_id, await stripe(env, "POST", "subscriptions/" + sub.stripe_sub, { cancel_at_period_end: "true" }));
    } else await env.DB.prepare(`UPDATE esign_subs SET status = 'canceled', updated = ?1 WHERE user_id = ?2`).bind(now(), sub.user_id).run();
    return json({ ok: true });
  },
  async settings({ request, env }, m) {
    if (m !== "POST") return bad("Not found.", 404);
    const b = await readJson(request, 1000) || {};
    if ("open" in b) await setSetting(env, "open", b.open ? "1" : "0");
    return json({ ok: true });
  },
};
