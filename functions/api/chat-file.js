// Live chat files for visitors: send a file to the admin, or open a file in your own conversation.
// Files are kept privately in R2 (RESUMES bucket, under chat/).
import { json, chatOpen, chatThread, chatNotify, fileName, fileCheck, fileResponse, FILE_MAX } from "../_lib.js";
export async function onRequestPost({ request, env }) {
  if (!env.RESUMES) return json({ ok: false, error: "File sharing isn't switched on yet." }, 503);
  const t = await chatThread(env, request);
  if (!t) return json({ ok: false, error: "Start the chat first, then send your file." }, 400);
  const open = chatOpen();
  if (!open && !t.email) return json({ ok: false, error: "We're offline right now. Add your email so we can reply.", needEmail: true }, 400);
  if (parseInt(request.headers.get("content-length") || "0") > FILE_MAX) return json({ ok: false, error: "That file is over 10 MB." }, 413);
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_files WHERE thread_id = ?1 AND sender = 'visitor'`).bind(t.id).first();
  if (count && count.n >= 25) return json({ ok: false, error: "This chat has reached its 25-file limit. Email hello@workerpool.ca for more." }, 400);
  const name = fileName(request), buf = await request.arrayBuffer();
  const k = fileCheck(name, buf);
  if (k.error) return json({ ok: false, error: k.error }, 400);
  const now = new Date().toISOString(), fid = crypto.randomUUID(), key = `chat/${t.id}/${fid}.${k.ext}`;
  await env.RESUMES.put(key, buf, { httpMetadata: { contentType: k.type }, customMetadata: { name, thread: t.id, sender: "visitor" } });
  const ins = await env.DB.prepare(`INSERT INTO chat_messages (thread_id, sender, body, created) VALUES (?1, 'visitor', '', ?2)`).bind(t.id, now).run();
  await env.DB.prepare(`INSERT INTO chat_files (id, thread_id, msg_id, sender, name, size, type, r2_key, created) VALUES (?1, ?2, ?3, 'visitor', ?4, ?5, ?6, ?7, ?8)`)
    .bind(fid, t.id, ins.meta.last_row_id, name, buf.byteLength, k.type, key, now).run();
  await env.DB.prepare(`UPDATE chat_threads SET status = 'open', updated = ?1, visitor_seen = ?1 WHERE id = ?2`).bind(now, t.id).run();
  await chatNotify(env, t, { open, isNew: false, text: `[Sent a file: ${name}, ${Math.max(1, Math.round(buf.byteLength / 1024))} KB]` });
  return json({ ok: true });
}
export async function onRequestGet({ request, env }) {
  const t = await chatThread(env, request);
  if (!t || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
  const f = await env.DB.prepare(`SELECT * FROM chat_files WHERE id = ?1 AND thread_id = ?2`).bind(new URL(request.url).searchParams.get("id") || "", t.id).first();
  if (!f) return json({ ok: false, error: "Not found." }, 404);
  const obj = await env.RESUMES.get(f.r2_key);
  if (!obj) return json({ ok: false, error: "That file was removed." }, 404);
  return fileResponse(obj, f.name, f.type);
}
