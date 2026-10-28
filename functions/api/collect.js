// Records one page visit (insert on first send, update sections/clicks/time on later sends).
import { json, str, readJson } from "../_lib.js";
const ID = /^[a-z0-9]{6,24}$/;
let evReady = false; // adds the "ev" column (saved & shared signals) once per worker
async function ensureEv(env) {
  if (evReady) return;
  try { await env.DB.prepare(`ALTER TABLE visits ADD COLUMN ev TEXT`).run(); } catch (e) { /* already there */ }
  evReady = true;
}
export async function onRequestPost({ request, env }) {
  const v = await readJson(request, 20000);
  if (!v || !ID.test(v.id || "") || !ID.test(v.vid || "")) return json({ ok: false }, 400);
  const cf = request.cf || {};
  const sec = (Array.isArray(v.sec) ? v.sec : []).slice(0, 40).map((s) => str(s, 60));
  const clk = (Array.isArray(v.clk) ? v.clk : []).slice(0, 60)
    .map((c) => ({ l: str(c && c.l, 120), n: Math.min(999, Math.max(1, parseInt(c && c.n) || 1)) })).filter((c) => c.l);
  const ev = (Array.isArray(v.ev) ? v.ev : []).slice(0, 30)
    .map((c) => ({ l: str(c && c.l, 80), n: Math.min(999, Math.max(1, parseInt(c && c.n) || 1)), ...(c && ID.test(c.by || "") ? { by: c.by } : {}) })).filter((c) => c.l);
  await ensureEv(env);
  await env.DB.prepare(
    `INSERT INTO visits (id, vid, page, t, tz, lang, src, dev, country, region, city, sec, clk, dur, ev)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
     ON CONFLICT(id) DO UPDATE SET sec = excluded.sec, clk = excluded.clk, dur = excluded.dur, ev = excluded.ev, src = excluded.src
     WHERE visits.vid = excluded.vid`
  ).bind(
    v.id, v.vid, str(v.page, 30), new Date().toISOString(), str(v.tz, 60), str(v.lang, 16), str(v.src, 60), str(v.dev, 12),
    str(cf.country, 4), str(cf.region, 60), str(cf.city, 60), JSON.stringify(sec), JSON.stringify(clk),
    Math.min(86400, Math.max(0, parseInt(v.dur) || 0)), ev.length ? JSON.stringify(ev) : null
  ).run();
  return json({ ok: true });
}
