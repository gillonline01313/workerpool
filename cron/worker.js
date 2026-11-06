// WorkerPool scheduled jobs (replaces the GitHub Actions timers). One Cloudflare Worker with Cron Triggers:
//   • Latest draws: 8 am, 2 pm and 8 pm Edmonton time, read in batches 5 minutes apart (each batch stays inside
//     Cloudflare's per-run fetch limit). Result goes to D1 (site_data), which the site reads first.
//   • Flight alerts: every 3 hours, asks the site to check saved flight alerts (/api/flights/check).
// Setup (one time): Workers & Pages → Create → Worker → name it workerpool-cron → Deploy → Edit code → paste
// cron/dist/worker.js → Deploy. Settings → Bindings → D1 database: DB = workerpool-db. Settings → Triggers →
// Cron Triggers: add the two schedules below. Optional variable SITE_URL (default https://workerpool.ca).
//   2,7,12,17,22,27 * * * *     draws (runs only at 8:xx, 14:xx, 20:xx Edmonton time; batch = which 5 minutes)
//   17 */3 * * *                 flight alerts
// Build the paste-ready file with: node deploy/build.mjs  (writes cron/dist/worker.js)
import { refreshDraws, AUTO_SOURCE_IDS, BATCH } from "../functions/_drawstore.js";

const DRAW_HOURS = [8, 14, 20];
const site = (env) => env.SITE_URL || "https://workerpool.ca";
const edmontonHour = (d) => parseInt(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", hour: "numeric", hourCycle: "h23" }).format(d));

async function drawsBatch(env, when, force) {
  const d = new Date(when), hour = edmontonHour(d), batch = Math.floor((d.getUTCMinutes() - 2) / 5);
  if (!force && !DRAW_HOURS.includes(hour)) return { skipped: "not a draw hour in Edmonton (" + hour + ":00)" };
  const ids = AUTO_SOURCE_IDS.slice(batch * BATCH, (batch + 1) * BATCH);
  if (!ids.length) return { skipped: "no sources left for batch " + batch };
  const last = (batch + 1) * BATCH >= AUTO_SOURCE_IDS.length;
  // the reader looks up the last saved copy; before the first run that's the file shipped with the site
  const request = new Request(site(env) + "/");
  const env2 = { ...env, ASSETS: env.ASSETS || { fetch: (u) => fetch(u instanceof Request ? u : new URL(String(u), site(env))) } };
  const r = await refreshDraws(env2, request, ids, { full: last });
  return { batch, ids, ok: r.ok, results: (r.sources || []).map((s) => `${s.id}: ${s.ok ? "ok" : s.error}`) };
}
async function flights(env) {
  const r = await fetch(site(env) + "/api/flights/check", { method: "POST", headers: { "user-agent": "WorkerPool flight alerts" } });
  return { status: r.status, body: (await r.text()).slice(0, 300) };
}

export default {
  async scheduled(event, env, ctx) {
    const job = event.cron === "17 */3 * * *" ? flights(env) : drawsBatch(env, event.scheduledTime);
    ctx.waitUntil(job.then((r) => console.log(event.cron, JSON.stringify(r)), (e) => console.error(event.cron, e && e.stack || e)));
  },
  // Visiting the Worker's own address shows what it does; ?run=draws&batch=0&key=ADMIN_KEY runs a batch now (for testing).
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.searchParams.get("key") && env.ADMIN_KEY && u.searchParams.get("key") === env.ADMIN_KEY) {
      if (u.searchParams.get("run") === "flights") return Response.json(await flights(env));
      if (u.searchParams.get("run") === "draws") { const b = parseInt(u.searchParams.get("batch") || "0"); const t = new Date(); t.setUTCMinutes(2 + 5 * b);
        return Response.json(await drawsBatch(env, t.getTime(), true)); }
    }
    return new Response(`WorkerPool scheduled jobs. Draw sources: ${AUTO_SOURCE_IDS.length} in batches of ${BATCH}.`, { headers: { "content-type": "text/plain" } });
  },
};
