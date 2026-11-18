/* Admin → AI text check. Paste text (or load a .txt / .docx) and see every hidden mark that AI tools and
   copy-paste leave behind, highlighted where it sits, then copy or download a cleaned copy.

   What it finds:
   - Hidden text: Unicode "tag" characters and variation-selector runs that carry an invisible message (decoded and shown)
   - Invisible characters: zero-width spaces/joiners, word joiners, BOMs, soft hyphens, fillers, private-use and control characters
   - Direction controls: left-to-right / right-to-left marks, embeddings, overrides and isolates
   - Unusual spaces: no-break, narrow, thin, hair, ideographic spaces, line/paragraph separators
   - Look-alike letters: Cyrillic/Greek letters inside English words, full-width and "math bold" letters
   - Chatbot leftovers: ChatGPT citation markers (【4†source】, :contentReference[oaicite:0]{index=0}, turn0search0) and
     utm_source=chatgpt.com style tracking tags on links
   - AI-style typography (off by default): em dashes, curly quotes, the … character, markdown ** and #, bullet symbols
   - Things to review by hand (never changed automatically): "As an AI language model", "I hope this helps", [Your Name] placeholders

   What it can't do: statistical watermarks (for example Google SynthID) live in the choice of words, not in characters.
   Nothing can see them without the AI company's own key, and this tool doesn't rewrite wording.

   Confidential by design: everything runs in this browser tab. Nothing typed or loaded is saved, logged or sent. */
(function () {
"use strict";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hex = (cp) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

const KINDS = {
  hidden: ["Hidden text", "Invisible characters that spell out a hidden message", 1],
  zw: ["Invisible characters", "Zero-width, filler, control and private-use characters", 1],
  bidi: ["Direction controls", "Invisible marks that change text direction", 1],
  space: ["Unusual spaces", "No-break, narrow and other special spaces", 1],
  homo: ["Look-alike letters", "Non-English letters that look like English ones", 1],
  left: ["Chatbot leftovers", "Citation markers and AI tracking tags on links", 1],
  typo: ["AI-style typography", "Em dashes, curly quotes, …, markdown, bullet symbols", 0],
};
const ZW = { 0x200B: "Zero-width space", 0x200C: "Zero-width non-joiner", 0x200D: "Zero-width joiner", 0x2060: "Word joiner", 0xFEFF: "Zero-width no-break space (BOM)", 0x00AD: "Soft hyphen", 0x180E: "Mongolian vowel separator", 0x034F: "Combining grapheme joiner", 0x2061: "Invisible function application", 0x2062: "Invisible times", 0x2063: "Invisible separator", 0x2064: "Invisible plus", 0x115F: "Hangul choseong filler", 0x1160: "Hangul jungseong filler", 0x3164: "Hangul filler", 0xFFA0: "Halfwidth Hangul filler", 0xFFF9: "Interlinear annotation anchor", 0xFFFA: "Interlinear annotation separator", 0xFFFB: "Interlinear annotation terminator", 0xFFFC: "Object replacement character", 0x2800: "Braille blank" };
const BIDI = { 0x200E: "Left-to-right mark", 0x200F: "Right-to-left mark", 0x061C: "Arabic letter mark", 0x202A: "Left-to-right embedding", 0x202B: "Right-to-left embedding", 0x202C: "Pop directional formatting", 0x202D: "Left-to-right override", 0x202E: "Right-to-left override", 0x2066: "Left-to-right isolate", 0x2067: "Right-to-left isolate", 0x2068: "First strong isolate", 0x2069: "Pop directional isolate" };
const SP = { 0x00A0: "No-break space", 0x1680: "Ogham space mark", 0x2000: "En quad", 0x2001: "Em quad", 0x2002: "En space", 0x2003: "Em space", 0x2004: "Three-per-em space", 0x2005: "Four-per-em space", 0x2006: "Six-per-em space", 0x2007: "Figure space", 0x2008: "Punctuation space", 0x2009: "Thin space", 0x200A: "Hair space", 0x202F: "Narrow no-break space", 0x205F: "Medium mathematical space", 0x3000: "Ideographic space", 0x2028: "Line separator", 0x2029: "Paragraph separator", 0x0085: "Next line" };
const SPFIX = { 0x2028: "\n", 0x2029: "\n\n", 0x0085: "\n" };
// Cyrillic and Greek letters that look like English ones
const HG = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԛ": "q", "ԝ": "w", "һ": "h", "ӏ": "l", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S", "Ү": "Y", "Ԝ": "W", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X", "ο": "o", "ι": "i" };
const SCRIPT = (ch) => (/\p{Script=Cyrillic}/u.test(ch) ? "Cyrillic" : /\p{Script=Greek}/u.test(ch) ? "Greek" : "");
const EMOJI = /\p{Extended_Pictographic}/u;
const isLetter = (ch) => /[\p{L}\p{M}]/u.test(ch);

const LEFTOVERS = [
  [/[^]{0,200}/g, "ChatGPT citation marker", ""],
  [/【\d+(?::\d+)?†[^】\n]{0,80}】/g, "ChatGPT file citation 【…†…】", ""],
  [/:?contentReference\[oaicite:\d+\](?:\{index=\d+\})?/g, "ChatGPT contentReference marker", ""],
  [/\[oaicite:\d+\]/g, "ChatGPT oaicite marker", ""],
  [/\bturn\d+(?:search|news|view|fetch|file|image)\d+\b/g, "ChatGPT source tag (turn0search0)", ""],
  [/([?&])utm_source=(?:chatgpt\.com|chat\.openai\.com|openai(?:\.com)?|perplexity(?:\.ai)?|copilot\.com|copilot|gemini(?:\.google\.com)?|claude\.ai|bard)(&?)/gi, "AI tracking tag on a link (utm_source)", (m) => (m[2] ? m[1] : "")],
];
const TYPO = [
  [/[ \t]*[—―][ \t]*/g, "Em dash —", (m, t) => (lineStart(t, m.index) ? "- " : " - ")],
  [/[ \t]*–[ \t]*/g, "En dash –", (m, t) => (/\d/.test(t[m.index - 1] || "") && /\d/.test(t[m.index + m[0].length] || "") ? "-" : lineStart(t, m.index) ? "- " : " - ")],
  [/[‘’‚‛′]/g, "Curly apostrophe / quote ’", "'"],
  [/[“”„‟″]/g, "Curly double quote “ ”", '"'],
  [/…/g, "Ellipsis character …", "..."],
  [/^[ \t]*[•▪◦●∙‣][ \t]*/gm, "Bullet symbol •", "- "],
  [/^#{1,6}[ \t]+/gm, "Markdown heading #", ""],
];
const REVIEW = [
  /\bas an AI(?: language model| assistant)?\b/gi, /\bI hope this (?:helps|email finds you well|message finds you well)\b/gi, /\b(?:Certainly|Sure|Absolutely)! Here(?:'s| is)\b/gi,
  /\bHere(?:'s| is) (?:a |the |your )?(?:revised|polished|updated|improved|refined) (?:version|draft)\b/gi, /\bLet me know if you(?:'d| would) like\b/gi,
  /\bknowledge cut-?off\b/gi, /\bI (?:can't|cannot) browse\b/gi, /\[(?:Your|Insert|Company|Employer|Date|Name|Address|Recipient|Hiring Manager|Position|Job Title|Phone|Email)[^\]\n]{0,40}\]/gi,
  /\b(?:delve|tapestry|testament to|in today's fast-paced world|navigate the complexities)\b/gi,
];
const lineStart = (t, i) => i === 0 || t[i - 1] === "\n";

/* ---------------- scanning ---------------- */
function decodeVS(cps) { // variation selectors as bytes: FE00-FE0F = 0-15, E0100-E01EF = 16-255
  const b = new Uint8Array(cps.map((c) => (c <= 0xFE0F ? c - 0xFE00 : c - 0xE0100 + 16)));
  try { return new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/[\x00-\x1f\x7f]/g, ""); } catch (e) { return ""; }
}
function wordHasLatin(t, i) {
  let a = i, b = i + 1;
  while (a > 0 && isLetter(t[a - 1])) a--;
  while (b < t.length && isLetter(t[b])) b++;
  return /[A-Za-z]/.test(t.slice(a, b));
}
function scan(t) {
  const F = [], taken = new Uint8Array(t.length + 1);
  const add = (s, e, k, n, fix, extra) => { F.push({ s, e, k, n, fix, extra }); for (let i = s; i < e; i++) taken[i] = 1; };
  const free = (s, e) => { for (let i = s; i < e; i++) if (taken[i]) return false; return true; };
  for (const [re, n, fx] of LEFTOVERS) for (const m of t.matchAll(re)) if (free(m.index, m.index + m[0].length)) add(m.index, m.index + m[0].length, "left", n, typeof fx === "function" ? fx(m) : fx);
  for (const [re, n, fx] of TYPO) for (const m of t.matchAll(re)) if (free(m.index, m.index + m[0].length)) add(m.index, m.index + m[0].length, "typo", n, typeof fx === "function" ? fx(m, t) : fx);
  for (const m of t.matchAll(/\*\*(?=\S)([^*\n]{1,300}?\S)\*\*|__(?=\S)([^_\n]{1,300}?\S)__/g)) {
    const a = m.index, b = m.index + m[0].length;
    if (free(a, a + 2) && free(b - 2, b)) { add(a, a + 2, "typo", "Markdown bold **", ""); add(b - 2, b, "typo", "Markdown bold **", ""); }
  }
  let flag = false; // inside a 🏴 subdivision-flag emoji (its tag characters are legitimate)
  for (let i = 0; i < t.length;) {
    const cp = t.codePointAt(i), w = cp > 0xFFFF ? 2 : 1, ch = t.slice(i, i + w);
    if (taken[i]) { i += w; continue; }
    const prevCh = i > 0 ? (t.codePointAt(i - 1) >= 0xDC00 && t.codePointAt(i - 1) <= 0xDFFF && i > 1 ? t.slice(i - 2, i) : t[i - 1]) : "";
    const prev = prevCh ? prevCh.codePointAt(0) : 0;
    const nextCh = t.slice(i + w, i + w + (t.codePointAt(i + w) > 0xFFFF ? 2 : 1));
    if (cp === 0x1F3F4) flag = true; else if (flag && !(cp >= 0xE0020 && cp <= 0xE007F)) flag = false;
    // hidden tag text
    if (cp >= 0xE0000 && cp <= 0xE007F && !flag) {
      let j = i, s = "";
      while (j < t.length) { const c = t.codePointAt(j); if (c < 0xE0000 || c > 0xE007F) break; if (c >= 0xE0020 && c <= 0xE007E) s += String.fromCharCode(c - 0xE0000); j += 2; }
      add(i, j, "hidden", "Hidden tag characters", "", s); i = j; continue;
    }
    if (cp >= 0xE0000 && cp <= 0xE007F) { if (cp === 0xE007F) flag = false; i += w; continue; }
    // variation selectors (runs of them carry hidden data; one after an emoji is normal)
    if ((cp >= 0xFE00 && cp <= 0xFE0F) || (cp >= 0xE0100 && cp <= 0xE01EF)) {
      let j = i; const run = [];
      while (j < t.length) { const c = t.codePointAt(j); if (!((c >= 0xFE00 && c <= 0xFE0F) || (c >= 0xE0100 && c <= 0xE01EF))) break; run.push(c); j += c > 0xFFFF ? 2 : 1; }
      if (run.length === 1 && cp <= 0xFE0F && (EMOJI.test(prevCh) || /[0-9#*©®‼-㊙]/.test(prevCh))) { i = j; continue; }
      if (run.length > 1) add(i, j, "hidden", "Hidden variation-selector run", "", decodeVS(run));
      else add(i, j, "zw", "Stray variation selector", "");
      i = j; continue;
    }
    if (cp === 0x200D || cp === 0x200C) { // joiners are normal inside emoji and in Punjabi/Hindi and other scripts
      const okEmoji = EMOJI.test(prevCh) || EMOJI.test(nextCh) || prev === 0xFE0F || (prev >= 0x1F3FB && prev <= 0x1F3FF);
      const okScript = (prev > 0x024F && isLetter(prevCh)) || (nextCh && nextCh.codePointAt(0) > 0x024F && isLetter(nextCh));
      if (okEmoji || okScript) { i += w; continue; }
    }
    if (ZW[cp]) add(i, i + w, "zw", ZW[cp], "");
    else if (BIDI[cp]) add(i, i + w, "bidi", BIDI[cp], "");
    else if (SP[cp]) add(i, i + w, "space", SP[cp], SPFIX[cp] ?? " ");
    else if ((cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13) || (cp >= 0x7F && cp <= 0x9F && cp !== 0x85)) add(i, i + w, "zw", "Control character", "");
    else if ((cp >= 0xE000 && cp <= 0xF8FF) || cp >= 0xF0000) add(i, i + w, "zw", "Private-use character", "");
    else if (HG[ch] && wordHasLatin(t, i)) add(i, i + w, "homo", `${SCRIPT(ch)} “${ch}” looks like “${HG[ch]}”`, HG[ch]);
    else if ((cp >= 0xFF10 && cp <= 0xFF19) || (cp >= 0xFF21 && cp <= 0xFF3A) || (cp >= 0xFF41 && cp <= 0xFF5A)) add(i, i + w, "homo", "Full-width letter or digit", String.fromCharCode(cp - 0xFEE0));
    else if (cp >= 0x1D400 && cp <= 0x1D7FF) add(i, i + w, "homo", "Math-style letter (𝐛𝐨𝐥𝐝 / 𝑖𝑡𝑎𝑙𝑖𝑐)", ch.normalize("NFKC"));
    i += w;
  }
  F.sort((a, b) => a.s - b.s);
  const review = [];
  for (const re of REVIEW) for (const m of t.matchAll(re)) review.push({ s: m.index, txt: m[0], line: t.slice(0, m.index).split("\n").length });
  review.sort((a, b) => a.s - b.s);
  return { F, review };
}
function clean(t, F, on) {
  let out = "", p = 0, tidy = false;
  for (const f of F) { if (!on[f.k]) continue; out += t.slice(p, f.s) + f.fix; p = f.e; if (f.k === "left") tidy = true; }
  out += t.slice(p);
  if (tidy) out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?)\]])/g, "$1").replace(/[ \t]+$/gm, "");
  return out;
}

/* ---------------- .docx reading (text only, keeps hidden characters) ---------------- */
async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}
async function docxText(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let eo = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error("This isn't a valid .docx file");
  let p = dv.getUint32(eo + 16, true); const n = dv.getUint16(eo + 10, true);
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    if (name === "word/document.xml") {
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u.subarray(ds, ds + cs);
      const xml = new TextDecoder().decode(meth === 8 ? await inflate(raw) : raw);
      const doc = new DOMParser().parseFromString(xml, "application/xml"), W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const paras = [];
      for (const para of doc.getElementsByTagNameNS(W, "p")) {
        let s = "";
        const walk = (el) => { for (const c of el.children) { if (c.namespaceURI === W && c.localName === "t") s += c.textContent; else if (c.namespaceURI === W && c.localName === "tab") s += "\t"; else if (c.namespaceURI === W && (c.localName === "br" || c.localName === "cr")) s += "\n"; else if (!(c.namespaceURI === W && c.localName === "p")) walk(c); } };
        walk(para); paras.push(s);
      }
      return paras.join("\n");
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error("No document text found in this .docx");
}

/* ---------------- UI ---------------- */
const css = `
.at{display:flex;flex-direction:column;gap:14px}
.at-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.at-card h3{font-family:var(--display);font-size:1rem;font-weight:600;margin:0}
.at-card p.sub{margin:-4px 0 0;font-size:.82rem;color:var(--muted)}
.at textarea{width:100%;min-height:200px;font:inherit;font-size:.92rem;line-height:1.5;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);resize:vertical}
.at-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.at-b{font:inherit;font-weight:600;font-size:.85rem;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:7px 14px;cursor:pointer}
.at-b.p{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.at-b:disabled{opacity:.5;cursor:default}
.at-priv{display:flex;gap:10px;align-items:flex-start;font-size:.82rem;color:var(--muted);background:var(--accent-soft);border-radius:12px;padding:10px 12px}
.at-v{display:flex;gap:12px;align-items:center;border-radius:12px;padding:12px 14px;font-size:.92rem}
.at-v b{font-family:var(--display);font-size:1.05rem}
.at-v.bad{background:#fbe9e5;color:#7a2a1c}.at-v.ok{background:#e3f2ea;color:#1f5a3b}.at-v.mid{background:#fdf3dc;color:#6d4f0e}
@media (prefers-color-scheme:dark){.at-v.bad{background:#3a2420;color:#f1c1b6}.at-v.ok{background:#1d3328;color:#b5e2c8}.at-v.mid{background:#352d19;color:#efd79b}}
.at-t{width:100%;border-collapse:collapse;font-size:.86rem}
.at-t td,.at-t th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.at-t th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.at-t .n{text-align:right;font-variant-numeric:tabular-nums}
.at-t small{display:block;color:var(--muted)}
.at-k label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.at-hl{white-space:pre-wrap;word-wrap:break-word;font-size:.92rem;line-height:1.7;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);max-height:420px;overflow:auto}
.at-hl mark{border-radius:4px;padding:0 1px;cursor:help;color:inherit}
.at-hl mark.g{font-size:.66rem;font-weight:700;vertical-align:1px;padding:0 3px;margin:0 1px;font-family:ui-monospace,monospace}
.at-hl .k-hidden{background:#b3412e;color:#fff}.at-hl .k-zw{background:#e0703f;color:#fff}.at-hl .k-bidi{background:#8a4fbf;color:#fff}
.at-hl .k-space{background:#f2c94c;color:#3a2c00}.at-hl .k-homo{background:#f6b0b0;outline:1px solid #c0392b}
.at-hl .k-left{background:#f6b0b0;text-decoration:line-through}.at-hl .k-typo{background:#cfe3ff;outline:1px dashed #4f7cc0}
@media (prefers-color-scheme:dark){.at-hl .k-homo,.at-hl .k-left{background:#5c2a2a}.at-hl .k-typo{background:#22344d}}
.at-sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:0}
.at-hid{font-family:ui-monospace,monospace;background:var(--bg);border:1px dashed #b3412e;border-radius:8px;padding:8px 10px;font-size:.85rem;word-break:break-all}
.at-note{font-size:.8rem;color:var(--muted);margin:0}
`;
const SW = { hidden: "#b3412e", zw: "#e0703f", bidi: "#8a4fbf", space: "#f2c94c", homo: "#f6b0b0", left: "#f6b0b0", typo: "#cfe3ff" };
const S = { text: "", on: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, !!v[2]])), res: null, out: "", name: "", file: null, fres: null, busy: false, opt: { hide: true, meta: true, creds: true } };
let ROOT = null, timer = 0;

function badge(f, t) {
  const ttl = esc(f.n + (f.k === "hidden" && f.extra ? ` — says: “${f.extra}”` : "") + (f.k !== "left" && f.k !== "typo" && f.e - f.s <= 2 ? " · " + hex(t.codePointAt(f.s)) : "") + (S.on[f.k] ? (f.fix ? ` → replaced with “${f.fix.replace(/\n/g, "↵")}”` : " → removed") : " → kept (option off)"));
  const raw = t.slice(f.s, f.e);
  if (f.k === "hidden") return `<mark class="g k-hidden" title="${ttl}">HIDDEN${f.extra ? ": " + esc(f.extra.slice(0, 40)) + (f.extra.length > 40 ? "…" : "") : ""}</mark>`;
  if (f.k === "zw" || f.k === "bidi") return `<mark class="g k-${f.k}" title="${ttl}">${hex(t.codePointAt(f.s)).slice(2)}</mark>`;
  if (f.k === "space") return `<mark class="k-space" title="${ttl}">${raw === " " || raw === " " || raw === "\u0085" ? "↵" : "␣"}</mark>${SPFIX[raw.codePointAt(0)] ? "\n" : ""}`;
  return `<mark class="k-${f.k}" title="${ttl}">${esc(raw).replace(/ /g, "&nbsp;") || "&nbsp;"}</mark>`;
}
function hlHtml(t, F) {
  let h = "", p = 0;
  for (const f of F) { h += esc(t.slice(p, f.s)) + badge(f, t); p = f.e; }
  return h + esc(t.slice(p));
}
function render() {
  const R = ROOT.querySelector("#atRes");
  const t = S.text;
  if (!t.trim() && !S.file) { R.innerHTML = ""; return; }
  const { F, review } = S.res;
  S.out = clean(t, F, S.on);
  const by = {};
  for (const f of F) { (by[f.k] ||= {}); (by[f.k][f.n] ||= 0); by[f.k][f.n]++; }
  const cnt = (k) => F.filter((f) => f.k === k).length;
  const fm = fileMarks(S.file);
  const serious = cnt("hidden") + cnt("zw") + cnt("bidi") + cnt("homo") + cnt("left") + fm;
  const hidden = F.filter((f) => f.k === "hidden" && f.extra);
  const after = scan(S.out).F.filter((f) => S.on[f.k]).length;
  const v = serious ? `<div class="at-v bad"><span style="font-size:1.4rem">⚠️</span><div><b>${serious} hidden mark${serious > 1 ? "s" : ""} found</b><br>${cnt("hidden") ? "Includes hidden text. " : ""}${cnt("left") ? "Includes chatbot citation or tracking leftovers. " : ""}${cnt("homo") ? "Includes look-alike letters. " : ""}${fm ? "Includes marks inside the file itself (see the file card). " : ""}${S.file && S.file.type !== "text" ? "Clean the file below to download a fixed copy." : "The cleaned copy below has them removed."}</div></div>`
    : cnt("space") || cnt("typo") ? `<div class="at-v mid"><span style="font-size:1.4rem">🟡</span><div><b>No hidden marks</b><br>Only special spaces or AI-style typography, which also come from Word and Google Docs.</div></div>`
      : `<div class="at-v ok"><span style="font-size:1.4rem">✅</span><div><b>Clean: no hidden marks found</b><br>No invisible characters, look-alike letters or chatbot leftovers.</div></div>`;
  R.innerHTML = `${v}
  ${hidden.length ? `<div class="at-card"><h3>Hidden message${hidden.length > 1 ? "s" : ""} decoded</h3>${hidden.map((f) => `<div class="at-hid">${esc(f.extra)}</div>`).join("")}<p class="at-note">These were invisible in the text. Removed in the cleaned copy.</p></div>` : ""}
  ${S.file && S.file.type !== "text" ? fileCard() : ""}
  <div class="at-card at-k"><h3>What was found</h3><p class="sub">Tick what the cleaned copy should fix. Hover any highlight below for details.</p>
    <table class="at-t"><thead><tr><th>Fix</th><th>Type</th><th class="n">Found</th></tr></thead><tbody>
    ${Object.entries(KINDS).map(([k, [l, d]]) => `<tr><td><input type="checkbox" data-on="${k}"${S.on[k] ? " checked" : ""} aria-label="Fix ${esc(l)}"></td><td><span class="at-sw" style="background:${SW[k]}"></span><b>${esc(l)}</b><small>${esc(d)}</small>${by[k] ? `<small>${Object.entries(by[k]).map(([n, c]) => `${esc(n)} ×${c}`).join(" · ")}</small>` : ""}</td><td class="n">${cnt(k) || "—"}</td></tr>`).join("")}
    <tr><td></td><td><span class="at-sw" style="background:transparent;border:1px solid var(--muted)"></span><b>Review by hand</b><small>Chatbot phrases and [placeholders]. Never changed automatically.</small>${review.length ? `<small>${review.map((r) => `“${esc(r.txt)}” (line ${r.line})`).join(" · ")}</small>` : ""}</td><td class="n">${review.length || "—"}</td></tr>
    </tbody></table></div>
  <div class="at-card"><h3>Highlighted text</h3><div class="at-hl">${hlHtml(t, F)}</div></div>
  <div class="at-card"><h3>Cleaned text</h3><p class="sub">${after ? `${after} mark${after > 1 ? "s" : ""} still left (rerun to check)` : "Re-checked: 0 marks left for the fixes you ticked."} Wording is unchanged.</p>
    <textarea id="atOut" readonly>${esc(S.out)}</textarea>
    <div class="at-row"><button class="at-b p" type="button" id="atCopy">Copy cleaned text</button><button class="at-b" type="button" id="atDl">Download .txt</button><button class="at-b" type="button" id="atUse">Use as new input</button><span id="atMsg" class="at-note"></span></div></div>
  <p class="at-note">Statistical watermarks (such as Google SynthID) are hidden in word choice, not characters. No tool can see them without the AI company's key, and this check doesn't rewrite wording. Read AI-drafted text yourself before it goes into an application.</p>`;
  R.querySelectorAll("[data-on]").forEach((cb) => (cb.onchange = () => { S.on[cb.dataset.on] = cb.checked; S.fres = null; render(); }));
  R.querySelectorAll("[data-opt]").forEach((cb) => (cb.onchange = () => { S.opt[cb.dataset.opt] = cb.checked; S.fres = null; render(); }));
  const fb = R.querySelector("#atFileGo"); if (fb) fb.onclick = cleanFile;
  const fd = R.querySelector("#atFileDl"); if (fd) fd.onclick = () => S.fres && saveBlob(S.fres.blob, S.fres.fname);
  R.querySelector("#atCopy").onclick = async () => { const m = R.querySelector("#atMsg"); try { await navigator.clipboard.writeText(S.out); m.textContent = "Copied."; } catch (e) { const o = R.querySelector("#atOut"); o.select(); document.execCommand("copy"); m.textContent = "Copied."; } };
  R.querySelector("#atDl").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([S.out], { type: "text/plain;charset=utf-8" })); a.download = (S.name ? S.name.replace(/\.[^.]+$/, "") : "text") + "-cleaned.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  R.querySelector("#atUse").onclick = () => { S.file = null; S.fres = null; ROOT.querySelector("#atIn").value = S.out; setText(S.out); };
}
/* ---------------- whole-file cleaning (.docx / .pdf), see ai-text-files.js ---------------- */
const fileMarks = (f) => !f || f.type === "text" ? 0 : (f.hidden || []).length + (f.meta || []).filter((m) => m.ai).length + (f.c2pa ? f.c2pa.n : 0) + (f.layer ? f.layer.count : 0);
function saveBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function fileCard() {
  const f = S.file, ext = f.type, cb = (k, label) => `<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:.88rem"><input type="checkbox" data-opt="${k}"${S.opt[k] ? " checked" : ""}><span>${label}</span></label>`;
  const items = [];
  if (ext === "docx") {
    items.push(f.hidden.length ? `<div><b>⚠️ ${f.hidden.length} piece${f.hidden.length > 1 ? "s" : ""} of hidden-formatted text</b> (can't be seen in Word, but AI checkers, ATS systems and copy-paste read it)<div class="at-hid" style="margin-top:6px">${f.hidden.slice(0, 8).map((h) => `“${esc(h.text.slice(0, 120))}” <small>(${h.why})</small>`).join("<br>")}${f.hidden.length > 8 ? `<br>…and ${f.hidden.length - 8} more` : ""}</div>${cb("hide", "Remove hidden-formatted text")}</div>` : `<div>✅ No hidden-formatted text.</div>`);
    if (f.white.length) items.push(`<div><b>🟡 White text:</b> ${f.white.slice(0, 5).map((t) => `“${esc(t.slice(0, 60))}”`).join(", ")}${f.white.length > 5 ? "…" : ""} <small>(may be invisible on a white page; check by hand)</small></div>`);
  }
  if (ext === "pdf") {
    const ly = f.layer || { found: {}, hidden: [], count: 0 };
    items.push(ly.count ? `<div><b>⚠️ ${ly.count} hidden mark${ly.count > 1 ? "s" : ""} in the PDF's text layer</b> (not visible on the page, but copy-paste and AI checkers read them): ${Object.entries(ly.found).map(([n, c]) => `${esc(n)} ×${c}`).join(" · ")}${ly.hidden.filter(Boolean).length ? `<div class="at-hid" style="margin-top:6px">Hidden text: ${ly.hidden.filter(Boolean).map((h) => `“${esc(h)}”`).join(", ")}</div>` : ""}<small style="display:block;color:var(--muted)">Removed when you clean the file, using the Invisible characters / Hidden text / Unusual spaces / Look-alike letters ticks below.</small></div>` : `<div>✅ No hidden marks in the PDF's text layer.</div>`);
    items.push(f.c2pa.n ? `<div><b>⚠️ Content Credentials (C2PA) found:</b> ${Object.entries(f.c2pa.where).map(([w, c]) => `${esc(w)} ×${c}`).join(" · ")}. This is the industry label some AI tools, apps and cameras embed. Removing it from images doesn't change how they look.${cb("creds", "Remove Content Credentials")}</div>` : `<div>✅ No Content Credentials (C2PA).</div>`);
    if (f.invisible.length) items.push(`<div><b>🟡 Invisible text layer</b> on page${f.invisible.length > 1 ? "s" : ""} ${f.invisible.join(", ")}. Normal for scanned PDFs (it's the searchable text); in other PDFs it can hide text. Check by hand.</div>`);
    if (f.signed) items.push(`<div><b>⚠️ This PDF is digitally signed.</b> Any change, including cleaning, will break the signature.</div>`);
  }
  const ai = f.meta.filter((m) => m.ai);
  items.push(`<div><b>${ai.length ? "⚠️ AI-tool traces in the document details" : "Document details"}</b>${f.meta.length ? `<table class="at-t" style="margin-top:4px"><tbody>${f.meta.slice(0, 14).map((m) => `<tr><td style="width:34%">${esc(m.k)}</td><td>${m.ai ? "⚠️ " : ""}${esc(String(m.v).slice(0, 140))}</td></tr>`).join("")}</tbody></table>` : `<small> none</small>`}${cb("meta", ext === "pdf" ? "Clear author, creator, producer and XMP details" : "Clear author, last-modified-by, description and keywords")}</div>`);
  if (ext === "pdf") items.push(`<p class="at-note">In a PDF, invisible characters are removed from the page and look-alike letters and special spaces are fixed in the text layer, without changing how the pages look. Visible text (em dashes, citation markers, wording) can't be edited inside a PDF: fix those in the original and export again.</p>`);
  const r = S.fres;
  const res = r ? (r.err ? `<div class="at-v bad"><div><b>Couldn't clean the file</b><br>${esc(r.err)}</div></div>`
    : `<div class="at-v ${r.left ? "mid" : "ok"}"><span style="font-size:1.4rem">${r.left ? "🟡" : "✅"}</span><div><b>Cleaned ${esc(r.fname)}</b><br>${esc(r.summary)}<br>Re-checked the new file: ${r.left ? `${r.left} mark${r.left > 1 ? "s" : ""} still found (${esc(r.leftWhy)})` : "no marks left for the fixes you ticked"}.</div></div>
      <div class="at-row"><button class="at-b p" type="button" id="atFileDl">Download ${esc(r.fname)}</button><span class="at-note">Downloaded automatically. Open it and check it before sending.</span></div>`) : "";
  return `<div class="at-card"><h3>📄 ${esc(f.name)}</h3><p class="sub">Finds and removes hidden marks inside the file itself, keeps its layout and formatting, then re-checks the new file.</p>${items.join("")}
    <div class="at-row"><button class="at-b p" type="button" id="atFileGo"${S.busy ? " disabled" : ""}>${S.busy ? "Cleaning…" : `Clean & download .${ext}`}</button><span class="at-note">Uses the fix ticks in “What was found” below.</span></div>${res}</div>`;
}
async function cleanFile() {
  const f = S.file; if (!f || S.busy) return;
  S.busy = true; S.fres = null; render();
  try {
    const en = { ...S.on }; if (f.type === "pdf") { en.left = false; en.typo = false; }
    const r = await window.WPAiFiles.clean(f, en, { ...S.opt, creds: S.opt.creds });
    let base = f.name.replace(/\.[^.]+$/, ""), prev;
    do { prev = base; base = base.replace(/\s*\(\d+\)$/, "").replace(/-cleaned$/i, ""); } while (base !== prev); // re-cleaning: no "-cleaned (1)-cleaned"
    const fname = base + "-cleaned." + r.ext;
    const g = await window.WPAiFiles.open(new File([r.blob], fname));
    const kinds = Object.keys(en).filter((k) => en[k]), left = window.WPAiText.core.scan(g.text).F.filter((x) => kinds.includes(x.k));
    const why = [];
    const ll = g.layer ? Object.entries(g.layer.found).length && g.layer.count : 0;
    if (left.length) why.push(`${left.length} in the text`); if (ll) why.push(`${ll} in the PDF text layer`);
    const lh = S.opt.hide ? (g.hidden || []).length : 0, lm = S.opt.meta ? (g.meta || []).filter((m) => m.ai).length : 0, lc = S.opt.creds && g.c2pa ? g.c2pa.n : 0;
    if (lh) why.push(`${lh} hidden-formatted`); if (lm) why.push(`${lm} in document details`); if (lc) why.push(`${lc} Content Credentials`);
    const sum = [];
    if (f.type === "docx") { sum.push(`${r.fixed - r.removedHidden} text fix${r.fixed - r.removedHidden === 1 ? "" : "es"}`); if (r.removedHidden) sum.push(`${r.removedHidden} hidden-formatted piece${r.removedHidden > 1 ? "s" : ""} removed`); if (r.metaCleared) sum.push(`${r.metaCleared} document detail${r.metaCleared > 1 ? "s" : ""} cleared`); }
    else if (f.type === "pdf") { sum.push(`${r.dropped} invisible character${r.dropped === 1 ? "" : "s"} removed`, `${r.remapped} letter/space fix${r.remapped === 1 ? "" : "es"} in the text layer`); if (r.metaCleared) sum.push(`${r.metaCleared} document detail${r.metaCleared > 1 ? "s" : ""} cleared`); if (r.credentials) sum.push(`${r.credentials} Content Credentials item${r.credentials > 1 ? "s" : ""} removed`); }
    else sum.push("text cleaned");
    S.fres = { blob: r.blob, fname, summary: sum.join(" · ") + ".", left: left.length + lh + lm + lc + ll, leftWhy: why.join(", ") };
    saveBlob(r.blob, fname);
  } catch (e) { console.error(e); S.fres = { err: e.message || String(e) }; }
  S.busy = false; render();
}
function setText(t) { S.text = t; S.res = scan(t); render(); }

function mount(body) {
  ROOT = document.createElement("div"); ROOT.className = "at";
  ROOT.innerHTML = `<style>${css}</style>
  <div class="at-priv"><span>🔒</span><div><b>Confidential.</b> This check runs entirely in this browser tab: nothing you paste or load is saved, logged or sent anywhere, and it's gone when you lock the console.</div></div>
  <div class="at-card"><h3>AI text check</h3><p class="sub">Paste text, or load a .txt or .docx, to find the hidden marks AI tools and copy-paste leave behind (invisible characters, hidden text, look-alike letters, chatbot citation markers), then copy a cleaned version.</p>
    <textarea id="atIn" placeholder="Paste a cover letter, letter of explanation, email or any text here…" spellcheck="false"></textarea>
    <div class="at-row"><button class="at-b p" type="button" id="atGo">Check text</button><label class="at-b" style="display:inline-block">Upload .docx / .pdf / .txt<input type="file" id="atFile" accept=".docx,.pdf,.txt,.md,.csv,.html,.htm,.json,.doc,application/pdf,text/plain" hidden></label><button class="at-b" type="button" id="atEx">Try an example</button><button class="at-b" type="button" id="atClr">Clear</button><span class="at-note" id="atFmsg"></span></div>
    <p class="at-note">Upload a Word (.docx) or PDF file to check it and download a cleaned copy of the same file, with its layout kept. Old .doc files: save as .docx in Word first.</p></div>
  <div id="atRes" class="at"></div>`;
  body.innerHTML = ""; body.appendChild(ROOT);
  const In = ROOT.querySelector("#atIn");
  In.value = S.text;
  In.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { if (S.file && In.value !== S.file.text) { S.file = null; S.fres = null; ROOT.querySelector("#atFmsg").textContent = "Text edited, so the loaded file is unlinked. Load the file again to clean the file itself."; } setText(In.value); }, 350); });
  ROOT.querySelector("#atGo").onclick = () => setText(In.value);
  ROOT.querySelector("#atClr").onclick = () => { In.value = ""; S.name = ""; S.file = null; S.fres = null; ROOT.querySelector("#atFmsg").textContent = ""; setText(""); };
  ROOT.querySelector("#atEx").onclick = () => {
    const tag = [..."generated-by-ai"].map((c) => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join("");
    In.value = `Dear Hiring Manager,\n\nI am writing to apply for the Cook position at your restaurant.​ I have five years of experience in busy kitchens — including two years as a line cook in Surrey.${tag}\n\nI am a quick learner, reliаble and comfortable working evenings and weekends. My last employer described me as a team player [1](https://example.com/ref?utm_source=chatgpt.com) citeturn0search0.\n\nI hope this helps! Please contact me at [Your Phone Number].\n\nSincerely,\n[Your Name]`;
    S.name = ""; S.file = null; S.fres = null; setText(In.value);
  };
  ROOT.querySelector("#atFile").onchange = async (e) => {
    const f = e.target.files[0], m = ROOT.querySelector("#atFmsg"); e.target.value = "";
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) { m.textContent = "That file is over 40 MB."; return; }
    m.textContent = "Reading " + f.name + "…";
    try {
      if (!window.WPAiFiles) throw new Error("the file module didn't load; refresh the page");
      const o = await window.WPAiFiles.open(f);
      S.file = o.type === "text" ? null : o; S.fres = null; S.name = f.name;
      In.value = o.text; m.textContent = "Loaded " + f.name + "."; setText(o.text);
      if (!o.text.trim() && o.type === "pdf") m.textContent = "Loaded " + f.name + ". No text layer found (a scanned PDF?): only the file details can be checked.";
      if (!o.text.trim()) render();
    } catch (err) { console.error(err); S.file = null; S.fres = null; render(); m.textContent = "Couldn't read " + f.name + ": " + err.message; }
  };
  if (S.text) setText(S.text);
}
async function load(key, body) {
  if (ROOT && body.contains(ROOT)) return; // the console refreshes tabs every minute; keep what's pasted
  if (ROOT) { body.innerHTML = ""; body.appendChild(ROOT); return; }
  mount(body);
}
function leave() { ROOT = null; S.text = ""; S.res = null; S.out = ""; S.name = ""; S.file = null; S.fres = null; } // on lock: forget the text
window.WPAiText = { load, leave, core: { scan, clean, ZW, BIDI, SP, HG, isLetter }, _test: { scan, clean } };
})();
