// Document requests: the team asks a client for particular documents on one intake. Each request has its own secure
// link (/intake/?r=TOKEN) that opens without signing in and only accepts uploads for the documents asked for. The
// files land on the intake like any other upload, so they appear under the form's documents and in the complete file.
import { formOf, requestDocs } from "../assets/intake-config.js";

export const REQ_DAYS = 30;
const items = (s) => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
// "expired" is worked out on read, so a request needs no clean-up job.
const live = (q) => ({ ...q, items: items(q.items), status: q.status === "open" && q.expires && Date.parse(q.expires) < Date.now() ? "expired" : q.status });

export async function loadRequests(env, intakeId) {
  const r = await env.DB.prepare(`SELECT * FROM intake_requests WHERE intake_id = ?1 ORDER BY created DESC LIMIT 50`).bind(intakeId).all();
  return r.results.map(live);
}
export async function requestByToken(env, token) {
  const t = String(token || "").trim();
  if (t.length < 20 || t.length > 80) return null;
  const q = await env.DB.prepare(`SELECT * FROM intake_requests WHERE token = ?1`).bind(t).first();
  return q ? live(q) : null;
}
// The intake's own form version, with any custom documents the team requested added to its document list.
export async function intakeForm(env, row, reqs) {
  reqs = reqs || (row.id ? await loadRequests(env, row.id) : []);
  const base = formOf(row);
  if (!base) return { form: null, reqs, extra: [], asked: new Set() };
  const { extra, asked } = requestDocs(reqs, base);
  return { form: formOf(row, extra, asked), reqs, extra, asked };
}
// What a client sees of a request: never the token of another request, never other files.
export const pubRequest = (q) => ({ id: q.id, token: q.token, message: q.message || "", created: q.created, expires: q.expires, status: q.status, sent_back: q.sent_back, items: q.items });
