export const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export async function readJson(request, max) {
  const raw = await request.text();
  if (raw.length > max) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export const id = () => crypto.randomUUID();

/* ---------- crypto helpers ---------- */
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const ITER = 100000;
async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITER))}`;
}
export async function checkPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored || "").split("$");
  if (alg !== "pbkdf2") return false;
  const got = b64(await pbkdf2(password, unb64(salt), parseInt(iter)));
  if (got.length !== hash.length) return false;
  let d = 0; for (let i = 0; i < got.length; i++) d |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return d === 0;
}

/* ---------- sessions ---------- */
const COOKIE = "wp_s";
const SESSION_DAYS = 30;
export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export async function createSession(env, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires) VALUES (?1, ?2, ?3)`)
    .bind(await sha256hex(token), userId, expires).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}
export function readCookie(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)wp_s=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
export async function getUser(request, env) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires > ?2`
  ).bind(await sha256hex(token), new Date().toISOString()).first();
  return row || null;
}
export const publicUser = (u) => ({ name: u.name, email: u.email, phone: u.phone });

/* ---------- email (Resend) ---------- */
export async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "WorkerPool <noreply@workerpool.ca>", to: [to], subject, text }),
    });
    return r.ok;
  } catch { return false; }
}
