// Latest draws inside Cloudflare (no GitHub): the official-page reader (scripts/draws/core.mjs) runs here, from the
// admin "Refresh now" button and from the scheduled Worker in cron/, and keeps its result in D1 (site_data, k = 'draws').
// _draws.js → autoDraws() reads that copy first and falls back to data/draws.json shipped with the site.
import { runDraws, AUTO_SOURCE_IDS } from "../scripts/draws/core.mjs";
import { NET } from "../scripts/draws/lib.mjs";
import { autoDraws } from "./_draws.js";

export { AUTO_SOURCE_IDS };
export const BATCH = 6;   // sources read per request: keeps each run inside Cloudflare's per-request fetch limit

export async function ensureSiteData(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_data (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated TEXT)`).run();
}
// ids: source ids to re-read (at most BATCH). full: this batch finishes a scheduled run of every source.
export async function refreshDraws(env, request, ids, { full = false } = {}) {
  await ensureSiteData(env);
  Object.assign(NET, { tries: 2, wait: 1500, timeout: 25000 });
  const want = ids.filter((x) => AUTO_SOURCE_IDS.includes(x)).slice(0, BATCH);
  if (!want.length) return { ok: false, error: "No sources to read." };
  const old = await autoDraws(request, env);
  const { out, sources } = await runDraws(old, { only: want });
  if (full) { out.checked = new Date().toISOString(); delete out.refreshed; delete out.refreshedOnly; }
  await env.DB.prepare(`INSERT OR REPLACE INTO site_data (k, v, updated) VALUES ('draws', ?1, ?2)`).bind(JSON.stringify(out), new Date().toISOString()).run();
  return { ok: true, sources: sources.filter((s) => want.includes(s.id)), total: out.draws.length };
}
