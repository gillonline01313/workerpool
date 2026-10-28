// Sign-up events seen only in the browser: the sign-up form was opened, or the form stopped a submit
// (missing name, short password…). Server-side outcomes are logged by the sign-up endpoints themselves.
import { json, readJson, str, logSignup } from "../_lib.js";
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 3000);
  if (!b || !["opened", "blocked"].includes(b.outcome)) return json({ ok: false }, 400);
  const source = b.source === "Forum" ? "Forum" : "Main site";
  if (b.outcome === "opened" && env.DB && /^[a-z0-9]{6,24}$/.test(b.vid || "")) {
    // one "opened" per visitor per form per hour is enough
    try {
      const dup = await env.DB.prepare(`SELECT 1 FROM signup_log WHERE vid = ?1 AND source = ?2 AND outcome = 'opened' AND t > ?3 LIMIT 1`)
        .bind(b.vid, source, new Date(Date.now() - 36e5).toISOString()).first();
      if (dup) return json({ ok: true });
    } catch {}
  }
  await logSignup(request, env, { source, outcome: b.outcome, reason: b.outcome === "blocked" ? str(b.reason, 200) : null,
    name: b.name, email: b.email, phone: b.phone, username: b.username, vid: b.vid, tz: b.tz, ref: b.ref });
  return json({ ok: true });
}
