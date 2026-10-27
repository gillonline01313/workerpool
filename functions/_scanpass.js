// Profile Scanner Pass: what a $9.99 payment buys, and how the server checks it.
// A pass is a row in D1 (scan_passes) plus a signed token kept in the buyer's browser.
// The row holds only an id, dates and a document counter: no name, email or card details
// (Stripe keeps those), and never anything from the documents themselves.
export const PASS = { amount: 999, currency: "cad", label: "$9.99", days: 30, docs: 25 };

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const secret = (env) => env.SCANNER_SECRET || env.ADMIN_KEY || "workerpool-dev-secret";
async function hmac(env, s) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 40);
}
export const tokenFor = async (env, id) => `${id}.${await hmac(env, "scanpass|" + id)}`;

export async function ensureTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_passes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, docs_used INTEGER NOT NULL DEFAULT 0, docs_max INTEGER NOT NULL, amount INTEGER, note TEXT)`).run();
}
// Create the pass once (repeat calls for the same purchase return the same pass).
export async function issue(env, id, { kind, startsMs, days = PASS.days, docs = PASS.docs, amount = null, note = null }) {
  await ensureTable(env);
  const created = new Date(startsMs || Date.now()).toISOString();
  const expires = new Date((startsMs || Date.now()) + days * 864e5).toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO scan_passes (id, kind, created, expires, docs_used, docs_max, amount, note) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)`)
    .bind(id, kind, created, expires, docs, amount, note).run();
  return env.DB.prepare(`SELECT * FROM scan_passes WHERE id = ?1`).bind(id).first();
}
// Token → live pass row, or null if the token is forged, unknown or expired.
export async function readPass(env, token) {
  if (!env.DB || typeof token !== "string") return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[a-z0-9_-]{6,80}$/i.test(id)) return null;
  if (sig !== (await hmac(env, "scanpass|" + id))) return null;
  await ensureTable(env);
  const row = await env.DB.prepare(`SELECT * FROM scan_passes WHERE id = ?1`).bind(id).first();
  if (!row || row.expires < new Date().toISOString()) return null;
  return row;
}
export const view = (row) => ({ expires: row.expires, left: Math.max(0, row.docs_max - row.docs_used), max: row.docs_max });
// Count one document read. Returns the updated row, or null when the pass is used up or expired.
export async function useDoc(env, id) {
  return env.DB.prepare(`UPDATE scan_passes SET docs_used = docs_used + 1 WHERE id = ?1 AND docs_used < docs_max AND expires > ?2 RETURNING *`)
    .bind(id, new Date().toISOString()).first();
}

/* ---------- Stripe (REST, form-encoded; no SDK needed on Workers) ---------- */
function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out); else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out;
}
export async function stripe(env, method, path, params) {
  const q = params ? form(params).join("&") : "";
  const r = await fetch("https://api.stripe.com/v1/" + path + (method === "GET" && q ? "?" + q : ""), {
    method, headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? q : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || "Stripe error " + r.status);
  return j;
}
export const isScannerPurchase = (s) => s && s.metadata && s.metadata.product === "profile-scanner" && (s.payment_status === "paid" || s.payment_status === "no_payment_required");
export const passIdFor = async (sessionId) => "s_" + (await sha(sessionId)).slice(0, 32);

/* ---------- Google Play (purchases made in the Android app) ----------
   Needs GOOGLE_PLAY_SERVICE_ACCOUNT: the JSON key of a Google Cloud service account that has been
   invited in Play Console (Users and permissions) with "View financial data" and "Manage orders". */
export const PLAY = { packageName: "ca.workerpool.app", sku: "scanner_pass" };
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(enc.encode(s));
let cachedToken = null;
async function googleToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.token;
  const sa = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64urlStr(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(head + "." + body)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + body + "." + sig });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google sign-in failed: " + (j.error_description || j.error || r.status));
  cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.token;
}
async function playApi(env, method, token, suffix = "") {
  const pkg = env.ANDROID_PACKAGE || PLAY.packageName;
  const r = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/products/${PLAY.sku}/tokens/${encodeURIComponent(token)}${suffix}`, {
    method, headers: { Authorization: "Bearer " + (await googleToken(env)), ...(method === "POST" ? { "Content-Type": "application/json" } : {}) }, body: method === "POST" ? "{}" : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google Play: " + ((j.error && j.error.message) || r.status));
  return j;
}
// Checks a purchase token with Google, issues the pass, then consumes the purchase (which also
// acknowledges it, so Google won't refund it, and lets the person buy another pass later).
export async function claimPlay(env, purchaseToken) {
  const p = await playApi(env, "GET", purchaseToken);
  if (p.purchaseState === 2) return { error: "Your payment is still pending. The scanner unlocks as soon as Google Play confirms it." };
  if (p.purchaseState !== 0) return { error: "This purchase was cancelled." };
  const id = "g_" + (await sha(purchaseToken)).slice(0, 32);
  const row = await issue(env, id, { kind: p.purchaseType === 0 ? "play-test" : "play", startsMs: +p.purchaseTimeMillis || Date.now(), amount: PASS.amount, note: p.orderId ? String(p.orderId).slice(0, 60) : null });
  // A failed consume isn't fatal: the pass exists, and the app retries (listPurchases) on next launch,
  // well within Google's 3-day acknowledgement window.
  if (p.consumptionState === 0) { try { await playApi(env, "POST", purchaseToken, ":consume"); } catch (e) { console.warn("Play consume failed", e.message); } }
  return { row };
}

/* ---------- Price and coupons (managed in the admin dashboard → Scanner passes) ---------- */
// The website price (Stripe) is a setting; PASS.amount is only the default. The Android app's price is
// set in Google Play Console. Coupons apply to website checkout only.
export const MIN_CHARGE = 50; // Stripe's minimum charge in CAD cents; a 100% coupon skips Stripe instead
export async function ensureShopTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_coupons (code TEXT PRIMARY KEY, percent INTEGER NOT NULL, max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0,
    expires TEXT, active INTEGER NOT NULL DEFAULT 1, note TEXT, created TEXT NOT NULL)`).run();
}
export async function priceCents(env) {
  try {
    await ensureShopTables(env);
    const r = await env.DB.prepare(`SELECT v FROM scan_settings WHERE k = 'price_cents'`).first();
    const n = r ? parseInt(r.v) : NaN;
    return n >= MIN_CHARGE && n <= 100000 ? n : PASS.amount;
  } catch (e) { return PASS.amount; }
}
export const money = (cents) => "$" + (cents / 100).toFixed(2);
export const normCode = (c) => String(c || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
// A live coupon row, or { error } explaining why it can't be used.
export async function findCoupon(env, code) {
  code = normCode(code);
  if (!code) return { error: "Enter a coupon code." };
  await ensureShopTables(env);
  const c = await env.DB.prepare(`SELECT * FROM scan_coupons WHERE code = ?1`).bind(code).first();
  if (!c || !c.active) return { error: "That coupon code isn't valid." };
  if (c.expires && c.expires < new Date().toISOString().slice(0, 10)) return { error: "That coupon has expired." };
  if (c.max_uses != null && c.uses >= c.max_uses) return { error: "That coupon has been fully used." };
  return { coupon: c };
}
export function discounted(price, percent) {
  if (percent >= 100) return 0;
  return Math.max(MIN_CHARGE, Math.round(price * (100 - percent) / 100));
}
export async function countUse(env, code) {
  if (code) await env.DB.prepare(`UPDATE scan_coupons SET uses = uses + 1 WHERE code = ?1`).bind(normCode(code)).run();
}
