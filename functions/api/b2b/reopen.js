// Unlock a submitted application so the client can edit it, then resubmit. Emails the admin to hold processing.
import { json, readJson, getUser, sendEmail } from "../../_lib.js";
import { findType, CATEGORY_LABELS, STREAM_LABELS } from "../../../assets/b2b-config.js";
export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again, then try editing." }, 401);
  const b = await readJson(request, 2000);
  const a = await env.DB.prepare(`SELECT * FROM applications WHERE id = ?1 AND user_id = ?2`).bind((b && b.id) || "", u.id).first();
  if (!a) return json({ ok: false, error: "Application not found." }, 404);
  if (a.status === "editing" || a.status === "draft") return json({ ok: true, already: true });
  if (a.status !== "submitted") return json({ ok: false, error: "Our team is already working on this application. Contact us to make a change." }, 409);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE applications SET status = 'editing', updated = ?1 WHERE id = ?2 AND status = 'submitted'`).bind(now, a.id).run();
  const t = findType(a.category, a.stream, a.app_type);
  let data = {}; try { data = JSON.parse(a.data || "{}"); } catch {}
  const p = data.personal || {};
  const who = [p.given_names, p.family_name].filter(Boolean).join(" ") || u.name;
  await sendEmail(env, env.ADMIN_EMAIL, `B2B application reopened for edits: ${a.app_name} – ${who}`,
    `A client reopened a submitted application to make changes. Hold processing until they resubmit.\n\nApplicant: ${who}\nAccount: ${u.name} (${u.email}, ${u.phone})\nType: ${CATEGORY_LABELS[a.category] || a.category} · ${STREAM_LABELS[a.stream] || a.stream} · ${(t && t.name) || a.app_name}\nOriginally submitted: ${a.submitted || "–"}\nReopened: ${now}\n\nAdmin dashboard: ${env.SITE_URL || "https://workerpool.ca"}/admin/ (B2B applications tab)`);
  return json({ ok: true });
}
