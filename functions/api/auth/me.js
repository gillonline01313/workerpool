import { json, getUser, publicUser } from "../../_lib.js";
export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: true, user: null });
  let profile = {}; try { profile = JSON.parse(u.profile || "{}"); } catch {}
  return json({ ok: true, user: publicUser(u), step: u.step || "basics", profile });
}
