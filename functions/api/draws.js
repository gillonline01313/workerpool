// Public "Latest draws" feed for the home page. Official sources only; see scripts/draws/fetch.mjs.
import { autoDraws, edits, merge, JUR } from "../_draws.js";
export async function onRequestGet({ request, env }) {
  const days = Math.min(430, Math.max(7, parseInt(new URL(request.url).searchParams.get("days")) || 120));
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const auto = await autoDraws(request, env);
  const draws = merge(auto, await edits(env), false).filter((d) => d.date >= since)
    .map(({ id, jur, prov, program, date, stream, invites, score, scoreLabel, note, source, pinned, first }) => ({ id, jur, prov: prov || null, program, date, stream, invites, score, scoreLabel, note, source, pinned: !!pinned, first }));
  return new Response(JSON.stringify({ ok: true, checked: auto.checked, updated: auto.updated, jur: JUR, draws,
    sources: (auto.sources || []).map(({ id, jur, prov, pilot, program, name, url, manual, latest, status, statusChecked, changed }) => ({ id, jur, prov: prov || null, pilot: pilot || null, program, name, url, manual, latest: latest || null, status: status || null, statusChecked: statusChecked || null, changed: changed || null })) }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
