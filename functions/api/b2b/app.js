// Read or save one application's information sheet.
import { json, readJson, getUser } from "../../_lib.js";
async function load(env, u, appId) {
  return env.DB.prepare(`SELECT * FROM applications WHERE id = ?1 AND user_id = ?2`).bind(appId || "", u.id).first();
}
export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again." }, 401);
  const a = await load(env, u, new URL(request.url).searchParams.get("id"));
  if (!a) return json({ ok: false, error: "Application not found." }, 404);
  const docs = await env.DB.prepare(`SELECT id, doc_key, name, size, uploaded FROM app_docs WHERE app_id = ?1 ORDER BY uploaded`).bind(a.id).all();
  let data = {}; try { data = JSON.parse(a.data || "{}"); } catch {}
  return json({ ok: true, app: { id: a.id, category: a.category, stream: a.stream, app_type: a.app_type, app_name: a.app_name, status: a.status, submitted: a.submitted, data }, docs: docs.results });
}
export async function onRequestPut({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to keep saving." }, 401);
  const b = await readJson(request, 200000);
  if (!b || typeof b.data !== "object") return json({ ok: false, error: "Invalid request." }, 400);
  const a = await load(env, u, b.id);
  if (!a) return json({ ok: false, error: "Application not found." }, 404);
  if (a.status === "submitted") return json({ ok: false, error: "This application was already submitted." }, 409);
  await env.DB.prepare(`UPDATE applications SET data = ?1, updated = ?2 WHERE id = ?3`).bind(JSON.stringify(b.data), new Date().toISOString(), a.id).run();
  return json({ ok: true });
}
