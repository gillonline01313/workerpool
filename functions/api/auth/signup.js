import { json, str, isEmail, readJson, id, hashPassword, createSession, logSignup } from "../../_lib.js";
// Every attempt is recorded for the admin's Sign-ups report (outcome, reason, location, device), never the password.
export async function onRequestPost(ctx) {
  const b = await readJson(ctx.request, 4000);
  const res = await create(ctx, b);
  let j = {}; try { j = await res.clone().json(); } catch {}
  const u = j.ok ? await ctx.env.DB.prepare(`SELECT id FROM users WHERE email = ?1`).bind(str(b && b.email, 120).toLowerCase()).first().catch(() => null) : null;
  await logSignup(ctx.request, ctx.env, { source: "Main site", outcome: j.ok ? "success" : "failed", reason: j.ok ? null : j.error,
    name: b && b.name, email: b && b.email, phone: b && b.phone, userId: u && u.id, vid: b && b.vid, tz: b && b.tz, ref: b && b.ref });
  return res;
}
async function create({ request, env }, b) {
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
