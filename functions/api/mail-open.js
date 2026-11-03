// Read receipt for emails sent from the admin Email tab: a 1x1 transparent GIF unique to each email.
// Records the first open, the latest open and how many times it was opened. Always returns the image.
import { ensureMailTables } from "../_mail.js";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const img = () => new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "pragma": "no-cache" } });

export async function onRequestGet({ request, env, waitUntil }) {
  const k = new URL(request.url).searchParams.get("k") || "";
  if (/^[A-Za-z0-9_-]{20,64}$/.test(k) && env.DB) waitUntil(record(env, k, request));
  return img();
}
async function record(env, k, request) {
  try {
    await ensureMailTables(env);
    const m = await env.DB.prepare(`SELECT id FROM email_sent WHERE track = ?1`).bind(k).first();
    if (!m) return;
    const now = new Date().toISOString(), ua = request.headers.get("user-agent") || "", cf = request.cf || {};
    // Gmail and Apple Mail load images through their own servers, so the place shown is theirs, not the reader's.
    const via = /GoogleImageProxy/i.test(ua) ? "Gmail" : /YahooMailProxy/i.test(ua) ? "Yahoo Mail" : /Outlook|Microsoft/i.test(ua) ? "Outlook" : "";
    await env.DB.prepare(`UPDATE email_sent SET opened_at = COALESCE(opened_at, ?1), last_open = ?1, opens = COALESCE(opens, 0) + 1 WHERE id = ?2`).bind(now, m.id).run();
    await env.DB.prepare(`INSERT INTO email_events (sent_id, t, type, detail) VALUES (?1, ?2, 'opened', ?3)`)
      .bind(m.id, now, [via && "via " + via, [cf.city, cf.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || null).run();
  } catch {}
}
