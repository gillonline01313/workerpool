// Admin data API. Every request must carry the ADMIN_KEY secret set in Cloudflare.
import { json, readJson, str, sendEmail, chatOpen, CHAT_MSG_SQL, fileName, fileCheck, fileResponse, FILE_MAX } from "../../_lib.js";
import { NEWS_SEED } from "../../_news.js";
import { autoDraws, edits as drawEdits, merge as mergeDraws, FIELDS as DRAW_FIELDS } from "../../_draws.js";
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
  if (route === "scanner-passes") {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_passes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, docs_used INTEGER NOT NULL DEFAULT 0, docs_max INTEGER NOT NULL, amount INTEGER, note TEXT)`).run();
    const r = await env.DB.prepare(`SELECT id, kind, created, expires, docs_used, docs_max, amount, note FROM scan_passes ORDER BY created DESC LIMIT 1000`).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "news") {
    try {
      const r = await env.DB.prepare(`SELECT * FROM news ORDER BY status = 'archived', pinned DESC, created DESC LIMIT 500`).all();
      return json({ ok: true, rows: r.results });
    } catch { return json({ ok: false, error: "Run schema-news.sql in the D1 console first." }, 500); }
  }
  if (route === "forum") {
    try {
      const topics = await env.DB.prepare(`SELECT * FROM forum_topics ORDER BY last_post DESC LIMIT 300`).all();
      const posts = await env.DB.prepare(
        `SELECT p.id, p.topic_id, p.n, p.username, p.body, p.created, p.status, p.removed_at, p.removed_by, t.title, COALESCE(f.banned, 0) AS banned
         FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id LEFT JOIN forum_users f ON f.user_id = p.user_id ORDER BY p.id DESC LIMIT 300`).all();
      const reports = await env.DB.prepare(
        `SELECT r.id, r.reason, r.created, r.resolved, f.username AS reporter, p.id AS post_id, p.n, p.username, p.body, p.status, p.created AS post_created, t.id AS topic_id, t.title
         FROM forum_reports r JOIN forum_posts p ON p.id = r.post_id JOIN forum_topics t ON t.id = p.topic_id LEFT JOIN forum_users f ON f.user_id = r.user_id
         ORDER BY r.resolved, r.id DESC LIMIT 300`).all();
      const users = await env.DB.prepare(`SELECT COUNT(*) AS n FROM forum_users`).first();
      return json({ ok: true, topics: topics.results, posts: posts.results, reports: reports.results, members: users ? users.n : 0 });
    } catch { return json({ ok: false, error: "Run schema-forum.sql in the D1 console first." }, 500); }
  }
  if (route === "draws") {
    const auto = await autoDraws(request, env), ed = await drawEdits(env);
    return json({ ok: true, ready: ed !== null, checked: auto.checked, updated: auto.updated, sources: auto.sources || [], draws: mergeDraws(auto, ed, true) });
  }
  if (route === "forum-views") {
    try {
      const topic = str(url.searchParams.get("topic"), 64);
      const r = await env.DB.prepare(
        `SELECT v.*, t.title, u.name AS acct_name, u.email AS acct_email
         FROM forum_views v LEFT JOIN forum_topics t ON t.id = v.topic_id LEFT JOIN users u ON u.id = v.user_id
         WHERE v.t >= ?1 ${topic ? "AND v.topic_id = ?2" : ""} ORDER BY v.id DESC LIMIT 1000`).bind(...(topic ? [since, topic] : [since])).all();
      return json({ ok: true, rows: r.results });
    } catch { return json({ ok: false, error: "View details need one more table. Run schema-forum-views.sql in the D1 console." }, 500); }
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
        (SELECT COALESCE(NULLIF(m.body, ''), '📎 ' || (SELECT f.name FROM chat_files f WHERE f.msg_id = m.id)) FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT sender FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender
       FROM chat_threads t ORDER BY t.updated DESC LIMIT 200`
    ).all();
    return json({ ok: true, open: chatOpen(), rows: r.results });
  }
  if (route === "chat-thread") {
    const tid = url.searchParams.get("id") || "", after = Math.max(0, parseInt(url.searchParams.get("after")) || 0);
    const r = await env.DB.prepare(CHAT_MSG_SQL).bind(tid, after, 500).all();
    if (r.results.length) await env.DB.prepare(`UPDATE chat_threads SET admin_read = MAX(admin_read, ?1) WHERE id = ?2`).bind(r.results[r.results.length - 1].id, tid).run();
    return json({ ok: true, rows: r.results });
  }
  if (route === "chat-file") {
    const f = await env.DB.prepare(`SELECT * FROM chat_files WHERE id = ?1`).bind(url.searchParams.get("id") || "").first();
    if (!f || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
    const obj = await env.RESUMES.get(f.r2_key);
    if (!obj) return json({ ok: false, error: "That file was removed." }, 404);
    return fileResponse(obj, f.name, f.type);
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
  if (route === "chat-file") return adminFile(request, env);
  const b = await readJson(request, 6000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  if (route.startsWith("news-")) return newsAction(env, route, b);
  if (route.startsWith("forum-")) return forumAction(env, route, b);
  if (route.startsWith("draws-")) return drawsAction(request, env, route, b);
  const t = await env.DB.prepare(`SELECT * FROM chat_threads WHERE id = ?1`).bind(str(b.id, 64)).first();
  if (!t) return json({ ok: false, error: "Chat not found." }, 404);
  const now = new Date().toISOString();
  if (route === "chat-reply") {
    const body = str(b.body, 2000);
    if (!body) return json({ ok: false, error: "Type a reply first." }, 400);
    const ins = await env.DB.prepare(`INSERT INTO chat_messages (thread_id, sender, body, created) VALUES (?1, 'admin', ?2, ?3)`).bind(t.id, body, now).run();
    await env.DB.prepare(`UPDATE chat_threads SET status = 'open', updated = ?1, admin_read = (SELECT MAX(id) FROM chat_messages WHERE thread_id = ?2) WHERE id = ?2`).bind(now, t.id).run();
    // If the visitor has left the page (no check-in for 2 minutes), send the reply by email too.
    const emailed = await emailIfAway(env, t, body);
    return json({ ok: true, id: ins.meta && ins.meta.last_row_id, emailed });
  }
  if (route === "chat-close") {
    await env.DB.prepare(`UPDATE chat_threads SET status = ?1, updated = ?2 WHERE id = ?3`).bind(b.reopen ? "open" : "closed", now, t.id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

// If the visitor has left the page (no check-in for 2 minutes) and gave an email, send the reply there too.
async function emailIfAway(env, t, text) {
  if (!t.email || (t.visitor_seen && Date.now() - Date.parse(t.visitor_seen) <= 12e4)) return false;
  return sendEmail(env, t.email, "WorkerPool replied to your message",
    `Hi ${String(t.name || "").split(" ")[0] || "there"},\n\n${text}\n\nTo continue, open the chat at ${env.SITE_URL || "https://workerpool.ca"}/#chat on the same device, or email hello@workerpool.ca.\nLive chat hours: 8:00 a.m. to 11:00 p.m. Mountain Time, daily.\n\nWorkerPool`);
}
// Send a file to a visitor in their chat.
async function adminFile(request, env) {
  if (!env.RESUMES) return json({ ok: false, error: "R2 storage (RESUMES binding) isn't connected." }, 503);
  const t = await env.DB.prepare(`SELECT * FROM chat_threads WHERE id = ?1`).bind(request.headers.get("x-thread-id") || "").first();
  if (!t) return json({ ok: false, error: "Chat not found." }, 404);
  if (parseInt(request.headers.get("content-length") || "0") > FILE_MAX) return json({ ok: false, error: "That file is over 10 MB." }, 413);
  const name = fileName(request), buf = await request.arrayBuffer();
  const k = fileCheck(name, buf);
  if (k.error) return json({ ok: false, error: k.error }, 400);
  const now = new Date().toISOString(), fid = crypto.randomUUID(), key = `chat/${t.id}/${fid}.${k.ext}`;
  await env.RESUMES.put(key, buf, { httpMetadata: { contentType: k.type }, customMetadata: { name, thread: t.id, sender: "admin" } });
  const ins = await env.DB.prepare(`INSERT INTO chat_messages (thread_id, sender, body, created) VALUES (?1, 'admin', '', ?2)`).bind(t.id, now).run();
  await env.DB.prepare(`INSERT INTO chat_files (id, thread_id, msg_id, sender, name, size, type, r2_key, created) VALUES (?1, ?2, ?3, 'admin', ?4, ?5, ?6, ?7, ?8)`)
    .bind(fid, t.id, ins.meta.last_row_id, name, buf.byteLength, k.type, key, now).run();
  await env.DB.prepare(`UPDATE chat_threads SET status = 'open', updated = ?1, admin_read = ?2 WHERE id = ?3`).bind(now, ins.meta.last_row_id, t.id).run();
  const emailed = await emailIfAway(env, t, `We sent you a file in the chat: ${name}. Open the chat to download it.`);
  return json({ ok: true, emailed });
}

// "Hot & New" ticker: add, edit, archive, restore, delete, and load starter items.
const NEWS_TAGS = ["hot", "new", "trending", "update"];
async function newsAction(env, route, b) {
  const now = new Date().toISOString();
  try {
    if (route === "news-save") {
      const title = str(b.title, 160), link = str(b.link, 400), expires = str(b.expires, 10);
      if (!title) return json({ ok: false, error: "Add a headline." }, 400);
      if (link && !/^(\/|https:\/\/)/.test(link)) return json({ ok: false, error: "Links must start with / (a page on this site) or https://" }, 400);
      if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return json({ ok: false, error: "Use a date like 2026-12-31." }, 400);
      const tag = NEWS_TAGS.includes(b.tag) ? b.tag : "new", pinned = b.pinned ? 1 : 0, summary = str(b.summary, 400);
      if (b.id) {
        await env.DB.prepare(`UPDATE news SET title = ?1, summary = ?2, tag = ?3, link = ?4, pinned = ?5, expires = ?6, updated = ?7 WHERE id = ?8`)
          .bind(title, summary, tag, link, pinned, expires || null, now, str(b.id, 64)).run();
        return json({ ok: true });
      }
      const nid = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO news (id, title, summary, tag, link, pinned, status, clicks, expires, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'live', 0, ?7, ?8, ?8)`)
        .bind(nid, title, summary, tag, link, pinned, expires || null, now).run();
      return json({ ok: true, id: nid });
    }
    if (route === "news-status") {
      const archive = !b.restore;
      await env.DB.prepare(`UPDATE news SET status = ?1, archived_at = ?2, updated = ?3 WHERE id = ?4`)
        .bind(archive ? "archived" : "live", archive ? now : null, now, str(b.id, 64)).run();
      return json({ ok: true });
    }
    if (route === "news-delete") {
      await env.DB.prepare(`DELETE FROM news WHERE id = ?1 AND status = 'archived'`).bind(str(b.id, 64)).run();
      return json({ ok: true });
    }
    if (route === "news-seed") {
      // Starter items get staggered times so they keep their intended order.
      let i = 0;
      for (const s of NEWS_SEED) {
        const t = new Date(Date.now() - i++ * 60000).toISOString();
        await env.DB.prepare(`INSERT INTO news (id, title, summary, tag, link, pinned, status, clicks, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'live', 0, ?7, ?7)`)
          .bind(crypto.randomUUID(), s.title, s.summary, s.tag, s.link, s.pinned ? 1 : 0, t).run();
      }
      return json({ ok: true });
    }
  } catch { return json({ ok: false, error: "Couldn't save. Run schema-news.sql in the D1 console first." }, 500); }
  return json({ ok: false, error: "Not found." }, 404);
}

// Forum moderation: pin, lock or hide topics, remove or restore posts, ban members, resolve reports.
async function forumAction(env, route, b) {
  const now = new Date().toISOString();
  try {
    if (route === "forum-topic") {
      const ops = { pin: ["pinned", 1], unpin: ["pinned", 0], lock: ["status", "locked"], unlock: ["status", "open"], hide: ["status", "hidden"], unhide: ["status", "open"] };
      const op = ops[b.op];
      if (!op) return json({ ok: false, error: "Unknown action." }, 400);
      await env.DB.prepare(`UPDATE forum_topics SET ${op[0]} = ?1 WHERE id = ?2`).bind(op[1], str(b.id, 64)).run();
      return json({ ok: true });
    }
    if (route === "forum-post") {
      const pid = parseInt(b.id) || 0;
      if (b.op === "hide") await env.DB.prepare(`UPDATE forum_posts SET status = 'removed', removed_at = ?1, removed_by = 'moderator' WHERE id = ?2`).bind(now, pid).run();
      else if (b.op === "restore") await env.DB.prepare(`UPDATE forum_posts SET status = 'live', removed_at = NULL, removed_by = NULL WHERE id = ?1`).bind(pid).run();
      else return json({ ok: false, error: "Unknown action." }, 400);
      await env.DB.prepare(`UPDATE forum_reports SET resolved = 1 WHERE post_id = ?1`).bind(pid).run();
      return json({ ok: true });
    }
    if (route === "forum-ban") {
      await env.DB.prepare(`UPDATE forum_users SET banned = ?1 WHERE username_lc = ?2`).bind(b.ban ? 1 : 0, str(b.username, 20).toLowerCase()).run();
      return json({ ok: true });
    }
    if (route === "forum-resolve") {
      await env.DB.prepare(`UPDATE forum_reports SET resolved = 1 WHERE id = ?1`).bind(parseInt(b.id) || 0).run();
      return json({ ok: true });
    }
  } catch { return json({ ok: false, error: "Couldn't save. Run schema-forum.sql in the D1 console first." }, 500); }
  return json({ ok: false, error: "Not found." }, 404);
}

// Latest draws: edit / hide / restore an automatic draw, or add, edit and delete a draw entered by hand.
async function drawsAction(request, env, route, b) {
  const id = str(b.id, 120), now = new Date().toISOString();
  const clean = (d) => {
    const o = {};
    for (const k of DRAW_FIELDS) if (d && d[k] !== undefined) o[k] = k === "pinned" ? !!d[k] : k === "score" ? (d[k] === "" || d[k] == null || isNaN(+d[k]) ? null : Math.round(+d[k])) : str(String(d[k] ?? ""), k === "source" ? 500 : 200);
    if (o.date !== undefined && !/^\d{4}-\d\d-\d\d$/.test(o.date)) return null;
    if (o.source && !/^https:\/\//.test(o.source)) return null;
    return o;
  };
  try {
    if (route === "draws-save") {
      const d = clean(b.draw);
      if (!d || !d.date || !d.stream || !d.program) return json({ ok: false, error: "Date, program and stream are needed (date as YYYY-MM-DD; source link must start with https://)." }, 400);
      if (!id) { // new draw entered by hand
        const nid = "man-" + crypto.randomUUID().slice(0, 8);
        await env.DB.prepare(`INSERT INTO draw_edits (id, kind, data, updated) VALUES (?1, 'add', ?2, ?3)`).bind(nid, JSON.stringify(d), now).run();
        return json({ ok: true, id: nid });
      }
      const ex = await env.DB.prepare(`SELECT kind FROM draw_edits WHERE id = ?1`).bind(id).first();
      const kind = id.startsWith("man-") ? "add" : "edit";
      await env.DB.prepare(`INSERT INTO draw_edits (id, kind, data, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, updated = excluded.updated`)
        .bind(id, ex && ex.kind === "hide" && kind === "edit" ? "edit" : kind, JSON.stringify(d), now).run();
      return json({ ok: true, id });
    }
    if (!id) return json({ ok: false, error: "Missing draw." }, 400);
    if (route === "draws-hide") { // automatic draw: hide it (survives future updates); manual draw: deleted for good
      if (id.startsWith("man-")) await env.DB.prepare(`DELETE FROM draw_edits WHERE id = ?1`).bind(id).run();
      else await env.DB.prepare(`INSERT INTO draw_edits (id, kind, data, updated) VALUES (?1, 'hide', '{}', ?2) ON CONFLICT(id) DO UPDATE SET kind = 'hide', updated = excluded.updated`).bind(id, now).run();
      return json({ ok: true });
    }
    if (route === "draws-reset") { // back to exactly what the official page says (undo an edit or a hide)
      if (!id.startsWith("man-")) await env.DB.prepare(`DELETE FROM draw_edits WHERE id = ?1`).bind(id).run();
      return json({ ok: true });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch { return json({ ok: false, error: "Run schema-draws.sql in the D1 console first." }, 500); }
}
