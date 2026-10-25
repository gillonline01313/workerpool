// Candidate profile submission from the questionnaire. Requires a signed-in account.
import { json, str, readJson, id, getUser, sendEmail } from "../_lib.js";
export async function onRequestPost({ request, env }) {
  const u = await getUser(request, env);
  if (!u) return json({ ok: false, error: "Your session has ended. Sign in again, then submit." }, 401);
  const p = await readJson(request, 60000);
  if (!p || typeof p !== "object") return json({ ok: false, error: "Invalid request." }, 400);
  if (p.cData !== true) return json({ ok: false, error: "Consent is required to submit a profile." }, 400);
  const now = new Date().toISOString();
  if (u.resume_key) p.resume = { name: u.resume_name, size: u.resume_size, key: u.resume_key }; else delete p.resume;
  const wantsImm = p.wantsImm === "yes", wantsMatch = p.wantsMatch === "yes";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, created, name, email, phone, location, country, province, status, wants_imm, wants_match,
         consent_imm, consent_emp, consent_mkt, profile)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
    ).bind(
      id(), now, u.name, u.email, str(p.phone, 40) || u.phone, str(p.location, 10), str(p.country, 80), str(p.province, 60),
      str(p.status, 20), wantsImm ? 1 : 0, wantsMatch ? 1 : 0, p.cImm === true && wantsImm ? 1 : 0,
      p.cEmp === true && wantsMatch ? 1 : 0, p.cMkt === true ? 1 : 0, JSON.stringify(p)
    ),
    env.DB.prepare(`UPDATE users SET profile = ?1, step = 'done' WHERE id = ?2`).bind(JSON.stringify(p), u.id),
  ]);
  if (wantsImm || wantsMatch) {
    const where = p.location === "outside" ? `${str(p.city, 60)}, ${str(p.country, 80)}` : `${str(p.city, 60)}, ${str(p.province, 60)}`;
    await sendEmail(env, env.ADMIN_EMAIL, `New candidate: ${u.name} (${where})`,
      `${u.name}\n${u.email} · ${str(p.phone, 40) || u.phone}\n${where}\n\nConsultant call: ${wantsImm ? "YES" : "no"}\nEmployer Match: ${wantsMatch ? "YES" : "no"}\n\nFull profile: ${env.SITE_URL || "https://workerpool.ca"}/admin/`);
  }
  return json({ ok: true });
}
