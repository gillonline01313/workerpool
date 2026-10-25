// Upload or remove a supporting document for an application (stored privately in R2).
import { json, getUser } from "../../_lib.js";
import { findType } from "../../../assets/b2b-config.js";
const MAX = 10 * 1024 * 1024;
const OK = {
  pdf: ["application/pdf", (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46],
  jpg: ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8],
  jpeg: ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8],
  png: ["image/png", (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", (b) => b[0] === 0x50 && b[1] === 0x4b],
  doc: ["application/msword", (b) => b[0] === 0xd0 && b[1] === 0xcf],
};
export async function onRequestPost({ request, env }) {
  if (!env.RESUMES) return json({ ok: false, error: "Document upload isn't switched on yet." }, 503);
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to upload." }, 401);
  const appId = request.headers.get("x-app-id") || "", docKey = request.headers.get("x-doc-key") || "";
  const a = await env.DB.prepare(`SELECT * FROM applications WHERE id = ?1 AND user_id = ?2`).bind(appId, u.id).first();
  if (!a) return json({ ok: false, error: "Application not found." }, 404);
  if (a.status === "submitted") return json({ ok: false, error: "This application was already submitted." }, 409);
  const t = findType(a.category, a.stream, a.app_type);
  if (!t || !t.docs.some((d) => d[0] === docKey)) return json({ ok: false, error: "Unknown document type." }, 400);
  if (parseInt(request.headers.get("content-length") || "0") > MAX) return json({ ok: false, error: "That file is over 10 MB." }, 413);
  let name = "document";
  try { name = decodeURIComponent(request.headers.get("x-file-name") || "document").replace(/[^\w .()\-]/g, "_").slice(0, 120); } catch {}
  const ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
  const kind = OK[ext];
  if (!kind) return json({ ok: false, error: "Upload a PDF, JPG, PNG, DOC or DOCX file." }, 400);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX) return json({ ok: false, error: "That file is over 10 MB." }, 413);
  if (buf.byteLength < 8 || !kind[1](new Uint8Array(buf, 0, 8))) return json({ ok: false, error: "That file doesn't match its type. Try saving it again as a PDF." }, 400);
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM app_docs WHERE app_id = ?1`).bind(a.id).first();
  if ((count && count.n) >= 80) return json({ ok: false, error: "This application has reached the 80-file limit." }, 400);
  const docId = crypto.randomUUID();
  const key = `b2b/${u.id}/${a.id}/${docId}.${ext}`;
  await env.RESUMES.put(key, buf, { httpMetadata: { contentType: kind[0] }, customMetadata: { name, app: a.id, doc: docKey } });
  await env.DB.prepare(`INSERT INTO app_docs (id, app_id, doc_key, name, size, r2_key, uploaded) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(docId, a.id, docKey, name, buf.byteLength, key, new Date().toISOString()).run();
  return json({ ok: true, doc: { id: docId, doc_key: docKey, name, size: buf.byteLength } });
}
export async function onRequestDelete({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again." }, 401);
  const docId = new URL(request.url).searchParams.get("id") || "";
  const d = await env.DB.prepare(
    `SELECT d.*, a.status FROM app_docs d JOIN applications a ON a.id = d.app_id WHERE d.id = ?1 AND a.user_id = ?2`
  ).bind(docId, u.id).first();
  if (!d) return json({ ok: false, error: "Document not found." }, 404);
  if (d.status === "submitted") return json({ ok: false, error: "This application was already submitted." }, 409);
  if (env.RESUMES) await env.RESUMES.delete(d.r2_key).catch(() => {});
  await env.DB.prepare(`DELETE FROM app_docs WHERE id = ?1`).bind(d.id).run();
  return json({ ok: true });
}
