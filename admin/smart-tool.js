/* Admin → Smart Tool. Upload ONE document (a CV / resume or a client information sheet: PDF, Word, Excel, text
   or a photo). The tool reads all of it, fills the fixed fields (date of birth → age, marital status, education,
   IELTS / CELPIP / PTE / TEF / TCF scores, every job with dates and hours, job offer, family in Canada, spouse),
   identifies the real NOC 2021 code of each job, and asks only for what the document doesn't say.
   It then scores the profile against Express Entry (CRS under the Nov 3, 2026 rules), says whether the person
   qualifies for CEC, FSW or FST, compares with the latest draws, and predicts how the score moves: better
   language results, more months of work, education, spouse, nomination, plus a month-by-month projection
   (birthdays, experience milestones, test expiry).

   Scoring is not duplicated: it uses the Profile scanner's engine (admin/profile-scan.js → WPScan.engine), which
   runs the same official grids as the public calculators and the live draws feed.

   Confidential by design: the file is opened in this browser tab. Only its text (or page images for a scan)
   goes to /api/tools/smart-read, which hands it to Cloudflare Workers AI in memory and stores nothing.
   Everything else stays in this tab and is gone when the console is locked or the tab closed. */
(function () {
"use strict";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PROV = [["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Québec"], ["SK", "Saskatchewan"], ["YT", "Yukon"]];
const PNAME = Object.fromEntries(PROV);
const EDU = [["", "— Choose —"], ["none", "Less than high school"], ["hs", "High school diploma"], ["one", "One-year post-secondary diploma or certificate"], ["two", "Two-year post-secondary diploma"], ["bach", "Bachelor's degree, or a 3+ year program"], ["twoplus", "Two or more credentials, one of them 3+ years"], ["master", "Master's or professional degree"], ["phd", "Doctorate (PhD)"]];
const EDUN = Object.fromEntries(EDU);
const EN_T = [["none", "Not in document — ask the client"], ["ielts", "IELTS General Training"], ["celpip", "CELPIP-General"], ["pte", "PTE Core"], ["clb", "CLB levels (already converted)"]];
const FR_T = [["none", "No French test"], ["tef", "TEF Canada"], ["tcf", "TCF Canada"], ["clb", "NCLC levels (already converted)"]];
const SP_T = [["none", "No test"], ["ielts", "IELTS General Training"], ["celpip", "CELPIP-General"], ["pte", "PTE Core"], ["tef", "TEF Canada"], ["tcf", "TCF Canada"], ["clb", "CLB / NCLC levels"]];
const TNAME = { ielts: "IELTS", celpip: "CELPIP", pte: "PTE Core", tef: "TEF Canada", tcf: "TCF Canada", clb: "CLB" };
const STATUS = [["outside", "Outside Canada"], ["wp", "In Canada: work permit (employer-specific or open)"], ["pgwp", "In Canada: post-graduation work permit"], ["sp", "In Canada: study permit"], ["visitor", "In Canada: visitor, maintained or other status"], ["pr", "Already a permanent resident or citizen"]];
const REL = [["sibling", "Brother or sister"], ["parent", "Parent"], ["child", "Son or daughter (18+)"], ["grand", "Grandparent"], ["auntuncle", "Aunt or uncle"], ["niece", "Niece or nephew"], ["cousin", "First cousin"], ["friend", "Other relative or friend"]];
const AB4 = [["L", "Listening"], ["R", "Reading"], ["W", "Writing"], ["S", "Speaking"]];
// IRCC equivalency charts: minimum score for CLB / NCLC 10, 9, 8, 7, 6, 5, 4 (same table as tools/calculators/calc.js)
const CONV = {
  ielts: { L: [8.5, 8, 7.5, 6, 5.5, 5, 4.5], R: [8, 7, 6.5, 6, 5, 4, 3.5], W: [7.5, 7, 6.5, 6, 5.5, 5, 4], S: [7.5, 7, 6.5, 6, 5.5, 5, 4] },
  pte: { L: [89, 82, 71, 60, 50, 39, 28], R: [88, 78, 69, 60, 51, 42, 33], W: [90, 88, 79, 69, 60, 51, 41], S: [89, 84, 76, 68, 59, 51, 42] },
  tef: { L: [316, 298, 280, 249, 217, 181, 145], R: [263, 248, 233, 207, 181, 151, 121], W: [393, 371, 349, 310, 271, 226, 181], S: [393, 371, 349, 310, 271, 226, 181] },
  tcf: { L: [549, 523, 503, 458, 398, 369, 331], R: [549, 524, 499, 453, 406, 375, 342], W: [16, 14, 12, 10, 7, 6, 4], S: [16, 14, 12, 10, 7, 6, 4] },
};
const minScore = (t, k, clb) => (t === "celpip" || t === "clb" ? Math.min(12, clb) : CONV[t] ? CONV[t][k][Math.max(0, Math.min(6, 10 - clb))] : clb);

let ROOT = null, KEY = "", ENG = null, NOCL = null, NOCM = {}, AI = null, ST = null, DOC = null, BUSY = false, TMR = 0;

/* ---------------- dates ---------------- */
const TODAY = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
const isoDay = (d) => d.toISOString().slice(0, 10);
const addM = (d, n) => { const x = new Date(d); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); x.setUTCDate(Math.min(d.getUTCDate(), new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate())); return x; };
const ymStart = (s) => { const m = /^(\d{4})-(\d{2})/.exec(s || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)) : null; };
const ymEnd = (s) => { const m = /^(\d{4})-(\d{2})/.exec(s || ""); return m ? new Date(Date.UTC(+m[1], +m[2], 1)) : null; }; // first day after the month
const fmtM = (d) => d.toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
const fmtD = (s) => { const d = new Date(String(s).slice(0, 10) + "T12:00:00Z"); return isNaN(d) ? "" : d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
const fmtYm = (s) => { const d = ymStart(s); return d ? fmtM(d) : ""; };
function ageAt(dob, at) {
  const b = new Date(dob + "T00:00:00Z"); if (isNaN(b)) return null;
  let a = at.getUTCFullYear() - b.getUTCFullYear(); const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monOf = (w) => MON[String(w).slice(0, 4).toLowerCase()] || MON[String(w).slice(0, 3).toLowerCase()];
function parseDate(s) { // free text → YYYY-MM-DD (day-first for numeric dates, as on Indian and most non-US documents)
  s = String(s || "").trim(); let m, y, mo, d;
  const fix = (yy) => (yy < 100 ? (yy > 30 ? 1900 + yy : 2000 + yy) : yy);
  if ((m = s.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { [d, mo, y] = [+m[1], +m[2], fix(+m[3])]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; }
  else if ((m = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,]*([A-Za-z]{3,9})[\s\-\/.,]*(\d{2,4})/)) && monOf(m[2])) [d, mo, y] = [+m[1], monOf(m[2]), fix(+m[3])];
  else if ((m = s.match(/([A-Za-z]{3,9})[\s.\-]*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/)) && monOf(m[1])) [mo, d, y] = [monOf(m[1]), +m[2], +m[3]];
  else return null;
  if (!(y > 1920 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------- state ---------------- */
const blankLang = () => ({ t: "none", L: "", R: "", W: "", S: "", date: "" });
function blank() {
  return { ref: "", dob: "", age: "", mar: "", spAcc: "yes", kids: "0", status: "outside", funds: "", earn: "", nominated: false,
    edu: "", eduWhere: "XX", eduCdn: "", eca: false, cdnEdu: "none", studyProv: "", cdnCount: "1", tradeCert: false,
    en: blankLang(), fr: blankLang(), jobs: [], offer: { has: false, noc: "", wage: "", prov: "", city: "", title: "" }, rels: [],
    sp: { edu: "bach", cdn: "0", lang: blankLang(), study: false }, src: {} };
}
const newJob = () => ({ title: "", employer: "", cdn: false, prov: "", country: "", city: "", start: "", end: "", present: false, hours: "", noc: "", nocSrc: "", nocConf: "", nocWhy: "", sugg: [], aiNoc: "", aiConf: "", counts: true, why: "", duties: "" });

/* ---------------- reading the file in this tab ---------------- */
async function pipe(u, s) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(s)).arrayBuffer()); }
function zipRead(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf); let eo = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error("the file is damaged or password-protected");
  let p = dv.getUint32(eo + 16, true); const n = dv.getUint16(eo + 10, true), out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("the file is damaged");
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.slice(p + 46, p + 46 + nl));
    if (flags & 1) throw new Error("the file is password-protected");
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    out.push({ name, method, raw: u.subarray(ds, ds + cs) }); p += 46 + nl + xl + cl;
  }
  return out;
}
async function zipText(es, name) { const e = es.find((x) => x.name === name); if (!e) return null; const b = e.method === 8 ? await pipe(e.raw, new DecompressionStream("deflate-raw")) : e.raw; return new TextDecoder().decode(b); }
const XML = (s) => new DOMParser().parseFromString(s, "application/xml");
const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
async function docxText(buf) {
  const es = zipRead(buf), x = await zipText(es, "word/document.xml");
  if (!x) throw new Error("there's no Word document inside this file");
  const doc = XML(x), out = [];
  const para = (p) => { let s = ""; for (const el of p.getElementsByTagNameNS(WNS, "*")) { if (el.localName === "t") s += el.textContent; else if (el.localName === "tab") s += " "; else if (el.localName === "br") s += "\n"; } return s.trim(); };
  const walk = (el) => { for (const c of el.children) {
    if (c.namespaceURI !== WNS) continue;
    if (c.localName === "p") { const t = para(c); if (t) out.push(t); }
    else if (c.localName === "tbl") { for (const tr of [...c.children].filter((r) => r.localName === "tr")) { const cells = [...tr.children].filter((tc) => tc.localName === "tc").map((tc) => [...tc.getElementsByTagNameNS(WNS, "p")].map(para).filter(Boolean).join(" ")); if (cells.some(Boolean)) out.push(cells.join(" | ")); } }
    else if (["sdt", "sdtContent", "body", "customXml", "smartTag"].includes(c.localName)) walk(c);
  } };
  walk(doc.getElementsByTagNameNS(WNS, "body")[0] || doc.documentElement);
  for (const n of es.filter((e) => /^word\/(header|footer)\d*\.xml$/.test(e.name)).map((e) => e.name)) { const t = XML(await zipText(es, n)); const s = [...t.getElementsByTagNameNS(WNS, "t")].map((e) => e.textContent).join(" ").trim(); if (s) out.push(s); }
  return out.join("\n");
}
async function xlsxText(buf) {
  const es = zipRead(buf), ss = [], out = [];
  const sx = await zipText(es, "xl/sharedStrings.xml");
  if (sx) for (const si of XML(sx).getElementsByTagName("si")) ss.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
  const sheets = es.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => +a.name.match(/(\d+)\.xml/)[1] - +b.name.match(/(\d+)\.xml/)[1]);
  for (const s of sheets) {
    const d = XML(await zipText(es, s.name));
    for (const row of d.getElementsByTagName("row")) {
      const cells = [...row.getElementsByTagName("c")].map((c) => { const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]; if (t === "s") return ss[+(v && v.textContent)] || ""; if (t === "inlineStr") return [...c.getElementsByTagName("t")].map((x) => x.textContent).join(""); return v ? v.textContent : ""; }).map((x) => String(x).trim());
      if (cells.some(Boolean)) out.push(cells.filter(Boolean).join(" | "));
    }
    out.push("");
  }
  return out.join("\n");
}
const pdfjs = () => (window.__wpPdfjs ||= import("/assets/vendor/pdfjs/pdf.min.js").then((m) => { m.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs/pdf.worker.min.js"; return m; }));
async function pdfRead(buf) {
  const P = await pdfjs(); let doc;
  try { doc = await P.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; } catch (e) { throw new Error(/password/i.test(e.name + e.message) ? "the PDF is password-protected" : "this isn't a readable PDF"); }
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) { const tc = await (await doc.getPage(i)).getTextContent(); text += tc.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : " ")).join("") + "\n\n"; }
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const images = [];
  if (text.replace(/\s/g, "").length < 300) { // a scanned PDF: read the pages as pictures
    for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
      const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(2.2, 1500 / Math.max(v1.width, v1.height)) });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise; images.push(c.toDataURL("image/jpeg", 0.8)); c.width = c.height = 0;
    }
  }
  try { await doc.destroy(); } catch (e) {}
  return { text, images, pages: doc.numPages };
}
async function imageRead(file) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { bmp = await new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error("this image can't be opened")); }; im.src = u; }); }
  const k = Math.min(1, 1700 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  const u = c.toDataURL("image/jpeg", 0.85); c.width = c.height = 0; return u;
}
async function openFile(file) {
  const name = file.name || "file", ext = (name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  if (/^image\//.test(file.type) || ["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) return { kind: "Photo / scan", text: "", images: [await imageRead(file)] };
  const buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 5));
  if (ext === "pdf" || [...head].every((b, i) => b === "%PDF-".charCodeAt(i))) { const r = await pdfRead(buf); return { kind: r.images.length ? `Scanned PDF (${r.pages} page${r.pages > 1 ? "s" : ""})` : `PDF (${r.pages} page${r.pages > 1 ? "s" : ""})`, ...r }; }
  if (ext === "docx") return { kind: "Word document", text: await docxText(buf), images: [] };
  if (ext === "xlsx" || ext === "xlsm") return { kind: "Excel sheet", text: await xlsxText(buf), images: [] };
  if (["doc", "xls", "odt", "pages", "rtf"].includes(ext)) throw new Error(`.${ext} files can't be opened here. Save it as .docx, .xlsx or PDF and upload that`);
  return { kind: "Text file", text: new TextDecoder().decode(buf).replace(/\r/g, ""), images: [] };
}

/* ---------------- facts read straight from the text (cross-check for the AI) ---------------- */
function localFacts(text) {
  const f = {}, t = String(text || "");
  let m = t.match(/(?:date\s*of\s*birth|d\.\s?o\.\s?b\.?|\bdob\b|birth\s*date|born\s*on)\s*[:\-–|]?\s*([^\n|]{6,30})/i); if (m) f.dob = parseDate(m[1]);
  m = t.match(/\bage\s*[:\-–|]\s*(\d{2})\b/i) || t.match(/\b(\d{2})\s*(?:years|yrs)\s*old\b/i); if (m && +m[1] >= 16 && +m[1] <= 70) f.age = +m[1];
  m = t.match(/marital\s*status\s*[:\-–|]?\s*(single|unmarried|never married|married|common[\s-]*law|divorced|widow(?:ed|er)?|separated)/i);
  if (m) f.mar = /married|common/i.test(m[1]) && !/un|never/i.test(m[1]) ? "married" : "single";
  const tests = [["ielts", /\bielts\b/i], ["celpip", /\bcelpip\b/i], ["pte", /\bpte\b/i], ["tef", /\btef\b/i], ["tcf", /\btcf\b/i]];
  f.lang = [];
  for (const [k, re] of tests) {
    const i = t.search(re); if (i < 0) continue;
    const w = t.slice(i, i + 320), num = k === "ielts" ? "(\\d(?:\\.[05])?)" : "(\\d{1,3})";
    const g = (a) => { const r = w.match(new RegExp(`(?:${a})\\s*[:\\-–=|]?\\s*${num}\\b`, "i")); return r ? r[1] : ""; };
    const o = { t: k, L: g("listening|\\bL"), R: g("reading|\\bR"), W: g("writing|\\bW"), S: g("speaking|\\bS"), academic: k === "ielts" && /academic/i.test(w), date: "" };
    const d = w.match(/(?:test\s*date|date)\s*[:\-–|]?\s*([^\n|]{6,25})/i); if (d) o.date = parseDate(d[1]) || "";
    if (o.L && o.R && o.W && o.S) f.lang.push(o);
  }
  return f;
}

/* ---------------- NOC matching (titles + example titles of all 516 NOC 2021 unit groups) ---------------- */
const STOP = new Set("and or the of in a an to for with at on by from as i ii iii iv level lead".split(" "));
const tok = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/ies$/, "y").replace(/([^s])s$/, "$1"));
async function loadNocs() {
  if (NOCL) return NOCL;
  const a = await fetch("/tools/noc/noc-2021.json").then((r) => r.json());
  NOCL = a.map((n) => {
    const ex = [n.t, ...(n.ill || []), ...(n.ex || [])].map((e) => { const [main, q] = String(e).split(/\s+-\s+/); return { m: tok(main), q: tok(q || "") }; });
    return { c: n.c, t: n.t, ill: n.ill || [], ex, tt: new Set(tok(n.t)) };
  });
  NOCL.forEach((n) => (NOCM[n.c] = n));
  return NOCL;
}
function matchNoc(title, context) {
  const tt = tok(title); if (!tt.length || !NOCL) return [];
  const T = new Set(tt), key = tt.join(" "), C = new Set(tok(context));
  const out = [];
  for (const n of NOCL) {
    let best = 0;
    for (const e of n.ex) {
      if (!e.m.length) continue;
      let inter = 0; for (const w of e.m) if (T.has(w)) inter++;
      if (!inter) continue;
      let s = e.m.join(" ") === key ? 1.2 : 0.6 * inter / (T.size + e.m.length - inter) + 0.4 * inter / T.size;
      if (e.q.length && e.q.some((w) => C.has(w) || T.has(w))) s += 0.08;
      if (s > best) best = s;
    }
    if (!best) continue;
    let ctx = 0; for (const w of n.tt) if (C.has(w)) ctx += 0.03;
    out.push({ c: n.c, s: best + Math.min(0.12, ctx) });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 12);
}
const nocTitle = (c) => (NOCM[c] ? NOCM[c].t : "");
const nocLine = (c) => (/^\d{5}$/.test(c || "") ? `${c} · ${nocTitle(c) || "Not in NOC 2021"} · TEER ${c[1]}` : "");

/* ---------------- server calls ---------------- */
async function post(body, ms = 95000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  let r;
  try { r = await fetch("/api/tools/smart-read", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": KEY }, body: JSON.stringify(body), signal: ac.signal }); }
  catch (e) { const x = new Error(e.name === "AbortError" ? "The AI reader took too long." : "The AI reader couldn't be reached."); x.code = "timeout"; throw x; }
  finally { clearTimeout(t); }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 401) throw new Error("The admin key was rejected. Lock and sign in again.");
  if (!r.ok || !j.ok) { const e = new Error(j.message || j.error || "The reader didn't answer (" + r.status + ")"); e.code = j.error; throw e; }
  return j;
}

/* ---------------- document → fields ---------------- */
const LV = { secondary: 1, one_year: 2, two_year: 3, bachelors: 4, masters: 6, phd: 7 };
const LVK = { secondary: "hs", one_year: "one", two_year: "two", bachelors: "bach", two_or_more: "twoplus", masters: "master", phd: "phd" };
const isCa = (country, prov) => !!prov || /canada/i.test(country || "");
const TMAP = { ielts_general: "ielts", celpip: "celpip", pte_core: "pte", tef: "tef", tcf: "tcf", clb: "clb" };
const v2s = (v) => (v == null ? "" : String(v));
function fromDoc(r, loc, file) {
  const S = blank(), src = S.src, flags = [], mark = (k) => (src[k] = "doc");
  const p = r.person || {}, today = isoDay(TODAY());
  S.ref = p.full_name || "";
  const dob = p.date_of_birth || loc.dob || "";
  if (dob) { S.dob = dob; S.age = v2s(ageAt(dob, TODAY())); mark("dob"); mark("age"); }
  else if (p.age || loc.age) { S.age = v2s(p.age || loc.age); mark("age"); flags.push(["warn", "Only the age is in the document, not the date of birth. Add the date of birth for exact birthday predictions."]); }
  if (p.date_of_birth && loc.dob && p.date_of_birth !== loc.dob) flags.push(["warn", `Date of birth: the reader saw ${fmtD(p.date_of_birth)} but the text also shows ${fmtD(loc.dob)}. Check which is right.`]);
  const ms = p.marital_status || null;
  if (ms) { S.mar = ms === "married" || ms === "common_law" ? "married" : "single"; mark("mar"); } else if (loc.mar) { S.mar = loc.mar; mark("mar"); }
  const sp = r.spouse || {};
  if (S.mar === "married") {
    S.spAcc = sp.is_canadian_or_pr ? "cdn" : sp.accompanying === false ? "no" : "yes";
    if (sp.is_canadian_or_pr != null || sp.accompanying != null) mark("spAcc"); else flags.push(["ask", "Ask whether the spouse or partner is coming to Canada (it changes the CRS grid)."]);
    if (sp.education_level) { S.sp.edu = LVK[sp.education_level] || "bach"; mark("spEdu"); }
    if (sp.canadian_work_years != null) { S.sp.cdn = String(Math.min(5, Math.floor(sp.canadian_work_years))); mark("spCdn"); }
    if (sp.studied_in_canada_2_years) S.sp.study = true;
    const st = TMAP[sp.language_test];
    if (st && sp.listening != null && sp.reading != null && sp.writing != null && sp.speaking != null) { S.sp.lang = { t: st, L: v2s(sp.listening), R: v2s(sp.reading), W: v2s(sp.writing), S: v2s(sp.speaking), date: "" }; mark("spLang"); }
  }
  if (p.children != null) { S.kids = v2s(p.children); mark("kids"); }
  const cs = p.canada_status;
  const stMap = { outside: "outside", work_permit: "wp", open_work_permit: "wp", pgwp: "pgwp", study_permit: "sp", visitor: "visitor", permanent_resident: "pr", citizen: "pr" };
  if (cs && stMap[cs]) { S.status = stMap[cs]; mark("status"); }
  else if (p.in_canada === false) { S.status = "outside"; mark("status"); }
  if (S.status === "pr") flags.push(["warn", "The document says this person is already a permanent resident or citizen of Canada. Express Entry doesn't apply."]);
  // education
  const eds = (r.education || []).filter((e) => e.completed !== false && !(e.end_date && e.end_date > today && e.end_date !== "present"));
  const inProg = (r.education || []).filter((e) => !eds.includes(e));
  const post = eds.filter((e) => LV[e.level] >= 2);
  const best = eds.filter((e) => LV[e.level]).sort((a, b) => LV[b.level] - LV[a.level])[0];
  if (best) {
    let k = LVK[best.level];
    if (["one", "two", "bach"].includes(k) && post.length >= 2 && post.some((e) => e.level === "bachelors" || (e.length_years || 0) >= 3)) k = "twoplus";
    S.edu = k; mark("edu");
    S.eduWhere = isCa(best.country, best.province) ? best.province || "ON" : "XX"; mark("eduWhere");
  }
  const cdnE = post.filter((e) => isCa(e.country, e.province) && ((e.length_years || 0) >= 1 || LV[e.level] >= 2));
  if (cdnE.length) {
    S.cdnEdu = cdnE.some((e) => LV[e.level] >= 4 || (e.length_years || 0) >= 3) ? "long" : "short";
    S.studyProv = (cdnE.find((e) => e.province) || {}).province || ""; S.cdnCount = cdnE.length >= 2 ? "2" : "1"; mark("cdnEdu");
    const bc = cdnE.sort((a, b) => LV[b.level] - LV[a.level])[0]; S.eduCdn = LVK[bc.level] || (S.cdnEdu === "long" ? "bach" : "two");
  } else if ((r.education || []).length) mark("cdnEdu");
  S.eca = (r.education || []).some((e) => e.has_eca);
  if (best && S.eduWhere === "XX" && !S.eca && LV[best.level] >= 1) flags.push(["ask", "Foreign education only scores with an Educational Credential Assessment (WES, ICAS, IQAS…). Ask if they have one."]);
  if (inProg.length) flags.push(["info", `Still studying: ${inProg.map((e) => esc(e.credential || e.level)).join(", ")}. Not counted until completed.`]);
  if ((r.education || []).some((e) => e.is_trade_certificate) || r.canadian_trade_certificate) { S.tradeCert = !!r.canadian_trade_certificate; if (S.tradeCert) mark("tradeCert"); }
  // language
  const tests = (r.language_tests || []).filter((x) => x.listening != null && x.reading != null && x.writing != null && x.speaking != null);
  const pick = (lang) => tests.filter((x) => TMAP[x.test] && (lang === "fr" ? ["tef", "tcf"].includes(TMAP[x.test]) || (x.test === "clb" && x.language === "french") : !["tef", "tcf"].includes(TMAP[x.test]) && x.language !== "french")).sort((a, b) => String(b.test_date || "").localeCompare(String(a.test_date || "")))[0];
  const en = pick("en"), fr = pick("fr");
  if (en) { S.en = { t: TMAP[en.test], L: v2s(en.listening), R: v2s(en.reading), W: v2s(en.writing), S: v2s(en.speaking), date: en.test_date || "" }; mark("en"); }
  else { const l = (loc.lang || []).find((x) => !["tef", "tcf"].includes(x.t) && !x.academic); if (l) { S.en = { t: l.t, L: l.L, R: l.R, W: l.W, S: l.S, date: l.date }; mark("en"); } }
  if (fr) { S.fr = { t: TMAP[fr.test], L: v2s(fr.listening), R: v2s(fr.reading), W: v2s(fr.writing), S: v2s(fr.speaking), date: fr.test_date || "" }; mark("fr"); }
  else { const l = (loc.lang || []).find((x) => ["tef", "tcf"].includes(x.t)); if (l) { S.fr = { t: l.t, L: l.L, R: l.R, W: l.W, S: l.S, date: l.date }; mark("fr"); } }
  const acad = tests.filter((x) => x.test === "ielts_academic" || x.test === "pte_academic");
  if (acad.length && !en) flags.push(["ask", `The document shows ${acad.map((x) => x.test === "ielts_academic" ? "IELTS Academic" : "PTE Academic").join(" and ")}. Express Entry only accepts IELTS General Training, CELPIP-General or PTE Core. Ask for an accepted test.`]);
  if (en && loc.lang && loc.lang.length) { const l = loc.lang.find((x) => x.t === TMAP[en.test]); if (l && ["L", "R", "W", "S"].some((k) => +l[k] !== +S.en[k])) flags.push(["warn", `${TNAME[S.en.t]} scores: the reader saw L${S.en.L} R${S.en.R} W${S.en.W} S${S.en.S}, the text shows L${l.L} R${l.R} W${l.W} S${l.S}. Check the score card.`]); }
  // work
  S.jobs = (r.work || []).filter((w) => w.job_title || w.employer).map((w) => {
    const j = newJob();
    j.title = w.job_title || ""; j.employer = w.employer || ""; j.cdn = isCa(w.country, w.province); j.prov = w.province || ""; j.country = j.cdn ? "Canada" : w.country || ""; j.city = w.city || "";
    j.start = (w.start_date || "").slice(0, 7); j.present = w.end_date === "present"; j.end = j.present ? "" : (w.end_date || "").slice(0, 7);
    j.hours = w.hours_per_week != null ? String(w.hours_per_week) : w.full_time === false ? "" : w.full_time ? "40" : "";
    j.duties = w.duties_summary || ""; j.aiNoc = w.noc_code || ""; j.aiConf = w.noc_confidence || "";
    if (j.cdn && w.while_full_time_student) { j.counts = false; j.why = "Worked while a full-time student: doesn't count for Express Entry"; }
    if (j.cdn && w.self_employed) { j.counts = false; j.why = "Self-employed in Canada: doesn't count for CEC or CRS Canadian experience"; }
    return j;
  }).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  S.jobs.forEach((j) => { if (!j.start) flags.push(["ask", `“${esc(j.title || j.employer)}”: the start date isn't in the document. Add it so the experience counts.`]); else if (!j.present && !j.end) flags.push(["ask", `“${esc(j.title || j.employer)}”: the end date isn't in the document.`]); if (!j.hours) flags.push(["ask", `“${esc(j.title || j.employer)}”: hours per week aren't stated (counted as full-time until you change it).`]); else if (+j.hours < 30) flags.push(["info", `“${esc(j.title || j.employer)}” is part-time (${j.hours} h/week): counted pro rata (30 h/week = full-time).`]); });
  if (S.jobs.length) mark("jobs");
  if (!src.status && S.jobs.some((j) => j.cdn && j.present)) { S.status = "wp"; flags.push(["ask", "Currently working in Canada, so status is set to work permit. Confirm the permit type."]); }
  // offer, family, other
  const o = r.job_offer || {};
  if (o.has_offer) { S.offer = { has: true, noc: o.noc_code || "", wage: v2s(o.hourly_wage_cad), prov: o.province || "", city: o.city || "", title: o.job_title || "" }; mark("offer"); if (o.permanent_full_time === false) flags.push(["warn", "The job offer doesn't look full-time and permanent, so it may not count."]); }
  const RM = { sibling: "sibling", parent: "parent", child: "child", grandparent: "grand", aunt_uncle: "auntuncle", niece_nephew: "niece", cousin: "cousin", other: "friend" };
  S.rels = (r.family_in_canada || []).filter((f) => f.citizen_or_pr !== false).map((f) => ({ rel: RM[f.relation] || "friend", prov: f.province || "", city: f.city || "" }));
  if (S.rels.length) mark("rels");
  if ((r.family_in_canada || []).some((f) => f.citizen_or_pr == null)) flags.push(["ask", "Family in Canada: confirm they are citizens or PRs (18+) — only then do they count."]);
  S.nominated = !!r.provincial_nomination; if (S.nominated) mark("nominated");
  if (r.funds_cad != null) { S.funds = v2s(r.funds_cad); mark("funds"); }
  if (r.highest_canadian_annual_earnings_cad != null) S.earn = v2s(r.highest_canadian_annual_earnings_cad);
  (r.issues || []).forEach((x) => flags.push(["info", esc(x)]));
  return { S, flags, raw: r, file };
}

/* ---------------- fields → the Profile scanner's profile shape ---------------- */
function fte(jobs, asOf) { // full-time-equivalent years per job; overlapping jobs share the 30 h/week cap
  const end = +asOf, W = 7 * 864e5;
  const it = jobs.map((j, i) => { if (!j.counts) return null; const s = ymStart(j.start); let e = j.present ? asOf : ymEnd(j.end); if (!s || !e) return null; if (e > asOf) e = asOf; if (e <= s) return null; return { i, j, s: +s, e: +e, h: +j.hours > 0 ? +j.hours : 40, w: 0 }; }).filter(Boolean);
  if (!it.length) return [];
  for (let t = Math.min(...it.map((x) => x.s)); t < end; t += W) {
    const a = it.filter((x) => t >= x.s && t < x.e); if (!a.length) continue;
    const H = a.reduce((s, x) => s + x.h, 0), f = Math.min(1, H / 30); a.forEach((x) => (x.w += (f * x.h) / H));
  }
  return it.map((x) => ({ ...x, yrs: x.w / 52.1775, ago: x.j.present ? 0 : Math.max(0, (end - x.e) / (365.25 * 864e5)) }));
}
function buildP(s, o = {}) {
  const asOf = o.asOf || TODAY(), ageDate = o.ageDate || asOf;
  const months = Math.round((+ageDate - +TODAY()) / (30.44 * 864e5));
  const age = s.dob ? ageAt(s.dob, ageDate) : s.age === "" ? null : +s.age + Math.max(0, Math.floor(months / 12));
  const F = fte(s.jobs, asOf);
  const lang = (l) => ({ t: l.t, L: v2s(l.L), R: v2s(l.R), W: v2s(l.W), S: v2s(l.S) });
  return {
    ref: s.ref, age, married: s.mar === "married", spAcc: s.spAcc, kids: Math.max(0, Math.floor(+s.kids || 0)),
    status: s.status === "pr" ? "outside" : s.status, funds: s.funds === "" ? null : +s.funds, earn: s.earn === "" ? null : +s.earn, nominated: !!s.nominated,
    edu: s.edu || "none", eduWhere: s.eduWhere || "XX", trade: false, cdnEdu: s.cdnEdu, studyProv: s.cdnEdu === "none" ? "" : s.studyProv, cdnCount: s.cdnEdu === "none" ? 0 : +s.cdnCount,
    tradeCert: !!s.tradeCert, licence: false, en: lang(s.en), fr: lang(s.fr),
    jobs: F.filter((x) => /^\d{5}$/.test(x.j.noc)).map((x) => ({ noc: x.j.noc, where: x.j.cdn ? x.j.prov || "CA" : "XX", city: (x.j.cdn ? x.j.city : x.j.country) || "", yrs: x.yrs, ago: x.ago })),
    offer: { has: !!s.offer.has && /^\d{5}$/.test(s.offer.noc), noc: s.offer.noc, wage: +s.offer.wage || 0, prov: s.offer.prov, city: s.offer.city, empM: 0, bcArea: "3", abLoc: "other", onRegion: "east", designated: false },
    rels: s.rels.map((r) => ({ rel: r.rel, prov: r.prov, city: r.city })),
    sp: { edu: s.sp.edu, cdn: s.sp.cdn, lang: lang(s.sp.lang), study: !!s.sp.study },
    wi: { on: false, noc: "", wage: 0, metro: false },
    _fte: F,
  };
}
function score(s, o) {
  const P = buildP(s, o), D = ENG.derive(P), fed = ENG.federal(D);
  const ck = (n) => fed.checks.find((c) => c.name === n) || { ok: false, items: [] };
  return { P, D, fed, crs: fed.crs, cec: ck("Canadian Experience Class"), fsw: ck("Federal Skilled Worker Program"), fst: ck("Federal Skilled Trades Program"), ee: fed.eeOk };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const langClb = (l) => { if (!l || l.t === "none") return null; const H = ENG.X.H; const o = {}; let any = true; AB4.forEach(([k]) => { if (l[k] === "") any = false; o[k] = H.toClb(l.t, k, l[k]); }); o.min = Math.min(o.L, o.R, o.W, o.S); return any ? o : null; };
const langTxt = (l) => `${TNAME[l.t] || l.t} L ${l.L} · R ${l.R} · W ${l.W} · S ${l.S}`;
function raiseLang(l, T, t0) {
  const t = l.t === "none" ? t0 : l.t, n = { t, L: "", R: "", W: "", S: "", date: "" }, H = ENG.X.H;
  AB4.forEach(([k]) => { const cur = l.t === "none" || l[k] === "" ? 0 : H.toClb(t, k, l[k]); n[k] = cur >= T ? l[k] : String(minScore(t, k, T)); });
  return n;
}

/* ---------------- what moves the score ---------------- */
function scenarios(base) {
  const S0 = ST, out = [], H = ENG.X.H, today = TODAY();
  const add = (grp, label, detail, s, o) => { try { const r = score(s, o); out.push({ grp, label, detail, r, gain: r.crs - base.crs, s, o }); } catch (e) { console.warn("scenario", label, e); } };
  // English
  const en = langClb(S0.en), enMin = en ? en.min : 0, t0 = S0.en.t === "none" ? "ielts" : S0.en.t;
  if (S0.en.t === "ielts" && en && enMin < 10) { const s = clone(S0); AB4.forEach(([k]) => (s.en[k] = String(Math.min(9, +S0.en[k] + 0.5)))); add("English", "IELTS +0.5 band in every ability", langTxt(s.en), s); }
  [7, 8, 9, 10].filter((T) => T > enMin).forEach((T) => { const s = clone(S0); s.en = raiseLang(S0.en, T, t0); add("English", `${S0.en.t === "none" ? "Take " + TNAME[t0] + " and reach" : "English to"} CLB ${T} in every ability`, langTxt(s.en), s); });
  // French
  const fr = langClb(S0.fr), frMin = fr ? fr.min : 0, ft = S0.fr.t === "none" ? "tef" : S0.fr.t;
  [5, 7, 9].filter((T) => T > frMin).forEach((T) => { const s = clone(S0); s.fr = raiseLang(S0.fr, T, ft); add("French", `${S0.fr.t === "none" ? "Add French: " : "French to "}NCLC ${T}`, langTxt(s.fr) + (T >= 7 ? " · also opens French-language category draws" : ""), s); });
  // experience
  const skilled = (j) => j.counts && /^\d{5}$/.test(j.noc) && +j.noc[1] <= 3;
  const curC = S0.jobs.find((j) => j.cdn && j.present && skilled(j)), curF = S0.jobs.find((j) => !j.cdn && j.present && skilled(j));
  const keep = { ageDate: today }; // experience only: age held at today's
  if (curC) [6, 12, 24, 36].forEach((m) => add("Canadian work", `Keep working in Canada ${m} more months`, `As ${esc(curC.title || nocTitle(curC.noc))} until ${fmtM(addM(today, m))} (age held at today's)`, S0, { asOf: addM(today, m), ...keep }));
  else if (["wp", "pgwp"].includes(S0.status)) {
    const main = S0.jobs.filter(skilled)[0];
    if (main) [12, 24].forEach((m) => { const s = clone(S0); const j = { ...newJob(), title: main.title, cdn: true, prov: "ON", start: isoDay(today).slice(0, 7), present: true, hours: "40", noc: main.noc, counts: true }; s.jobs.unshift(j); add("Canadian work", `Start a skilled job in Canada and work ${m} months`, `In NOC ${main.noc} (${esc(nocTitle(main.noc))}), until ${fmtM(addM(today, m))}`, s, { asOf: addM(today, m), ...keep }); });
  }
  if (curF) [12, 24].forEach((m) => add("Foreign work", `Keep working abroad ${m} more months`, `As ${esc(curF.title || nocTitle(curF.noc))} until ${fmtM(addM(today, m))} (age held at today's)`, S0, { asOf: addM(today, m), ...keep }));
  // education
  if (["one", "two", "bach"].includes(S0.edu)) { const s = clone(S0); s.edu = "twoplus"; add("Education", "Add a second post-secondary credential", "Two or more credentials, one of them 3+ years (e.g. a 1-year PG diploma on top of a bachelor's)", s); }
  if (["bach", "twoplus", "one", "two"].includes(S0.edu)) { const s = clone(S0); s.edu = "master"; add("Education", "Complete a master's degree", "Needs an ECA if studied abroad", s); }
  if (S0.cdnEdu === "none" && S0.status !== "pr") { const s = clone(S0); s.cdnEdu = "short"; s.studyProv = s.studyProv || "ON"; if (["", "none", "hs"].includes(s.edu)) s.edu = "two"; add("Education", "Complete a 1–2 year Canadian credential", "Additional points for Canadian study", s); }
  if (S0.edu && S0.edu !== "none" && S0.eduWhere === "XX" && !S0.eca) { const s = clone(S0); s.edu = S0.eduCdn || (S0.cdnEdu === "long" ? "bach" : S0.cdnEdu === "short" ? "two" : "none"); const r = score(s); if (base.crs - r.crs > 0) out.push({ grp: "Education", label: "Risk: no ECA", detail: `Without an Educational Credential Assessment the foreign education can't be claimed (CRS ${r.crs})`, r, gain: r.crs - base.crs, risk: true, s }); }
  // spouse
  if (S0.mar === "married" && S0.spAcc === "yes") {
    const spl = langClb(S0.sp.lang);
    if (!spl || spl.min < 9) { const s = clone(S0); s.sp.lang = raiseLang(S0.sp.lang, 9, S0.sp.lang.t === "none" ? "ielts" : S0.sp.lang.t); add("Spouse", "Spouse takes a language test: CLB 9", langTxt(s.sp.lang), s); }
    { const s = clone(S0); s.spAcc = "no"; add("Spouse", "Declare the spouse as non-accompanying", "Scored on the single grid. Only if the spouse genuinely won't immigrate now", s); }
  }
  // job offer and nomination
  const mainN = (curC || S0.jobs.find(skilled) || {}).noc;
  if (!S0.offer.has && mainN && ENG.X.HW[mainN]) { const s = clone(S0); s.offer = { has: true, noc: mainN, wage: "", prov: "", city: "", title: "" }; add("Job offer", "Valid job offer in their NOC", `${mainN} is on IRCC's high-wage list (tier ${ENG.X.HW[mainN][1]})`, s); }
  if (!S0.nominated) { const s = clone(S0); s.nominated = true; add("Nomination", "Provincial nomination (PNP)", "+600 points: an invitation is practically certain", s); }
  // the best two practical changes together
  const prac = out.filter((x) => !x.risk && x.gain > 0 && !["Nomination", "Spouse"].includes(x.grp)).sort((a, b) => b.gain - a.gain);
  const bl = prac.find((x) => x.grp === "English" || x.grp === "French"), bw = prac.find((x) => x.grp === "Canadian work" || x.grp === "Foreign work");
  if (bl && bw) {
    const s = clone(bw.s); s.en = clone(bl.s.en); s.fr = clone(bl.s.fr);
    add("Combined", `${bl.label} + ${bw.label.charAt(0).toLowerCase() + bw.label.slice(1)}`, "The best language change and the best work change together", s, bw.o);
  }
  return out;
}

/* ---------------- month-by-month projection ---------------- */
function projection(base) {
  const pts = [], ev = [], today = TODAY();
  let prev = base;
  const rowsMap = (r) => { const m = {}; (r.fed.R.rows || []).forEach((x) => { if (!x[3] && x[1] != null) m[x[0]] = x[1]; }); return m; };
  for (let m = 0; m <= 36; m++) {
    const at = addM(today, m), r = m ? score(ST, { asOf: at }) : base;
    pts.push({ m, at, crs: r.crs, ee: r.ee, cec: r.cec.ok, fsw: r.fsw.ok });
    if (m) {
      if (r.crs !== prev.crs) {
        const a = rowsMap(prev), b = rowsMap(r), ch = Object.keys({ ...a, ...b }).filter((k) => !k.startsWith("·") && (a[k] || 0) !== (b[k] || 0)).map((k) => `${k.replace(/ \(.*\)$/, "")} ${(b[k] || 0) - (a[k] || 0) > 0 ? "+" : ""}${(b[k] || 0) - (a[k] || 0)}`);
        ev.push({ at, crs: r.crs, d: r.crs - prev.crs, why: ch.join(", ") || "Points recalculated" });
      }
      if (r.cec.ok !== prev.cec.ok) ev.push({ at, crs: r.crs, flag: r.cec.ok ? "good" : "bad", why: r.cec.ok ? "Becomes eligible for the Canadian Experience Class" : "No longer meets the Canadian Experience Class (1 year in the last 3)" });
      if (r.fsw.ok !== prev.fsw.ok) ev.push({ at, crs: r.crs, flag: r.fsw.ok ? "good" : "bad", why: r.fsw.ok ? "Becomes eligible for the Federal Skilled Worker Program" : "No longer meets the Federal Skilled Worker Program" });
    }
    prev = r;
  }
  [["en", "English"], ["fr", "French"]].forEach(([k, n]) => { const d = ST[k].date; if (ST[k].t !== "none" && d) { const x = new Date(d + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + 2); if (x > today && x < addM(today, 36)) ev.push({ at: x, flag: "warn", why: `${n} test result (${TNAME[ST[k].t]}) expires — the profile needs a valid test on the day of application` }); else if (x <= today) ev.push({ at: today, flag: "bad", why: `${n} test result (${TNAME[ST[k].t]}, ${fmtD(d)}) is more than 2 years old: it has expired. A new test is needed.` }); } });
  ev.sort((a, b) => a.at - b.at);
  return { pts, ev };
}
function chart(pts, cut) {
  const W = 660, Hh = 210, pl = 40, pr = 12, pt = 14, pb = 28;
  const ys = pts.map((p) => p.crs).concat(cut ? [cut.score] : []);
  let lo = Math.min(...ys) - 15, hi = Math.max(...ys) + 15; if (hi - lo < 60) { const c = (hi + lo) / 2; lo = c - 30; hi = c + 30; }
  const x = (m) => pl + (m / 36) * (W - pl - pr), y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (Hh - pt - pb);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.m).toFixed(1)},${y(p.crs).toFixed(1)}`).join("");
  const ticks = [0, 6, 12, 18, 24, 30, 36].map((m) => `<line x1="${x(m)}" x2="${x(m)}" y1="${pt}" y2="${Hh - pb}" class="g"/><text x="${x(m)}" y="${Hh - 9}" text-anchor="middle">${m ? fmtM(addM(TODAY(), m)) : "Today"}</text>`).join("");
  const yt = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join("");
  const dots = pts.map((p) => `<circle cx="${x(p.m)}" cy="${y(p.crs)}" r="${p.m % 3 ? 0 : 3}" class="${p.ee ? "ok" : "no"}"><title>${fmtM(p.at)}: CRS ${p.crs}${p.ee ? "" : " (not eligible yet)"}</title></circle>`).join("");
  const cl = cut ? `<line x1="${pl}" x2="${W - pr}" y1="${y(cut.score)}" y2="${y(cut.score)}" class="cut"/><text x="${W - pr}" y="${y(cut.score) - 5}" text-anchor="end" class="cutt">Latest cut-off ${cut.score}</text>` : "";
  return `<svg class="st-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Projected CRS over the next 36 months">${ticks}${yt}${cl}<path d="${path}" class="ln"/>${dots}</svg>`;
}

/* ---------------- styles ---------------- */
const css = `
.st{display:flex;flex-direction:column;gap:16px}
.st-note{font-size:.82rem;color:var(--muted);margin:0}
.st-priv{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);background:var(--accent-soft);border-radius:12px;padding:10px 14px;font-size:.84rem}
.st-sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.st-sec h3{font-family:var(--display);font-size:1.02rem;margin:0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.st-sec h3 i{font-style:normal;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--surface);font-size:.78rem}
.st-drop{border:2px dashed var(--line);border-radius:14px;padding:28px 16px;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center;background:var(--bg);cursor:pointer}
.st-drop.on{border-color:var(--accent);background:var(--accent-soft)}
.st-drop b{font-family:var(--display);font-size:1.15rem}
.st-steps{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.st-steps span{font-size:.78rem;border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:var(--surface);color:var(--muted)}
.st-steps span.on{color:var(--fg);border-color:var(--accent)}.st-steps span.ok{color:#11603b;border-color:#9fd4b8;background:#eaf7f0}
.st-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}
@media (max-width:820px){.st-g{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.st-g{grid-template-columns:1fr}}
.st-g .w2{grid-column:span 2}.st-g .w3{grid-column:1/-1}
@media (max-width:560px){.st-g .w2{grid-column:auto}}
.st label.f{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted);min-width:0}
.st input,.st select,.st textarea{font:inherit;font-size:.88rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--fg);width:100%;min-width:0}
.st input[readonly]{opacity:.75}
.st label.ck{display:flex;gap:8px;align-items:center;font-size:.86rem;font-weight:500;color:var(--fg)}
.st label.ck input{width:auto}
.st-b{display:inline-block;font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}
.st-b.doc{background:#d7f0e3;color:#11603b}.st-b.need{background:#fbefd5;color:#7a4a17}
.st .miss>input,.st .miss>select,.st .st-lang.miss select{border-color:#d9822b;background:#fff8ec}
.st .miss>.lbl{color:#9a5a12}
.st-ask{border:1px solid #efc58a;background:#fff8ec;color:#6b4210;border-radius:10px;padding:8px 12px;font-size:.84rem}
.st-lang{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(4,minmax(0,1fr)) minmax(0,1.1fr);gap:8px;align-items:end}
@media (max-width:760px){.st-lang{grid-template-columns:1fr 1fr}}
.st-lang em{font-style:normal;font-size:.72rem;color:var(--accent);font-weight:700;min-height:1em}
.st-jobs{display:flex;flex-direction:column;gap:10px}
.st-job{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--bg);display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px 10px;align-items:end}
.st-job.miss{border-color:#d9822b;box-shadow:0 0 0 2px #fbefd5}.st-job.off{opacity:.65}
.st-job .w2{grid-column:span 2}.st-job .w3{grid-column:span 3}.st-job .w6{grid-column:1/-1}
@media (max-width:820px){.st-job{grid-template-columns:1fr 1fr}.st-job .w2,.st-job .w3{grid-column:span 2}}
.st-job input,.st-job select{background:var(--surface)}
.st-nocst{font-size:.78rem;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.st-nocst .bad{color:#b3412e;font-weight:700}.st-nocst .ok{color:#11603b;font-weight:700}.st-nocst .lowc{color:#8a5a14;font-weight:700}
.st-sug{font:inherit;font-size:.74rem;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:3px 9px;cursor:pointer}
.st-sug:hover{border-color:var(--accent)}
.st-x{font:inherit;border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:8px;padding:7px 10px;cursor:pointer}
.st-btn{font:inherit;font-weight:600;font-size:.86rem;padding:9px 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer}
.st-btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}
.st-btn[disabled]{opacity:.5;cursor:default}
.st-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.st-err{color:#b3412e;font-weight:600;font-size:.86rem}
.st-hide{display:none!important}
.st-flags{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.st-flags li{font-size:.84rem;padding:7px 10px;border-radius:9px;border:1px solid var(--line);background:var(--bg)}
.st-flags li.ask{border-color:#efc58a;background:#fff8ec}.st-flags li.warn{border-color:#e3b3a9;background:#fdf0ed}
.st-flags li b{margin-right:6px}
.st-hero{background:var(--surface);border:2px solid var(--accent);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px}
.st-hero h2{font-family:var(--display);margin:0;font-size:1.35rem}
.st-crs{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.st-crs .big{font-family:var(--display);font-size:3.4rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.st-crs .big small{display:block;font-size:.72rem;font-family:var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:4px}
.st-prov{border:1px solid #efc58a;background:#fff8ec;border-radius:10px;padding:8px 12px;font-size:.84rem;color:#6b4210}
.st-pg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (max-width:820px){.st-pg{grid-template-columns:1fr}}
.st-p{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg);display:flex;flex-direction:column;gap:6px}
.st-p.yes{border-color:#1f9d63;background:#eaf7f0}.st-p.no{border-color:#e3b3a9;background:#fdf6f4}
.st-p h4{margin:0;font-size:.95rem;display:flex;justify-content:space-between;gap:8px}
.st-p .v{font-weight:800;font-size:.82rem}.st-p.yes .v{color:#11603b}.st-p.no .v{color:#b3412e}
.st-ul{margin:0;padding-left:18px;font-size:.8rem;display:flex;flex-direction:column;gap:3px}
.st-ck{list-style:none;padding-left:0}
.st-ck li::before{display:inline-block;width:18px;font-weight:700}
.st-ck li.y::before{content:"✓";color:#1f9d63}.st-ck li.x::before{content:"✕";color:#b3412e}.st-ck li.q::before{content:"?";color:var(--muted)}
.st-grp{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.st-grp>h3{font-family:var(--display);font-size:1.02rem;margin:0;padding:12px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}
.st-grp>h3 small{font-family:var(--body);font-weight:500;font-size:.78rem;color:var(--muted)}
.st-grp>.in{padding:12px 16px;display:flex;flex-direction:column;gap:10px}
.st-t{width:100%;border-collapse:collapse;font-size:.86rem}
.st-t th{text-align:left;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--line);font-weight:700}
.st-t td{padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.st-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.st-t td small{display:block;color:var(--muted);font-size:.75rem;margin-top:2px}
.st-t tr.h td{font-weight:700;background:var(--bg)}
.st-t tr.tot td{font-weight:800;border-top:2px solid var(--fg)}
.st-ch{display:inline-block;font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.st-ch.hi{background:#1f9d63;color:#fff}.st-ch.good{background:#d7f0e3;color:#11603b}.st-ch.mid{background:#fbefd5;color:#7a4a17}.st-ch.low{background:#fbe1dc;color:#8f2d1c}
.st-ch.no{color:#b3412e;border-color:#e3b3a9}.st-ch.ok{background:var(--accent-soft);color:var(--fg)}.st-ch.q{color:var(--muted);border-color:var(--line)}
.st-gain{font-weight:800}.st-gain.p{color:#11603b}.st-gain.m{color:#b3412e}
.st-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
@media (max-width:900px){.st-two{grid-template-columns:1fr}}
.st-chart{width:100%;max-width:780px;height:auto;font-size:10px;fill:var(--muted)}
.st-chart .g{stroke:var(--line);stroke-width:1}.st-chart .ln{fill:none;stroke:var(--accent);stroke-width:2.5}
.st-chart circle.ok{fill:var(--accent)}.st-chart circle.no{fill:#fff;stroke:#b3412e;stroke-width:1.5}
.st-chart .cut{stroke:#d9822b;stroke-width:1.5;stroke-dasharray:5 4}.st-chart .cutt{fill:#9a5a12;font-weight:700}
.st-ev{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:.84rem}
.st-ev li{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:10px;padding:6px 0;border-bottom:1px dashed var(--line)}
.st-ev li span:first-child{color:var(--muted);font-weight:600}
.st-ev li.good span:nth-child(2){color:#11603b;font-weight:700}.st-ev li.bad span:nth-child(2){color:#b3412e;font-weight:700}.st-ev li.warn span:nth-child(2){color:#8a5a14;font-weight:600}
.st-dl{display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);gap:4px 14px;font-size:.84rem;margin:0}
.st-dl dt{color:var(--muted);font-weight:600}.st-dl dd{margin:0}
.st-tags{display:flex;flex-wrap:wrap;gap:6px}.st-tags span{border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:.78rem;background:var(--bg)}
@media print{.st-noprint{display:none!important}}
`;

/* ---------------- form ---------------- */
const opt = (o, cur) => `<option value="${esc(o[0])}"${String(o[0]) === String(cur) ? " selected" : ""}>${esc(o[1])}</option>`;
const sel = (f, opts, cur) => `<select data-f="${f}">${opts.map((o) => opt(o, cur)).join("")}</select>`;
const badge = (k) => (ST.src[k] === "doc" ? `<span class="st-b doc">from document</span>` : "");
const need = (k) => `<span class="st-b need st-nb" data-nb="${k}">needed</span>`;
const fld = (label, inner, cls = "", k = "", req = false) => `<label class="f ${cls}" ${req ? `data-req="${k}"` : ""}><span class="lbl">${label}${k ? badge(k) : ""}${req ? need(k) : ""}</span>${inner}</label>`;
const inp = (f, v, type = "text", ph = "", attrs = "") => `<input data-f="${f}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" ${type === "number" ? 'inputmode="decimal" step="any" min="0"' : ""} ${attrs}>`;
const provOpts = (b) => [["", b], ...PROV];

function langBlock(p, label, tests, k) {
  const l = p.split(".").reduce((o, x) => o[x], ST);
  return `<div class="st-lang" data-req="${k}">${fld(label, sel(p + ".t", tests, l.t), "", k)}${AB4.map(([a, n]) => fld(n, `${inp(p + "." + a, l[a], "number")}<em data-clb="${p}.${a}"></em>`)).join("")}${p === "sp.lang" ? "<span></span>" : fld("Test date", inp(p + ".date", l.date, "date"))}</div>`;
}
function formHtml() {
  const S = ST;
  return `<section class="st-sec"><h3><i>1</i>Person ${DOC ? `<span class="st-note" style="font-weight:500">from ${esc(DOC.file.name)} · ${esc(DOC.file.kind)}</span>` : ""}</h3><div class="st-g">
    ${fld("Name or reference", inp("ref", S.ref, "text", "optional, for the printout"), "w2")}
    ${fld("Date of birth", inp("dob", S.dob, "date"), "", "dob", true)}
    ${fld("Age today", inp("age", S.age, "number", "or type the age", S.dob ? "readonly" : ""), "", "age")}
    ${fld("Marital status", sel("mar", [["", "— Choose —"], ["single", "Single, divorced, separated or widowed"], ["married", "Married or common-law"]], S.mar), "", "mar", true)}
    ${fld("Spouse or partner coming to Canada?", sel("spAcc", [["yes", "Yes, coming with them"], ["no", "No, not coming"], ["cdn", "Spouse is a Canadian citizen or PR"]], S.spAcc), "st-mar", "spAcc")}
    ${fld("Dependent children", inp("kids", S.kids, "number", "0", 'step="1" max="12"'), "", "kids")}
    ${fld("Status now", sel("status", STATUS, S.status), "w2", "status")}
    ${fld("Savings for proof of funds (CAD)", inp("funds", S.funds, "number", "optional"), "", "funds")}
    <label class="ck w3"><input type="checkbox" data-f="nominated" ${S.nominated ? "checked" : ""}> Already holds a provincial or territorial nomination (+600)${badge("nominated")}</label>
  </div></section>

  <section class="st-sec"><h3><i>2</i>Education</h3><div class="st-g">
    ${fld("Highest completed education", sel("edu", EDU, S.edu), "w2", "edu", true)}
    ${fld("Completed in", sel("eduWhere", [["XX", "Outside Canada"], ...PROV], S.eduWhere), "", "eduWhere")}
    <label class="ck w3 st-eca"><input type="checkbox" data-f="eca" ${S.eca ? "checked" : ""}> Has an Educational Credential Assessment (ECA) for it</label>
    ${fld("Post-secondary study completed in Canada", sel("cdnEdu", [["none", "None"], ["short", "1- or 2-year diploma or certificate"], ["long", "3+ year program, or a master's or doctorate"]], S.cdnEdu), "w2", "cdnEdu")}
    ${fld("Province of Canadian study", sel("studyProv", provOpts("—"), S.studyProv), "st-cdnEdu")}
    <label class="ck w3"><input type="checkbox" data-f="tradeCert" ${S.tradeCert ? "checked" : ""}> Holds a Canadian certificate of qualification in a skilled trade${badge("tradeCert")}</label>
  </div></section>

  <section class="st-sec"><h3><i>3</i>Language scores</h3>
    <div class="st-ask st-enask">The document has no accepted English or French result. <b>Ask the client for IELTS General Training, CELPIP-General or PTE Core scores — or TEF Canada / TCF Canada for French</b> — and type them here. Without one the person can't enter the Express Entry pool.</div>
    ${langBlock("en", "English test", EN_T, "en")}
    ${langBlock("fr", "French test", FR_T, "fr")}
    <p class="st-note">Scores convert to CLB / NCLC with IRCC's charts. Results are valid for 2 years from the test date.</p>
  </section>

  <section class="st-sec"><h3><i>4</i>Work experience and NOC${badge("jobs")}</h3>
    <p class="st-note">Every job the document lists. The NOC is identified from the duties; <b>a highlighted job means the tool couldn't identify the NOC — punch it in</b> (type the 5-digit code or a job title). Part-time counts pro rata (30 h/week = full-time); overlapping jobs share the 30-hour cap.</p>
    <datalist id="stNocs"></datalist>
    <div class="st-jobs" id="stJobs"></div>
    <div><button type="button" class="st-btn g" id="stAddJob">+ Add a job</button></div>
  </section>

  <section class="st-sec"><h3><i>5</i>Job offer, family and other points</h3>
    <label class="ck"><input type="checkbox" data-f="offer.has" ${S.offer.has ? "checked" : ""}> Has a valid full-time, permanent job offer in Canada${badge("offer")}</label>
    <div class="st-g st-offer">
      ${fld("Job offer NOC", `<input data-f="offer.noc" list="stNocs" value="${esc(S.offer.noc)}" placeholder="Code or job title"><span class="st-note" data-nt="offer">${esc(nocLine(S.offer.noc))}</span>`, "w2")}
      ${fld("Hourly wage ($)", inp("offer.wage", S.offer.wage, "number"))}
      ${fld("Province", sel("offer.prov", provOpts("Choose"), S.offer.prov))}
      ${fld("City", inp("offer.city", S.offer.city))}
    </div>
    <label class="ck"><input type="checkbox" id="stHasRel" ${S.rels.length ? "checked" : ""}> Has family in Canada (18+, citizen or PR; theirs or the spouse's)${badge("rels")}</label>
    <div class="st-jobs" id="stRels"></div>
    <div class="st-relA"><button type="button" class="st-btn g" id="stAddRel">+ Relative</button></div>
  </section>

  <section class="st-sec st-spouse"><h3><i>6</i>Spouse or partner</h3><div class="st-g">
    ${fld("Spouse's highest education", sel("sp.edu", EDU.slice(1), S.sp.edu), "w2", "spEdu")}
    ${fld("Spouse's skilled work in Canada", sel("sp.cdn", [0, 1, 2, 3, 4, 5].map((i) => [String(i), i ? (i === 5 ? "5 years or more" : i + " year" + (i > 1 ? "s" : "")) : "None, or under 1 year"]), S.sp.cdn), "", "spCdn")}
    <label class="ck w3"><input type="checkbox" data-f="sp.study" ${S.sp.study ? "checked" : ""}> Spouse studied full-time in Canada for 2+ years</label>
  </div>${langBlock("sp.lang", "Spouse's language test", SP_T, "spLang")}</section>`;
}
function jobHtml(j, i) {
  const ok = /^\d{5}$/.test(j.noc), known = ok && NOCM[j.noc];
  const st = !j.counts ? `<span class="lowc">Not counted: ${esc(j.why || "excluded")}</span>`
    : !ok ? `<span class="bad">⚠ I couldn't identify the NOC for this job — punch the NOC manually.</span>`
    : !known ? `<span class="bad">⚠ ${esc(j.noc)} isn't a NOC 2021 code. Check it.</span>`
    : j.nocSrc === "manual" ? `<span class="ok">✓ Entered by you</span>`
    : j.nocConf === "low" ? `<span class="lowc">? Best guess — please confirm</span>${j.nocWhy ? ` <span class="st-note">${esc(j.nocWhy)}</span>` : ""}`
    : `<span class="ok">✓ Identified (${esc(j.nocConf || "medium")} confidence)</span>${j.nocWhy ? ` <span class="st-note">${esc(j.nocWhy)}</span>` : ""}`;
  const sugg = (j.nocConf === "high" && ok && known ? [] : j.sugg || []).filter((c) => c !== j.noc && NOCM[c]).slice(0, 4).map((c) => `<button type="button" class="st-sug" data-sug="${i}" data-c="${c}">${c} ${esc(nocTitle(c))}</button>`).join("");
  return `<div class="st-job ${j.counts && !(ok && known) ? "miss" : ""} ${j.counts ? "" : "off"}" data-j="${i}">
    ${fld("Job title", `<input data-k="title" value="${esc(j.title)}">`, "w2")}
    ${fld("Employer", `<input data-k="employer" value="${esc(j.employer)}">`, "w2")}
    ${fld("Where", `<select data-k="cdn"><option value="1"${j.cdn ? " selected" : ""}>In Canada</option><option value="0"${j.cdn ? "" : " selected"}>Outside Canada</option></select>`)}
    ${j.cdn ? fld("Province", `<select data-k="prov">${provOpts("Choose").map((o) => opt(o, j.prov)).join("")}</select>`) : fld("Country", `<input data-k="country" value="${esc(j.country)}">`)}
    ${fld("From", `<input data-k="start" type="month" value="${esc(j.start)}">`)}
    ${fld("To", `<input data-k="end" type="month" value="${esc(j.end)}" ${j.present ? "disabled" : ""}>`)}
    <label class="ck"><input type="checkbox" data-k="present" ${j.present ? "checked" : ""}> Still working here</label>
    ${fld("Hours / week", `<input data-k="hours" type="number" min="1" max="100" step="1" value="${esc(j.hours)}" placeholder="40">`)}
    ${fld("NOC 2021", `<input data-k="noc" list="stNocs" value="${esc(j.noc)}" placeholder="Code or job title">`, "w2")}
    <div class="w6 st-nocst">${ok && known ? `<b>${esc(nocLine(j.noc))}</b>${+j.noc[1] <= 3 ? "" : ` · <span class="lowc">TEER ${j.noc[1]}: not skilled work for CEC / FSW</span>`}` : ""} ${st}${sugg ? `<span class="st-note">Suggestions:</span>${sugg}` : ""}</div>
    ${j.duties ? `<div class="w6 st-note"><b>Duties:</b> ${esc(j.duties)}</div>` : ""}
    <div class="w6 st-acts"><label class="ck"><input type="checkbox" data-k="counts" ${j.counts ? "checked" : ""}> Count this job (paid, authorized, not as a full-time student, not self-employed in Canada)</label><button type="button" class="st-x" data-del="${i}" style="margin-left:auto">Remove job</button></div>
  </div>`;
}
function relHtml(r, i) {
  return `<div class="st-job" data-r="${i}" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    ${fld("Relation", `<select data-rk="rel">${REL.map((o) => opt(o, r.rel)).join("")}</select>`)}
    ${fld("Province", `<select data-rk="prov">${provOpts("Choose").map((o) => opt(o, r.prov)).join("")}</select>`)}
    ${fld("City", `<input data-rk="city" value="${esc(r.city)}">`)}
    <button type="button" class="st-x" data-delr="${i}" style="align-self:end;justify-self:start">Remove</button></div>`;
}
function drawJobs() {
  const J = ROOT.querySelector("#stJobs");
  J.innerHTML = ST.jobs.map(jobHtml).join("") || `<p class="st-note">No jobs found in the document. Add them with the button below.</p>`;
  ROOT.querySelector("#stRels").innerHTML = ST.rels.map(relHtml).join("");
}
function missing() {
  const m = {};
  m.dob = !ST.dob && ST.age === "";
  m.mar = !ST.mar; m.edu = !ST.edu;
  const okL = (l) => l.t !== "none" && AB4.every(([k]) => l[k] !== "");
  m.en = !okL(ST.en) && !okL(ST.fr); m.fr = false;
  m.jobs = ST.jobs.filter((j) => j.counts && !(/^\d{5}$/.test(j.noc) && NOCM[j.noc])).length;
  m.dates = ST.jobs.filter((j) => j.counts && (!j.start || (!j.present && !j.end))).length;
  return m;
}
function syncUi() {
  const q = (s) => ROOT.querySelector(s), qa = (s) => ROOT.querySelectorAll(s);
  qa(".st-mar").forEach((e) => e.classList.toggle("st-hide", ST.mar !== "married"));
  q(".st-spouse").classList.toggle("st-hide", !(ST.mar === "married" && ST.spAcc === "yes"));
  qa(".st-cdnEdu").forEach((e) => e.classList.toggle("st-hide", ST.cdnEdu === "none"));
  q(".st-eca").classList.toggle("st-hide", !ST.edu || ST.edu === "none" || ST.eduWhere !== "XX");
  q(".st-offer").classList.toggle("st-hide", !ST.offer.has);
  const hr = q("#stHasRel").checked; q("#stRels").classList.toggle("st-hide", !hr); q(".st-relA").classList.toggle("st-hide", !hr);
  const age = q('[data-f="age"]');
  if (ST.dob) { const a = ageAt(ST.dob, TODAY()); ST.age = a == null ? "" : String(a); age.value = ST.age; age.readOnly = true; } else age.readOnly = false;
  const M = missing();
  qa("[data-req]").forEach((e) => { const k = e.dataset.req; const miss = !!M[k]; e.classList.toggle("miss", miss); });
  qa(".st-nb").forEach((e) => e.classList.toggle("st-hide", !M[e.dataset.nb]));
  q(".st-enask").classList.toggle("st-hide", !M.en);
  const H = ENG.X.H;
  qa("[data-clb]").forEach((e) => { const [p, k] = [e.dataset.clb.slice(0, e.dataset.clb.lastIndexOf(".")), e.dataset.clb.split(".").pop()]; const l = p.split(".").reduce((o, x) => o[x], ST); const v = l[k]; e.textContent = l.t === "none" || v === "" ? "" : `${["tef", "tcf"].includes(l.t) || p === "fr" ? "NCLC" : "CLB"} ${H.toClb(l.t, k, v) || "<4"}`; });
  qa(".st-lang").forEach((b) => { const p = b.querySelector("select").dataset.f.replace(/\.t$/, ""); const l = p.split(".").reduce((o, x) => o[x], ST); b.querySelectorAll("input").forEach((i) => (i.disabled = l.t === "none")); });
  const nt = q('[data-nt="offer"]'); if (nt) nt.textContent = nocLine(ST.offer.noc);
}
function setPath(path, val) { const ks = path.split("."), last = ks.pop(); const o = ks.reduce((a, k) => a[k], ST); o[last] = val; }
const codeOf = (v) => ((String(v || "").match(/\b\d{5}\b/) || [""])[0]);

/* ---------------- results ---------------- */
function cutFor(base) {
  const row = (n) => base.fed.rows.find((r) => r.name === n);
  const c = row("Canadian Experience Class"), f = row("Federal Skilled Worker Program");
  return (base.cec.ok && c && c.cut) || (f && f.cut) || (c && c.cut) || null;
}
function resultsHtml() {
  const base = score(ST), H = ENG.X.H, R = base.fed.R, M = missing(), cut = cutFor(base);
  const P = base.P, D = base.D;
  const miss = [M.dob && "date of birth or age", M.mar && "marital status", M.edu && "education", M.en && "English or French test scores", M.jobs && `NOC for ${M.jobs} job${M.jobs > 1 ? "s" : ""}`, M.dates && `dates for ${M.dates} job${M.dates > 1 ? "s" : ""}`].filter(Boolean);
  const prog = (name, short, c, extra) => {
    const bad = c.items.filter(([o]) => o === false).map(([, t]) => t);
    return `<div class="st-p ${c.ok ? "yes" : "no"}"><h4>${short}<span class="v">${c.ok ? "✓ QUALIFIES" : "✕ NOT YET"}</span></h4>
      <div class="st-note" style="color:var(--fg)">${c.ok ? `<b>This person qualifies for ${name}.</b> CRS <b>${base.crs}</b>.` : `Doesn't meet ${name} yet${bad.length ? ": " + esc(bad[0].replace(/<[^>]+>/g, "")) : ""}.`}${extra || ""}</div>
      <ul class="st-ul st-ck">${c.items.map(([o, t]) => `<li class="${o === true ? "y" : o === false ? "x" : "q"}">${t}</li>`).join("")}</ul></div>`;
  };
  const fswP = (R.panels || [])[0] || {};
  const head = `<div class="st-hero">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><span class="st-note">Smart Tool · ${new Date().toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}${DOC ? " · " + esc(DOC.file.name) : ""}</span><h2>${ST.ref ? esc(ST.ref) : "CRS assessment"}</h2></div>
      <div class="st-acts st-noprint"><button type="button" class="st-btn g" id="stPrint">Print / save as PDF</button></div></div>
    ${miss.length ? `<div class="st-prov"><b>Provisional:</b> still missing ${miss.join(", ")}. Fill the highlighted fields above and the score updates instantly.</div>` : ""}
    <div class="st-crs"><div class="big"><small>Express Entry CRS</small>${base.crs}</div>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:.88rem">
        <span>${base.ee ? "✓ Can enter the Express Entry pool" : "✕ Doesn't meet CEC, FSW or FST yet — can't enter the pool"}</span>
        ${cut ? `<span>Latest ${esc(cut.stream)} cut-off: <b>${cut.score}</b> (${fmtD(cut.date)}) · gap <b class="st-gain ${base.crs >= cut.score ? "p" : "m"}">${base.crs >= cut.score ? "+" : ""}${base.crs - cut.score}</b></span>` : `<span class="st-note">No recent matching draw in the feed.</span>`}
        <span class="st-note">Age ${P.age ?? "?"} · ${esc(EDUN[ST.edu] || "education not set")} · English ${D.en ? "CLB " + D.en.min : "—"} · French ${D.fr ? "NCLC " + D.fr.min : "—"} · ${(+D.cdn10.toFixed(2))} yrs skilled Canadian · ${(+D.for10.toFixed(2))} yrs skilled foreign</span>
      </div></div>
    <div class="st-pg">
      ${prog("the Canadian Experience Class (CEC)", "Canadian Experience Class", base.cec)}
      ${prog("the Federal Skilled Worker Program (FSW)", "Federal Skilled Worker", base.fsw, fswP.total != null ? ` FSW selection grid: <b>${fswP.total}/100</b> (pass mark 67).` : "")}
      ${prog("the Federal Skilled Trades Program (FST)", "Federal Skilled Trades", base.fst)}
    </div></div>`;
  // breakdown + FSW grid
  const bd = `<section class="st-grp"><h3>CRS points breakdown<small>Rules from November 3, 2026</small></h3><div class="st-two" style="padding:0 0 8px"><div style="overflow-x:auto"><table class="st-t"><tbody>${(R.rows || []).map((x) => x[3] ? `<tr class="h"><td colspan="2">${x[0]}</td></tr>` : `<tr><td>${x[0]}</td><td class="n">${x[1]}${x[2] != null ? `<small style="display:inline"> / ${x[2]}</small>` : ""}</td></tr>`).join("")}<tr class="tot"><td>Total CRS</td><td class="n">${base.crs} / 1200</td></tr></tbody></table></div>
    <div style="overflow-x:auto"><table class="st-t"><tbody><tr class="h"><td colspan="2">FSW 67-point selection grid</td></tr>${(fswP.rows || []).map((x) => `<tr><td>${x[0]}</td><td class="n">${x[1]}<small style="display:inline"> / ${x[2]}</small></td></tr>`).join("")}<tr class="tot"><td>Total</td><td class="n">${fswP.total ?? "—"} / 100</td></tr></tbody></table>
    ${(R.notes || []).length ? `<ul class="st-ul" style="padding:8px 12px 0 30px">${R.notes.slice(0, 4).map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}</div></div></section>`;
  // draws by program and category
  const rows = base.fed.rows.filter((r) => r.group.startsWith("Federal · Express"));
  const draws = `<section class="st-grp"><h3>Against the latest draws<small>${ENG.X.draws.length ? "Live draws feed" : "Draws feed didn't load"}</small></h3><div style="overflow-x:auto"><table class="st-t"><thead><tr><th>Program / category</th><th class="n">Score</th><th class="n">Latest cut-off</th><th class="n">Gap</th><th>Chances</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}${r.eligible === false && r.why.length ? `<small style="color:#b3412e">${esc(String(r.why[0]).replace(/<[^>]+>/g, ""))}</small>` : ""}</td><td class="n">${r.score ?? "—"}</td><td class="n">${r.cut ? `${r.cut.score}<small>${fmtD(r.cut.date)}</small>` : "<small>No recent draw</small>"}</td><td class="n">${r.gap == null ? "—" : `<span class="st-gain ${r.gap >= 0 ? "p" : "m"}">${r.gap >= 0 ? "+" : ""}${r.gap}</span>`}</td><td><span class="st-ch ${r.chance[0]}">${r.chance[1]}</span></td></tr>`).join("")}</tbody></table></div></section>`;
  // NOC summary
  const F = P._fte;
  const nocs = `<section class="st-grp"><h3>Occupations (NOC 2021) found<small>${ST.jobs.length} job${ST.jobs.length === 1 ? "" : "s"}</small></h3><div style="overflow-x:auto"><table class="st-t"><thead><tr><th>Job</th><th>NOC</th><th>Where / when</th><th class="n">Counted</th></tr></thead><tbody>${ST.jobs.map((j, i) => {
    const f = F.find((x) => x.i === i), ok = /^\d{5}$/.test(j.noc) && NOCM[j.noc], hw = ok && ENG.X.HW[j.noc];
    return `<tr><td><b>${esc(j.title || "—")}</b><small>${esc(j.employer || "")}</small></td><td>${ok ? `<b>${j.noc}</b> ${esc(nocTitle(j.noc))}<small>TEER ${j.noc[1]}${+j.noc[1] <= 3 ? " · skilled" : " · not skilled for CEC/FSW"}${hw ? ` · high-wage list tier ${hw[1]}` : ""}</small>` : `<span style="color:#b3412e;font-weight:700">⚠ Not identified — punch the NOC manually</span>`}</td><td>${j.cdn ? esc(PNAME[j.prov] || "Canada") : esc(j.country || "Outside Canada")}<small>${esc(fmtYm(j.start) || "?")} – ${j.present ? "present" : esc(fmtYm(j.end) || "?")}${j.hours ? ` · ${esc(j.hours)} h/wk` : ""}</small></td><td class="n">${!j.counts ? `<small>${esc(j.why || "Excluded")}</small>` : f && ok ? `${(+f.yrs.toFixed(2))} yrs` : f ? "<small>Needs NOC</small>" : "<small>Needs dates</small>"}</td></tr>`; }).join("") || `<tr><td colspan="4" class="st-note">No work experience entered.</td></tr>`}</tbody></table></div></section>`;
  // what moves the score
  const sc = scenarios(base);
  const good = sc.filter((x) => !x.risk && (x.gain > 0 || (!base.ee && x.r.ee))).sort((a, b) => (a.grp === "Nomination") - (b.grp === "Nomination") || b.gain - a.gain);
  const risks = sc.filter((x) => x.risk || (x.gain < 0 && x.grp !== "Spouse"));
  const note = (x) => [!base.ee && x.r.ee ? `<b style="color:#11603b">Unlocks ${x.r.cec.ok ? "CEC" : x.r.fsw.ok ? "FSW" : "FST"}</b>` : "", !base.cec.ok && x.r.cec.ok && base.ee ? `<b style="color:#11603b">Becomes CEC-eligible</b>` : "", cut && x.r.crs >= cut.score && base.crs < cut.score ? `<b style="color:#11603b">Beats the latest cut-off (${cut.score})</b>` : ""].filter(Boolean).join(" · ");
  const what = `<section class="st-grp"><h3>Predictions: what raises the score<small>Each line changes one thing and rescores with the same grids</small></h3><div style="overflow-x:auto"><table class="st-t"><thead><tr><th>If…</th><th class="n">New CRS</th><th class="n">Change</th><th>Effect</th></tr></thead><tbody>${good.map((x) => `<tr><td><b>${esc(x.label)}</b><small>${x.detail}</small></td><td class="n"><b>${x.r.crs}</b></td><td class="n"><span class="st-gain p">+${x.gain}</span></td><td>${note(x) || `<small>${x.r.ee ? "Eligible for " + [x.r.cec.ok && "CEC", x.r.fsw.ok && "FSW", x.r.fst.ok && "FST"].filter(Boolean).join(", ") : "Still not eligible for a program"}</small>`}</td></tr>`).join("") || `<tr><td colspan="4" class="st-note">No single change raises the score — it's already at the top of every factor this tool can test.</td></tr>`}${risks.map((x) => `<tr><td><b style="color:#b3412e">${esc(x.label)}</b><small>${x.detail}</small></td><td class="n">${x.r.crs}</td><td class="n"><span class="st-gain m">${x.gain}</span></td><td><small>Watch out</small></td></tr>`).join("")}</tbody></table></div></section>`;
  // projection
  const pj = projection(base);
  const proj = `<section class="st-grp"><h3>Score over the next 3 years<small>Nothing changes except time: birthdays, work they're still doing, the 10-year window and test expiry</small></h3><div class="in">
    ${chart(pj.pts, cut)}
    <ul class="st-ev">${pj.ev.map((e) => `<li class="${e.flag || ""}"><span>${fmtM(e.at)}</span><span>${e.d != null ? `CRS ${e.d > 0 ? "rises" : "drops"} to <b>${e.crs}</b> (${e.d > 0 ? "+" : ""}${e.d}): ${esc(e.why)}` : esc(e.why)}</span><span>${e.crs != null && e.d == null ? "CRS " + e.crs : ""}</span></li>`).join("") || `<li><span>—</span><span>No change in the next 36 months${ST.dob ? "" : " (add the date of birth to see birthday changes)"}.</span><span></span></li>`}</ul>
    <p class="st-note">Assumes they keep every job marked “still working here” at the same hours${ST.dob ? "" : "; without a date of birth, age is moved up once a year"}. Open circles are months where the person can't enter the pool.</p></div></section>`;
  // provincial bonus
  let pnp = "";
  try {
    const pr = [...ENG.provinces(D, base.fed), ...ENG.pilots(D)].filter((r) => r.eligible === true && !r.whatIf).slice(0, 10);
    pnp = `<section class="st-grp"><h3>Also eligible now (provincial and pilots)<small>Full detail in the Profile scanner tab</small></h3><div style="overflow-x:auto"><table class="st-t"><tbody>${pr.map((r) => `<tr><td><b>${esc(r.name)}</b><small>${esc(r.group)}${r.sub ? " · " + esc(r.sub) : ""}</small></td><td class="n">${r.score != null ? `${r.score}${r.max ? `<small>of ${r.max}</small>` : ""}` : ""}</td><td><span class="st-ch ${r.chance[0]}">${r.chance[1]}</span></td></tr>`).join("") || `<tr><td class="st-note">No provincial or pilot stream fits without a job offer or more information.</td></tr>`}</tbody></table></div></section>`;
  } catch (e) { console.warn("provinces", e); }
  return head + bd + draws + nocs + what + proj + pnp + docHtml();
}
function docHtml() {
  const F = [...(DOC ? DOC.flags : [])];
  if (ST.en.t === "none" && ST.fr.t === "none") F.unshift(["ask", "No language test: ask for IELTS General, CELPIP or PTE Core (or TEF / TCF Canada)."]);
  const age = ST.dob ? ageAt(ST.dob, TODAY()) : +ST.age;
  if (ST.dob && age >= 29 && age < 45) { const nb = new Date(ST.dob + "T00:00:00Z"); nb.setUTCFullYear(TODAY().getUTCFullYear()); if (nb < TODAY()) nb.setUTCFullYear(nb.getUTCFullYear() + 1); const days = Math.round((nb - TODAY()) / 864e5); if (days <= 180) F.unshift(["warn", `Turns ${age + 1} on ${fmtD(isoDay(nb))} (${days} days): age points drop. Get the profile in and an ITA before then if possible.`]); }
  if (!DOC && !F.length) return "";
  const r = DOC ? DOC.raw : null;
  const list = (a) => (a && a.length ? `<div class="st-tags">${a.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : "—");
  const lab = { ask: "Ask", warn: "Check", info: "Note" };
  return `<section class="st-grp"><h3>Everything else the document says<small>${DOC ? esc(DOC.file.kind) : ""}</small></h3><div class="in">
    ${F.length ? `<ul class="st-flags">${F.map(([k, t]) => `<li class="${k}"><b>${lab[k] || "Note"}</b>${t}</li>`).join("")}</ul>` : ""}
    ${r ? `<dl class="st-dl">
      ${r.person.nationality ? `<dt>Nationality</dt><dd>${esc(r.person.nationality)}</dd>` : ""}
      ${r.person.country_of_residence ? `<dt>Lives in</dt><dd>${esc([r.person.current_city, r.person.country_of_residence].filter(Boolean).join(", "))}</dd>` : ""}
      ${(r.education || []).length ? `<dt>Education</dt><dd>${r.education.map((e) => `${esc(e.credential || e.level)}${e.field ? " (" + esc(e.field) + ")" : ""}${e.institution ? " · " + esc(e.institution) : ""}${e.country ? ", " + esc(e.country) : ""}${e.end_date ? " · " + esc(fmtYm(e.end_date)) : ""}${e.completed === false ? " · in progress" : ""}${e.has_eca ? " · ECA" + (e.eca_equivalent ? ": " + esc(e.eca_equivalent) : "") : ""}`).join("<br>")}</dd>` : ""}
      ${(r.language_tests || []).length ? `<dt>Language tests</dt><dd>${r.language_tests.map((t) => `${esc(t.test.replace(/_/g, " "))}: L ${t.listening ?? "?"} R ${t.reading ?? "?"} W ${t.writing ?? "?"} S ${t.speaking ?? "?"}${t.overall != null ? " · overall " + t.overall : ""}${t.test_date ? " · " + fmtD(t.test_date) : ""}`).join("<br>")}</dd>` : ""}
      ${(r.family_in_canada || []).length ? `<dt>Family in Canada</dt><dd>${r.family_in_canada.map((f) => esc(`${f.relation.replace(/_/g, " ")}${f.city || f.province ? " in " + [f.city, f.province].filter(Boolean).join(", ") : ""}`)).join("; ")}</dd>` : ""}
      ${r.job_offer && r.job_offer.has_offer ? `<dt>Job offer</dt><dd>${esc([r.job_offer.job_title, r.job_offer.employer, r.job_offer.city, r.job_offer.province].filter(Boolean).join(" · "))}${r.job_offer.hourly_wage_cad ? " · $" + r.job_offer.hourly_wage_cad + "/h" : ""}</dd>` : ""}
      <dt>Skills</dt><dd>${list(r.skills)}</dd>
      <dt>Certifications / licences</dt><dd>${list(r.certifications_licences)}</dd>
      ${(r.other_facts || []).length ? `<dt>Other</dt><dd><ul class="st-ul">${r.other_facts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></dd>` : ""}
    </dl>` : ""}
    <p class="st-note">Estimate only, from the document and published IRCC rules and draws at the time of the check. Not legal or immigration advice.</p></div></section>`;
}
function recalc() {
  if (!ROOT || !ST) return;
  const out = ROOT.querySelector("#stOut");
  try { out.innerHTML = resultsHtml(); } catch (e) { console.error(e); out.innerHTML = `<div class="st-err">Couldn't score this profile: ${esc(e.message)}</div>`; return; }
  const p = out.querySelector("#stPrint"); if (p) p.onclick = () => printOut(out);
}
const later = () => { clearTimeout(TMR); TMR = setTimeout(recalc, 350); };
function printOut(out) {
  const w = window.open("", "_blank"); if (!w) return alert("Allow pop-ups to print.");
  const c = out.cloneNode(true); c.querySelectorAll(".st-noprint").forEach((e) => e.remove());
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>CRS assessment${ST.ref ? " · " + esc(ST.ref) : ""}</title><meta name="robots" content="noindex">
    <style>:root{--bg:#f7f9f8;--surface:#fff;--fg:#1b2628;--muted:#5a696b;--line:#d3dcda;--accent:#3f7a72;--accent-soft:#dcebe7;--display:system-ui,sans-serif;--body:system-ui,sans-serif}
    body{font-family:var(--body);color:var(--fg);margin:24px;font-size:13px}${css}.st-grp,.st-hero{break-inside:avoid;margin-bottom:14px}@page{margin:14mm}</style></head>
    <body><div class="st">${c.innerHTML}</div><p class="st-note" style="margin-top:16px">Prepared by WorkerPool.</p></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

/* ---------------- the NOC pass ---------------- */
async function resolveNocs(jobs) {
  await loadNocs();
  const cand = jobs.map((j) => { const m = matchNoc(j.title, `${j.duties} ${j.employer}`); const codes = m.map((x) => x.c); if (j.aiNoc && NOCM[j.aiNoc] && !codes.includes(j.aiNoc)) codes.unshift(j.aiNoc); return { m, codes: codes.slice(0, 14) }; });
  let picks = [];
  if (AI && jobs.length) {
    try { picks = (await post({ mode: "noc", jobs: jobs.map((j, i) => ({ title: j.title, employer: j.employer, duties: j.duties, candidates: cand[i].codes.map((c) => [c, NOCM[c].t, NOCM[c].ill.slice(0, 6).join(", ")]) })) }, 50000)).picks || []; }
    catch (e) { console.warn("noc pass", e); }
  }
  jobs.forEach((j, i) => {
    const p = picks.find((x) => x.i === i), top = cand[i].m[0];
    j.sugg = [...new Set([p && p.noc, j.aiNoc, ...cand[i].m.filter((x) => x.s >= 0.75).slice(0, 4).map((x) => x.c)].filter((c) => c && NOCM[c]))].slice(0, 4);
    if (p && p.noc && p.confidence !== "low") Object.assign(j, { noc: p.noc, nocSrc: "ai", nocConf: p.confidence, nocWhy: p.reason || "" });
    else if (top && top.s >= 1.2) Object.assign(j, { noc: top.c, nocSrc: "match", nocConf: "medium", nocWhy: "The job title is a NOC example title" });
    else if (p && p.noc) Object.assign(j, { noc: p.noc, nocSrc: "ai", nocConf: "low", nocWhy: p.reason || "" });
    else if (j.aiNoc && NOCM[j.aiNoc] && j.aiConf === "high" && cand[i].m.some((x) => x.c === j.aiNoc)) Object.assign(j, { noc: j.aiNoc, nocSrc: "ai", nocConf: "medium", nocWhy: "Read from the duties" });
    else if (top && top.s >= 0.85) Object.assign(j, { noc: top.c, nocSrc: "match", nocConf: "low", nocWhy: "Closest NOC example title" });
    else Object.assign(j, { noc: "", nocSrc: "", nocConf: "", nocWhy: "" });
  });
}

/* ---------------- flow ---------------- */
function uploadHtml() {
  return `<div class="st-priv st-noprint"><span>🔒</span><div><b>Confidential.</b> The file opens in this browser tab. Only its text (or page images for a scanned file) is sent to Cloudflare Workers AI to be read; nothing is saved, logged or emailed, and everything is gone when you lock the console or close the tab.${AI === false ? " <b>Workers AI isn't connected right now, so the tool reads what it can from the text itself — check every field.</b>" : ""}</div></div>
  <section class="st-sec st-noprint" id="stUp"><h3>Smart Tool <span class="st-note" style="font-weight:500">One CV or information sheet → CRS score, CEC / FSW check, NOC and predictions</span></h3>
    <label class="st-drop" id="stDrop"><input type="file" id="stFile" accept=".pdf,.docx,.xlsx,.xlsm,.txt,.csv,.md,.jpg,.jpeg,.png,.webp" hidden>
      <b>Upload one document</b><span class="st-note">CV / resume or client information sheet · PDF, Word (.docx), Excel (.xlsx), text, or a photo · drop it here or click</span>
      <div class="st-steps" id="stSteps"></div></label>
    <div class="st-acts"><span class="st-err" id="stErr"></span><button type="button" class="st-btn g" id="stBlank" style="margin-left:auto">Start without a document</button><button type="button" class="st-btn g st-hide" id="stNew">New document</button></div>
  </section>
  <div id="stForm" class="st"></div>
  <div id="stOut" class="st"></div>`;
}
const STEPS = ["Opening the file", "Reading every detail", "Identifying the NOCs", "Scoring"];
let TICK = 0;
function steps(n, done) {
  clearInterval(TICK); const el = ROOT.querySelector("#stSteps"), t0 = Date.now();
  const draw = () => { el.innerHTML = STEPS.map((s, i) => `<span class="${i < n || done ? "ok" : i === n ? "on" : ""}">${i < n || done ? "✓ " : ""}${s}${i === n && !done && Date.now() - t0 > 3000 ? ` · ${Math.round((Date.now() - t0) / 1000)}s` : ""}</span>`).join("") + (n === 1 && !done && Date.now() - t0 > 20000 ? `<span style="border:0">A long CV can take up to a minute…</span>` : ""); };
  draw(); if (!done) TICK = setInterval(() => { if (!ROOT) return clearInterval(TICK); draw(); }, 1000);
}
async function handle(file) {
  if (BUSY || !file) return; BUSY = true;
  const err = ROOT.querySelector("#stErr"); err.textContent = "";
  ROOT.querySelector("#stForm").innerHTML = ""; ROOT.querySelector("#stOut").innerHTML = "";
  try {
    steps(0); const f = await openFile(file);
    const meta = { name: file.name, kind: f.kind };
    steps(1);
    let r = null;
    if (AI !== false) { try { r = (await post({ mode: "read", text: f.text, images: f.images, today: isoDay(TODAY()) })).result; } catch (e) { if (e.code === "ai-off") AI = false; else err.textContent = e.message + " The fields below come from the text only — check every field and add the jobs."; } }
    const loc = localFacts(f.text);
    if (!r) r = { person: {}, spouse: {}, education: [], language_tests: [], work: [], job_offer: {}, family_in_canada: [], skills: [], certifications_licences: [], other_facts: [], issues: f.images.length && !f.text ? ["This is a scanned file and the AI reader isn't available: enter the details by hand."] : [] };
    DOC = fromDoc(r, loc, meta); ST = DOC.S;
    steps(2); await resolveNocs(ST.jobs);
    steps(3); mountForm(); steps(4, true);
    ROOT.querySelector("#stNew").classList.remove("st-hide"); ROOT.querySelector("#stBlank").classList.add("st-hide");
  } catch (e) { console.error(e); clearInterval(TICK); err.textContent = "Couldn't read that file: " + e.message + "."; ROOT.querySelector("#stSteps").innerHTML = ""; }
  BUSY = false; f0();
}
function f0() { const i = ROOT && ROOT.querySelector("#stFile"); if (i) i.value = ""; }
function mountForm() {
  const F = ROOT.querySelector("#stForm");
  F.innerHTML = formHtml();
  F.querySelector("#stNocs").innerHTML = (NOCL || []).map((n) => `<option value="${n.c} – ${esc(n.t)}"></option>`).join("");
  drawJobs(); syncUi(); recalc();
  F.addEventListener("input", onInput); F.addEventListener("change", onChange); F.addEventListener("click", onClick);
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.f) { const v = t.type === "checkbox" ? t.checked : t.value; if (/\.(noc)$/.test(t.dataset.f)) { if (codeOf(v)) setPath(t.dataset.f, codeOf(v)); } else setPath(t.dataset.f, v); }
  const jr = t.closest("[data-j]"), rr = t.closest("[data-r]");
  if (jr && t.dataset.k && !["noc", "cdn", "present", "counts"].includes(t.dataset.k)) ST.jobs[+jr.dataset.j][t.dataset.k] = t.value;
  if (rr && t.dataset.rk) ST.rels[+rr.dataset.r][t.dataset.rk] = t.value;
  syncUi(); later();
}
function onChange(e) {
  const t = e.target, jr = t.closest("[data-j]");
  if (t.id === "stHasRel") { if (t.checked && !ST.rels.length) ST.rels.push({ rel: "sibling", prov: "", city: "" }); if (!t.checked) ST.rels = []; drawJobs(); }
  if (t.dataset.f === "offer.noc") { const c = codeOf(t.value); ST.offer.noc = c; if (c) t.value = c; }
  if (t.dataset.f && /\.t$/.test(t.dataset.f)) syncUi();
  if (jr && t.dataset.k) {
    const j = ST.jobs[+jr.dataset.j], k = t.dataset.k;
    if (k === "noc") { const c = codeOf(t.value); if (c) { j.noc = c; j.nocSrc = "manual"; j.nocConf = "high"; j.nocWhy = ""; } else if (t.value.trim()) { const m = matchNoc(t.value, j.duties); j.sugg = m.filter((x) => x.s >= 0.3).slice(0, 5).map((x) => x.c); j.noc = ""; j.nocConf = ""; } else j.noc = ""; drawJobs(); }
    else if (k === "cdn") { j.cdn = t.value === "1"; if (j.cdn) j.country = "Canada"; else if (j.country === "Canada") j.country = ""; drawJobs(); }
    else if (k === "present") { j.present = t.checked; if (j.present) j.end = ""; drawJobs(); }
    else if (k === "counts") { j.counts = t.checked; if (j.counts) j.why = ""; drawJobs(); }
    else if (k === "title" && !j.noc) { const m = matchNoc(j.title, j.duties); j.sugg = m.filter((x) => x.s >= 0.3).slice(0, 5).map((x) => x.c); drawJobs(); }
  }
  syncUi(); later();
}
function onClick(e) {
  const s = e.target.closest("[data-sug]"), d = e.target.closest("[data-del]"), dr = e.target.closest("[data-delr]");
  if (s) { const j = ST.jobs[+s.dataset.sug]; j.noc = s.dataset.c; j.nocSrc = "manual"; j.nocConf = "high"; j.nocWhy = ""; drawJobs(); syncUi(); later(); }
  if (d) { ST.jobs.splice(+d.dataset.del, 1); drawJobs(); syncUi(); later(); }
  if (dr) { ST.rels.splice(+dr.dataset.delr, 1); drawJobs(); syncUi(); later(); }
  if (e.target.id === "stAddJob") { ST.jobs.push(newJob()); drawJobs(); syncUi(); later(); }
  if (e.target.id === "stAddRel") { ST.rels.push({ rel: "sibling", prov: "", city: "" }); drawJobs(); syncUi(); later(); }
}
function mount(body) {
  ROOT = document.createElement("div"); ROOT.className = "st"; ROOT.id = "stRoot";
  ROOT.innerHTML = `<style>${css}</style>${uploadHtml()}`;
  body.innerHTML = ""; body.appendChild(ROOT);
  const drop = ROOT.querySelector("#stDrop"), file = ROOT.querySelector("#stFile");
  file.onchange = () => handle(file.files[0]);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("on"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("on"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files; if (f.length > 1) { ROOT.querySelector("#stErr").textContent = "One document at a time: the first one is being read."; } if (f[0]) handle(f[0]); });
  ROOT.querySelector("#stBlank").onclick = async () => { await loadNocs(); DOC = null; ST = blank(); ST.jobs = [newJob()]; mountForm(); ROOT.querySelector("#stBlank").classList.add("st-hide"); ROOT.querySelector("#stNew").classList.remove("st-hide"); };
  ROOT.querySelector("#stNew").onclick = () => { DOC = null; ST = null; mount(body); };
}
async function load(key, body) {
  KEY = key;
  if (ROOT && body.contains(ROOT)) return; // the console refreshes tabs every minute: keep what's on screen
  if (ROOT) { body.innerHTML = ""; body.appendChild(ROOT); return; }
  body.innerHTML = `<div class="wpa-empty">Loading the scoring grids, NOC list and latest draws…</div>`;
  try {
    if (!window.WPScan || !window.WPScan.engine) throw new Error("the Profile scanner engine didn't load");
    [ENG] = await Promise.all([window.WPScan.engine(), loadNocs()]);
    if (AI == null) AI = await fetch("/api/tools/smart-read", { headers: { "x-admin-key": KEY } }).then((r) => r.json()).then((j) => !!j.ai).catch(() => null);
  } catch (e) { body.innerHTML = `<div class="wpa-empty">The Smart Tool couldn't load: ${esc(e.message)}. Refresh the page.</div>`; return; }
  mount(body);
}
function leave() { ROOT = null; ST = null; DOC = null; KEY = ""; } // on lock: forget the person
window.WPSmart = { load, leave, _test: { fromDoc, localFacts, parseDate, matchNoc, loadNocs, buildP, fte, score: (s, o) => score(s, o), scenarios: (b) => scenarios(b), projection, setState: (s) => (ST = s), state: () => ST } };
})();
