// Latest draws = the automatic list (data/draws.json, refreshed 3x a day from official pages) + admin changes in D1.
// draw_edits.kind: "edit" (fields replace the automatic ones), "hide" (removed from the site), "add" (a draw entered by hand).
export const JUR = { CA: "Federal", BC: "British Columbia", AB: "Alberta", SK: "Saskatchewan", MB: "Manitoba", ON: "Ontario", QC: "Québec",
  NB: "New Brunswick", NS: "Nova Scotia", PE: "Prince Edward Island", NL: "Newfoundland and Labrador", YT: "Yukon", NT: "Northwest Territories (Yellowknife)", RCIP: "RCIP / FCIP communities" };
export const FIELDS = ["jur", "program", "date", "stream", "invites", "score", "scoreLabel", "note", "source", "pinned"];

// Two copies can exist: data/draws.json (written by the GitHub Actions reader and shipped with the site) and the copy in
// D1 (written by "Refresh now" or the Cloudflare scheduled Worker, see _drawstore.js). The most recently read one wins.
const stamp = (d) => [d && d.checked, d && d.refreshed].filter(Boolean).sort().pop() || "";
export async function autoDraws(request, env) {
  let d1 = null, file = null;
  try { const r = await env.DB.prepare(`SELECT v FROM site_data WHERE k = 'draws'`).first(); if (r && r.v) d1 = JSON.parse(r.v); } catch {}
  try { const r = await env.ASSETS.fetch(new URL("/data/draws.json", request.url)); if (r.ok) file = await r.json(); } catch {}
  if (d1 && file) return stamp(d1) >= stamp(file) ? d1 : file;
  return d1 || file || { draws: [], sources: [], updated: null, checked: null };
}
export async function edits(env) {
  try { return (await env.DB.prepare(`SELECT * FROM draw_edits`).all()).results; } catch { return null; } // null: table not created yet
}
// Returns every draw with its origin: auto | edited | manual, plus hidden ones when withHidden.
export function merge(auto, rows, withHidden) {
  const ed = new Map((rows || []).map((e) => [e.id, { ...e, data: safe(e.data) }]));
  const out = [];
  for (const d of auto.draws || []) {
    const e = ed.get(d.id);
    if (e && e.kind === "hide") { if (withHidden) out.push({ ...d, ...(e.data || {}), origin: "hidden", edited: e.updated }); continue; }
    if (e && e.kind === "edit") out.push({ ...d, ...e.data, id: d.id, origin: "edited", edited: e.updated, auto: d });
    else out.push({ ...d, origin: "auto" });
  }
  for (const e of ed.values()) if (e.kind === "add" || (e.kind === "hide" && e.data && e.data.manual)) {
    if (e.kind === "hide" && !withHidden) continue;
    out.push({ ...e.data, id: e.id, origin: e.kind === "add" ? "manual" : "hidden", edited: e.updated });
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(a.program).localeCompare(String(b.program)));
}
const safe = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
