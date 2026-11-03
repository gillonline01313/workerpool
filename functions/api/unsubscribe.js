// Unsubscribe from admin emails. GET shows a confirm button (so mail scanners that open links
// don't unsubscribe people by accident); POST unsubscribes (the button, and Gmail/Yahoo one-click).
import { isEmail } from "../_lib.js";
import { ensureMailTables, unsubToken } from "../_mail.js";

const page = (title, msg, form = "") => new Response(`<!doctype html><html lang="en-CA"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · WorkerPool</title>
<style>body{margin:0;background:#f3f6f5;color:#1b2628;font:16px/1.5 Segoe UI,system-ui,sans-serif}
main{max-width:440px;margin:12vh auto;background:#fff;border:1px solid #d3dcda;border-radius:16px;padding:28px;margin-inline:16px}
@media(min-width:480px){main{margin-inline:auto}}h1{font-size:1.3rem;margin:0 0 8px}p{color:#5a696b;margin:0 0 16px}
button{font:inherit;font-weight:600;padding:11px 18px;border-radius:999px;border:1px solid #3f7a72;background:#3f7a72;color:#fff;cursor:pointer}
a{color:#3f7a72}</style></head><body><main><h1>${title}</h1><p>${msg}</p>${form}<p style="margin:16px 0 0;font-size:.85rem"><a href="/">workerpool.ca</a></p></main></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

async function check(request, env) {
  const url = new URL(request.url);
  const email = String(url.searchParams.get("e") || "").trim().toLowerCase(), t = url.searchParams.get("t") || "";
  if (!isEmail(email) || t !== (await unsubToken(env, email))) return null;
  return email;
}
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function onRequestGet({ request, env }) {
  const email = await check(request, env);
  if (!email) return page("Link not valid", "This unsubscribe link is incomplete. Reply to any of our emails with the word unsubscribe and we'll take you off the list.");
  return page("Unsubscribe?", `Stop emails from WorkerPool to <b>${escH(email)}</b>? You'll still get messages you ask for, like password resets.`,
    `<form method="post"><button type="submit">Unsubscribe</button></form>`);
}
export async function onRequestPost({ request, env }) {
  const email = await check(request, env);
  if (!email) return page("Link not valid", "This unsubscribe link is incomplete. Reply to any of our emails with the word unsubscribe.");
  await ensureMailTables(env);
  await env.DB.prepare(`INSERT INTO email_unsubs (email, t) VALUES (?1, ?2) ON CONFLICT(email) DO NOTHING`).bind(email, new Date().toISOString()).run();
  return page("You're unsubscribed", `We won't send any more updates to <b>${escH(email)}</b>.`);
}
