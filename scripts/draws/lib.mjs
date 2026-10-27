// Small helpers for reading official draw pages without any third-party packages.
export const OFFICIAL_HOSTS = [
  // Federal
  "canada.ca",
  // Provinces and territories (official government domains only)
  "welcomebc.ca", "gov.bc.ca", "alberta.ca", "saskatchewan.ca", "immigratemanitoba.com", "gov.mb.ca", "ontario.ca",
  "quebec.ca", "gnb.ca", "novascotia.ca", "liveinnovascotia.com", "princeedwardisland.ca", "gov.nl.ca", "yukon.ca",
  "immigratenwt.ca", "gov.nt.ca",
  // RCIP / FCIP community partners designated by IRCC
  "investsudbury.ca", "gotothunderbay.ca", "claresholm.ca",
];
export function isOfficial(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return new URL(url).protocol === "https:" && OFFICIAL_HOSTS.some((d) => h === d || h.endsWith("." + d));
  } catch { return false; }
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WorkerPoolDraws/1.0 (+https://workerpool.ca)";
export async function get(url) {
  if (!isOfficial(url)) throw new Error("Not an approved government source: " + url);
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-CA,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
      if (res.status < 500) break;
    } catch (e) { if (attempt === 3) throw e; }
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  if (!isOfficial(res.url)) throw new Error("Redirected away from an approved government source: " + res.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Binary download (PDFs) from an approved government source.
export async function getBuffer(url) {
  if (!isOfficial(url)) throw new Error("Not an approved government source: " + url);
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/pdf,*/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!isOfficial(res.url)) throw new Error("Redirected away from an approved government source: " + res.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ocirc: "ô", hellip: "…" };
export function decode(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export const clean = (s) => decode(String(s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\\[nrt]/g, " ").replace(/[\s\u00a0\u200b]+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").replace(/ ([,.;:])/g, "$1").trim();
export const stripScripts = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, "");

// Every <table> as { ctx, head: [...], rows: [[...]] }, with rowspans filled in.
// ctx is the nearest heading/caption/button text before the table (often the stream name).
export function tables(html) {
  html = stripScripts(html);
  const out = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let m;
  while ((m = re.exec(html))) {
    const before = html.slice(Math.max(0, m.index - 6000), m.index);
    const heads = [...before.matchAll(/<(h[1-6]|caption|button|summary|strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((x) => clean(x[2])).filter((x) => x && x.length < 160);
    const cap = (m[0].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i) || [])[1];
    const ctx = cap ? clean(cap) : heads.length ? heads[heads.length - 1] : "";
    const grid = [], spans = [];
    const trs = [...m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
    trs.forEach((tr, ri) => {
      const row = [];
      const cells = [...tr[0].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
      let ci = 0;
      const fillSpans = () => { while (spans[ci] && spans[ci].left > 0) { row[ci] = spans[ci].text; spans[ci].left--; ci++; } };
      for (const c of cells) {
        fillSpans();
        const text = clean(c[3].replace(/<br\s*\/?>|<\/li>/gi, " ; ")).replace(/(\s*;\s*)+/g, "; ").replace(/^; |;$/g, "").replace(/;\s*$/, "");
        const rs = parseInt((c[2].match(/rowspan\s*=\s*["']?(\d+)/i) || [])[1]) || 1;
        const cs = parseInt((c[2].match(/colspan\s*=\s*["']?(\d+)/i) || [])[1]) || 1;
        for (let k = 0; k < cs; k++) { row[ci] = text; if (rs > 1) spans[ci] = { text, left: rs - 1 }; ci++; }
      }
      fillSpans();
      grid.push(row);
    });
    if (grid.length < 2) continue;
    const head = grid[0];
    let rows = grid.slice(1).filter((r) => r.some((x) => x));
    // Rows that are shorter than the header (a visual rowspan written without rowspan=) borrow leading cells from the row above.
    rows = rows.map((r, i, all) => {
      if (r.length >= head.length || i === 0 || isoDate(r[0])) return r; // starts with its own date: just a missing cell
      const prev = all[i - 1];
      return [...prev.slice(0, head.length - r.length), ...r];
    });
    out.push({ ctx, head, rows });
  }
  return out;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
// "October 15, 2026", "Oct. 15, 2026", "15 octobre 2026", "2026-10-15" → "2026-10-15"
const FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const mon = (w) => { w = String(w).toLowerCase(); return MONTHS[w] || FULL.findIndex((f) => w.length >= 3 && f.startsWith(w)) + 1; };
export function isoDate(s) {
  s = String(s || "").replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/\s+/g, " ");
  let m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // "October 15, 2026"; ranges like "September 15 to 18, 2026" or "August 10 and 20, 2026" use the first day
  m = s.match(/\b([A-Za-zéû]+)\.? (\d{1,2})(?:,? (?:to|and|–|-|&) (?:[A-Za-z]+ )?\d{1,2})?,? (20\d\d)\b/);
  if (m && mon(m[1])) return `${m[3]}-${String(mon(m[1])).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/\b(\d{1,2})(?:er)? ([A-Za-zéû]+)\.? (20\d\d)\b/);
  if (m && mon(m[2])) return `${m[3]}-${String(mon(m[2])).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
// "1,234" → "1,234"; "Less than 10" → "<10"; "" → null
export function invites(s) {
  s = String(s || "").trim();
  if (!s || /^(n\/?a|–|-|—)$/i.test(s)) return null;
  let m = s.match(/(?:less than|fewer than|<)\s*(\d+)/i);
  if (m) return "<" + m[1];
  m = s.match(/\d[\d,\s]*/);
  return m ? Number(m[0].replace(/[,\s]/g, "")).toLocaleString("en-CA") : null;
}
// Minimum score: "761", "57 and above", "Not applicable" → number or null
export function score(s) {
  const m = String(s || "").replace(/,/g, "").match(/\b(\d{1,4})\b/);
  return m ? Number(m[1]) : null;
}
export const col = (head, ...words) => head.findIndex((h) => words.some((w) => (w instanceof RegExp ? w.test(h) : h.toLowerCase().includes(w))));
