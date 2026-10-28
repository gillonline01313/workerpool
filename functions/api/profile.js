// Saves the questionnaire as the candidate goes, so it can be continued on any device.
// Also records the last save time and the furthest step reached, for the admin's Questionnaire report.
import { json, readJson, getUser } from "../_lib.js";
const STEPS = ["basics", "location", "province", "country", "status", "work", "lang", "services", "done"];
let colsReady = false;
async function ensureCols(env) {
  if (colsReady) return;
  for (const c of ["progress_at TEXT", "max_step TEXT"]) { try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${c}`).run(); } catch (e) { /* already there */ } }
  colsReady = true;
}
export async function onRequestPut({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to keep saving." }, 401);
  const b = await readJson(request, 60000);
  if (!b || typeof b.profile !== "object") return json({ ok: false, error: "Invalid request." }, 400);
  const step = STEPS.includes(b.step) ? b.step : "basics";
  await ensureCols(env);
  const max = STEPS.indexOf(u.max_step) > STEPS.indexOf(step) ? u.max_step : step;
  await env.DB.prepare(`UPDATE users SET profile = ?1, step = ?2, progress_at = ?3, max_step = ?4 WHERE id = ?5`)
    .bind(JSON.stringify(b.profile), step, new Date().toISOString(), max, u.id).run();
  return json({ ok: true });
}
