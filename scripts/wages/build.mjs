// Builds the Median Wage Checker data (tools/wages/data/) from official sources:
//  1. ESDC "Wages" open data (open.canada.ca, dataset adad580f-76b0-4502-bd05-20c125de9116): the same
//     low / median / high wages Job Bank shows, by NOC 2021 and economic region. The newest year's CSV
//     is picked automatically, so a new release is used as soon as ESDC publishes it.
//  2. Job Bank's job-title search: every title with its NOC and the ID Job Bank uses in its wage-page
//     links (https://www.jobbank.gc.ca/marketreport/wages-occupation/<id>/<area>).
// Runs weekly from .github/workflows/wages.yml. If a source can't be reached, the last good data is kept.
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = path.join(ROOT, "tools/wages/data");
const DATASET = "adad580f-76b0-4502-bd05-20c125de9116";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WorkerPoolWages/1.0 (+https://workerpool.ca)";
const LOCAL_CSV = process.env.WAGES_CSV; // tests: use a local copy
const SKIP_TITLES = process.env.SKIP_TITLES === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, type = "text", tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: AbortSignal.timeout(120000) });
      if (r.ok) return type === "json" ? r.json() : r.text();
      last = new Error("HTTP " + r.status);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { last = e; }
    await sleep(3000 * i);
  }
  throw last;
}

// RFC 4180 CSV parser (wage comments contain commas and quotes)
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const num = (s) => { const n = parseFloat(String(s || "").replace(/[$,\s]/g, "")); return isFinite(n) && n > 0 ? +n.toFixed(2) : null; };
const PROV = { NAT: "CA", NL: "NL", PEI: "PE", NS: "NS", NB: "NB", QC: "QC", ON: "ON", MB: "MB", SK: "SK", AB: "AB", BC: "BC", YK: "YT", NWT: "NT", NU: "NU" };

/* ---------- 1. wages ---------- */
let meta = {};
try { meta = JSON.parse(fs.readFileSync(path.join(OUT, "meta.json"), "utf8")); } catch {}
let csvText, source;
if (LOCAL_CSV) { csvText = fs.readFileSync(LOCAL_CSV, "utf8"); source = { name: "local test file", url: "", year: 0 }; }
else {
  const pkg = await get(`https://open.canada.ca/data/api/action/package_show?id=${DATASET}`, "json");
  // resources are named like "2025 Wages"; take the newest year that has a CSV
  const res = (pkg.result.resources || [])
    .map((r) => ({ r, year: +((String(r.name || "").match(/(20\d\d)\s*Wages/i) || String(r.url || "").match(/wage(20\d\d)/i) || [])[1] || 0) }))
    .filter((x) => x.year && /csv/i.test(String(x.r.format || "") + String(x.r.url || "")))
    .sort((a, b) => b.year - a.year);
  if (!res.length) throw new Error("No wage CSV found in the open data package");
  const best = res[0];
  source = { name: best.r.name || `${best.year} Wages`, url: best.r.url, year: best.year, modified: best.r.last_modified || best.r.metadata_modified || best.r.created || "" };
  console.log("Downloading", source.url);
  csvText = await get(source.url); // always rebuilt from the original file, so minimum-wage adjustments stay exact
}

// Job Bank raises published hourly wages that are below a province's current minimum wage to that
// minimum (its wage methodology: "wages are updated on Job Bank periodically to reflect the minimum wage
// increases"). The open data file isn't re-issued for those updates, so the same floor is applied here.
const MW = JSON.parse(fs.readFileSync(new URL("./minimum-wages.json", import.meta.url), "utf8")).rates;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
const minWage = {}; for (const [p, list] of Object.entries(MW)) { const cur = list.filter((x) => x.from <= today).sort((a, b) => a.from.localeCompare(b.from)).pop(); if (cur) minWage[p] = cur; }
let adjusted = 0;

let nocs = {}; // code → {t, fr, a, se, w: {ER: [low, med, high, period, src, minWageApplied?]}}
let regions = {};
if (csvText) {
  const rows = parseCSV(csvText.replace(/^﻿/, ""));
  const H = rows[0].map((h) => h.trim());
  const ix = (re) => H.findIndex((h) => re.test(h));
  const I = { noc: ix(/^NOC_CNP/i), t: ix(/^NOC_Title_eng/i), fr: ix(/^NOC_Title_fra/i), prov: ix(/^prov/i), er: ix(/^ER_Code/i), ern: ix(/^ER_Name/i),
    low: ix(/^Low_Wage/i), med: ix(/^Median_Wage/i), high: ix(/^High_Wage/i), per: ix(/^Reference_Period/i), src: ix(/^Data_Source_E/i),
    rev: ix(/^Revision_Date/i), ann: ix(/^Annual_Wage_Flag/i), cm: ix(/^Wage_Comment_E/i) };
  for (const [k, v] of Object.entries(I)) if (v < 0) throw new Error("Wage file is missing column " + k + ". Columns: " + H.join(", "));
  let revision = "";
  for (const r of rows.slice(1)) {
    if (r.length < H.length - 2) continue;
    const code = (r[I.noc].match(/\d{5}/) || [])[0]; if (!code) continue;
    const er = r[I.er].trim(), prov = PROV[r[I.prov].trim()] || r[I.prov].trim();
    regions[er] = regions[er] || { p: prov, n: r[I.ern].trim().replace(/--/g, "–") };
    const n = nocs[code] = nocs[code] || { c: code, t: r[I.t].trim(), fr: r[I.fr].trim(), a: 0, w: {} };
    if (r[I.ann].trim() === "1") n.a = 1;
    const cm = r[I.cm].trim(); if (/self-employed/i.test(cm)) n.se = 1;
    let low = num(r[I.low]), med = num(r[I.med]), high = num(r[I.high]);
    const mw = prov !== "CA" && r[I.ann].trim() !== "1" ? minWage[prov] : null; // hourly provincial/regional figures only
    let floored = 0;
    if (mw) { const f = (v) => (v != null && v < mw.rate ? (floored = 1, mw.rate) : v); low = f(low); med = f(med); high = f(high); }
    if (floored) adjusted++;
    if (low || med || high) n.w[er] = floored ? [low, med, high, r[I.per].trim(), r[I.src].trim(), 1] : [low, med, high, r[I.per].trim(), r[I.src].trim()];
    if (r[I.rev] && r[I.rev] > revision) revision = r[I.rev].trim();
  }
  if (Object.keys(nocs).length < 400) throw new Error("Only " + Object.keys(nocs).length + " occupations found; refusing to publish");
  source.revision = revision;
  fs.mkdirSync(path.join(OUT, "noc"), { recursive: true });
  for (const n of Object.values(nocs)) fs.writeFileSync(path.join(OUT, "noc", n.c + ".json"), JSON.stringify(n));
  console.log(`Wrote ${Object.keys(nocs).length} occupations, ${Object.keys(regions).length} areas (revision ${revision}); ${adjusted} area figures raised to the current minimum wage`);
} else {
  for (const f of fs.readdirSync(path.join(OUT, "noc"))) { const n = JSON.parse(fs.readFileSync(path.join(OUT, "noc", f), "utf8")); nocs[n.c] = n; }
  regions = meta.regions || {};
}

/* ---------- 2. Job Bank titles (with wage-page IDs) ---------- */
let titles = [], jbOk = 0, jbFail = 0;
const prevTitles = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, "titles.json"), "utf8")); } catch { return null; } })();
const lead = {}; // NOC → default Job Bank title id
if (!SKIP_TITLES) {
  const codes = Object.keys(nocs).sort();
  const one = async (code) => {
    const seen = new Map(); let start = 0, total = Infinity;
    while (start < total && start < 3000) {
      const u = `https://www.jobbank.gc.ca/core/ta-jobtitle_en/select?q=noc21_code:${code}&wt=json&rows=500&start=${start}&fl=title,noc21_code,noc_job_title_concordance_id,jtt_ind,example_ind`;
      const j = await get(u, "json", 3);
      const docs = (j.response && j.response.docs) || []; total = (j.response && j.response.numFound) || 0;
      for (const d of docs) {
        if (String(d.noc21_code) !== code || !d.title || !d.noc_job_title_concordance_id) continue;
        const t = d.title.trim(), key = t.toLowerCase();
        if (!seen.has(key)) seen.set(key, { t, id: +d.noc_job_title_concordance_id, lead: d.jtt_ind === "1" || d.jtt_ind === 1, ex: d.example_ind === "1" || d.example_ind === 1 });
      }
      if (!docs.length) break;
      start += docs.length;
      await sleep(150);
    }
    const list = [...seen.values()];
    const nt = nocs[code].t.toLowerCase();
    const pick = list.find((x) => x.t.toLowerCase() === nt) || list.find((x) => x.lead && x.ex) || list.find((x) => x.lead) || list.find((x) => x.ex) || list[0];
    if (pick) lead[code] = pick.id;
    return list.map((x) => [x.t, code, x.id]);
  };
  const queue = Object.keys(nocs).sort();
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const code = queue.shift();
      try { titles.push(...(await one(code))); jbOk++; } catch (e) { jbFail++; if (jbFail <= 5) console.log("Job Bank titles failed for", code, e.message); }
    }
  });
  await Promise.all(workers);
  console.log(`Job Bank titles: ${titles.length} titles for ${jbOk} occupations (${jbFail} failed)`);
}
const titlesOk = !SKIP_TITLES && jbOk >= 450 && titles.length > 5000;
if (titlesOk) {
  titles.sort((a, b) => a[0].localeCompare(b[0]));
  fs.writeFileSync(path.join(OUT, "titles.json"), JSON.stringify(titles));
} else if (!prevTitles) {
  // first run without Job Bank: fall back to the NOC 2021 example titles (no per-title Job Bank IDs)
  const noc = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/noc/noc-2021.json"), "utf8"));
  titles = []; for (const n of noc) for (const t of new Set([n.t, ...(n.ex || [])])) titles.push([t, n.c, 0]);
  titles.sort((a, b) => a[0].localeCompare(b[0]));
  fs.writeFileSync(path.join(OUT, "titles.json"), JSON.stringify(titles));
  console.log("Job Bank titles unavailable: used", titles.length, "NOC 2021 example titles instead");
} else console.log("Job Bank titles unavailable: kept the previous list");

// default Job Bank id per NOC (kept from the previous run if Job Bank was unreachable)
const prevLead = meta.lead || {};
const leads = titlesOk ? lead : prevLead;

/* ---------- 3. index + meta ---------- */
const index = Object.values(nocs).sort((a, b) => a.c.localeCompare(b.c)).map((n) => [n.c, n.t, n.a, leads[n.c] || 0]);
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
const out = { source: csvText ? source : meta.source, regions, lead: leads, minWage, titles: titlesOk ? { from: "Job Bank", count: titles.length } : (meta.titles || { from: "NOC 2021 examples" }),
  checked: new Date().toISOString(), updated: csvText || titlesOk ? new Date().toISOString() : meta.updated };
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(out, null, 1));
console.log("Done.");
