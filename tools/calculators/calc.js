/* WorkerPool Calculators: shared engine.
   Each page loads this file, then one spec file from /tools/calculators/specs/ that calls WPCalc.define(spec).
   A spec lists form sections and fields and a compute(values) function that returns the result.
   Everything runs in the browser. Answers are kept only in this browser (localStorage) so a visitor
   can come back to them; nothing is sent anywhere.

   Field types: select, number, yesno, lang (test + four scores -> CLB), noc (5-digit code), checks, info.
   Result: { total, max, label, status: good|warn|bad, verdict, rows: [[label, pts, max?]], notes: [],
             panels: [{ title, total, max, status, verdict, rows, notes }], checks: [{ name, ok, items: [[ok, text]] }] } */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- language tests -> CLB / NCLC (IRCC equivalency charts) ---------------- */
// Minimum score for CLB/NCLC 10, 9, 8, 7, 6, 5, 4 in each ability.
const CONV = {
  ielts: { L: [8.5, 8, 7.5, 6, 5.5, 5, 4.5], R: [8, 7, 6.5, 6, 5, 4, 3.5], W: [7.5, 7, 6.5, 6, 5.5, 5, 4], S: [7.5, 7, 6.5, 6, 5.5, 5, 4] },
  pte: { L: [89, 82, 71, 60, 50, 39, 28], R: [88, 78, 69, 60, 51, 42, 33], W: [90, 88, 79, 69, 60, 51, 41], S: [89, 84, 76, 68, 59, 51, 42] },
  tef: { L: [316, 298, 280, 249, 217, 181, 145], R: [263, 248, 233, 207, 181, 151, 121], W: [393, 371, 349, 310, 271, 226, 181], S: [393, 371, 349, 310, 271, 226, 181] },
  tcf: { L: [549, 523, 503, 458, 398, 369, 331], R: [549, 524, 499, 453, 406, 375, 342], W: [16, 14, 12, 10, 7, 6, 4], S: [16, 14, 12, 10, 7, 6, 4] },
};
const TESTS = {
  ielts: ["IELTS General Training", "0 to 9 in steps of 0.5", 0.5, 9],
  celpip: ["CELPIP-General", "Level 1 to 12", 1, 12],
  pte: ["PTE Core", "10 to 90", 1, 90],
  tef: ["TEF Canada", "TEF Canada scores", 1, 699],
  tcf: ["TCF Canada", "Listening/reading 100–699, writing/speaking 0–20", 1, 699],
  clb: ["I know my CLB / NCLC levels", "Level 1 to 12", 1, 12],
};
const EN_TESTS = ["ielts", "celpip", "pte", "clb"], FR_TESTS = ["tef", "tcf", "clb"];
const ABIL = [["L", "Listening"], ["R", "Reading"], ["W", "Writing"], ["S", "Speaking"]];
function toClb(test, ab, v) {
  if (v === "" || v == null || isNaN(+v)) return 0;
  v = +v;
  if (test === "clb" || test === "celpip") return Math.max(0, Math.min(12, Math.floor(v)));
  const row = CONV[test] && CONV[test][ab];
  if (!row) return 0;
  for (let i = 0; i < row.length; i++) if (v >= row[i]) return 10 - i;
  return 0;
}

/* ---------------- NOC helpers ---------------- */
const TEER_TXT = ["Management", "University degree", "College diploma, apprenticeship 2+ years or supervisory", "College diploma or apprenticeship under 2 years", "High school and on-the-job training", "Short-term demonstration, no formal education"];
const BOC = { 0: "Legislative and senior management", 1: "Business, finance and administration", 2: "Natural and applied sciences", 3: "Health", 4: "Education, law and social, community and government services", 5: "Art, culture, recreation and sport", 6: "Sales and service", 7: "Trades, transport and equipment operators", 8: "Natural resources, agriculture and related production", 9: "Manufacturing and utilities" };
const nocOk = (c) => /^\d{5}$/.test(c || "");
const teerOf = (c) => (nocOk(c) ? +c[1] : null);
const bocOf = (c) => (nocOk(c) ? +c[0] : null);

/* ---------------- small helpers shared with specs ---------------- */
const H = {
  esc, toClb, teerOf, bocOf, nocOk, BOC, TEER_TXT,
  minClb: (l) => (l ? l.min : 0),
  // the better of two language results, by lowest ability
  best: (...ls) => ls.filter(Boolean).sort((a, b) => b.min - a.min)[0] || null,
  money: (n) => "$" + Math.round(n).toLocaleString("en-CA"),
  num: (x, d = 0) => (x == null || isNaN(x) ? d : +x),
  // [ok, text] check line
  chk: (ok, text) => [ok, text],
  FUNDS_EE: [0, 15263, 19001, 23360, 28362, 32168, 36280, 40392], FUNDS_EE_ADD: 4112,          // IRCC, updated July 7, 2025
  FUNDS_RURAL: [0, 10507, 13080, 16080, 19524, 22143, 24975, 27806], FUNDS_RURAL_ADD: 2831,   // RCIP / FCIP, updated July 29, 2025
  funds(tbl, add, n) { n = Math.max(1, Math.floor(n || 1)); return n <= 7 ? tbl[n] : tbl[7] + (n - 7) * add; },
};

/* ---------------- rendering ---------------- */
let SPEC = null, V = {}, KEY = "";
function opt(o, cur) { return `<option value="${esc(o[0])}"${String(o[0]) === String(cur) ? " selected" : ""}>${esc(o[1])}</option>`; }

function fieldHtml(f) {
  const help = f.help ? `<span class="sub">${f.help}</span>` : "";
  const cls = "f" + (f.full ? " full" : "");
  if (f.type === "info") return `<div class="f full info" data-f="${f.id}">${f.html}</div>`;
  if (f.type === "select") return `<div class="${cls}" data-f="${f.id}"><label for="${f.id}">${f.label}</label><select id="${f.id}">${f.options.map((o) => opt(o, f.def)).join("")}</select>${help}</div>`;
  if (f.type === "yesno") return `<div class="${cls}" data-f="${f.id}"><label for="${f.id}">${f.label}</label><select id="${f.id}">${opt(["no", "No"], f.def ? "yes" : "no")}${opt(["yes", "Yes"], f.def ? "yes" : "no")}</select>${help}</div>`;
  if (f.type === "number") return `<div class="${cls}" data-f="${f.id}"><label for="${f.id}">${f.label}</label><input id="${f.id}" type="number" inputmode="decimal" min="${f.min ?? 0}" ${f.max != null ? `max="${f.max}"` : ""} step="${f.step ?? 1}" value="${f.def ?? ""}" placeholder="${esc(f.ph || "")}">${help}</div>`;
  if (f.type === "noc") return `<div class="${cls}" data-f="${f.id}"><label for="${f.id}">${f.label}</label><input id="${f.id}" type="text" inputmode="numeric" maxlength="5" pattern="\\d{5}" placeholder="e.g. 21232" value="${esc(f.def || "")}" autocomplete="off"><span class="sub" id="${f.id}_info">${f.help || "5-digit NOC 2021 code"}</span></div>`;
  if (f.type === "checks") return `<div class="f full" data-f="${f.id}"><span class="lbl">${f.label}</span><div class="checks">${f.options.map((o) => `<label class="ck"><input type="checkbox" data-group="${f.id}" value="${esc(o[0])}"><span>${esc(o[1])}</span></label>`).join("")}</div>${help}</div>`;
  if (f.type === "lang") {
    const tests = f.tests || EN_TESTS;
    return `<div class="f full lang" data-f="${f.id}"><label for="${f.id}_t">${f.label}</label>
      <select id="${f.id}_t">${opt(["none", f.noneLabel || "No test"], f.def || "none")}${tests.map((t) => opt([t, TESTS[t][0]], f.def)).join("")}</select>
      <div class="abil" id="${f.id}_s" hidden>${ABIL.map(([k, n]) => `<label><span>${n}</span><input id="${f.id}_${k}" type="number" inputmode="decimal" step="any" min="0"><em id="${f.id}_${k}c"></em></label>`).join("")}</div>${help}</div>`;
  }
  return "";
}

function render() {
  const s = SPEC;
  const form = s.sections.map((sec, i) => `<section class="panel" data-sec="${i}"><div class="ph"><span class="num">${i + 1}</span><div><h2>${sec.title}</h2>${sec.hint ? `<p>${sec.hint}</p>` : ""}</div></div><div class="grid">${sec.fields.map(fieldHtml).join("")}</div></section>`).join("");
  $("calc").innerHTML = `<div class="cols"><form id="cf" class="form" autocomplete="off" onsubmit="return false">${form}
      <div class="factions"><button type="button" class="tbtn ghost" id="cReset">Clear answers</button><span class="note">Answers stay in this browser only.</span></div></form>
    <aside class="res" id="res" aria-live="polite"></aside></div>
    <div class="mini" id="mini" hidden><span id="miniT"></span><a href="#res" class="tbtn sm">See result</a></div>`;
  $("cReset").addEventListener("click", () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); });
  $("cf").addEventListener("input", update);
  $("cf").addEventListener("change", update);
  restore();
  update();
}

function readField(f) {
  if (f.type === "select") return $(f.id).value;
  if (f.type === "yesno") return $(f.id).value === "yes";
  if (f.type === "number") { const x = $(f.id).value; return x === "" ? null : +x; }
  if (f.type === "noc") return $(f.id).value.trim();
  if (f.type === "checks") return [...document.querySelectorAll(`input[data-group="${f.id}"]:checked`)].map((i) => i.value);
  if (f.type === "lang") {
    const t = $(f.id + "_t").value;
    $(f.id + "_s").hidden = t === "none";
    if (t === "none") return null;
    const o = { test: t };
    ABIL.forEach(([k]) => {
      const inp = $(`${f.id}_${k}`), c = toClb(t, k, inp.value);
      inp.max = TESTS[t][3]; inp.step = TESTS[t][2];
      o[k] = c;
      $(`${f.id}_${k}c`).textContent = inp.value === "" ? "" : `${f.nclc || t === "tef" || t === "tcf" ? "NCLC" : "CLB"} ${c || "<4"}`;
    });
    o.min = Math.min(o.L, o.R, o.W, o.S);
    o.any = ABIL.some(([k]) => $(`${f.id}_${k}`).value !== "");
    return o.any ? o : null;
  }
  return null;
}

function allFields() { return SPEC.sections.flatMap((s) => s.fields.map((f) => [s, f])); }

function update() {
  V = {};
  // two passes so show() conditions can depend on fields that come later
  for (let pass = 0; pass < 2; pass++) {
    allFields().forEach(([, f]) => { if (f.type !== "info") V[f.id] = readField(f); });
    SPEC.sections.forEach((sec, i) => {
      const el = document.querySelector(`[data-sec="${i}"]`);
      const on = !sec.show || sec.show(V);
      el.hidden = !on;
      sec.fields.forEach((f) => {
        const fe = document.querySelector(`[data-f="${f.id}"]`);
        const vis = on && (!f.show || f.show(V));
        if (fe) fe.hidden = !vis;
        if (!vis && f.type !== "info") V[f.id] = f.type === "yesno" ? false : f.type === "checks" ? [] : f.type === "lang" ? null : f.type === "number" ? null : (f.off ?? "");
      });
    });
  }
  allFields().forEach(([, f]) => {
    if (f.type === "noc") {
      const c = V[f.id], info = $(f.id + "_info");
      info.textContent = !c ? (f.help || "5-digit NOC 2021 code") : nocOk(c) ? `TEER ${teerOf(c)} · ${BOC[bocOf(c)]}${f.describe ? " · " + f.describe(c) : ""}` : "Enter all 5 digits";
    }
  });
  save();
  let r;
  try { r = SPEC.compute(V, H); } catch (e) { console.error(e); r = { verdict: "Something went wrong working this out. Check your answers.", status: "warn" }; }
  paint(r);
}

function rowsHtml(rows, total, max, label) {
  if (!rows || !rows.length) return "";
  return `<table class="bd"><tbody>${rows.map((x) => `<tr${x[3] ? ' class="h"' : ""}><td>${x[0]}</td><td class="n">${x[1] == null ? "—" : x[1]}${x[2] != null ? `<small>/${x[2]}</small>` : ""}</td></tr>`).join("")}</tbody>${total != null ? `<tfoot><tr><td>${label || "Total"}</td><td class="n">${total}${max ? `<small>/${max}</small>` : ""}</td></tr></tfoot>` : ""}</table>`;
}
function checksHtml(checks) {
  if (!checks || !checks.length) return "";
  return `<div class="streams">${checks.map((c) => `<div class="stream ${c.ok === true ? "ok" : c.ok === false ? "no" : "maybe"}"><div class="sh"><b>${c.name}</b><span class="pill ${c.ok === true ? "good" : c.ok === false ? "bad" : "warn"}">${c.ok === true ? "Meets the basics" : c.ok === false ? "Not yet" : c.label || "Check details"}</span></div>${c.desc ? `<p class="sd">${c.desc}</p>` : ""}<ul>${c.items.map(([ok, t]) => `<li class="${ok === true ? "y" : ok === false ? "x" : "q"}">${t}</li>`).join("")}</ul></div>`).join("")}</div>`;
}
function panelHtml(p, main) {
  const meter = p.total != null && p.max ? `<div class="meter"><i style="width:${Math.max(0, Math.min(100, (p.total / p.max) * 100))}%"></i>${p.mark ? `<b style="left:${Math.min(100, (p.mark / p.max) * 100)}%" title="${esc(p.markLabel || "")}"></b>` : ""}</div>` : "";
  return `<div class="card ${main ? "main" : ""}">
    ${p.eyebrow ? `<span class="eyebrow">${p.eyebrow}</span>` : ""}
    <div class="rh"><h2>${p.title || p.label || "Your result"}</h2>${p.total != null ? `<div class="score">${p.total}${p.max ? `<small>of ${p.max}</small>` : ""}</div>` : ""}</div>
    ${meter}
    ${p.verdict ? `<p class="verdict ${p.status || ""}">${p.verdict}</p>` : ""}
    ${p.rows && p.rows.length ? `<details class="more"${main ? " open" : ""}><summary>Points breakdown</summary>${rowsHtml(p.rows, p.total, p.max, p.totalLabel)}</details>` : ""}
    ${checksHtml(p.checks)}
    ${p.notes && p.notes.length ? `<ul class="notes">${p.notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}
  </div>`;
}
function paint(r) {
  const main = Object.assign({ title: SPEC.resultTitle, eyebrow: SPEC.resultEyebrow, max: r.max ?? SPEC.max }, r);
  $("res").innerHTML = panelHtml(main, true) + (r.panels || []).map((p) => panelHtml(p, false)).join("") +
    (SPEC.sources ? `<div class="card src"><h3>Official sources checked</h3><ul>${SPEC.sources.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}</ul>${SPEC.checked ? `<p class="note">Rules checked ${SPEC.checked}. Programs can change without notice.</p>` : ""}</div>` : "");
  const mt = $("miniT");
  if (mt) { mt.innerHTML = r.total != null ? `<b>${r.total}</b>${main.max ? ` / ${main.max}` : ""} · ${esc(SPEC.short || "")}` : esc(r.miniText || SPEC.short || ""); $("mini").hidden = false; }
}

/* ---------------- save / restore (this browser only) ---------------- */
function snapshot() {
  const o = {};
  $("cf").querySelectorAll("input,select").forEach((el) => {
    if (el.type === "checkbox") { (o["#" + el.dataset.group] = o["#" + el.dataset.group] || []); if (el.checked) o["#" + el.dataset.group].push(el.value); }
    else if (el.id) o[el.id] = el.value;
  });
  return o;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) {} }
function restore() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (!o) return;
  Object.entries(o).forEach(([k, v]) => {
    if (k[0] === "#") { document.querySelectorAll(`input[data-group="${k.slice(1)}"]`).forEach((c) => (c.checked = v.includes(c.value))); return; }
    const el = $(k); if (el) el.value = v;
  });
}

window.WPCalc = {
  H,
  define(spec) {
    SPEC = spec; KEY = "wp_calc_" + spec.id;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
  },
};
})();
