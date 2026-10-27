// Collects immigration draws from official government pages and writes data/draws.json.
// Runs from GitHub Actions at 8 am, 2 pm and 8 pm Edmonton time (see .github/workflows/draws.yml).
// Only pages on approved government domains are read (lib.mjs → OFFICIAL_HOSTS). Nothing already collected is ever
// removed automatically: if a page drops an old row, the draw stays. Admin edits live in D1 and are applied on top.
import fs from "node:fs";
import crypto from "node:crypto";
import { get, getBuffer, tables, clean, stripScripts, isoDate, invites, score, col } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const OUT = new URL("../../data/draws.json", import.meta.url);
const KEEP_DAYS = 430; // about 14 months of history
const LOCAL = process.env.DRAWS_LOCAL ? JSON.parse(fs.readFileSync(process.env.DRAWS_LOCAL, "utf8")) : null; // tests: url → file
const fetchPage = (url) => (LOCAL ? Promise.resolve(LOCAL[url] ? fs.readFileSync(LOCAL[url], "utf8") : Promise.reject(new Error("no local copy"))) : get(url));

const d = (o) => o; // readability
// ---------- sources ----------
const SOURCES = [
  { id: "ee", jur: "CA", program: "Express Entry", name: "IRCC – Express Entry rounds of invitations",
    url: "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json",
    page: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html",
    parse: (txt) => JSON.parse(txt).rounds.map((r) => d({
      date: isoDate(r.drawDate), stream: clean(r.drawName), invites: invites(r.drawSize), score: score(r.drawCRS), scoreLabel: "CRS",
      note: r.drawNumber ? "Round #" + r.drawNumber : "",
      link: `https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds/invitations.html?q=${encodeURIComponent(r.drawNumber)}`,
      key: "ee-" + r.drawNumber })) },

  { id: "bc", jur: "BC", program: "BC PNP", name: "Welcome BC – BC PNP invitations to apply",
    url: "https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program/invitations-to-apply",
    parse: (html) => {
      const out = [];
      for (const t of tables(html)) {
        const iD = col(t.head, "date"), iN = col(t.head, "invitation"), iS = col(t.head, "minimum score", "score");
        if (iD < 0 || iN < 0) continue;
        const ent = /entrepreneur/i.test(t.ctx);
        const iT = col(t.head, "ita type", "stream"), iF = col(t.head, "selection factor");
        for (const r of t.rows) {
          const stream = [ent ? "Entrepreneur" : "Skills", r[iT], iF >= 0 && r[iF] && !/^points$/i.test(r[iF]) ? r[iF].replace(/\s*\*$/, "") : ""].filter(Boolean).join(" – ");
          out.push({ date: isoDate(r[iD]), stream, invites: invites(r[iN]), score: score(r[iS]) });
        }
      }
      return out;
    } },

  { id: "ab", jur: "AB", program: "AAIP", name: "Alberta.ca – AAIP processing information (draw table)",
    url: "https://www.alberta.ca/aaip-processing-information",
    parse: (html) => {
      const out = [];
      for (const t of tables(html)) {
        const iD = col(t.head, "draw date"), iN = col(t.head, "number of invitations"), iS = col(t.head, "minimum score"), iT = col(t.head, "stream");
        if (iD < 0 || iN < 0) continue;
        for (const r of t.rows) out.push({ date: isoDate(r[iD]), stream: r[iT], invites: invites(r[iN]), score: score(r[iS]) });
      }
      return out;
    } },

  { id: "mb", jur: "MB", program: "MPNP", name: "Immigrate Manitoba – Expression of Interest draws",
    url: "https://immigratemanitoba.com/draws/", parse: parseManitoba },

  { id: "on", jur: "ON", program: "OINP", name: "Ontario.ca – OINP invitations to apply",
    url: "https://www.ontario.ca/page/invitations-apply-oinp",
    parse: (html) => {
      const out = [];
      for (const t of tables(html)) {
        const iD = col(t.head, "date issued"), iN = col(t.head, "number of invitations"), iS = col(t.head, "score"), iNote = col(t.head, "notes");
        if (iD < 0 || iN < 0) continue;
        for (const r of t.rows) {
          const region = ((r[iNote] || "").match(/Targeted draw for (?:the )?([^.]+)/i) || [])[1];
          const kind = /general draw/i.test(r[iNote] || "") ? "general draw" : "";
          out.push({ date: isoDate(r[iD]), stream: [t.ctx.replace(/^Employer Job Offer:\s*/i, ""), region || kind].filter(Boolean).join(" – "), invites: invites(r[iN]), score: score(r[iS]) });
        }
      }
      return out;
    } },

  { id: "nb", jur: "NB", program: "NBPNP / AIP", name: "GNB – New Brunswick invitation and selection rounds",
    url: "https://www.gnb.ca/en/topic/family-home-community/immigration/invitation-selection-rounds.html",
    parse: (html) => {
      const out = [];
      for (const t of tables(html)) {
        const iD = col(t.head, "date of draw");
        if (iD >= 0 && t.head.length > 2) { // the "previous invitations" table
          const iT = col(t.head, "stream"), iP = col(t.head, "pathway"), iN = col(t.head, "invitations issued", "applications selected");
          for (const r of t.rows) out.push({ date: isoDate(r[iD]), stream: [r[iT], r.length === t.head.length ? r[iP] : ""].filter((x) => x && !/^[–—-]$/.test(x)).join(" – "), invites: invites(r[r.length - 1]), note: /\b(to|and)\b/.test(r[iD]) ? "Draw dates: " + r[iD] : "" });
        } else if (/date of draw/i.test(t.head[0] || "")) { // a latest-round card: rows are label → value
          const kv = Object.fromEntries([t.head, ...t.rows].map((r) => [String(r[0] || "").toLowerCase(), r[1] || ""]));
          const n = kv["invitations issued"] || kv["applications selected"] || Object.entries(kv).find(([k]) => /invitations|selected/.test(k))?.[1];
          out.push({ date: isoDate(kv["date of draw"]), stream: [t.ctx, kv["pathways"]].filter((x) => x && !/^[–—-]$/.test(x)).join(" – "), invites: invites(n), note: /\b(to|and)\b/.test(kv["date of draw"]) ? "Draw dates: " + kv["date of draw"] : "" });
        }
      }
      return out;
    } },

  { id: "qc", jur: "QC", program: "Québec PSTQ (Arrima)", name: "Québec.ca – PSTQ invitations in Arrima",
    url: () => `https://www.quebec.ca/en/immigration/permanent/skilled-workers/skilled-worker-selection-program/invitation/${new Date().getFullYear()}`,
    parse: parseQuebec },

  // Saskatchewan publishes International Skilled Worker EOI selections in a PDF linked from the EOI page.
  { id: "sk", jur: "SK", program: "SINP", name: "Saskatchewan.ca – SINP International Skilled Worker EOI selection results (PDF)",
    url: "https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program/browse-sinp-programs/applicants-international-skilled-workers/international-skilled-worker-eoi-system",
    load: loadSaskatchewanPdf, parse: parseSaskatchewan },

  // Pages that block automated readers or publish results only as PDFs. Watched for changes; admin adds the draws by hand.
  { id: "pe", jur: "PE", program: "PEI PNP", name: "PrinceEdwardIsland.ca – EOI draws (blocks automated readers)", manual: true,
    url: "https://www.princeedwardisland.ca/en/information/office-of-immigration/expression-of-interest-draws" },
  { id: "nl", jur: "NL", program: "NLPNP", name: "Gov.nl.ca – Invitations to apply updates (blocks automated readers)", manual: true,
    url: "https://www.gov.nl.ca/immigration/invitations-to-apply-updates/" },
  { id: "yt", jur: "YT", program: "Yukon Nominee Program", name: "Yukon.ca – Yukon Nominee Program intakes (blocks automated readers; no invitation numbers published)", manual: true,
    url: "https://yukon.ca/en/yukon-nominee-program",
    // Official 2026 rounds from Government of Yukon news releases. Yukon doesn't publish how many employers were invited.
    seed: [
      { date: "2026-01-30", stream: "Employer EOI intake – round 1 (January 19 to 30)", note: "Highest-scoring employer expressions of interest invited to apply. Yukon doesn't publish invitation numbers. 2026 allocation: 282 nominations.",
        link: "https://yukon.ca/en/news/yukon-nominee-program-expression-interest-intake-open" },
      { date: "2026-07-17", stream: "Employer EOI intake – round 2 (July 6 to 17)", note: "Highest-scoring employer expressions of interest invited; their applications were due August 26. Yukon doesn't publish invitation numbers.",
        link: "https://yukon.ca/en/yukon-nominee-program" },
    ] },
  { id: "ns", jur: "NS", program: "NSNP", name: "Live in Nova Scotia – Nova Scotia Nominee Program", watch: true,
    url: "https://liveinnovascotia.com/nova-scotia-nominee-program" },
  { id: "rcip-sudbury", jur: "RCIP", program: "RCIP / FCIP – Sudbury", name: "Invest Sudbury – RCIP and FCIP candidates", watch: true,
    url: "https://investsudbury.ca/why-sudbury/newcomers/rcip-and-fcip-candidates/" },
  { id: "rcip-thunderbay", jur: "RCIP", program: "RCIP – Thunder Bay", name: "Thunder Bay CEDC – Rural Community Immigration Pilot", watch: true,
    url: "https://gotothunderbay.ca/rural-community-immigration-pilot-rcip/" },
  { id: "rcip-claresholm", jur: "RCIP", program: "RCIP – Claresholm", name: "Town of Claresholm – Rural Community Immigration Pilot", watch: true,
    url: "https://www.claresholm.ca/business/labour-resources/rural-community-immigration-pilot" },
];

// ---------- page-specific parsers ----------
// Saskatchewan: find the "Selection Results" PDF on the EOI page, then turn it into text with pdftotext -layout.
async function loadSaskatchewanPdf(url) {
  const html = await fetchPage(url);
  const m = html.match(/href="(https:\/\/publications\.saskatchewan\.ca[^"]*?\/download)"[^>]*>[^<]*Selection Results/i);
  if (!m) throw new Error("Couldn't find the EOI Selection Results PDF link on the page");
  if (LOCAL) return fs.readFileSync(LOCAL[m[1]] || LOCAL["sk-pdf"], "utf8");
  const file = path.join(os.tmpdir(), "sinp-eoi.pdf");
  fs.writeFileSync(file, await getBuffer(m[1]));
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 20e6 });
}
// Rows look like (a date and a category can wrap onto the next line):
//   "  September      Occupations          88             32         Invited Candidates had ..."
//   "   12, 2024      In-Demand                                      Credential Assessments ..."
function parseSaskatchewan(text) {
  const lines = text.split(/\r?\n/), out = [];
  const ROW = /^\s*(\S.*?)\s{2,}(\S.*?)\s{2,}(\d{1,3})\s{2,}([\d,]{1,6})(?:\s{2,}|\s*$)/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ROW);
    if (!m || /[a-z]/i.test(m[3] + m[4])) continue;
    let dateTxt = m[1], cat = m[2];
    const next = (lines[i + 1] || "").match(/^\s*(\S.*?)(?:\s{2,}(\S.*?))?(?:\s{2,}|\s*$)/);
    if (!isoDate(dateTxt) && next) {
      dateTxt += " " + next[1];
      if (next[2] && !/\d/.test(next[2]) && next[2].length < 30) cat += " " + next[2];
    } else if (next && next[1] && !/\d/.test(next[1]) && next[1].length < 30 && !/^(Invited|Not all|Credential|educated)/i.test(next[1])) cat += " " + next[1];
    const date = isoDate(dateTxt);
    if (!date) continue;
    out.push({ date, stream: "International Skilled Worker – " + cat.replace(/\s+/g, " ").replace(/- /g, "-"), invites: invites(m[4]), score: score(m[3]), scoreLabel: "EOI points" });
  }
  return out;
}
function parseManitoba(html) {
  html = stripScripts(html);
  const out = [];
  for (const a of html.split(/<article\b/i).slice(1)) {
    const num = (a.match(/Expression of Interest Draw #(\d+)/i) || [])[1];
    const link = (a.match(/href="(https:\/\/immigratemanitoba\.com\/\d{4}\/\d\d\/[^"]+)"/) || [])[1];
    const date = isoDate(clean((a.match(/class="published"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ""));
    if (!num || !date) continue;
    // Walk the blocks in order: <h4> pathway, a bold-only paragraph = sub-selection, then counts and scores.
    let path = "", sub = "", cur = null;
    const blocks = [...a.matchAll(/<(h[2-5]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    for (const [, tag, inner] of blocks) {
      const text = clean(inner);
      if (!text) continue;
      if (/^h[3-5]$/i.test(tag)) { path = text; sub = ""; continue; }
      if (/^p$/i.test(tag) && /^\s*<strong>[\s\S]*<\/strong>\s*$/i.test(inner) && text.length < 90) { sub = text; continue; }
      let m = text.match(/Letters of Advice to Apply issued:?\s*([\d,]+)/i);
      if (m) { cur = { date, stream: [path, sub].filter(Boolean).join(" – ") || "EOI draw", invites: invites(m[1]), score: null, note: "Draw #" + num, link, key: `mb-${num}-${out.length}` }; out.push(cur); continue; }
      m = text.match(/Ranking score of lowest-ranked candidate invited:?\s*(\d+)/i);
      if (m && cur && cur.score == null) cur.score = Number(m[1]);
    }
  }
  return out;
}

function parseQuebec(html) {
  const text = clean(stripScripts(html).replace(/<\/(p|li|h\d|div)>/gi, "\n"));
  const out = [];
  const streamAt = [...text.matchAll(/Stream (\d): ([^.]+?)(?= Invitations for| Stream \d:|$)/g)].map((m) => ({ i: m.index, name: `Stream ${m[1]}: ${m[2].trim()}` }));
  const re = /Invitations for ([A-Za-z]+ \d{1,2}, 20\d\d)([\s\S]*?)(?=Invitations for [A-Za-z]+ \d{1,2}, 20\d\d|Stream \d: |$)/g;
  let m;
  while ((m = re.exec(text))) {
    const block = m[2];
    const n = (block.match(/invited ([\d,\s]+?) (?:people|persons|individuals)/i) || [])[1];
    const scores = [...block.matchAll(/score[^.]{0,40}? of (\d{3,4}) points/gi)].map((x) => Number(x[1]));
    const st = streamAt.filter((s) => s.i < m.index).pop();
    out.push({ date: isoDate(m[1]), stream: st ? st.name : "PSTQ invitations", invites: invites(n), score: scores.length ? Math.min(...scores) : null, scoreLabel: scores.length > 1 ? "lowest of several exercises" : "" });
  }
  return out;
}

// ---------- run ----------
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { draws: [], sources: [] };
const byId = new Map(old.draws.map((x) => [x.id, x]));
const now = new Date().toISOString();
const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
const sources = [];
let added = 0, changed = 0;

for (const s of SOURCES) {
  const url = typeof s.url === "function" ? s.url() : s.url;
  const prev = (old.sources || []).find((x) => x.id === s.id) || {};
  const st = { id: s.id, jur: s.jur, program: s.program, name: s.name, url: s.page || url, checked: now, ok: false, found: 0, manual: !!s.manual, watch: !!s.watch };
  if (s.manual) {
    st.ok = true; st.note = "This site blocks automated readers. Add its draws by hand in the admin dashboard.";
    for (const r of s.seed || []) { // official rounds entered here, with their source
      if (r.date < cutoff) continue;
      const key = `${s.id}-${r.date}-${sha(norm(r.stream))}`;
      const draw = { id: key, jur: s.jur, program: s.program, date: r.date, stream: r.stream, invites: r.invites || null, score: r.score ?? null, scoreLabel: "", note: r.note || "", source: r.link || url };
      const was = byId.get(key);
      if (!was) { byId.set(key, { ...draw, first: now }); added++; }
      else if (JSON.stringify({ ...was, first: 0 }) !== JSON.stringify({ ...draw, first: 0 })) { byId.set(key, { ...draw, first: was.first || now }); changed++; }
    }
    st.found = (s.seed || []).length; sources.push(st); console.log(`man  ${s.id}`); continue;
  }
  try {
    const body = s.load ? await s.load(url) : await fetchPage(url);
    if (s.watch) {
      const h = sha(clean(stripScripts(body)).replace(/\d{1,2}:\d\d|©.*$/g, ""));
      st.hash = h; st.changed = prev.hash && prev.hash !== h ? now : prev.changed || null;
      st.ok = true;
    } else {
      const seen = {}, same = new Set();
      const rows = s.parse(body).filter((r) => r.date && r.stream && (r.invites || r.score != null))
        .map((r) => ({ ...r, stream: clean(r.stream) }))
        .filter((r) => { const k = [r.date, norm(r.stream), r.invites, r.score].join("|"); if (same.has(k)) return false; same.add(k); return true; }); // a page listing the same round twice
      for (const r of rows) {
        if (r.date < cutoff) continue;
        let key = r.key || `${s.id}-${r.date}-${sha(norm(r.stream))}`;
        seen[key] = (seen[key] || 0) + 1; if (seen[key] > 1) key += "-" + seen[key];
        const draw = { id: key, jur: s.jur, program: s.program, date: r.date, stream: r.stream.slice(0, 160), invites: r.invites || null,
          score: r.score ?? null, scoreLabel: r.scoreLabel || "", note: r.note || "", source: r.link || s.page || url };
        const was = byId.get(key);
        if (!was) { byId.set(key, { ...draw, first: now }); added++; }
        else if (JSON.stringify({ ...was, first: 0 }) !== JSON.stringify({ ...draw, first: 0 })) { byId.set(key, { ...draw, first: was.first || now }); changed++; }
      }
      st.ok = rows.length > 0; st.found = rows.length;
      if (rows.length) st.latest = rows.map((r) => r.date).sort().pop();
      if (rows.length && st.latest < cutoff) st.note = `Latest selection on the official page is ${st.latest}, older than the 14 months shown on the site.`;
      if (!rows.length) st.error = "Page loaded but no draws were recognised. The page layout may have changed.";
    }
  } catch (e) {
    st.error = String(e.message || e).slice(0, 200);
  }
  if (!st.ok) st.lastOk = prev.ok ? prev.checked : prev.lastOk || null;
  sources.push(st);
  console.log(`${st.ok ? "ok  " : "FAIL"} ${s.id.padEnd(16)} ${s.watch ? (st.changed ? "changed " + st.changed : "watching") : st.found + " rows"} ${st.error || ""}`);
}

const draws = [...byId.values()].filter((x) => x.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date) || a.program.localeCompare(b.program) || a.stream.localeCompare(b.stream));
fs.mkdirSync(new URL("../../data/", import.meta.url), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ updated: added || changed ? now : old.updated || now, checked: now, draws, sources }, null, 1) + "\n");
console.log(`\n${draws.length} draws kept · ${added} new · ${changed} updated`);
if (sources.every((x) => !x.ok)) process.exit(1); // every source failed: something is wrong with the runner, don't commit
