/* "Send back to the client" picker, shared by admin → Intake forms and the partner portal.
   Every section of the form has a tick box (the whole section) and a Questions list to tick single questions instead.
   pickerValue() returns what the server expects: "sectionId" for whole sections, "sectionId.questionKey" for single
   questions, and "__docs" for the Documents list. */
import { sectionOn, fieldOn, RETURN_DOCS, ASK_TYPES } from "/assets/intake-config.js?v=11";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const empty = (f, v) => (f.t === "cb" ? !(v === true || v === "Yes") : String(v ?? "").trim() === "");

// Required questions not answered (for repeatable sections: in any row), and the questions worth listing.
function sectionInfo(s, data) {
  const v = data[s.id], fields = s.fields.filter((f) => f.t !== "h"), miss = new Set();
  let list, short = 0;
  if (s.rep) {
    const rows = Array.isArray(v) ? v : [];
    short = Math.max(0, (s.rep.min || 0) - rows.length);
    list = rows.length ? fields.filter((f) => rows.some((r) => fieldOn(f, data, r))) : fields.filter((f) => !f.if || !String(f.if).includes("@"));
    rows.forEach((r) => fields.forEach((f) => { if (f.r && fieldOn(f, data, r) && empty(f, r[f.k])) miss.add(f.k); }));
  } else {
    const o = v || {};
    list = fields.filter((f) => fieldOn(f, data) || !empty(f, o[f.k]));
    fields.forEach((f) => { if (f.r && fieldOn(f, data) && empty(f, o[f.k])) miss.add(f.k); });
  }
  return { list, miss, total: miss.size + short, short };
}

// opts: { picked: [ids already sent back], badge: class for "missing" badges, btn: class for small buttons, docMiss: number }
export function pickerHtml(form, data, opts = {}) {
  const picked = new Set(opts.picked || []), B = opts.badge || "", btn = opts.btn || "";
  const tag = (n) => (n ? ` <span class="${B}">${n} missing</span>` : "");
  const rows = form.sections.filter((s) => sectionOn(s, data)).map((s) => {
    const { list, miss, total, short } = sectionInfo(s, data), whole = picked.has(s.id);
    const some = list.filter((f) => picked.has(`${s.id}.${f.k}`)).length;
    return `<div class="sbp-s" data-sb-sec="${esc(s.id)}" data-sb-miss="${total ? 1 : 0}" data-sb-short="${short ? 1 : 0}">
      <div class="sbp-h"><label><input type="checkbox" data-sb-s="${esc(s.id)}"${whole ? " checked" : ""}><span><b>${esc(s.title)}</b>${tag(total)}${short ? ` <span class="${B}">needs ${short} more ${short === 1 ? "entry" : "entries"}</span>` : ""}</span></label>
        ${list.length ? `<button type="button" class="${btn}" data-sb-t="${esc(s.id)}" aria-expanded="${some ? "true" : "false"}">${some ? `${some} question${some === 1 ? "" : "s"} ▴` : "Questions ▾"}</button>` : ""}</div>
      <div class="sbp-q" data-sb-q="${esc(s.id)}"${some ? "" : " hidden"}>${list.map((f) => `<label><input type="checkbox" data-sb-f="${esc(s.id + "." + f.k)}" data-sb-m="${miss.has(f.k) ? 1 : 0}"${whole || picked.has(`${s.id}.${f.k}`) ? " checked" : ""}${whole ? " disabled" : ""}><span>${esc(f.l)}${miss.has(f.k) ? ` <span class="${B}">missing</span>` : ""}</span></label>`).join("")}</div></div>`;
  }).join("");
  const docs = `<div class="sbp-s" data-sb-miss="${opts.docMiss ? 1 : 0}"><div class="sbp-h"><label><input type="checkbox" data-sb-s="${RETURN_DOCS}"${picked.has(RETURN_DOCS) ? " checked" : ""}><span><b>Documents</b> (let them upload / remove files)${tag(opts.docMiss || 0)}</span></label></div></div>`;
  return `<style>
.sbp{display:flex;flex-direction:column;gap:2px;max-height:460px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.sbp-s{border-bottom:1px solid var(--line);padding:5px 0}.sbp-s:last-child{border-bottom:0}
.sbp-h{display:flex;justify-content:space-between;align-items:center;gap:10px}
.sbp label{display:flex;flex-direction:row;gap:8px;align-items:flex-start;font-size:.86rem;font-weight:500;cursor:pointer;margin:0;color:inherit}
.sbp label input{display:inline-block;width:auto;height:auto;margin:3px 0 0;padding:0;flex:none}
.sbp-h>label{flex:1;min-width:0}
.sbp-q{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 16px;padding:6px 0 4px 26px}
.sbp-q label{color:var(--muted)}.sbp-q label:has(input:checked){color:inherit}
.sbp-acts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
</style>
  <div class="sbp-acts"><button type="button" class="${btn}" data-sb-a="miss-q">Tick only the missing questions</button><button type="button" class="${btn}" data-sb-a="miss-s">Tick whole sections with missing items</button><button type="button" class="${btn}" data-sb-a="open">Show all questions</button><button type="button" class="${btn}" data-sb-a="none">Clear</button></div>
  <p style="margin:0 0 6px;font-size:.8rem;color:var(--muted)">Tick a section to send all of it back, or open <b>Questions</b> and tick only the ones the client should fix.</p>
  <div class="sbp">${rows}${docs}</div>`;
}

export function pickerWire(root) {
  const q = (sel) => [...root.querySelectorAll(sel)];
  const label = (sid) => { const t = root.querySelector(`[data-sb-t="${CSS.escape(sid)}"]`); if (!t) return;
    const box = root.querySelector(`[data-sb-q="${CSS.escape(sid)}"]`), n = q(`[data-sb-q="${CSS.escape(sid)}"] input:checked`).length, whole = root.querySelector(`[data-sb-s="${CSS.escape(sid)}"]`).checked;
    t.textContent = !whole && n ? `${n} question${n === 1 ? "" : "s"} ${box.hidden ? "▾" : "▴"}` : box.hidden ? "Questions ▾" : "Questions ▴"; };
  const setWhole = (cb) => { const sid = cb.dataset.sbS;
    q(`[data-sb-q="${CSS.escape(sid)}"] input`).forEach((f) => { f.disabled = cb.checked; f.checked = cb.checked; }); label(sid); };
  q("[data-sb-s]").forEach((cb) => cb.addEventListener("change", () => setWhole(cb)));
  q("[data-sb-f]").forEach((f) => f.addEventListener("change", () => label(f.dataset.sbF.split(".")[0])));
  q("[data-sb-t]").forEach((t) => t.addEventListener("click", () => { const box = root.querySelector(`[data-sb-q="${CSS.escape(t.dataset.sbT)}"]`); box.hidden = !box.hidden; t.setAttribute("aria-expanded", String(!box.hidden)); label(t.dataset.sbT); }));
  const clear = () => q("[data-sb-s]").forEach((cb) => { cb.checked = false; setWhole(cb); });
  q("[data-sb-a]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.sbA;
    if (a === "open") { q("[data-sb-q]").forEach((x) => x.hidden = false); q("[data-sb-t]").forEach((t) => label(t.dataset.sbT)); return; }
    clear(); if (a === "none") return;
    if (a === "miss-s") { q("[data-sb-s]").forEach((cb) => { if (cb.closest(".sbp-s").dataset.sbMiss === "1") { cb.checked = true; setWhole(cb); } }); return; }
    q('[data-sb-f][data-sb-m="1"]').forEach((f) => { f.checked = true; root.querySelector(`[data-sb-q="${CSS.escape(f.dataset.sbF.split(".")[0])}"]`).hidden = false; });
    q(".sbp-s").forEach((s) => { const cb = s.querySelector("[data-sb-s]"); if (s.dataset.sbMiss === "1" && (s.dataset.sbShort === "1" || !s.querySelector('[data-sb-m="1"]'))) { cb.checked = true; setWhole(cb); } });   // e.g. Documents, or a section short of entries
    q("[data-sb-t]").forEach((t) => label(t.dataset.sbT));
  }));
}

export function pickerValue(root) {
  const out = [];
  root.querySelectorAll("[data-sb-s]").forEach((cb) => {
    if (cb.checked) return out.push(cb.dataset.sbS);
    root.querySelectorAll(`[data-sb-q="${CSS.escape(cb.dataset.sbS)}"] input:checked`).forEach((f) => out.push(f.dataset.sbF));
  });
  return out;
}

/* New questions the team types when sending back: any number, each with an answer type and an optional note. */
const qRow = (btn) => `<div class="sbq-r" data-sbq>
  <input data-sbq-l maxlength="500" placeholder="Question, e.g. Why did you leave your job at ABC Ltd in March 2024?">
  <select data-sbq-t>${Object.entries(ASK_TYPES).map(([k, l]) => `<option value="${k}"${k === "ta" ? " selected" : ""}>${l}</option>`).join("")}</select>
  <input data-sbq-h maxlength="300" placeholder="Note for the client (optional)">
  <button type="button" class="${btn}" data-sbq-x title="Remove this question">✕</button></div>`;
export function questionsHtml(opts = {}) {
  const btn = opts.btn || "";
  return `<style>
.sbq{display:flex;flex-direction:column;gap:6px}
.sbq-r{display:grid;grid-template-columns:minmax(0,2.2fr) 130px minmax(0,1.3fr) auto;gap:6px;align-items:center}
@media (max-width:760px){.sbq-r{grid-template-columns:1fr 1fr}.sbq-r [data-sbq-l]{grid-column:1/-1}}
.sbq-r input,.sbq-r select{font:inherit;font-size:.86rem;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface,#fff);color:inherit;width:100%;min-width:0;margin:0}
</style>
  <div class="sbq" data-sbq-list>${qRow(btn)}</div>
  <div style="margin-top:6px"><button type="button" class="${btn}" data-sbq-add>+ Add another question</button></div>`;
}
export function questionsWire(root, opts = {}) {
  const list = root.querySelector("[data-sbq-list]");
  root.querySelector("[data-sbq-add]").addEventListener("click", () => { list.insertAdjacentHTML("beforeend", qRow(opts.btn || "")); list.lastElementChild.querySelector("[data-sbq-l]").focus(); });
  list.addEventListener("click", (e) => { const x = e.target.closest("[data-sbq-x]"); if (!x) return;
    const row = x.closest("[data-sbq]"); if (list.children.length > 1) row.remove(); else row.querySelectorAll("input").forEach((i) => i.value = ""); });
}
export function questionsValue(root) {
  return [...root.querySelectorAll("[data-sbq]")].map((r) => ({ l: r.querySelector("[data-sbq-l]").value.trim(), t: r.querySelector("[data-sbq-t]").value, h: r.querySelector("[data-sbq-h]").value.trim() })).filter((q) => q.l);
}
