// Send sections back: the team (WorkerPool admin or a partner firm) reviews a submitted (or partial) intake form and
// sends one or more sections back to the client. The form unlocks for the client, but only those sections (and the
// questions that follow from them, see returnScope in intake-config.js) can change; everything else stays as reviewed.
// Used by the admin intake API and the partner portal API.
import { json, str, sendEmail } from "./_lib.js";
import { applicantName, upgradeIntake, RETURN_DOCS } from "../assets/intake-config.js";
import { intakeForm } from "./_intake_req.js";

const site = (env) => env.SITE_URL || "https://workerpool.ca";
const parse = (s) => { try { return upgradeIntake(JSON.parse(s || "{}")); } catch { return {}; } };
export const secList = (s) => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
export async function openReturn(env, intakeId) {
  const t = await env.DB.prepare(`SELECT * FROM intake_returns WHERE intake_id = ?1 AND status = 'open' ORDER BY created DESC LIMIT 1`).bind(intakeId).first();
  return t ? { ...t, sections: secList(t.sections) } : null;
}
export async function listReturns(env, intakeId) {
  const r = await env.DB.prepare(`SELECT * FROM intake_returns WHERE intake_id = ?1 ORDER BY created DESC LIMIT 30`).bind(intakeId).all();
  return r.results.map((t) => ({ ...t, sections: secList(t.sections) }));
}
export const pubReturn = (t) => t && { id: t.id, sections: t.sections, message: t.message || "", created: t.created };
export const secTitles = (form, ids) => ids.map((id) => id === RETURN_DOCS ? "Documents" : ((form.sections.find((s) => s.id === id) || {}).title || id));
// Closes any open send-back (when the form is unlocked fully, or a new send-back replaces it).
export const closeReturns = (env, intakeId, status = "replaced") =>
  env.DB.prepare(`UPDATE intake_returns SET status = ?1, done_at = ?2 WHERE intake_id = ?3 AND status = 'open'`).bind(status, new Date().toISOString(), intakeId).run();

// r = the intakes row. statusCol = whose work status to set to "Waiting for client" (admin_status or partner_status).
export async function sendBack(env, r, b, { statusCol = "admin_status" } = {}) {
  if (r.docs_destroyed_at) return json({ ok: false, error: "The documents were already deleted, so the form can't be reopened." }, 409);
  if (r.status !== "submitted" && r.status !== "editing") return json({ ok: false, error: "The client hasn't submitted this form yet." }, 409);
  const { form } = await intakeForm(env, r);
  if (!form) return json({ ok: false, error: "Unknown form." }, 400);
  const ok = new Set([...form.sections.map((s) => s.id), RETURN_DOCS]);
  const sections = [...new Set((Array.isArray(b.sections) ? b.sections : []).map((x) => str(x, 60)).filter((x) => ok.has(x)))];
  if (!sections.length) return json({ ok: false, error: "Tick at least one section to send back." }, 400);
  const now = new Date().toISOString();
  await closeReturns(env, r.id);
  const t = { id: crypto.randomUUID(), intake_id: r.id, sections, message: str(b.message, 2000), created: now };
  await env.DB.prepare(`INSERT INTO intake_returns (id, intake_id, sections, message, status, created) VALUES (?1, ?2, ?3, ?4, 'open', ?5)`)
    .bind(t.id, r.id, JSON.stringify(sections), t.message || null, now).run();
  const col = statusCol === "partner_status" ? "partner_status" : "admin_status", seen = col === "partner_status" ? "partner_seen" : "admin_seen";
  await env.DB.prepare(`UPDATE intakes SET status = 'editing', updated = ?1, ${col} = 'need-info', ${seen} = COALESCE(${seen}, ?1) WHERE id = ?2`).bind(now, r.id).run();
  const emailed = b.send === false ? false : await emailReturn(env, r, t);
  return json({ ok: true, id: t.id, link: `${site(env)}/intake/?o=${r.id}`, emailed });
}
export async function emailReturn(env, r, t, again) {
  const acct = await env.DB.prepare(`SELECT u.name, u.email, p.firm, p.email AS firm_email FROM users u LEFT JOIN partners p ON p.id = ?2 WHERE u.id = ?1`).bind(r.user_id, r.partner_id || "").first();
  if (!acct || !acct.email) return false;
  const { form } = await intakeForm(env, r), who = applicantName(parse(r.data)), first = String(acct.name || "").split(" ")[0] || "there";
  const by = acct.firm || "Our team";
  const ok = await sendEmail(env, acct.email, `${again ? "Reminder: " : ""}Please review part of your ${form.name} form`,
    `Hi ${first},\n\n${by} reviewed your ${form.name} form${who && who !== acct.name ? ` (applicant: ${who})` : ""} and sent back ${t.sections.length === 1 ? "this section" : "these sections"} for you to check, correct or complete:\n\n${secTitles(form, t.sections).map((x) => "  - " + x).join("\n")}\n${t.message ? `\nMessage:\n${t.message}\n` : ""}\nSign in and open your form here:\n${site(env)}/intake/?o=${r.id}\n\nOnly the sections listed above can be changed. The rest of your form stays as it is. When you're done, press Send back.\n\n${acct.firm ? `WorkerPool (secure intake for ${acct.firm})` : "WorkerPool"}`,
    acct.firm_email || undefined);
  if (ok) await env.DB.prepare(`UPDATE intake_returns SET emailed = ?1 WHERE id = ?2`).bind(new Date().toISOString(), t.id).run();
  return ok;
}
// Reminder / withdraw for the open send-back on intake r. Withdraw locks the form again as submitted.
export async function returnAction(env, r, route, rid) {
  const t = await openReturn(env, r.id);
  if (!t || t.id !== str(rid, 60)) return json({ ok: false, error: "This send-back is no longer open." }, 404);
  if (route === "return-remind") return json({ ok: true, emailed: await emailReturn(env, r, t, true) });
  const now = new Date().toISOString();
  await closeReturns(env, r.id, "cancelled");
  await env.DB.prepare(`UPDATE intakes SET status = 'submitted', updated = ?1 WHERE id = ?2 AND status = 'editing'`).bind(now, r.id).run();
  return json({ ok: true });
}
