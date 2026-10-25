// Submit an application: check required fields and documents, lock it, and email the admin.
import { json, readJson, getUser, sendEmail } from "../../_lib.js";
import { findType, SECTIONS, CATEGORY_LABELS, STREAM_LABELS } from "../../../assets/b2b-config.js";
export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again, then submit." }, 401);
  const b = await readJson(request, 2000);
  const a = await env.DB.prepare(`SELECT * FROM applications WHERE id = ?1 AND user_id = ?2`).bind((b && b.id) || "", u.id).first();
  if (!a) return json({ ok: false, error: "Application not found." }, 404);
  if (a.status === "submitted") return json({ ok: true, already: true });
  const t = findType(a.category, a.stream, a.app_type);
  let data = {}; try { data = JSON.parse(a.data || "{}"); } catch {}
  // required information
  for (const sk of t.sections) {
    const sec = SECTIONS[sk]; if (!sec) continue;
    if (sec.rep) continue; // repeatable sections are checked in the browser
    const v = data[sk] || {};
    const miss = sec.fields.find((f) => f[3] && !String(v[f[0]] ?? "").trim());
    if (miss) return json({ ok: false, error: `Complete "${miss[1]}" in ${sec.title}.` }, 400);
  }
  // required documents
  const docs = await env.DB.prepare(`SELECT doc_key FROM app_docs WHERE app_id = ?1`).bind(a.id).all();
  const have = new Set(docs.results.map((d) => d.doc_key));
  const missing = t.docs.filter((d) => d[2] && !have.has(d[0]));
  if (missing.length) return json({ ok: false, error: `Upload the required document: ${missing[0][1]}.` }, 400);
  const now = new Date().toISOString();
  const resub = a.status === "editing";
  await env.DB.prepare(`UPDATE applications SET status = 'submitted', submitted = ?1, updated = ?1 WHERE id = ?2`).bind(now, a.id).run();
  const p = data.personal || {};
  const who = [p.given_names, p.family_name].filter(Boolean).join(" ") || u.name;
  await sendEmail(env, env.ADMIN_EMAIL, `${resub ? "Updated" : "New"} B2B application: ${t.name} – ${who}`,
    `${resub ? `A client edited and resubmitted an application (first submitted ${a.submitted || "–"}). Process the updated version.` : "A client submitted an application for processing."}\n\nApplicant: ${who}\nAccount: ${u.name} (${u.email}, ${u.phone})\nType: ${CATEGORY_LABELS[a.category]} · ${STREAM_LABELS[a.stream]} · ${t.name}\nDocuments uploaded: ${docs.results.length}\nSubmitted: ${now}\n\nOpen it in the admin dashboard: ${env.SITE_URL || "https://workerpool.ca"}/admin/ (B2B applications tab)`, u.email);
  await sendEmail(env, u.email, `We received your ${resub ? "updated " : ""}${t.name} information`,
    `Hi ${u.name.split(" ")[0]},\n\nThanks. We received your ${resub ? "updated " : ""}information and documents for: ${t.name}.\nOur processing team will review them and contact you if anything else is needed.\n\nWorkerPool Data Entry`);
  return json({ ok: true });
}
