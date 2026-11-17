// WorkerPool eSign: send a document to several people for electronic signature, keep a tamper-evident
// audit trail, and produce a sealed final PDF with a Certificate of Completion.
//
// How an envelope works
//   draft → (owner uploads PDF/JPG/PNG files, merged into one PDF; adds signers and CC; places fields) → sent
//   → each signer opens a personal link, accepts the electronic records disclosure, confirms a one-time code
//     emailed to them (plus an access code if the sender set one), fills their fields and adopts a signature
//   → when the last signer finishes: the fields are stamped onto the original PDF, every page gets the
//     envelope ID, the Certificate of Completion is appended, the SHA-256 of the result is recorded and sealed,
//     and everyone (signers and CC) gets the completed PDF by email.
//   Other endings: declined (a signer declines), voided (owner), expired (no one finished in time).
//
// Every action is an event in esign_events. Each event's hash covers the previous event's hash, so editing
// or deleting any line breaks the chain (the certificate prints the final chain hash).
//
// Who can send: the WorkerPool admin (no limits) and anyone with a WorkerPool account and an eSign
// subscription. Plans, prices, free trials ("first month free"), promo codes and free access are set
// by the admin (admin → eSign → Plans & offers). Payments go through Stripe subscriptions.
//
// Tables are created automatically. Files go to the private RESUMES R2 bucket under esign/.
import { PDFDocument, StandardFonts, rgb, degrees } from "./_vendor/pdf-lib.js";
import { sha256hex, isEmail } from "./_lib.js";

export const SITE = (env) => env.SITE_URL || "https://workerpool.ca";
export const BRAND = "WorkerPool eSign";
export const TZ = "America/Edmonton";
export const MAX_FILE = 15 * 1024 * 1024;       // one uploaded file
export const MAX_ENVELOPE = 25 * 1024 * 1024;   // the merged PDF of one envelope
export const MAX_RECIPIENTS = 20;
export const MAX_FIELDS = 400;
export const FIELD_TYPES = ["signature", "initials", "date", "name", "email", "text", "checkbox"];
export const COLORS = ["#f5c84c", "#7fb8f0", "#9ad19a", "#f2a0a0", "#c7a6ef", "#f4b67a", "#7fd6cf", "#e7a6cf"];

/* ======================= tables ======================= */
let ready = false;
export async function ensureEsign(env) {
  if (ready) return;
  for (const q of [
    `CREATE TABLE IF NOT EXISTS esign_envelopes (id TEXT PRIMARY KEY, owner TEXT NOT NULL, owner_name TEXT, owner_email TEXT, title TEXT, message TEXT,
      status TEXT DEFAULT 'draft', seq INTEGER DEFAULT 0, expires_days INTEGER DEFAULT 30, remind_days INTEGER DEFAULT 3,
      orig_key TEXT, orig_names TEXT, orig_size INTEGER, orig_sha TEXT, pages INTEGER DEFAULT 0, page_sizes TEXT,
      final_key TEXT, final_sha TEXT, final_size INTEGER, cert_key TEXT, cert_sha TEXT, seal TEXT, final_error TEXT,
      created TEXT, updated TEXT, sent_at TEXT, completed_at TEXT, expires_at TEXT, ended_at TEXT, end_reason TEXT, last_hash TEXT, owner_ip TEXT)`,
    `CREATE INDEX IF NOT EXISTS esign_env_owner ON esign_envelopes (owner, created)`,
    `CREATE INDEX IF NOT EXISTS esign_env_final ON esign_envelopes (final_sha)`,
    `CREATE TABLE IF NOT EXISTS esign_recipients (id TEXT PRIMARY KEY, env_id TEXT NOT NULL, role TEXT DEFAULT 'signer', name TEXT, email TEXT, ord INTEGER DEFAULT 1,
      color INTEGER DEFAULT 0, access_hash TEXT, nonce TEXT, status TEXT DEFAULT 'created', sent_at TEXT, viewed_at TEXT, verified_at TEXT, consent_at TEXT,
      signed_at TEXT, declined_at TEXT, decline_reason TEXT, otp_hash TEXT, otp_expires TEXT, otp_tries INTEGER DEFAULT 0, otp_sent_at TEXT, otp_count INTEGER DEFAULT 0,
      sess_hash TEXT, sess_expires TEXT, sig_png TEXT, init_png TEXT, sig_kind TEXT, sig_text TEXT, ip TEXT, ua TEXT, geo TEXT, tz TEXT, last_remind TEXT, remind_count INTEGER DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS esign_rcpt_env ON esign_recipients (env_id)`,
    `CREATE TABLE IF NOT EXISTS esign_fields (id TEXT PRIMARY KEY, env_id TEXT NOT NULL, rcpt_id TEXT NOT NULL, type TEXT NOT NULL, page INTEGER NOT NULL,
      x REAL, y REAL, w REAL, h REAL, required INTEGER DEFAULT 1, label TEXT, value TEXT)`,
    `CREATE INDEX IF NOT EXISTS esign_fields_env ON esign_fields (env_id)`,
    `CREATE TABLE IF NOT EXISTS esign_events (id INTEGER PRIMARY KEY AUTOINCREMENT, env_id TEXT NOT NULL, rcpt_id TEXT, actor TEXT, action TEXT, detail TEXT,
      ip TEXT, ua TEXT, geo TEXT, at TEXT, hash TEXT)`,
    `CREATE INDEX IF NOT EXISTS esign_events_env ON esign_events (env_id, id)`,
    // subscriptions
    `CREATE TABLE IF NOT EXISTS esign_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, blurb TEXT, price_cents INTEGER NOT NULL DEFAULT 0, interval TEXT DEFAULT 'month',
      envelopes INTEGER DEFAULT 0, trial_days INTEGER DEFAULT 0, card_upfront INTEGER DEFAULT 1, active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, created TEXT)`,
    `CREATE TABLE IF NOT EXISTS esign_promos (code TEXT PRIMARY KEY, kind TEXT NOT NULL, value INTEGER NOT NULL, months INTEGER DEFAULT 1, plan_id TEXT,
      auto INTEGER DEFAULT 0, max_uses INTEGER, uses INTEGER DEFAULT 0, expires TEXT, active INTEGER DEFAULT 1, stripe_coupon TEXT, note TEXT, created TEXT)`,
    `CREATE TABLE IF NOT EXISTS esign_subs (user_id TEXT PRIMARY KEY, plan_id TEXT, status TEXT, stripe_customer TEXT, stripe_sub TEXT, period_start TEXT, period_end TEXT,
      trial_end TEXT, trial_used INTEGER DEFAULT 0, cancel_at_end INTEGER DEFAULT 0, promo TEXT, comp_until TEXT, comp_note TEXT, created TEXT, updated TEXT, synced TEXT)`,
    `CREATE TABLE IF NOT EXISTS esign_payments (session_id TEXT PRIMARY KEY, user_id TEXT, plan_id TEXT, promo TEXT, created TEXT)`,
    `CREATE TABLE IF NOT EXISTS esign_settings (k TEXT PRIMARY KEY, v TEXT)`,
  ]) await env.DB.prepare(q).run();
  ready = true;
}

/* ======================= small helpers ======================= */
const enc = new TextEncoder();
export const now = () => new Date().toISOString();
export const envId = () => crypto.randomUUID().toUpperCase();
export const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);
export const secret = (env) => env.ESIGN_SECRET || env.ADMIN_KEY || "";
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256buf(buf) { return hex(await crypto.subtle.digest("SHA-256", buf)); }
export async function hmac(env, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret(env) + "|esign"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
export function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
export const parse = (s, d = {}) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
export const clientIp = (request) => request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
export const clientUa = (request) => String(request.headers.get("user-agent") || "").slice(0, 300);
export function clientGeo(request) {
  const c = request.cf || {};
  return [c.city, c.region, c.country].filter(Boolean).join(", ").slice(0, 120);
}
export const fmtTime = (iso, tz = TZ) => iso ? new Intl.DateTimeFormat("en-CA", { timeZone: tz || TZ, year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(iso)) : "";
export const fmtDate = (iso, tz = TZ) => new Intl.DateTimeFormat("en-US", { timeZone: tz || TZ, year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
export const shortId = (id) => String(id || "").slice(0, 8);
export function maskEmail(e) {
  const [u, d] = String(e || "").split("@");
  if (!d) return e || "";
  return u.slice(0, 2) + "•••@" + d;
}

// Personal signing link for one recipient: /esign/sign/?t=<id>.<mac>. The mac covers a nonce stored with the
// recipient, so a link can be re-created for reminders and cut off (new nonce) when the envelope is voided.
export async function linkToken(env, r) { return `${r.id}.${(await hmac(env, "sign|" + r.id + "|" + r.nonce)).slice(0, 40)}`; }
export async function signLink(env, r) { return `${SITE(env)}/esign/sign/?t=${await linkToken(env, r)}`; }
export async function recipientFromToken(env, t) {
  const m = String(t || "").match(/^([a-f0-9]{20})\.([a-f0-9]{40})$/);
  if (!m) return null;
  const r = await env.DB.prepare(`SELECT * FROM esign_recipients WHERE id = ?1`).bind(m[1]).first();
  if (!r || !r.nonce) return null;
  return same((await hmac(env, "sign|" + r.id + "|" + r.nonce)).slice(0, 40), m[2]) ? r : null;
}

/* ======================= audit trail (hash chain) ======================= */
export async function logEvent(env, e, { rcpt = null, actor = "", action, detail = "", request = null }) {
  const row = await env.DB.prepare(`SELECT hash FROM esign_events WHERE env_id = ?1 ORDER BY id DESC LIMIT 1`).bind(e.id).first();
  const prev = row ? row.hash : "0".repeat(64);
  const at = now(), ip = request ? clientIp(request) : "", ua = request ? clientUa(request) : "", geo = request ? clientGeo(request) : "";
  const hash = await sha256hex([prev, e.id, at, rcpt || "", actor, action, detail, ip, ua, geo].join("|"));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO esign_events (env_id, rcpt_id, actor, action, detail, ip, ua, geo, at, hash) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
      .bind(e.id, rcpt, actor, action, detail, ip, ua, geo, at, hash),
    env.DB.prepare(`UPDATE esign_envelopes SET last_hash = ?1, updated = ?2 WHERE id = ?3`).bind(hash, at, e.id),
  ]);
  return hash;
}
// Recomputes every hash; returns { ok, count, last } or { ok: false, at: eventId }.
export async function checkChain(env, envelopeId) {
  const ev = await env.DB.prepare(`SELECT * FROM esign_events WHERE env_id = ?1 ORDER BY id`).bind(envelopeId).all();
  let prev = "0".repeat(64);
  for (const x of ev.results) {
    const h = await sha256hex([prev, x.env_id, x.at, x.rcpt_id || "", x.actor || "", x.action || "", x.detail || "", x.ip || "", x.ua || "", x.geo || ""].join("|"));
    if (h !== x.hash) return { ok: false, at: x.id, count: ev.results.length };
    prev = h;
  }
  return { ok: true, count: ev.results.length, last: prev };
}

/* ======================= email ======================= */
const escH = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// The sender shows as "Owner Name via WorkerPool eSign"; replies go to the owner.
export async function mail(env, { to, subject, text, html, fromName, replyTo, attachments }) {
  if (!env.RESEND_API_KEY || !to) return false;
  const addr = ((env.MAIL_FROM || "WorkerPool <noreply@workerpool.ca>").match(/<([^>]+)>/) || [, "noreply@workerpool.ca"])[1];
  const name = String(fromName || BRAND).replace(/[^\p{L}\p{N} .,'&-]/gu, "").slice(0, 70);
  const reply = [replyTo, env.REPLY_TO, env.ADMIN_EMAIL].find((e) => e && isEmail(e) && e !== to);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${name} <${addr}>`, to: [to], subject, text, ...(html ? { html } : {}), ...(reply ? { reply_to: reply } : {}),
        ...(attachments && attachments.length ? { attachments } : {}) }),
    });
    return r.ok;
  } catch { return false; }
}
// Simple branded HTML email with one button.
export function emailHtml({ heading, lines = [], button, link, foot = [] }) {
  return `<!doctype html><html><body style="margin:0;background:#eef2f1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2628">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d3dcda">
<tr><td style="background:#24514b;color:#fff;padding:16px 24px;font-weight:700;font-size:16px">${BRAND}</td></tr>
<tr><td style="padding:26px 24px 8px"><div style="font-size:20px;font-weight:700;margin:0 0 12px">${escH(heading)}</div>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${l}</p>`).join("")}
${button && link ? `<p style="margin:20px 0"><a href="${escH(link)}" style="display:inline-block;background:#e8a317;color:#1b2628;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:6px">${escH(button)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:8px 24px 22px;color:#5a696b;font-size:12px;line-height:1.5;border-top:1px solid #eef2f1">${foot.map((f) => `<p style="margin:8px 0 0">${f}</p>`).join("")}</td></tr>
</table></td></tr></table></body></html>`;
}
const DO_NOT_SHARE = "Do not share this email or forward the link: it gives access to the document and is personal to you.";

export async function sendInvite(env, e, r, reminder = false) {
  const link = await signLink(env, r);
  const from = e.owner_name || "WorkerPool";
  const subject = `${reminder ? "Reminder: " : ""}Please sign: ${e.title}`;
  const text = `${from} sent you a document to review and sign${reminder ? " (reminder)" : ""}.\n\nDocument: ${e.title}\n${e.message ? `\nMessage from ${from}:\n${e.message}\n` : ""}\nReview and sign:\n${link}\n\n` +
    `You'll confirm a one-time code sent to this email address before signing.\n${e.expires_at ? `This request expires on ${fmtDate(e.expires_at)}.\n` : ""}\n${DO_NOT_SHARE}\n\nEnvelope ID: ${e.id}\nSent with ${BRAND} · ${SITE(env)}/esign/verify/`;
  const html = emailHtml({ heading: `${from} sent you a document to review and sign`,
    lines: [`<b>${escH(e.title)}</b>`, ...(e.message ? [`<i>${escH(e.message).replace(/\n/g, "<br>")}</i>`] : []), `Hello ${escH(r.name)},`],
    button: "REVIEW DOCUMENT", link,
    foot: [DO_NOT_SHARE, ...(e.expires_at ? [`This request expires on ${fmtDate(e.expires_at)}.`] : []), `Envelope ID: ${e.id}`, `Questions about the document? Reply to this email to reach ${escH(from)}.`] });
  return mail(env, { to: r.email, subject, text, html, fromName: `${from} via ${BRAND}`, replyTo: e.owner_email });
}

/* ======================= PDF: merge uploads ======================= */
const PDF_MAGIC = (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const PNG_MAGIC = (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const JPG_MAGIC = (b) => b[0] === 0xff && b[1] === 0xd8;
export function uploadKind(name, buf) {
  const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  if (buf.byteLength < 8) return { error: "That file is empty." };
  if (buf.byteLength > MAX_FILE) return { error: "That file is over 15 MB." };
  if (PDF_MAGIC(b)) return { kind: "pdf" };
  if (PNG_MAGIC(b)) return { kind: "png" };
  if (JPG_MAGIC(b)) return { kind: "jpg" };
  if (/\.docx?$/i.test(name)) return { error: "Word files can't be signed directly. In Word choose File → Save as → PDF, then upload the PDF." };
  return { error: "Upload a PDF, JPG or PNG file." };
}
// Adds one file (PDF pages, or an image as a Letter page) to the end of the envelope's PDF.
export async function appendToPdf(existing, buf, kind) {
  const out = existing ? await PDFDocument.load(existing) : await PDFDocument.create();
  if (kind === "pdf") {
    let src;
    try { src = await PDFDocument.load(buf); } catch (e) {
      if (/encrypt/i.test(String(e && e.message))) throw new Error("This PDF is password-protected or encrypted. Remove the protection (print it to a new PDF) and upload again.");
      throw new Error("This PDF couldn't be read. Try saving it again as a PDF.");
    }
    if (src.isEncrypted) throw new Error("This PDF is password-protected or encrypted. Remove the protection (print it to a new PDF) and upload again.");
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  } else {
    const img = kind === "png" ? await out.embedPng(buf) : await out.embedJpg(buf);
    const W = 612, H = 792, M = 36, s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height, 1);
    const page = out.addPage([W, H]);
    page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
  }
  const bytes = await out.save();
  return { bytes, sizes: pageSizes(out) };
}
// Displayed size of each page (after rotation), in points, plus its rotation.
export function pageSizes(doc) {
  return doc.getPages().map((p) => {
    const b = p.getCropBox(), r = ((p.getRotation().angle % 360) + 360) % 360;
    return r === 90 || r === 270 ? [round1(b.height), round1(b.width), r] : [round1(b.width), round1(b.height), r];
  });
}
const round1 = (n) => Math.round(n * 10) / 10;

/* ======================= PDF: stamp fields + certificate ======================= */
// Characters the standard Helvetica font can't draw are replaced.
const latin = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const b64bytes = (dataUrl) => { const s = String(dataUrl || "").replace(/^data:image\/png;base64,/, ""); const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
export function pngOk(dataUrl, maxBytes = 300000) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > maxBytes * 1.4) return false;
  try { const b = b64bytes(dataUrl); return b.length > 60 && PNG_MAGIC(b); } catch { return false; }
}
const BLUE = rgb(0.13, 0.32, 0.6), GREY = rgb(0.4, 0.42, 0.45), INK = rgb(0.07, 0.1, 0.18), LINE = rgb(0.8, 0.83, 0.85);

// Maps a point given in the page's displayed frame (points from the top-left, after rotation) to PDF user space.
function mapper(page) {
  const b = page.getCropBox(), r = ((page.getRotation().angle % 360) + 360) % 360, W = b.width, H = b.height;
  const Dw = r === 90 || r === 270 ? H : W, Dh = r === 90 || r === 270 ? W : H;
  const pt = (X, Y) => r === 0 ? { x: b.x + X, y: b.y + H - Y } : r === 90 ? { x: b.x + Y, y: b.y + X } : r === 180 ? { x: b.x + W - X, y: b.y + Y } : { x: b.x + W - Y, y: b.y + H - X };
  return { r, Dw, Dh, pt, rot: degrees(r) };
}
function fitText(font, text, maxW, maxSize) {
  let size = maxSize;
  while (size > 4 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  return size;
}

export async function buildFinal(env, e, recipients, fields, events) {
  const orig = await env.RESUMES.get(e.orig_key);
  if (!orig) throw new Error("The original document is missing from storage.");
  const doc = await PDFDocument.load(await orig.arrayBuffer());
  const helv = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), obl = await doc.embedFont(StandardFonts.HelveticaOblique);
  const byId = Object.fromEntries(recipients.map((r) => [r.id, r]));
  const imgs = {};
  const img = async (r, kind) => {
    const k = r.id + kind, src = kind === "sig" ? r.sig_png : r.init_png || r.sig_png;
    if (!imgs[k] && src) imgs[k] = await doc.embedPng(b64bytes(src));
    return imgs[k];
  };
  const pages = doc.getPages();
  // envelope ID on every page, top left (like a docket stamp)
  for (const p of pages) {
    const m = mapper(p), s = `${BRAND} Envelope ID: ${e.id}`;
    const a = m.pt(14, 12);
    p.drawText(s, { x: a.x, y: a.y, size: 7, font: helv, color: GREY, rotate: m.rot });
  }
  for (const f of fields) {
    const r = byId[f.rcpt_id], page = pages[f.page];
    if (!r || !page || r.status !== "signed") continue;
    const m = mapper(page);
    const X = f.x * m.Dw, Y = f.y * m.Dh, w = f.w * m.Dw, h = f.h * m.Dh;
    const textAt = (s, x, baseY, size, font, color = INK) => { const a = m.pt(x, baseY); page.drawText(latin(s), { x: a.x, y: a.y, size, font, color, rotate: m.rot }); };
    const line = (x1, y1, x2, y2, color = BLUE, t = 0.8) => page.drawLine({ start: m.pt(x1, y1), end: m.pt(x2, y2), thickness: t, color });
    if (f.type === "signature" || f.type === "initials") {
      const im = await img(r, f.type === "signature" ? "sig" : "init");
      if (!im) continue;
      const label = f.type === "signature" ? "eSigned by:" : "", code = shortId(r.id).toUpperCase();
      const top = f.type === "signature" ? Math.min(7, h * 0.2) : 0, bot = f.type === "signature" ? Math.min(6, h * 0.16) : 0;
      if (f.type === "signature") {
        line(X, Y + 1, X, Y + h - 1); line(X, Y + 1, X + 6, Y + 1); line(X, Y + h - 1, X + 6, Y + h - 1);
        textAt(label, X + 4, Y + top - 1, Math.max(4, top - 1.5), helv, BLUE);
        textAt(code, X + 4, Y + h - 1.5, Math.max(4, bot - 1), helv, BLUE);
      }
      const ah = h - top - bot, s = Math.min((w - 6) / im.width, ah / im.height);
      const iw = im.width * s, ih = im.height * s, ix = X + 4, iy = Y + top + (ah - ih) / 2;
      const a = m.pt(ix, iy + ih);
      page.drawImage(im, { x: a.x, y: a.y, width: iw, height: ih, rotate: m.rot });
      continue;
    }
    let val = f.type === "date" ? fmtDate(r.signed_at, r.tz) : f.type === "name" ? r.name : f.type === "email" ? r.email : f.value || "";
    if (f.type === "checkbox") {
      const s = Math.min(w, h);
      line(X, Y, X + s, Y, INK, 0.6); line(X + s, Y, X + s, Y + s, INK, 0.6); line(X + s, Y + s, X, Y + s, INK, 0.6); line(X, Y + s, X, Y, INK, 0.6);
      if (val === "1") { line(X + s * 0.18, Y + s * 0.55, X + s * 0.42, Y + s * 0.8, INK, 1.3); line(X + s * 0.42, Y + s * 0.8, X + s * 0.85, Y + s * 0.2, INK, 1.3); }
      continue;
    }
    val = latin(val);
    if (!val) continue;
    const size = fitText(helv, val, w - 2, Math.min(11, h * 0.72));
    textAt(val, X + 1, Y + h / 2 + size * 0.35, size, helv);
  }
  doc.setTitle(e.title || "Signed document");
  doc.setProducer(BRAND); doc.setCreator(BRAND);
  doc.setSubject(`Envelope ${e.id}`);
  doc.setKeywords([`envelope:${e.id}`, `original-sha256:${e.orig_sha}`]);
  doc.setModificationDate(new Date());
  await drawCertificate(doc, { helv, bold, obl }, env, e, recipients, events, null);
  const finalBytes = await doc.save();

  // the standalone certificate also prints the final document's hash
  const finalSha = await sha256buf(finalBytes);
  const cdoc = await PDFDocument.create();
  const cf = { helv: await cdoc.embedFont(StandardFonts.Helvetica), bold: await cdoc.embedFont(StandardFonts.HelveticaBold), obl: await cdoc.embedFont(StandardFonts.HelveticaOblique) };
  cdoc.setTitle(`Certificate of Completion - ${e.title}`); cdoc.setProducer(BRAND); cdoc.setCreator(BRAND); cdoc.setSubject(`Envelope ${e.id}`);
  await drawCertificate(cdoc, cf, env, e, recipients, events, finalSha);
  const certBytes = await cdoc.save();
  return { finalBytes, finalSha, certBytes, certSha: await sha256buf(certBytes) };
}

export const DISCLOSURE_V = "2026-11-17";
export const DISCLOSURE = [
  ["Electronic Record and Signature Disclosure", ""],
  ["", "Before you sign, please read this disclosure. It explains how you receive documents and sign them electronically through WorkerPool eSign, operated by WorkerPool (Alberta, Canada), on behalf of the person or organization who sent you this document (the sender)."],
  ["Agreeing to do business electronically", "By selecting the checkbox and continuing, you agree that the sender may give you this document, and any notices or disclosures relating to it, electronically, and that your electronic signature is the legal equivalent of your handwritten signature and binds you just as a signature on paper would (Canada: PIPEDA Part 2 and provincial electronic transactions laws, such as Alberta's Electronic Transactions Act)."],
  ["Getting paper copies", "You can download and print the document during signing and after it is completed (a copy is emailed to you). You can also ask the sender for a paper copy at any time."],
  ["Withdrawing your consent", "You can withdraw your consent to receive documents electronically before signing by selecting Decline to sign, or by telling the sender. Withdrawing consent doesn't affect documents you already signed electronically."],
  ["Keeping your email address current", "Tell the sender if your email address changes so that you keep receiving notices."],
  ["What you need", "A device with an up-to-date web browser (Chrome, Edge, Safari or Firefox), access to the email address this request was sent to, and the ability to view or print PDF files."],
  ["How we confirm it is you", "We email a one-time code to your address before you can see or sign the document. The sender may also have given you an access code. We record the date, time, IP address and approximate location of every action, and keep that record with the completed document in a Certificate of Completion."],
];

async function drawCertificate(doc, F, env, e, recipients, events, finalSha) {
  const W = 612, H = 792, M = 42, startIdx = doc.getPageCount();
  let page, y;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M;
    page.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: rgb(0.14, 0.32, 0.29) });
    page.drawText(BRAND, { x: M, y: H - 20, size: 10, font: F.bold, color: rgb(1, 1, 1) });
    page.drawText(latin(`Envelope ID: ${e.id}`), { x: W - M - F.helv.widthOfTextAtSize(`Envelope ID: ${e.id}`, 8), y: H - 19, size: 8, font: F.helv, color: rgb(1, 1, 1) });
    y = H - 54; };
  const need = (h) => { if (y - h < M + 20) newPage(); };
  const wrap = (text, font, size, width) => {
    const out = [];
    for (const para of latin(text).split(/\n/)) {
      let ln = "";
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const t = ln ? ln + " " + word : word;
        if (font.widthOfTextAtSize(t, size) > width && ln) { out.push(ln); ln = word; }
        else ln = t;
        while (font.widthOfTextAtSize(ln, size) > width && ln.length > 8) { let k = ln.length; while (k > 1 && font.widthOfTextAtSize(ln.slice(0, k), size) > width) k--; out.push(ln.slice(0, k)); ln = ln.slice(k); }
      }
      out.push(ln);
    }
    return out;
  };
  const para = (text, { size = 8.5, font = F.helv, x = M, width = W - 2 * M, color = INK, gap = 2 } = {}) => {
    for (const l of wrap(text, font, size, width)) { need(size + 3); page.drawText(l, { x, y: y - size, size, font, color }); y -= size + 3; }
    y -= gap;
  };
  const heading = (t) => { need(30); y -= 8; page.drawText(latin(t), { x: M, y: y - 11, size: 11, font: F.bold, color: rgb(0.14, 0.32, 0.29) });
    page.drawLine({ start: { x: M, y: y - 15 }, end: { x: W - M, y: y - 15 }, thickness: 0.8, color: rgb(0.14, 0.32, 0.29) }); y -= 22; };
  const kv = (rows, colW = 150) => {
    for (const [k, v] of rows) {
      const L = wrap(k, F.helv, 8.5, colW - 8), R = wrap(v, F.bold, 8.5, W - 2 * M - colW), n = Math.max(L.length, R.length);
      need(n * 11.5 + 2);
      for (let i = 0; i < n; i++) { if (L[i]) page.drawText(L[i], { x: M, y: y - 8.5, size: 8.5, font: F.helv, color: GREY }); if (R[i]) page.drawText(R[i], { x: M + colW, y: y - 8.5, size: 8.5, font: F.bold, color: INK }); y -= 11.5; }
      y -= 2;
    }
  };
  newPage();
  page.drawText("Certificate of Completion", { x: M, y: y - 20, size: 20, font: F.bold, color: INK }); y -= 30;
  para(`This certificate is part of the signed document. It records who signed, how each signer was identified, and when and where every action took place. All times are ${e.tzLabel || "Mountain Time (America/Edmonton)"}.`, { size: 8.5, color: GREY });

  const signers = recipients.filter((r) => r.role === "signer"), ccs = recipients.filter((r) => r.role === "cc");
  heading("Envelope summary");
  kv([
    ["Envelope ID", e.id],
    ["Subject", e.title || ""],
    ["Document(s)", parse(e.orig_names, []).join(", ") || "Document"],
    ["Pages", `${e.pages} (plus this certificate)`],
    ["Signers", `${signers.length}`],
    ["Signatures / initials", `${e._sigCount || 0} / ${e._initCount || 0}`],
    ["Envelope originator", `${e.owner_name || "WorkerPool"} <${e.owner_email || ""}>${e.owner_ip ? `   IP address: ${e.owner_ip}` : ""}`],
    ["Routing", e.seq ? "Sequential (in signing order)" : "Parallel (all signers at once)"],
    ["Status", "Completed"],
    ["Sent", fmtTime(e.sent_at)],
    ["Completed", fmtTime(e.completed_at)],
  ]);

  heading("Document integrity");
  kv([
    ["Original document SHA-256", e.orig_sha || ""],
    ...(finalSha ? [["Signed document SHA-256", finalSha]] : []),
    ["Audit trail hash (SHA-256 chain)", e.last_hash || ""],
    ["Verify", `${SITE(env)}/esign/verify/  (upload the signed PDF, or enter the envelope ID)`],
  ]);
  para("The audit trail is a hash chain: each event's hash includes the previous one, so changing or removing any event changes the final hash. Any change to the signed PDF changes its SHA-256 and fails verification.", { size: 7.5, color: GREY });

  heading("Signer events");
  for (const r of signers) {
    const block = 120;
    need(block);
    const top = y;
    page.drawText(latin(r.name), { x: M, y: y - 9, size: 9.5, font: F.bold, color: INK });
    page.drawText(latin(r.email), { x: M, y: y - 21, size: 8.5, font: F.helv, color: GREY });
    page.drawText(latin(`Signing order: ${r.ord}`), { x: M, y: y - 32, size: 8, font: F.helv, color: GREY });
    // signature box
    const sx = M + 170, sw = 150, sh = 44;
    page.drawRectangle({ x: sx, y: y - sh - 2, width: sw, height: sh, borderColor: LINE, borderWidth: 0.6 });
    if (r.sig_png) {
      const im = await doc.embedPng(b64bytes(r.sig_png)); const s = Math.min((sw - 10) / im.width, (sh - 8) / im.height);
      page.drawImage(im, { x: sx + (sw - im.width * s) / 2, y: y - sh - 2 + (sh - im.height * s) / 2, width: im.width * s, height: im.height * s });
    }
    page.drawText(latin(`Signature adoption: ${r.sig_kind === "typed" ? "Typed and pre-selected style" : "Drawn on device"}`), { x: sx, y: y - sh - 12, size: 7, font: F.helv, color: GREY });
    page.drawText(latin(`Signature ID: ${r.id.toUpperCase()}`), { x: sx, y: y - sh - 21, size: 7, font: F.helv, color: GREY });
    const tx = M + 340, rows = [
      ["Sent", fmtTime(r.sent_at)], ["Viewed", fmtTime(r.viewed_at)], ["Identity confirmed", fmtTime(r.verified_at)], ["Signed", fmtTime(r.signed_at)],
    ];
    let yy = y;
    for (const [k, v] of rows) { page.drawText(latin(k), { x: tx, y: yy - 8, size: 7.5, font: F.helv, color: GREY }); page.drawText(latin(v), { x: tx + 62, y: yy - 8, size: 7.5, font: F.bold, color: INK }); yy -= 11; }
    y = Math.min(y - sh - 26, yy - 4);
    kv([
      ["Authentication", `Email one-time code sent to ${r.email} (verified ${fmtTime(r.verified_at)})${r.access_hash ? "; access code set by sender (verified)" : ""}`],
      ["Using IP address", r.ip || ""],
      ["Location (approximate)", r.geo || "Not available"],
      ["Device / browser", (r.ua || "").slice(0, 160)],
      ["Electronic Record and Signature Disclosure", `Accepted ${fmtTime(r.consent_at)} (version ${DISCLOSURE_V})`],
    ], 150);
    page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.4, color: LINE });
    y -= 6;
    void top;
  }
  if (ccs.length) {
    heading("Carbon copy events");
    for (const r of ccs) kv([[latin(r.name), `${r.email} - receives the completed document${r.sent_at ? ` (sent ${fmtTime(r.sent_at)})` : ""}`]]);
  }

  heading("Audit trail");
  const cols = [M, M + 108, M + 250, M + 420];
  need(14);
  ["Time", "Action", "By", "IP address / location"].forEach((t, i) => page.drawText(t, { x: cols[i], y: y - 8, size: 7.5, font: F.bold, color: GREY }));
  y -= 13;
  for (const ev of events) {
    const A = wrap(ev.action + (ev.detail ? ` - ${ev.detail}` : ""), F.bold, 7.5, 136), B = wrap(ev.actor || "", F.helv, 7.5, 164), C = wrap([ev.ip, ev.geo].filter(Boolean).join(" · "), F.helv, 7.5, W - M - cols[3]);
    const n = Math.max(1, A.length, B.length, C.length);
    need(n * 10 + 3);
    page.drawText(latin(fmtTime(ev.at)), { x: cols[0], y: y - 7.5, size: 7, font: F.helv, color: INK });
    for (let i = 0; i < n; i++) {
      if (A[i]) page.drawText(A[i], { x: cols[1], y: y - 7.5 - i * 10, size: 7.5, font: i ? F.helv : F.bold, color: INK });
      if (B[i]) page.drawText(B[i], { x: cols[2], y: y - 7.5 - i * 10, size: 7.5, font: F.helv, color: INK });
      if (C[i]) page.drawText(C[i], { x: cols[3], y: y - 7.5 - i * 10, size: 7.5, font: F.helv, color: GREY });
    }
    y -= n * 10 + 3;
  }

  newPage();
  for (const [h, t] of DISCLOSURE) {
    if (!t) { page.drawText(h, { x: M, y: y - 16, size: 15, font: F.bold, color: INK }); y -= 26; continue; }
    if (h) { need(20); page.drawText(latin(h), { x: M, y: y - 10, size: 10, font: F.bold, color: INK }); y -= 15; }
    para(t, { size: 9, gap: 6 });
  }
  para(`Version ${DISCLOSURE_V}. Each signer accepted this disclosure before signing (see Signer events).`, { size: 7.5, color: GREY });

  // page footers on certificate pages
  const certPages = doc.getPages().slice(startIdx);
  certPages.forEach((p, i) => p.drawText(latin(`Certificate of Completion · page ${i + 1} of ${certPages.length} · ${e.id}`), { x: M, y: 22, size: 7, font: F.helv, color: GREY }));
}

// Runs when the last signer finishes: builds and stores the final PDF and certificate, then emails everyone.
export async function complete(env, e, request) {
  const recipients = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1 ORDER BY ord, rowid`).bind(e.id).all()).results;
  const fields = (await env.DB.prepare(`SELECT * FROM esign_fields WHERE env_id = ?1`).bind(e.id).all()).results;
  if (!e.completed_at) {
    e.completed_at = now();
    await env.DB.prepare(`UPDATE esign_envelopes SET status = 'completed', completed_at = ?1, ended_at = ?1 WHERE id = ?2`).bind(e.completed_at, e.id).run();
    await logEvent(env, e, { actor: BRAND, action: "Envelope completed", detail: "All signers finished", request: null });
  }
  e.status = "completed";
  const events = (await env.DB.prepare(`SELECT * FROM esign_events WHERE env_id = ?1 ORDER BY id`).bind(e.id).all()).results;
  const fresh = await env.DB.prepare(`SELECT * FROM esign_envelopes WHERE id = ?1`).bind(e.id).first();
  Object.assign(e, fresh);
  e._sigCount = fields.filter((f) => f.type === "signature").length; e._initCount = fields.filter((f) => f.type === "initials").length;
  let built;
  try { built = await buildFinal(env, e, recipients, fields, events); }
  catch (err) {
    console.error("esign final", e.id, err);
    await env.DB.prepare(`UPDATE esign_envelopes SET final_error = ?1 WHERE id = ?2`).bind(String(err && err.message || err).slice(0, 300), e.id).run();
    await mail(env, { to: env.ADMIN_EMAIL, subject: `eSign: couldn't build the final PDF for ${e.title}`, text: `Envelope ${e.id} is signed by everyone but the final PDF failed: ${err && err.message}\nOpen admin → eSign and press "Rebuild final PDF".` });
    return false;
  }
  const fk = `esign/${e.id}/signed.pdf`, ck = `esign/${e.id}/certificate.pdf`;
  await env.RESUMES.put(fk, built.finalBytes, { httpMetadata: { contentType: "application/pdf" } });
  await env.RESUMES.put(ck, built.certBytes, { httpMetadata: { contentType: "application/pdf" } });
  const seal = await hmac(env, ["seal", e.id, e.orig_sha, built.finalSha, built.certSha, e.last_hash].join("|"));
  await env.DB.prepare(`UPDATE esign_envelopes SET final_key = ?1, final_sha = ?2, final_size = ?3, cert_key = ?4, cert_sha = ?5, seal = ?6, final_error = NULL WHERE id = ?7`)
    .bind(fk, built.finalSha, built.finalBytes.byteLength, ck, built.certSha, seal, e.id).run();
  Object.assign(e, { final_key: fk, final_sha: built.finalSha, cert_key: ck, seal });
  await sendCompleted(env, e, recipients, built.finalBytes);
  return true;
}

const toB64 = (bytes) => { let s = ""; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode(...bytes.subarray(i, i + c)); return btoa(s); };
const safeName = (t) => (latin(t).replace(/[^\w .()-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "document");
export async function sendCompleted(env, e, recipients, finalBytes) {
  const attach = finalBytes && finalBytes.byteLength < 9 * 1024 * 1024 ? [{ filename: `${safeName(e.title)} (signed).pdf`, content: toB64(finalBytes) }] : [];
  const from = e.owner_name || "WorkerPool";
  const people = [...recipients.filter((r) => r.role === "signer" || r.role === "cc").map((r) => ({ r })), ...(e.owner_email ? [{ owner: true, email: e.owner_email, name: e.owner_name }] : [])];
  const seen = new Set();
  for (const p of people) {
    const email = (p.r ? p.r.email : p.email || "").toLowerCase();
    if (!email || seen.has(email)) continue; seen.add(email);
    const link = p.owner ? `${SITE(env)}${e.owner === "admin" ? "/admin/" : "/esign/"}` : await signLink(env, p.r);
    const lines = [`All parties have signed <b>${escH(e.title)}</b>.`, attach.length ? "The completed document, with its Certificate of Completion, is attached." : "The completed document is too large to attach; open it with the button below.", `Envelope ID: ${e.id}`];
    await mail(env, { to: email, subject: `Completed: ${e.title}`, fromName: `${from} via ${BRAND}`, replyTo: e.owner_email, attachments: attach,
      text: `All parties have signed "${e.title}".\n\n${attach.length ? "The completed document with its Certificate of Completion is attached." : "Open the completed document:"}\n${link}\n\nEnvelope ID: ${e.id}\nCheck that a copy is genuine: ${SITE(env)}/esign/verify/`,
      html: emailHtml({ heading: "Your document has been completed", lines, button: "VIEW COMPLETED DOCUMENT", link, foot: [`Check that a copy is genuine and unchanged at ${SITE(env)}/esign/verify/`, ...(p.owner ? [] : [DO_NOT_SHARE])] }) });
    if (p.r && p.r.role === "cc") await env.DB.prepare(`UPDATE esign_recipients SET sent_at = ?1, status = 'completed' WHERE id = ?2`).bind(now(), p.r.id).run();
  }
}

/* ======================= routing ======================= */
// Sends the invite to everyone who should sign now (all signers, or the next signing order) and hasn't been sent one yet.
export async function routeNext(env, e, request) {
  const rs = (await env.DB.prepare(`SELECT * FROM esign_recipients WHERE env_id = ?1 AND role = 'signer' ORDER BY ord`).bind(e.id).all()).results;
  const pending = rs.filter((r) => r.status !== "signed");
  if (!pending.length) return "done";
  const order = e.seq ? Math.min(...pending.map((r) => r.ord)) : null;
  for (const r of pending) {
    if (order !== null && r.ord !== order) continue;
    if (r.status !== "created") continue;
    await env.DB.prepare(`UPDATE esign_recipients SET status = 'sent', sent_at = ?1 WHERE id = ?2`).bind(now(), r.id).run();
    const ok = await sendInvite(env, e, r);
    await logEvent(env, e, { rcpt: r.id, actor: BRAND, action: "Sent to signer", detail: `${r.name} <${r.email}>${ok ? "" : " (email not delivered)"}`, request: null });
  }
  return "routed";
}

/* ======================= subscriptions ======================= */
export const DEFAULT_PLANS = [
  { id: "starter", name: "Starter", blurb: "For individuals: 10 envelopes a month", price_cents: 1500, interval: "month", envelopes: 10, trial_days: 30, card_upfront: 1, sort: 1 },
  { id: "pro", name: "Professional", blurb: "Unlimited envelopes for busy offices", price_cents: 3500, interval: "month", envelopes: 0, trial_days: 30, card_upfront: 1, sort: 2 },
];
export async function plans(env, all = false) {
  let r = (await env.DB.prepare(`SELECT * FROM esign_plans ORDER BY sort, price_cents`).all()).results;
  if (!r.length && !(await setting(env, "plans_seeded"))) {
    for (const p of DEFAULT_PLANS) await env.DB.prepare(`INSERT INTO esign_plans (id, name, blurb, price_cents, interval, envelopes, trial_days, card_upfront, active, sort, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?10)`)
      .bind(p.id, p.name, p.blurb, p.price_cents, p.interval, p.envelopes, p.trial_days, p.card_upfront, p.sort, now()).run();
    await setSetting(env, "plans_seeded", "1");
    r = (await env.DB.prepare(`SELECT * FROM esign_plans ORDER BY sort, price_cents`).all()).results;
  }
  return all ? r : r.filter((p) => p.active);
}
export async function setting(env, k) { const r = await env.DB.prepare(`SELECT v FROM esign_settings WHERE k = ?1`).bind(k).first(); return r ? r.v : null; }
export async function setSetting(env, k, v) { await env.DB.prepare(`INSERT INTO esign_settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, String(v)).run(); }

export const normCode = (c) => String(c || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
export function promoLive(p, planId) {
  if (!p || !p.active) return "That code isn't valid.";
  if (p.expires && p.expires < now().slice(0, 10)) return "That code has expired.";
  if (p.max_uses != null && p.uses >= p.max_uses) return "That code has been fully used.";
  if (p.plan_id && planId && p.plan_id !== planId) return "That code isn't for this plan.";
  return "";
}
export async function findPromo(env, code, planId) {
  code = normCode(code);
  if (!code) return { error: "Enter a code." };
  const p = await env.DB.prepare(`SELECT * FROM esign_promos WHERE code = ?1`).bind(code).first();
  const err = promoLive(p, planId);
  return err ? { error: err } : { promo: p };
}
// An offer applied without a code (e.g. a launch offer), if one is running for this plan.
export async function autoPromo(env, planId) {
  const r = (await env.DB.prepare(`SELECT * FROM esign_promos WHERE auto = 1 AND active = 1 ORDER BY created DESC`).all()).results;
  return r.find((p) => !promoLive(p, planId)) || null;
}
export function promoText(p, plan) {
  if (!p) return "";
  if (p.kind === "free_months") return `${p.value} month${p.value > 1 ? "s" : ""} free`;
  if (p.kind === "free_forever") return "Free access";
  const dur = !p.months ? "on your first payment" : p.months >= 999 ? "for as long as you stay subscribed" : `for ${p.months} month${p.months > 1 ? "s" : ""}`;
  return `${p.value}% off ${dur}`;
}
export function planText(p) {
  const price = "$" + (p.price_cents / 100).toFixed(2) + (p.interval === "year" ? "/year" : "/month");
  return { price: p.price_cents ? price : "Free", envelopes: p.envelopes ? `${p.envelopes} envelopes a ${p.interval === "year" ? "year" : "month"}` : "Unlimited envelopes",
    trial: p.trial_days ? (p.trial_days % 30 === 0 ? `First ${p.trial_days / 30 > 1 ? p.trial_days / 30 + " months" : "month"} free` : `${p.trial_days}-day free trial`) : "" };
}

const ts = (s) => s ? new Date(s * 1000).toISOString() : null;
// Copies a Stripe subscription's state into esign_subs.
export async function syncStripeSub(env, userId, s) {
  const item = s.items && s.items.data && s.items.data[0] || {};
  const ps = ts(s.current_period_start || item.current_period_start), pe = ts(s.current_period_end || item.current_period_end);
  await env.DB.prepare(`UPDATE esign_subs SET status = ?1, stripe_sub = ?2, stripe_customer = COALESCE(?3, stripe_customer), period_start = ?4, period_end = ?5, trial_end = ?6,
      cancel_at_end = ?7, updated = ?8, synced = ?8 WHERE user_id = ?9`)
    .bind(s.status, s.id, typeof s.customer === "string" ? s.customer : s.customer && s.customer.id || null, ps, pe, ts(s.trial_end), s.cancel_at_period_end ? 1 : 0, now(), userId).run();
}
// What a subscriber may do now. { ok, sub, plan, used, limit, reason }
export async function access(env, user, stripeFn) {
  let sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(user.id).first();
  // refresh paid subscriptions from Stripe every 6 hours, or as soon as the period has ended
  if (sub && sub.stripe_sub && env.STRIPE_SECRET_KEY && stripeFn && (!sub.synced || Date.now() - Date.parse(sub.synced) > 6 * 3600e3 || (sub.period_end && sub.period_end < now()))) {
    try { await syncStripeSub(env, user.id, await stripeFn(env, "GET", "subscriptions/" + sub.stripe_sub)); sub = await env.DB.prepare(`SELECT * FROM esign_subs WHERE user_id = ?1`).bind(user.id).first(); }
    catch (e) { console.error("esign sync", e); }
  }
  const allPlans = await plans(env, true);
  const plan = sub && allPlans.find((p) => p.id === sub.plan_id) || null;
  let ok = false, reason = "No subscription yet.";
  if (sub) {
    if (sub.status === "comp") { ok = !sub.comp_until || sub.comp_until >= now().slice(0, 10); reason = ok ? "" : "Your free access has ended."; }
    else if (sub.status === "free") { ok = true; reason = ""; }
    else if (["trialing", "active"].includes(sub.status)) { ok = !sub.period_end || sub.period_end > now(); reason = ok ? "" : "Your subscription period has ended."; }
    else if (sub.status === "past_due") reason = "Your last payment didn't go through. Update your card under Manage billing.";
    else if (sub.status === "canceled") reason = "Your subscription has ended. Subscribe again to send documents.";
    else if (sub.status === "incomplete") reason = "Your subscription payment isn't complete yet.";
    else reason = "Your subscription isn't active.";
  }
  const limit = plan ? plan.envelopes || 0 : 0;
  const since = sub && sub.period_start && ["trialing", "active", "past_due"].includes(sub.status) ? sub.period_start : new Date(Date.now() - (plan && plan.interval === "year" ? 365 : 30) * 864e5).toISOString();
  const used = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM esign_envelopes WHERE owner = ?1 AND sent_at IS NOT NULL AND sent_at >= ?2`).bind(user.id, since).first()).n;
  return { ok, reason, sub, plan, used, limit, since };
}
