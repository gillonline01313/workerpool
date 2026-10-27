// Profile Scanner payments.
//   GET  /api/scanner/price             → current website price (admin setting)
//   POST /api/scanner/coupon            → { code }: checks a coupon, returns the discounted price
//   POST /api/scanner/checkout          → { coupon? }: Stripe Checkout link at the current price, less any coupon
//                                          (a 100% coupon issues the pass straight away, no Stripe)
//   POST /api/scanner/admin             → { key, action, ... }: price and coupon management for the admin dashboard
//   GET  /api/scanner/pass?session_id=  → after payment: checks the session with Stripe, returns the pass token
//   GET  /api/scanner/status            → (header x-scan-pass) documents left and expiry
//   POST /api/scanner/restore           → { email }: emails the access link for passes bought in the last 30 days
//   POST /api/scanner/play            → { purchaseToken }: Google Play purchase from the Android app → pass
//   POST /api/scanner/comp              → { key: ADMIN_KEY, docs?, days?, note? }: a free pass link (for clients, testing)
// No webhook is needed: the payment is confirmed directly with Stripe when the buyer comes back.
import { json, readJson, isEmail, sendEmail } from "../../_lib.js";
import { PASS, issue, readPass, view, tokenFor, stripe, isScannerPurchase, passIdFor, sha, claimPlay,
  priceCents, money, normCode, findCoupon, discounted, countUse, ensureShopTables, ensureTable, MIN_CHARGE } from "../../_scanpass.js";

const page = (origin) => origin + "/tools/profile-scanner/";

export async function onRequest({ request, env, params }) {
  const action = (params.path || [])[0] || "";
  const origin = env.SITE_URL || new URL(request.url).origin;
  if (!env.DB) return json({ ok: false, error: "The database isn't connected." }, 503);
  try {
    if (action === "price" && request.method === "GET") { const p = await priceCents(env); return json({ ok: true, cents: p, label: money(p) }); }
    if (action === "coupon" && request.method === "POST") return await coupon(request, env);
    if (action === "checkout" && request.method === "POST") return await checkout(request, env, origin);
    if (action === "admin" && request.method === "POST") return await admin(request, env, origin);
    if (action === "pass" && request.method === "GET") return await claim(env, new URL(request.url).searchParams.get("session_id") || "");
    if (action === "status" && request.method === "GET") {
      const row = await readPass(env, request.headers.get("x-scan-pass"));
      return json(row ? { ok: true, valid: true, ...view(row) } : { ok: true, valid: false });
    }
    if (action === "restore" && request.method === "POST") return await restore(request, env, origin);
    if (action === "comp" && request.method === "POST") return await comp(request, env, origin);
    if (action === "play" && request.method === "POST") return await play(request, env);
  } catch (e) {
    return json({ ok: false, error: "Payment service error. Please try again in a moment." , detail: String(e.message || e).slice(0, 160) }, 502);
  }
  return json({ ok: false, error: "Not found" }, 404);
}

async function coupon(request, env) {
  const b = await readJson(request, 1000);
  if (await tooMany(env, request, "coupon", 30)) return json({ ok: false, error: "Too many attempts. Please try again in an hour." }, 429);
  const f = await findCoupon(env, b && b.code);
  if (f.error) return json({ ok: false, error: f.error }, 404);
  const price = await priceCents(env), now = discounted(price, f.coupon.percent);
  return json({ ok: true, code: f.coupon.code, percent: f.coupon.percent, was: money(price), cents: now, label: now ? money(now) : "Free" });
}

async function checkout(request, env, origin) {
  const b = (await readJson(request, 1000)) || {};
  const price = await priceCents(env);
  let amount = price, code = "";
  if (b.coupon) {
    const f = await findCoupon(env, b.coupon);
    if (f.error) return json({ ok: false, error: f.error }, 400);
    code = f.coupon.code; amount = discounted(price, f.coupon.percent);
  }
  if (amount === 0) { // 100% coupon: no payment needed
    if (await tooMany(env, request, "freecoupon", 5)) return json({ ok: false, error: "Too many attempts. Please try again in an hour." }, 429);
    const row = await issue(env, "f_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24), { kind: "coupon", amount: 0, note: code });
    await countUse(env, code);
    return json({ ok: true, free: true, token: await tokenFor(env, row.id), ...view(row) });
  }
  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Payments aren't switched on yet. Please check back soon." }, 503);
  const s = await stripe(env, "POST", "checkout/sessions", {
    mode: "payment",
    line_items: { 0: { quantity: 1, price_data: { currency: PASS.currency, unit_amount: amount,
      product_data: { name: "Profile Scanner Pass" + (code ? ` (coupon ${code})` : ""), description: `Express Entry score from your own documents · ${PASS.days} days · up to ${PASS.docs} documents · unlimited rescans` } } } },
    success_url: page(origin) + "?paid={CHECKOUT_SESSION_ID}#scanner",
    cancel_url: page(origin) + "?cancelled=1#unlock",
    ...(code ? {} : { allow_promotion_codes: "true" }),
    metadata: { product: "profile-scanner", coupon: code, list_price: String(price) },
    payment_intent_data: { description: "WorkerPool Profile Scanner Pass", metadata: { product: "profile-scanner" } },
    custom_text: { submit: { message: `One-time payment, no subscription. ${PASS.days} days of access. Your documents are never saved.` } },
    ...(env.STRIPE_TAX === "on" ? { automatic_tax: { enabled: "true" } } : {}),
  });
  return json({ ok: true, url: s.url });
}

async function claim(env, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return json({ ok: false, error: "That payment link isn't valid." }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Payments aren't switched on yet." }, 503);
  const s = await stripe(env, "GET", "checkout/sessions/" + encodeURIComponent(sessionId));
  if (!isScannerPurchase(s)) return json({ ok: false, error: s.status === "open" ? "Your payment hasn't finished yet. Please complete checkout." : "We couldn't confirm this payment." }, 402);
  const id = await passIdFor(s.id);
  await ensureTable(env); // the very first purchase creates the table
  const existed = await env.DB.prepare(`SELECT 1 FROM scan_passes WHERE id = ?1`).bind(id).first();
  const code = (s.metadata && s.metadata.coupon) || "";
  const row = await issue(env, id, { kind: s.livemode ? "stripe" : "stripe-test", startsMs: s.created * 1000, amount: s.amount_total, note: code || null });
  if (!existed && code) await countUse(env, code); // count a coupon once, when its payment is first confirmed
  if (row.expires < new Date().toISOString()) return json({ ok: false, error: `This pass expired on ${row.expires.slice(0, 10)}.` }, 410);
  return json({ ok: true, token: await tokenFor(env, row.id), ...view(row) });
}

async function restore(request, env, origin) {
  const b = await readJson(request, 2000);
  const email = String((b && b.email) || "").trim().toLowerCase();
  const done = json({ ok: true, message: "If that email bought a Scanner Pass in the last 30 days, we've emailed the access link. Check your spam folder too." });
  if (!isEmail(email)) return json({ ok: false, error: "Enter the email you used at checkout." }, 400);
  if (!env.STRIPE_SECRET_KEY) return done;
  if (await tooMany(env, request, "restore", 5)) return json({ ok: false, error: "Too many attempts. Please try again in an hour." }, 429);
  const since = Math.floor(Date.now() / 1000) - PASS.days * 86400;
  const list = await stripe(env, "GET", "checkout/sessions", { customer_details: { email }, status: "complete", created: { gte: since }, limit: 20 });
  const mine = (list.data || []).filter(isScannerPurchase);
  if (mine.length) {
    const links = mine.map((s) => `${page(origin)}?paid=${s.id}#scanner  (bought ${new Date(s.created * 1000).toISOString().slice(0, 10)})`).join("\n");
    await sendEmail(env, email, "Your WorkerPool Profile Scanner access link",
      `Here's your link back to the Profile Scanner. Open it on any device to continue:\n\n${links}\n\nEach pass lasts ${PASS.days} days and covers up to ${PASS.docs} documents. Keep this email private: anyone with the link can use your pass.\n\nWorkerPool`);
  }
  return done;
}

async function play(request, env) {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT) return json({ ok: false, error: "In-app purchases aren't switched on yet." }, 503);
  const b = await readJson(request, 6000);
  const t = String((b && b.purchaseToken) || "");
  if (!/^[A-Za-z0-9._-]{20,4000}$/.test(t)) return json({ ok: false, error: "That purchase couldn't be read." }, 400);
  const r = await claimPlay(env, t);
  if (r.error) return json({ ok: false, error: r.error }, 402);
  return json({ ok: true, token: await tokenFor(env, r.row.id), ...view(r.row) });
}

async function admin(request, env, origin) {
  const b = await readJson(request, 4000);
  if (!env.ADMIN_KEY || !b || b.key !== env.ADMIN_KEY) return json({ ok: false, error: "auth" }, 401);
  await ensureShopTables(env);
  const now = new Date().toISOString();
  const link = (code) => page(origin) + "?coupon=" + encodeURIComponent(code) + "#unlock";
  if (b.action === "price") {
    const cents = Math.round(parseFloat(String(b.price).replace(/[$,\s]/g, "")) * 100);
    if (!(cents >= MIN_CHARGE && cents <= 100000)) return json({ ok: false, error: "Enter a price between $0.50 and $1,000." }, 400);
    await env.DB.prepare(`INSERT INTO scan_settings (k, v, updated) VALUES ('price_cents', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated = excluded.updated`).bind(String(cents), now).run();
  } else if (b.action === "coupon-save") {
    const code = normCode(b.code) || "WP" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const pct = Math.round(+b.percent);
    if (!(pct >= 1 && pct <= 100)) return json({ ok: false, error: "The discount must be between 1% and 100%." }, 400);
    const max = b.max_uses === "" || b.max_uses == null ? null : Math.max(1, Math.round(+b.max_uses));
    const exp = /^\d{4}-\d{2}-\d{2}$/.test(b.expires || "") ? b.expires : null;
    const note = String(b.note || "").slice(0, 120) || null;
    if (b.edit) {
      await env.DB.prepare(`UPDATE scan_coupons SET percent = ?2, max_uses = ?3, expires = ?4, note = ?5 WHERE code = ?1`).bind(code, pct, max, exp, note).run();
    } else {
      const r = await env.DB.prepare(`INSERT OR IGNORE INTO scan_coupons (code, percent, max_uses, uses, expires, active, note, created) VALUES (?1, ?2, ?3, 0, ?4, 1, ?5, ?6)`).bind(code, pct, max, exp, note, now).run();
      if (!r.meta || !r.meta.changes) return json({ ok: false, error: `A coupon called ${code} already exists.` }, 409);
    }
  } else if (b.action === "coupon-active") {
    await env.DB.prepare(`UPDATE scan_coupons SET active = ?2 WHERE code = ?1`).bind(normCode(b.code), b.active ? 1 : 0).run();
  } else if (b.action === "coupon-delete") {
    await env.DB.prepare(`DELETE FROM scan_coupons WHERE code = ?1`).bind(normCode(b.code)).run();
  } else if (b.action !== "list") return json({ ok: false, error: "Unknown action." }, 400);
  const price = await priceCents(env);
  const rows = (await env.DB.prepare(`SELECT * FROM scan_coupons ORDER BY active DESC, created DESC LIMIT 500`).all()).results || [];
  return json({ ok: true, price: { cents: price, label: money(price), isDefault: price === PASS.amount }, minimum: money(MIN_CHARGE),
    coupons: rows.map((c) => ({ ...c, active: !!c.active, link: link(c.code), pays: money(discounted(price, c.percent)) })) });
}

async function comp(request, env, origin) {
  const b = await readJson(request, 2000);
  if (!env.ADMIN_KEY || !b || b.key !== env.ADMIN_KEY) return json({ ok: false, error: "auth" }, 401);
  const id = "c_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const row = await issue(env, id, { kind: "comp", days: Math.min(365, Math.max(1, +b.days || PASS.days)), docs: Math.min(500, Math.max(1, +b.docs || PASS.docs)), note: String(b.note || "").slice(0, 120) || null });
  const token = await tokenFor(env, id);
  return json({ ok: true, token, link: page(origin) + "?pass=" + encodeURIComponent(token) + "#scanner", ...view(row) });
}

async function tooMany(env, request, what, max) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp TEXT NOT NULL)`).run();
    const now = new Date(), k = what + ":" + (await sha((request.headers.get("cf-connecting-ip") || "0") + "|" + now.toISOString().slice(0, 13))).slice(0, 32);
    const r = await env.DB.prepare(`INSERT INTO scan_rate (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n`).bind(k, new Date(now.getTime() + 36e5).toISOString()).first();
    return r.n > max;
  } catch (e) { return false; }
}
