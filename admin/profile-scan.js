/* Admin → Profile scanner. The admin enters one person's age, education, language results, Canadian and
   foreign work experience (by NOC), job offer and family in Canada, presses Scan, and gets scores, eligibility,
   the latest cut-offs and chances for every Express Entry program and category, every provincial nominee
   program, and every RCIP and FCIP community.

   Scoring is not duplicated here: the page loads the same official grids the public calculators use
   (tools/calculators/specs/*.js, run headless through calc.js) and maps this one profile into each of them.
   Cut-offs come from the live draws feed (/api/draws), so they follow the "Latest draws" tab.

   Confidential by design: everything runs in this browser tab. Nothing typed here is saved, logged or sent
   anywhere (the only requests are for the scoring files, the NOC list and the public draws feed). */
(function () {
"use strict";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const V = "1"; // bump when this file's spec loading changes
const PROV = [["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Québec"], ["SK", "Saskatchewan"], ["YT", "Yukon"]];
const PNAME = Object.fromEntries(PROV);
const EDU = [["none", "Less than high school"], ["hs", "High school diploma"], ["one", "One-year post-secondary diploma or certificate"], ["two", "Two-year post-secondary diploma"], ["bach", "Bachelor's degree, or a 3+ year program"], ["twoplus", "Two or more credentials, one of them 3+ years (e.g. bachelor's + PG diploma)"], ["master", "Master's or professional degree"], ["phd", "Doctorate (PhD)"]];
const REL = [["sibling", "Brother or sister"], ["parent", "Parent"], ["child", "Son or daughter (18+)"], ["grand", "Grandparent"], ["auntuncle", "Aunt or uncle"], ["niece", "Niece or nephew"], ["cousin", "First cousin"], ["friend", "Close friend or distant relative"]];
const EN_T = [["none", "No English test"], ["ielts", "IELTS General Training"], ["celpip", "CELPIP-General"], ["pte", "PTE Core"], ["clb", "CLB levels (already converted)"]];
const FR_T = [["none", "No French test"], ["tef", "TEF Canada"], ["tcf", "TCF Canada"], ["clb", "NCLC levels (already converted)"]];
const ALL_T = [["none", "No test"], ...EN_T.slice(1, 4), ...FR_T.slice(1, 3), ["clb", "CLB / NCLC levels"]];
const STATUS = [["outside", "Outside Canada"], ["wp", "In Canada: work permit (employer-specific or open)"], ["pgwp", "In Canada: post-graduation work permit"], ["sp", "In Canada: study permit"], ["visitor", "In Canada: visitor, maintained or other status"]];
const AB4 = [["L", "Listening"], ["R", "Reading"], ["W", "Writing"], ["S", "Speaking"]];
// Towns that belong to each RCIP / FCIP community (used to match a job offer, past work or a relative's city).
const TOWNS = {
  pictou: ["pictou", "new glasgow", "stellarton", "westville", "trenton"], northbay: ["north bay"], sudbury: ["sudbury"], timmins: ["timmins"],
  sault: ["sault ste", "sault ste. marie", "sault"], thunderbay: ["thunder bay"], steinbach: ["steinbach"], altona: ["altona", "rhineland", "gretna", "plum coulee"],
  brandon: ["brandon"], moosejaw: ["moose jaw"], claresholm: ["claresholm"], wk: ["nelson", "castlegar", "trail", "rossland", "nakusp", "kaslo", "salmo", "fruitvale", "montrose", "warfield"],
  nos: ["vernon", "salmon arm", "armstrong", "enderby", "coldstream", "lumby", "sicamous", "spallumcheen"], pl: ["fort st. john", "fort st john", "dawson creek", "fort nelson", "chetwynd", "tumbler ridge", "hudson's hope", "taylor", "pouce coupe"],
  acadian: ["caraquet", "shippagan", "tracadie", "lamèque", "lameque", "bas-caraquet", "paquetville"], sudburyF: ["sudbury"], timminsF: ["timmins"],
  superior: ["wawa", "hornepayne", "chapleau", "dubreuilville", "white river"], stpj: ["st. pierre jolys", "st-pierre-jolys", "st pierre jolys", "saint-pierre-jolys"], kelowna: ["kelowna", "west kelowna", "lake country", "peachland"],
};

/* ---------------- loading the official grids (once) ---------------- */
let BOOT = null;
function script(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load " + src)); document.head.appendChild(s); }); }
function boot() {
  if (BOOT) return BOOT;
  BOOT = (async () => {
    const SP = {};
    window.WPCalcHeadless = (s) => { SP[s.id] = s; };
    await script("/tools/calculators/data/hw-noc.js?v=1");
    await script("/tools/calculators/data/rcip-bc.js?v=1");
    await script("/tools/calculators/calc.js?v=2&h=" + V);
    for (const s of ["express-entry", "bc", "ab", "sk", "mb", "on", "nt", "yt"]) await script(`/tools/calculators/specs/${s}.js?v=1&h=${V}`);
    for (const p of ["ns", "nb", "pe", "nl"]) { window.WP_PROV = p; await script(`/tools/calculators/specs/atlantic.js?v=1&h=${V}${p}`); }
    for (const p of ["rcip", "fcip"]) { window.WP_PILOT = p; await script(`/tools/calculators/specs/pilots.js?v=1&h=${V}${p}`); }
    delete window.WPCalcHeadless;
    const [nocs, draws] = await Promise.all([
      fetch("/tools/noc/noc-2021.json").then((r) => r.json()).then((a) => a.map((x) => [x.c, x.t])).catch(() => []),
      fetch("/api/draws?days=400").then((r) => r.json()).then((j) => j.draws || []).catch(() => []),
    ]);
    return { SP, H: window.WPCalc.H, HW: window.WP_HW_NOC || {}, nocs, NOCT: Object.fromEntries(nocs), draws };
  })();
  BOOT.catch(() => { BOOT = null; });
  return BOOT;
}

/* Run one spec with mapped answers, applying its show/hide rules exactly like the public calculator. */
function run(spec, over, H) {
  const dflt = (f) => f.type === "select" ? String(f.def ?? f.options[0][0]) : f.type === "yesno" ? !!f.def : f.type === "number" ? (f.def === "" || f.def == null ? null : +f.def) : f.type === "noc" ? (f.def || "") : f.type === "checks" ? [] : null;
  const off = (f) => f.type === "yesno" ? false : f.type === "checks" ? [] : f.type === "lang" || f.type === "number" ? null : (f.off ?? "");
  const pick = (f) => (Object.prototype.hasOwnProperty.call(over, f.id) ? over[f.id] : dflt(f));
  const v = {};
  spec.sections.forEach((s) => s.fields.forEach((f) => { if (f.type !== "info") v[f.id] = pick(f); }));
  for (let pass = 0; pass < 2; pass++) spec.sections.forEach((s) => {
    const on = !s.show || s.show(v);
    s.fields.forEach((f) => { if (f.type === "info") return; v[f.id] = on && (!f.show || f.show(v)) ? pick(f) : off(f); });
  });
  return spec.compute(v, H);
}

/* ---------------- state and form ---------------- */
let ROOT = null, X = null;
const S = { jobs: [], rels: [] };
const newJob = (cdn) => ({ noc: "", where: cdn ? "" : "XX", city: "", yrs: "", ago: "0" });
const newRel = () => ({ rel: "sibling", prov: "", city: "" });

const css = `
.ps{display:flex;flex-direction:column;gap:16px}
.ps-note{font-size:.82rem;color:var(--muted);margin:0}
.ps-priv{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);background:var(--accent-soft);border-radius:12px;padding:10px 14px;font-size:.84rem}
.ps-sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.ps-sec h3{font-family:var(--display);font-size:1.02rem;margin:0;display:flex;gap:10px;align-items:center}
.ps-sec h3 i{font-style:normal;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--surface);font-size:.78rem}
.ps-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}
@media (max-width:820px){.ps-g{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.ps-g{grid-template-columns:1fr}}
.ps-g .w2{grid-column:span 2}.ps-g .w3{grid-column:1/-1}
@media (max-width:560px){.ps-g .w2{grid-column:auto}}
.ps label.f{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted);min-width:0}
.ps input,.ps select{font:inherit;font-size:.88rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--fg);width:100%;min-width:0}
.ps label.ck{display:flex;gap:8px;align-items:center;font-size:.86rem;font-weight:500;color:var(--fg)}
.ps label.ck input{width:auto}
.ps-sub{font-size:.74rem;font-weight:500;color:var(--muted)}
.ps-lang{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(4,minmax(0,1fr));gap:8px;align-items:end}
@media (max-width:700px){.ps-lang{grid-template-columns:1fr 1fr}}
.ps-lang em{font-style:normal;font-size:.72rem;color:var(--accent);font-weight:700;min-height:1em}
.ps-rows{display:flex;flex-direction:column;gap:8px}
.ps-row{display:grid;grid-template-columns:minmax(0,2.3fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.9fr) auto;gap:8px;align-items:end;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg)}
.ps-row.rel{grid-template-columns:minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1.2fr) auto}
@media (max-width:820px){.ps-row,.ps-row.rel{grid-template-columns:1fr 1fr}}
.ps-row input,.ps-row select{background:var(--surface)}
.ps-x{font:inherit;border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:8px;padding:7px 10px;cursor:pointer}
.ps-btn{font:inherit;font-weight:600;font-size:.86rem;padding:9px 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer}
.ps-btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}
.ps-btn.big{font-size:1rem;padding:12px 28px}
.ps-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.ps-err{color:#b3412e;font-weight:600;font-size:.86rem}
.ps-nt{font-size:.74rem;color:var(--muted);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-hide{display:none!important}
.ps-res{display:flex;flex-direction:column;gap:16px}
.ps-hero{background:var(--surface);border:2px solid var(--accent);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:12px}
.ps-hero h2{font-family:var(--display);margin:0;font-size:1.35rem}
.ps-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
@media (max-width:820px){.ps-kpis{grid-template-columns:1fr 1fr}}
.ps-kpi{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--bg)}
.ps-kpi small{display:block;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.ps-kpi b{display:block;font-family:var(--display);font-size:1.5rem;line-height:1.2;margin-top:2px}
.ps-kpi span{font-size:.76rem;color:var(--muted)}
.ps-top{display:flex;flex-wrap:wrap;gap:8px}
.ps-top span{border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:.82rem;background:var(--bg)}
.ps-top span b{margin-right:4px}
.ps-grp{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ps-grp>h3{font-family:var(--display);font-size:1.02rem;margin:0;padding:12px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}
.ps-grp>h3 small{font-family:var(--body);font-weight:500;font-size:.78rem;color:var(--muted)}
.ps-t{width:100%;border-collapse:collapse;font-size:.86rem}
.ps-t th{text-align:left;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 12px;border-bottom:1px solid var(--line);font-weight:700}
.ps-t td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.ps-t tr.r{cursor:pointer}.ps-t tr.r:hover td{background:var(--accent-soft)}
.ps-t tr.d td{background:var(--bg);padding:12px 16px}
.ps-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ps-t td small{display:block;color:var(--muted);font-size:.75rem;margin-top:2px}
.ps-ch{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.03em;padding:3px 9px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.ps-ch.hi{background:#1f9d63;color:#fff}.ps-ch.good{background:#d7f0e3;color:#11603b}
.ps-ch.mid{background:#fbefd5;color:#7a4a17}.ps-ch.low{background:#fbe1dc;color:#8f2d1c}
.ps-ch.no{background:transparent;color:#b3412e;border-color:#e3b3a9}.ps-ch.ok{background:var(--accent-soft);color:var(--fg)}
.ps-ch.q{background:transparent;color:var(--muted);border-color:var(--line)}
.ps-wi{display:inline-block;font-size:.64rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px dashed var(--accent);color:var(--accent);border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}
.ps-gap.p{color:#11603b;font-weight:700}.ps-gap.m{color:#8f2d1c;font-weight:700}
.ps-dt{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
@media (max-width:820px){.ps-dt{grid-template-columns:1fr}}
.ps-dt h4{margin:0 0 6px;font-size:.84rem}
.ps-bd{width:100%;border-collapse:collapse;font-size:.8rem}
.ps-t .ps-bd td,.ps-bd td{padding:3px 0;border-bottom:1px dashed var(--line);background:transparent!important;vertical-align:baseline}.ps-bd td.n{text-align:right;white-space:nowrap;padding-left:10px}
.ps-t .ps-bd td small{display:inline;margin:0;color:var(--muted)}
.ps-bd tr.h td{font-weight:700;padding-top:8px;border-bottom:1px solid var(--line)}
.ps-ul{margin:0;padding-left:18px;font-size:.8rem;display:flex;flex-direction:column;gap:3px}
.ps-ck{list-style:none;padding-left:0}
.ps-ck li::before{display:inline-block;width:18px;font-weight:700}
.ps-ck li.y::before{content:"✓";color:#1f9d63}.ps-ck li.x::before{content:"✕";color:#b3412e}.ps-ck li.q::before{content:"?";color:var(--muted)}
.ps-ckn{font-size:.78rem;font-weight:700;margin:6px 0 2px}
@media print{.ps-noprint{display:none!important}}
`;

const opt = (o, cur) => `<option value="${esc(o[0])}"${String(o[0]) === String(cur) ? " selected" : ""}>${esc(o[1])}</option>`;
const sel = (id, opts, cur, cls = "") => `<select id="${id}" ${cls ? `class="${cls}"` : ""}>${opts.map((o) => opt(o, cur)).join("")}</select>`;
const fld = (label, inner, cls = "", sub = "") => `<label class="f ${cls}">${label}${inner}${sub ? `<span class="ps-sub">${sub}</span>` : ""}</label>`;
const num = (id, ph = "", attrs = "") => `<input id="${id}" type="number" inputmode="decimal" step="any" min="0" placeholder="${esc(ph)}" ${attrs}>`;
const provOpts = (blank) => [["", blank], ...PROV];

function langBlock(pfx, label, tests) {
  return `<div class="ps-lang" data-lang="${pfx}">${fld(label, sel(pfx + "_t", tests, "none"))}${AB4.map(([k, n]) => fld(n, `<input id="${pfx}_${k}" type="number" inputmode="decimal" step="any" min="0" disabled><em id="${pfx}_${k}c"></em>`)).join("")}</div>`;
}

function formHtml() {
  return `<div class="ps-priv ps-noprint"><span>🔒</span><div><b>Confidential.</b> The scanner runs entirely in this browser tab: nothing you type is saved, logged or sent anywhere, and it's gone when you lock the console or close the tab. Scores use the same official grids as the public calculators (rules checked Nov 2026) and the live draws feed.</div></div>
  <form id="psF" class="ps ps-noprint" autocomplete="off" onsubmit="return false">
  <datalist id="psNocs"></datalist>
  <section class="ps-sec"><h3><i>1</i>Person</h3><div class="ps-g">
    ${fld("Client name or reference (optional, for the printout)", `<input id="ps_ref" type="text">`, "w2")}
    ${fld("Age", num("ps_age", "e.g. 29", 'max="80"'))}
    ${fld("Marital status", sel("ps_mar", [["single", "Single, divorced, separated or widowed"], ["married", "Married or common-law"]], "single"))}
    ${fld("Spouse or partner coming to Canada?", sel("ps_spAcc", [["yes", "Yes, coming with them"], ["no", "No, not coming"], ["cdn", "Spouse is a Canadian citizen or PR"]], "yes"), "ps-mar")}
    ${fld("Dependent children", num("ps_kids", "0", 'max="12" step="1"'))}
    ${fld("Status now", sel("ps_status", STATUS, "outside"), "w2")}
    ${fld("Savings for proof of funds (CAD)", num("ps_funds", "optional"), "", "Checked against FSW, FST, RCIP and FCIP amounts")}
    ${fld("Highest yearly Canadian earnings, last 5 years (CAD)", num("ps_earn", "optional"), "", "From a CRA Notice of Assessment (Ontario points)")}
    <label class="ck w2"><input type="checkbox" id="ps_nom"> Already holds a provincial or territorial nomination (+600 CRS)</label>
  </div></section>

  <section class="ps-sec"><h3><i>2</i>Education</h3><div class="ps-g">
    ${fld("Highest completed education", sel("ps_edu", EDU, "bach"), "w2")}
    ${fld("Where was it completed?", sel("ps_eduWhere", [["XX", "Outside Canada"], ...PROV], "XX"))}
    <label class="ck w3"><input type="checkbox" id="ps_trade"> That credential is a trade certificate or apprenticeship</label>
    ${fld("Post-secondary study completed in Canada", sel("ps_cdnEdu", [["none", "None"], ["short", "1- or 2-year diploma or certificate"], ["long", "3+ year program, or a master's or doctorate"]], "none"))}
    ${fld("Province of Canadian study", sel("ps_studyProv", provOpts("—"), ""), "ps-cdnEdu")}
    ${fld("Canadian credentials of 1+ year", sel("ps_cdnCount", [["1", "One"], ["2", "Two or more"]], "1"), "ps-cdnEdu")}
    <label class="ck w3"><input type="checkbox" id="ps_tradeCert"> Holds a Canadian certificate of qualification in a skilled trade (province or territory)</label>
    <label class="ck w3"><input type="checkbox" id="ps_licence"> Licensed or certified for their regulated occupation in the job offer's province</label>
  </div></section>

  <section class="ps-sec"><h3><i>3</i>Language scores</h3>
    ${langBlock("ps_en", "English test", EN_T)}
    ${langBlock("ps_fr", "French test", FR_T)}
    <p class="ps-note">Scores convert to CLB / NCLC with IRCC's equivalency charts. Only IELTS General, CELPIP-General, PTE Core, TEF Canada and TCF Canada count.</p>
  </section>

  <section class="ps-sec"><h3><i>4</i>Work experience</h3>
    <p class="ps-note">One row per job. Pick the NOC (type a code or job title). Count part-time as full-time equivalent years (30 h/week = 1 year). <b>Ended</b> is how many years ago the job ended; 0 means they still work there.</p>
    <b style="font-size:.86rem">In Canada</b><div class="ps-rows" id="psJobsC"></div>
    <div><button type="button" class="ps-btn g" id="psAddC">+ Canadian job</button></div>
    <b style="font-size:.86rem">Outside Canada</b><div class="ps-rows" id="psJobsF"></div>
    <div><button type="button" class="ps-btn g" id="psAddF">+ Foreign job</button></div>
  </section>

  <section class="ps-sec"><h3><i>5</i>Job offer in Canada</h3>
    <label class="ck"><input type="checkbox" id="ps_offer"> Has a full-time, permanent job offer from a Canadian employer</label>
    <div class="ps-g ps-offer">
      ${fld("Job offer NOC", `<input id="ps_oNoc" list="psNocs" placeholder="Code or job title"><span class="ps-nt" id="ps_oNoc_t"></span>`, "w2")}
      ${fld("Hourly wage ($)", num("ps_oWage", "e.g. 28.50"))}
      ${fld("Province", sel("ps_oProv", provOpts("Choose"), ""))}
      ${fld("City or town", `<input id="ps_oCity" type="text" placeholder="e.g. Vernon">`)}
      ${fld("Months already working for this employer", num("ps_oEmp", "0", 'step="1"'))}
      ${fld("BC area", sel("ps_bcArea", [["1", "Area 1: Metro Vancouver"], ["2", "Area 2: Squamish, Abbotsford, Agassiz, Mission, Chilliwack"], ["3", "Area 3: rest of BC"]], "1"), "ps-p-BC w2")}
      ${fld("Alberta location", sel("ps_abLoc", [["cmA", "Calgary or Edmonton area"], ["rr", "Rural Renewal designated community"], ["other", "Another Alberta community"]], "cmA"), "ps-p-AB w2")}
      ${fld("Ontario region", sel("ps_onRegion", [["toronto", "City of Toronto"], ["gta", "GTA outside Toronto"], ["east", "Eastern, Central (outside GTA) or Southwestern Ontario"], ["north", "Northern Ontario"]], "gta"), "ps-p-ON w2")}
      <label class="ck w3"><input type="checkbox" id="ps_oDesig"> Employer is designated (RCIP / FCIP community or Atlantic Immigration Program)</label>
    </div>
  </section>

  <section class="ps-sec"><h3><i>6</i>Family in Canada</h3>
    <label class="ck"><input type="checkbox" id="ps_hasRel"> Has a sibling, parent or other relative in Canada (18+, citizen or PR; the client's or the spouse's)</label>
    <div class="ps-rows" id="psRels"></div>
    <div class="ps-relA"><button type="button" class="ps-btn g" id="psAddR">+ Relative</button></div>
  </section>

  <section class="ps-sec ps-spouse"><h3><i>7</i>Spouse or partner</h3><div class="ps-g">
    ${fld("Spouse's highest education", sel("ps_spEdu", EDU, "bach"), "w2")}
    ${fld("Spouse's skilled work in Canada (years)", sel("ps_spCdn", [0, 1, 2, 3, 4, 5].map((i) => [String(i), i ? (i === 5 ? "5 or more" : String(i)) : "None, or under 1"]), "0"))}
    <label class="ck w3"><input type="checkbox" id="ps_spStudy"> Spouse studied full-time in Canada for 2+ years</label>
  </div>${langBlock("ps_sp", "Spouse's language test", ALL_T)}</section>

  <section class="ps-sec"><h3><i>8</i>What-if job offer</h3>
    <label class="ck"><input type="checkbox" id="ps_wi" checked> Where a program needs a job offer they don't have, also score it with an assumed offer</label>
    <div class="ps-g ps-wiF">
      ${fld("Assumed NOC", `<input id="ps_wiNoc" list="psNocs" placeholder="Blank = their main occupation"><span class="ps-nt" id="ps_wiNoc_t"></span>`, "w2")}
      ${fld("Assumed hourly wage ($)", num("ps_wiWage", "e.g. 25"))}
      ${fld("Assumed location", sel("ps_wiLoc", [["metro", "Major city (Vancouver, Calgary, Toronto…)"], ["regional", "Outside the major cities"]], "regional"), "w2")}
    </div>
    <p class="ps-note">What-if results are labelled and never count as the person's actual standing.</p>
  </section>

  <div class="ps-acts"><button type="button" class="ps-btn big" id="psScan">Scan profile</button><button type="button" class="ps-btn g" id="psEx">Fill example</button><button type="button" class="ps-btn g" id="psClr">Clear all</button><span class="ps-err" id="psErr"></span></div>
  </form>
  <div id="psOut" class="ps-res"></div>`;
}

function jobRow(j, i) {
  const cdn = j.where !== "XX";
  return `<div class="ps-row" data-i="${i}">
    ${fld("NOC", `<input data-k="noc" list="psNocs" value="${esc(j.noc)}" placeholder="Code or job title"><span class="ps-nt">${esc(nocTitle(j.noc))}</span>`)}
    ${cdn ? fld("Province", `<select data-k="where">${provOpts("Choose").map((o) => opt(o, j.where)).join("")}</select>`) : fld("Country (optional)", `<input data-k="city" value="${esc(j.city)}" placeholder="e.g. India">`)}
    ${cdn ? fld("City", `<input data-k="city" value="${esc(j.city)}" placeholder="optional">`) : `<span></span>`}
    ${fld("Years", `<input data-k="yrs" type="number" step="0.25" min="0" value="${esc(j.yrs)}">`)}
    ${fld("Ended (yrs ago)", `<input data-k="ago" type="number" step="0.25" min="0" value="${esc(j.ago)}">`)}
    <button type="button" class="ps-x" data-del="${i}" aria-label="Remove">✕</button></div>`;
}
function relRow(r, i) {
  return `<div class="ps-row rel" data-r="${i}">
    ${fld("Relation", `<select data-k="rel">${REL.map((o) => opt(o, r.rel)).join("")}</select>`)}
    ${fld("Province", `<select data-k="prov">${provOpts("Choose").map((o) => opt(o, r.prov)).join("")}</select>`)}
    ${fld("City or town", `<input data-k="city" value="${esc(r.city)}">`)}
    <button type="button" class="ps-x" data-delr="${i}" aria-label="Remove">✕</button></div>`;
}
const nocCode = (s) => ((String(s || "").match(/\d{5}/) || [""])[0]);
const nocTitle = (s) => { const c = nocCode(s); return c && X && X.NOCT[c] ? `${c} · ${X.NOCT[c]} · TEER ${c[1]}` : c ? `${c} · TEER ${c[1]}` : ""; };

function drawRows() {
  const c = ROOT.querySelector("#psJobsC"), f = ROOT.querySelector("#psJobsF");
  c.innerHTML = S.jobs.map((j, i) => (j.where !== "XX" ? jobRow(j, i) : "")).join("") || `<p class="ps-note">No Canadian jobs added.</p>`;
  f.innerHTML = S.jobs.map((j, i) => (j.where === "XX" ? jobRow(j, i) : "")).join("") || `<p class="ps-note">No foreign jobs added.</p>`;
  ROOT.querySelector("#psRels").innerHTML = S.rels.map(relRow).join("");
}

function syncUi() {
  const $ = (id) => ROOT.querySelector("#" + id);
  ROOT.querySelectorAll(".ps-mar").forEach((e) => e.classList.toggle("ps-hide", $("ps_mar").value !== "married"));
  ROOT.querySelector(".ps-spouse").classList.toggle("ps-hide", !($("ps_mar").value === "married" && $("ps_spAcc").value === "yes"));
  ROOT.querySelectorAll(".ps-cdnEdu").forEach((e) => e.classList.toggle("ps-hide", $("ps_cdnEdu").value === "none"));
  ROOT.querySelector(".ps-offer").classList.toggle("ps-hide", !$("ps_offer").checked);
  ["BC", "AB", "ON"].forEach((p) => ROOT.querySelectorAll(".ps-p-" + p).forEach((e) => e.classList.toggle("ps-hide", $("ps_oProv").value !== p)));
  ROOT.querySelector("#psRels").classList.toggle("ps-hide", !$("ps_hasRel").checked);
  ROOT.querySelector(".ps-relA").classList.toggle("ps-hide", !$("ps_hasRel").checked);
  if ($("ps_hasRel").checked && !S.rels.length) { S.rels.push(newRel()); drawRows(); }
  ROOT.querySelector(".ps-wiF").classList.toggle("ps-hide", !$("ps_wi").checked);
  $("ps_oNoc_t").textContent = nocTitle($("ps_oNoc").value);
  $("ps_wiNoc_t").textContent = nocTitle($("ps_wiNoc").value);
  ["ps_en", "ps_fr", "ps_sp"].forEach((p) => {
    const t = $(p + "_t").value;
    AB4.forEach(([k]) => {
      const inp = $(`${p}_${k}`); inp.disabled = t === "none";
      const c = t === "none" || inp.value === "" || !X ? "" : X.H.toClb(t, k, inp.value);
      $(`${p}_${k}c`).textContent = c === "" ? "" : `${t === "tef" || t === "tcf" || p === "ps_fr" ? "NCLC" : "CLB"} ${c || "<4"}`;
    });
  });
}

/* ---------------- reading the form into one profile ---------------- */
function readForm() {
  const $ = (id) => ROOT.querySelector("#" + id);
  const n = (id) => { const v = $(id).value; return v === "" ? null : +v; };
  const L = (p) => ({ t: $(p + "_t").value, L: $(p + "_L").value, R: $(p + "_R").value, W: $(p + "_W").value, S: $(p + "_S").value });
  return {
    ref: $("ps_ref").value.trim(), age: n("ps_age"), married: $("ps_mar").value === "married", spAcc: $("ps_spAcc").value, kids: Math.max(0, Math.floor(n("ps_kids") || 0)),
    status: $("ps_status").value, funds: n("ps_funds"), earn: n("ps_earn"), nominated: $("ps_nom").checked,
    edu: $("ps_edu").value, eduWhere: $("ps_eduWhere").value, trade: $("ps_trade").checked, cdnEdu: $("ps_cdnEdu").value, studyProv: $("ps_cdnEdu").value === "none" ? "" : $("ps_studyProv").value,
    cdnCount: $("ps_cdnEdu").value === "none" ? 0 : +$("ps_cdnCount").value, tradeCert: $("ps_tradeCert").checked, licence: $("ps_licence").checked,
    en: L("ps_en"), fr: L("ps_fr"),
    jobs: S.jobs.map((j) => ({ noc: nocCode(j.noc), where: j.where, city: (j.city || "").trim(), yrs: Math.max(0, +j.yrs || 0), ago: Math.max(0, +j.ago || 0) })),
    offer: { has: $("ps_offer").checked, noc: nocCode($("ps_oNoc").value), wage: n("ps_oWage") || 0, prov: $("ps_oProv").value, city: $("ps_oCity").value.trim(), empM: Math.max(0, n("ps_oEmp") || 0),
      bcArea: $("ps_bcArea").value, abLoc: $("ps_abLoc").value, onRegion: $("ps_onRegion").value, designated: $("ps_oDesig").checked },
    rels: $("ps_hasRel").checked ? S.rels.filter((r) => r.prov) : [],
    sp: { edu: $("ps_spEdu").value, cdn: $("ps_spCdn").value, lang: L("ps_sp"), study: $("ps_spStudy").checked },
    wi: { on: $("ps_wi").checked, noc: nocCode($("ps_wiNoc").value), wage: n("ps_wiWage") || 0, metro: $("ps_wiLoc").value === "metro" },
  };
}

/* ---------------- derived facts ---------------- */
function derive(P) {
  const H = X.H;
  const lang = (o) => {
    if (!o || o.t === "none") return null;
    const r = { test: o.t }; let any = false;
    AB4.forEach(([k]) => { if (o[k] !== "") any = true; r[k] = H.toClb(o.t, k, o[k]); });
    r.min = Math.min(r.L, r.R, r.W, r.S); r.any = any;
    return any ? r : null;
  };
  const jobs = P.jobs.filter((j) => /^\d{5}$/.test(j.noc) && j.yrs > 0 && (j.where === "XX" || j.where)).map((j) => ({ ...j, teer: +j.noc[1], cdn: j.where !== "XX" }));
  const win = (j, W) => Math.max(0, Math.min(j.ago + j.yrs, W) - j.ago);
  const sum = (f, W) => jobs.filter(f).reduce((s, j) => s + win(j, W), 0);
  const longest = (a) => a.slice().sort((x, y) => win(y, 10) - win(x, 10) || x.ago - y.ago)[0] || null;
  const sk = (j) => j.teer <= 3;
  const en = lang(P.en), fr = lang(P.fr), spLang = lang(P.sp.lang);
  const best = H.best(en, fr);
  const main = longest(jobs), mainCdnSk = longest(jobs.filter((j) => j.cdn && sk(j)));
  const cur = jobs.find((j) => j.cdn && j.ago === 0) || null;
  const relIn = (prov, kinds) => P.rels.some((r) => (!prov || r.prov === prov) && kinds.includes(r.rel));
  const CLOSE = ["sibling", "parent", "child", "grand", "auntuncle", "niece", "cousin"];
  const sp = P.married && P.spAcc === "yes";
  return {
    P, H, jobs, win, sum, en, fr, spLang, best, bestMin: best ? best.min : 0, main, mainCdnSk, cur, sp, CLOSE, relIn,
    mainNoc: main ? main.noc : "",
    family: 1 + (P.married ? 1 : 0) + P.kids,
    cdn10: sum((j) => j.cdn && sk(j), 10), cdn3: sum((j) => j.cdn && sk(j), 3), for10: sum((j) => !j.cdn && sk(j), 10),
    all10: sum(() => true, 10), all5: sum(() => true, 5),
    related: (noc, W) => sum((j) => j.noc === noc, W),
    inProv: (pr, W = 10) => sum((j) => j.where === pr, W),
    town: (key) => { const t = TOWNS[key] || []; return (c) => !!c && t.some((w) => c.toLowerCase().includes(w)); },
    authWork: P.status === "wp" || P.status === "pgwp",
  };
}
const teerOf = (c) => (/^\d{5}$/.test(c || "") ? +c[1] : null);
const yrsSel = (y, cap) => String(Math.min(cap, Math.floor(y + 1e-9)));

/* The offer to score a program with: the real one if it's in that place, otherwise the what-if offer, otherwise none. */
function offerIn(D, prov, cityOk) {
  const o = D.P.offer;
  if (o.has && o.prov === prov && /^\d{5}$/.test(o.noc) && (!cityOk || cityOk(o.city))) return { ...o, here: true, whatIf: false, current: o.empM > 0, metro: null };
  const w = D.P.wi, noc = w.noc || D.mainNoc;
  if (w.on && /^\d{5}$/.test(noc)) return { here: false, whatIf: true, noc, prov, city: "", wage: w.wage, empM: 0, current: false, designated: true, metro: w.metro };
  return null;
}

/* ---------------- draws ---------------- */
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
function cutoff(jur, test, days = 240) {
  const xs = X.draws.filter((d) => d.jur === jur && d.score != null && d.score !== "" && !isNaN(+d.score) && d.date >= daysAgo(days) && test(d)).sort((a, b) => b.date.localeCompare(a.date));
  if (!xs.length) return null;
  const sc = xs.slice(0, 6).map((d) => +d.score);
  return { score: +xs[0].score, date: xs[0].date, stream: xs[0].stream, source: xs[0].source, lo: Math.min(...sc), hi: Math.max(...sc), n: Math.min(6, xs.length) };
}
function lastDraw(jur, test = () => true, days = 365) {
  return X.draws.filter((d) => d.jur === jur && d.date >= daysAgo(days) && test(d)).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}
const fmtDay = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "";

/* ---------------- one result row ---------------- */
function row(o) {
  const r = { group: "", name: "", sub: "", score: null, max: null, eligible: null, why: [], cut: null, gap: null, band: 10, whatIf: false, R: null, notes: [], ...o };
  if (r.cut && r.cut.score != null && r.score != null) r.gap = Math.round(r.score - r.cut.score);
  const g = r.gap, b = r.band;
  r.chance = r.eligible === false ? ["no", "Not eligible yet"] : r.force || (r.score == null && r.eligible == null) ? ["q", r.qLabel || "Not scored"] :
    g == null ? (r.eligible ? ["ok", r.cut ? "Eligible" : r.noCut || "Eligible · no recent cut-off"] : ["q", "Check details"]) :
    g >= b ? ["hi", "Strong"] : g >= 0 ? ["good", "Good"] : g >= -b ? ["mid", "Borderline"] : ["low", "Low"];
  return r;
}

/* ---------------- Federal: Express Entry ---------------- */
const CATS = [
  { k: "french", n: "French-language proficiency", re: /french/i, q: (D) => !!D.fr && D.fr.min >= 7, why: "Needs NCLC 7 in all four French abilities" },
  { k: "health", n: "Healthcare and social services", re: /health/i, q: (D) => D.sum((j) => /^3[0-3]/.test(j.noc) || /^(41300|41301|42201|44101)$/.test(j.noc), 3) >= 0.5, why: "Needs 6+ months in an eligible health or social services NOC in the last 3 years" },
  { k: "trades", n: "Trades occupations", re: /trade/i, q: (D) => D.sum((j) => /^7[23]/.test(j.noc), 3) >= 0.5, why: "Needs 6+ months in an eligible trades NOC in the last 3 years" },
  { k: "stem", n: "STEM occupations", re: /stem|science, technology/i, q: (D) => D.sum((j) => /^2[12]/.test(j.noc), 3) >= 0.5, why: "Needs 6+ months in an eligible STEM NOC in the last 3 years" },
  { k: "edu", n: "Education occupations", re: /education occupations|^education/i, q: (D) => D.sum((j) => /^(41220|41221|42202|43100)$/.test(j.noc), 3) >= 0.5, why: "Needs 6+ months as a teacher, ECE or teaching assistant in the last 3 years" },
  { k: "transport", n: "Transport occupations", re: /transport/i, q: (D) => D.sum((j) => /^(726|7330|73301|7240|72604)/.test(j.noc), 3) >= 0.5, why: "Needs 6+ months in an eligible transport NOC in the last 3 years" },
  { k: "agri", n: "Agriculture and agri-food", re: /agri/i, q: (D) => D.sum((j) => /^(8|9461|9463)/.test(j.noc), 3) >= 0.5, why: "Needs 6+ months in an eligible agriculture or agri-food NOC in the last 3 years" },
  { k: "phys", n: "Physicians with Canadian work experience", re: /physician/i, q: (D) => D.sum((j) => j.cdn && /^3110[0-2]$/.test(j.noc), 3) >= 1, why: "Needs Canadian work experience as a physician (NOC 31100–31102)" },
  { k: "mgr", n: "Senior managers with Canadian work experience", re: /senior manager/i, q: (D) => D.sum((j) => j.cdn && /^0001[0-5]$/.test(j.noc), 3) >= 1, why: "Needs Canadian work experience as a senior manager (NOC 00010–00015)" },
  { k: "research", n: "Researchers with Canadian work experience", re: /research/i, q: () => null, why: "Check IRCC's researcher category rules" },
  { k: "mil", n: "Skilled military recruits", re: /military/i, q: () => null, why: "Only for people recruited by the Canadian Armed Forces" },
];
function federal(D) {
  const P = D.P, H = D.H;
  // high-wage tier of their best Canadian job (A > B > C)
  const hwPick = D.jobs.filter((j) => j.cdn && D.win(j, 10) >= 1 && X.HW[j.noc]).sort((a, b) => X.HW[a.noc][1].localeCompare(X.HW[b.noc][1]))[0];
  const mainCdn = D.mainCdnSk;
  const over = {
    rules: "new", age: P.age, marital: P.married ? "married" : "single", spAcc: P.spAcc, family: D.family,
    edu: P.edu, cdnEdu: P.cdnEdu, en: D.en, fr: D.fr,
    cdnYears: yrsSel(D.cdn10, 5), cdnTeer: String(mainCdn ? mainCdn.teer : 1), cdnRecent: D.cdn3 >= 1, forYears: yrsSel(D.for10, 6),
    hwNoc1: hwPick ? hwPick.noc : mainCdn ? mainCdn.noc : "", hwMonths: "auto",
    trade: P.tradeCert, tradeYears: yrsSel(D.sum((j) => /^7[23]/.test(j.noc), 5), 5),
    offer: P.offer.has && /^\d{5}$/.test(P.offer.noc) && +P.offer.noc[1] <= 3, offerNoc: P.offer.noc, authWork: D.authWork,
    pnp: P.nominated, sibling: D.relIn("", ["sibling"]), relative: D.relIn("", ["sibling", "parent", "child", "grand", "auntuncle", "niece"]),
    spEdu: P.sp.edu, spCdn: P.sp.cdn, spLang: D.spLang, spStudy: P.sp.study,
  };
  const R = run(X.SP["express-entry"], over, H), crs = R.total;
  const checks = R.panels[1].checks.map((c) => ({ ...c, items: c.items.slice() }));
  // proof of funds, when savings are entered
  const need = H.funds(H.FUNDS_EE, H.FUNDS_EE_ADD, D.family), exempt = over.offer && D.authWork;
  checks.forEach((c) => {
    if (c.name === "Canadian Experience Class" || exempt || P.funds == null) return;
    const ok = P.funds >= need;
    c.items = c.items.map((it) => (/Proof of funds/.test(it[1]) ? [ok, `Proof of funds: ${H.money(need)} for a family of ${D.family} (has ${H.money(P.funds)})`] : it));
    if (!ok) c.ok = false;
  });
  const ck = (n) => checks.find((c) => c.name === n);
  const why = (c) => c.items.filter(([o]) => o === false).map(([, t]) => t);
  const eeOk = checks.some((c) => c.ok);
  const G = "Federal · Express Entry", band = 25;
  const base = { group: G, score: crs, max: 1200, band, R };
  const rows = [];
  const cec = ck("Canadian Experience Class"), fsw = ck("Federal Skilled Worker Program"), fst = ck("Federal Skilled Trades Program");
  const gen = cutoff("CA", (d) => /general|no program specified|all programs/i.test(d.stream));
  rows.push(row({ ...base, name: "Canadian Experience Class", eligible: cec.ok, why: why(cec), cut: cutoff("CA", (d) => /canadian experience class/i.test(d.stream)) }));
  rows.push(row({ ...base, name: "Federal Skilled Worker Program", eligible: fsw.ok, why: why(fsw), cut: gen, notes: gen ? [] : ["No all-program draws in the last 8 months: FSW candidates are being invited through category and PNP draws."] }));
  rows.push(row({ ...base, name: "Federal Skilled Trades Program", eligible: fst.ok, why: why(fst), cut: gen || cutoff("CA", (d) => /trade/i.test(d.stream)) }));
  // category draws held in the last 8 months
  const seen = new Set();
  X.draws.filter((d) => d.jur === "CA" && d.date >= daysAgo(240)).forEach((d) => { const c = CATS.find((c) => c.re.test(d.stream)); if (c) seen.add(c.k); });
  CATS.filter((c) => seen.has(c.k)).forEach((c) => {
    const q = c.q(D), w = [];
    if (!eeOk) w.push("Must first meet CEC, FSW or FST to enter the pool");
    if (q === false) w.push(c.why);
    rows.push(row({ ...base, name: "Category: " + c.n, eligible: !eeOk || q === false ? false : q === null ? null : true, why: w, cut: cutoff("CA", (d) => c.re.test(d.stream)), force: q === null, qLabel: "Check details", notes: q === null ? [c.why] : ["Category eligibility here is read from the NOCs entered; confirm against IRCC's category NOC list."] }));
  });
  const pnpScore = crs + (P.nominated ? 0 : 600);
  rows.push(row({ ...base, name: "Provincial Nominee Program draws", sub: P.nominated ? "With their nomination" : "If they get a provincial nomination (+600)", score: pnpScore, eligible: eeOk ? (P.nominated ? true : null) : false, whatIf: !P.nominated,
    why: eeOk ? [] : ["Must first meet CEC, FSW or FST"], cut: cutoff("CA", (d) => /provincial nominee/i.test(d.stream)), qLabel: "Needs a nomination" }));
  // Atlantic Immigration Program (federal, employer-driven)
  const atl = ["NS", "NB", "PE", "NL"].map((p) => offerIn(D, p)).find((o) => o && o.here) || offerIn(D, "NS");
  if (atl) {
    const t = teerOf(atl.noc), w = [], need2 = H.funds(H.FUNDS_RURAL, H.FUNDS_RURAL_ADD, D.family);
    if (atl.here && !atl.designated) w.push("Job offer must come from an employer designated by the Atlantic province");
    if (t === 5) w.push("TEER 5 jobs don't qualify");
    if (D.all5 < 1) w.push("Needs 1 year (1,560 hours) of paid work in the last 5 years");
    if (D.bestMin < (t != null && t <= 3 ? 5 : 4)) w.push(`Needs CLB/NCLC ${t != null && t <= 3 ? 5 : 4} in all four abilities`);
    if (P.edu === "none") w.push("Needs a Canadian high school diploma or equivalent (ECA)");
    if (!D.authWork && P.funds != null && P.funds < need2) w.push(`Proof of funds: ${H.money(need2)} for a family of ${D.family}`);
    rows.push(row({ group: G.replace("Express Entry", "Other federal"), name: "Atlantic Immigration Program", sub: atl.here ? `Job offer in ${PNAME[atl.prov]}` : "With an assumed Atlantic job offer", whatIf: atl.whatIf,
      eligible: !w.length, why: w, notes: ["No points or cut-offs: the designated employer and the province endorse candidates, then they apply to IRCC."] }));
  } else rows.push(row({ group: G.replace("Express Entry", "Other federal"), name: "Atlantic Immigration Program", eligible: false, why: ["Needs a job offer from a designated employer in NS, NB, PEI or NL"] }));
  return { rows, crs, eeOk, R, checks };
}

/* ---------------- provincial nominee programs ---------------- */
const BCG = (noc) => {
  if (!/^\d{5}$/.test(noc || "")) return null;
  if (noc === "42202") return ["Care: Childcare", /Care: Childcare/i];
  if (noc === "31103" || noc === "32104") return ["Care: Veterinary care", /Veterinary/i];
  if (noc === "41220" || noc === "41221") return ["Care: Education", /Care: Education/i];
  if (/^3[0-3]/.test(noc) || noc === "41300" || noc === "41301") return ["Care: Health", /Care: Health/i];
  if (/^7001[01]|^72|^73|^22303/.test(noc)) return ["Build: Construction trades", /Build: Construction/i];
  if (+noc[1] <= 3 && /^(00|10|20|21|22)/.test(noc)) return ["Innovate: High economic impact", /Innovate: High Economic/i];
  return null;
};
const ABS = (noc) => {
  if (!/^\d{5}$/.test(noc || "")) return null;
  if (/^3[0-3]/.test(noc)) return "Health";
  if (/^(72600|72601|72404|22313)$/.test(noc)) return "Aviation";
  if (/^(2001[12]|21[1-3]\d\d|2222\d|2231\d)$/.test(noc)) return "Tech";
  if (/^(80020|82030|84120|85100|85101|85103|94141|94142)$/.test(noc)) return "Agriculture";
  if (/^7001[01]|^72|^73|^22303/.test(noc)) return "Construction";
  if (/^9(0010|2|3|4|5)/.test(noc)) return "Manufacturing";
  return null;
};
const m = (o, k, d) => (k in o ? o[k] : d);
const EDU_MAP = {
  bc: { none: "none", hs: "none", one: "dip", two: "dip", bach: "bach", twoplus: "pgcert", master: "master", phd: "phd" },
  ab: { none: "none", hs: "none", one: "dip", two: "dip", bach: "bach", twoplus: "bach", master: "master", phd: "phd" },
  sk: { none: "none", hs: "none", one: "cert", two: "dip", bach: "bach", twoplus: "bach", master: "master", phd: "master" },
  mb: { none: "none", hs: "none", one: "one", two: "two", bach: "three", twoplus: "twotwo", master: "master", phd: "master" },
  on: { none: "none", hs: "none", one: "college", two: "college", bach: "bach", twoplus: "bach", master: "master", phd: "phd" },
  nt: { none: "none", hs: "none", one: "cert", two: "dip", bach: "bach", twoplus: "bach", master: "master", phd: "master" },
  at: { none: "none", hs: "hs", one: "post", two: "post", bach: "post", twoplus: "post", master: "post", phd: "post" },
  pi: { none: "none", hs: "hs", one: "post", two: "post", bach: "bach", twoplus: "bach", master: "master", phd: "master" },
};
const eduFor = (P, k) => (P.trade && ["one", "two"].includes(P.edu) && ["ab", "sk", "nt"].includes(k) ? "trade" : P.trade && P.edu === "one" && k === "mb" ? "trade" : EDU_MAP[k][P.edu]);
const eduWhere3 = (P, prov, inP, inC, out) => (P.eduWhere === prov ? inP : P.eduWhere !== "XX" ? inC : out);
const drB = (y) => (y <= 0 ? "0" : y < 1 ? "0.5" : String(Math.min(5, Math.floor(y + 1e-9))));
const offerSub = (O) => (!O ? "No job offer" : O.here ? `Offer: NOC ${O.noc}${O.city ? ", " + O.city : ""}${O.wage ? `, $${(+O.wage).toFixed(2)}/h` : ""}` : `Assumed offer: NOC ${O.noc}${O.wage ? `, $${(+O.wage).toFixed(2)}/h` : ""}`);

function provinces(D, fed) {
  const P = D.P, H = D.H, rows = [];
  // ---- British Columbia
  { const O = offerIn(D, "BC"), noc = O ? O.noc : "";
    const R = run(X.SP["bc-sirs"], { noc, wage: O ? O.wage : 0, area: O ? (O.here ? O.bcArea : O.metro ? "1" : "3") : "1", regional: false,
      dr: drB(D.related(noc || D.mainNoc, 10)), drCdn: D.sum((j) => j.cdn && j.noc === (noc || D.mainNoc), 10) >= 1, current: !!(O && O.here && O.current),
      edu: EDU_MAP.bc[P.edu], eduWhere: eduWhere3(P, "BC", "bc", "canada", "outside"), desig: !!(O && O.here && P.licence), en: D.en, fr: D.fr }, H);
    const t = teerOf(noc), w = [];
    if (!O) w.push("Needs a full-time, indeterminate job offer from a BC employer");
    else { if (t != null && t <= 3 && D.cdn10 + D.for10 < 2) w.push("Skilled Worker needs 2 years of full-time skilled experience"); if (t != null && t >= 4) w.push("TEER 4–5 offers only fit Entry Level and Semi-Skilled (Northeast BC, tourism, food processing) or Health Authority"); }
    if (D.bestMin < 4) w.push("Needs CLB/NCLC 4+ in all four abilities");
    const g = BCG(noc || D.mainNoc);
    rows.push(row({ group: "British Columbia · BC PNP", name: "Skills Immigration (SIRS)", sub: (g ? g[0] + " · " : "") + offerSub(O), score: R.total, max: 200, band: 10, R, whatIf: !!(O && O.whatIf), eligible: !w.length, why: w,
      cut: g ? cutoff("BC", (d) => g[1].test(d.stream)) : null, noCut: g ? "Eligible · no recent draw for this group" : "Eligible · not a BC priority occupation", notes: g ? [] : ["This NOC isn't in a 2026 BC priority group (Care, Build, Innovate), so no matching draw. BC rarely runs general rounds now."] }));
    rows.push(row({ group: "British Columbia · BC PNP", name: "Express Entry BC (EEBC)", sub: "Same SIRS score; nomination adds 600 CRS", score: R.total, max: 200, band: 10, R, whatIf: !!(O && O.whatIf),
      eligible: !w.length && fed.eeOk, why: [...w, ...(fed.eeOk ? [] : ["Needs an Express Entry profile (CEC, FSW or FST eligible)"])], cut: g ? cutoff("BC", (d) => g[1].test(d.stream)) : null, noCut: g ? "Eligible · no recent draw for this group" : "Eligible · not a BC priority occupation" }));
  }
  // ---- Alberta
  { const O = offerIn(D, "AB"), noc = O ? O.noc : D.mainNoc;
    const R = run(X.SP["ab-aaip"], { edu: eduFor(P, "ab"), eduWhere: eduWhere3(P, "AB", "ab", "canada", "outside"), en: D.en, fr: D.fr,
      exp: D.all10 >= 1 ? "12" : D.all10 >= 0.5 ? "6" : "0", cdn: D.inProv("AB") >= 0.5 ? "ab" : D.sum((j) => j.cdn, 10) >= 0.5 ? "canada" : "none", age: P.age,
      family: D.relIn("AB", ["parent", "child", "sibling"]), offer: !!O, select: !!(O && O.here && O.abLoc === "rr"), loc: O ? (O.here ? O.abLoc : O.metro ? "cmA" : "other") : "cmA",
      reg: !!(O && P.licence), noc }, H);
    const t = teerOf(noc) ?? 3, need = t <= 3 ? 5 : 4, sec = ABS(noc), inAB = D.cur && D.cur.where === "AB";
    const G = "Alberta · AAIP", base = { group: G, score: R.total, max: 100, band: 5, R };
    { const w = []; const Oa = O && O.here ? O : null;
      if (!Oa) w.push("Needs a full-time Alberta job offer (actual, not assumed)"); if (!inAB || !D.authWork) w.push("Must be working in Alberta now on a valid work permit");
      if (D.related(noc, 10) < 1) w.push("Needs 12 months of experience in the occupation"); if (D.bestMin < need) w.push(`Needs CLB ${need} for a TEER ${t} job`); if (P.edu === "none") w.push("Needs high school or higher");
      rows.push(row({ ...base, name: "Alberta Opportunity Stream", sub: offerSub(Oa), eligible: !w.length, why: w, cut: cutoff("AB", (d) => /^Alberta Opportunity Stream$/i.test(d.stream)) })); }
    { const w = []; if (!fed.eeOk) w.push("Needs an Express Entry profile (CEC, FSW or FST eligible)"); if (fed.crs < 300) w.push("Needs a CRS score of 300+");
      const tie = !!(O && O.here) || inAB, re = sec && tie ? new RegExp(sec === "Tech" ? "Accelerated Tech" : "Priority Sectors \\(" + sec, "i") : null;
      const cut = (re && cutoff("AB", (d) => re.test(d.stream))) || cutoff("AB", (d) => /Priority Sectors \(General\)/i.test(d.stream));
      const loose = !tie && !D.relIn("AB", ["parent", "child", "sibling"]) && D.inProv("AB") < 0.5 && P.eduWhere !== "AB";
      rows.push(row({ ...base, name: "Alberta Express Entry" + (sec && tie ? `: ${sec}` : ": Priority Sectors (General)"), sub: "Express Entry pool, AAIP EOI score", eligible: !w.length, why: w, cut,
        notes: loose ? ["Alberta mostly invites people with an Alberta connection: work, study, a job offer or family there."] : [] })); }
    if (sec === "Health") { const w = []; if (!fed.eeOk && !(O && O.here)) w.push("Needs an Express Entry profile or an Alberta health care job offer"); if (D.bestMin < need) w.push(`Needs CLB ${need}`);
      rows.push(row({ ...base, name: "Dedicated Health Care Pathway", eligible: !w.length, why: w, cut: cutoff("AB", (d) => (fed.eeOk ? /Dedicated Health Care Pathway – Express Entry/i : /Dedicated Health Care Pathway – non-Express/i).test(d.stream)) })); }
    { const w = []; const rr = O && (O.here ? O.abLoc === "rr" : !O.metro);
      if (!rr) w.push("Needs a job offer from an employer in a designated Rural Renewal community, with a community endorsement"); if (D.bestMin < need) w.push(`Needs CLB ${need}`); if (D.related(noc, 10) < 1) w.push("Needs 12 months of related experience");
      rows.push(row({ ...base, name: "Rural Renewal Stream", sub: offerSub(rr ? O : null), whatIf: !!(rr && O.whatIf), eligible: !w.length, why: w, cut: cutoff("AB", (d) => /Rural Renewal/i.test(d.stream)) })); }
  }
  // ---- Saskatchewan
  { const O = offerIn(D, "SK"), occ = O ? O.noc : D.mainNoc;
    const base = { edu: eduFor(P, "sk"), exp5: yrsSel(D.related(occ, 5), 5), exp10: yrsSel(D.related(occ, 10) - D.related(occ, 5), 5), en: D.en, fr: D.fr, age: P.age,
      rel: D.relIn("SK", D.CLOSE), pastWork: D.inProv("SK", 5) >= 1, pastStudy: P.studyProv === "SK" };
    const subs = O ? [["offer", "International Skilled Worker: Employment Offer"]] : [];
    subs.push(["oid", "International Skilled Worker: Occupation In-Demand"], ["see", "International Skilled Worker: Saskatchewan Express Entry"]);
    subs.forEach(([sub, name]) => {
      const R = run(X.SP["sk-sinp"], { ...base, sub, offer: sub === "offer" }, H), c = R.checks[0];
      const w = c.items.filter(([o]) => o === false).map(([, t]) => t); if (sub === "see" && !fed.eeOk) w.push("Needs an Express Entry profile");
      rows.push(row({ group: "Saskatchewan · SINP", name, sub: sub === "offer" ? offerSub(O) : "No job offer needed", score: R.total, max: 110, band: 8, R, whatIf: sub === "offer" && O.whatIf, eligible: !w.length, why: w,
        cut: { score: 60, mark: true, stream: "SINP pass mark (draw scores aren't in the feed)" }, notes: sub === "oid" ? ["The occupation must be on Saskatchewan's in-demand list (not excluded) and they need settlement funds."] : [] }));
    });
  }
  // ---- Manitoba
  { const O = offerIn(D, "MB"), Oa = O && O.here ? O : null;
    const conn = [];
    if (Oa && Oa.empM >= 6 && D.cur && D.cur.where === "MB") conn.push("demand");
    if (D.relIn("MB", D.CLOSE)) conn.push("rel");
    if (D.inProv("MB", 5) >= 0.5) conn.push("work");
    if (P.studyProv === "MB") conn.push(P.cdnEdu === "long" ? "study2" : "study1");
    if (D.relIn("MB", ["friend"])) conn.push("friend");
    const risk = [];
    if (D.jobs.some((j) => j.cdn && j.where !== "MB")) risk.push("ow");
    if (P.studyProv && P.studyProv !== "MB") risk.push("os");
    const R = run(X.SP["mb-mpnp"], { en: D.en, fr: D.fr, age: P.age, exp: yrsSel(D.all5, 4), licence: !!(Oa && P.licence), edu: eduFor(P, "mb"), conn,
      outside: !!(Oa && Oa.city && !/winnipeg/i.test(Oa.city)), risk }, H);
    const G = "Manitoba · MPNP", base = { group: G, score: R.total, max: 1000, band: 50, R };
    rows.push(row({ ...base, name: "Skilled Worker in Manitoba", sub: offerSub(Oa), eligible: conn.includes("demand"), why: conn.includes("demand") ? [] : ["Needs a full-time permanent Manitoba job offer and usually 6+ months working for that employer"], cut: cutoff("MB", (d) => /Skilled Worker in Manitoba/i.test(d.stream)) }));
    const swo = ["rel", "work", "study1", "study2"].some((c) => conn.includes(c));
    rows.push(row({ ...base, name: "Skilled Worker Overseas", eligible: swo, why: swo ? [] : ["Needs a close relative in Manitoba, past Manitoba work or study, or a strategic recruitment invitation"], cut: cutoff("MB", (d) => /Overseas/i.test(d.stream)) }));
    rows.push(row({ ...base, name: "International Education Stream", eligible: P.studyProv === "MB", why: P.studyProv === "MB" ? [] : ["Needs a post-secondary program completed in Manitoba"], cut: cutoff("MB", (d) => /International Education|Career Employment|Graduate Internship/i.test(d.stream)) }));
  }
  // ---- Ontario
  { const O = offerIn(D, "ON"), Oa = O && O.here ? O : null;
    const mb = (mm) => (mm > 24 ? "25" : mm >= 13 ? "13" : mm >= 6 ? "6" : "0");
    const onM = D.inProv("ON", 10) * 12;
    const e = P.earn || 0;
    const R = run(X.SP["on-owp"], { phys: false, noc: O ? O.noc : "", wage: O ? O.wage : 0, region: O ? (O.here ? O.onRegion : O.metro ? "gta" : "east") : "gta",
      inPos: Oa && Oa.current ? mb(Oa.empM) : "0", onExp: mb(onM), earn: e >= 80000 ? "80" : e >= 70000 ? "70" : e >= 50000 ? "50" : e >= 30000 ? "30" : "0",
      status: D.authWork ? "wp" : P.status === "sp" ? "sp" : "none", edu: EDU_MAP.on[P.edu], cdnCred: String(Math.min(2, P.cdnCount)), en: D.en, fr: D.fr }, H);
    rows.push(row({ group: "Ontario · OINP", name: "Ontario Workforce Priority", sub: offerSub(O), score: R.total, max: 132, band: 6, R, whatIf: !!(O && O.whatIf), eligible: !!O, why: O ? [] : ["Needs a job offer from an Ontario employer"],
      cut: cutoff("ON", (d) => /Workforce Priority/i.test(d.stream)), notes: ["Ontario's older streams (Employer Job Offer, Master's, PhD, Express Entry) closed on June 25, 2026."] }));
  }
  // ---- Northwest Territories
  { const O = offerIn(D, "NT"), t = O ? teerOf(O.noc) : null, ry = O ? D.related(O.noc, 10) : 0;
    const R = run(X.SP["nt-ntnp"], { stream: t != null && t >= 4 ? "el" : "sw", noc: O ? O.noc : "", outside: O ? (O.here ? !!O.city && !/yellowknife/i.test(O.city) : !O.metro) : false,
      wp: !!(O && O.here && D.authWork && D.cur && D.cur.where === "NT"), nwtYrs: yrsSel(D.inProv("NT"), 3), en: D.en, fr: D.fr, age: P.age,
      exp: ry >= 5 ? "5" : ry >= 1 ? String(Math.floor(ry)) : ry >= 0.5 ? "6" : "h", edu: eduFor(P, "nt"), related: false,
      nwtEdu: P.studyProv === "NT" ? (P.cdnEdu === "long" ? "dip" : "cert") : "none", family: D.relIn("NT", ["grand", "parent", "sibling"]) }, H);
    const w = O ? R.checks[0].items.filter(([o]) => o === false).map(([, x]) => x) : ["Needs an NWT employer to nominate them (job offer)"];
    rows.push(row({ group: "Northwest Territories · NTNP", name: "Employer Driven stream (EOI)", sub: offerSub(O), score: R.total, max: 845, band: 40, R, whatIf: !!(O && O.whatIf), eligible: !w.length, why: w, cut: cutoff("NT", () => true, 400) }));
  }
  // ---- Yukon
  { const O = offerIn(D, "YT"), t = O ? teerOf(O.noc) : null, yy = D.inProv("YT");
    const R = run(X.SP["yt-ynp"], { stream: t != null && t >= 4 ? "ciw" : "sw", fullTime: !!O, median: !!O, advertised: !!O, empYear: !!O, rural: O ? (O.here ? !!O.city && !/whitehorse/i.test(O.city) : !O.metro) : false,
      fr: D.fr, health: !!(O && /^3[0-3]/.test(O.noc) && P.licence), yu: P.studyProv === "YT", yrs: yy > 4 ? "4" : yy > 3 ? "3" : yy > 2 ? "2" : yy > 1 ? "1" : "0", prior: "none", en: D.en }, H);
    const w = O ? [] : ["Needs a Yukon employer to submit an EOI for them (job offer)"];
    rows.push(row({ group: "Yukon · YNP", name: t != null && t >= 4 ? "Critical Impact Worker" : "Skilled Worker", sub: offerSub(O), score: R.total, max: 20, band: 2, R, whatIf: !!(O && O.whatIf), eligible: !w.length, why: w,
      notes: ["Yukon invites the highest-scoring employer EOIs in each intake; it doesn't publish a cut-off."] }));
  }
  // ---- Atlantic provinces (eligibility only; no points grids)
  [["ns", "NS", "Nova Scotia · NSNP"], ["nb", "NB", "New Brunswick · NBPNP"], ["pe", "PE", "Prince Edward Island · PEI PNP"], ["nl", "NL", "Newfoundland and Labrador · NLPNP"]].forEach(([k, pr, G]) => {
    const O = offerIn(D, pr), occ = O ? O.noc : D.mainNoc;
    const bocN = occ ? +occ[0] : null;
    const R = run(X.SP["elig-" + k], { age: P.age, edu: EDU_MAP.at[P.edu], en: D.en, fr: D.fr, eeProfile: fed.eeOk, offer: !!O, noc: occ, expM: Math.round(D.related(occ, 5) * 12),
      empM: O && O.here ? O.empM : 0, provM: Math.round(D.inProv(pr) * 12), wp: D.authWork,
      nsGrad: P.studyProv === "NS", constr: /^7[23]/.test(occ || ""), nbGrad: P.studyProv === "NB",
      sector: bocN === 3 ? "health" : /^(4122|4220|4310)/.test(occ || "") ? "edu" : bocN === 7 ? "constr" : /^6(2|3|5)/.test(occ || "") ? "excl" : "other", mission: false,
      inPei: D.cur && D.cur.where === "PE" && D.authWork, auth: false, pgwp: P.status === "pgwp", nlGrad: P.studyProv === "NL" }, H);
    R.checks.forEach((c) => rows.push(row({ group: G, name: c.name, sub: [c.desc, O && c.items.some(([, t]) => /job|offer|employer/i.test(t)) ? offerSub(O) : ""].filter(Boolean).join(" · "), eligible: c.ok, why: c.items.filter(([o]) => o === false).map(([, t]) => t), R: { checks: [c], notes: R.notes }, whatIf: !!(O && O.whatIf && c.items.some(([, t]) => /job|offer|employer/i.test(t))),
      qLabel: "No points grid", notes: [lastDraw(pr) ? `Latest ${PNAME[pr]} draw in the feed: ${fmtDay(lastDraw(pr).date)} (${lastDraw(pr).stream.replace(/&nbsp;?/g, "").trim()})` : `${PNAME[pr]} doesn't publish scored draws.`] })));
  });
  // ---- Québec (own grid, not scored here)
  { const streams = [...new Set(X.draws.filter((d) => d.jur === "QC").map((d) => d.stream))];
    streams.forEach((s) => { const c = cutoff("QC", (d) => d.stream === s, 400);
      rows.push(row({ group: "Québec · PSTQ (Arrima)", name: s, qLabel: "Not scored here", cut: c, notes: ["Québec ranks with its own Arrima grid (French is weighted heavily), which this scanner doesn't score. The cut-off is shown for reference.", D.fr && D.fr.min >= 7 ? "French NCLC 7+: worth a full Arrima assessment." : "Most PSTQ invitations go to candidates with intermediate or advanced French."] })); });
  }
  return rows;
}

/* ---------------- RCIP and FCIP communities ---------------- */
function pilots(D) {
  const P = D.P, H = D.H, rows = [];
  ["rcip", "fcip"].forEach((pilot) => {
    const spec = X.SP[pilot], comms = spec.sections[0].fields[0].options;
    comms.forEach(([key, label]) => {
      const name = label.replace(/,\s*[A-Z]{2}$/, ""), pr = (label.match(/([A-Z]{2})$/) || [])[1];
      const inC = D.town(key), O = offerIn(D, pr, inC);
      const occ = O ? O.noc : "", e3 = occ ? D.related(occ, 3) : 0;
      const bestRecent = D.jobs.filter((j) => D.win(j, 3) > 0).sort((a, b) => D.win(b, 3) - D.win(a, 3))[0];
      const local = D.sum((j) => j.cdn && j.where === pr && inC(j.city), 10);
      const R = run(spec, { comm: key, noc: occ, wage: O ? O.wage : "", onList: false, designated: O ? (O.here ? O.designated : true) : false, wageOk: !!O,
        exp: yrsSel(e3 >= 1 ? e3 : D.all10 > 0 ? Math.min(3, D.sum(() => true, 3)) : 0, 3), expTeer: e3 >= 1 ? "same" : bestRecent ? String(bestRecent.teer) : "same",
        rn: D.related("31301", 3) >= 1, grad: false, fr: D.fr, en: D.en, edu: EDU_MAP.pi[P.edu], intent: true,
        local: yrsSel(local, 3), ties: [...(P.rels.some((r) => r.prov === pr && inC(r.city) && r.rel !== "friend") ? ["fam"] : [])], family: D.family, wp: D.authWork }, H);
      const fed = R.panels[0].checks[0];
      const w = O ? fed.items.filter(([o]) => o === false).map(([, t]) => t) : [`Needs a job offer from a designated employer in ${name}`];
      if (O && !D.authWork && P.funds != null) { const need = H.funds(H.FUNDS_RURAL, H.FUNDS_RURAL_ADD, D.family); if (P.funds < need) w.push(`Proof of funds: ${H.money(need)} for a family of ${D.family}`); }
      if (O && R.total != null && /not .*minimum/i.test(R.verdict || "")) w.push(`Below ${name}'s pool minimum (50 points, 10 in each factor)`);
      const tag = pilot.toUpperCase();
      rows.push(row({ group: tag === "RCIP" ? "Rural Community Immigration Pilot (RCIP)" : "Francophone Community Immigration Pilot (FCIP)", name: label, sub: offerSub(O), score: R.total, max: R.total == null ? null : 125, band: 8, R,
        whatIf: !!(O && O.whatIf), eligible: !w.length, why: w, qLabel: "First come, first served",
        cut: cutoff("RCIP", (d) => new RegExp("^" + tag + " – " + name.split(" /")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(d.program || ""), 365) }));
    });
  });
  return rows;
}

/* ---------------- results ---------------- */
function detailHtml(r) {
  const R = r.R || {}, out = [];
  const bd = (rows, total, max) => rows && rows.length ? `<table class="ps-bd"><tbody>${rows.map((x) => `<tr${x[3] ? ' class="h"' : ""}><td>${x[0]}</td><td class="n">${x[1] == null ? "" : x[1]}${x[2] != null ? `<small>/${x[2]}</small>` : ""}</td></tr>`).join("")}</tbody>${total != null ? `<tfoot><tr class="h"><td>Total</td><td class="n">${total}${max ? `/${max}` : ""}</td></tr></tfoot>` : ""}</table>` : "";
  const cks = (checks) => (checks || []).map((c) => `<div class="ps-ckn">${esc(c.name)}</div><ul class="ps-ul ps-ck">${c.items.map(([ok, t]) => `<li class="${ok === true ? "y" : ok === false ? "x" : "q"}">${t}</li>`).join("")}</ul>`).join("");
  const left = [], right = [];
  if (R.rows && R.rows.length) left.push(`<h4>Points breakdown</h4>${bd(R.rows, R.total, R.max || r.max)}`);
  (R.panels || []).forEach((p) => { if (p.rows && p.rows.length) left.push(`<h4>${esc(p.title || "")}${p.total != null ? ` · ${p.total}${p.max ? "/" + p.max : ""}` : ""}</h4>${bd(p.rows)}`); if (p.checks) right.push(`<h4>${esc(p.title || "Requirements")}</h4>${cks(p.checks)}`); });
  if (R.checks && !(R.panels || []).some((p) => p.checks)) right.push(`<h4>Requirements</h4>${cks(R.checks)}`);
  if (r.why.length) right.unshift(`<h4>What's missing</h4><ul class="ps-ul">${r.why.map((x) => `<li>${x}</li>`).join("")}</ul>`);
  if (r.cut) right.push(`<h4>Cut-off used</h4><p class="ps-note">${r.cut.mark ? esc(r.cut.stream) + ": " + r.cut.score : `${esc(r.cut.stream)} · ${fmtDay(r.cut.date)} · lowest score ${r.cut.score}${r.cut.n > 1 ? ` (last ${r.cut.n} draws: ${r.cut.lo}–${r.cut.hi})` : ""}${r.cut.source ? ` · <a href="${esc(r.cut.source)}" target="_blank" rel="noopener">source</a>` : ""}`}</p>`);
  const notes = [...r.notes, ...(R.verdict ? [R.verdict] : []), ...((R.notes || []).slice(0, 4))];
  if (notes.length) right.push(`<h4>Notes</h4><ul class="ps-ul">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>`);
  out.push(`<div class="ps-dt"><div>${left.join("") || '<p class="ps-note">No points grid for this program.</p>'}</div><div>${right.join("")}</div></div>`);
  return out.join("");
}

function results(D, rows, fed) {
  const P = D.P;
  const groups = [];
  rows.forEach((r) => { let g = groups.find((x) => x.n === r.group); if (!g) groups.push((g = { n: r.group, rows: [] })); g.rows.push(r); });
  const rank = { hi: 5, good: 4, mid: 3, ok: 2, low: 1, q: 0, no: -1 };
  const tops = rows.filter((r) => !r.whatIf && ["hi", "good", "mid"].includes(r.chance[0]) && r.score != null).sort((a, b) => rank[b.chance[0]] - rank[a.chance[0]] || (b.gap ?? -1e9) / b.band - (a.gap ?? -1e9) / a.band).slice(0, 8);
  const wiTops = rows.filter((r) => r.whatIf && ["hi", "good"].includes(r.chance[0])).sort((a, b) => (b.gap ?? -1e9) / b.band - (a.gap ?? -1e9) / a.band).slice(0, 6);
  const eligN = rows.filter((r) => r.eligible === true && !r.whatIf).length;
  const fmtLang = (l, f) => (l ? `${f ? "NCLC" : "CLB"} ${l.min} <span>(L${l.L} R${l.R} W${l.W} S${l.S})</span>` : "—");
  const gapTxt = (r) => (r.gap == null ? "—" : `<span class="ps-gap ${r.gap >= 0 ? "p" : "m"}">${r.gap >= 0 ? "+" : ""}${r.gap}</span>`);
  const cutTxt = (r) => (!r.cut ? '<small>No recent scored draw</small>' : r.cut.mark ? `${r.cut.score}<small>Pass mark</small>` : `${r.cut.score}<small>${fmtDay(r.cut.date)}${r.cut.n > 1 ? ` · range ${r.cut.lo}–${r.cut.hi}` : ""}</small>`);
  let i = 0;
  const table = (g) => `<section class="ps-grp"><h3>${esc(g.n)}<small>${g.rows.filter((r) => r.eligible === true).length} of ${g.rows.length} eligible</small></h3><div style="overflow-x:auto"><table class="ps-t"><thead><tr><th>Program / stream</th><th class="n">Score</th><th class="n">Latest cut-off</th><th class="n">Gap</th><th>Chances</th></tr></thead><tbody>${g.rows.map((r) => { const id = "psd" + i++; return `<tr class="r" data-d="${id}"><td><b>${esc(r.name)}</b>${r.whatIf ? '<span class="ps-wi">What-if</span>' : ""}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}${r.why.length && r.eligible === false ? `<small style="color:#b3412e">${esc(r.why[0])}${r.why.length > 1 ? ` (+${r.why.length - 1} more)` : ""}</small>` : ""}</td><td class="n">${r.score == null ? "—" : `<b>${r.score}</b>${r.max ? `<small>of ${r.max}</small>` : ""}`}</td><td class="n">${cutTxt(r)}</td><td class="n">${gapTxt(r)}</td><td><span class="ps-ch ${r.chance[0]}">${r.chance[1]}</span></td></tr><tr class="d" id="${id}" hidden><td colspan="5">${detailHtml(r)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
  const drawsNote = X.draws.length ? `Cut-offs from the live draws feed (latest draw ${fmtDay(X.draws.map((d) => d.date).sort().pop())}).` : "The draws feed didn't load, so cut-offs are missing. Try again later.";
  return `<div class="ps-hero">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><span class="ps-note">Profile scan · ${new Date().toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span><h2>${P.ref ? esc(P.ref) : "Scan results"}</h2></div>
      <div class="ps-acts ps-noprint"><button type="button" class="ps-btn g" id="psPrint">Print / save as PDF</button><button type="button" class="ps-btn g" id="psOpenAll">Expand all</button><button type="button" class="ps-btn g" id="psEdit">Edit profile</button></div></div>
      <div class="ps-kpis">
        <div class="ps-kpi"><small>CRS (Nov 3, 2026 rules)</small><b>${fed.crs}</b><span>${fed.eeOk ? "Can enter the Express Entry pool" : "Doesn't meet CEC, FSW or FST yet"}</span></div>
        <div class="ps-kpi"><small>English</small><b>${fmtLang(D.en)}</b></div>
        <div class="ps-kpi"><small>French</small><b>${fmtLang(D.fr, true)}</b></div>
        <div class="ps-kpi"><small>Skilled experience (10 yrs)</small><b>${(+D.cdn10.toFixed(2))} <span>Canada</span></b><span>${+D.for10.toFixed(2)} years foreign</span></div>
        <div class="ps-kpi"><small>Eligible now</small><b>${eligN}</b><span>programs or streams (actual profile)</span></div>
      </div>
      <div><b style="font-size:.86rem">Best chances (actual profile)</b><div class="ps-top" style="margin-top:6px">${tops.map((r) => `<span><b>${esc(r.group.split(" · ")[0].replace("Federal", "EE"))}</b>${esc(r.name)} · <span class="ps-ch ${r.chance[0]}">${r.chance[1]}</span>${r.gap != null ? ` ${r.gap >= 0 ? "+" : ""}${r.gap}` : ""}</span>`).join("") || '<span>None yet: see what each program is missing below.</span>'}</div></div>
      ${wiTops.length ? `<div><b style="font-size:.86rem">With a job offer (what-if)</b><div class="ps-top" style="margin-top:6px">${wiTops.map((r) => `<span><b>${esc(r.group.split(" · ")[0])}</b>${esc(r.name)} · <span class="ps-ch ${r.chance[0]}">${r.chance[1]}</span> ${r.gap >= 0 ? "+" : ""}${r.gap}</span>`).join("")}</div></div>` : ""}
      <p class="ps-note">${drawsNote} Chances compare the score with the latest matching draw: <b>Strong</b> well above it, <b>Good</b> at or above, <b>Borderline</b> just below, <b>Low</b> well below. Draws move every round and many PNPs pick by occupation, so treat this as an estimate, not advice. Click any row for the points breakdown and requirements.</p>
    </div>${groups.map(table).join("")}`;
}

function scan() {
  const err = ROOT.querySelector("#psErr"); err.textContent = "";
  const P = readForm();
  if (P.age == null || P.age < 16) { err.textContent = "Enter the person's age."; return; }
  if (P.offer.has && !/^\d{5}$/.test(P.offer.noc)) { err.textContent = "Pick the job offer's NOC, or untick the job offer."; return; }
  if (P.offer.has && !P.offer.prov) { err.textContent = "Choose the job offer's province."; return; }
  if (P.jobs.some((j) => j.noc && j.where === "")) { err.textContent = "Choose the province for every Canadian job."; return; }
  if (P.jobs.some((j) => j.noc && !j.yrs)) { err.textContent = "Enter the years for every job (or remove the row)."; return; }
  if (S.jobs.some((j) => String(j.noc).trim() && !nocCode(j.noc))) { err.textContent = "One of the jobs has no valid 5-digit NOC."; return; }
  const D = derive(P);
  let html;
  try {
    const fed = federal(D);
    const rows = [...fed.rows, ...provinces(D, fed), ...pilots(D)];
    html = results(D, rows, fed);
  } catch (e) { console.error(e); err.textContent = "Something went wrong scoring this profile: " + e.message; return; }
  const out = ROOT.querySelector("#psOut");
  out.innerHTML = html;
  ROOT.querySelector("#psF").classList.add("ps-hide");
  ROOT.querySelector(".ps-priv").classList.add("ps-hide");
  out.querySelectorAll("tr.r").forEach((tr) => tr.onclick = () => { const d = out.querySelector("#" + tr.dataset.d); d.hidden = !d.hidden; });
  out.querySelector("#psOpenAll").onclick = (e) => { const open = e.target.textContent === "Expand all"; out.querySelectorAll("tr.d").forEach((d) => (d.hidden = !open)); e.target.textContent = open ? "Collapse all" : "Expand all"; };
  out.querySelector("#psEdit").onclick = () => { out.innerHTML = ""; ROOT.querySelector("#psF").classList.remove("ps-hide"); ROOT.querySelector(".ps-priv").classList.remove("ps-hide"); };
  out.querySelector("#psPrint").onclick = () => printOut(out);
  window.scrollTo({ top: out.getBoundingClientRect().top + window.scrollY - 12, behavior: "smooth" });
}

function printOut(out) {
  const w = window.open("", "_blank"); if (!w) return alert("Allow pop-ups to print.");
  const clone = out.cloneNode(true);
  clone.querySelectorAll(".ps-noprint").forEach((e) => e.remove());
  clone.querySelectorAll("tr.d").forEach((d) => d.removeAttribute("hidden"));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Profile scan${ROOT.querySelector("#ps_ref").value ? " · " + esc(ROOT.querySelector("#ps_ref").value) : ""}</title><meta name="robots" content="noindex">
    <style>:root{--bg:#f7f9f8;--surface:#fff;--fg:#1b2628;--muted:#5a696b;--line:#d3dcda;--accent:#3f7a72;--accent-soft:#dcebe7;--display:system-ui,sans-serif;--body:system-ui,sans-serif}
    body{font-family:var(--body);color:var(--fg);margin:24px;font-size:13px}${css}.ps-t tr.d td{background:#fafcfb}a{color:var(--accent)}@page{margin:14mm}</style></head>
    <body>${clone.innerHTML}<p class="ps-note" style="margin-top:16px">Prepared by WorkerPool. Estimate only, based on the information provided and published program rules and draws at the time of the scan. Not legal or immigration advice.</p></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

function example() {
  const set = (id, v) => { const e = ROOT.querySelector("#" + id); if (e.type === "checkbox") e.checked = v; else e.value = v; };
  set("ps_ref", "Example client"); set("ps_age", 29); set("ps_mar", "single"); set("ps_kids", 0); set("ps_status", "wp"); set("ps_funds", ""); set("ps_earn", 52000);
  set("ps_edu", "bach"); set("ps_eduWhere", "XX"); set("ps_cdnEdu", "short"); set("ps_studyProv", "BC"); set("ps_cdnCount", "1");
  set("ps_en_t", "ielts"); [["L", 8], ["R", 7], ["W", 7], ["S", 7]].forEach(([k, v]) => set("ps_en_" + k, v)); set("ps_fr_t", "none"); ["L", "R", "W", "S"].forEach((k) => set("ps_fr_" + k, ""));
  S.jobs = [{ noc: "62010", where: "BC", city: "Vernon", yrs: "1.5", ago: "0" }, { noc: "62010", where: "XX", city: "India", yrs: "2", ago: "2" }];
  set("ps_offer", true); set("ps_oNoc", "62010"); set("ps_oWage", "27.50"); set("ps_oProv", "BC"); set("ps_oCity", "Vernon"); set("ps_oEmp", 18); set("ps_bcArea", "3"); set("ps_oDesig", true);
  set("ps_hasRel", true); S.rels = [{ rel: "sibling", prov: "AB", city: "Edmonton" }];
  set("ps_wi", true); set("ps_wiNoc", ""); set("ps_wiWage", "26"); set("ps_wiLoc", "regional");
  drawRows(); syncUi();
}

function mount(body) {
  ROOT = document.createElement("div"); ROOT.className = "ps"; ROOT.id = "psRoot";
  ROOT.innerHTML = `<style>${css}</style>${formHtml()}`;
  body.innerHTML = ""; body.appendChild(ROOT);
  ROOT.querySelector("#psNocs").innerHTML = X.nocs.map(([c, t]) => `<option value="${c} – ${esc(t)}"></option>`).join("");
  S.jobs = [newJob(true), newJob(false)]; S.rels = [];
  drawRows(); syncUi();
  const F = ROOT.querySelector("#psF");
  F.addEventListener("input", (e) => {
    const rowEl = e.target.closest("[data-i],[data-r]");
    if (rowEl && e.target.dataset.k) {
      const arr = rowEl.dataset.i != null ? S.jobs : S.rels, idx = +(rowEl.dataset.i ?? rowEl.dataset.r);
      arr[idx][e.target.dataset.k] = e.target.value;
      if (e.target.dataset.k === "noc") { const t = e.target.parentElement.querySelector(".ps-nt"); if (t) t.textContent = nocTitle(e.target.value); }
    }
    syncUi();
  });
  F.addEventListener("change", (e) => { if (e.target.dataset.k === "noc" && nocCode(e.target.value)) { e.target.value = nocCode(e.target.value); const rowEl = e.target.closest("[data-i]"); if (rowEl) S.jobs[+rowEl.dataset.i].noc = e.target.value; } if (["ps_oNoc", "ps_wiNoc"].includes(e.target.id) && nocCode(e.target.value)) e.target.value = nocCode(e.target.value); syncUi(); });
  F.addEventListener("click", (e) => {
    const d = e.target.closest("[data-del]"), dr = e.target.closest("[data-delr]");
    if (d) { S.jobs.splice(+d.dataset.del, 1); drawRows(); }
    if (dr) { S.rels.splice(+dr.dataset.delr, 1); drawRows(); }
  });
  ROOT.querySelector("#psAddC").onclick = () => { S.jobs.push(newJob(true)); drawRows(); };
  ROOT.querySelector("#psAddF").onclick = () => { S.jobs.push(newJob(false)); drawRows(); };
  ROOT.querySelector("#psAddR").onclick = () => { S.rels.push(newRel()); drawRows(); };
  ROOT.querySelector("#psScan").onclick = scan;
  ROOT.querySelector("#psEx").onclick = example;
  ROOT.querySelector("#psClr").onclick = () => { if (confirm("Clear every answer?")) { X && mount(body); } };
}

async function load(key, body) {
  if (ROOT && body.contains(ROOT)) return; // the console refreshes tabs every minute; keep what's typed
  if (ROOT) { body.innerHTML = ""; body.appendChild(ROOT); return; } // back from another tab: same profile, same results
  body.innerHTML = `<div class="wpa-empty">Loading the program grids and latest draws…</div>`;
  try { X = await boot(); } catch (e) { body.innerHTML = `<div class="wpa-empty">The scanner couldn't load: ${esc(e.message)}. Refresh the page.</div>`; return; }
  mount(body);
}
function leave() { ROOT = null; S.jobs = []; S.rels = []; } // on lock: forget the profile
// Shared with admin → Smart Tool: the same grids, profile shape (readForm) and federal / provincial / pilot scoring.
async function engine() { if (!X) X = await boot(); return { X, derive, federal, provinces, pilots, run }; }
window.WPScan = { load, leave, engine, _test: { boot: () => boot(), derive: (P) => derive(P), federal, provinces, pilots, readForm: () => readForm(), scan: () => scan() } };
})();
