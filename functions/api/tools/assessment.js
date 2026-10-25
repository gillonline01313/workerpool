// Saves a pathway-tool assessment that the candidate agreed to share with a licensed RCIC organization.
import { json, str, readJson, getUser, sendEmail, id } from "../../_lib.js";
const PROVINCES = ["BC", "AB", "MB"];
export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Sign in again to share your assessment." }, 401);
  const b = await readJson(request, 40000);
  if (!b || b.consent !== true) return json({ ok: false, error: "Consent is required to share an assessment." }, 400);
  const prov = PROVINCES.includes(b.province) ? b.province : null;
  if (!prov) return json({ ok: false, error: "Unknown province." }, 400);
  const now = new Date().toISOString();
  const summary = JSON.stringify(b.summary || {}), inputs = JSON.stringify(b.inputs || {});
  const existing = await env.DB.prepare(`SELECT id FROM assessments WHERE user_id = ?1 AND province = ?2`).bind(u.id, prov).first();
  if (existing) {
    await env.DB.prepare(`UPDATE assessments SET name = ?1, summary = ?2, inputs = ?3, updated = ?4 WHERE id = ?5`)
      .bind(str(b.name, 120), summary, inputs, now, existing.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO assessments (id, user_id, province, name, summary, inputs, consent_at, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)`)
      .bind(id(), u.id, prov, str(b.name, 120), summary, inputs, now).run();
    const s = b.summary || {};
    await sendEmail(env, env.ADMIN_EMAIL, `Shared ${prov} assessment: ${str(b.name, 80) || u.name}`,
      `${u.name} (${u.email}, ${u.phone}) agreed to share their ${prov} pathway assessment with a licensed RCIC organization.\n\nCandidate: ${str(b.name, 120)}\nCRS: ${s.crs ?? "-"} · FSW grid: ${s.fsw ?? "-"}\n${s.pnpLabel || "Provincial score"}: ${s.pnp ?? "-"}\nRCIP: ${s.rcip ? `${s.rcip} (${s.rcipPoints != null ? s.rcipPoints + " community points" : "first come, first served"})` : "-"}\n\nFull details: ${env.SITE_URL || "https://workerpool.ca"}/admin/ (Shared assessments tab)`, u.email);
  }
  return json({ ok: true });
}
