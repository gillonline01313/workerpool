import { json, str, readJson, randomToken, sha256hex, sendEmail } from "../../_lib.js";
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 1000);
  const email = str(b && b.email, 120).toLowerCase();
  const u = email ? await env.DB.prepare(`SELECT id, name FROM users WHERE email = ?1`).bind(email).first() : null;
  if (u) {
    const token = randomToken();
    await env.DB.prepare(`DELETE FROM resets WHERE user_id = ?1`).bind(u.id).run();
    await env.DB.prepare(`INSERT INTO resets (token_hash, user_id, expires) VALUES (?1, ?2, ?3)`)
      .bind(await sha256hex(token), u.id, new Date(Date.now() + 3600e3).toISOString()).run();
    const site = env.SITE_URL || new URL(request.url).origin;
    await sendEmail(env, email, "Reset your WorkerPool password",
      `Hi ${u.name.split(" ")[0]},\n\nUse this link to choose a new password. It works for 1 hour:\n${site}/reset/?t=${token}\n\nIf you didn't ask for this, you can ignore this email.\n\nWorkerPool`);
  }
  // Same answer either way, so the form can't be used to find out who has an account.
  return json({ ok: true });
}
