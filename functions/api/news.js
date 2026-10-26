// Public "Hot & New" ticker feed. GET lists live items; POST {id} counts a click (used to rank trending items).
import { json, readJson, str } from "../_lib.js";
import { NEWS_SEED, rankNews } from "../_news.js";

export async function onRequestGet({ env }) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await env.DB.prepare(
      `SELECT * FROM news WHERE status = 'live' AND (expires IS NULL OR expires = '' OR expires >= ?1) ORDER BY created DESC LIMIT 60`
    ).bind(today).all();
    const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM news`).first();
    // Nothing saved yet: show the starter items so the ticker is never empty on day one.
    if (!total || !total.n) return feed(seedRows());
    return feed(rankNews(r.results));
  } catch {
    return feed(seedRows()); // news table not created yet
  }
}

export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 500);
  const nid = b && str(b.id, 64);
  if (!nid || nid.startsWith("seed-")) return json({ ok: true });
  try { await env.DB.prepare(`UPDATE news SET clicks = clicks + 1 WHERE id = ?1 AND status = 'live'`).bind(nid).run(); } catch {}
  return json({ ok: true });
}

function seedRows() {
  return NEWS_SEED.map((s, i) => ({ id: "seed-" + i, title: s.title, summary: s.summary, tag: s.tag, link: s.link, pinned: !!s.pinned, created: "2026-10-25T00:00:00Z", trending: false }));
}
function feed(items) {
  return new Response(JSON.stringify({ ok: true, items }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
  });
}
