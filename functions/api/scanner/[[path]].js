// Profile Scanner payments.
//   POST /api/scanner/checkout          → Stripe Checkout link for a $9.99 CAD Scanner Pass
//   GET  /api/scanner/pass?session_id=  → after payment: checks the session with Stripe, returns the pass token
//   GET  /api/scanner/status            → (header x-scan-pass) documents left and expiry
//   POST /api/scanner/restore           → { email }: emails the access link for passes bought in the last 30 days
//   POST /api/scanner/play            → { purchaseToken }: Google Play purchase from the Android app → pass
//   POST /api/scanner/comp              → { key: ADMIN_KEY, docs?, days?, note? }: a free pass link (for clients, testing)
// No webhook is needed: the payment is confirmed directly with Stripe when the buyer comes back.
import { json, readJson, isEmail, sendEmail } from "../../_lib.js";
import { PASS, issue, readPass, view, tokenFor, stripe, isScannerPurchase, passIdFor, sha, claimPlay } from "../../_scanpass.js";

const page = (origin) => origin + "/tools/profile-scanner/";

export async function onRequest({ request, env, params }) {
  const action = (params.path || [])[0] || "";
  const origin = env.SITE_URL || new URL(request.url).origin;
  if (!env.DB) return json({ ok: false, error: "The database isn't connected." }, 503);
  try {
    if (action === "checkout" && request.method === "POST") return await checkout(env, origin);
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

async function checkout(env, origin) {
  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Payments aren't switched on yet. Please check back soon." }, 503);
  const s = await stripe(env, "POST", "checkout/sessions", {
    mode: "payment",
    line_items: { 0: { quantity: 1, price_data: { currency: PASS.currency, unit_amount: PASS.amount,
      product_data: { name: "Profile Scanner Pass", description: `Express Entry score from your own documents · ${PASS.days} days · up to ${PASS.docs} documents · unlimited rescans` } } } },
    success_url: page(origin) + "?paid={CHECKOUT_SESSION_ID}#scanner",
    cancel_url: page(origin) + "?cancelled=1#unlock",
    allow_promotion_codes: "true",
    metadata: { product: "profile-scanner" },
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
  const row = await issue(env, await passIdFor(s.id), { kind: s.livemode ? "stripe" : "stripe-test", startsMs: s.created * 1000, amount: s.amount_total });
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
