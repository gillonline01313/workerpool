// Admin data API. Every request must carry the ADMIN_KEY secret set in Cloudflare.
import { json } from "../../_lib.js";
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
export async function onRequestGet({ request, env, params }) {
  if (!env.ADMIN_KEY || !same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY)) return json({ ok: false, error: "Wrong admin key." }, 401);
  const route = (params.path || []).join("/");
  const url = new URL(request.url);
  const days = Math.min(3650, Math.max(1, parseInt(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  if (route === "visits") {
    const r = await env.DB.prepare(`SELECT * FROM visits WHERE t >= ?1 ORDER BY t DESC LIMIT 20000`).bind(since).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "interest") {
    const r = await env.DB.prepare(`SELECT * FROM interest ORDER BY created DESC LIMIT 2000`).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "submissions") {
    const r = await env.DB.prepare(`SELECT * FROM submissions ORDER BY created DESC LIMIT 2000`).all();
    return json({ ok: true, rows: r.results });
  }
  if (route === "resume") {
    const key = url.searchParams.get("key") || "";
    if (!/^resumes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx?)$/.test(key) || !env.RESUMES) return json({ ok: false, error: "Not found." }, 404);
    const obj = await env.RESUMES.get(key);
    if (!obj) return json({ ok: false, error: "That resume was replaced or removed." }, 404);
    const name = ((obj.customMetadata && obj.customMetadata.name) || "resume").replace(/"/g, "");
    return new Response(obj.body, { headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return json({ ok: false, error: "Not found." }, 404);
}
