// Flight Deal Finder API
//   GET  /api/flights/config               → what's switched on (prices, email, Telegram, push key)
//   GET  /api/flights/places?term=edm      → airport / city suggestions
//   POST /api/flights/search               → { from, to, depart, ret? } → every cheap way to fly it
//   POST /api/flights/alerts               → { from, to, depart, ret?, target?, email?, push? } → new price alert
//   GET  /api/flights/alerts/ID.TOKEN      → one alert (manage page)
//   POST /api/flights/alerts/ID.TOKEN      → { action: "stop" | "push" | "target", push?, target? }
//   GET  /api/flights/confirm?a=ID.TOKEN   → confirms the alert's email address
//   POST /api/flights/telegram             → Telegram bot webhook
//   POST /api/flights/check                → checks the alert that's waited longest (called by the scheduled job)
import { json, readJson, isEmail, randomToken, sendEmail } from "../../_lib.js";
import { search, places, ensureAlertTables, setting, shouldNotify, describe, notify, telegram, tgSecret, tgBot, vapid, money } from "../../_flights.js";

const CODE = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);
const CHECK_EVERY_H = 3;

function cleanTrip(b) {
  const from = String(b.from || "").toUpperCase(), to = String(b.to || "").toUpperCase();
  const depart = String(b.depart || ""), ret = b.ret ? String(b.ret) : "";
  if (!CODE.test(from) || !CODE.test(to) || from === to) return { error: "Pick where you're flying from and to." };
  if (!DATE.test(depart) || depart < today()) return { error: "Pick a departure date from today on." };
  if (depart > new Date(Date.now() + 360 * 864e5).toISOString().slice(0, 10)) return { error: "Fares are only available up to about a year ahead." };
  if (ret && (!DATE.test(ret) || ret < depart)) return { error: "The return date must be after the departure date." };
  return { from, to, depart, ret };
}
async function alertFor(env, key) {
  const [id, token] = String(key || "").split(".");
  if (!id || !token) return null;
  await ensureAlertTables(env);
  const a = await env.DB.prepare(`SELECT * FROM flight_alerts WHERE id = ?1`).bind(id).first();
  return a && a.token === token ? a : null;
}
const view = (a) => ({ id: a.id, from: a.origin, to: a.dest, depart: a.depart, ret: a.ret, target: a.target, baseline: a.baseline, last: a.last_price,
  email: a.email ? a.email.replace(/^(.).*(@.*)$/, "$1•••$2") : null, emailConfirmed: !!a.email_ok, telegram: !!a.tg_chat, push: !!a.push,
  checked: a.checked, notified: a.notified, active: !!a.active });

export async function onRequest({ request, env, params }) {
  const path = [].concat(params.path || []);
  const [what, key] = path;
  const origin = new URL(request.url).origin;
  const m = request.method;
  try {
    if (what === "config" && m === "GET") {
      let push = null, tg = null;
      if (env.DB) { await ensureAlertTables(env); push = (await vapid(env)).pub; tg = await tgBot(env, origin).catch(() => null); }
      return json({ ok: true, prices: !!env.TP_TOKEN, email: !!env.RESEND_API_KEY, telegram: tg, push });
    }

    if (what === "places" && m === "GET") {
      const term = (new URL(request.url).searchParams.get("term") || "").trim().slice(0, 40);
      if (term.length < 2) return json({ ok: true, places: [] });
      return json({ ok: true, places: await places(term) });
    }

    if (what === "search" && m === "POST") {
      if (!env.TP_TOKEN) return json({ ok: false, error: "Flight prices aren't switched on yet." }, 503);
      const t = cleanTrip((await readJson(request, 2000)) || {});
      if (t.error) return json({ ok: false, error: t.error }, 400);
      return json({ ok: true, result: await search(env, t) });
    }

    if (what === "alerts" && !key && m === "POST") {
      if (!env.DB) return json({ ok: false, error: "Alerts aren't available right now." }, 503);
      const b = (await readJson(request, 6000)) || {};
      const t = cleanTrip(b);
      if (t.error) return json({ ok: false, error: t.error }, 400);
      const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
      if (email && !isEmail(email)) return json({ ok: false, error: "That email address doesn't look right." }, 400);
      const push = b.push && b.push.endpoint && b.push.keys ? JSON.stringify({ endpoint: String(b.push.endpoint).slice(0, 800), keys: { p256dh: String(b.push.keys.p256dh).slice(0, 200), auth: String(b.push.keys.auth).slice(0, 100) } }) : null;
      if (push && !/^https:\/\//.test(JSON.parse(push).endpoint)) return json({ ok: false, error: "Notifications couldn't be set up in this browser." }, 400);
      const target = b.target ? Math.round(+b.target) : null;
      if (target !== null && !(target > 0 && target < 100000)) return json({ ok: false, error: "Enter a target price in dollars." }, 400);
      await ensureAlertTables(env);
      if (email) {
        const n = await env.DB.prepare(`SELECT COUNT(*) n FROM flight_alerts WHERE email = ?1 AND active = 1`).bind(email).first();
        if (n.n >= 10) return json({ ok: false, error: "You already have 10 active alerts on this email. Stop one first." }, 429);
      }
      let baseline = b.baseline ? Math.round(+b.baseline) : null;
      if (!baseline && env.TP_TOKEN) { try { const r = await search(env, t, { hubs: 6 }); baseline = r.cheapest ? r.cheapest.price : null; } catch {} }
      const id = randomToken().replace(/[-_]/g, "").slice(0, 12), token = randomToken().replace(/[-_]/g, "").slice(0, 20);
      await env.DB.prepare(`INSERT INTO flight_alerts (id, token, origin, dest, depart, ret, target, baseline, last_price, email, push, created, checked, active)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?10, ?11, ?11, 1)`)
        .bind(id, token, t.from, t.to, t.depart, t.ret || null, target, baseline, email || null, push, new Date().toISOString()).run();
      let emailSent = false;
      if (email) {
        emailSent = await sendEmail(env, email, `Confirm your flight alert: ${t.from} → ${t.to}`,
          `You asked WorkerPool to watch fares for ${t.from} → ${t.to} (${t.ret ? t.depart + " to " + t.ret : t.depart}).\n\n` +
          `Confirm your email to start getting alerts:\n${origin}/api/flights/confirm?a=${id}.${token}\n\n` +
          `We check prices every few hours and email you only when ${target ? `the fare drops to ${money(target)} CAD or less` : "there's a very good deal (at least 15% under today's price)"}.\nIf you didn't ask for this, ignore this email.`);
      }
      const bot = await tgBot(env, origin).catch(() => null);
      return json({ ok: true, alert: { key: `${id}.${token}`, ...view({ id, origin: t.from, dest: t.to, depart: t.depart, ret: t.ret, target, baseline, email, push, active: 1 }) },
        emailSent, telegramLink: bot ? `https://t.me/${bot}?start=${id}_${token}` : null });
    }

    if (what === "alerts" && key) {
      const a = await alertFor(env, key);
      if (!a) return json({ ok: false, error: "This alert link isn't valid any more." }, 404);
      if (m === "GET") {
        const bot = await tgBot(env, origin).catch(() => null);
        return json({ ok: true, alert: view(a), telegramLink: bot && !a.tg_chat ? `https://t.me/${bot}?start=${a.id}_${a.token}` : null });
      }
      if (m === "POST") {
        const b = (await readJson(request, 4000)) || {};
        if (b.action === "stop") await env.DB.prepare(`UPDATE flight_alerts SET active = 0 WHERE id = ?1`).bind(a.id).run();
        else if (b.action === "resume") await env.DB.prepare(`UPDATE flight_alerts SET active = 1 WHERE id = ?1`).bind(a.id).run();
        else if (b.action === "push" && b.push && b.push.endpoint) await env.DB.prepare(`UPDATE flight_alerts SET push = ?2 WHERE id = ?1`).bind(a.id, JSON.stringify({ endpoint: String(b.push.endpoint).slice(0, 800), keys: b.push.keys })).run();
        else if (b.action === "email") {
          const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
          if (!isEmail(email)) return json({ ok: false, error: "That email address doesn't look right." }, 400);
          await env.DB.prepare(`UPDATE flight_alerts SET email = ?2, email_ok = 0 WHERE id = ?1`).bind(a.id, email).run();
          await sendEmail(env, email, `Confirm your flight alert: ${a.origin} → ${a.dest}`,
            `Confirm your email to get alerts for ${a.origin} → ${a.dest} (${a.ret ? a.depart + " to " + a.ret : a.depart}):\n${origin}/api/flights/confirm?a=${a.id}.${a.token}\n\nIf you didn't ask for this, ignore this email.`);
        }
        else if (b.action === "target") await env.DB.prepare(`UPDATE flight_alerts SET target = ?2 WHERE id = ?1`).bind(a.id, b.target ? Math.round(+b.target) : null).run();
        else return json({ ok: false, error: "Unknown action." }, 400);
        return json({ ok: true, alert: view(await env.DB.prepare(`SELECT * FROM flight_alerts WHERE id = ?1`).bind(a.id).first()) });
      }
    }

    if (what === "confirm" && m === "GET") {
      const k = new URL(request.url).searchParams.get("a");
      const a = await alertFor(env, k);
      if (a) await env.DB.prepare(`UPDATE flight_alerts SET email_ok = 1 WHERE id = ?1`).bind(a.id).run();
      return Response.redirect(`${origin}/tools/flights/?alert=${a ? encodeURIComponent(k) + "&confirmed=1" : "invalid"}`, 302);
    }

    if (what === "telegram" && m === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN || request.headers.get("x-telegram-bot-api-secret-token") !== (await tgSecret(env))) return new Response("no", { status: 403 });
      const u = (await readJson(request, 20000)) || {};
      const msg = u.message;
      if (!msg || !msg.chat || typeof msg.text !== "string") return json({ ok: true });
      const chat = String(msg.chat.id);
      const [cmd, arg] = msg.text.trim().split(/\s+/);
      await ensureAlertTables(env);
      if (cmd === "/start" && arg) {
        const [id, token] = arg.split("_");
        const a = await alertFor(env, `${id}.${token}`);
        if (a) {
          await env.DB.prepare(`UPDATE flight_alerts SET tg_chat = ?2, active = 1 WHERE id = ?1`).bind(a.id, chat).run();
          await telegram(env, "sendMessage", { chat_id: chat, text: `✅ Done. I'll message you here when ${a.origin} → ${a.dest} (${a.ret ? a.depart + " to " + a.ret : a.depart}) gets ${a.target ? "to " + money(a.target) + " CAD or less" : "a very good deal"}.\n\nSend /stop to stop all your alerts.` });
        } else await telegram(env, "sendMessage", { chat_id: chat, text: "That alert link has expired. Set a new alert at https://workerpool.ca/tools/flights/" });
      } else if (cmd === "/stop") {
        const r = await env.DB.prepare(`UPDATE flight_alerts SET active = 0 WHERE tg_chat = ?1 AND active = 1`).bind(chat).run();
        await telegram(env, "sendMessage", { chat_id: chat, text: `Stopped ${r.meta && r.meta.changes ? r.meta.changes : 0} alert(s). Set new ones any time at https://workerpool.ca/tools/flights/` });
      } else {
        await telegram(env, "sendMessage", { chat_id: chat, text: "I send flight deal alerts from WorkerPool. Set one at https://workerpool.ca/tools/flights/ and tap “Telegram”. Send /stop to stop alerts." });
      }
      return json({ ok: true });
    }

    // Safe to call by anyone: each alert is checked at most every few hours, one per call.
    if (what === "check" && m === "POST") {
      if (!env.DB || !env.TP_TOKEN) return json({ ok: true, remaining: 0, note: "not configured" });
      await ensureAlertTables(env);
      await env.DB.prepare(`UPDATE flight_alerts SET active = 0 WHERE active = 1 AND depart < ?1`).bind(today()).run();
      const due = new Date(Date.now() - CHECK_EVERY_H * 36e5 + 10 * 60000).toISOString();
      const live = `active = 1 AND (checked IS NULL OR checked < ?1) AND ((email IS NOT NULL AND email_ok = 1) OR tg_chat IS NOT NULL OR push IS NOT NULL)`;
      const a = await env.DB.prepare(`SELECT * FROM flight_alerts WHERE ${live} ORDER BY checked LIMIT 1`).bind(due).first();
      if (!a) return json({ ok: true, remaining: 0 });
      await env.DB.prepare(`UPDATE flight_alerts SET checked = ?2 WHERE id = ?1`).bind(a.id, new Date().toISOString()).run();
      let out = { id: a.id, price: null, sent: 0 };
      try {
        const r = await search(env, { from: a.origin, to: a.dest, depart: a.depart, ret: a.ret }, { hubs: 8 });
        const d = describe(r);
        if (d) {
          out.price = d.price;
          await env.DB.prepare(`UPDATE flight_alerts SET last_price = ?2, baseline = COALESCE(baseline, ?2) WHERE id = ?1`).bind(a.id, d.price).run();
          if (shouldNotify({ ...a, baseline: a.baseline || d.price }, d.price)) {
            out.sent = await notify(env, origin, a, r, d);
            if (out.sent) await env.DB.prepare(`UPDATE flight_alerts SET notified_price = ?2, notified = ?3 WHERE id = ?1`).bind(a.id, d.price, new Date().toISOString()).run();
          }
        }
      } catch (e) { out.error = e.message; }
      const n = await env.DB.prepare(`SELECT COUNT(*) n FROM flight_alerts WHERE ${live}`).bind(due).first();
      return json({ ok: true, remaining: n.n, checked: out });
    }

    return json({ ok: false, error: "Not found." }, 404);
  } catch (e) {
    console.error("flights", e);
    return json({ ok: false, error: e.message || "Something went wrong." }, 500);
  }
}
