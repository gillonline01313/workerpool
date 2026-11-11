// Builds a client's "complete file": one ZIP with an application summary PDF and every uploaded document,
// in numbered folders that follow the form's checklist. No outside libraries.
import { FORMS, sectionOn, fieldOn, applicantName, KEEP_DAYS } from "../assets/intake-config.js";

export const FINAL_MAX = 95 * 1024 * 1024;   // keeps the build inside a Worker's memory
export { KEEP_DAYS };                          // how long a file the client didn't ask us to keep stays downloadable

/* ---------- summary PDF (Helvetica, US Letter, text only) ---------- */
const W = 612, H = 792, M = 50;
const latin = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const pdfStr = (s) => "(" + latin(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";
function wrap(text, size, width) {
  const max = Math.max(10, Math.floor(width / (size * 0.53)));
  const out = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line + " " + word).trim().length > max) {
        if (line) out.push(line);
        let w = word; while (w.length > max) { out.push(w.slice(0, max)); w = w.slice(max); }
        line = w;
      } else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out;
}
export function summaryPdf(blocks) {
  // blocks: { t: "title"|"sub"|"h"|"kv"|"p"|"n", a, b }
  const pages = []; let ops = [], y = H - M;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = H - M; };
  const need = (h) => { if (y - h < M) newPage(); };
  const text = (x, yy, s, font, size) => ops.push(`BT /${font} ${size} Tf ${x} ${yy} Td ${pdfStr(s)} Tj ET`);
  for (const b of blocks) {
    if (b.t === "title") { need(30); text(M, y - 18, b.a, "F2", 18); y -= 30; }
    else if (b.t === "sub") { for (const l of wrap(b.a, 9, W - 2 * M)) { need(12); text(M, y - 9, l, "F1", 9); y -= 12; } y -= 4; }
    else if (b.t === "h") { need(34); y -= 10; text(M, y - 12, b.a.toUpperCase(), "F2", 11); ops.push(`0.14 0.32 0.29 RG 1 w ${M} ${y - 16} m ${W - M} ${y - 16} l S`); y -= 24; }
    else if (b.t === "n") { need(16); text(M, y - 10, b.a, "F2", 10); y -= 15; }
    else if (b.t === "p") { for (const l of wrap(b.a, 9.5, W - 2 * M)) { need(13); text(M, y - 10, l, "F1", 9.5); y -= 13; } y -= 3; }
    else if (b.t === "kv") {
      const L = wrap(b.a, 9, 220), R = wrap(b.b, 9.5, W - 2 * M - 236), n = Math.max(L.length, R.length);
      need(n * 12 + 4);
      for (let i = 0; i < n; i++) { if (L[i]) text(M, y - 10, L[i], "F1", 9); if (R[i]) text(M + 236, y - 10, R[i], "F2", 9.5); y -= 12; }
      y -= 4;
    }
  }
  newPage();
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(""), pagesId = add(""), f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  pages.forEach((p, i) => {
    p.push(`BT /F1 8 Tf ${M} 28 Td ${pdfStr(`Confidential - page ${i + 1} of ${pages.length}`)} Tj ET`);
    const content = p.join("\n");
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${x}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

/* ---------- ZIP (stored, no compression; scans and PDFs are already compressed) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zip(files) {   // files: [{ name, data: Uint8Array }]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

/* ---------- the complete file ---------- */
const shown = (v) => (v === true ? "Yes" : String(v ?? "").trim());
const safe = (s) => String(s || "file").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 90);
export async function buildCompleteFile(env, row, docs, acct) {
  const form = FORMS[row.form_key], data = row.data || {}, name = applicantName(data) || acct.name || "Applicant";
  const when = (t) => (t ? new Date(t).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" }) : "-");
  const B = [
    { t: "title", a: name },
    { t: "sub", a: `${form.name} - complete submitted file prepared by WorkerPool on ${when(new Date().toISOString())} (Edmonton time). Submitted ${when(row.resubmitted || row.submitted)}; Account: ${acct.name}, ${acct.email}, ${acct.phone}.` },
    { t: "p", a: row.partner_firm ? `Prepared for ${row.partner_firm}. It contains every answer the client gave and every document they uploaded. Confidential client information.` : "Keep this file for your records. It contains the answers you gave and every document you uploaded. Uploaded documents are destroyed from WorkerPool once your file is complete." },
  ];
  for (const s of form.sections) {
    if (!sectionOn(s, data)) continue;
    B.push({ t: "h", a: s.title });
    const one = (r) => s.fields.filter((f) => f.t !== "h" && fieldOn(f, data, r) && shown((r || {})[f.k])).forEach((f) => B.push({ t: "kv", a: f.l, b: shown(r[f.k]) }));
    if (s.rep) { const R = Array.isArray(data[s.id]) ? data[s.id] : []; if (!R.length) B.push({ t: "p", a: "None" }); R.forEach((r, i) => { B.push({ t: "n", a: `${i + 1}.` }); one(r); }); }
    else one(data[s.id] || {});
  }
  B.push({ t: "h", a: "Documents in this file" });
  const files = [], total = { n: 0 };
  const used = new Set();
  form.docs.forEach((d, i) => {
    const mine = docs.filter((x) => x.doc_key === d.k); if (!mine.length) return;
    B.push({ t: "kv", a: d.l, b: mine.map((x) => x.name).join("\n") });
    mine.forEach((x) => { let n = `${String(i + 1).padStart(2, "0")} ${safe(d.l.split(/[:(]/)[0])}/${safe(x.name)}`; let k = 2; while (used.has(n)) n = n.replace(/(\.[^./]+)?$/, ` (${k++})$1`); used.add(n); files.push({ name: n, doc: x }); });
  });
  B.push({ t: "h", a: "Consent recorded" });
  B.push({ t: "kv", a: "Consent given", b: `${when(row.consent_at)}` });
  if (row.partner_firm) B.push({ t: "kv", a: "Shared with", b: `${row.partner_firm} (the client's representative)` });
  else B.push({ t: "kv", a: "Keep a copy with WorkerPool", b: row.keep_file ? "Yes - the client asked WorkerPool to keep this complete file" : `No - removed from WorkerPool ${KEEP_DAYS} days after it is shared` });
  const out = [{ name: `00 Application summary - ${safe(name)}.pdf`, data: summaryPdf(B) }];
  for (const f of files) {
    const obj = await env.RESUMES.get(f.doc.r2_key); if (!obj) continue;
    const buf = new Uint8Array(await obj.arrayBuffer()); total.n += buf.length;
    if (total.n > FINAL_MAX) throw new Error("The documents are too large to put in one file (over 95 MB). Ask the client to compress large scans.");
    out.push({ name: f.name, data: buf });
  }
  const ascii = (t) => safe(t).normalize("NFKD").replace(/[\u2010-\u2015]/g, "-").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim();
  return { bytes: zip(out), name: `${ascii(name) || "Applicant"} - ${ascii(form.name)} - complete file.zip`, count: out.length - 1 };
}
