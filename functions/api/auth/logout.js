import { readCookie, sha256hex, sessionCookie } from "../../_lib.js";
export async function onRequestPost({ request, env }) {
  const t = readCookie(request);
  if (t) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(await sha256hex(t)).run();
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": sessionCookie("", 0) } });
}
