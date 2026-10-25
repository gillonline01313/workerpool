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
// Replies never go back to the noreply sender: by default they reach REPLY_TO (or ADMIN_EMAIL).
// Admin alerts pass the candidate's own email as replyTo, so hitting Reply answers them directly.
export async function sendEmail(env, to, subject, text, replyTo) {
  if (!env.RESEND_API_KEY || !to) return false;
  const reply = [replyTo, env.REPLY_TO, env.ADMIN_EMAIL].find((e) => e && isEmail(e) && e !== to) || env.REPLY_TO || env.ADMIN_EMAIL;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "WorkerPool <noreply@workerpool.ca>", to: [to], subject, text, ...(reply ? { reply_to: reply } : {}) }),
    });
    return r.ok;
  } catch { return false; }
}

/* ---------- live chat hours (8:00 to 23:00 Edmonton time, daily) ---------- */
export const CHAT_TZ = "America/Edmonton", CHAT_OPEN = 8, CHAT_CLOSE = 23;
export function chatOpen(d = new Date()) {
  const h = parseInt(new Intl.DateTimeFormat("en-CA", { timeZone: CHAT_TZ, hour: "numeric", hourCycle: "h23" }).format(d));
  return h >= CHAT_OPEN && h < CHAT_CLOSE;
}

/* ---------- chat helpers ---------- */
export async function chatThread(env, request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)wp_chat=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  return env.DB.prepare(`SELECT * FROM chat_threads WHERE token_hash = ?1`).bind(await sha256hex(m[1])).first();
}
export const CHAT_MSG_SQL = `SELECT m.id, m.sender, m.body, m.created, f.id AS file_id, f.name AS file_name, f.size AS file_size, f.type AS file_type
  FROM chat_messages m LEFT JOIN chat_files f ON f.msg_id = m.id WHERE m.thread_id = ?1 AND m.id > ?2 ORDER BY m.id LIMIT ?3`;
// Email the admin for a new chat, any message outside live hours, or after 10 quiet minutes on an ongoing chat.
export async function chatNotify(env, t, { open, isNew, text }) {
  if (!(isNew || !open || !t.last_notified || Date.now() - Date.parse(t.last_notified) > 6e5)) return;
  await env.DB.prepare(`UPDATE chat_threads SET last_notified = ?1 WHERE id = ?2`).bind(new Date().toISOString(), t.id).run();
  await sendEmail(env, env.ADMIN_EMAIL, `${open ? "Live chat" : "Offline chat message"} from ${t.name}`,
    `${t.name}${t.email ? " (" + t.email + ")" : ""} ${isNew ? "started a chat" : "sent a message"}${open ? "" : " outside live hours"}:\n\n${text}\n\nReply in the admin dashboard: ${env.SITE_URL || "https://workerpool.ca"}/admin/ (Live chat tab)`, t.email);
}

/* ---------- uploaded file checks (PDF, JPG, PNG, DOC, DOCX up to 10 MB) ---------- */
export const FILE_MAX = 10 * 1024 * 1024;
const FILE_TYPES = {
  pdf: ["application/pdf", (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46],
  jpg: ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8],
  jpeg: ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8],
  png: ["image/png", (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", (b) => b[0] === 0x50 && b[1] === 0x4b],
  doc: ["application/msword", (b) => b[0] === 0xd0 && b[1] === 0xcf],
};
export function fileName(request) {
  try { return decodeURIComponent(request.headers.get("x-file-name") || "file").replace(/[^\w .()\-]/g, "_").slice(0, 120) || "file"; } catch { return "file"; }
}
// Returns { ext, type } for an allowed file, or { error }.
export function fileCheck(name, buf) {
  const ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
  const k = FILE_TYPES[ext];
  if (!k) return { error: "Send a PDF, JPG, PNG, DOC or DOCX file." };
  if (buf.byteLength > FILE_MAX) return { error: "That file is over 10 MB." };
  if (buf.byteLength < 8 || !k[1](new Uint8Array(buf, 0, 8))) return { error: "That file doesn't match its type. Try saving it again as a PDF." };
  return { ext, type: k[0] };
}
export function fileResponse(obj, name, type) {
  const inline = /^image\/(png|jpeg)$/.test(type);
  return new Response(obj.body, { headers: {
    "content-type": type || "application/octet-stream",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${String(name || "file").replace(/"/g, "")}"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } });
}
