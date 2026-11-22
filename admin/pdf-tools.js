/* Admin → PDF tools. Three tools for client documents, all running only in this browser tab (nothing is uploaded,
   saved or logged; files are gone when you lock the console or reload):

   1. XFA → flat PDF: turns a fillable form into a plain PDF that can't be edited.
      - Pure (dynamic) XFA forms, like most IRCC IMM forms that show "Please wait…" outside Adobe: pdf.js lays the form
        out with its answers, then either "Save as PDF" through the browser's print dialog (sharp, selectable text) or a
        direct download of an image PDF (pages drawn at the DPI you pick).
      - Hybrid XFA and ordinary fillable (AcroForm) PDFs: the XFA part is removed and every field is flattened into the
        page with pdf-lib (text stays selectable), or an image copy is made that looks exactly like the screen.
   2. Compress: asks what size the file needs to be under (presets for the IRCC portal's 4 MB and common limits), then
      tries, mildest first: tidying the file structure (no quality loss) → re-compressing the photos/scans inside
      (text stays selectable) → turning pages into images (text no longer selectable, only if allowed). It picks the
      mildest setting that fits the target and says what it did.
   3. Merge / split: merge several PDFs in any order (optionally only some pages of each, form fields flattened first),
      or split one PDF: pick pages from thumbnails, ranges ("1-3, 4-6, 7-"), every N pages or every page. Several
      outputs download as one ZIP.

   Libraries: pdf-lib (assets/vendor/pdf-lib) and pdf.js (assets/vendor/pdfjs), already used by the AI text check. */
(function () {
"use strict";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let LIB = null;
const pdflib = () => (LIB ||= import("/assets/vendor/pdf-lib/pdf-lib.esm.min.js"));
const pdfjs = () => window.__wpPdfjs || (window.__wpPdfjs = import("/assets/vendor/pdfjs/pdf.min.js").then((m) => { m.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs/pdf.worker.min.js"; return m; }));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + " MB" : n >= 1e3 ? Math.round(n / 1e3) + " KB" : n + " bytes");
const tick = () => new Promise((r) => setTimeout(r, 0));
const baseName = (n) => String(n || "document").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "_");
const isPdf = (u) => u.length > 4 && String.fromCharCode(...u.subarray(0, 1024)).includes("%PDF");
const pjsOpen = async (bytes, extra = {}) => { const t = (await pdfjs()).getDocument({ data: bytes.slice(), isEvalSupported: false, ...extra }); const d = await t.promise; d.__task = t; return d; };
const pjsClose = async (d) => { try { await (d.__task || d.loadingTask).destroy(); } catch (e) {} };
async function libOpen(bytes) {
  const L = await pdflib();
  try { return await L.PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) {
    if (/encrypt/i.test(e.message || "")) throw new Error("this PDF is password-protected. Open it in a PDF reader, remove the password (or print to PDF) and try again");
    throw new Error("this isn't a readable PDF (" + (e.message || e) + ")");
  }
}
function saveBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const pdfBlob = (u) => new Blob([u], { type: "application/pdf" });
const canvasJpeg = (c, q) => new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((x) => res(new Uint8Array(x))) : rej(new Error("the browser couldn't encode the image (page too large?)"))), "image/jpeg", q));

/* ================= page ranges ================= */
// "1-3, 5, 8-" → [[0,1,2],[4],[7..n-1]] (one group per comma part). "all" or "" → every page.
function parseGroups(str, n) {
  const s = String(str || "").trim().toLowerCase();
  if (!s || s === "all") return [[...Array(n).keys()]];
  const groups = [];
  for (const part of s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*(?:-|–|to)\s*(\d*)$/) || part.match(/^(\d+)$/);
    if (!m) throw new Error(`“${part}” isn't a page or range (use e.g. 1-3, 5, 8-)`);
    let a, b;
    if (m.length === 2) a = b = +m[1];
    else { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
    if (a < 1 || b < 1 || a > n || b > n) throw new Error(`page ${a > n || a < 1 ? a : b} doesn't exist (this PDF has ${n} page${n > 1 ? "s" : ""})`);
    const g = [];
    if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1); else for (let i = a; i >= b; i--) g.push(i - 1);
    groups.push(g);
  }
  if (!groups.length) throw new Error("no pages given");
  return groups;
}
const parsePages = (str, n) => parseGroups(str, n).flat();
const describe = (idx) => { // [0,1,2,4] → "1-3, 5"
  const out = []; let i = 0;
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++; out.push(j > i ? `${idx[i] + 1}-${idx[j] + 1}` : `${idx[i] + 1}`); i = j + 1; }
  return out.join(", ");
};

/* ================= ZIP (stored, no compression: PDFs are already compressed) ================= */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const parts = [], cen = []; let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const name = new TextEncoder().encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cs = cen.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: "application/zip" });
}

/* ================= 1. XFA / form flattening ================= */
async function inspectForm(bytes) {
  const L = await pdflib();
  const info = { kind: "none", fields: 0, pages: 0, encrypted: false, signed: false };
  let doc;
  try { doc = await L.PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) { if (/encrypt/i.test(e.message || "")) { info.encrypted = true; doc = await L.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true }); } else throw new Error("this isn't a readable PDF"); }
  info.pages = doc.getPageCount();
  const af = doc.catalog.lookupMaybe(L.PDFName.of("AcroForm"), L.PDFDict);
  const hasXfa = !!(af && af.has(L.PDFName.of("XFA")));
  try { const fs = doc.getForm().getFields(); info.fields = fs.length; info.signed = fs.some((f) => f instanceof L.PDFSignature); } catch (e) { info.fields = 0; }
  if (hasXfa) {
    // Ask pdf.js: if it can lay out the XFA itself the form is "pure" (dynamic) XFA.
    let pure = false;
    try { const d = await pjsOpen(bytes, { enableXfa: true }); pure = d.isPureXfa; await pjsClose(d); } catch (e) {}
    info.kind = pure ? "pure" : "hybrid";
  } else if (info.fields) info.kind = "acro";
  return info;
}
// Hybrid XFA / AcroForm → flattened, vector PDF (text stays selectable).
async function flattenAcro(bytes) {
  const L = await pdflib(), doc = await libOpen(bytes), N = (n) => L.PDFName.of(n);
  const af = doc.catalog.lookupMaybe(N("AcroForm"), L.PDFDict);
  if (af) af.delete(N("XFA"));
  doc.catalog.delete(N("NeedsRendering"));
  const form = doc.getForm(), bad = [];
  for (const f of form.getFields()) { // build missing appearances one field at a time, so one odd field doesn't stop the rest
    try { if (f.needsAppearancesUpdate?.()) f.defaultUpdateAppearances(await doc.embedFont(L.StandardFonts.Helvetica)); } catch (e) { bad.push(f.getName()); }
  }
  try { form.flatten({ updateFieldAppearances: false }); }
  catch (e) { throw new Error("pdf-lib couldn't flatten this form (" + (e.message || e) + "). Use “Image copy” instead"); }
  if (af) { af.set(N("Fields"), doc.context.obj([])); af.delete(N("NeedAppearances")); }
  return { bytes: await doc.save({ useObjectStreams: true }), bad };
}

// Minimal copy of pdf.js's xfa_layer.css, so the form lays out the same as in Firefox / the pdf.js viewer.
const XFA_CSS = `
.xfaLayer{position:absolute;top:0;left:0;z-index:200;transform-origin:0 0;line-height:1.2}
.xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:none;line-height:inherit}
.xfaLayer *:required{outline:none}
.xfaLayer a{color:blue}
.xfaRich li{margin-left:3em}
.xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}
.xfaCaption{overflow:hidden;flex:0 0 auto}
.xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}
.xfaLabel{height:100%;width:100%}
.xfaLeft{display:flex;flex-direction:row;align-items:center}
.xfaRight{display:flex;flex-direction:row-reverse;align-items:center}
.xfaLeft>.xfaCaption,.xfaLeft>.xfaCaptionForCheckButton,.xfaRight>.xfaCaption,.xfaRight>.xfaCaptionForCheckButton{max-height:100%}
.xfaTop{display:flex;flex-direction:column;align-items:flex-start}
.xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}
.xfaTop>.xfaCaption,.xfaTop>.xfaCaptionForCheckButton,.xfaBottom>.xfaCaption,.xfaBottom>.xfaCaptionForCheckButton{width:100%}
.xfaBorder{background-color:transparent;position:absolute;pointer-events:none}
.xfaWrapped{width:100%;height:100%}
.xfaTextfield,.xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background:transparent;overflow:hidden;-webkit-appearance:none;appearance:none}
.xfaSelect{padding-inline:2px;text-indent:1px;text-overflow:""}
.xfaTop>.xfaTextfield,.xfaTop>.xfaSelect,.xfaBottom>.xfaTextfield,.xfaBottom>.xfaSelect{flex:0 1 auto}
.xfaButton{width:100%;height:100%;border:none;text-align:center}
.xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}
.xfaCheckbox,.xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none;accent-color:#000}
.xfaRich{white-space:pre-wrap;width:100%;height:100%}
.xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}
.xfaLrTb,.xfaRlTb,.xfaTb{display:flex;flex-direction:column;align-items:stretch}
.xfaLr{display:flex;flex-direction:row;align-items:stretch}
.xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}
.xfaTb>div{justify-content:left}
.xfaPosition,.xfaArea{position:relative}
.xfaValignMiddle{display:flex;align-items:center}
.xfaTable{display:flex;flex-direction:column;align-items:stretch}
.xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}
.xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}
.xfaTable .xfaRlRow>div{flex:1}
.pt-xpage{position:relative;overflow:hidden;background:#fff;color:#000}
`;
const b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

// Lays out a pure XFA form with pdf.js into `host` (one .pt-xpage per page). Also captures the form's fonts so the
// image export can embed them (an SVG image can't see fonts loaded into the page).
async function xfaRender(bytes, host) {
  const P = await pdfjs(), fonts = [], Orig = window.FontFace;
  function Spy(fam, src, d) { const f = new Orig(fam, src, d); if (src && typeof src !== "string") try { fonts.push({ fam, data: new Uint8Array(src.buffer ? src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) : src), d: d || {} }); } catch (e) {} return f; }
  Spy.prototype = Orig.prototype;
  window.FontFace = Spy;
  let doc;
  try { doc = await pjsOpen(bytes, { enableXfa: true, fontExtraProperties: true }); await tick(); }
  finally { window.FontFace = Orig; }
  if (!doc.isPureXfa) { await pjsClose(doc); throw new Error("this form isn't a dynamic XFA form"); }
  try { await document.fonts.ready; } catch (e) {}
  const s = P.PixelsPerInch.PDF_TO_CSS_UNITS, pages = [];
  const link = { addLinkAttributes(a, url) { try { a.href = url; } catch (e) {} }, getDestinationHash: () => "#", getAnchorUrl: () => "#", navigateTo() {}, eventBus: null };
  for (const xp of doc.allXfaHtml.children) {
    const w = parseInt(xp.attributes.style.width, 10) || 612, h = parseInt(xp.attributes.style.height, 10) || 792;
    const page = document.createElement("div"); page.className = "pt-xpage"; page.style.width = w * s + "px"; page.style.height = h * s + "px";
    const layer = document.createElement("div"); page.appendChild(layer); host.appendChild(page);
    P.XfaLayer.render({ viewport: { transform: [s, 0, 0, s, 0, 0] }, div: layer, xfaHtml: xp, annotationStorage: doc.annotationStorage, linkService: link, intent: "print" });
    for (const el of layer.querySelectorAll("input,textarea,select,button")) { el.tabIndex = -1; if (el.tagName !== "SELECT") el.readOnly = true; }
    pages.push({ el: page, w, h });
  }
  await pjsClose(doc);
  return { pages, fonts };
}
// Bakes live form state into attributes so it survives cloning/serialising.
function bakeState(root) {
  for (const el of root.querySelectorAll("input")) {
    if (el.type === "checkbox" || el.type === "radio") { if (el.checked) el.setAttribute("checked", ""); else el.removeAttribute("checked"); }
    else el.setAttribute("value", el.value);
  }
  for (const el of root.querySelectorAll("textarea")) el.textContent = el.value;
  for (const el of root.querySelectorAll("select")) for (const o of el.options) { if (o.selected) o.setAttribute("selected", ""); else o.removeAttribute("selected"); }
}
async function imgToData(img) {
  const src = img.getAttribute("src") || "";
  if (!src || src.startsWith("data:")) return;
  try { const b = await (await fetch(src)).blob(); img.setAttribute("src", await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); })); } catch (e) { img.removeAttribute("src"); }
}
let fontCssCache = null;
function fontCss(fonts) {
  if (fontCssCache && fontCssCache.f === fonts) return fontCssCache.css;
  const css = fonts.map((f) => `@font-face{font-family:${JSON.stringify(String(f.fam).replace(/^["']|["']$/g, ""))};src:url(data:font/opentype;base64,${b64(f.data)});${f.d.weight ? `font-weight:${f.d.weight};` : ""}${f.d.style ? `font-style:${f.d.style};` : ""}}`).join("\n");
  fontCssCache = { f: fonts, css }; return css;
}
// Draws one laid-out XFA page onto a canvas through an SVG <foreignObject> image.
async function xfaPageCanvas(pg, fonts, dpi) {
  const k = dpi / 96, W = Math.round(pg.w * dpi / 72), H = Math.round(pg.h * dpi / 72);
  bakeState(pg.el);
  const clone = pg.el.cloneNode(true);
  await Promise.all([...clone.querySelectorAll("img")].map(imgToData));
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${pg.w * 96 / 72}px;height:${pg.h * 96 / 72}px;transform:scale(${k});transform-origin:0 0;background:#fff"><style>${fontCss(fonts)}${XFA_CSS}</style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); // a data: URL keeps the canvas exportable (a blob: URL taints it)
  {
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("the browser couldn't draw this page")); img.src = url; });
    try { await img.decode(); } catch (e) {}
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
    return c;
  }
}
async function xfaImagePdf(r, dpi, onp) {
  const L = await pdflib(), out = await L.PDFDocument.create();
  for (let i = 0; i < r.pages.length; i++) {
    onp && onp(`Drawing page ${i + 1} of ${r.pages.length}…`);
    const pg = r.pages[i], c = await xfaPageCanvas(pg, r.fonts, dpi);
    const jpg = await out.embedJpg(await canvasJpeg(c, 0.9)); c.width = c.height = 0;
    out.addPage([pg.w, pg.h]).drawImage(jpg, { x: 0, y: 0, width: pg.w, height: pg.h });
    await tick();
  }
  out.setProducer("WorkerPool PDF tools"); out.setCreator("WorkerPool PDF tools");
  return out.save();
}
// Print / Save as PDF: the laid-out pages are moved into a print-only container (fonts stay loaded).
function printPages(r, title) {
  let box = document.getElementById("ptPrint");
  if (!box) { box = document.createElement("div"); box.id = "ptPrint"; document.body.appendChild(box); }
  box.innerHTML = ""; for (const p of r.pages) { p.el.style.transform = ""; p.el.style.margin = "0"; box.appendChild(p.el); }
  const w = r.pages[0].w, h = r.pages[0].h;
  let st = document.getElementById("ptPrintCss");
  if (!st) { st = document.createElement("style"); st.id = "ptPrintCss"; document.head.appendChild(st); }
  st.textContent = `${XFA_CSS}
#ptPrint{position:fixed;left:-100000px;top:0}
@media print{@page{size:${w}pt ${h}pt;margin:0}html,body{background:#fff!important;margin:0!important;padding:0!important}body>*:not(#ptPrint){display:none!important}
#ptPrint{position:static;left:auto}#ptPrint .pt-xpage{break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}#ptPrint .pt-xpage:last-child{break-after:auto;page-break-after:auto}}`;
  const old = document.title; document.title = title; // Chrome/Edge use the title as the suggested file name
  const done = () => { document.title = old; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}
function clearPrint() { const b = document.getElementById("ptPrint"); if (b) b.remove(); }

/* ================= pdf.js page rasteriser (image copies, strongest compression) ================= */
async function rasterPdf(bytes, { dpi, q, forms = true, gray = false }, onp) {
  const P = await pdfjs(), L = await pdflib(), doc = await pjsOpen(bytes), out = await L.PDFDocument.create();
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onp && onp(`Page ${i} of ${doc.numPages} at ${dpi} dpi…`);
      const page = await doc.getPage(i), v1 = page.getViewport({ scale: 1 });
      const sc = Math.min(dpi / 72, 10000 / Math.max(v1.width, v1.height)), vp = page.getViewport({ scale: sc });
      const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp, intent: forms ? "print" : "display", annotationMode: forms ? P.AnnotationMode.ENABLE_STORAGE : P.AnnotationMode.ENABLE }).promise;
      if (gray) { const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data; for (let j = 0; j < a.length; j += 4) a[j] = a[j + 1] = a[j + 2] = (a[j] * 77 + a[j + 1] * 150 + a[j + 2] * 29) >> 8; ctx.putImageData(d, 0, 0); }
      const jpg = await out.embedJpg(await canvasJpeg(c, q)); c.width = c.height = 0;
      out.addPage([v1.width, v1.height]).drawImage(jpg, { x: 0, y: 0, width: v1.width, height: v1.height });
      page.cleanup(); await tick();
    }
  } finally { await pjsClose(doc); }
  out.setProducer("WorkerPool PDF tools"); out.setCreator("WorkerPool PDF tools");
  return out.save();
}

/* ================= 2. compression ================= */
async function lossless(bytes) {
  const doc = await libOpen(bytes);
  return doc.save({ useObjectStreams: true });
}
function a85(u) { // ASCII85Decode
  const out = []; let t = 0, n = 0;
  for (let i = 0; i < u.length; i++) {
    const c = u[i];
    if (c === 0x7E) break; // ~>
    if (c <= 32) continue;
    if (c === 0x7A && n === 0) { out.push(0, 0, 0, 0); continue; } // z
    t = t * 85 + (c - 33); n++;
    if (n === 5) { out.push((t >>> 24) & 255, (t >>> 16) & 255, (t >>> 8) & 255, t & 255); t = 0; n = 0; }
  }
  if (n) { for (let k = n; k < 5; k++) t = t * 85 + 84; for (let k = 0; k < n - 1; k++) out.push((t >>> (24 - 8 * k)) & 255); }
  return new Uint8Array(out);
}
function ahx(u) { // ASCIIHexDecode
  const h = new TextDecoder().decode(u).replace(/>.*$/s, "").replace(/[^0-9a-f]/gi, ""), o = new Uint8Array((h.length + 1) >> 1);
  for (let i = 0; i < o.length; i++) o[i] = parseInt((h.substr(i * 2, 2) + "0").slice(0, 2), 16);
  return o;
}
async function inflate(u) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()); }
function unpredict(data, w, h, colors, pred) { // PNG predictors (DecodeParms /Predictor 10-15)
  if (!pred || pred === 1) return data;
  if (pred < 10) return null; // TIFF predictor: not handled
  const rb = w * colors, out = new Uint8Array(rb * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = data[p++], o = y * rb, pr = o - rb;
    for (let x = 0; x < rb; x++) {
      const raw = data[p++] ?? 0, a = x >= colors ? out[o + x - colors] : 0, b = y ? out[pr + x] : 0, c = y && x >= colors ? out[pr + x - colors] : 0;
      let v;
      switch (ft) {
        case 0: v = raw; break; case 1: v = raw + a; break; case 2: v = raw + b; break; case 3: v = raw + ((a + b) >> 1); break;
        case 4: { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: return null;
      }
      out[o + x] = v & 255;
    }
  }
  return out;
}
function csInfo(L, ctx, cs) { // → number of colour components we can handle (1 or 3), or 0
  cs = cs instanceof L.PDFRef ? ctx.lookup(cs) : cs;
  if (cs instanceof L.PDFName) { const n = cs.asString(); return n === "/DeviceRGB" || n === "/CalRGB" ? 3 : n === "/DeviceGray" || n === "/CalGray" ? 1 : 0; }
  if (cs instanceof L.PDFArray && cs.size()) {
    const k = cs.lookup(0); const n = k instanceof L.PDFName ? k.asString() : "";
    if (n === "/ICCBased") { const st = cs.lookup(1); const nn = st && st.dict && st.dict.get(L.PDFName.of("N")); const v = nn && nn.asNumber ? nn.asNumber() : 0; return v === 3 || v === 1 ? v : 0; }
    if (n === "/CalRGB") return 3; if (n === "/CalGray") return 1;
  }
  return 0;
}
const numOf = (o) => (o && o.asNumber ? o.asNumber() : 0);
// Re-encodes the photos/scans inside the PDF as JPEG at `q`, no larger than `maxDim` pixels on the long side.
async function recompress(bytes, { maxDim, q }) {
  const L = await pdflib(), doc = await libOpen(bytes), ctx = doc.context, N = (n) => L.PDFName.of(n);
  const all = ctx.enumerateIndirectObjects(), masks = new Set();
  for (const [, obj] of all) if (obj && obj.dict) { const m = obj.dict.get(N("SMask")); if (m instanceof L.PDFRef) masks.add(m.toString()); }
  let found = 0, changed = 0, saved = 0;
  for (const [ref, obj] of all) {
    if (!(obj instanceof L.PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(N("Subtype")) !== N("Image")) continue;
    found++;
    if (masks.has(ref.toString()) || d.has(N("Decode")) || d.get(N("ImageMask")) === L.PDFBool.True || d.get(N("Mask")) instanceof L.PDFArray) continue;
    const f = d.get(N("Filter")); let filters = f instanceof L.PDFName ? [f.asString()] : f instanceof L.PDFArray ? f.asArray().map((x) => (x.asString ? x.asString() : "")) : [];
    let data = obj.contents;
    while (filters[0] === "/ASCII85Decode" || filters[0] === "/A85" || filters[0] === "/ASCIIHexDecode" || filters[0] === "/AHx") { data = /85/.test(filters[0]) ? a85(data) : ahx(data); filters = filters.slice(1); }
    if (filters[0] === "/Fl") filters[0] = "/FlateDecode"; if (filters[0] === "/DCT") filters[0] = "/DCTDecode";
    const w = numOf(d.get(N("Width"))), h = numOf(d.get(N("Height"))), bpc = numOf(d.get(N("BitsPerComponent"))) || 8, comps = csInfo(L, ctx, d.get(N("ColorSpace")));
    if (!w || !h || !comps || w * h < 40000) continue; // icons and logos: not worth it
    const k = Math.min(1, maxDim / Math.max(w, h)), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    let bmp = null;
    try {
      if (filters.length === 1 && filters[0] === "/DCTDecode") {
        if (k === 1 && q >= 0.85) continue;
        bmp = await createImageBitmap(new Blob([data], { type: "image/jpeg" }));
      } else if (filters.length === 1 && filters[0] === "/FlateDecode" && bpc === 8) {
        let dp = d.lookup(N("DecodeParms")); if (dp instanceof L.PDFArray) dp = dp.lookup(dp.size() - 1); const pred = dp instanceof L.PDFDict ? numOf(dp.get(N("Predictor"))) : 0;
        const px = unpredict(await inflate(data), w, h, comps, pred);
        if (!px || px.length < w * h * comps) continue;
        const id = new ImageData(w, h), a = id.data;
        for (let i = 0, j = 0; i < w * h; i++, j += comps) { const o = i * 4; if (comps === 3) { a[o] = px[j]; a[o + 1] = px[j + 1]; a[o + 2] = px[j + 2]; } else a[o] = a[o + 1] = a[o + 2] = px[j]; a[o + 3] = 255; }
        bmp = await createImageBitmap(id);
      } else continue;
    } catch (e) { continue; }
    const c = document.createElement("canvas"); c.width = nw; c.height = nh;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, nw, nh); g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, nw, nh); bmp.close?.();
    let jpg;
    try { jpg = await canvasJpeg(c, q); } catch (e) { continue; } finally { c.width = c.height = 0; }
    if (jpg.length >= obj.contents.length * 0.95) continue;
    const nd = d.clone(ctx);
    nd.set(N("Width"), L.PDFNumber.of(nw)); nd.set(N("Height"), L.PDFNumber.of(nh)); nd.set(N("BitsPerComponent"), L.PDFNumber.of(8));
    nd.set(N("ColorSpace"), N("DeviceRGB")); nd.set(N("Filter"), N("DCTDecode")); nd.delete(N("DecodeParms")); nd.delete(N("Length"));
    ctx.assign(ref, L.PDFRawStream.of(nd, jpg));
    changed++; saved += obj.contents.length - jpg.length;
    await tick();
  }
  return { bytes: await doc.save({ useObjectStreams: true }), found, changed, saved };
}
const IMG_LEVELS = [{ maxDim: 3000, q: 0.8 }, { maxDim: 2500, q: 0.72 }, { maxDim: 2100, q: 0.65 }, { maxDim: 1750, q: 0.58 }, { maxDim: 1450, q: 0.5 }, { maxDim: 1200, q: 0.43 }, { maxDim: 1000, q: 0.36 }, { maxDim: 800, q: 0.3 }];
const RASTER_LEVELS = [{ dpi: 200, q: 0.75 }, { dpi: 150, q: 0.7 }, { dpi: 150, q: 0.55 }, { dpi: 120, q: 0.5 }, { dpi: 100, q: 0.45 }, { dpi: 85, q: 0.4 }, { dpi: 72, q: 0.35 }, { dpi: 60, q: 0.3 }, { dpi: 50, q: 0.25 }];
// Mildest level of `levels` whose output fits `target`: tries the strongest first, then binary-searches.
async function searchLevels(levels, run, target, onp, label) {
  const res = new Map(), get = async (i) => { if (!res.has(i)) { onp && onp(`${label}: trying level ${i + 1} of ${levels.length}…`); res.set(i, await run(levels[i], i)); } return res.get(i); };
  const last = levels.length - 1, strongest = await get(last);
  if (!strongest || strongest.bytes.length > target) return { fit: null, smallest: strongest };
  let lo = 0, hi = last; // hi always fits
  while (lo < hi) { const mid = (lo + hi) >> 1; const r = await get(mid); if (r && r.bytes.length <= target) hi = mid; else lo = mid + 1; }
  return { fit: await get(hi), smallest: strongest };
}
async function compressTo(bytes, target, { allowRaster = true, gray = false } = {}, onp) {
  const orig = bytes.length;
  let best = { bytes, size: orig, how: "Original file (nothing smaller was possible)", kind: "none" };
  const keep = (r) => { if (r && r.bytes.length < best.size) best = { ...r, size: r.bytes.length }; };
  onp && onp("Tidying the file structure (no quality loss)…");
  let base = bytes;
  try { const b = await lossless(bytes); keep({ bytes: b, how: "File structure tidied: no change to quality", kind: "lossless" }); if (b.length < orig) base = b; } catch (e) { if (/password/.test(e.message)) throw e; }
  if (best.size <= target) return { ...best, ok: true };
  let hasImages = true;
  const img = await searchLevels(IMG_LEVELS, async (lv, i) => {
    if (!hasImages) return null;
    const r = await recompress(base, lv);
    if (!r.changed) { hasImages = i < IMG_LEVELS.length - 1 ? hasImages : false; if (!r.found) hasImages = false; }
    return { bytes: r.bytes, how: `Photos and scans inside re-compressed (up to ${lv.maxDim} px, quality ${Math.round(lv.q * 100)}%): text stays selectable`, kind: "images", changed: r.changed, level: i };
  }, target, onp, "Re-compressing images");
  keep(img.smallest); if (img.fit) { keep(img.fit); best = { ...img.fit, size: img.fit.bytes.length }; return { ...best, ok: true }; }
  if (!allowRaster) return { ...best, ok: best.size <= target };
  const ras = await searchLevels(RASTER_LEVELS, async (lv) => ({ bytes: await rasterPdf(bytes, { ...lv, gray }, onp), how: `Pages turned into ${gray ? "greyscale " : ""}images at ${lv.dpi} dpi, quality ${Math.round(lv.q * 100)}%: text is no longer selectable`, kind: "raster" }), target, onp, "Turning pages into images");
  keep(ras.smallest); if (ras.fit) { best = { ...ras.fit, size: ras.fit.bytes.length }; return { ...best, ok: true }; }
  return { ...best, ok: best.size <= target };
}

/* ================= 3. merge / split ================= */
async function flattenIfForm(doc, L) {
  try {
    const af = doc.catalog.lookupMaybe(L.PDFName.of("AcroForm"), L.PDFDict); if (!af) return 0;
    af.delete(L.PDFName.of("XFA"));
    const form = doc.getForm(), n = form.getFields().length; if (!n) return 0;
    for (const f of form.getFields()) { try { if (f.needsAppearancesUpdate?.()) f.defaultUpdateAppearances(await doc.embedFont(L.StandardFonts.Helvetica)); } catch (e) {} }
    form.flatten({ updateFieldAppearances: false }); return n;
  } catch (e) { return 0; }
}
async function mergePdfs(items, { flatten = true } = {}) {
  const L = await pdflib(), out = await L.PDFDocument.create();
  for (const it of items) {
    let src;
    try { src = await libOpen(it.bytes); } catch (e) { throw new Error(`${it.name}: ${e.message}`); }
    if (flatten) await flattenIfForm(src, L);
    const idx = it.pages || src.getPageIndices();
    for (const p of await out.copyPages(src, idx)) out.addPage(p);
  }
  out.setProducer("WorkerPool PDF tools"); out.setCreator("WorkerPool PDF tools");
  return out.save({ useObjectStreams: true });
}
async function splitPdf(bytes, groups, { flatten = false } = {}) {
  const L = await pdflib(), src = await libOpen(bytes);
  if (flatten) await flattenIfForm(src, L);
  const outs = [];
  for (const g of groups) {
    const o = await L.PDFDocument.create();
    for (const p of await o.copyPages(src, g)) o.addPage(p);
    o.setProducer("WorkerPool PDF tools"); o.setCreator("WorkerPool PDF tools");
    outs.push(await o.save({ useObjectStreams: true }));
  }
  return outs;
}

/* ================= UI ================= */
const css = `
.pt{display:flex;flex-direction:column;gap:14px}
.pt *{box-sizing:border-box}
.pt-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.pt-card h3{font-family:var(--display);font-size:1rem;font-weight:600;margin:0}
.pt-card p.sub{margin:-4px 0 0;font-size:.84rem;color:var(--muted)}
.pt-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pt-b{font:inherit;font-weight:600;font-size:.85rem;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:7px 14px;cursor:pointer;text-decoration:none;display:inline-block}
.pt-b.p{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.pt-b.sm{font-size:.76rem;padding:4px 10px}
.pt-b:disabled{opacity:.5;cursor:default}
.pt-priv{display:flex;gap:10px;align-items:flex-start;font-size:.82rem;color:var(--muted);background:var(--accent-soft);border-radius:12px;padding:10px 12px}
.pt-seg{display:flex;flex-wrap:wrap;gap:6px}
.pt-seg button{font:inherit;font-weight:600;font-size:.9rem;border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:10px 16px;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left}
.pt-seg button small{font-weight:400;font-size:.74rem}
.pt-seg button[aria-pressed="true"]{color:var(--fg);border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.pt-drop{border:2px dashed var(--line);border-radius:14px;padding:22px;text-align:center;color:var(--muted);cursor:pointer;background:var(--bg)}
.pt-drop.on{border-color:var(--accent);background:var(--accent-soft);color:var(--fg)}
.pt-drop b{color:var(--fg)}
.pt-v{display:flex;gap:12px;align-items:flex-start;border-radius:12px;padding:12px 14px;font-size:.9rem}
.pt-v b{font-family:var(--display);font-size:1rem}
.pt-v.bad{background:#fbe9e5;color:#7a2a1c}.pt-v.ok{background:#e3f2ea;color:#1f5a3b}.pt-v.mid{background:#fdf3dc;color:#6d4f0e}
@media (prefers-color-scheme:dark){.pt-v.bad{background:#3a2420;color:#f1c1b6}.pt-v.ok{background:#1d3328;color:#b5e2c8}.pt-v.mid{background:#352d19;color:#efd79b}}
.pt-note{font-size:.8rem;color:var(--muted);margin:0}
.pt-f{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:600}
.pt-card>.pt-row input,.pt-card>.pt-row select,.pt-card>.pt-f input,.pt-card>.pt-f select,.pt-it input{font:inherit;font-weight:400;font-size:.88rem;padding:8px 11px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg)}
.pt-chk{display:flex;gap:8px;align-items:flex-start;font-size:.86rem;cursor:pointer}
.pt-chips{display:flex;gap:6px;flex-wrap:wrap}
.pt-chip{font:inherit;font-size:.82rem;font-weight:600;border:1px solid var(--line);background:var(--bg);color:var(--fg);padding:6px 11px;border-radius:999px;cursor:pointer}
.pt-chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.pt-list{display:flex;flex-direction:column;gap:6px}
.pt-it{display:grid;grid-template-columns:28px minmax(0,1fr) 170px auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:var(--bg)}
.pt-it.drag{opacity:.5}.pt-it.over{border-color:var(--accent)}
.pt-it .n{font-family:var(--display);font-weight:700;color:var(--muted);text-align:center;cursor:grab}
.pt-it b{display:block;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-it small{color:var(--muted);font-size:.76rem}
.pt-it input{width:100%;min-width:0}
.pt-it .acts{display:flex;gap:4px}
@media (max-width:700px){.pt-it{grid-template-columns:24px minmax(0,1fr)}.pt-it input,.pt-it .acts{grid-column:2}}
.pt-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;max-height:520px;overflow-y:auto;padding:2px}
.pt-th{position:relative;border:2px solid var(--line);border-radius:10px;background:var(--bg);padding:6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font:inherit;color:var(--fg)}
.pt-th canvas{display:block;max-width:100%;height:auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.pt-th .ph{width:84px;height:108px;background:var(--line);border-radius:4px}
.pt-th span{font-size:.75rem;font-weight:600;text-align:center}
.pt-th span small{display:block;font-weight:500;color:var(--muted)}
.pt-tw{position:relative;display:flex}.pt-tw .pt-th{flex:1;min-width:0}
.pt-vw{position:absolute;top:6px;left:6px;width:28px;height:28px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer;display:grid;place-items:center;font-size:.85rem;box-shadow:0 1px 3px rgba(0,0,0,.2);opacity:.9;padding:0}
.pt-vw:hover,.pt-vw:focus-visible{opacity:1;border-color:var(--accent);outline:none}
#ptView{position:fixed;inset:0;z-index:9999;background:rgba(20,28,30,.92);display:flex;flex-direction:column;font-family:var(--body,system-ui,sans-serif)}
#ptView .bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#1b2426;color:#e3eaeb;border-bottom:1px solid #2c3a3d}
#ptView .bar b{font-size:.95rem;margin-right:6px}
#ptView .bar .sp{flex:1}
#ptView .bar small{color:#97a6a8;font-size:.82rem}
#ptView button{font:inherit;font-size:.85rem;font-weight:600;border:1px solid #3a4b4e;background:#243033;color:#e3eaeb;border-radius:999px;padding:6px 13px;cursor:pointer}
#ptView button:hover{border-color:#8cc4ba}
#ptView button:disabled{opacity:.4;cursor:default}
#ptView button.on{background:#8cc4ba;color:#0f2220;border-color:#8cc4ba}
#ptView .stage{flex:1;overflow:auto;display:flex;padding:16px}
#ptView .stage canvas{margin:auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.5);display:block}
#ptView .msg{margin:auto;color:#e3eaeb}
.pt-th[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft)}
.pt-th[aria-pressed="true"]::after{content:"✓";position:absolute;top:4px;right:6px;background:var(--accent);color:var(--surface);border-radius:50%;width:20px;height:20px;font-size:.75rem;display:grid;place-items:center;font-weight:800}
.pt-prog{font-size:.86rem;color:var(--muted);display:flex;gap:8px;align-items:center}
.pt-prog i{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:ptSpin .8s linear infinite}
@keyframes ptSpin{to{transform:rotate(360deg)}}
.pt-preview .pt-xpage *{box-sizing:border-box}
.pt-preview{overflow:auto;max-height:560px;border:1px solid var(--line);border-radius:10px;background:#8a9796;padding:12px}
.pt-preview .pt-xpage{margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,.3);transform-origin:top left}
.pt-out{display:flex;flex-direction:column;gap:6px}
.pt-out a{font-size:.85rem;color:var(--accent);font-weight:600}
.pt-bar{height:10px;border-radius:5px;background:var(--line);overflow:hidden;position:relative}
.pt-bar i{position:absolute;top:0;bottom:0;left:0;background:var(--accent);border-radius:5px}
.pt-bar u{position:absolute;top:-3px;bottom:-3px;width:2px;background:#b4552d}
`;
const S = { tool: "xfa", busy: false, prog: "",
  x: null,      // { name, bytes, info, render, res }
  c: null,      // { name, bytes, target, unit, value, allowRaster, gray, res }
  m: { mode: "merge", items: [], flatten: true, name: "merged", res: null, split: null } };
let ROOT = null, gen = 0;
const $ = (s) => ROOT.querySelector(s);
const setProg = (t) => { S.prog = t; const el = ROOT && ROOT.querySelector("#ptProg"); if (el) el.innerHTML = t ? `<i></i>${esc(t)}` : ""; };
const prog = () => `<div class="pt-prog" id="ptProg">${S.busy && S.prog ? `<i></i>${esc(S.prog)}` : ""}</div>`;
const readFile = async (f) => { const u = new Uint8Array(await f.arrayBuffer()); if (!isPdf(u)) throw new Error(`${f.name} isn't a PDF`); return u; };
function dropZone(id, label, multiple) {
  return `<label class="pt-drop" id="${id}"><b>${label}</b><br><span class="pt-note">or drag and drop ${multiple ? "PDF files" : "a PDF"} here</span><input type="file" accept="application/pdf,.pdf" ${multiple ? "multiple" : ""} hidden></label>`;
}
function wireDrop(id, onFiles) {
  const z = $("#" + id); if (!z) return;
  const inp = z.querySelector("input");
  inp.onchange = () => { if (inp.files.length) onFiles([...inp.files]); inp.value = ""; };
  z.ondragover = (e) => { e.preventDefault(); z.classList.add("on"); };
  z.ondragleave = () => z.classList.remove("on");
  z.ondrop = (e) => { e.preventDefault(); z.classList.remove("on"); const fs = [...e.dataTransfer.files].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)); if (fs.length) onFiles(fs); };
}
async function busy(fn) {
  if (S.busy) return; S.busy = true; S.prog = "Working…"; const g = gen; render();
  try { await fn(); } catch (e) { console.error(e); if (g === gen) S.err = e.message || String(e); }
  if (g !== gen) return;
  S.busy = false; S.prog = ""; render();
}

/* ---------- XFA / flatten view ---------- */
function viewXfa() {
  const x = S.x;
  let h = `<div class="pt-card"><h3>XFA form → flat PDF</h3><p class="sub">Turns a filled fillable form (IRCC IMM forms, XFA or ordinary fillable PDFs) into a plain PDF that opens the same everywhere and can't be edited. Keep the original form too: IRCC needs the original when it asks for the validated form with barcodes.</p>
  ${dropZone("ptXDrop", x ? "Choose a different form" : "Choose a filled form (PDF)", false)}</div>`;
  if (!x) return h;
  const i = x.info || {};
  const kind = { pure: ["Dynamic XFA form", "This is the kind of form that shows “Please wait…” outside Adobe Reader (most IRCC IMM forms). The preview below is the form laid out with its answers."], hybrid: ["Fillable form with XFA", "The XFA part is removed and every field is flattened into the page."], acro: ["Fillable form (AcroForm)", "Every field is flattened into the page."], none: ["No fillable fields", "This PDF has no form fields, so it's already flat. You can still make an image copy."] }[i.kind] || ["", ""];
  h += `<div class="pt-card"><h3>📄 ${esc(x.name)}</h3>
    <div class="pt-v ${i.kind === "none" ? "mid" : "ok"}"><div><b>${esc(kind[0])}</b> · ${i.pages} page${i.pages === 1 ? "" : "s"}${i.fields ? ` · ${i.fields} field${i.fields === 1 ? "" : "s"}` : ""} · ${fmt(x.bytes.length)}<br>${esc(kind[1])}</div></div>
    ${i.signed ? `<div class="pt-v mid"><div><b>Signature field found.</b> Flattening keeps how a signature looks but it's no longer a verifiable digital signature.</div></div>` : ""}
    ${i.encrypted ? `<div class="pt-v mid"><div><b>This PDF has a password or restrictions.</b> If flattening fails, use the image copy, or remove the restrictions in a PDF reader first.</div></div>` : ""}`;
  if (i.kind === "pure") {
    h += `<div class="pt-row"><button class="pt-b p" type="button" id="ptXPrint"${S.busy || !x.render ? " disabled" : ""}>Save as PDF (sharp text)</button>
      <button class="pt-b" type="button" id="ptXImg"${S.busy || !x.render ? " disabled" : ""}>Download image PDF</button>
      <label class="pt-f" style="flex-direction:row;align-items:center;gap:6px">Image quality <select id="ptXDpi">${[[150, "150 dpi (smaller)"], [200, "200 dpi"], [300, "300 dpi (sharpest)"]].map(([v, l]) => `<option value="${v}"${(x.dpi || 200) == v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <p class="pt-note"><b>Save as PDF</b> opens the print window: choose <b>Destination → Save as PDF</b> (Chrome/Edge: “Microsoft Print to PDF” also works), set Margins to <b>None</b> and tick <b>Background graphics</b>. The text stays sharp and searchable. <b>Image PDF</b> downloads straight away, with each page as a picture.</p>
      ${prog()}
      <p class="pt-note">Check the preview against the form in Adobe Reader before sending: parts of a form that Adobe shows or hides with its own scripts, and 2D barcodes, may not appear here.</p>
      <div class="pt-preview" id="ptXPrev"></div>`;
  } else {
    h += `<div class="pt-row">${i.kind !== "none" ? `<button class="pt-b p" type="button" id="ptXFlat"${S.busy ? " disabled" : ""}>Flatten & download</button>` : ""}
      <button class="pt-b${i.kind === "none" ? " p" : ""}" type="button" id="ptXRaster"${S.busy ? " disabled" : ""}>Image copy (looks exactly as on screen)</button>
      <label class="pt-f" style="flex-direction:row;align-items:center;gap:6px">Image quality <select id="ptXDpi">${[[150, "150 dpi"], [200, "200 dpi"], [300, "300 dpi"]].map(([v, l]) => `<option value="${v}"${(x.dpi || 200) == v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <p class="pt-note"><b>Flatten</b> keeps text sharp and selectable. If a field looks wrong in the flattened copy (odd fonts, cut-off text), use the <b>Image copy</b>.</p>${prog()}`;
  }
  if (x.res) h += resultBox(x.res);
  return h + `</div>`;
}
function resultBox(r) {
  if (r.err) return `<div class="pt-v bad"><div><b>Couldn't finish</b><br>${esc(r.err)}</div></div>`;
  return `<div class="pt-v ${r.warn ? "mid" : "ok"}"><span style="font-size:1.3rem">${r.warn ? "🟡" : "✅"}</span><div><b>${esc(r.title)}</b><br>${r.html || esc(r.msg || "")}</div></div>
    ${r.blob ? `<div class="pt-row"><button class="pt-b p" type="button" data-dl>Download ${esc(r.fname)} again</button><span class="pt-note">Downloaded automatically. Open it and check it before sending.</span></div>` : ""}`;
}
async function openXfa(f) {
  S.err = ""; clearPrint(); fontCssCache = null;
  const bytes = await readFile(f);
  S.x = { name: f.name, bytes, info: null, render: null, res: null, dpi: S.x?.dpi || 200 };
  setProg("Reading the form…");
  S.x.info = await inspectForm(bytes);
  if (S.x.info.kind === "pure") {
    setProg("Laying out the form with its answers…");
    const host = document.createElement("div");
    S.x.render = await xfaRender(bytes, host);
    S.x.host = host;
  }
}
function mountPreview() {
  const box = ROOT.querySelector("#ptXPrev"), x = S.x;
  if (!box || !x || !x.render) return;
  const avail = Math.max(240, box.clientWidth - 24);
  box.innerHTML = "";
  for (const p of x.render.pages) {
    const wpx = p.w * 96 / 72, k = Math.min(1, avail / wpx);
    const wrap = document.createElement("div"); wrap.style.cssText = `width:${wpx * k}px;height:${p.h * 96 / 72 * k}px;margin:0 auto 12px;overflow:hidden`;
    p.el.style.transform = `scale(${k})`; p.el.style.transformOrigin = "top left"; p.el.style.margin = "0";
    wrap.appendChild(p.el); box.appendChild(wrap);
  }
  if (!document.getElementById("ptXfaCss")) { const st = document.createElement("style"); st.id = "ptXfaCss"; st.textContent = XFA_CSS; document.head.appendChild(st); }
}
function resetPreviewScale() { if (S.x && S.x.render) for (const p of S.x.render.pages) { p.el.style.transform = ""; } }

/* ---------- compression view ---------- */
const PRESETS = [["4", "MB", "IRCC portal (4 MB)"], ["2", "MB", "2 MB"], ["1", "MB", "1 MB"], ["500", "KB", "500 KB"], ["250", "KB", "250 KB"]];
function targetBytes(c) { const v = parseFloat(c.value); return v > 0 ? Math.floor(v * (c.unit === "KB" ? 1e3 : 1e6)) : 0; }
function viewCompress() {
  const c = S.c;
  let h = `<div class="pt-card"><h3>Compress a PDF</h3><p class="sub">Shrinks a PDF to the size you need (for example the IRCC portal's 4 MB per document). It always tries the mildest compression first.</p>
    ${dropZone("ptCDrop", c ? "Choose a different PDF" : "Choose a PDF to compress", false)}</div>`;
  if (!c) return h;
  const t = targetBytes(c), under = t && c.bytes.length <= t;
  h += `<div class="pt-card"><h3>📄 ${esc(c.name)} · ${fmt(c.bytes.length)}${c.pages ? ` · ${c.pages} page${c.pages > 1 ? "s" : ""}` : ""}</h3>
    <div class="pt-f">What size does the file need to be under?
      <div class="pt-chips" style="margin-top:4px">${PRESETS.map(([v, u, l]) => `<button type="button" class="pt-chip" data-pre="${v}|${u}" aria-pressed="${c.value === v && c.unit === u}">${l}</button>`).join("")}</div></div>
    <div class="pt-row"><label class="pt-f" style="flex-direction:row;align-items:center;gap:8px">Target size <input type="number" id="ptCVal" min="0.01" step="any" value="${esc(c.value)}" placeholder="e.g. 2" style="width:110px">
      <select id="ptCUnit"><option${c.unit === "MB" ? " selected" : ""}>MB</option><option${c.unit === "KB" ? " selected" : ""}>KB</option></select></label>
      <span class="pt-note">${t ? `Under ${fmt(t)} (${t.toLocaleString("en-CA")} bytes)` : "Pick a preset or type a size"}</span></div>
    <label class="pt-chk"><input type="checkbox" id="ptCRaster"${c.allowRaster ? " checked" : ""}><span>If needed, allow turning pages into images (text won't be selectable or searchable, but it looks the same)</span></label>
    <label class="pt-chk"><input type="checkbox" id="ptCGray"${c.gray ? " checked" : ""}><span>Black and white is fine (makes image pages smaller)</span></label>
    ${under ? `<div class="pt-v ok"><div><b>Already under ${fmt(t)}.</b> This file is ${fmt(c.bytes.length)}, so it doesn't need compressing for that limit.</div></div>` : ""}
    <div class="pt-row"><button class="pt-b p" type="button" id="ptCGo"${S.busy || !t || under ? " disabled" : ""}>Compress to under ${t ? fmt(t) : "…"}</button></div>${prog()}`;
  if (c.res) {
    const r = c.res;
    if (r.err) h += resultBox(r);
    else {
      const pct = Math.round((1 - r.size / c.bytes.length) * 100), max = Math.max(c.bytes.length, r.target);
      h += resultBox({ warn: !r.ok, title: r.ok ? `Done: ${fmt(c.bytes.length)} → ${fmt(r.size)} (${pct}% smaller)` : `Couldn't get under ${fmt(r.target)}: smallest was ${fmt(r.size)}`, blob: r.blob, fname: r.fname,
        html: `${esc(r.how)}.${r.ok ? "" : ` ${r.kind === "raster" || !c.allowRaster ? "" : ""}Try splitting the file into parts (Merge / split tool), ${c.allowRaster ? "" : "allowing pages to be turned into images, "}or ticking black and white.`}
        <div class="pt-bar" style="margin-top:8px" title="New size against the target"><i style="width:${Math.min(100, r.size / max * 100)}%"></i><u style="left:${Math.min(100, r.target / max * 100)}%"></u></div><small>Bar: new size · red line: your target</small>` });
    }
  }
  return h + `</div>`;
}
async function openCompress(f) {
  const bytes = await readFile(f);
  const old = S.c || { value: "4", unit: "MB", allowRaster: true, gray: false };
  S.c = { name: f.name, bytes, value: old.value, unit: old.unit, allowRaster: old.allowRaster, gray: old.gray, res: null, pages: 0 };
  try { const d = await pjsOpen(bytes); S.c.pages = d.numPages; await pjsClose(d); } catch (e) {}
}

/* ---------- merge / split view ---------- */
function viewMerge() {
  const m = S.m;
  let h = `<div class="pt-card"><h3>Merge or split PDFs</h3>
    <div class="pt-chips"><button type="button" class="pt-chip" data-mm="merge" aria-pressed="${m.mode === "merge"}">Merge several PDFs into one</button><button type="button" class="pt-chip" data-mm="split" aria-pressed="${m.mode === "split"}">Split one PDF</button></div></div>`;
  if (m.mode === "merge") {
    h += `<div class="pt-card"><h3>Merge</h3><p class="sub">Add files in the order they should appear. Drag ⋮⋮ or use ↑ ↓ to reorder. Leave “Pages” as <b>all</b>, or type pages like <b>1-3, 5</b> (also reorders: <b>3, 1, 2</b>).</p>
      ${dropZone("ptMDrop", m.items.length ? "Add more PDFs" : "Choose PDFs to merge", true)}`;
    if (m.items.length) {
      const total = m.items.reduce((a, it) => a + (it.sel ? it.sel.length : it.pages), 0);
      h += `<div class="pt-list" id="ptMList">${m.items.map((it, i) => `<div class="pt-it" draggable="true" data-i="${i}"><span class="n" title="Drag to reorder">${i + 1}</span>
        <div><b>${esc(it.name)}</b><small>${it.pages} page${it.pages === 1 ? "" : "s"} · ${fmt(it.bytes.length)}${it.xfa ? " · ⚠️ dynamic XFA form: flatten it first in the XFA tool, or it will merge as a “Please wait…” page" : ""}${it.err ? ` · <span style="color:#b4552d">${esc(it.err)}</span>` : ""}</small></div>
        <input type="text" data-pg="${i}" value="${esc(it.range)}" placeholder="all" aria-label="Pages from ${esc(it.name)}">
        <div class="acts"><button class="pt-b sm" type="button" data-up="${i}" ${i ? "" : "disabled"} aria-label="Move up">↑</button><button class="pt-b sm" type="button" data-dn="${i}" ${i < m.items.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button><button class="pt-b sm" type="button" data-rm="${i}" aria-label="Remove">✕</button></div></div>`).join("")}</div>
        <label class="pt-chk"><input type="checkbox" id="ptMFlat"${m.flatten ? " checked" : ""}><span>Flatten fillable form fields first (recommended: keeps answers visible after merging)</span></label>
        <div class="pt-row"><label class="pt-f" style="flex-direction:row;align-items:center;gap:8px">File name <input type="text" id="ptMName" value="${esc(m.name)}" style="width:220px">.pdf</label>
          <button class="pt-b p" type="button" id="ptMGo"${S.busy || m.items.length < 1 || m.items.some((x) => x.err) ? " disabled" : ""}>Merge ${m.items.length} file${m.items.length > 1 ? "s" : ""} (${total} page${total === 1 ? "" : "s"}) & download</button>
          <button class="pt-b" type="button" id="ptMClr">Clear list</button></div>${prog()}`;
    }
    if (m.res) h += resultBox(m.res);
    return h + `</div>`;
  }
  const sp = m.split;
  h += `<div class="pt-card"><h3>Split</h3><p class="sub">Pick pages to pull out, or split the whole file into parts.</p>${dropZone("ptSDrop", sp ? "Choose a different PDF" : "Choose a PDF to split", false)}`;
  if (sp) {
    const sel = [...sp.sel].sort((a, b) => a - b);
    h += `<div class="pt-v ok"><div><b>${esc(sp.name)}</b> · ${sp.pages} page${sp.pages > 1 ? "s" : ""} · ${fmt(sp.bytes.length)}</div></div>
      <div class="pt-chips">${[["pick", "Pull out selected pages"], ["ranges", "Split by ranges"], ["every", "Every N pages"], ["single", "Every page separately"]].map(([v, l]) => `<button type="button" class="pt-chip" data-sm="${v}" aria-pressed="${sp.mode === v}">${l}</button>`).join("")}</div>`;
    if (sp.mode === "pick") h += `<div class="pt-row"><label class="pt-f" style="flex-direction:row;align-items:center;gap:8px">Pages <input type="text" id="ptSPick" value="${esc(sel.length ? describe(sel) : "")}" placeholder="click pages below, or type 1-3, 5" style="width:260px"></label>
        <button class="pt-b sm" type="button" id="ptSAll">Select all</button><button class="pt-b sm" type="button" id="ptSNone">Clear</button><button class="pt-b sm" type="button" id="ptSInv">Invert</button></div>
        <label class="pt-chk"><input type="checkbox" id="ptSRest"${sp.rest ? " checked" : ""}><span>Also save the pages <b>not</b> selected as a second file</span></label>`;
    if (sp.mode === "ranges") h += `<label class="pt-f">Ranges, one file for each (comma-separated)<input type="text" id="ptSRanges" value="${esc(sp.ranges)}" placeholder="e.g. 1-2, 3-5, 6-"></label>`;
    if (sp.mode === "every") h += `<label class="pt-f" style="flex-direction:row;align-items:center;gap:8px">A new file every <input type="number" id="ptSN" min="1" max="${sp.pages}" value="${sp.n}" style="width:80px"> pages</label>`;
    let plan = "", groups = null;
    try { groups = splitGroups(sp); plan = groups.length ? `${groups.length} file${groups.length > 1 ? "s" : ""}: ${groups.slice(0, 8).map((g) => "p. " + describe(g)).join(" · ")}${groups.length > 8 ? " …" : ""}` : "Select at least one page"; }
    catch (e) { plan = `<span style="color:#b4552d">${esc(e.message)}</span>`; groups = null; }
    h += `<p class="pt-note">${plan}</p>
      <label class="pt-chk"><input type="checkbox" id="ptSFlat"${sp.flatten ? " checked" : ""}><span>Flatten fillable form fields</span></label>
      <div class="pt-row"><button class="pt-b p" type="button" id="ptSGo"${S.busy || !groups || !groups.length ? " disabled" : ""}>${groups && groups.length > 1 ? `Split into ${groups.length} files & download ZIP` : "Save & download"}</button></div>${prog()}
      ${m.res ? resultBox(m.res) : ""}
      <p class="pt-note" style="margin:0">Click a page to ${sp.mode === "pick" ? "select it" : "switch to picking pages"}. Press 🔍 (or double-click) to view a page full size before you split.</p>
      <div class="pt-thumbs" id="ptThumbs">${Array.from({ length: sp.pages }, (_, i) => `<div class="pt-tw"><button type="button" class="pt-th" data-th="${i}" aria-pressed="${sp.mode === "pick" && sp.sel.has(i)}">${sp.thumbs[i] ? "" : `<div class="ph"></div>`}<span>Page ${i + 1}${sp.mode !== "pick" ? `<small>${fileTag(groups, i)}</small>` : ""}</span></button><button type="button" class="pt-vw" data-vw="${i}" title="View page ${i + 1} full size" aria-label="View page ${i + 1} full size">🔍</button></div>`).join("")}</div>`;
  }
  return h + `</div>`;
}
const fileTag = (groups, i) => { const f = (groups || []).map((g, k) => (g.includes(i) ? k + 1 : 0)).filter(Boolean); return f.length ? `file ${f.join(", ")}` : "not included"; };

/* ---------- full-size page viewer (split): check a page before splitting ---------- */
let VW = null;   // { i, zoom (1 = fit), rot, tok }
function openViewer(i) {
  const sp = S.m.split; if (!sp) return;
  VW = { i, zoom: 1, rot: 0, tok: 0 };
  if (!document.getElementById("ptView")) {
    const v = document.createElement("div"); v.id = "ptView"; v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true");
    v.innerHTML = `<div class="bar"><b id="pvT"></b><small id="pvF"></small><span class="sp"></span>
      <button type="button" data-pv="prev" title="Previous page (←)">◀ Prev</button><button type="button" data-pv="next" title="Next page (→)">Next ▶</button>
      <button type="button" data-pv="out" title="Zoom out (−)">−</button><button type="button" data-pv="fit" title="Fit to screen">Fit</button><button type="button" data-pv="in" title="Zoom in (+)">+</button>
      <button type="button" data-pv="rot" title="Turn the view (doesn't change the file)">⟳ Turn</button>
      <button type="button" data-pv="sel" id="pvSel" title="Select or unselect this page (Space)"></button>
      <button type="button" data-pv="close" title="Close (Esc)">✕ Close</button></div><div class="stage" id="pvStage"><div class="msg">Loading…</div></div>`;
    document.body.appendChild(v);
    v.addEventListener("click", (e) => { const b = e.target.closest("[data-pv]"); if (!b) { if (e.target.id === "pvStage") closeViewer(); return; } vAct(b.dataset.pv); });
    document.addEventListener("keydown", vKey, true);
    window.addEventListener("resize", vResize);
  }
  drawViewer();
}
function closeViewer() { VW = null; const v = document.getElementById("ptView"); if (v) v.remove(); document.removeEventListener("keydown", vKey, true); window.removeEventListener("resize", vResize); }
let vRT = 0; function vResize() { clearTimeout(vRT); vRT = setTimeout(() => { if (VW && VW.zoom === 1) drawViewer(); }, 150); }
function vKey(e) {
  if (!VW) return;
  const k = e.key, map = { Escape: "close", ArrowRight: "next", PageDown: "next", ArrowLeft: "prev", PageUp: "prev", " ": "sel", Enter: "sel", "+": "in", "=": "in", "-": "out", r: "rot" };
  if (!map[k]) return; e.preventDefault(); e.stopPropagation(); vAct(map[k]);
}
function vAct(a) {
  const sp = S.m.split; if (!VW || !sp) return closeViewer();
  if (a === "close") return closeViewer();
  if (a === "prev" && VW.i > 0) { VW.i--; VW.zoom = 1; }
  else if (a === "next" && VW.i < sp.pages - 1) { VW.i++; VW.zoom = 1; }
  else if (a === "in") VW.zoom = Math.min(6, VW.zoom * 1.35);
  else if (a === "out") VW.zoom = Math.max(0.3, VW.zoom / 1.35);
  else if (a === "fit") VW.zoom = 1;
  else if (a === "rot") VW.rot = (VW.rot + 90) % 360;
  else if (a === "sel") {
    if (sp.mode !== "pick") { sp.mode = "pick"; sp.sel = new Set(); }
    sp.sel.has(VW.i) ? sp.sel.delete(VW.i) : sp.sel.add(VW.i); S.m.res = null; render(); drawThumbs();
    return vBar();
  } else return;
  drawViewer();
}
function vBar() {
  const sp = S.m.split, v = document.getElementById("ptView"); if (!v || !VW || !sp) return;
  v.querySelector("#pvT").textContent = `Page ${VW.i + 1} of ${sp.pages}`;
  const sel = sp.mode === "pick" && sp.sel.has(VW.i), b = v.querySelector("#pvSel");
  b.textContent = sel ? "✓ Selected" : "Select this page"; b.classList.toggle("on", sel);
  v.querySelector("#pvF").textContent = sp.mode === "pick" ? `${sp.sel.size} page${sp.sel.size === 1 ? "" : "s"} selected` : (() => { try { return `Goes into ${fileTag(splitGroups(sp), VW.i)}`; } catch (e) { return ""; } })();
  v.querySelector('[data-pv="prev"]').disabled = VW.i === 0; v.querySelector('[data-pv="next"]').disabled = VW.i === sp.pages - 1;
}
async function drawViewer() {
  const sp = S.m.split, v = document.getElementById("ptView"); if (!v || !VW || !sp) return;
  vBar();
  const tok = ++VW.tok, stage = v.querySelector("#pvStage");
  try {
    const doc = sp.doc || (sp.doc = await pjsOpen(sp.bytes));
    const page = await doc.getPage(VW.i + 1);
    const base = page.getViewport({ scale: 1, rotation: (page.rotate + VW.rot) % 360 });
    const fit = Math.min((stage.clientWidth - 32) / base.width, (stage.clientHeight - 32) / base.height);
    const css = Math.max(0.1, fit * VW.zoom), dpr = Math.min(3, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: css * dpr, rotation: (page.rotate + VW.rot) % 360 });
    const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    c.style.width = Math.ceil(vp.width / dpr) + "px"; c.style.height = Math.ceil(vp.height / dpr) + "px";
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp, intent: "print", annotationMode: (await pdfjs()).AnnotationMode.ENABLE_STORAGE }).promise;
    page.cleanup();
    if (tok !== VW?.tok) return;
    stage.replaceChildren(c);
  } catch (e) { if (VW && tok === VW.tok) stage.innerHTML = `<div class="msg">Couldn't show this page: ${String(e.message || e).replace(/[<>&]/g, "")}</div>`; }
}

function splitGroups(sp) {
  const n = sp.pages;
  if (sp.mode === "pick") { const s = [...sp.sel].sort((a, b) => a - b); if (!s.length) return []; const g = [s]; if (sp.rest) { const r = [...Array(n).keys()].filter((i) => !sp.sel.has(i)); if (r.length) g.push(r); } return g; }
  if (sp.mode === "ranges") return parseGroups(sp.ranges, n);
  if (sp.mode === "every") { const k = Math.max(1, Math.floor(+sp.n || 1)), g = []; for (let i = 0; i < n; i += k) g.push([...Array(Math.min(k, n - i)).keys()].map((j) => i + j)); return g; }
  return [...Array(n).keys()].map((i) => [i]);
}
async function addMerge(files) {
  for (const f of files) {
    const it = { name: f.name, bytes: null, pages: 0, range: "all", sel: null, err: "", xfa: false };
    try {
      it.bytes = await readFile(f);
      const L = await pdflib(), d = await libOpen(it.bytes); it.pages = d.getPageCount();
      const af = d.catalog.lookupMaybe(L.PDFName.of("AcroForm"), L.PDFDict);
      if (af && af.has(L.PDFName.of("XFA"))) { try { const pd = await pjsOpen(it.bytes, { enableXfa: true }); it.xfa = pd.isPureXfa; await pjsClose(pd); } catch (e) {} }
    } catch (e) { it.err = e.message; it.bytes = it.bytes || new Uint8Array(); }
    S.m.items.push(it);
  }
  if (S.m.items.length && S.m.name === "merged") S.m.name = baseName(S.m.items[0].name) + "-merged";
}
async function openSplit(f) {
  const bytes = await readFile(f), d = await libOpen(bytes);
  closeViewer();
  S.m.split = { name: f.name, bytes, pages: d.getPageCount(), sel: new Set(), mode: "pick", ranges: "", n: 1, rest: false, flatten: false, thumbs: {} };
  S.m.res = null;
}
async function drawThumbs() {
  const sp = S.m.split, g = gen; if (!sp || S.tool !== "merge" || S.m.mode !== "split") return;
  if (sp.drawing) return; sp.drawing = true;
  try {
    const doc = sp.doc || (sp.doc = await pjsOpen(sp.bytes));
    for (let i = 0; i < sp.pages; i++) {
      if (g !== gen || S.m.split !== sp) break;
      let c = sp.thumbs[i];
      if (!c) {
        const page = await doc.getPage(i + 1), v = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 168 / Math.max(v.width, v.height) });
        c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); c.style.width = Math.ceil(vp.width / 2) + "px";
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp, intent: "print", annotationMode: (await pdfjs()).AnnotationMode.ENABLE_STORAGE }).promise;
        page.cleanup(); sp.thumbs[i] = c;
      }
      const btn = ROOT && ROOT.querySelector(`[data-th="${i}"]`);
      if (btn && !btn.contains(c)) { const ph = btn.querySelector(".ph"); if (ph) ph.replaceWith(c); else btn.prepend(c); }
    }
  } catch (e) { console.warn("thumbnails", e); }
  sp.drawing = false;
}

/* ---------- main render & wiring ---------- */
function render() {
  if (!ROOT) return;
  resetPreviewScale();
  const err = S.err ? `<div class="pt-v bad"><div><b>Couldn't open that file</b><br>${esc(S.err)}</div></div>` : "";
  ROOT.innerHTML = `<style>${css}</style>
  <div class="pt-priv"><span>🔒</span><div><b>Confidential.</b> These tools run entirely in this browser tab: client files are never uploaded, saved or logged, and they're forgotten when you lock the console or reload the page.</div></div>
  <div class="pt-seg" role="group" aria-label="PDF tool">
    <button type="button" data-tool="xfa" aria-pressed="${S.tool === "xfa"}">XFA → flat PDF<small>Flatten IRCC and other fillable forms</small></button>
    <button type="button" data-tool="compress" aria-pressed="${S.tool === "compress"}">Compress PDF<small>Shrink to a target size</small></button>
    <button type="button" data-tool="merge" aria-pressed="${S.tool === "merge"}">Merge / split PDF<small>Combine files or pull pages out</small></button>
  </div>${err}
  ${S.tool === "xfa" ? viewXfa() : S.tool === "compress" ? viewCompress() : viewMerge()}`;
  wire();
}
function wire() {
  ROOT.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => { S.tool = b.dataset.tool; S.err = ""; render(); }));
  ROOT.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = () => { const r = S.tool === "xfa" ? S.x.res : S.tool === "compress" ? S.c.res : S.m.res; if (r && r.blob) saveBlob(r.blob, r.fname); }));
  const pick = (fn) => (files) => busy(async () => { S.err = ""; await fn(files); });
  if (S.tool === "xfa") {
    wireDrop("ptXDrop", pick((fs) => openXfa(fs[0])));
    const dpi = $("#ptXDpi"); if (dpi) dpi.onchange = () => { S.x.dpi = +dpi.value; };
    const x = S.x, stem = x && baseName(x.name) + "-flattened";
    const done = (bytes, how, warn) => { const blob = pdfBlob(bytes), fname = stem + ".pdf"; x.res = { title: `Flattened: ${fname} · ${fmt(bytes.length)}`, msg: how, blob, fname, warn }; saveBlob(blob, fname); };
    const pr = $("#ptXPrint"); if (pr) pr.onclick = () => { printPages(x.render, stem); x.res = { title: "Print window opened", html: "Choose <b>Save as PDF</b> as the destination, Margins <b>None</b>, and tick <b>Background graphics</b>. The file name is filled in for you.", warn: false }; setTimeout(render, 600); };
    const im = $("#ptXImg"); if (im) im.onclick = () => busy(async () => { const b = await xfaImagePdf(x.render, x.dpi || 200, setProg); done(b, `${x.render.pages.length} page${x.render.pages.length > 1 ? "s" : ""} as images at ${x.dpi || 200} dpi. Nothing in it can be edited.`); });
    const fl = $("#ptXFlat"); if (fl) fl.onclick = () => busy(async () => {
      setProg("Flattening the fields…");
      try { const r = await flattenAcro(x.bytes); done(r.bytes, `All ${x.info.fields} field${x.info.fields === 1 ? "" : "s"} flattened into the pages${x.info.kind === "hybrid" ? " and the XFA part removed" : ""}. Text stays selectable.${r.bad.length ? ` These fields kept their old look: ${r.bad.slice(0, 6).join(", ")}${r.bad.length > 6 ? "…" : ""}.` : ""}`, !!r.bad.length); }
      catch (e) { x.res = { err: e.message }; }
    });
    const ra = $("#ptXRaster"); if (ra) ra.onclick = () => busy(async () => { const b = await rasterPdf(x.bytes, { dpi: x.dpi || 200, q: 0.9, forms: true }, setProg); done(b, `Every page saved as an image at ${x.dpi || 200} dpi, with the form answers drawn in. Nothing in it can be edited.`); });
    if (x && x.render) mountPreview();
  }
  if (S.tool === "compress") {
    wireDrop("ptCDrop", pick((fs) => openCompress(fs[0])));
    const c = S.c; if (!c) return;
    ROOT.querySelectorAll("[data-pre]").forEach((b) => (b.onclick = () => { [c.value, c.unit] = b.dataset.pre.split("|"); c.res = null; render(); }));
    const v = $("#ptCVal"), u = $("#ptCUnit");
    v.oninput = () => { c.value = v.value; c.res = null; const go = $("#ptCGo"), t = targetBytes(c); if (go) { go.disabled = !t || c.bytes.length <= t; go.textContent = `Compress to under ${t ? fmt(t) : "…"}`; } };
    v.onchange = () => render();
    u.onchange = () => { c.unit = u.value; c.res = null; render(); };
    $("#ptCRaster").onchange = (e) => { c.allowRaster = e.target.checked; c.res = null; };
    $("#ptCGray").onchange = (e) => { c.gray = e.target.checked; c.res = null; };
    const go = $("#ptCGo"); if (go) go.onclick = () => busy(async () => {
      const t = targetBytes(c);
      const r = await compressTo(c.bytes, t, { allowRaster: c.allowRaster, gray: c.gray }, setProg);
      const fname = baseName(c.name) + "-compressed.pdf", blob = pdfBlob(r.bytes);
      c.res = { ...r, bytes: null, target: t, blob, fname };
      if (r.size < c.bytes.length) saveBlob(blob, fname);
    });
  }
  if (S.tool === "merge") {
    const m = S.m;
    ROOT.querySelectorAll("[data-mm]").forEach((b) => (b.onclick = () => { m.mode = b.dataset.mm; m.res = null; render(); if (m.mode === "split") drawThumbs(); }));
    if (m.mode === "merge") {
      wireDrop("ptMDrop", pick((fs) => addMerge(fs)));
      const move = (i, j) => { const [it] = m.items.splice(i, 1); m.items.splice(j, 0, it); m.res = null; render(); };
      ROOT.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1)));
      ROOT.querySelectorAll("[data-dn]").forEach((b) => (b.onclick = () => move(+b.dataset.dn, +b.dataset.dn + 1)));
      ROOT.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { m.items.splice(+b.dataset.rm, 1); m.res = null; render(); }));
      ROOT.querySelectorAll("[data-pg]").forEach((inp) => (inp.onchange = () => {
        const it = m.items[+inp.dataset.pg]; it.range = inp.value.trim() || "all"; it.err = "";
        try { it.sel = /^all$/i.test(it.range) ? null : parsePages(it.range, it.pages); } catch (e) { it.err = e.message; it.sel = null; }
        m.res = null; render();
      }));
      let dragI = -1;
      ROOT.querySelectorAll(".pt-it").forEach((row) => {
        row.ondragstart = (e) => { dragI = +row.dataset.i; row.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; };
        row.ondragend = () => row.classList.remove("drag");
        row.ondragover = (e) => { if (dragI < 0) return; e.preventDefault(); row.classList.add("over"); };
        row.ondragleave = () => row.classList.remove("over");
        row.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); const j = +row.dataset.i; if (dragI >= 0 && dragI !== j) move(dragI, j); dragI = -1; };
      });
      const fl = $("#ptMFlat"); if (fl) fl.onchange = () => { m.flatten = fl.checked; };
      const nm = $("#ptMName"); if (nm) nm.oninput = () => { m.name = nm.value; };
      const clr = $("#ptMClr"); if (clr) clr.onclick = () => { m.items = []; m.res = null; m.name = "merged"; render(); };
      const go = $("#ptMGo"); if (go) go.onclick = () => busy(async () => {
        setProg("Merging…");
        const bytes = await mergePdfs(m.items.map((it) => ({ name: it.name, bytes: it.bytes, pages: it.sel })), { flatten: m.flatten });
        const fname = baseName(m.name || "merged") + ".pdf", blob = pdfBlob(bytes);
        const pages = m.items.reduce((a, it) => a + (it.sel ? it.sel.length : it.pages), 0);
        m.res = { title: `Merged: ${fname} · ${pages} pages · ${fmt(bytes.length)}`, msg: m.items.map((it, i) => `${i + 1}. ${it.name}${it.sel ? ` (p. ${describe(it.sel)})` : ""}`).join("  "), blob, fname, warn: m.items.some((it) => it.xfa) };
        if (m.res.warn) m.res.msg += ". ⚠️ A dynamic XFA form was merged as-is: flatten it first in the XFA tool.";
        saveBlob(blob, fname);
      });
    } else {
      wireDrop("ptSDrop", pick((fs) => openSplit(fs[0])));
      const sp = m.split; if (!sp) return;
      const keepRes = () => { m.res = null; };
      ROOT.querySelectorAll("[data-sm]").forEach((b) => (b.onclick = () => { sp.mode = b.dataset.sm; keepRes(); render(); drawThumbs(); }));
      ROOT.querySelectorAll("[data-vw]").forEach((b) => (b.onclick = () => openViewer(+b.dataset.vw)));
      ROOT.querySelectorAll("[data-th]").forEach((b) => (b.ondblclick = () => openViewer(+b.dataset.th)));
      ROOT.querySelectorAll("[data-th]").forEach((b) => (b.onclick = () => {
        const i = +b.dataset.th; if (sp.mode !== "pick") { sp.mode = "pick"; sp.sel = new Set(); }
        sp.sel.has(i) ? sp.sel.delete(i) : sp.sel.add(i); keepRes(); render(); drawThumbs();
      }));
      const pk = $("#ptSPick"); if (pk) pk.onchange = () => { try { sp.sel = new Set(pk.value.trim() ? parsePages(pk.value, sp.pages) : []); S.err = ""; } catch (e) { S.err = e.message; } keepRes(); render(); drawThumbs(); };
      const all = $("#ptSAll"); if (all) all.onclick = () => { sp.sel = new Set(Array.from({ length: sp.pages }, (_, i) => i)); keepRes(); render(); drawThumbs(); };
      const none = $("#ptSNone"); if (none) none.onclick = () => { sp.sel = new Set(); keepRes(); render(); drawThumbs(); };
      const inv = $("#ptSInv"); if (inv) inv.onclick = () => { sp.sel = new Set(Array.from({ length: sp.pages }, (_, i) => i).filter((i) => !sp.sel.has(i))); keepRes(); render(); drawThumbs(); };
      const rest = $("#ptSRest"); if (rest) rest.onchange = () => { sp.rest = rest.checked; keepRes(); render(); drawThumbs(); };
      const rg = $("#ptSRanges"); if (rg) rg.onchange = () => { sp.ranges = rg.value; keepRes(); render(); drawThumbs(); };
      const nn = $("#ptSN"); if (nn) nn.onchange = () => { sp.n = Math.max(1, Math.min(sp.pages, Math.floor(+nn.value || 1))); keepRes(); render(); drawThumbs(); };
      const sf = $("#ptSFlat"); if (sf) sf.onchange = () => { sp.flatten = sf.checked; };
      const go = $("#ptSGo"); if (go) go.onclick = () => busy(async () => {
        const groups = splitGroups(sp), stem = baseName(sp.name);
        setProg(`Making ${groups.length} file${groups.length > 1 ? "s" : ""}…`);
        const outs = await splitPdf(sp.bytes, groups, { flatten: sp.flatten });
        const names = groups.map((g, i) => (sp.mode === "pick" ? (i ? `${stem}-other-pages.pdf` : `${stem}-pages-${describe(g).replace(/, /g, "_")}.pdf`) : `${stem}-part${String(i + 1).padStart(String(groups.length).length, "0")}-p${describe(g).replace(/, /g, "_")}.pdf`).replace(/[^\w.\-]+/g, "_"));
        let blob, fname;
        if (outs.length === 1) { blob = pdfBlob(outs[0]); fname = names[0]; }
        else { blob = zipStore(outs.map((d, i) => ({ name: names[i], data: d }))); fname = stem + "-split.zip"; }
        m.res = { title: `${outs.length === 1 ? "Saved" : "Split into " + outs.length + " files"}: ${fname} · ${fmt(blob.size)}`, html: outs.length > 1 ? names.map((n, i) => `${esc(n)} (${fmt(outs[i].length)})`).join("<br>") : esc(`Pages ${describe(groups[0])}`), blob, fname };
        saveBlob(blob, fname);
      });
      drawThumbs();
    }
  }
}

function mount(body) {
  ROOT = document.createElement("div"); ROOT.className = "pt";
  body.innerHTML = ""; body.appendChild(ROOT); render();
}
async function load(key, body) {
  if (ROOT && body.contains(ROOT)) return; // the console refreshes tabs every minute; keep the files that are open
  if (ROOT) { body.innerHTML = ""; body.appendChild(ROOT); render(); return; }
  mount(body);
}
function leave() { // on lock: forget every file
  gen++; ROOT = null; clearPrint(); closeViewer();
  if (S.m.split && S.m.split.doc) pjsClose(S.m.split.doc);
  S.x = null; S.c = null; S.m = { mode: "merge", items: [], flatten: true, name: "merged", res: null, split: null }; S.busy = false; S.err = ""; fontCssCache = null;
}
window.WPPdfTools = { load, leave, core: { inspectForm, flattenAcro, xfaRender, xfaImagePdf, xfaPageCanvas, rasterPdf, lossless, recompress, compressTo, mergePdfs, splitPdf, parseGroups, parsePages, describe, zipStore, unpredict } };
})();
