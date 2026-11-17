/* Admin → AI text check: whole-file cleaning. Opens a .docx, .pdf or text file, reports the hidden marks inside it,
   removes them and rebuilds the same kind of file, then re-opens the rebuilt file to prove what's left.

   .docx: cleans every text part (body, headers, footers, footnotes, endnotes, comments) run by run, so formatting,
          tables, images and styles are untouched. Also finds text formatted as hidden or 2 pt or smaller (removable),
          white text (listed for review) and AI-tool traces in the document details (e.g. "python-docx").
   .pdf:  text in a PDF is glyph codes, not letters, so invisible characters are removed by deleting their glyph codes
          from the page content (they have no width, so nothing moves), and look-alike letters / special spaces are
          fixed in the font's text map (ToUnicode) so copied or extracted text comes out as normal English. Also clears
          AI-tool traces in the document details and XMP metadata and removes C2PA "Content Credentials" manifests.
          Visible text (em dashes, citation markers, wording) can't be edited inside a PDF: fix it in the source.
   Runs only in this browser tab: no file, text or result is uploaded, saved or logged. */
(function () {
"use strict";
const C = () => window.WPAiText.core;
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS = "http://www.w3.org/XML/1998/namespace";
const AIHINT = /python-docx|docx\.js|openai|chat\s?gpt|gpt-?\d|claude|anthropic|gemini|bard|copilot|jasper|writesonic|copy\.ai|quillbot|grammarly\s*ai|ai[- ]generated|generated (?:by|with) (?:ai|an ai)|c2pa|content credentials|trainedalgorithmicmedia|synthid/i;

/* ================= zip (read + write) ================= */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function pipe(u, s) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(s)).arrayBuffer()); }
function zipRead(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let eo = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error("this isn't a valid .docx (if it's password-protected, remove the password in Word first)");
  let p = dv.getUint32(eo + 16, true); const n = dv.getUint16(eo + 10, true), out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("the .docx is damaged");
    const e = { flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), time: dv.getUint16(p + 12, true), date: dv.getUint16(p + 14, true), crc: dv.getUint32(p + 16, true), cs: dv.getUint32(p + 20, true), us: dv.getUint32(p + 24, true) };
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    e.nameBytes = u.slice(p + 46, p + 46 + nl); e.name = new TextDecoder().decode(e.nameBytes);
    if (e.flags & 1) throw new Error("the .docx is encrypted");
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    e.raw = u.subarray(ds, ds + e.cs);
    out.push(e); p += 46 + nl + xl + cl;
  }
  return out;
}
async function zipData(e) { return e.method === 8 ? pipe(e.raw, new DecompressionStream("deflate-raw")) : e.method === 0 ? e.raw : Promise.reject(new Error("unsupported compression in .docx")); }
async function zipWrite(entries) {
  const parts = [], cen = []; let off = 0;
  for (const e of entries) {
    let raw = e.raw, method = e.method, crc = e.crc, us = e.us;
    if (e.data) { raw = await pipe(e.data, new CompressionStream("deflate-raw")); method = 8; crc = crc32(e.data); us = e.data.length; }
    const flags = e.flags & 0x0800; // keep "UTF-8 names", drop data-descriptor bit (sizes are in the header now)
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, flags, true); h.setUint16(8, method, true); h.setUint16(10, e.time, true); h.setUint16(12, e.date, true);
    h.setUint32(14, crc, true); h.setUint32(18, raw.length, true); h.setUint32(22, us, true); h.setUint16(26, e.nameBytes.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), e.nameBytes, raw);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, method, true); c.setUint16(12, e.time, true); c.setUint16(14, e.date, true);
    c.setUint32(16, crc, true); c.setUint32(20, raw.length, true); c.setUint32(24, us, true); c.setUint16(28, e.nameBytes.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), e.nameBytes);
    off += 30 + e.nameBytes.length + raw.length;
  }
  const cs = cen.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/* ================= .docx ================= */
const TEXTPART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;
const PARTLABEL = (n) => { const m = n.match(/^word\/([a-z]+)(\d*)\.xml$/); return m[1] === "document" ? "" : `[${m[1][0].toUpperCase() + m[1].slice(1).replace(/s$/, "")}${m[2] ? " " + m[2] : ""}]`; };
const wv = (el, name) => { const c = el && [...el.children].find((x) => x.namespaceURI === W && x.localName === name); return c ? (c.getAttributeNS(W, "val") ?? "true") : null; };
const on = (v) => v !== null && !/^(0|false|off)$/i.test(v);
function runFlags(run) {
  const rPr = run && [...run.children].find((x) => x.namespaceURI === W && x.localName === "rPr");
  if (!rPr) return {};
  const sz = parseInt(wv(rPr, "sz"), 10), col = (wv(rPr, "color") || "").toUpperCase();
  return { vanish: on(wv(rPr, "vanish")), tiny: sz > 0 && sz <= 4, white: col === "FFFFFF" && !wv(rPr, "highlight") && !wv(rPr, "shd") };
}
function docxParas(doc) {
  const paras = [], hidden = [], white = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    const nodes = [];
    const walk = (el) => {
      for (const c of el.children) {
        if (c.namespaceURI === W && c.localName === "p") continue; // nested paragraphs (text boxes) are visited on their own
        if (c.namespaceURI === W && c.localName === "t") {
          const run = c.parentElement, f = run && run.localName === "r" ? runFlags(run) : {};
          if (f.vanish || f.tiny) { hidden.push({ run, text: c.textContent, why: f.vanish ? "formatted as hidden" : "font 2 pt or smaller" }); continue; }
          if (f.white && c.textContent.trim()) white.push(c.textContent);
          nodes.push(c);
        } else walk(c);
      }
    };
    walk(p); paras.push(nodes);
  }
  return { paras, hidden, white };
}
async function openDocx(buf, name) {
  const entries = zipRead(buf), parts = [], meta = [];
  if (!entries.some((e) => e.name === "word/document.xml")) throw new Error("no Word document inside this file");
  const order = (n) => (n === "word/document.xml" ? 0 : 1);
  for (const e of entries.filter((x) => TEXTPART.test(x.name)).sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name))) {
    const xml = new TextDecoder().decode(await zipData(e)), doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) continue;
    parts.push({ e, xml, doc, ...docxParas(doc) });
  }
  for (const pn of ["docProps/core.xml", "docProps/app.xml", "docProps/custom.xml"]) {
    const e = entries.find((x) => x.name === pn); if (!e) continue;
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(await zipData(e)), "application/xml");
    if (pn.endsWith("custom.xml")) { for (const pr of doc.getElementsByTagName("*")) if (pr.localName === "property") meta.push({ k: "Custom: " + pr.getAttribute("name"), v: pr.textContent, ai: AIHINT.test(pr.getAttribute("name") + " " + pr.textContent) }); continue; }
    for (const el of doc.documentElement.children) if (el.textContent.trim() && !/^(created|modified|TotalTime|Pages|Words|Characters|Lines|Paragraphs|CharactersWithSpaces|DocSecurity|ScaleCrop|LinksUpToDate|SharedDoc|HyperlinksChanged|AppVersion|Template|revision|HeadingPairs|TitlesOfParts)$/.test(el.localName))
      meta.push({ k: el.localName.replace(/^./, (c) => c.toUpperCase()).replace("LastModifiedBy", "Last modified by").replace("Creator", "Author"), v: el.textContent.trim(), ai: AIHINT.test(el.textContent) });
  }
  const text = parts.map((pt) => (PARTLABEL(pt.e.name) ? PARTLABEL(pt.e.name) + "\n" : "") + pt.paras.map((ns) => ns.map((n) => n.textContent).join("")).join("\n")).join("\n\n");
  return { type: "docx", name, buf, entries, parts, meta, text, hidden: parts.flatMap((p) => p.hidden), white: parts.flatMap((p) => p.white) };
}
function cleanNodes(nodes, en) {
  const full = nodes.map((n) => n.textContent).join("");
  if (!full) return 0;
  const F = C().scan(full).F.filter((f) => en[f.k]);
  if (!F.length) return 0;
  const owner = new Int32Array(full.length); let k = 0;
  nodes.forEach((n, i) => { for (let j = 0; j < n.textContent.length; j++) owner[k++] = i; });
  const out = nodes.map(() => ""); let p = 0, left = false;
  for (const f of F) {
    for (let i = p; i < f.s; i++) out[owner[i]] += full[i];
    out[owner[f.s]] += f.fix.replace(/\n+/g, " ");
    p = f.e; if (f.k === "left") left = true;
  }
  for (let i = p; i < full.length; i++) out[owner[i]] += full[i];
  nodes.forEach((n, i) => {
    let t = out[i];
    if (left) t = t.replace(/ {2,}/g, " ").replace(/ +([.,;:!?)\]])/g, "$1");
    if (t !== n.textContent) { n.textContent = t; if (/^\s|\s$/.test(t)) n.setAttributeNS(XMLNS, "xml:space", "preserve"); }
  });
  return F.length;
}
async function cleanDocx(f, en, opt) {
  const fresh = await openDocx(f.buf, f.name); // work on a fresh copy so the shown report stays as loaded
  const changed = new Map(); let fixed = 0, removedHidden = 0, metaCleared = 0;
  for (const pt of fresh.parts) {
    let n = 0;
    for (const nodes of pt.paras) n += cleanNodes(nodes, en);
    if (opt.hide) for (const h of pt.hidden) if (h.run.parentNode) { h.run.parentNode.removeChild(h.run); removedHidden++; n++; }
    if (n) { fixed += n; changed.set(pt.e.name, (/^\s*<\?xml[^>]*\?>/.exec(pt.xml)?.[0] ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>') + "\r\n" + new XMLSerializer().serializeToString(pt.doc.documentElement)); }
  }
  if (opt.meta) {
    const e = fresh.entries.find((x) => x.name === "docProps/core.xml");
    if (e) {
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(await zipData(e)), "application/xml");
      for (const el of [...doc.documentElement.children]) if (/^(creator|lastModifiedBy|description|keywords|subject|category|contentStatus)$/.test(el.localName) && el.textContent) { el.textContent = ""; metaCleared++; }
      if (metaCleared) changed.set(e.name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(doc.documentElement));
    }
    const ec = fresh.entries.find((x) => x.name === "docProps/custom.xml");
    if (ec) {
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(await zipData(ec)), "application/xml");
      for (const pr of [...doc.getElementsByTagName("*")]) if (pr.localName === "property" && AIHINT.test(pr.getAttribute("name") + " " + pr.textContent)) { pr.parentNode.removeChild(pr); metaCleared++; }
      changed.set(ec.name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(doc.documentElement));
    }
  }
  const enc = new TextEncoder();
  const blob = await zipWrite(fresh.entries.map((e) => (changed.has(e.name) ? { ...e, data: enc.encode(changed.get(e.name)) } : e)));
  return { blob, fixed, removedHidden, metaCleared, ext: "docx" };
}

/* ================= .pdf ================= */
let LIB = null, PJS = null;
const pdflib = () => (LIB ||= import("/assets/vendor/pdf-lib/pdf-lib.esm.min.js"));
const pdfjs = () => (PJS ||= window.__wpPdfjs || (window.__wpPdfjs = import("/assets/vendor/pdfjs/pdf.min.js").then((m) => { m.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs/pdf.worker.min.js"; return m; })));
const latin1 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return s; };

async function openPdf(buf, name) {
  const P = await pdfjs(), bytes = new Uint8Array(buf);
  let doc; const task = P.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true });
  try { doc = await task.promise; } catch (e) { throw new Error(/password/i.test(e.name + e.message) ? "the PDF is password-protected" : "this isn't a readable PDF"); }
  const pages = [], invisible = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i), tc = await pg.getTextContent({ disableNormalization: true });
    pages.push(tc.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : "")).join(""));
    try { const ol = await pg.getOperatorList(); for (let j = 0; j < ol.fnArray.length; j++) if (ol.fnArray[j] === P.OPS.setTextRenderingMode && (ol.argsArray[j][0] & 3) === 3) { invisible.push(i); break; } } catch (e) {}
  }
  const md = await doc.getMetadata().catch(() => ({})), meta = [];
  for (const [k, v] of Object.entries(md.info || {})) if (typeof v === "string" && v.trim() && !/^(PDFFormatVersion|CreationDate|ModDate|Language)$/.test(k)) meta.push({ k, v, ai: AIHINT.test(v) });
  for (const [k, v] of Object.entries((md.info || {}).Custom || {})) meta.push({ k: "Custom: " + k, v: String(v?.name ?? v), ai: true });
  const raw = latin1(bytes);
  const xmp = md.metadata ? String(md.metadata.getRaw?.() || "") : "";
  const c2pa = /c2pa|contentauth|jumbf/i.test(raw) || /c2pa/i.test(xmp);
  if (xmp && AIHINT.test(xmp)) meta.push({ k: "XMP metadata", v: (xmp.match(AIHINT) || [""])[0] + "…", ai: true });
  try { await task.destroy(); } catch (e) {}
  let layer = { found: {}, hidden: [] };
  try { const L = await pdflib(); layer = await walkPdf(await L.PDFDocument.load(buf, { updateMetadata: false }), L, ALLON, false); } catch (e) { console.warn("text layer check skipped", e); }
  const text = pages.map((t, i) => (pages.length > 1 ? `[Page ${i + 1}]\n` : "") + t.replace(/\n+$/, "")).join("\n\n");
  return { type: "pdf", name, buf, text, meta, invisible, c2pa, signed: /\/ByteRange\s*\[/.test(raw), hasXmp: !!xmp, layer: { found: layer.found, hidden: layer.hidden, count: Object.values(layer.found).reduce((a, b) => a + b, 0) } };
}

// --- ToUnicode CMaps ---
const u16 = (hex) => { const b = hex.replace(/\s/g, ""); if (b.length <= 2) return b ? String.fromCharCode(parseInt(b, 16)) : ""; let s = ""; for (let i = 0; i + 4 <= b.length; i += 4) s += String.fromCharCode(parseInt(b.slice(i, i + 4), 16)); return s; };
const toHex16 = (s) => [...s].map((ch) => { const cp = ch.codePointAt(0); return cp > 0xFFFF ? ch.split("").map((u) => u.charCodeAt(0).toString(16).padStart(4, "0")).join("") : cp.toString(16).padStart(4, "0"); }).join("").toUpperCase();
function parseCMap(txt) {
  const space = [], map = new Map();
  for (const m of txt.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) for (const r of m[1].matchAll(/<([0-9a-fA-F\s]+)>\s*<([0-9a-fA-F\s]+)>/g)) { const a = r[1].replace(/\s/g, ""), b = r[2].replace(/\s/g, ""); space.push({ len: a.length / 2, lo: parseInt(a, 16), hi: parseInt(b, 16) }); }
  for (const m of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const r of m[1].matchAll(/<([0-9a-fA-F\s]*)>\s*<([0-9a-fA-F\s]*)>/g)) map.set(r[1].replace(/\s/g, "").toLowerCase(), u16(r[2]));
  for (const m of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const r of m[1].matchAll(/<([0-9a-fA-F\s]+)>\s*<([0-9a-fA-F\s]+)>\s*(?:<([0-9a-fA-F\s]*)>|\[([^\]]*)\])/g)) {
    const a = r[1].replace(/\s/g, ""), lo = parseInt(a, 16), hi = parseInt(r[2].replace(/\s/g, ""), 16), L = a.length;
    if (hi - lo > 70000) return null; // too big to rewrite safely
    if (r[3] != null) { const base = u16(r[3]); for (let c = lo; c <= hi; c++) { const off = c - lo, s = base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + off); map.set(c.toString(16).padStart(L, "0"), s); } }
    else { const ds = [...r[4].matchAll(/<([0-9a-fA-F\s]*)>/g)].map((x) => u16(x[1])); for (let c = lo; c <= hi && c - lo < ds.length; c++) map.set(c.toString(16).padStart(L, "0"), ds[c - lo]); }
  }
  if (!space.length) { const lens = new Set([...map.keys()].map((k) => k.length / 2)); for (const l of lens) space.push({ len: l, lo: 0, hi: 2 ** (8 * l) - 1 }); }
  space.sort((a, b) => a.len - b.len);
  return { space, map, txt };
}
function writeCMap(cm) {
  const cs = [...cm.txt.matchAll(/begincodespacerange[\s\S]*?endcodespacerange/g)].map((m) => m[0].replace(/^begincodespacerange/, `${(m[0].match(/</g) || []).length / 2} begincodespacerange`)).join("\n")
    || `${cm.space.length} begincodespacerange\n${cm.space.map((s) => `<${s.lo.toString(16).padStart(s.len * 2, "0")}> <${s.hi.toString(16).padStart(s.len * 2, "0")}>`).join("\n")}\nendcodespacerange`;
  const ent = [...cm.map.entries()], blocks = [];
  for (let i = 0; i < ent.length; i += 100) { const b = ent.slice(i, i + 100); blocks.push(`${b.length} beginbfchar\n${b.map(([k, v]) => `<${k.toUpperCase()}> <${toHex16(v) || "0020"}>`).join("\n")}\nendbfchar`); }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n${cs}\n${blocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
}
// What to do with one glyph's text: "drop" (invisible), a replacement string, or null (leave)
function glyphAction(s, en, fontNonLatin) {
  const { ZW, BIDI, SP, HG } = C();
  if (!s) return null;
  const cps = [...s].map((c) => c.codePointAt(0));
  const bad = (cp) => (en.zw && cp !== 0x00AD && cp !== 0x2800 && ZW[cp] && !((cp === 0x200C || cp === 0x200D) && fontNonLatin)) || (en.bidi && BIDI[cp]) || (en.hidden && ((cp >= 0xE0000 && cp <= 0xE007F) || (cp >= 0xE0100 && cp <= 0xE01EF)));
  if (cps.every(bad)) return "drop";
  if (cps.length === 1) {
    const cp = cps[0];
    if (en.space && SP[cp] && cp !== 0x2028 && cp !== 0x2029 && cp !== 0x0085) return " ";
    if (en.homo && HG[s]) return HG[s];
    if (en.homo && ((cp >= 0xFF10 && cp <= 0xFF19) || (cp >= 0xFF21 && cp <= 0xFF3A) || (cp >= 0xFF41 && cp <= 0xFF5A) || (cp >= 0x1D400 && cp <= 0x1D7FF))) return s.normalize("NFKC");
  }
  if (cps.some(bad)) return [...s].filter((ch) => !bad(ch.codePointAt(0))).join("") || "drop";
  return null;
}

// --- content stream tokenizer: finds strings shown with each font, so glyph codes can be cut out in place ---
const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
function* tokens(u) {
  let i = 0; const n = u.length;
  while (i < n) {
    const c = u[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && u[i] !== 10 && u[i] !== 13) i++; continue; }
    const s = i;
    if (c === 40) { // literal string
      let depth = 1, out = []; i++;
      while (i < n && depth) {
        let b = u[i++];
        if (b === 92) { const e = u[i++];
          if (e >= 48 && e <= 55) { let v = e - 48; for (let k = 0; k < 2 && u[i] >= 48 && u[i] <= 55; k++) v = v * 8 + u[i++] - 48; out.push(v & 255); }
          else if (e === 13) { if (u[i] === 10) i++; } else if (e === 10) {}
          else out.push({ 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 }[e] ?? e);
          continue; }
        if (b === 40) depth++; else if (b === 41 && !--depth) break;
        out.push(b);
      }
      yield { t: "str", s, e: i, v: Uint8Array.from(out) }; continue;
    }
    if (c === 60 && u[i + 1] === 60) { i += 2; yield { t: "<<", s, e: i }; continue; }
    if (c === 62 && u[i + 1] === 62) { i += 2; yield { t: ">>", s, e: i }; continue; }
    if (c === 60) { i++; let h = ""; while (i < n && u[i] !== 62) { if (!WS.has(u[i])) h += String.fromCharCode(u[i]); i++; } i++; if (h.length % 2) h += "0"; const v = new Uint8Array(h.length / 2); for (let k = 0; k < v.length; k++) v[k] = parseInt(h.substr(k * 2, 2), 16); yield { t: "str", s, e: i, v }; continue; }
    if (c === 91 || c === 93) { i++; yield { t: String.fromCharCode(c), s, e: i }; continue; }
    if (c === 47) { i++; while (i < n && !WS.has(u[i]) && !DELIM.has(u[i])) i++; yield { t: "name", s, e: i, v: latin1(u.subarray(s + 1, i)).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }; continue; }
    while (i < n && !WS.has(u[i]) && !DELIM.has(u[i])) i++;
    if (i === s) { i++; continue; }
    const w = latin1(u.subarray(s, i));
    if (w === "BI") { // inline image: skip its binary data up to EI
      let j = i; while (j < n - 2 && !(WS.has(u[j]) && u[j + 1] === 73 && u[j + 2] === 68 && WS.has(u[j + 3]))) j++;
      j += 4; while (j < n - 2 && !(WS.has(u[j - 1]) && u[j] === 69 && u[j + 1] === 73 && (j + 2 >= n || WS.has(u[j + 2]) || DELIM.has(u[j + 2])))) j++;
      i = j + 2; continue;
    }
    yield { t: /^[+\-.\d]/.test(w) ? "num" : "op", s, e: i, v: w };
  }
}
function splitCodes(bytes, space) {
  const out = []; let i = 0;
  while (i < bytes.length) {
    let took = 0;
    for (const sp of space) { if (i + sp.len > bytes.length) continue; let v = 0; for (let k = 0; k < sp.len; k++) v = v * 256 + bytes[i + k]; if (v >= sp.lo && v <= sp.hi) { took = sp.len; break; } }
    if (!took) took = space[0]?.len || 1;
    out.push(bytes.subarray(i, i + took)); i += took;
  }
  return out;
}
const hexOf = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/* Walk every page's text: glyph codes shown with each font (via its ToUnicode map) and /ActualText spans (what
   copy-paste, screen readers and AI checkers read instead of the glyphs; Chrome puts invisible characters there).
   apply=false only counts what it finds; apply=true also removes/fixes it in place. */
const strBytes = (s) => (s.length >= 2 && s[0] === 0xFE && s[1] === 0xFF ? (() => { let t = ""; for (let i = 2; i + 1 < s.length; i += 2) t += String.fromCharCode((s[i] << 8) | s[i + 1]); return t; })() : latin1(s));
const utf16Hex = (t) => "<FEFF" + [...t].map((ch) => ch.split("").map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("")).join("").toUpperCase() + ">";
async function walkPdf(pdf, L, en, apply) {
  const { PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, decodePDFRawStream } = L, ctx = pdf.context, look = (x) => (x instanceof PDFRef ? ctx.lookup(x) : x);
  const st = { dropped: 0, remapped: 0, actual: 0, found: {}, hidden: [] };
  const note = (n, extra) => { st.found[n] = (st.found[n] || 0) + 1; if (extra) st.hidden.push(extra); };
  const noteText = (t) => { for (const f of C().scan(t).F) if (["hidden", "zw", "bidi", "space", "homo"].includes(f.k) && en[f.k]) note(f.n, f.extra); };
  const fontCache = new Map();
  function fontInfo(fd) {
    if (fontCache.has(fd)) return fontCache.get(fd);
    let info = null;
    const tu = look(fd.get(PDFName.of("ToUnicode")));
    if (tu instanceof PDFRawStream) {
      try {
        const cm = parseCMap(latin1(decodePDFRawStream(tu).decode()));
        if (cm) {
          const nonLatin = [...cm.map.values()].some((s) => /[\p{L}]/u.test(s) && s.codePointAt(0) > 0x024F);
          const drop = new Set(), fix = new Map();
          for (const [k, s] of cm.map) { const a = glyphAction(s, en, nonLatin); if (a === "drop") drop.add(k); else if (a != null && a !== s) fix.set(k, a); }
          info = { cm, drop, fix, ref: fd.get(PDFName.of("ToUnicode")), used: new Set() };
        }
      } catch (e) {}
    }
    fontCache.set(fd, info); return info;
  }
  const done = new Set();
  function fontsOf(res) { const m = new Map(), fonts = res && look(res.get(PDFName.of("Font"))); if (fonts instanceof PDFDict) for (const [k, v] of fonts.entries()) { const fd = look(v); if (fd instanceof PDFDict) m.set(k.decodeText ? k.decodeText() : String(k).slice(1), fd); } return m; }
  function run(refs, res, state) {
    const fonts = fontsOf(res);
    for (const ref of refs) {
      const so = look(ref);
      if (!(so instanceof PDFRawStream)) continue;
      let u; try { u = decodePDFRawStream(so).decode(); } catch (e) { continue; }
      const splices = [], stack = [];
      for (const tk of tokens(u)) {
        if (tk.t !== "op") { stack.push(tk); if (stack.length > 4000) stack.splice(0, 2000); continue; }
        const v = tk.v;
        if (v === "Tf") { const nm = stack.filter((x) => x.t === "name").pop(); state.font = nm && fonts.get(nm.v) ? fontInfo(fonts.get(nm.v)) : null; }
        else if ((v === "Tj" || v === "TJ" || v === "'" || v === '"') && state.font) {
          let strs = [];
          if (v === "TJ") { const a = stack.map((x) => x.t).lastIndexOf("["); if (a >= 0) strs = stack.slice(a).filter((x) => x.t === "str"); }
          else { const x = stack.filter((y) => y.t === "str").pop(); if (x) strs = [x]; }
          const F = state.font;
          for (const x of strs) {
            const codes = splitCodes(x.v, F.cm.space); let cut = 0;
            for (const c of codes) { const h = hexOf(c); if (F.drop.has(h) || F.fix.has(h)) { F.used.add(h); if (!state.inActual) noteText(F.cm.map.get(h) || ""); if (F.drop.has(h)) cut++; } }
            if (apply && cut) { st.dropped += cut; splices.push([x.s, x.e, "<" + codes.filter((c) => !F.drop.has(hexOf(c))).map(hexOf).join("") + ">"]); }
          }
        }
        else if (v === "BDC" || v === "BMC") {
          const i = stack.findIndex((x) => x.t === "name" && x.v === "ActualText"), sx = i >= 0 ? stack[i + 1] : null;
          state.depth.push(!!(sx && sx.t === "str"));
          if (sx && sx.t === "str") {
            state.inActual = true;
            const t = strBytes(sx.v); noteText(t);
            if (apply) { const sc = C().scan(t), en2 = { ...en, left: false, typo: false }, ct = C().clean(t, sc.F, en2); if (ct !== t) { st.actual++; splices.push([sx.s, sx.e, utf16Hex(ct)]); } }
          }
        }
        else if (v === "EMC") { state.depth.pop(); state.inActual = state.depth.includes(true); }
        else if (v === "Do") {
          const nm = stack.filter((x) => x.t === "name").pop(), xo = res && look(res.get(PDFName.of("XObject")));
          if (nm && xo instanceof PDFDict) { const xr = xo.get(PDFName.of(nm.v)), x = look(xr); if (x instanceof PDFRawStream && String(x.dict.get(PDFName.of("Subtype"))) === "/Form" && !done.has(xr)) { done.add(xr); run([xr], look(x.dict.get(PDFName.of("Resources"))) || res, { font: null, depth: [], inActual: false }); } }
        }
        stack.length = 0;
      }
      if (!apply || !splices.length || !(ref instanceof PDFRef)) continue;
      const enc = new TextEncoder(), chunks = []; let p = 0;
      for (const [a, b, r] of splices.sort((x, y) => x[0] - y[0])) { if (a < p) continue; chunks.push(u.subarray(p, a), enc.encode(r)); p = b; }
      chunks.push(u.subarray(p));
      const nu = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)); let o = 0; for (const c of chunks) { nu.set(c, o); o += c.length; }
      const ns = ctx.flateStream(nu);
      for (const [k, val] of so.dict.entries()) if (!/^\/(Filter|DecodeParms|Length|DL)$/.test(String(k))) ns.dict.set(k, val);
      ctx.assign(ref, ns);
    }
  }
  for (const page of pdf.getPages()) {
    const node = page.node, res = node.Resources ? node.Resources() : look(node.get(PDFName.of("Resources")));
    const c = node.get(PDFName.of("Contents")), refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
    try { run(refs, res, { font: null, depth: [], inActual: false }); } catch (e) { console.warn("page skipped", e); }
  }
  if (apply) for (const info of fontCache.values()) if (info && info.fix.size && info.ref instanceof PDFRef) {
    for (const [k, a] of info.fix) info.cm.map.set(k, a);
    st.remapped += [...info.fix.keys()].filter((k) => info.used.has(k)).length;
    ctx.assign(info.ref, ctx.flateStream(new TextEncoder().encode(writeCMap(info.cm))));
  }
  return st;
}
const ALLON = { hidden: true, zw: true, bidi: true, space: true, homo: true, left: false, typo: false };
async function cleanPdf(f, en, opt) {
  const L = await pdflib(), { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef } = L;
  const pdf = await PDFDocument.load(f.buf, { updateMetadata: false, ignoreEncryption: false });
  const ctx = pdf.context, look = (x) => (x instanceof PDFRef ? ctx.lookup(x) : x);
  let metaCleared = 0, credentials = 0;
  const w = await walkPdf(pdf, L, { ...en, left: false, typo: false }, true), dropped = w.dropped + w.actual, remapped = w.remapped;
  if (opt.meta) {
    const infoDict = look(pdf.context.trailerInfo.Info);
    if (infoDict instanceof PDFDict) for (const k of [...infoDict.keys()]) { const n = String(k).slice(1); if (!/^(Title|CreationDate|ModDate|Trapped)$/.test(n)) { infoDict.delete(k); metaCleared++; } else if (n === "Title" && AIHINT.test(String(look(infoDict.get(k))?.decodeText?.() ?? ""))) { infoDict.delete(k); metaCleared++; } }
    if (pdf.catalog.has(PDFName.of("Metadata"))) { pdf.catalog.delete(PDFName.of("Metadata")); metaCleared++; }
  }
  if (opt.creds) { // C2PA Content Credentials: associated files and embedded manifests
    const af = look(pdf.catalog.get(PDFName.of("AF")));
    if (af instanceof PDFArray) { pdf.catalog.delete(PDFName.of("AF")); credentials += af.size(); }
    const names = look(pdf.catalog.get(PDFName.of("Names"))), ef = names instanceof PDFDict ? look(names.get(PDFName.of("EmbeddedFiles"))) : null, arr = ef instanceof PDFDict ? look(ef.get(PDFName.of("Names"))) : null;
    if (arr instanceof PDFArray) {
      const items = arr.asArray(), keep = [];
      for (let i = 0; i + 1 < items.length; i += 2) { const nm = String(look(items[i])?.decodeText?.() ?? ""), fs = look(items[i + 1]); const sub = fs instanceof PDFDict ? String(look(look(fs.get(PDFName.of("EF")))?.get?.(PDFName.of("F")))?.dict?.get?.(PDFName.of("Subtype")) ?? "") : ""; if (/c2pa|manifest|jumbf/i.test(nm + sub + String(fs?.get?.(PDFName.of("AFRelationship")) ?? ""))) credentials++; else keep.push(items[i], items[i + 1]); }
      if (keep.length !== items.length) ef.set(PDFName.of("Names"), ctx.obj(keep));
    }
  }
  const out = await pdf.save({ updateFieldAppearances: false });
  return { blob: new Blob([out], { type: "application/pdf" }), fixed: dropped + remapped, dropped, remapped, metaCleared, credentials, ext: "pdf" };
}

/* ================= public ================= */
async function open(file) {
  const name = file.name || "file", buf = await file.arrayBuffer();
  if (/\.docx$/i.test(name)) return openDocx(buf, name);
  if (/\.pdf$/i.test(name) || new Uint8Array(buf.slice(0, 5)).every((b, i) => b === "%PDF-".charCodeAt(i))) return openPdf(buf, name);
  if (/\.(doc|rtf|odt|pages)$/i.test(name)) throw new Error(`.${name.split(".").pop()} files can't be cleaned here. Open it in Word and save it as .docx first`);
  return { type: "text", name, text: new TextDecoder().decode(buf) };
}
async function clean(f, en, opt) {
  if (f.type === "docx") return cleanDocx(f, en, opt);
  if (f.type === "pdf") return cleanPdf(f, en, opt);
  const t = C().clean(f.text, C().scan(f.text).F, en);
  return { blob: new Blob([t], { type: "text/plain;charset=utf-8" }), fixed: 1, ext: (f.name.match(/\.([a-z0-9]+)$/i) || [, "txt"])[1] };
}
window.WPAiFiles = { open, clean, _test: { parseCMap, writeCMap, splitCodes, tokens, glyphAction, zipRead, zipWrite } };
})();
