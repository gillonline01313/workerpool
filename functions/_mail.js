// Email to people who signed up (admin → Email tab). Sends through Resend from info@workerpool.ca.
// Inbox delivery: the workerpool.ca domain must be verified in Resend (SPF + DKIM, same as noreply@),
// every message has a plain-text and HTML part, a working unsubscribe link and one-click
// List-Unsubscribe headers (Gmail / Yahoo bulk-sender rules), and replies go to info@workerpool.ca.
import { isEmail, sha256hex } from "./_lib.js";

export const FROM = (env) => env.BULK_FROM || "WorkerPool <info@workerpool.ca>";
const addr = (from) => ((from.match(/<([^>]+)>/) || [])[1] || from).trim();
export const MAX_RECIPIENTS = 4000;

export async function ensureMailTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_unsubs (email TEXT PRIMARY KEY, t TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_campaigns (id TEXT PRIMARY KEY, created TEXT NOT NULL, subject TEXT, body TEXT,
    audience TEXT, total INTEGER DEFAULT 0, sent INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, skipped INTEGER DEFAULT 0, error TEXT)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_templates (id TEXT PRIMARY KEY, label TEXT NOT NULL, subject TEXT, body TEXT, updated TEXT)`).run();
}

// Who can be emailed, by group. Each query is optional: a missing table just gives an empty group.
export const GROUPS = [
  ["accounts", "All accounts", `SELECT email, name FROM users`],
  ["submitted", "Submitted the questionnaire", `SELECT u.email, u.name FROM users u WHERE EXISTS (SELECT 1 FROM submissions s WHERE s.email = u.email)
     UNION SELECT email, name FROM submissions`],
  ["unfinished", "Started, didn't submit", `SELECT u.email, u.name FROM users u WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.email = u.email)`],
  ["marketing", "Agreed to updates (questionnaire)", `SELECT email, name FROM submissions WHERE consent_mkt = 1`],
  ["forum", "Forum members", `SELECT u.email, COALESCE(u.name, f.username) AS name FROM forum_users f JOIN users u ON u.id = f.user_id WHERE COALESCE(f.banned, 0) = 0`],
  ["students", "Student Pool", `SELECT email, name FROM student_profiles`],
  ["b2b", "B2B clients", `SELECT DISTINCT u.email, u.name FROM applications a JOIN users u ON u.id = a.user_id`],
  ["interest", "Employer / partner interest", `SELECT email, business AS name FROM interest`],
];

// Returns { people: [{ email, name, groups: [] }], unsubs: Set }
export async function audience(env) {
  const map = new Map();
  for (const [key, , sql] of GROUPS) {
    let rows = [];
    try { rows = (await env.DB.prepare(sql + " LIMIT 20000").all()).results || []; } catch { continue; }
    for (const r of rows) {
      const email = String(r.email || "").trim().toLowerCase();
      if (!isEmail(email)) continue;
      const p = map.get(email) || { email, name: "", groups: [] };
      if (!p.name && r.name) p.name = String(r.name).trim().slice(0, 80);
      if (!p.groups.includes(key)) p.groups.push(key);
      map.set(email, p);
    }
  }
  await ensureMailTables(env);
  const u = (await env.DB.prepare(`SELECT email FROM email_unsubs`).all()).results || [];
  return { people: [...map.values()], unsubs: new Set(u.map((x) => x.email)) };
}

/* ---------- unsubscribe links (signed, so nobody can unsubscribe someone else by guessing) ---------- */
export async function unsubToken(env, email) {
  return (await sha256hex(`unsub:${env.MAIL_SECRET || env.ADMIN_KEY || ""}:${email.toLowerCase()}`)).slice(0, 32);
}
export async function unsubUrl(env, email) {
  return `${env.SITE_URL || "https://workerpool.ca"}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${await unsubToken(env, email)}`;
}

/* ---------- message body ---------- */
const escH = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "there";
export const cleanSender = (n) => String(n || "").replace(/[^\p{L} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
export const personalize = (s, p, sender = "") => String(s).replace(/\{\s*(first_?name|name)\s*\}/gi, firstName(p.name))
  .replace(/\{\s*sender\s*\}/gi, cleanSender(sender).split(" ")[0] || "the WorkerPool team");

// One-to-one style: looks like an ordinary email typed by a person. No banner, no card, no bulk footer;
// signed by the care team member. Unsubscribe still works through the List-Unsubscribe headers.
export function renderPersonal(env, body, p, sender) {
  const name = cleanSender(sender), site = (env.SITE_URL || "https://workerpool.ca").replace(/^https:\/\//, "");
  const sig = [name, "Care Team, WorkerPool", `${site} | ${addr(FROM(env))}`].filter(Boolean);
  const text = `${personalize(body, p, name)}\n${sig.join("\n")}`;
  const paras = escH(personalize(body, p, name)).split(/\n{2,}/).map((para) =>
    `<p style="margin:0 0 12px">${para.replace(/\n/g, "<br>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`).join("");
  const html = `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${paras}` +
    `<p style="margin:0">${sig.map((l, i) => (i === 0 ? `<b>${escH(l)}</b>` : `<span style="color:#666">${escH(l)}</span>`)).join("<br>")}</p></div></body></html>`;
  return { text, html };
}

export function renderMessage(env, body, p, unsub) {
  const text = personalize(body, p);
  const footer = `You're getting this because you signed up at workerpool.ca.` +
    (env.MAIL_ADDRESS ? ` WorkerPool, ${env.MAIL_ADDRESS}.` : ` WorkerPool, Alberta, Canada.`);
  const plain = `${text}\n\n--\n${footer}\nReply to this email to reach us at ${addr(FROM(env))}.\nUnsubscribe: ${unsub}`;
  const paras = escH(text).split(/\n{2,}/).map((para) =>
    `<p style="margin:0 0 14px">${para.replace(/\n/g, "<br>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#3f7a72">$1</a>')}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f6f5">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1b2628">
<div style="background:#ffffff;border:1px solid #d3dcda;border-radius:12px;padding:24px">
<div style="font-weight:700;font-size:18px;color:#3f7a72;margin-bottom:16px">WorkerPool</div>${paras}</div>
<p style="font-size:12px;color:#5a696b;margin:16px 4px 0">${escH(footer)} Reply to this email to reach us.<br>
<a href="${escH(unsub)}" style="color:#5a696b">Unsubscribe</a></p></div></body></html>`;
  return { text: plain, html };
}

/* ---------- sending ---------- */
// Resend batch API: up to 100 emails per call. Paced under Resend's default 2 requests/second.
export async function sendBatch(env, messages) {
  let sent = 0, failed = 0, error = "";
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (r.ok) sent += chunk.length;
      else { failed += chunk.length; error = error || (await r.text()).slice(0, 300); }
    } catch (e) { failed += chunk.length; error = error || String(e).slice(0, 300); }
    if (i + 100 < messages.length) await new Promise((res) => setTimeout(res, 700));
  }
  return { sent, failed, error };
}

// opts.style: "personal" (signed by opts.sender, plain look) or "newsletter" (branded, with footer).
export async function buildMessage(env, p, subject, body, opts = {}) {
  const sender = opts.style === "personal" ? cleanSender(opts.sender) : "";
  const base = FROM(env), unsub = await unsubUrl(env, p.email);
  const from = sender ? `${sender} from WorkerPool <${addr(base)}>` : base;
  const { text, html } = sender ? renderPersonal(env, body, p, sender) : renderMessage(env, body, p, unsub);
  return {
    from, to: [p.email], reply_to: env.BULK_REPLY_TO || addr(base), subject: personalize(subject, p, sender), text, html,
    headers: { "List-Unsubscribe": `<${unsub}>, <mailto:${addr(from)}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
