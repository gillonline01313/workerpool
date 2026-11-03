// Delivery receipts from Resend. In Resend → Webhooks, add https://workerpool.ca/api/mail-events with the events
// email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked,
// then put the webhook's signing secret (whsec_…) in Cloudflare as RESEND_WEBHOOK_SECRET.
import { json } from "../_lib.js";
import { ensureMailTables } from "../_mail.js";

async function verified(request, env, raw) {
  const sid = request.headers.get("svix-id"), ts = request.headers.get("svix-timestamp"), sigs = request.headers.get("svix-signature") || "";
  if (!sid || !ts || Math.abs(Date.now() / 1000 - parseInt(ts)) > 600) return false;
  const secret = Uint8Array.from(atob(env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${sid}.${ts}.${raw}`)));
  const want = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((s) => s.split(",")[1] === want);
}

const COLS = { "email.delivered": "delivered_at", "email.delivery_delayed": "delayed_at", "email.bounced": "bounced_at",
  "email.complained": "complained_at", "email.opened": "opened_at", "email.clicked": "clicked_at" };

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_WEBHOOK_SECRET) return json({ ok: false, error: "RESEND_WEBHOOK_SECRET isn't set." }, 503);
  const raw = await request.text();
  if (raw.length > 200000 || !(await verified(request, env, raw).catch(() => false))) return json({ ok: false }, 401);
  let ev; try { ev = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  const d = ev.data || {}, type = String(ev.type || ""), t = ev.created_at || new Date().toISOString();
  if (!d.email_id || !type.startsWith("email.")) return json({ ok: true });
  await ensureMailTables(env);
  const m = await env.DB.prepare(`SELECT id, to_email FROM email_sent WHERE resend_id = ?1`).bind(d.email_id).first();
  if (!m) return json({ ok: true }); // not one of ours (password resets etc. aren't logged)
  const col = COLS[type];
  const detail = type === "email.bounced" ? [d.bounce && d.bounce.type, d.bounce && d.bounce.message].filter(Boolean).join(": ").slice(0, 300)
    : type === "email.clicked" ? String((d.click && d.click.link) || "").slice(0, 300) : "";
  if (type === "email.opened") {
    await env.DB.prepare(`UPDATE email_sent SET opened_at = COALESCE(opened_at, ?1), last_open = ?1, opens = COALESCE(opens, 0) + 1 WHERE id = ?2`).bind(t, m.id).run();
  } else if (col) {
    await env.DB.prepare(`UPDATE email_sent SET ${col} = COALESCE(${col}, ?1)${type === "email.bounced" ? ", bounce_detail = ?3, status = 'bounced'" : ""} WHERE id = ?2`)
      .bind(t, m.id, ...(type === "email.bounced" ? [detail] : [])).run();
  }
  // Someone who marks us as spam never gets another email from the Email tab.
  if (type === "email.complained") await env.DB.prepare(`INSERT INTO email_unsubs (email, t) VALUES (?1, ?2) ON CONFLICT(email) DO NOTHING`).bind(m.to_email, t).run();
  await env.DB.prepare(`INSERT INTO email_events (sent_id, t, type, detail) VALUES (?1, ?2, ?3, ?4)`).bind(m.id, t, type.replace("email.", ""), detail || null).run();
  return json({ ok: true });
}
