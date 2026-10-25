// Employer / partner "register your interest" form.
import { json, str, isEmail, readJson, id, sendEmail } from "../_lib.js";
const TYPES = ["employer", "consultant", "lawyer"];
export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 5000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  if (b.website) return json({ ok: true }); // spam trap
  const business = str(b.business, 120), email = str(b.email, 120).toLowerCase(), phone = str(b.phone, 40);
  const type = TYPES.includes(b.type) ? b.type : "employer";
  if (!business || !isEmail(email) || phone.replace(/\D/g, "").length < 7)
    return json({ ok: false, error: "Check the business name, email and phone number." }, 400);
  const cf = request.cf || {};
  await env.DB.prepare(
    `INSERT INTO interest (id, type, business, email, phone, country, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(id(), type, business, email, phone, str(cf.country, 4), new Date().toISOString()).run();
  await sendEmail(env, env.ADMIN_EMAIL, `New ${type} interest: ${business}`,
    `${business} (${type})\n${email} · ${phone}\n\nSee all registrations: ${env.SITE_URL || "https://workerpool.ca"}/admin/`);
  return json({ ok: true });
}
