// Lead Desk API (/leads/ portal and admin → Lead Desk). See functions/_leads.js.
//
// Lead manager routes (signed in with the wp_lm cookie):
//   POST login · logout · forgot · set { token, password }        account (new managers set their password from the invite link)
//   GET  me                                                         who's signed in, services, statuses
//   GET  list                                                       my leads (never the RCIC's name)
//   GET  item?id=                                                   one of my leads: details, payments, timeline (no internal notes)
//   POST lead { client_name, phone, whatsapp, email, location, service, details, consent }   punch a new lead
//   POST edit { id, ...same fields }                                while the lead is New or sent back to me
//   POST comment { id, text, done }                                 my comment; done = finished what admin sent back
//   POST password { current, password }
// Admin routes (x-admin-key) under /api/leads/admin/:
//   GET  list · item?id= · managers · count
//   POST manager { id?, name, email, phone, company, note } (new managers are emailed a link to set their password)
//   POST manager-status { id, status } · manager-invite { id }
//   POST status { id, status, note } · fee { id, fee } · payment { id, amount, date, method, note } · payment-delete { id, pid }
//   POST rcic { id, attached, name, licence } · sendback { id, message } · comment { id, text, internal } · edit { id, ... } · delete { id }
import { json, readJson, str, isEmail, sendEmail, hashPassword, checkPassword, sha256hex } from "../../_lib.js";
import { ensureLeads, LEAD_STATUS, LEAD_SERVICES, PAY_METHODS, leadRef, money, getManager, createLeadSession, leadCookie, leadToken, passwordLink, leadEvent } from "../../_leads.js";

const site = (env) => env.SITE_URL || "https://workerpool.ca";
const nowIso = () => new Date().toISOString();
const MAX_FAILS = 5, LOCK_MIN = 15;
function same(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const isAdmin = (request, env) => !!env.ADMIN_KEY && same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY);
const withCookie = (o, cookie) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie } });
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "there";

// What a lead manager may see of a lead: everything except the RCIC's name/licence.
const MGR_COLS = `id, num, client_name, phone, whatsapp, email, location, service, details, status, fee_cents, paid_cents, rcic_attached,
  action_needed, action_msg, action_at, created, updated, admin_at, mgr_seen, finalized_at, closed_at`;
const pubLead = (l) => l && ({ ...l, ref: leadRef(l.num), status_label: LEAD_STATUS[l.status] || l.status });

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return json({ ok: false, error: "Database not connected." }, 503);
  await ensureLeads(env);
  const route = (params.path || []).join("/"), m = request.method;
  try {
    if (route.startsWith("admin/")) {
      if (!isAdmin(request, env)) return json({ ok: false, error: "Wrong admin key." }, 401);
      return await admin(ctx, route.slice(6), m);
    }
    return await manager(ctx, route, m);
  } catch (e) {
    console.error("leads", route, e);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}

/* ---------- lead fields (shared by managers and admin) ---------- */
function leadFields(b) {
  const f = {
    client_name: str(b.client_name, 120), phone: str(b.phone, 40), whatsapp: str(b.whatsapp, 60), email: str(b.email, 160).toLowerCase(),
    location: str(b.location, 160), service: str(b.service, 120), details: str(b.details, 4000),
  };
  if (!f.client_name) return { error: "Enter the client's name." };
  if (!f.phone && !f.whatsapp && !f.email) return { error: "Add at least one way to reach the client: phone, WhatsApp or email." };
  if (f.email && !isEmail(f.email)) return { error: "Check the client's email address." };
  if (!f.service) return { error: "Choose the service the client needs." };
  return { f };
}
async function nextNum(env) {
  const r = await env.DB.prepare(`SELECT COALESCE(MAX(num), 1000) + 1 AS n FROM leads`).first();
  return r.n;
}

/* ======================= lead manager ======================= */
async function manager({ request, env }, route, m) {
  const url = new URL(request.url);
  if (route === "login" && m === "POST") return await login(request, env);
  if (route === "logout" && m === "POST") {
    const t = leadToken(request);
    if (t) await env.DB.prepare(`DELETE FROM lead_sessions WHERE token_hash = ?1`).bind(await sha256hex(t)).run();
    return withCookie({ ok: true }, leadCookie("", 0));
  }
  if (route === "forgot" && m === "POST") {
    const b = await readJson(request, 1000) || {}, email = str(b.email, 160).toLowerCase();
    const mg = email ? await env.DB.prepare(`SELECT id, name FROM lead_managers WHERE email = ?1 AND status = 'active'`).bind(email).first() : null;
    if (mg) await sendEmail(env, email, "Reset your WorkerPool Lead Desk password",
      `Hi ${first(mg.name)},\n\nUse this link to choose a new password for the WorkerPool Lead Desk. It works for 1 hour:\n${await passwordLink(env, mg.id, 1)}\n\nIf you didn't ask for this, you can ignore this email.\n\nWorkerPool`);
    return json({ ok: true });   // same answer either way
  }
  if (route === "set" && m === "POST") {
    const b = await readJson(request, 2000) || {}, pass = typeof b.password === "string" ? b.password : "";
    if (pass.length < 10 || pass.length > 200) return json({ ok: false, error: "Password needs at least 10 characters." }, 400);
    const r = await env.DB.prepare(`SELECT * FROM lead_resets WHERE token_hash = ?1 AND expires > ?2`).bind(await sha256hex(str(b.token, 100)), nowIso()).first();
    if (!r) return json({ ok: false, error: "This link has expired or was already used. Ask WorkerPool for a new one, or use Forgot password." }, 400);
    await env.DB.batch([
      env.DB.prepare(`UPDATE lead_managers SET pass_hash = ?1, fail_count = 0, locked_until = '', last_login = ?3 WHERE id = ?2`).bind(await hashPassword(pass), r.manager_id, nowIso()),
      env.DB.prepare(`DELETE FROM lead_resets WHERE manager_id = ?1`).bind(r.manager_id),
      env.DB.prepare(`DELETE FROM lead_sessions WHERE manager_id = ?1`).bind(r.manager_id),
    ]);
    return withCookie({ ok: true }, await createLeadSession(env, r.manager_id));
  }

  const me = await getManager(request, env);
  if (!me) return json({ ok: false, error: "Sign in first.", auth: true }, 401);

  if (route === "me" && m === "GET") return json({ ok: true, me: { name: me.name, email: me.email, phone: me.phone, company: me.company }, services: LEAD_SERVICES, statuses: LEAD_STATUS });
  if (route === "list" && m === "GET") {
    const r = await env.DB.prepare(`SELECT ${MGR_COLS} FROM leads WHERE manager_id = ?1 ORDER BY action_needed DESC, updated DESC LIMIT 1000`).bind(me.id).all();
    return json({ ok: true, rows: r.results.map(pubLead) });
  }
  const own = async (id) => await env.DB.prepare(`SELECT ${MGR_COLS} FROM leads WHERE id = ?1 AND manager_id = ?2`).bind(str(id, 64), me.id).first();
  if (route === "item" && m === "GET") {
    const l = await own(url.searchParams.get("id"));
    if (!l) return json({ ok: false, error: "Lead not found." }, 404);
    const ev = await env.DB.prepare(`SELECT id, who, kind, text, created FROM lead_events WHERE lead_id = ?1 AND priv = 0 ORDER BY id`).bind(l.id).all();
    const pay = await env.DB.prepare(`SELECT id, amount_cents, received_on, method, note FROM lead_payments WHERE lead_id = ?1 ORDER BY received_on, created`).bind(l.id).all();
    await env.DB.prepare(`UPDATE leads SET mgr_seen = ?1 WHERE id = ?2`).bind(nowIso(), l.id).run();
    return json({ ok: true, lead: pubLead(l), events: ev.results, payments: pay.results });
  }
  if (m !== "POST") return json({ ok: false, error: "Not found." }, 404);
  const b = await readJson(request, 12000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);

  if (route === "lead") {
    const { f, error } = leadFields(b);
    if (error) return json({ ok: false, error }, 400);
    if (!b.consent) return json({ ok: false, error: "Confirm that the client agreed to be referred to WorkerPool." }, 400);
    const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE manager_id = ?1 AND created > ?2`).bind(me.id, new Date(Date.now() - 36e5).toISOString()).first();
    if (recent && recent.n >= 60) return json({ ok: false, error: "That's a lot of leads in one hour. Wait a little and try again." }, 429);
    const id = crypto.randomUUID(), now = nowIso();
    let num = await nextNum(env);
    for (let i = 0; i < 3; i++) {
      try {
        await env.DB.prepare(`INSERT INTO leads (id, num, manager_id, client_name, phone, whatsapp, email, location, service, details, consent_at, status, created, updated, mgr_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'new',?11,?11,?11)`).bind(id, num, me.id, f.client_name, f.phone, f.whatsapp, f.email, f.location, f.service, f.details, now).run();
        break;
      } catch (e) { if (i === 2) throw e; num = await nextNum(env) + i; }
    }
    await leadEvent(env, id, "manager", "created", `Lead punched by ${me.name}${me.company ? ` (${me.company})` : ""}. Service: ${f.service}.`);
    await sendEmail(env, env.ADMIN_EMAIL, `New lead ${leadRef(num)} from ${me.name}: ${f.client_name} · ${f.service}`,
      `${me.name}${me.company ? ` (${me.company})` : ""} sent a new lead.\n\nClient: ${f.client_name}\nService: ${f.service}\nPhone: ${f.phone || "–"}\nWhatsApp: ${f.whatsapp || "–"}\nEmail: ${f.email || "–"}\nLocation: ${f.location || "–"}\n\n${f.details || ""}\n\nOpen it in the admin dashboard: ${site(env)}/admin/ (Lead Desk tab)`, me.email);
    return json({ ok: true, id, ref: leadRef(num) });
  }
  const l = await own(b.id);
  if (!l) return json({ ok: false, error: "Lead not found." }, 404);
  if (route === "edit") {
    if (l.status !== "new" && !l.action_needed) return json({ ok: false, error: "This lead is already being worked on. Add a comment with the change instead." }, 400);
    const { f, error } = leadFields(b);
    if (error) return json({ ok: false, error }, 400);
    const changed = Object.keys(f).filter((k) => (l[k] || "") !== f[k]);
    if (!changed.length) return json({ ok: true });
    await env.DB.prepare(`UPDATE leads SET client_name=?1, phone=?2, whatsapp=?3, email=?4, location=?5, service=?6, details=?7 WHERE id = ?8`)
      .bind(f.client_name, f.phone, f.whatsapp, f.email, f.location, f.service, f.details, l.id).run();
    await leadEvent(env, l.id, "manager", "edit", `${me.name} updated the client details (${changed.map((k) => k.replace("client_name", "name").replace("_", " ")).join(", ")}).`);
    return json({ ok: true });
  }
  if (route === "comment") {
    const text = str(b.text, 4000), done = !!b.done && !!l.action_needed;
    if (!text && !done) return json({ ok: false, error: "Write a comment first." }, 400);
    await leadEvent(env, l.id, "manager", done ? "reply" : "comment", text || "Done.");
    if (done) await env.DB.prepare(`UPDATE leads SET action_needed = 0 WHERE id = ?1`).bind(l.id).run();
    await sendEmail(env, env.ADMIN_EMAIL, `${done ? "Lead back from" : "Comment from"} ${me.name} on ${leadRef(l.num)} (${l.client_name})`,
      `${me.name} ${done ? "finished what you sent back and returned the lead" : "commented on the lead"} ${leadRef(l.num)} · ${l.client_name} · ${l.service}:\n\n${text || "Done."}\n\nOpen it in the admin dashboard: ${site(env)}/admin/ (Lead Desk tab)`, me.email);
    return json({ ok: true });
  }
  if (route === "password") {
    const pass = typeof b.password === "string" ? b.password : "";
    if (!(await checkPassword(typeof b.current === "string" ? b.current : "", me.pass_hash))) return json({ ok: false, error: "Your current password doesn't match." }, 400);
    if (pass.length < 10 || pass.length > 200) return json({ ok: false, error: "New password needs at least 10 characters." }, 400);
    await env.DB.prepare(`UPDATE lead_managers SET pass_hash = ?1 WHERE id = ?2`).bind(await hashPassword(pass), me.id).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

async function login(request, env) {
  const b = await readJson(request, 2000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  const email = str(b.email, 160).toLowerCase(), pass = typeof b.password === "string" ? b.password : "";
  const bad = () => json({ ok: false, error: "Email or password doesn't match." }, 401);
  const mg = email ? await env.DB.prepare(`SELECT * FROM lead_managers WHERE email = ?1`).bind(email).first() : null;
  if (!mg) return bad();
  const now = new Date();
  if (mg.locked_until && mg.locked_until > now.toISOString()) return json({ ok: false, error: `Too many attempts. Try again in ${LOCK_MIN} minutes, or reset your password.` }, 429);
  if (!mg.pass_hash) return json({ ok: false, error: "Set your password first with the link WorkerPool emailed you, or use Forgot password." }, 400);
  if (!(await checkPassword(pass, mg.pass_hash))) {
    const fails = (mg.fail_count || 0) + 1;
    await env.DB.prepare(`UPDATE lead_managers SET fail_count = ?1, locked_until = ?2 WHERE id = ?3`)
      .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MIN * 60000).toISOString() : "", mg.id).run();
    return bad();
  }
  if (mg.status !== "active") return json({ ok: false, error: "This account is paused. Contact WorkerPool at info@workerpool.ca." }, 403);
  await env.DB.prepare(`UPDATE lead_managers SET fail_count = 0, locked_until = '', last_login = ?1 WHERE id = ?2`).bind(now.toISOString(), mg.id).run();
  return withCookie({ ok: true }, await createLeadSession(env, mg.id));
}

/* ======================= admin ======================= */
async function admin({ request, env }, route, m) {
  const url = new URL(request.url);
  if (m === "GET") {
    if (route === "count") {
      const r = await env.DB.prepare(`SELECT SUM(CASE WHEN admin_seen IS NULL THEN 1 ELSE 0 END) AS fresh,
        SUM(CASE WHEN admin_seen IS NOT NULL AND mgr_at > admin_seen THEN 1 ELSE 0 END) AS replies FROM leads`).first();
      return json({ ok: true, fresh: (r && r.fresh) || 0, replies: (r && r.replies) || 0 });
    }
    if (route === "managers") return json({ ok: true, rows: await managers(env) });
    if (route === "list") {
      const r = await env.DB.prepare(`SELECT l.*, m.name AS manager_name, m.company AS manager_company FROM leads l LEFT JOIN lead_managers m ON m.id = l.manager_id ORDER BY l.updated DESC LIMIT 2000`).all();
      return json({ ok: true, rows: r.results.map(pubLead), managers: await managers(env), statuses: LEAD_STATUS, services: LEAD_SERVICES, methods: PAY_METHODS });
    }
    if (route === "item") {
      const l = await env.DB.prepare(`SELECT l.*, m.name AS manager_name, m.company AS manager_company, m.email AS manager_email, m.phone AS manager_phone FROM leads l LEFT JOIN lead_managers m ON m.id = l.manager_id WHERE l.id = ?1`).bind(url.searchParams.get("id") || "").first();
      if (!l) return json({ ok: false, error: "Lead not found." }, 404);
      const ev = await env.DB.prepare(`SELECT id, who, kind, text, priv, created FROM lead_events WHERE lead_id = ?1 ORDER BY id`).bind(l.id).all();
      const pay = await env.DB.prepare(`SELECT * FROM lead_payments WHERE lead_id = ?1 ORDER BY received_on, created`).bind(l.id).all();
      await env.DB.prepare(`UPDATE leads SET admin_seen = ?1 WHERE id = ?2`).bind(nowIso(), l.id).run();
      return json({ ok: true, lead: pubLead(l), events: ev.results, payments: pay.results });
    }
    return json({ ok: false, error: "Not found." }, 404);
  }
  const b = await readJson(request, 12000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);

  /* ----- lead managers ----- */
  if (route === "manager") {
    const f = { name: str(b.name, 120), email: str(b.email, 160).toLowerCase(), phone: str(b.phone, 40), company: str(b.company, 160), note: str(b.note, 2000) };
    if (!f.name) return json({ ok: false, error: "Enter the manager's name." }, 400);
    if (!isEmail(f.email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
    const clash = await env.DB.prepare(`SELECT id FROM lead_managers WHERE email = ?1 AND id != ?2`).bind(f.email, str(b.id, 64)).first();
    if (clash) return json({ ok: false, error: "Another lead manager already uses that email." }, 400);
    if (b.id) {
      await env.DB.prepare(`UPDATE lead_managers SET name=?1, email=?2, phone=?3, company=?4, note=?5 WHERE id = ?6`).bind(f.name, f.email, f.phone, f.company, f.note, str(b.id, 64)).run();
      return json({ ok: true });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO lead_managers (id, name, email, phone, company, note, status, created) VALUES (?1,?2,?3,?4,?5,?6,'active',?7)`).bind(id, f.name, f.email, f.phone, f.company, f.note, nowIso()).run();
    const inv = await invite(env, { id, ...f });
    return json({ ok: true, id, ...inv });
  }
  if (route === "manager-invite") {
    const mg = await env.DB.prepare(`SELECT * FROM lead_managers WHERE id = ?1`).bind(str(b.id, 64)).first();
    if (!mg) return json({ ok: false, error: "Manager not found." }, 404);
    return json({ ok: true, ...(await invite(env, mg)) });
  }
  if (route === "manager-status") {
    const st = b.status === "paused" ? "paused" : "active", id = str(b.id, 64);
    await env.DB.prepare(`UPDATE lead_managers SET status = ?1 WHERE id = ?2`).bind(st, id).run();
    if (st === "paused") await env.DB.prepare(`DELETE FROM lead_sessions WHERE manager_id = ?1`).bind(id).run();
    return json({ ok: true });
  }

  /* ----- leads ----- */
  const l = await env.DB.prepare(`SELECT l.*, m.name AS manager_name, m.email AS manager_email FROM leads l LEFT JOIN lead_managers m ON m.id = l.manager_id WHERE l.id = ?1`).bind(str(b.id, 64)).first();
  if (!l) return json({ ok: false, error: "Lead not found." }, 404);
  const ref = leadRef(l.num), tell = (subject, text) => l.manager_email ? sendEmail(env, l.manager_email, subject,
    `Hi ${first(l.manager_name)},\n\n${text}\n\nOpen the lead: ${site(env)}/leads/?id=${l.id}\n\nWorkerPool`) : null;

  if (route === "status") {
    const st = String(b.status || "");
    if (!LEAD_STATUS[st]) return json({ ok: false, error: "Choose a status." }, 400);
    const note = str(b.note, 2000);
    if (st === l.status && !note) return json({ ok: true });
    const now = nowIso();
    await env.DB.prepare(`UPDATE leads SET status = ?1, finalized_at = CASE WHEN ?1 = 'finalized' AND finalized_at IS NULL THEN ?2 ELSE finalized_at END,
      closed_at = CASE WHEN ?1 IN ('completed', 'closed') THEN ?2 ELSE NULL END WHERE id = ?3`).bind(st, now, l.id).run();
    if (st !== l.status) {
      await leadEvent(env, l.id, "admin", "status", `Status: ${LEAD_STATUS[l.status] || l.status} → ${LEAD_STATUS[st]}${note ? `. ${note}` : ""}`);
      if (b.notify !== false) await tell(`${ref} (${l.client_name}): ${LEAD_STATUS[st]}`, `The lead ${ref} for ${l.client_name} (${l.service}) is now: ${LEAD_STATUS[st]}.${note ? `\n\n${note}` : ""}`);
    } else await leadEvent(env, l.id, "admin", "comment", note);
    return json({ ok: true });
  }
  if (route === "fee") {
    const v = String(b.fee ?? "").trim(), cents = v === "" ? null : Math.round(parseFloat(v.replace(/[$,]/g, "")) * 100);
    if (cents !== null && (!isFinite(cents) || cents < 0 || cents > 1e9)) return json({ ok: false, error: "Enter the fee as a number, e.g. 1500." }, 400);
    await env.DB.prepare(`UPDATE leads SET fee_cents = ?1 WHERE id = ?2`).bind(cents, l.id).run();
    await leadEvent(env, l.id, "admin", "fee", cents === null ? "Service fee cleared." : `Service fee agreed with the client: ${money(cents)}.`);
    return json({ ok: true });
  }
  if (route === "payment") {
    const cents = Math.round(parseFloat(String(b.amount || "").replace(/[$,]/g, "")) * 100);
    if (!isFinite(cents) || cents <= 0 || cents > 1e9) return json({ ok: false, error: "Enter the amount received, e.g. 500." }, 400);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : nowIso().slice(0, 10);
    const method = PAY_METHODS.includes(b.method) ? b.method : "Other", note = str(b.note, 500);
    await env.DB.prepare(`INSERT INTO lead_payments (id, lead_id, amount_cents, received_on, method, note, created) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(crypto.randomUUID(), l.id, cents, date, method, note, nowIso()).run();
    await syncPaid(env, l.id);
    await leadEvent(env, l.id, "admin", "payment", `Payment received from the client: ${money(cents)} by ${method} on ${date}.${note ? ` ${note}` : ""}`);
    return json({ ok: true });
  }
  if (route === "payment-delete") {
    const p = await env.DB.prepare(`SELECT * FROM lead_payments WHERE id = ?1 AND lead_id = ?2`).bind(str(b.pid, 64), l.id).first();
    if (!p) return json({ ok: false, error: "Payment not found." }, 404);
    await env.DB.prepare(`DELETE FROM lead_payments WHERE id = ?1`).bind(p.id).run();
    await syncPaid(env, l.id);
    await leadEvent(env, l.id, "admin", "payment", `Payment entry removed: ${money(p.amount_cents)} (${p.method}) on ${p.received_on}.`);
    return json({ ok: true });
  }
  if (route === "rcic") {
    const on = !!b.attached, name = on ? str(b.name, 160) : "", lic = on ? str(b.licence, 40) : "";
    if (on && !name) return json({ ok: false, error: "Enter the RCIC's name." }, 400);
    await env.DB.prepare(`UPDATE leads SET rcic_attached = ?1, rcic_name = ?2, rcic_licence = ?3, rcic_at = ?4 WHERE id = ?5`).bind(on ? 1 : 0, name || null, lic || null, on ? nowIso() : null, l.id).run();
    // The manager's timeline only says whether an RCIC is attached; the name is in an admin-only line.
    if (!!l.rcic_attached !== on) await leadEvent(env, l.id, "admin", "rcic", on ? "An RCIC is now attached to this file." : "RCIC no longer attached to this file.");
    if (on) await leadEvent(env, l.id, "admin", "rcic", `RCIC: ${name}${lic ? ` (${lic})` : ""}`, 1);
    return json({ ok: true });
  }
  if (route === "sendback") {
    const msg = str(b.message, 4000);
    if (!msg) return json({ ok: false, error: "Write what the manager needs to do." }, 400);
    await env.DB.prepare(`UPDATE leads SET action_needed = 1, action_msg = ?1, action_at = ?2 WHERE id = ?3`).bind(msg, nowIso(), l.id).run();
    await leadEvent(env, l.id, "admin", "sendback", msg);
    const sent = await tell(`Action needed on lead ${ref} (${l.client_name})`, `WorkerPool sent the lead ${ref} for ${l.client_name} (${l.service}) back to you:\n\n${msg}\n\nWhen you've done it, open the lead, add your comment and press "Done, send back to WorkerPool".`);
    return json({ ok: true, emailed: !!sent });
  }
  if (route === "comment") {
    const text = str(b.text, 4000);
    if (!text) return json({ ok: false, error: "Write a comment first." }, 400);
    await leadEvent(env, l.id, "admin", b.internal ? "note" : "comment", text, b.internal ? 1 : 0);
    if (!b.internal && b.notify) await tell(`Comment from WorkerPool on ${ref} (${l.client_name})`, `WorkerPool commented on the lead ${ref} for ${l.client_name}:\n\n${text}`);
    return json({ ok: true });
  }
  if (route === "edit") {
    const { f, error } = leadFields(b);
    if (error) return json({ ok: false, error }, 400);
    await env.DB.prepare(`UPDATE leads SET client_name=?1, phone=?2, whatsapp=?3, email=?4, location=?5, service=?6, details=?7 WHERE id = ?8`)
      .bind(f.client_name, f.phone, f.whatsapp, f.email, f.location, f.service, f.details, l.id).run();
    await leadEvent(env, l.id, "admin", "edit", "WorkerPool updated the client details.");
    return json({ ok: true });
  }
  if (route === "delete") {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM lead_events WHERE lead_id = ?1`).bind(l.id),
      env.DB.prepare(`DELETE FROM lead_payments WHERE lead_id = ?1`).bind(l.id),
      env.DB.prepare(`DELETE FROM leads WHERE id = ?1`).bind(l.id),
    ]);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

async function syncPaid(env, leadId) {
  await env.DB.prepare(`UPDATE leads SET paid_cents = (SELECT COALESCE(SUM(amount_cents), 0) FROM lead_payments WHERE lead_id = ?1) WHERE id = ?1`).bind(leadId).run();
}
async function managers(env) {
  const r = await env.DB.prepare(`SELECT m.id, m.name, m.email, m.phone, m.company, m.note, m.status, m.created, m.invited, m.last_login, (m.pass_hash IS NOT NULL) AS has_password,
    (SELECT COUNT(*) FROM leads l WHERE l.manager_id = m.id) AS leads,
    (SELECT COUNT(*) FROM leads l WHERE l.manager_id = m.id AND l.status IN ('finalized', 'completed')) AS won,
    (SELECT COALESCE(SUM(paid_cents), 0) FROM leads l WHERE l.manager_id = m.id) AS paid
    FROM lead_managers m ORDER BY m.created DESC`).all();
  return r.results;
}
async function invite(env, mg) {
  const link = await passwordLink(env, mg.id, 24 * 7);
  await env.DB.prepare(`UPDATE lead_managers SET invited = ?1 WHERE id = ?2`).bind(nowIso(), mg.id).run();
  // The link is also shown to admin, to share by WhatsApp or text if the email doesn't arrive.
  const emailed = await sendEmail(env, mg.email, "Your WorkerPool Lead Desk account",
    `Hi ${first(mg.name)},\n\nWorkerPool has set up a Lead Desk account for you${mg.company ? ` (${mg.company})` : ""}. Use it to refer clients to WorkerPool and follow each one until the service is complete.\n\nSet your password here (the link works for 7 days):\n${link}\n\nAfter that, sign in any time at ${site(env)}/leads/ with ${mg.email}.\n\nWorkerPool`);
  return { emailed: !!emailed, link };
}
