// Voice notes from the chat widget: up to 2 minutes, stored privately in R2 (RESUMES bucket, under chat/).
// A voice note joins the visitor's chat (or starts one), so the team listens and replies in the admin Live chat tab.
// Same hours as chat: live 8:00 to 23:00 Edmonton time; outside them an email is required so we can reply.
import { json, str, isEmail, chatOpen, chatThread, chatNotify, chatStartThread, voiceCheck, VOICE_MAX, VOICE_SECS } from "../_lib.js";
const hdr = (request, k, n) => { try { return str(decodeURIComponent(request.headers.get(k) || ""), n); } catch { return ""; } };

export async function onRequestPost({ request, env }) {
  if (!env.RESUMES) return json({ ok: false, error: "Voice notes aren't switched on yet. Please type a message instead." }, 503);
  if (parseInt(request.headers.get("content-length") || "0") > VOICE_MAX) return json({ ok: false, error: "That recording is too long. Keep it under 2 minutes." }, 413);
  const open = chatOpen(), now = new Date().toISOString();
  const email = hdr(request, "x-email", 160).toLowerCase(), phone = hdr(request, "x-phone", 40).replace(/[^\d+()\-. ]/g, "");
  if (email && !isEmail(email)) return json({ ok: false, error: "Check your email address." }, 400);
  const secs = Math.max(1, Math.min(VOICE_SECS, parseInt(request.headers.get("x-duration")) || 0));

  let t = await chatThread(env, request), cookie = null, isNew = false;
  if (t) {
    const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_files WHERE thread_id = ?1 AND sender = 'visitor' AND type LIKE 'audio/%' AND created > ?2`)
      .bind(t.id, new Date(Date.now() - 6e5).toISOString()).first();
    if (recent && recent.n >= 5) return json({ ok: false, error: "You've sent several voice notes in the last few minutes. Wait a little, or type a message." }, 429);
    const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_files WHERE thread_id = ?1 AND sender = 'visitor'`).bind(t.id).first();
    if (total && total.n >= 25) return json({ ok: false, error: "This chat has reached its limit for files and voice notes. Email hello@workerpool.ca." }, 400);
    if (!open && !t.email && !email) return json({ ok: false, error: "We're offline right now. Add your email so we can reply.", needEmail: true }, 400);
  }
  const buf = await request.arrayBuffer();
  const k = voiceCheck(buf);
  if (k.error) return json({ ok: false, error: k.error }, 400);
  if (!t) {
    const r = await chatStartThread(env, request, { name: hdr(request, "x-name", 80), email, page: hdr(request, "x-page", 120), open });
    if (r.error) return json({ ok: false, error: r.error }, r.status);
    t = r.t; cookie = r.cookie; isNew = true;
  } else {
    await env.DB.prepare(`UPDATE chat_threads SET email = COALESCE(email, ?1) WHERE id = ?2`).bind(email || null, t.id).run();
    if (!t.email && email) t.email = email;
  }

  const len = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const body = `🎤 Voice note · ${len}${phone ? `\nPhone: ${phone}` : ""}`;
  const stamp = now.slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})/, "$1-");
  const name = `voice-note-${stamp}.${k.ext}`, fid = crypto.randomUUID(), key = `chat/${t.id}/${fid}.${k.ext}`;
  await env.RESUMES.put(key, buf, { httpMetadata: { contentType: k.type }, customMetadata: { name, thread: t.id, sender: "visitor", seconds: String(secs) } });
  const ins = await env.DB.prepare(`INSERT INTO chat_messages (thread_id, sender, body, created) VALUES (?1, 'visitor', ?2, ?3)`).bind(t.id, body, now).run();
  await env.DB.prepare(`INSERT INTO chat_files (id, thread_id, msg_id, sender, name, size, type, r2_key, created) VALUES (?1, ?2, ?3, 'visitor', ?4, ?5, ?6, ?7, ?8)`)
    .bind(fid, t.id, ins.meta.last_row_id, name, buf.byteLength, k.type, key, now).run();
  await env.DB.prepare(`UPDATE chat_threads SET status = 'open', updated = ?1, visitor_seen = ?1 WHERE id = ?2`).bind(now, t.id).run();
  await chatNotify(env, t, { open, isNew, voice: true, text: `[Left a ${len} voice note${phone ? `. Phone: ${phone}` : ""}]\nListen to it in the Live chat tab.` });

  const res = json({ ok: true, open });
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
