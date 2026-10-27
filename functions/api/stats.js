// Public visitor counts for the home page: unique visitors (one per browser) today, this week (from Monday),
// this month and since launch, in Edmonton time, plus how many are on the site right now (active in the
// last 5 minutes). Cached for 60 seconds so the counter never puts load on the database.
import { json } from "../_lib.js";
const TZ = "America/Edmonton";

function startOf(now, unit) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  let y = +parts.year, m = +parts.month, d = +parts.day;
  if (unit === "week") { const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday); const t = new Date(Date.UTC(y, m - 1, d - back)); y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate(); }
  if (unit === "month") d = 1;
  // local midnight → UTC, using Edmonton's offset on that day
  const guess = new Date(Date.UTC(y, m - 1, d, 12));
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(guess).find((p) => p.type === "timeZoneName").value; // "GMT-06:00"
  const mm = off.match(/([+-])(\d{2}):?(\d{2})?/), mins = mm ? (mm[1] === "-" ? -1 : 1) * (+mm[2] * 60 + +(mm[3] || 0)) : 0;
  return new Date(Date.UTC(y, m - 1, d) - mins * 60000).toISOString();
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default, key = new Request(new URL("/api/stats?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const now = new Date();
  const r = await env.DB.prepare(
    `SELECT COUNT(DISTINCT CASE WHEN t >= ?1 THEN vid END) AS today,
            COUNT(DISTINCT CASE WHEN t >= ?2 THEN vid END) AS week,
            COUNT(DISTINCT CASE WHEN t >= ?3 THEN vid END) AS month,
            COUNT(DISTINCT CASE WHEN t >= ?4 THEN vid END) AS now,
            COUNT(DISTINCT vid) AS total, MIN(t) AS since
     FROM visits WHERE page IS NULL OR page <> 'admin'`
  ).bind(startOf(now, "day"), startOf(now, "week"), startOf(now, "month"), new Date(now.getTime() - 5 * 60000).toISOString()).first();
  const res = new Response(JSON.stringify({ ok: true, today: r.today || 0, week: r.week || 0, month: r.month || 0, now: Math.max(1, r.now || 0), total: r.total || 0, since: r.since, at: now.toISOString() }),
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
