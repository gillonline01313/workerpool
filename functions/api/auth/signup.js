import { json, str, isEmail, readJson, id, hashPassword, createSession } from "../../_lib.js";
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 4000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  const name = str(b.name, 120), email = str(b.email, 120).toLowerCase(), phone = str(b.phone, 40), pass = typeof b.password === "string" ? b.password : "";
  if (!name) return json({ ok: false, error: "Enter your full name." }, 400);
  if (!isEmail(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
  if (phone.replace(/\D/g, "").length < 7) return json({ ok: false, error: "Enter a phone number we can reach you on." }, 400);
  if (pass.length < 8 || pass.length > 200) return json({ ok: false, error: "Password needs at least 8 characters." }, 400);
  const exists = await env.DB.prepare(`SELECT id FROM users WHERE email = ?1`).bind(email).first();
  if (exists) return json({ ok: false, error: "An account with this email already exists. Sign in instead." }, 409);
  const uid = id(), now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, phone, pass_hash, created, step, profile, fail_count, locked_until) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'basics', ?7, 0, '')`
  ).bind(uid, email, name, phone, await hashPassword(pass), now, JSON.stringify({ email, phone, jobs: [] })).run();
  const cookie = await createSession(env, uid);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": cookie } });
}
