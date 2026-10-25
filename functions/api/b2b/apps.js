// List the signed-in client's applications, or start a new one.
import { json, readJson, getUser, id } from "../../_lib.js";
import { findType } from "../../../assets/b2b-config.js";
export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in to see your applications." }, 401);
  const r = await env.DB.prepare(
    `SELECT id, category, stream, app_type, app_name, status, created, updated, submitted FROM applications WHERE user_id = ?1 ORDER BY updated DESC`
  ).bind(u.id).all();
  return json({ ok: true, apps: r.results });
}
export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in to start an application." }, 401);
  const b = await readJson(request, 2000);
  const t = b && findType(b.category, b.stream, b.type);
  if (!t) return json({ ok: false, error: "Choose an application type." }, 400);
  const appId = id(), now = new Date().toISOString();
  const data = { contact: { email: u.email, phone: u.phone } };
  await env.DB.prepare(
    `INSERT INTO applications (id, user_id, category, stream, app_type, app_name, status, data, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8, ?8)`
  ).bind(appId, u.id, b.category, b.stream, t.key, t.name, JSON.stringify(data), now).run();
  return json({ ok: true, id: appId });
}
