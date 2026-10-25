// Admin data API. Every request must carry the ADMIN_KEY secret set in Cloudflare.
import { json, readJson, str, sendEmail, chatOpen } from "../../_lib.js";
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
export async function onRequestGet({ request, env, params }) {
  if (!env.ADMIN_KEY || !same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY)) return json({ ok: false, error: "Wrong admin key." }, 401);
  const route = (params.path || []).join("/");
  const url = new URL(request.url);
  const days = Math.min(3650, Math.max(1, parseInt(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  if (route === "visits") {
    const r = await env.DB.prepare(`SELECT * FROM visits WHERE t >= ?1 ORDER BY t DESC LIMIT 20000`).bind(since).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "interest") {
    const r = await env.DB.prepare(`SELECT * FROM interest ORDER BY created DESC LIMIT 2000`).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "submissions") {
    const r = await env.DB.prepare(`SELECT * FROM submissions ORDER BY created DESC LIMIT 2000`).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "assessments") {
    const r = await env.DB.prepare(
      `SELECT a.*, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone FROM assessments a JOIN users u ON u.id = a.user_id ORDER BY a.updated DESC LIMIT 2000`
    ).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "b2b") {
    const apps = await env.DB.prepare(
      `SELECT a.*, u.name AS acct_name, u.email AS acct_email, u.phone AS acct_phone FROM applications a JOIN users u ON u.id = a.user_id ORDER BY COALESCE(a.submitted, a.updated) DESC LIMIT 1000`
    ).all();
    const docs = await env.DB.prepare(`SELECT id, app_id, doc_key, name, size, uploaded FROM app_docs`).all();
    return json({ ok: true, rows: apps.results, docs: docs.results });
  }
  if (route === "b2b-doc") {
    const d = await env.DB.prepare(`SELECT * FROM app_docs WHERE id = ?1`).bind(url.searchParams.get("id") || "").first();
    if (!d || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
    const obj = await env.RESUMES.get(d.r2_key);
    if (!obj) return json({ ok: false, error: "That file was removed." }, 404);
    return new Response(obj.body, { headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "content-disposition": `attachment; filename="${String(d.name).replace(/"/g, "")}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  if (route === "chat") {
    const r = await env.DB.prepare(
      `SELECT t.id, t.name, t.email, t.page, t.status, t.created, t.updated, t.visitor_seen,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id AND m.sender = 'visitor' AND m.id > t.admin_read) AS unread,
        (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT sender FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender
       FROM chat_threads t ORDER BY t.updated DESC LIMIT 200`
    ).all();
    return json({ ok: true, open: chatOpen(), rows: r.results });
  }
  if (route === "chat-thread") {
    const tid = url.searchParams.get("id") || "", after = Math.max(0, parseInt(url.searchParams.get("after")) || 0);
    const r = await env.DB.prepare(`SELECT id, sender, body, created FROM chat_messages WHERE thread_id = ?1 AND id > ?2 ORDER BY id LIMIT 500`).bind(tid, after).all();
    if (r.results.length) await env.DB.prepare(`UPDATE chat_threads SET admin_read = MAX(admin_read, ?1) WHERE id = ?2`).bind(r.results[r.results.length - 1].id, tid).run();
    return json({ ok: true, rows: r.results });
  }
  if (route === "resume") {
    const key = url.searchParams.get("key") || "";
    if (!/^resumes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx?)$/.test(key) || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
    const obj = await env.RESUMES.get(key);
    if (!obj) return json({ ok: false, error: "That resume was replaced or removed." }, 404);
    const name = ((obj.customMetadata && obj.customMetadata.name) || "resume").replace(/"/g, "");
    return new Response(obj.body, { headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

// Admin actions: reply to or close a live chat.
export async function onRequestPost({ request, env, params }) {
  if (!env.ADMIN_KEY || !same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY)) return json({ ok: false, error: "Wrong admin key." }, 401);
  const route = (params.path || []).join("/");
  const b = await readJson(request, 6000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  const t = await env.DB.prepare(`SELECT * FROM chat_threads WHERE id = ?1`).bind(str(b.id, 64)).first();
  if (!t) return json({ ok: false, error: "Chat not found." }, 404);
  const now = new Date().toISOString();
  if (route === "chat-reply") {
    const body = str(b.body, 2000);
    if (!body) return json({ ok: false, error: "Type a reply first." }, 400);
    const ins = await env.DB.prepare(`INSERT INTO chat_messages (thread_id, sender, body, created) VALUES (?1, 'admin', ?2, ?3)`).bind(t.id, body, now).run();
    await env.DB.prepare(`UPDATE chat_threads SET status = 'open', updated = ?1, admin_read = (SELECT MAX(id) FROM chat_messages WHERE thread_id = ?2) WHERE id = ?2`).bind(now, t.id).run();
    // If the visitor has left the page (no check-in for 2 minutes), send the reply by email too.
    let emailed = false;
    if (t.email && (!t.visitor_seen || Date.now() - Date.parse(t.visitor_seen) > 12e4)) {
      emailed = await sendEmail(env, t.email, "WorkerPool replied to your message",
        `Hi ${String(t.name || "").split(" ")[0] || "there"},\n\n${body}\n\nTo continue, open the chat at ${env.SITE_URL || "https://workerpool.ca"}/#chat on the same device, or email hello@workerpool.ca.\nLive chat hours: 8:00 a.m. to 11:00 p.m. Mountain Time, daily.\n\nWorkerPool`);
    }
    return json({ ok: true, id: ins.meta && ins.meta.last_row_id, emailed });
  }
  if (route === "chat-close") {
    await env.DB.prepare(`UPDATE chat_threads SET status = ?1, updated = ?2 WHERE id = ?3`).bind(b.reopen ? "open" : "closed", now, t.id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}
