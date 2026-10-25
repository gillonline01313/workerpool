// Saves the questionnaire as the candidate goes, so it can be continued on any device.
import { json, readJson, getUser } from "../_lib.js";
const STEPS = ["basics", "location", "province", "country", "status", "work", "lang", "services", "done"];
export async function onRequestPut({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to keep saving." }, 401);
  const b = await readJson(request, 60000);
  if (!b || typeof b.profile !== "object") return json({ ok: false, error: "Invalid request." }, 400);
  const step = STEPS.includes(b.step) ? b.step : "basics";
  await env.DB.prepare(`UPDATE users SET profile = ?1, step = ?2 WHERE id = ?3`).bind(JSON.stringify(b.profile), step, u.id).run();
  return json({ ok: true });
}
