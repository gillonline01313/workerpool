import { json, str, readJson, checkPassword, createSession } from "../../_lib.js";
const MAX_FAILS = 5, LOCK_MIN = 15;
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 2000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  const email = str(b.email, 120).toLowerCase(), pass = typeof b.password === "string" ? b.password : "";
  const bad = () => json({ ok: false, error: "Email or password doesn't match. Check both and try again." }, 401);
  // Sign in with email, or with a forum username (anything without an @).
  let u = null;
  if (email.includes("@")) u = await env.DB.prepare(`SELECT * FROM users WHERE email = ?1`).bind(email).first();
  else if (email) { try { u = await env.DB.prepare(`SELECT u.* FROM forum_users f JOIN users u ON u.id = f.user_id WHERE f.username_lc = ?1`).bind(email).first(); } catch {} }
  if (!u) return bad();
  const now = new Date();
  if (u.locked_until && u.locked_until > now.toISOString())
    return json({ ok: false, error: `Too many attempts. Try again in ${LOCK_MIN} minutes, or reset your password.` }, 429);
  if (!(await checkPassword(pass, u.pass_hash))) {
    const fails = (u.fail_count || 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MIN * 60000).toISOString() : "";
    await env.DB.prepare(`UPDATE users SET fail_count = ?1, locked_until = ?2 WHERE id = ?3`).bind(fails >= MAX_FAILS ? 0 : fails, lock, u.id).run();
    return bad();
  }
  await env.DB.prepare(`UPDATE users SET fail_count = 0, locked_until = '' WHERE id = ?1`).bind(u.id).run();
  const cookie = await createSession(env, u.id);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": cookie } });
}
