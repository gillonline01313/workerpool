import { json, readJson, sha256hex, hashPassword } from "../../_lib.js";
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 2000);
  const token = b && typeof b.token === "string" ? b.token : "", pass = b && typeof b.password === "string" ? b.password : "";
  if (pass.length < 8 || pass.length > 200) return json({ ok: false, error: "Password needs at least 8 characters." }, 400);
  const th = await sha256hex(token);
  const r = await env.DB.prepare(`SELECT * FROM resets WHERE token_hash = ?1 AND expires > ?2`).bind(th, new Date().toISOString()).first();
  if (!r) return json({ ok: false, error: "This reset link has expired or was already used. Request a new one." }, 400);
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET pass_hash = ?1, fail_count = 0, locked_until = '' WHERE id = ?2`).bind(await hashPassword(pass), r.user_id),
    env.DB.prepare(`DELETE FROM resets WHERE user_id = ?1`).bind(r.user_id),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(r.user_id),
  ]);
  return json({ ok: true });
}
