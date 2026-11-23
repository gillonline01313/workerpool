/* Word (.docx) → HTML for admin → PDF tools → Word → PDF. Runs only in this browser tab: the file is unzipped and read
   here, nothing is uploaded. Then the page prints it ("Save as PDF") at the document's own page size and margins.

   Handled: paragraphs and styles (headings, alignment, indents, spacing, borders, shading), bold/italic/underline/
   strike/colour/highlight/size/font/super- and subscript, bullets and numbered lists, tables (column widths, merged
   cells, borders, shading), pictures (PNG/JPG/GIF), hyperlinks, page breaks, tabs, tracked changes (insertions kept,
   deletions dropped), text boxes, and the page header and footer (repeated on every page).
   Not handled (listed as warnings): footnotes/endnotes, comments, charts, SmartArt, EMF/WMF pictures, several
   columns, page numbers and other fields (their last saved text is shown). */
(function () {
"use strict";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- unzip (central directory + DecompressionStream) ---------- */
async function unzip(bytes) {
  const u = bytes, dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("This isn't a .docx file (or it's damaged). Old .doc files: open in Word and Save As .docx.");
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = new Map(), dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl));
    files.set(name, { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  const read = async (name) => {
    const f = files.get(name); if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), raw = u.subarray(start, start + f.csize);
    if (f.method === 0) return raw.slice();
    if (f.method !== 8) throw new Error("Unsupported compression in this .docx.");
    return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  };
  return { has: (n) => files.has(n), read, text: async (n) => { const b = await read(n); return b ? dec.decode(b) : null; } };
}

/* ---------- small XML helpers ---------- */
const xml = (s) => s ? new DOMParser().parseFromString(s, "application/xml") : null;
const kids = (el, name) => el ? [...el.children].filter((c) => !name || c.localName === name) : [];
const kid = (el, name) => el ? [...el.children].find((c) => c.localName === name) || null : null;
const at = (el, name) => el ? (el.getAttributeNS(W, name) ?? el.getAttribute("w:" + name)) : null;
const deep = (el, name) => el ? el.getElementsByTagNameNS("*", name) : [];
const tw = (v) => (v == null || v === "" ? null : parseFloat(v) / 20);   // twips → pt
const onOff = (el) => !!el && !["0", "false", "off", "none"].includes(String(at(el, "val") ?? "true").toLowerCase());
const HL = { yellow: "#ffff00", green: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", blue: "#0000ff", red: "#ff0000", darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#c0c0c0", black: "#000000", white: "#ffffff" };

/* ---------- properties → plain objects ---------- */
function rProps(r) {
  const o = {}; if (!r) return o;
  for (const c of r.children) {
    const v = at(c, "val");
    switch (c.localName) {
      case "b": o.b = onOff(c); break;
      case "i": o.i = onOff(c); break;
      case "u": o.u = v && v !== "none"; break;
      case "strike": case "dstrike": o.s = onOff(c); break;
      case "caps": o.caps = onOff(c); break;
      case "smallCaps": o.sc = onOff(c); break;
      case "vanish": o.hide = onOff(c); break;
      case "sz": if (v) o.sz = parseFloat(v) / 2; break;
      case "color": if (v && v !== "auto") o.color = "#" + v; break;
      case "highlight": if (HL[v]) o.bg = HL[v]; break;
      case "shd": { const f = at(c, "fill"); if (f && f !== "auto") o.bg = "#" + f; break; }
      case "rFonts": { const f = at(c, "ascii") || at(c, "hAnsi") || at(c, "cs"); if (f) o.font = f; break; }
      case "vertAlign": if (v === "superscript" || v === "subscript") o.va = v; break;
    }
  }
  return o;
}
function pProps(p) {
  const o = {}; if (!p) return o;
  for (const c of p.children) {
    switch (c.localName) {
      case "pStyle": o.style = at(c, "val"); break;
      case "jc": { const v = at(c, "val"); o.align = { both: "justify", distribute: "justify", center: "center", right: "right", end: "right", left: "left", start: "left" }[v] || o.align; break; }
      case "ind": { const l = at(c, "left") ?? at(c, "start"), r = at(c, "right") ?? at(c, "end"), h = at(c, "hanging"), f = at(c, "firstLine");
        if (l != null) o.left = tw(l); if (r != null) o.right = tw(r); if (h != null) o.first = -tw(h); else if (f != null) o.first = tw(f); break; }
      case "spacing": { const b = at(c, "before"), a = at(c, "after"), ln = at(c, "line"), rule = at(c, "lineRule");
        if (b != null) o.before = tw(b); if (a != null) o.after = tw(a);
        if (ln != null) o.line = !rule || rule === "auto" ? { mult: parseFloat(ln) / 240 } : { pt: tw(ln), least: rule === "atLeast" }; break; }
      case "pageBreakBefore": o.pb = onOff(c); break;
      case "numPr": o.num = { id: at(kid(c, "numId"), "val"), lvl: +(at(kid(c, "ilvl"), "val") || 0) }; break;
      case "shd": { const f = at(c, "fill"); if (f && f !== "auto") o.bg = "#" + f; break; }
      case "pBdr": o.bdr = {}; for (const s of c.children) o.bdr[s.localName] = border(s); break;
      case "rPr": o.r = rProps(c); break;
    }
  }
  return o;
}
function border(b) {
  const v = at(b, "val"); if (!v || v === "nil" || v === "none") return "none";
  const w = Math.max(0.5, (parseFloat(at(b, "sz")) || 4) / 8), col = at(b, "color"), st = v === "double" ? "double" : v === "dotted" ? "dotted" : v.includes("dash") ? "dashed" : "solid";
  return `${v === "double" ? Math.max(w, 2.5) : w}pt ${st} ${col && col !== "auto" ? "#" + col : "#000"}`;
}
const merge = (...os) => Object.assign({}, ...os.filter(Boolean));

/* ---------- converter ---------- */
async function convert(bytes, name) {
  const z = await unzip(bytes);
  const docXml = await z.text("word/document.xml");
  if (!docXml) throw new Error("This doesn't look like a Word document (word/document.xml is missing).");
  const doc = xml(docXml), warn = new Set(), urls = [];
  const rels = async (part) => {
    const m = new Map(), dir = part.replace(/[^/]+$/, ""), r = xml(await z.text(dir + "_rels/" + part.split("/").pop() + ".rels"));
    if (r) for (const x of r.documentElement.children) {
      const t = x.getAttribute("Target") || "", ext = x.getAttribute("TargetMode") === "External";
      m.set(x.getAttribute("Id"), { target: ext ? t : (t.startsWith("/") ? t.slice(1) : normalize(dir + t)), external: ext, type: (x.getAttribute("Type") || "").split("/").pop() });
    }
    return m;
  };
  const normalize = (p) => { const out = []; for (const s of p.split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return out.join("/"); };

  // styles
  const st = xml(await z.text("word/styles.xml")), styles = new Map();
  let defR = {}, defP = {};
  if (st) {
    const dd = kid(st.documentElement, "docDefaults");
    defR = rProps(kid(kid(dd, "rPrDefault"), "rPr")); defP = pProps(kid(kid(dd, "pPrDefault"), "pPr"));
    for (const s of kids(st.documentElement, "style")) styles.set(at(s, "styleId"), { type: at(s, "type"), based: at(kid(s, "basedOn"), "val"), name: at(kid(s, "name"), "val") || "", p: pProps(kid(s, "pPr")), r: rProps(kid(s, "rPr")), dflt: ["1", "true"].includes(at(s, "default")) });
  }
  const chain = (id, seen = new Set()) => { const s = styles.get(id); if (!s || seen.has(id)) return []; seen.add(id); return [...chain(s.based, seen), s]; };
  const normalStyle = [...styles.entries()].find(([, s]) => s.type === "paragraph" && s.dflt);
  const pStyleOf = (id) => chain(id || (normalStyle && normalStyle[0]));
  const tableStyleBorders = (id) => { for (const s of chain(id).reverse()) { if (/grid|table grid/i.test(s.name) || /Grid/.test(id || "")) return true; } return false; };

  // numbering
  const nb = xml(await z.text("word/numbering.xml")), abs = new Map(), nums = new Map();
  if (nb) {
    for (const a of kids(nb.documentElement, "abstractNum")) {
      const lv = {}; for (const l of kids(a, "lvl")) lv[+at(l, "ilvl")] = { fmt: at(kid(l, "numFmt"), "val") || "decimal", text: at(kid(l, "lvlText"), "val") ?? "%1.", start: +(at(kid(l, "start"), "val") || 1), p: pProps(kid(l, "pPr")), r: rProps(kid(l, "rPr")) };
      abs.set(at(a, "abstractNumId"), lv);
    }
    for (const n of kids(nb.documentElement, "num")) nums.set(at(n, "numId"), at(kid(n, "abstractNumId"), "val"));
  }
  const counters = new Map();
  const roman = (n) => { const m = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]; let s = ""; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
  const letter = (n) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
  const fmtNum = (f, n) => f === "lowerLetter" ? letter(n) : f === "upperLetter" ? letter(n).toUpperCase() : f === "lowerRoman" ? roman(n) : f === "upperRoman" ? roman(n).toUpperCase() : f === "decimalZero" ? String(n).padStart(2, "0") : String(n);
  const BULLETS = ["•", "◦", "▪", "•", "◦", "▪", "•", "◦", "▪"];
  function listMarker(num) {
    const lv = abs.get(nums.get(num.id)); if (!lv || !lv[num.lvl]) return null;
    const L = lv[num.lvl], key = nums.get(num.id), c = counters.get(key) || []; counters.set(key, c);
    c[num.lvl] = (c[num.lvl] ?? (L.start - 1)) + 1; for (let i = num.lvl + 1; i < 9; i++) c[i] = undefined;
    let text;
    if (L.fmt === "bullet") { const t = L.text || ""; text = /[-]/.test(t) || !t.trim() ? BULLETS[num.lvl] : t; }
    else if (L.fmt === "none") text = "";
    else text = L.text.replace(/%(\d)/g, (_, d) => { const i = +d - 1; const l2 = lv[i] || L; return fmtNum(l2.fmt, c[i] ?? l2.start); });
    return { text, p: L.p, r: L.r };
  }

  // pictures
  const mediaUrl = new Map();
  async function img(rmap, rid, wpt, hpt, float) {
    const r = rmap.get(rid); if (!r || r.external) return "";
    const ext = (r.target.split(".").pop() || "").toLowerCase();
    if (["emf", "wmf", "svg", "tif", "tiff"].includes(ext) && ext !== "svg") { warn.add(`A ${ext.toUpperCase()} picture can't be shown (save it as PNG/JPG in Word).`); return `<span class="dx-missing" style="display:inline-block;width:${wpt || 60}pt;height:${hpt || 40}pt"></span>`; }
    let url = mediaUrl.get(r.target);
    if (!url) { const b = await z.read(r.target); if (!b) return ""; url = URL.createObjectURL(new Blob([b], { type: { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp" }[ext] || "application/octet-stream" })); mediaUrl.set(r.target, url); urls.push(url); }
    return `<img src="${url}" alt="" style="${wpt ? `width:${wpt.toFixed(1)}pt;` : "max-width:100%;"}${hpt ? `height:${hpt.toFixed(1)}pt;` : ""}${float ? `float:${float};margin:${float === "left" ? "0 8pt 4pt 0" : "0 0 4pt 8pt"};` : "vertical-align:bottom;"}">`;
  }

  // runs
  function runCss(o) {
    const css = [];
    if (o.b) css.push("font-weight:bold"); if (o.i) css.push("font-style:italic");
    const deco = [o.u && "underline", o.s && "line-through"].filter(Boolean); if (deco.length) css.push("text-decoration:" + deco.join(" "));
    if (o.sz) css.push(`font-size:${o.sz}pt`); if (o.color) css.push("color:" + o.color); if (o.bg) css.push("background:" + o.bg);
    if (o.font) css.push(`font-family:"${o.font.replace(/"/g, "")}",${FALLBACK}`);
    if (o.caps) css.push("text-transform:uppercase"); if (o.sc) css.push("font-variant:small-caps");
    if (o.va) css.push(`vertical-align:${o.va === "superscript" ? "super" : "sub"};font-size:${((o.sz || 11) * 0.65).toFixed(1)}pt`);
    return css.join(";");
  }
  const FALLBACK = `Calibri,Carlito,Arial,Helvetica,sans-serif`;

  // body walk. ctx: { rels, field: { mode } }
  async function inlines(nodes, base, ctx) {
    let h = "";
    for (const n of nodes) {
      switch (n.localName) {
        case "r": h += await run(n, base, ctx); break;
        case "hyperlink": {
          const r = ctx.rels.get(n.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || n.getAttribute("r:id"));
          const inner = await inlines(kids(n), base, ctx);
          h += r && r.external ? `<a href="${esc(r.target)}">${inner}</a>` : inner; break;
        }
        case "ins": case "smartTag": case "customXml": case "fldSimple": case "dir": case "bdo": h += await inlines(kids(n), base, ctx); break;
        case "sdt": h += await inlines(kids(kid(n, "sdtContent")), base, ctx); break;
        case "del": case "moveFrom": break;
        case "moveTo": h += await inlines(kids(n), base, ctx); break;
        case "AlternateContent": { const ch = kid(n, "Choice") || kid(n, "Fallback"); if (ch) h += await inlines(kids(ch), base, ctx); break; }
        case "oMath": case "oMathPara": warn.add("Equations are shown as plain text."); h += esc(n.textContent); break;
      }
    }
    return h;
  }
  async function run(r, base, ctx) {
    const rpr = rProps(kid(r, "rPr")), rs = at(kid(kid(r, "rPr"), "rStyle"), "val");
    const o = merge(base, ...chain(rs).map((s) => s.r), rpr);
    if (o.hide) return "";
    let h = "";
    for (const c of r.children) {
      switch (c.localName) {
        case "fldChar": { const t = at(c, "fldCharType"); if (t === "begin") ctx.field = "instr"; else if (t === "separate") ctx.field = "result"; else if (t === "end") ctx.field = null; break; }
        case "instrText": if (/\b(PAGE|NUMPAGES|SECTIONPAGES)\b/.test(c.textContent)) ctx.pageField = true; break;
        case "t": if (ctx.field !== "instr") h += esc(c.textContent); break;
        case "delText": break;
        case "tab": if (ctx.field !== "instr") h += "\t"; break;
        case "br": case "cr": h += at(c, "type") === "page" ? `<span class="dx-pb"></span>` : at(c, "type") === "column" ? "" : "<br>"; break;
        case "noBreakHyphen": h += "‑"; break;
        case "softHyphen": h += "&shy;"; break;
        case "sym": { const ch = parseInt(at(c, "char") || "", 16); h += ch ? esc(String.fromCodePoint(ch >= 0xf000 ? 0x2022 : ch)) : ""; break; }
        case "drawing": h += await drawing(c, ctx); break;
        case "pict": h += await pict(c, ctx); break;
        case "AlternateContent": { const ch = kid(c, "Choice") || kid(c, "Fallback"); if (ch) for (const x of ch.children) h += x.localName === "drawing" ? await drawing(x, ctx) : x.localName === "pict" ? await pict(x, ctx) : ""; break; }
        case "footnoteReference": case "endnoteReference": warn.add("Footnotes and endnotes aren't included."); break;
        case "commentReference": break;
        case "object": warn.add("An embedded object (e.g. a chart or OLE object) is shown as its picture only, if it has one."); h += await pict(c, ctx); break;
      }
    }
    if (!h) return "";
    const css = runCss(o);
    return css ? `<span style="${css}">${h}</span>` : h;
  }
  async function drawing(d, ctx) {
    const anchor = kid(d, "anchor"), box = anchor || kid(d, "inline"); if (!box) return "";
    const ext = kid(box, "extent"), wpt = ext ? +ext.getAttribute("cx") / 12700 : 0, hpt = ext ? +ext.getAttribute("cy") / 12700 : 0;
    let float = null;
    if (anchor) { const ah = deep(anchor, "align")[0]; const a = ah && ah.textContent; float = a === "right" ? "right" : a === "center" ? null : "left";
      if (deep(anchor, "wrapNone").length || deep(anchor, "wrapTopAndBottom").length) float = null; }
    const blip = deep(box, "blip")[0];
    if (blip) {
      const rid = blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed");
      const html = await img(ctx.rels, rid, wpt, hpt, float);
      return anchor && !float ? `<span style="display:block;text-align:${(deep(anchor, "align")[0] || {}).textContent === "center" ? "center" : "left"}">${html}</span>` : html;
    }
    const tx = deep(box, "txbxContent")[0];
    if (tx) return `<span class="dx-box" style="display:${float ? "block" : "inline-block"};${wpt ? `width:${wpt.toFixed(1)}pt;` : ""}${float ? `float:${float};` : ""}">${await blocks(kids(tx), ctx)}</span>`;
    if (deep(box, "chart").length) warn.add("Charts aren't included.");
    else if (deep(box, "relIds").length) warn.add("SmartArt diagrams aren't included.");
    return "";
  }
  async function pict(p, ctx) {
    const im = deep(p, "imagedata")[0];
    if (im) { const shape = im.parentElement, stl = (shape && shape.getAttribute("style")) || "", g = (k) => { const m = stl.match(new RegExp(k + ":\\s*([\\d.]+)(pt|in|px)?")); return m ? +m[1] * (m[2] === "in" ? 72 : m[2] === "px" ? 0.75 : 1) : 0; };
      return img(ctx.rels, im.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || im.getAttribute("r:id"), g("width"), g("height")); }
    const tx = deep(p, "txbxContent")[0];
    return tx ? `<span class="dx-box" style="display:block">${await blocks(kids(tx), ctx)}</span>` : "";
  }

  // paragraphs
  async function para(p, ctx) {
    const pp = pProps(kid(p, "pPr")), sc = pStyleOf(pp.style);
    const P = merge(defP, ...sc.map((s) => s.p), pp);
    const R = merge(defR, ...sc.map((s) => s.r));
    let marker = null;
    const num = pp.num || sc.map((s) => s.p.num).filter(Boolean).pop();
    if (num && num.id && num.id !== "0") { marker = listMarker(num); if (marker) Object.assign(P, merge(marker.p, pp.left != null || pp.first != null ? { left: pp.left ?? marker.p.left, first: pp.first ?? marker.p.first } : null)); }
    const sect = kid(kid(p, "pPr"), "sectPr"); if (sect) ctx.sects.push(sect);
    let inner = await inlines(kids(p).filter((c) => c.localName !== "pPr"), R, ctx);
    const empty = !inner.replace(/<span[^>]*>|<\/span>/g, "").length;
    const css = [];
    if (P.align) css.push("text-align:" + P.align);
    if (P.left) css.push(`margin-left:${P.left}pt`); if (P.right) css.push(`margin-right:${P.right}pt`);
    if (P.first) css.push(`text-indent:${P.first}pt`);
    css.push(`margin-top:${P.before || 0}pt`, `margin-bottom:${P.after || 0}pt`);
    if (P.line) css.push(P.line.mult ? `line-height:${Math.max(0.8, P.line.mult * 1.15).toFixed(3)}` : P.line.least ? `line-height:max(1.15,${P.line.pt}pt)` : `line-height:${P.line.pt}pt`);
    if (P.bg) css.push("background:" + P.bg);
    if (P.bdr) for (const [k, v] of Object.entries(P.bdr)) if (["top", "bottom", "left", "right"].includes(k)) css.push(`border-${k}:${v}`), v !== "none" && css.push(`padding-${k}:2pt`);
    if (P.pb) css.push("break-before:page");
    const rcss = runCss(R);
    if (rcss) css.push(rcss);
    const hm = ((sc[sc.length - 1] || {}).name || "").match(/^heading\s?([1-6])$/i), tag = hm ? "h" + hm[1] : "p";
    const mk = marker ? `<span class="dx-mk" style="${runCss(merge(R, marker.r))};${P.first < 0 ? `display:inline-block;min-width:${-P.first}pt;text-indent:0` : "padding-right:6pt"}">${esc(marker.text)}</span>` : "";
    return `<${tag} class="dx-p" style="${css.join(";")}">${mk}${empty && !mk ? "&#8203;" : `<span>${inner}</span>`}</${tag}>`;
  }

  // tables
  async function table(t, ctx) {
    const tp = kid(t, "tblPr"), grid = kids(kid(t, "tblGrid"), "gridCol").map((g) => tw(at(g, "w")) || 0);
    const tStyle = at(kid(tp, "tblStyle"), "val");
    const tb = {}; for (const s of kids(kid(tp, "tblBorders"))) tb[s.localName === "start" ? "left" : s.localName === "end" ? "right" : s.localName] = border(s);
    const def = "0.5pt solid #000", hasGrid = Object.keys(tb).length ? null : tableStyleBorders(tStyle);
    const ob = (k) => tb[k] || (hasGrid ? def : "none");
    const jc = at(kid(tp, "jc"), "val"), ind = tw(at(kid(tp, "tblInd"), "w"));
    const cm = kid(tp, "tblCellMar"), pad = (k) => tw(at(kid(cm, k) || kid(cm, k === "left" ? "start" : "end"), "w"));
    const padL = pad("left") ?? 5.4, padR = pad("right") ?? 5.4;
    // first pass: positions, gridSpan, vMerge → rowspan
    const rows = kids(t, "tr").map((tr) => {
      let col = +(at(kid(kid(tr, "trPr"), "gridBefore"), "val") || 0);
      return { tr, cells: kids(tr, "tc").map((tc) => { const pr = kid(tc, "tcPr"), span = +(at(kid(pr, "gridSpan"), "val") || 1), vm = kid(pr, "vMerge");
        const c = { tc, pr, col, span, vm: vm ? (at(vm, "val") === "restart" ? "start" : "cont") : null, rows: 1 }; col += span; return c; }) };
    });
    rows.forEach((r, i) => r.cells.forEach((c) => { if (c.vm === "cont") { for (let j = i - 1; j >= 0; j--) { const up = rows[j].cells.find((x) => x.col === c.col && x.vm !== "cont"); if (up) { up.rows++; break; } if (!rows[j].cells.some((x) => x.col === c.col)) break; } } }));
    let h = `<table class="dx-t" style="border-collapse:collapse;${grid.length ? `width:${grid.reduce((a, b) => a + b, 0)}pt;` : "width:100%;"}${jc === "center" ? "margin-left:auto;margin-right:auto;" : jc === "right" ? "margin-left:auto;" : ind ? `margin-left:${ind}pt;` : ""}border-top:${ob("top")};border-bottom:${ob("bottom")};border-left:${ob("left")};border-right:${ob("right")}">
      ${grid.length ? `<colgroup>${grid.map((w) => `<col style="width:${w}pt">`).join("")}</colgroup>` : ""}`;
    for (const r of rows) {
      const trh = kid(kid(r.tr, "trPr"), "trHeight"), hpt = trh ? tw(at(trh, "val")) : null, hdr = onOff(kid(kid(r.tr, "trPr"), "tblHeader"));
      h += `<tr${hpt ? ` style="height:${hpt}pt"` : ""}${hdr ? ` class="dx-th"` : ""}>`;
      for (const c of r.cells) {
        if (c.vm === "cont") continue;
        const cb = {}; for (const s of kids(kid(c.pr, "tcBorders"))) cb[s.localName === "start" ? "left" : s.localName === "end" ? "right" : s.localName] = border(s);
        const inH = tb.insideH || (hasGrid ? def : "none"), inV = tb.insideV || (hasGrid ? def : "none");
        const shd = at(kid(c.pr, "shd"), "fill"), va = at(kid(c.pr, "vAlign"), "val");
        const css = [`border-top:${cb.top || inH}`, `border-bottom:${cb.bottom || inH}`, `border-left:${cb.left || inV}`, `border-right:${cb.right || inV}`,
          `padding:0 ${padR}pt 0 ${padL}pt`, `vertical-align:${va === "center" ? "middle" : va === "bottom" ? "bottom" : "top"}`];
        if (shd && shd !== "auto") css.push("background:#" + shd);
        h += `<td${c.span > 1 ? ` colspan="${c.span}"` : ""}${c.rows > 1 ? ` rowspan="${c.rows}"` : ""} style="${css.join(";")}">${await blocks(kids(c.tc).filter((x) => x.localName !== "tcPr"), ctx)}</td>`;
      }
      h += `</tr>`;
    }
    return h + `</table>`;
  }

  async function blocks(nodes, ctx) {
    let h = "";
    for (const n of nodes) {
      if (n.localName === "p") h += await para(n, ctx);
      else if (n.localName === "tbl") h += await table(n, ctx);
      else if (n.localName === "sdt") h += await blocks(kids(kid(n, "sdtContent")), ctx);
      else if (n.localName === "customXml" || n.localName === "ins") h += await blocks(kids(n), ctx);
      else if (n.localName === "sectPr") ctx.sects.push(n);
      else if (n.localName === "AlternateContent") { const ch = kid(n, "Choice") || kid(n, "Fallback"); if (ch) h += await blocks(kids(ch), ctx); }
    }
    return h;
  }

  // body
  const body = kid(doc.documentElement, "body"), ctx = { rels: await rels("word/document.xml"), sects: [], field: null };
  const html = await blocks(kids(body), ctx);
  if (z.has("word/footnotes.xml") && deep(doc, "footnoteReference").length) warn.add("Footnotes and endnotes aren't included.");
  if (z.has("word/comments.xml") && deep(doc, "commentRangeStart").length) warn.add("Comments aren't included.");

  // page setup from the last section (and warn if sections differ)
  const sect = ctx.sects[ctx.sects.length - 1] || kid(body, "sectPr");
  const sz = kid(sect, "pgSz"), mar = kid(sect, "pgMar");
  const page = { w: tw(at(sz, "w")) || 612, h: tw(at(sz, "h")) || 792, top: tw(at(mar, "top")) ?? 72, bottom: tw(at(mar, "bottom")) ?? 72, left: tw(at(mar, "left")) ?? 72, right: tw(at(mar, "right")) ?? 72,
    header: tw(at(mar, "header")) ?? 36, footer: tw(at(mar, "footer")) ?? 36 };
  page.top = Math.abs(page.top); page.bottom = Math.abs(page.bottom);
  if (ctx.sects.length > 1) { const k = (s) => [at(kid(s, "pgSz"), "w"), at(kid(s, "pgSz"), "h"), at(kid(s, "pgSz"), "orient")].join(); if (new Set(ctx.sects.map(k)).size > 1) warn.add("Sections with different page sizes or orientation: every page uses the last section's size."); }
  const cols = kid(sect, "cols"); if (cols && +(at(cols, "num") || 1) > 1) warn.add("Text in several columns is shown as one column.");

  // header / footer (default; the first-page ones when "different first page" is on and there's no default)
  const titlePg = onOff(kid(sect, "titlePg"));
  async function part(kind) {
    const refs = kids(sect, kind + "Reference"), pick = (t) => refs.find((r) => at(r, "type") === t);
    const ref = pick("default") || (titlePg ? pick("first") : null); if (!ref) return { html: "", first: "" };
    const load = async (r) => { if (!r) return ""; const rid = r.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || r.getAttribute("r:id"), t = ctx.rels.get(rid); if (!t) return "";
      const x = xml(await z.text(t.target)); if (!x) return ""; const c2 = { rels: await rels(t.target), sects: [], field: null }; const h = await blocks(kids(x.documentElement), c2); if (c2.pageField) ctx.pageField = true; return h.replace(/<p class="dx-p"[^>]*>&#8203;<\/p>/g, "") ? h : ""; };
    return { html: await load(pick("default")), first: titlePg ? await load(pick("first")) : null };
  }
  const header = await part("header"), footer = await part("footer");
  if (titlePg && (header.first !== null && header.first !== header.html || footer.first !== null && footer.first !== footer.html)) warn.add("“Different first page” header/footer: the first page uses its own header and footer at the top and bottom of the document; later pages use the main ones.");
  if (ctx.pageField) warn.add("Page numbers aren't filled in (the number Word last saved is shown, if any).");

  return { name, html, header, footer, page, titlePg, warnings: [...warn], urls };
}

// The printable / previewable HTML. Header and footer repeat on every printed page (table header/footer groups).
function docCss(page) {
  return `.dx{font-family:${'Calibri,Carlito,Arial,Helvetica,sans-serif'};font-size:11pt;line-height:1.15;color:#000;background:#fff;tab-size:36pt;-moz-tab-size:36pt}
.dx *{box-sizing:border-box}.dx .dx-p{white-space:pre-wrap;overflow-wrap:break-word;orphans:2;widows:2}
.dx h1,.dx h2,.dx h3,.dx h4,.dx h5,.dx h6{font-size:inherit;font-weight:inherit;break-after:avoid}
.dx table.dx-t{table-layout:fixed;max-width:100%}.dx table.dx-t td>.dx-p:first-child{margin-top:0}.dx table.dx-t tr{break-inside:avoid}
.dx .dx-th{display:table-row}.dx a{color:#0563c1}.dx .dx-missing{background:repeating-linear-gradient(45deg,#eee,#eee 6px,#ddd 6px,#ddd 12px)}
.dx .dx-pb{display:block;break-before:page}.dx .dx-box{border:0}.dx img{max-width:100%}
.dx table.dx-page{width:100%;border-collapse:collapse}.dx table.dx-page>*>tr>td{padding:0}
.dx .dx-fh,.dx .dx-ff{display:none}
@media print{.dx .dx-fh{display:block;position:fixed;top:0;left:0;right:0}.dx .dx-ff{display:block;position:fixed;bottom:0;left:0;right:0}.dx .dx-hd>*,.dx .dx-ft>*{visibility:hidden}}`;
}
function layout(r, { print } = {}) {
  const p = r.page, hasHF = !!(r.header.html || r.footer.html), first = r.titlePg ? { h: r.header.first, f: r.footer.first } : null;
  const top = hasHF ? Math.max(0, p.top - p.header) : 0, bot = hasHF ? Math.max(0, p.bottom - p.footer) : 0;
  const content = `${first && first.h ? `<div class="dx-first-h">${first.h}</div>` : ""}${r.html}${first && first.f ? `<div class="dx-first-f">${first.f}</div>` : ""}`;
  // On screen the header/footer show in the table's header and footer rows. When printing, those rows only reserve the
  // space (repeated on every page) and fixed copies are drawn at the page edges, so the last page's footer sits at the
  // bottom too.
  const inner = hasHF ? `${print ? `<div class="dx-fh">${r.header.html || ""}</div><div class="dx-ff">${r.footer.html || ""}</div>` : ""}<table class="dx-page"><thead><tr><td class="dx-hd" style="height:${top}pt;vertical-align:top">${r.header.html || ""}</td></tr></thead>
    <tfoot><tr><td class="dx-ft" style="height:${bot}pt;vertical-align:bottom">${r.footer.html || ""}</td></tr></tfoot><tbody><tr><td>${content}</td></tr></tbody></table>` : content;
  return { html: `<div class="dx">${inner}</div>`, css: docCss(p),
    pageCss: `@page{size:${p.w}pt ${p.h}pt;margin:${hasHF ? p.header : p.top}pt ${p.right}pt ${hasHF ? p.footer : p.bottom}pt ${p.left}pt}` };
}
function release(r) { if (r && r.urls) for (const u of r.urls) URL.revokeObjectURL(u); }

window.WPDocx = { convert, layout, release };
})();
