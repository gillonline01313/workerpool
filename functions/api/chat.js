// Live chat for visitors: read your conversation, or send a message to the admin.
// Live hours are 8:00 to 23:00 Edmonton time; outside them messages are still taken (email required) and answered later.
import { json, readJson, str, isEmail, id, randomToken, sha256hex, sendEmail, chatOpen } from "../_lib.js";
const COOKIE = "wp_chat";
const tokenOf = (req) => { const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)wp_chat=([A-Za-z0-9_-]+)/); return m ? m[1] : null; };
async function thread(env, req) {
  const t = tokenOf(req); if (!t) return null;
  return env.DB.prepare(`SELECT * FROM chat_threads WHERE token_hash = ?1`).bind(await sha256hex(t)).first();
}
const msgs = (env, tid, after) => env.DB.prepare(`SELECT id, sender, body, created FROM chat_messages WHERE thread_id = ?1 AND id > ?2 ORDER BY id LIMIT 300`).bind(tid, after).all();

export async function onRequestGet({ request, env }) {
  const open = chatOpen();
  const t = await thread(env, request);
  if (!t) return json({ ok: true, open, thread: null, messages: [] });
  const after = Math.max(0, parseInt(new URL(request.url).searchParams.get("after")) || 0);
  const r = await msgs(env, t.id, after);
  await env.DB.prepare(`UPDATE chat_threads SET visitor_seen = ?1 WHERE id = ?2`).bind(new Date().toISOString(), t.id).run();
  return json({ ok: true, open, thread: { name: t.name, hasEmail: !!t.email, status: t.status }, messages: r.results });
}

export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 6000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  if (b.website) return json({ ok: true, messages: [] }); // honeypot
  const body = str(b.body, 2000);
  if (!body) return json({ ok: false, error: "Type a message first." }, 400);
  const open = chatOpen(), now = new Date().toISOString();
  const email = str(b.email, 160).toLowerCase();
  if (email && !isEmail(email)) return json({ ok: false, error: "Check your email address." }, 400);
  let t = await thread(env, request), cookie = null, isNew = false;
  if (!t) {
    const name = str(b.name, 80);
    if (!name) return json({ ok: false, error: "Enter your name." }, 400);
    if (!open && !email) return json({ ok: false, error: "We're offline right now. Add your email so we can reply." }, 400);
    const ipHash = await sha256hex("chat:" + (request.headers.get("cf-connecting-ip") || ""));
    const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_threads WHERE ip_hash = ?1 AND created > ?2`).bind(ipHash, new Date(Date.now() - 36e5).toISOString()).first();
    if (recent && recent.n >= 5) return json({ ok: false, error: "Too many new chats from this connection. Try again later or email hello@workerpool.ca." }, 429);
    const token = randomToken();
    t = { id: id(), name, email, last_notified: null };
    await env.DB.prepare(`INSERT INTO chat_threads (id, token_hash, name, email, page, ip_hash, status, created, updated, visitor_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?7, ?7)`)
      .bind(t.id, await sha256hex(token), name, email || null, str(b.page, 120), ipHash, now).run();
    cookie = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 86400}`;
    isNew = true;
  } else {
    const burst = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE thread_id = ?1 AND sender = 'visitor' AND created > ?2`).bind(t.id, new Date(Date.now() - 6e5).toISOString()).first();
    if (burst && burst.n >= 30) return json({ ok: false, error: "You're sending messages too fast. Wait a few minutes." }, 429);
    if (!open && !t.email && !email) return json({ ok: false, error: "We're offline right now. Add your email so we can reply.", needEmail: true }, 400);
    await env.DB.prepare(`UPDATE chat_threads SET status = 'open', updated = ?1, visitor_seen = ?1, email = COALESCE(email, ?2) WHERE id = ?3`).bind(now, email || null, t.id).run();
    if (!t.email && email) t.email = email;
  }
  await env.DB.prepare(`INSERT INTO chat_messages (thread_id, sender, body, created) VALUES (?1, 'visitor', ?2, ?3)`).bind(t.id, body, now).run();
  // Email the admin for a new chat, any offline message, or after 10 quiet minutes on an existing chat.
  if (isNew || !open || !t.last_notified || Date.now() - Date.parse(t.last_notified) > 6e5) {
    await env.DB.prepare(`UPDATE chat_threads SET last_notified = ?1 WHERE id = ?2`).bind(now, t.id).run();
    await sendEmail(env, env.ADMIN_EMAIL, `${open ? "Live chat" : "Offline chat message"} from ${t.name}`,
      `${t.name}${t.email ? " (" + t.email + ")" : ""} ${isNew ? "started a chat" : "sent a message"}${open ? "" : " outside live hours"}:\n\n${body}\n\nReply in the admin dashboard: ${env.SITE_URL || "https://workerpool.ca"}/admin/ (Live chat tab)`);
  }
  const r = await msgs(env, t.id, Math.max(0, parseInt(b.after) || 0));
  const res = json({ ok: true, open, messages: r.results });
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
