// Candidate resume upload (PDF, DOC or DOCX, up to 5 MB), stored privately in Cloudflare R2.
import { json, getUser } from "../_lib.js";
const MAX = 5 * 1024 * 1024;
const TYPES = {
  pdf: { mime: "application/pdf", ok: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },            // %PDF
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ok: (b) => b[0] === 0x50 && b[1] === 0x4b }, // PK (zip)
  doc: { mime: "application/msword", ok: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },          // OLE
};
async function setResume(env, u, info) {
  let profile = {}; try { profile = JSON.parse(u.profile || "{}"); } catch {}
  if (info) profile.resume = { name: info.name, size: info.size }; else delete profile.resume;
  await env.DB.prepare(`UPDATE users SET resume_key = ?1, resume_name = ?2, resume_size = ?3, profile = ?4 WHERE id = ?5`)
    .bind(info ? info.key : null, info ? info.name : null, info ? info.size : null, JSON.stringify(profile), u.id).run();
}
export async function onRequestPost({ request, env }) {
  if (!env.RESUMES) return json({ ok: false, error: "Resume upload isn't switched on yet. You can continue without it." }, 503);
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to upload your resume." }, 401);
  const len = parseInt(request.headers.get("content-length") || "0");
  if (len > MAX) return json({ ok: false, error: "That file is over 5 MB. Upload a smaller version." }, 413);
  let name = "resume";
  try { name = decodeURIComponent(request.headers.get("x-file-name") || "resume").replace(/[^\w .()\-]/g, "_").slice(0, 120); } catch {}
  const ext = (name.match(/\.(pdf|docx?)$/i) || [])[1];
  if (!ext) return json({ ok: false, error: "Upload a PDF, DOC or DOCX file." }, 400);
  const t = TYPES[ext.toLowerCase()];
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX) return json({ ok: false, error: "That file is over 5 MB. Upload a smaller version." }, 413);
  if (buf.byteLength < 8 || !t.ok(new Uint8Array(buf, 0, 8))) return json({ ok: false, error: "That file doesn't look like a real PDF or Word document." }, 400);
  const key = `resumes/${u.id}/${crypto.randomUUID()}.${ext.toLowerCase()}`;
  await env.RESUMES.put(key, buf, { httpMetadata: { contentType: t.mime }, customMetadata: { name, user: u.id } });
  if (u.resume_key) await env.RESUMES.delete(u.resume_key).catch(() => {});
  await setResume(env, u, { key, name, size: buf.byteLength });
  return json({ ok: true, resume: { name, size: buf.byteLength } });
}
export async function onRequestDelete({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to remove your resume." }, 401);
  if (env.RESUMES && u.resume_key) await env.RESUMES.delete(u.resume_key).catch(() => {});
  await setResume(env, u, null);
  return json({ ok: true });
}
