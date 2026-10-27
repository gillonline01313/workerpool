/* WorkerPool Median Wage Checker.
   Data in /tools/wages/data/ is rebuilt weekly from ESDC's open wage data and Job Bank's job titles
   (scripts/wages/build.mjs). Cities map to Job Bank's economic regions in places.js. */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const D = "/tools/wages/data/";
const PROVS = [["NL", "Newfoundland and Labrador", "ER10"], ["PE", "Prince Edward Island", "ER1110"], ["NS", "Nova Scotia", "ER12"], ["NB", "New Brunswick", "ER13"],
  ["QC", "Quebec", "ER24"], ["ON", "Ontario", "ER35"], ["MB", "Manitoba", "ER46"], ["SK", "Saskatchewan", "ER47"], ["AB", "Alberta", "ER48"], ["BC", "British Columbia", "ER59"],
  ["YT", "Yukon", "ER6010"], ["NT", "Northwest Territories", "ER6110"], ["NU", "Nunavut", "ER6210"]];
const PROV = Object.fromEntries(PROVS.map((p) => [p[0], p]));
const PLACES = window.WP_PLACES || {};
let INDEX = [], BYCODE = {}, META = {}, TITLES = null, titlesLoading = null;
const S = { noc: null, title: "", titleId: 0, prov: "", city: "" };
const track = (s) => { try { window.wpaSection && window.wpaSection("Wages: " + s); } catch (e) {} };

/* ---------- data ---------- */
Promise.all([fetch(D + "index.json").then((r) => r.json()), fetch(D + "meta.json").then((r) => r.json())]).then(([idx, meta]) => {
  INDEX = idx.map(([c, t, a, id]) => ({ c, t, a, id })); BYCODE = Object.fromEntries(INDEX.map((x) => [x.c, x])); META = meta;
  const s = meta.source || {};
  $("srcLine").innerHTML = `<i aria-hidden="true"></i><span>Job Bank wage data: <a href="https://open.canada.ca/data/en/dataset/adad580f-76b0-4502-bd05-20c125de9116" target="_blank" rel="noopener">${esc(s.name || "Wages")}</a>${s.revision ? `, revised ${esc(fmtDate(s.revision))}` : ""} · checked for updates ${esc(fmtDate(meta.checked))}</span>`;
  fromHash();
}).catch(() => { $("res").innerHTML = `<div class="empty">The wage data couldn't load. Please refresh the page.</div>`; });
function loadTitles() {
  if (TITLES) return Promise.resolve(TITLES);
  return titlesLoading || (titlesLoading = fetch(D + "titles.json").then((r) => r.json()).then((t) => (TITLES = t.map(([title, c, id]) => ({ t: title, l: title.toLowerCase(), c, id })))));
}
const fmtDate = (s) => { if (!s) return ""; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T12:00:00" : s); return isNaN(d) ? s : d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }); };
const money = (v, annual) => v == null ? null : annual ? "$" + Math.round(v).toLocaleString("en-CA") : "$" + v.toFixed(2);
const unit = (annual) => annual ? "per year" : "per hour";
const mwNote = (p) => { const m = (META.minWage || {})[p]; return m ? `${(PROV[p] || [])[1] || p}'s current minimum wage of $${m.rate.toFixed(2)} an hour (since ${fmtDate(m.from)})` : ""; };
const jbUrl = (id, area) => id ? `https://www.jobbank.gc.ca/marketreport/wages-occupation/${id}/${area}` : "https://www.jobbank.gc.ca/trend-analysis/search-wages";

/* ---------- search boxes ---------- */
function words(q) { return q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean); }
function hl(text, ws) { let out = esc(text); ws.forEach((w) => { if (w.length > 1) out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); }); return out; }
function rankTitles(q) {
  const ws = words(q); if (!ws.length) return [];
  const out = [];
  for (const x of TITLES) {
    if (!ws.every((w) => x.l.includes(w))) continue;
    const score = (x.l === q.toLowerCase() ? 0 : x.l.startsWith(ws[0]) ? 1 : (" " + x.l).includes(" " + ws[0]) ? 2 : 3) * 1000 + x.l.length;
    out.push([score, x]);
    if (out.length > 4000) break;
  }
  out.sort((a, b) => a[0] - b[0]);
  const seen = new Set(), res = [];
  for (const [, x] of out) { const k = x.l + "|" + x.c; if (seen.has(k)) continue; seen.add(k); res.push(x); if (res.length >= 14) break; }
  return res;
}
function rankNocs(q) {
  q = q.trim(); if (!q) return INDEX.slice(0, 0);
  if (/^\d{1,5}$/.test(q)) return INDEX.filter((x) => x.c.startsWith(q)).slice(0, 14);
  const ws = words(q);
  return INDEX.filter((x) => ws.every((w) => (x.c + " " + x.t).toLowerCase().includes(w))).slice(0, 14);
}
function combo(input, box, search, render, choose) {
  let items = [], active = -1;
  const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
  const paint = () => {
    if (!items.length) { box.innerHTML = `<div style="padding:10px;color:var(--muted);font-size:.88rem">No matches. Try another word, or the 5-digit NOC code.</div>`; }
    else box.innerHTML = items.map((x, i) => `<button type="button" role="option" id="${box.id}-${i}" aria-selected="${i === active}">${render(x)}</button>`).join("");
    box.hidden = false; input.setAttribute("aria-expanded", "true");
    box.querySelectorAll("button").forEach((b, i) => b.onmousedown = (e) => { e.preventDefault(); choose(items[i]); close(); });
  };
  const run = async () => { const q = input.value.trim(); if (q.length < 2 && !/^\d+$/.test(q)) { close(); return; } items = await search(q); active = -1; paint(); };
  input.addEventListener("input", run);
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) run(); });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { active = Math.min(items.length - 1, active + 1); paint(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
    else if (e.key === "Enter") { const x = items[active >= 0 ? active : 0]; if (x) { choose(x); close(); e.preventDefault(); } }
    else if (e.key === "Escape") close();
  });
}
combo($("title"), $("titleSug"), async (q) => { await loadTitles(); return rankTitles(q); },
  (x) => { const n = BYCODE[x.c]; return `<code>${esc(x.c)}</code><span>${hl(x.t, words($("title").value))}<small>${esc(n ? n.t : "")}</small></span>`; },
  (x) => { S.title = x.t; S.titleId = x.id || (BYCODE[x.c] || {}).id || 0; setNoc(x.c, true); $("title").value = cap(x.t); track("title"); });
combo($("noc"), $("nocSug"), async (q) => rankNocs(q),
  (x) => `<code>${esc(x.c)}</code><span>${hl(x.t, words($("noc").value))}</span>`,
  (x) => { S.title = ""; S.titleId = 0; $("title").value = ""; setNoc(x.c, true); track("noc"); });
$("noc").addEventListener("change", () => { const v = $("noc").value.trim(); if (/^\d{5}$/.test(v) && BYCODE[v] && v !== S.noc) { S.title = ""; S.titleId = 0; setNoc(v, true); } });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function setNoc(code, push) {
  S.noc = code; const n = BYCODE[code];
  $("noc").value = n ? `${n.c} – ${n.t}` : code;
  if (push) saveHash();
  show();
}

/* ---------- province and city ---------- */
$("prov").innerHTML = `<option value="">All of Canada</option>` + PROVS.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join("");
function fillCities() {
  const p = S.prov, sel = $("city");
  if (!p) { sel.innerHTML = `<option value="">Choose a province first</option>`; sel.disabled = true; return; }
  const regs = Object.keys(PLACES).filter((er) => (META.regions || {})[er] && META.regions[er].p === p);
  const one = regs.length <= 1;
  sel.innerHTML = `<option value="">Whole province</option>` + regs.map((er) => {
    const rn = (META.regions[er] || {}).n || er;
    return `<optgroup label="${esc(one ? rn : rn + " region")}">${PLACES[er].slice().sort((a, b) => a.localeCompare(b)).map((c) => `<option value="${esc(er + "|" + c)}">${esc(c)}</option>`).join("")}</optgroup>`;
  }).join("");
  sel.disabled = false;
  if (S.city && [...sel.options].some((o) => o.value === S.city)) sel.value = S.city; else S.city = "";
}
$("prov").onchange = () => { S.prov = $("prov").value; S.city = ""; fillCities(); saveHash(); show(); track("province " + S.prov); };
$("city").onchange = () => { S.city = $("city").value; saveHash(); show(); track("city"); };

/* ---------- results ---------- */
const cache = {};
async function nocData(code) { return cache[code] || (cache[code] = fetch(D + "noc/" + code + ".json").then((r) => r.json())); }
async function show() {
  const out = $("res");
  if (!S.noc) { out.innerHTML = ""; $("chosen").hidden = true; return; }
  out.innerHTML = `<div class="empty">Loading wages…</div>`;
  let n; try { n = await nocData(S.noc); } catch (e) { out.innerHTML = `<div class="empty">Couldn't load wages for NOC ${esc(S.noc)}.</div>`; return; }
  const ann = !!n.a, id = S.titleId || (BYCODE[n.c] || {}).id || 0;
  const regions = META.regions || {};
  const [er, city] = S.city ? S.city.split("|") : ["", ""];
  const prov = S.prov ? PROV[S.prov] : null;
  // the figures to headline: region → province → Canada, whichever is published first
  const rn = er ? (regions[er] || {}).n : "", rlabel = rn && prov && rn === prov[1] ? rn : `the ${rn} region`;
  const tryAreas = [er && [er, rlabel, S.prov], prov && [prov[2], prov[1], prov[0]], ["ER00", "Canada", "ca"]].filter(Boolean);
  let pick = null; const missing = [];
  for (const [code, label, area] of tryAreas) { const w = n.w[code]; if (w && w[1] != null) { pick = { code, label, area, w }; break; } missing.push(label); }
  const area = pick ? pick.area : "ca";
  const link = jbUrl(id, area);
  const tile = (cls, label, v, note) => v != null
    ? `<a class="w ${cls}" href="${esc(link)}" target="_blank" rel="noopener" title="Open this wage on Job Bank"><small>${label}</small><b>${money(v, ann)}</b><span>${note}</span></a>`
    : `<div class="w ${cls} na"><small>${label}</small><b>Not published</b><span>Job Bank doesn't publish this figure here</span></div>`;
  const where = city ? `${esc(city)}, ${esc(prov[1])}` : prov ? esc(prov[1]) : "Canada";
  const title = S.title ? cap(S.title) : n.t;
  const rows = [];
  if (prov) {
    Object.keys(regions).filter((c) => regions[c].p === S.prov && c !== prov[2]).forEach((c) => rows.push([c, regions[c].n + (regions[c].n === prov[1] ? "" : " region"), S.prov]));
    rows.push([prov[2], prov[1] + " (province)", S.prov]);
  } else PROVS.forEach(([c, nm, e]) => rows.push([e, nm, c]));
  rows.push(["ER00", "Canada", "ca"]);
  out.innerHTML = `<div class="card">
    <div class="rh"><div>
      <h2>${esc(title)}</h2>
      <p>NOC <a class="noc" href="${esc(jbUrl(id, "ca"))}" target="_blank" rel="noopener" title="Job Bank wages for NOC ${esc(n.c)}">${esc(n.c)}</a> · ${esc(n.t)}</p>
      <p>${where}${pick ? ` · wages for <b>${esc(pick.label)}</b>` : ""} · ${unit(ann)}</p>
    </div><a class="ext" href="${esc(link)}" target="_blank" rel="noopener">View on Job Bank <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a></div>
    <div class="verify" role="note" style="margin-top:0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      <div><b>Cross-check on Job Bank before using.</b> <a href="${esc(link)}" target="_blank" rel="noopener">Open this occupation's wages on Job Bank ↗</a> and confirm the figure for your work location before relying on it.</div></div>
    ${missing.length && pick ? `<div class="notice">Job Bank doesn't publish a wage for this occupation in ${esc(missing.join(" or "))}, usually because there isn't enough data. The figures below are for <b>${esc(pick.label)}</b>.</div>` : ""}
    ${pick ? `<div class="trio">${tile("lo", "Low wage", pick.w[0], "lower end of the range")}${tile("md", "Median wage", pick.w[1], unit(ann))}${tile("hi", "High wage", pick.w[2], "upper end of the range")}</div>
      ${pick.w[5] && mwNote(pick.area) ? `<div class="notice">One or more of these wages was below ${esc(mwNote(pick.area))}, so it's shown at the minimum wage, as Job Bank does.</div>` : ""}
      <p class="foot">Reference period ${esc(pick.w[3] || "–")} · source: ${esc(pick.w[4] || "Job Bank")}${n.se ? " · many people in this occupation are self-employed, so Job Bank shows yearly earnings" : ann ? " · Job Bank shows this occupation's wages per year" : ""}. Click any wage to open it on Job Bank.</p>`
      : `<div class="empty">Job Bank doesn't publish wages for this occupation in this area, its province or nationally.</div>`}
    <div class="tw"><table><thead><tr><th>Area</th><th>Low</th><th>Median</th><th>High</th><th>Period</th><th>Job Bank</th></tr></thead><tbody>
      ${rows.map(([c, label, a]) => { const w = n.w[c]; const u = jbUrl(id, a); const me = pick && c === pick.code;
        const cell = (v) => v != null ? `<a href="${esc(u)}" target="_blank" rel="noopener">${money(v, ann)}</a>` : `<span style="color:var(--muted);font-family:var(--body);font-weight:400">–</span>`;
        return `<tr${me ? ' class="me"' : ""}><td>${esc(label)}${w && w[5] ? ' <span title="Raised to the current minimum wage, as Job Bank does" style="color:var(--muted);font-size:.8rem">· min. wage</span>' : ""}</td><td class="n">${cell(w && w[0])}</td><td class="n">${cell(w && w[1])}</td><td class="n">${cell(w && w[2])}</td><td>${esc(w ? w[3] : "Not published")}</td><td><a class="ext" href="${esc(u)}" target="_blank" rel="noopener">Open</a></td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="foot">Regional rows link to Job Bank's ${prov ? esc(prov[1]) : "national"} page for this occupation, which lists every region. "–" means Job Bank doesn't publish that figure.</p>
  </div>`;
  $("chosen").hidden = true;
}

/* ---------- shareable links: #noc=21232&prov=AB&city=ER4860|Edmonton&title=... ---------- */
function saveHash() {
  const p = new URLSearchParams(); if (S.noc) p.set("noc", S.noc); if (S.prov) p.set("prov", S.prov); if (S.city) p.set("city", S.city); if (S.title) p.set("title", S.title); if (S.titleId) p.set("id", S.titleId);
  history.replaceState(null, "", location.pathname + (p.toString() ? "#" + p.toString() : ""));
}
function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("prov") && PROV[p.get("prov")]) { S.prov = p.get("prov"); $("prov").value = S.prov; S.city = p.get("city") || ""; fillCities(); }
  if (p.get("title")) { S.title = p.get("title"); S.titleId = +p.get("id") || 0; $("title").value = cap(S.title); }
  if (p.get("noc") && BYCODE[p.get("noc")]) setNoc(p.get("noc"), false);
}
})();
