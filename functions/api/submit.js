// Candidate profile submission from the questionnaire.
import { json, str, isEmail, readJson, id } from "../_lib.js";
export async function onRequestPost({ request, env }) {
  const p = await readJson(request, 60000);
  if (!p || typeof p !== "object") return json({ ok: false, error: "Invalid request." }, 400);
  const email = str(p.email, 120).toLowerCase();
  if (!isEmail(email) || !str(p.name, 120)) return json({ ok: false, error: "Name and a valid email are required." }, 400);
  if (p.cData !== true) return json({ ok: false, error: "Consent is required to submit a profile." }, 400);
  delete p.pass; delete p.passHash;
  await env.DB.prepare(
    `INSERT INTO submissions (id, created, name, email, phone, location, country, province, status, wants_imm, wants_match,
       consent_imm, consent_emp, consent_mkt, profile)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
  ).bind(
    id(), new Date().toISOString(), str(p.name, 120), email, str(p.phone, 40), str(p.location, 10), str(p.country, 80),
    str(p.province, 60), str(p.status, 20), p.wantsImm === "yes" ? 1 : 0, p.wantsMatch === "yes" ? 1 : 0,
    p.cImm === true && p.wantsImm === "yes" ? 1 : 0, p.cEmp === true && p.wantsMatch === "yes" ? 1 : 0, p.cMkt === true ? 1 : 0,
    JSON.stringify(p)
  ).run();
  return json({ ok: true });
}
