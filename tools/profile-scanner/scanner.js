/* WorkerPool Profile Scanner.
   1. The visitor adds documents. The browser turns each one into a few small JPEG page images (photo
      location data is dropped by re-drawing) and sends them to /api/tools/scan, one document per request.
   2. The server reads them with Cloudflare Workers AI in memory and returns facts; nothing is stored.
   3. The facts become an editable profile; the CRS score, strengths, weaknesses and improvement
      levers are worked out here in the browser. Nothing about the documents or results is saved.
   Reading documents needs a paid Scanner Pass ($9.99, functions/_scanpass.js). The pass key is the
   only thing kept in this browser (localStorage), so the buyer doesn't pay twice.

   Scoring matches tools/src/template.html (Pathway Check) and the Express Entry 2026 page. */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const track = (s) => { try { window.wpaSection && window.wpaSection("Scanner: " + s); } catch (e) {} };

/* ======================= RULES DATA ======================= */
// High-wage occupations (IRCC list for the November 2026 changes): A = 2× tier, B = 1.5×, C = 1.3×.
const NOC = {"00011":["Senior government managers and officials","A"],"00012":["Senior managers - financial, communications and other business services","A"],"00013":["Senior managers - health, education, social and community services and membership organizations","A"],"10010":["Financial managers","A"],"10011":["Human resources managers","A"],"10012":["Purchasing managers","A"],"10020":["Insurance, real estate and financial brokerage managers","A"],"10021":["Banking, credit and other investment managers","A"],"20010":["Engineering managers","A"],"20011":["Architecture and science managers","A"],"20012":["Computer and information systems managers","A"],"21330":["Mining engineers","A"],"21332":["Petroleum engineers","A"],"31100":["Specialists in clinical and laboratory medicine","A"],"31101":["Specialists in surgery","A"],"31102":["General practitioners and family physicians","A"],"31103":["Veterinarians","A"],"31302":["Nurse practitioners","A"],"31303":["Physician assistants, midwives and allied health professionals","A"],"40010":["Government managers - health and social policy development and program administration","A"],"40011":["Government managers - economic analysis, policy development and program administration","A"],"40012":["Government managers - education policy development and program administration","A"],"40019":["Other managers in public administration","A"],"40040":["Commissioned police officers and related occupations in public protection services","A"],"40041":["Fire chiefs and senior firefighting officers","A"],"41100":["Judges","A"],"41101":["Lawyers and Quebec notaries","A"],"41200":["University professors and lecturers","A"],"60010":["Corporate sales managers","A"],"80010":["Managers in natural resources production and fishing","A"],"90011":["Utilities managers","A"],"00014":["Senior managers - trade, broadcasting and other services","B"],"00015":["Senior managers - construction, transportation, production and utilities","B"],"10019":["Other administrative services managers","B"],"10022":["Advertising, marketing and public relations managers","B"],"10029":["Other business services managers","B"],"10030":["Telecommunication carriers managers","B"],"11103":["Securities agents, investment dealers and brokers","B"],"11201":["Professional occupations in business management consulting","B"],"21100":["Physicists and astronomers","B"],"21102":["Geoscientists and oceanographers","B"],"21103":["Meteorologists and climatologists","B"],"21109":["Other professional occupations in physical sciences","B"],"21111":["Forestry professionals","B"],"21120":["Public and environmental health and safety professionals","B"],"21202":["Urban and land use planners","B"],"21210":["Mathematicians, statisticians and actuaries","B"],"21211":["Data scientists","B"],"21220":["Cybersecurity specialists","B"],"21221":["Business systems specialists","B"],"21222":["Information systems specialists","B"],"21223":["Database analysts and data administrators","B"],"21230":["Computer systems developers and programmers","B"],"21231":["Software engineers and designers","B"],"21232":["Software developers and programmers","B"],"21300":["Civil engineers","B"],"21301":["Mechanical engineers","B"],"21310":["Electrical and electronics engineers","B"],"21311":["Computer engineers (except software engineers and designers)","B"],"21320":["Chemical engineers","B"],"21321":["Industrial and manufacturing engineers","B"],"21322":["Metallurgical and materials engineers","B"],"21331":["Geological engineers","B"],"21390":["Aerospace engineers","B"],"21399":["Other professional engineers","B"],"22231":["Engineering inspectors and regulatory officers","B"],"22312":["Industrial instrument technicians and mechanics","B"],"30010":["Managers in health care","B"],"31110":["Dentists","B"],"31112":["Audiologists and speech-language pathologists","B"],"31120":["Pharmacists","B"],"31200":["Psychologists","B"],"31202":["Physiotherapists","B"],"31203":["Occupational therapists","B"],"31300":["Nursing coordinators and supervisors","B"],"31301":["Registered nurses and registered psychiatric nurses","B"],"32111":["Dental hygienists and dental therapists","B"],"40020":["Administrators - post-secondary education and vocational training","B"],"40021":["School principals and administrators of elementary and secondary education","B"],"40030":["Managers in social, community and correctional services","B"],"40042":["Commissioned officers of the Canadian Armed Forces","B"],"41210":["College and other vocational instructors","B"],"41220":["Secondary school teachers","B"],"41221":["Elementary school and kindergarten teachers","B"],"41310":["Police investigators and other investigative occupations","B"],"41311":["Probation and parole officers","B"],"41320":["Educational counsellors","B"],"41401":["Economists and economic policy researchers and analysts","B"],"41402":["Business development officers and market researchers and analysts","B"],"41404":["Health policy researchers, consultants and program officers","B"],"41407":["Program officers unique to government","B"],"42100":["Police officers (except commissioned)","B"],"42101":["Firefighters","B"],"50010":["Library, archive, museum and art gallery managers","B"],"50011":["Managers - publishing, motion pictures, broadcasting and performing arts","B"],"51100":["Librarians","B"],"70010":["Construction managers","B"],"70012":["Facility operation and maintenance managers","B"],"70020":["Managers in transportation","B"],"70021":["Postal and courier services managers","B"],"72011":["Contractors and supervisors, electrical trades and telecommunications occupations","B"],"72012":["Contractors and supervisors, pipefitting trades","B"],"72023":["Supervisors, railway transport operations","B"],"72103":["Boilermakers","B"],"72202":["Power system electricians","B"],"72203":["Electrical power line and cable workers","B"],"72301":["Steamfitters, pipefitters and sprinkler system installers","B"],"72406":["Elevator constructors and mechanics","B"],"72600":["Air pilots, flight engineers and flying instructors","B"],"72601":["Air traffic controllers and related occupations","B"],"72604":["Railway traffic controllers and marine traffic regulators","B"],"73310":["Railway and yard locomotive engineers","B"],"82020":["Supervisors, mining and quarrying","B"],"82021":["Contractors and supervisors, oil and gas drilling and services","B"],"83101":["Oil and gas well drillers, servicers, testers and related workers","B"],"90010":["Manufacturing managers","B"],"92011":["Supervisors, petroleum, gas and chemical processing and utilities","B"],"92100":["Power engineers and power systems operators","B"],"93100":["Central control and process operators, mineral and metal processing","B"],"93101":["Central control and process operators, petroleum, gas and chemical processing","B"],"00010":["Legislators","C"],"11100":["Financial auditors and accountants","C"],"11101":["Financial and investment analysts","C"],"11102":["Financial advisors","C"],"11109":["Other financial officers","C"],"11200":["Human resources professionals","C"],"12201":["Insurance adjusters and claims examiners","C"],"12203":["Assessors, business valuators and appraisers","C"],"21101":["Chemists","C"],"21110":["Biologists and related scientists","C"],"21112":["Agricultural representatives, consultants and specialists","C"],"21200":["Architects","C"],"21201":["Landscape architects","C"],"21203":["Land surveyors","C"],"21234":["Web developers and programmers","C"],"22214":["Technical occupations in geomatics and meteorology","C"],"22232":["Occupational health and safety specialists","C"],"22233":["Construction inspectors","C"],"22310":["Electrical and electronics engineering technologists and technicians","C"],"22313":["Aircraft instrument, electrical and avionics mechanics, technicians and inspectors","C"],"31121":["Dietitians and nutritionists","C"],"32102":["Paramedical occupations","C"],"32103":["Respiratory therapists, clinical perfusionists and cardiopulmonary technologists","C"],"32120":["Medical laboratory technologists","C"],"32121":["Medical radiation technologists","C"],"32122":["Medical sonographers","C"],"41300":["Social workers","C"],"41400":["Natural and applied science policy researchers, consultants and program officers","C"],"41403":["Social policy researchers, consultants and program officers","C"],"41405":["Education policy researchers, consultants and program officers","C"],"41409":["Other professional occupations in social science","C"],"43201":["Correctional service officers","C"],"43203":["Border services, customs, and immigration officers","C"],"50012":["Recreation, sports and fitness program and service directors","C"],"51101":["Conservators and curators","C"],"51102":["Archivists","C"],"51111":["Authors and writers (except technical)","C"],"51112":["Technical writers","C"],"51120":["Producers, directors, choreographers and related occupations","C"],"52112":["Broadcast technicians","C"],"60020":["Retail and wholesale trade managers","C"],"60031":["Accommodation service managers","C"],"60040":["Managers in customer and personal services","C"],"72010":["Contractors and supervisors, machining, metal forming, shaping and erecting trades and related occupations","C"],"72013":["Contractors and supervisors, carpentry trades","C"],"72014":["Contractors and supervisors, other construction trades, installers, repairers and servicers","C"],"72020":["Contractors and supervisors, mechanic trades","C"],"72021":["Contractors and supervisors, heavy equipment operator crews","C"],"72102":["Sheet metal workers","C"],"72105":["Ironworkers","C"],"72201":["Industrial electricians","C"],"72302":["Gas fitters","C"],"72320":["Bricklayers","C"],"72321":["Insulators","C"],"72401":["Heavy-duty equipment mechanics","C"],"72403":["Railway carmen/women","C"],"72404":["Aircraft mechanics and aircraft inspectors","C"],"72500":["Crane operators","C"],"72602":["Deck officers, water transport","C"],"72603":["Engineer officers, water transport","C"],"73311":["Railway conductors and brakemen/women","C"],"82010":["Supervisors, logging and forestry","C"],"83100":["Underground production and development miners","C"],"83120":["Fishing masters and officers","C"],"92010":["Supervisors, mineral and metal processing","C"],"93102":["Pulping, papermaking and coating control operators","C"]};
const HW = { A: 20, B: 15, C: 13 };            // tier codes used by crs()
const TIER_NAME = { 20: "2× tier", 15: "1.5× tier", 13: "1.3× tier" };

const CONV = {
  ielts: { L: [8.5, 8, 7.5, 6, 5.5, 5, 4.5], R: [8, 7, 6.5, 6, 5, 4, 3.5], W: [7.5, 7, 6.5, 6, 5.5, 5, 4], S: [7.5, 7, 6.5, 6, 5.5, 5, 4] },
  pte: { L: [89, 82, 71, 60, 50, 39, 28], R: [88, 78, 69, 60, 51, 42, 33], W: [90, 88, 79, 69, 60, 51, 41], S: [89, 84, 76, 68, 59, 51, 42] },
  tef: { L: [316, 298, 280, 249, 217, 181, 145], R: [263, 248, 233, 207, 181, 151, 121], W: [393, 371, 349, 310, 271, 226, 181], S: [393, 371, 349, 310, 271, 226, 181] },
  tcf: { L: [549, 523, 503, 458, 398, 369, 331], R: [549, 524, 499, 453, 406, 375, 342], W: [16, 14, 12, 10, 7, 6, 4], S: [16, 14, 12, 10, 7, 6, 4] },
};
const TESTS = { ielts: "IELTS General Training", celpip: "CELPIP-General", pte: "PTE Core", tef: "TEF Canada", tcf: "TCF Canada", ielts_ac: "IELTS Academic (not accepted)", pte_ac: "PTE Academic (not accepted)", clb: "CLB levels" };
const FRENCH = ["tef", "tcf"];
const AB = [["L", "Listening"], ["R", "Reading"], ["W", "Writing"], ["S", "Speaking"]];
function toClb(test, ab, v) {
  if (v === "" || v == null || isNaN(+v)) return 0; v = +v;
  if (test === "clb" || test === "celpip") return Math.max(0, Math.min(12, Math.floor(v)));
  const t = CONV[test]; if (!t) return 0; const row = t[ab];
  for (let i = 0; i < row.length; i++) if (v >= row[i]) return 10 - i;
  return 0;
}
const target = (test, ab, clb) => test === "celpip" || test === "clb" ? clb : CONV[test] ? CONV[test][ab][10 - clb] : clb;

const AGE_W = [0, 90, 95, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 35, 25, 15, 5];
const AGE_WO = [0, 99, 105, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 105, 99, 94, 88, 83, 77, 72, 66, 61, 55, 50, 39, 28, 17, 6];
const EDU_W = { none: 0, hs: 28, one: 84, two: 91, bach: 112, twoplus: 119, master: 126, phd: 140 };
const EDU_WO = { none: 0, hs: 30, one: 90, two: 98, bach: 120, twoplus: 128, master: 135, phd: 150 };
const CDN_W = [0, 35, 46, 56, 63, 70], CDN_WO = [0, 40, 53, 64, 72, 80];
const SP_EDU = { none: 0, hs: 2, one: 6, two: 7, bach: 8, twoplus: 9, master: 10, phd: 10 };
const SP_CDN = [0, 5, 7, 8, 9, 10];
const EDU_LABEL = { none: "Less than high school", hs: "High school", one: "1-year post-secondary", two: "2-year post-secondary", bach: "Bachelor's or 3+ year program", twoplus: "Two or more credentials (one 3+ years)", master: "Master's or professional degree", phd: "Doctorate (PhD)" };
const EDU_ORDER = ["none", "hs", "one", "two", "bach", "twoplus", "master", "phd"];
function l1(c, sp) { if (c < 4) return 0; if (c <= 5) return 6; if (c === 6) return sp ? 8 : 9; if (c === 7) return sp ? 16 : 17; if (c === 8) return sp ? 22 : 23; if (c === 9) return sp ? 29 : 31; return sp ? 32 : 34; }
function l2(c) { if (c <= 4) return 0; if (c <= 6) return 1; if (c <= 8) return 3; return 6; }
function langPts(first, second, sp) {
  const a = first ? AB.reduce((s, [k]) => s + l1(first[k], sp), 0) : 0;
  const b = second ? Math.min(sp ? 22 : 24, AB.reduce((s, [k]) => s + l2(second[k]), 0)) : 0;
  return { first: a, second: b };
}
function crs(p) {
  const sp = p.withSpouse, f = {};
  f.age = p.age < 17 || p.age >= 45 ? 0 : (sp ? AGE_W : AGE_WO)[p.age - 17];
  f.edu = (sp ? EDU_W : EDU_WO)[p.edu] || 0;
  const o1 = langPts(p.en, p.fr, sp), o2 = langPts(p.fr, p.en, sp);
  const useFr = !!p.fr && o2.first + o2.second > o1.first + o1.second;
  const L = useFr ? o2 : o1, first = useFr ? p.fr : p.en;
  f.lang1 = L.first; f.lang2 = L.second; f.useFr = useFr;
  const cy = Math.min(p.cdnYears, 5), lenPts = (sp ? CDN_W : CDN_WO)[cy];
  f.cdn = lenPts; f.cdnMax = sp ? 70 : 80; f.cdnWhy = "work length";
  if (p.rules === "new") {
    const bonus = p.cdnYears >= 1 ? ({ 0: 0, 13: 20, 15: 40, 20: 70 }[p.hwTier] || 0) : 0;
    const offer = p.jobOffer ? ({ 0: 0, 13: 50, 15: 70, 20: 100 }[p.offerTier] || 0) : 0;
    f.cdnMax = sp ? 140 : 150; f.cdn = Math.min(f.cdnMax, Math.max(lenPts + bonus, offer));
    f.cdnWhy = offer > lenPts + bonus ? "high-wage job offer" : bonus ? "work length + high-wage" : "work length";
    f.hwBonus = bonus; f.offerPts = offer; f.lenPts = lenPts;
  }
  f.spouse = 0;
  if (sp) { const sl = p.spClb >= 9 ? 5 : p.spClb >= 7 ? 3 : p.spClb >= 5 ? 1 : 0; f.spouse = (SP_EDU[p.spEdu] || 0) + Math.min(20, sl * 4) + SP_CDN[Math.min(p.spCdn, 5)]; }
  const m = first ? first.min : 0, all7 = m >= 7, all9 = m >= 9;
  const strong = ["twoplus", "master", "phd"].includes(p.edu), postsec = ["one", "two", "bach"].includes(p.edu);
  const A = strong ? (all9 ? 50 : all7 ? 25 : 0) : postsec ? (all9 ? 25 : all7 ? 13 : 0) : 0;
  const B = strong ? (cy >= 2 ? 50 : cy >= 1 ? 25 : 0) : postsec ? (cy >= 2 ? 25 : cy >= 1 ? 13 : 0) : 0;
  const fy = p.forYears;
  const C = fy >= 3 ? (all9 ? 50 : all7 ? 25 : 0) : fy >= 1 ? (all9 ? 25 : all7 ? 13 : 0) : 0;
  const D = fy >= 3 ? (cy >= 2 ? 50 : cy >= 1 ? 25 : 0) : fy >= 1 ? (cy >= 2 ? 25 : cy >= 1 ? 13 : 0) : 0;
  const E = p.cert ? (all7 ? 50 : m >= 5 ? 25 : 0) : 0;
  f.skill = Math.min(100, Math.min(50, A + B) + Math.min(50, C + D) + Math.min(50, E));
  f.extra = []; let add = 0;
  if (p.pnp) { add += 600; f.extra.push(["Provincial nomination", 600]); }
  if (p.sibling) { add += 15; f.extra.push(["Brother or sister in Canada", 15]); }
  if (p.fr && p.fr.min >= 7) { const v = p.en && p.en.min >= 5 ? 50 : 25; add += v; f.extra.push(["French-language skills", v]); }
  if (p.cdnEdu === "short") { add += 15; f.extra.push(["Canadian education (1–2 years)", 15]); }
  if (p.cdnEdu === "long") { add += 30; f.extra.push(["Canadian education (3+ years)", 30]); }
  f.add = Math.min(600, add);
  f.total = f.age + f.edu + f.lang1 + f.lang2 + f.cdn + f.spouse + f.skill + f.add;
  f.firstMin = m;
  return f;
}
const FSW_FUNDS = [0, 15263, 19001, 23360, 28362, 32168, 36280, 40392];

/* ======================= SCANNER PASS ======================= */
const PKEY = "wp_scanner_pass";
let PASSTOK = null, PASSINFO = null, CFG = { free: false, payments: true, ai: true };
try { PASSTOK = localStorage.getItem(PKEY); } catch (e) {}
const savePass = (t) => { PASSTOK = t; try { t ? localStorage.setItem(PKEY, t) : localStorage.removeItem(PKEY); } catch (e) {} };
const unlocked = () => CFG.free || !!(PASSTOK && PASSINFO && PASSINFO.valid !== false);
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 5200); }
function pmsg(t) { const el = $("pmsg"); el.hidden = !t; el.textContent = t || ""; }
function renderPass() {
  const chip = $("passchip");
  if (CFG.free || !PASSINFO || !PASSINFO.valid) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="color:var(--good)"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M8.5 12.5l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span><b>Scanner Pass active</b> · ${PASSINFO.left} of ${PASSINFO.max} document reads left · until ${fmtDate(PASSINFO.expires)}</span>`;
}
async function checkPass() {
  if (!PASSTOK) { PASSINFO = null; return; }
  try { const j = await (await fetch("/api/scanner/status", { headers: { "x-scan-pass": PASSTOK } })).json(); PASSINFO = j && j.valid ? { valid: true, ...j } : { valid: false }; }
  catch (e) { PASSINFO = { valid: true, left: "?", max: "?", expires: new Date().toISOString() }; } // offline: let the server decide on each read
  if (PASSINFO && PASSINFO.valid === false) savePass(null);
}
async function claimFromUrl() {
  const q = new URLSearchParams(location.search); let msg = "";
  const clean = () => history.replaceState(null, "", location.pathname + "#scanner");
  if (q.get("paid")) {
    clean();
    try {
      const r = await fetch("/api/scanner/pass?session_id=" + encodeURIComponent(q.get("paid"))); const j = await r.json();
      if (j.ok) { savePass(j.token); PASSINFO = { valid: true, ...j }; msg = "Payment confirmed. Your scanner is unlocked."; track("pass claimed"); }
      else pmsg(j.error || "We couldn't confirm your payment.");
    } catch (e) { pmsg("We couldn't confirm your payment. Refresh this page to try again."); }
  } else if (q.get("pass")) {
    clean(); savePass(q.get("pass")); await checkPass();
    msg = PASSINFO && PASSINFO.valid ? "Your Scanner Pass is active." : ""; if (!msg) pmsg("That pass link has expired or isn't valid.");
  } else if (q.get("cancelled")) { clean(); pmsg("Checkout was cancelled. You haven't been charged."); await checkPass(); }
  else await checkPass();
  if (q.get("coupon") && !IN_APP) { history.replaceState(null, "", location.pathname + "#unlock"); PENDING_COUPON = q.get("coupon"); }
  if (msg) toast(msg);
}
/* ---- Google Play Billing, used instead of Stripe inside the WorkerPool Android app ---- */
const PLAY_SKU = "scanner_pass", PLAY_METHOD = "https://play.google.com/billing";
const IN_APP = (() => {
  const hit = /^android-app:\/\/ca\.workerpool\.app/.test(document.referrer) || /[?&]source=android-app/.test(location.search);
  try { if (hit) sessionStorage.setItem("wp_app", "1"); return sessionStorage.getItem("wp_app") === "1"; } catch (e) { return hit; }
})();
let PLAYSVC = null;
const setPrice = (p) => document.querySelectorAll("[data-price]").forEach((el) => el.textContent = p);
function playUnavailable() {
  document.querySelectorAll("#buy,[data-buy],#demoBuy").forEach((b) => b.disabled = true);
  pmsg("Purchases need the latest WorkerPool app and Google Chrome. Update both from Google Play, then reopen the app.");
}
async function initPlay() {
  if (!IN_APP) return;
  $("payNote").textContent = "Secure checkout by Google Play.";
  $("showCoupon").hidden = true; // coupons and the admin price apply to website checkout; the app price is set in Play Console
  $("showRestore").textContent = "Already have a pass?";
  if (!("getDigitalGoodsService" in window)) return playUnavailable();
  try { PLAYSVC = await window.getDigitalGoodsService(PLAY_METHOD); } catch (e) { PLAYSVC = null; }
  if (!PLAYSVC) return playUnavailable();
  try {
    const [d] = await PLAYSVC.getDetails([PLAY_SKU]);
    if (d && d.price) { setPrice(new Intl.NumberFormat("en-CA", { style: "currency", currency: d.price.currency }).format(+d.price.value)); $("priceCur").textContent = d.price.currency; }
  } catch (e) {}
  // Finish any purchase that was paid but not yet turned into a pass (app closed mid-way, network drop).
  try { for (const p of await PLAYSVC.listPurchases()) if (p.itemId === PLAY_SKU) await redeemPlay(p.purchaseToken, true); } catch (e) {}
}
async function redeemPlay(purchaseToken, quiet) {
  try {
    const j = await (await fetch("/api/scanner/play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purchaseToken }) })).json();
    if (j.ok) { savePass(j.token); PASSINFO = { valid: true, ...j }; toast("Purchase confirmed. Your scanner is unlocked."); track("play pass"); if (!$("unlock").hidden) show("p1"); return true; }
    if (!quiet) pmsg(j.error || "We couldn't confirm your purchase yet. Reopen the app in a minute and it will finish automatically.");
  } catch (e) { if (!quiet) pmsg("We couldn't reach WorkerPool to confirm your purchase. Reopen the app when you're online and it will finish automatically."); }
  return false;
}
async function buyPlay(btn) {
  if (!PLAYSVC) return playUnavailable();
  track("play checkout");
  let resp;
  try {
    const req = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku: PLAY_SKU } }], { total: { label: "Total", amount: { currency: "CAD", value: "0" } } });
    resp = await req.show();
  } catch (e) { if (e && e.name !== "AbortError") pmsg("The purchase didn't go through. You haven't been charged."); return; }
  btn.disabled = true;
  const ok = await redeemPlay(resp.details.purchaseToken);
  try { await resp.complete(ok ? "success" : "fail"); } catch (e) {}
  btn.disabled = false;
}
/* ---- Website price and coupons (set in the admin dashboard; not used inside the Android app) ---- */
let PRICE = null, COUPON = null, PENDING_COUPON = null;
function paintPrice() {
  if (IN_APP || !PRICE) return;
  setPrice(COUPON ? COUPON.label : PRICE);
  $("wasPrice").hidden = !COUPON; $("wasPrice").textContent = COUPON ? COUPON.was : "";
  $("cpOk").hidden = !COUPON;
  if (COUPON) $("cpOk").innerHTML = `<span>Coupon <b>${esc(COUPON.code)}</b>: ${COUPON.percent}% off</span><button type="button" id="cpRemove">Remove</button>`, $("cpRemove").onclick = () => { COUPON = null; paintPrice(); };
}
async function applyCoupon(code, quiet) {
  try {
    const j = await (await fetch("/api/scanner/coupon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })).json();
    if (j.ok) { COUPON = j; pmsg(""); $("couponForm").hidden = true; paintPrice(); track("coupon " + j.code); if (!quiet) toast(`Coupon applied: ${j.percent}% off`); return true; }
    pmsg(j.error || "That coupon code isn't valid.");
  } catch (e) { pmsg("Couldn't check that coupon. Please try again."); }
  return false;
}
async function buy(btn) {
  if (IN_APP) return buyPlay(btn);
  btn.disabled = true; const t = btn.innerHTML; btn.textContent = COUPON && COUPON.cents === 0 ? "Unlocking…" : "Opening secure checkout…"; track("checkout");
  try {
    const j = await (await fetch("/api/scanner/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coupon: COUPON ? COUPON.code : "" }) })).json();
    if (j.ok && j.free) { savePass(j.token); PASSINFO = { valid: true, ...j }; COUPON = null; toast("Coupon accepted. Your scanner is unlocked."); show("p1"); btn.disabled = false; btn.innerHTML = t; return; }
    if (j.ok && j.url) { location.href = j.url; return; }
    pmsg(j.error || "Checkout isn't available right now.");
    if (COUPON && /coupon/i.test(j.error || "")) { COUPON = null; paintPrice(); }
  } catch (e) { pmsg("Checkout isn't available right now. Please try again."); }
  btn.disabled = false; btn.innerHTML = t;
}

/* ======================= UPLOAD ======================= */
const IC = {
  passport: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
  language: '<path d="M4 6h10M9 4v2M6 6c1 4 4 7 8 8M12 6c-1 4-4 7-8 8"/><path d="M14 20l3.5-8 3.5 8M15.2 17.5h4.6"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  education: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  spouse: '<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6M14 14.5c3 0 6 1.8 6 5.5"/>',
  other: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
};
const SLOTS = [
  { k: "passport", t: "Passport", d: "The photo page. Used for your age." },
  { k: "language", t: "Language test", d: "IELTS General, CELPIP, PTE Core, TEF or TCF Canada. Add both if you have English and French." },
  { k: "work", t: "Work experience", d: "Reference letters, pay stubs, T4s, contracts, job offers." },
  { k: "education", t: "Education", d: "Degrees, diplomas, transcripts and your ECA report." },
  { k: "spouse", t: "Spouse or partner", d: "Their language test, education or Canadian work proof.", opt: true },
  { k: "other", t: "Other", d: "Provincial nomination, trade certificate, anything else.", opt: true },
];
const MAX_FILES = 16, MAX_MB = 20;
let FILES = Object.fromEntries(SLOTS.map((s) => [s.k, []]));
let AI = true;
const svgI = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

function renderSlots() {
  $("slots").innerHTML = SLOTS.map((s) => `<div class="slot${FILES[s.k].length ? " has" : ""}" data-k="${s.k}">
    <div class="slot-h"><span class="slot-ic">${svgI(s.k)}</span><div><b>${esc(s.t)}${s.opt ? '<span class="opt">Optional</span>' : ""}</b><small>${esc(s.d)}</small></div></div>
    <div class="files">${FILES[s.k].map((f, i) => `<div class="fc"><span>${esc(f.name)}</span><small>${f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + " KB" : (f.size / 1048576).toFixed(1) + " MB"}</small><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></div>`).join("")}</div>
    <label class="drop"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>${FILES[s.k].length ? "Add another" : "Add or drop files"}<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" aria-label="Add ${esc(s.t)} files"></label>
  </div>`).join("");
  document.querySelectorAll(".slot").forEach((el) => {
    const k = el.dataset.k;
    el.querySelector("input").onchange = (e) => { add(k, e.target.files); e.target.value = ""; };
    el.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { FILES[k].splice(+b.dataset.rm, 1); renderSlots(); });
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag"));
    el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("drag"); add(k, e.dataTransfer.files); });
  });
  updGo();
}
function add(k, list) {
  const total = () => Object.values(FILES).reduce((a, b) => a + b.length, 0);
  let skipped = [];
  [...list].forEach((f) => {
    if (total() >= MAX_FILES) return skipped.push(f.name + " (16 files at most)");
    if (f.size > MAX_MB * 1048576) return skipped.push(f.name + " (over 20 MB)");
    if (!/pdf|image\//.test(f.type) && !/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name)) return skipped.push(f.name + " (use PDF, JPG or PNG)");
    FILES[k].push(f);
  });
  renderSlots();
  if (skipped.length) alert("Not added: " + skipped.join(", "));
}
const nFiles = () => Object.values(FILES).reduce((a, b) => a + b.length, 0);
function updGo() {
  const has = nFiles() || $("notes").value.trim();
  $("scan").disabled = !$("agree").checked;
  $("scan").firstChild.textContent = has ? (AI ? "Scan my profile " : "Continue ") : "Enter my details by hand ";
}

/* ---- turn a file into small page images (and a text layer for PDFs) ---- */
let pdfjs = null;
function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      let n = 0; const wait = () => {
        if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(window.pdfjsLib); }
        else if (n++ < 60) setTimeout(wait, 50); else { pdfjs = null; no(new Error("pdf")); }
      }; wait();
    };
    s.onerror = () => { pdfjs = null; no(new Error("pdf")); };
    document.head.appendChild(s);
  });
  return pdfjs;
}
const toJpeg = (c, q) => c.toDataURL("image/jpeg", q);
async function prepare(file) {
  if (/pdf/.test(file.type) || /\.pdf$/i.test(file.name)) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const images = []; let text = "";
    const n = Math.min(doc.numPages, 4);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 1500 / Math.max(v1.width, v1.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      images.push(toJpeg(c, 0.8)); c.width = c.height = 0;
      try { const tc = await page.getTextContent(); text += tc.items.map((x) => x.str).join(" ") + "\n"; } catch (e) {}
    }
    try { (doc.destroy || doc.cleanup || (() => {})).call(doc); } catch (e) {}
    return { images, text: text.replace(/[ \t]+/g, " ").trim().slice(0, 12000) };
  }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) {
    bmp = await new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error("img")); }; im.src = u; });
  }
  const w = bmp.width, h = bmp.height, k = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const out = toJpeg(c, 0.85); c.width = c.height = 0;
  return { images: [out], text: "" };
}

/* ======================= SCAN ======================= */
let RESULTS = [], RECEIPT = [], NOTES = null, DEMO = false;
async function send(kind, body) {
  const r = await fetch("/api/tools/scan", { method: "POST", headers: { "content-type": "application/json", ...(PASSTOK ? { "x-scan-pass": PASSTOK } : {}) }, body: JSON.stringify({ kind, today: todayISO(), ...body }) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (j.pass && PASSINFO) { Object.assign(PASSINFO, j.pass); renderPass(); }
  return { j, stored: r.headers.get("x-stored") || "" };
}
async function runScan() {
  if (!unlocked()) { show("p1"); return; }
  track("scan started");
  RESULTS = []; RECEIPT = []; NOTES = null; DEMO = false;
  const jobs = [];
  SLOTS.forEach((s) => FILES[s.k].forEach((f) => jobs.push({ kind: s.k, file: f, name: f.name })));
  const notes = $("notes").value.trim();
  if (notes) jobs.push({ kind: "notes", name: "Your notes", text: notes });
  if (!AI || !jobs.length) { FILES = Object.fromEntries(SLOTS.map((s) => [s.k, []])); return toReview(); }
  show("pp");
  $("plist").innerHTML = jobs.map((j, i) => `<div class="pi" id="pi${i}"><span class="dot">${i + 1}</span><span class="nm">${esc(j.name)}<small>${j.kind === "notes" ? "Your written notes" : SLOTS.find((s) => s.k === j.kind).t}</small></span><span class="st">Waiting</span></div>`).join("");
  let done = 0; const set = (i, cls, txt, ic) => { const el = $("pi" + i); if (!el) return; el.querySelector(".st").className = "st " + cls; el.querySelector(".st").textContent = txt; el.firstElementChild.outerHTML = ic; };
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++, job = jobs[i];
      set(i, "run", "Preparing", '<span class="spin"></span>');
      let body;
      try { body = job.kind === "notes" ? { text: job.text } : await prepare(job.file); }
      catch (e) { console.warn("Profile Scanner: couldn't open " + job.name, e); set(i, "err", "Couldn't open", '<span class="dot err">!</span>'); RECEIPT.push({ name: job.name, at: new Date(), ok: false, stored: "none", sent: false }); job.file = null; done++; bar(done, jobs.length); continue; }
      job.file = null; // the original file is no longer needed
      set(i, "run", "Reading", '<span class="spin"></span>');
      let res;
      try { res = await send(job.kind, body); } catch (e) { res = { j: { ok: false, error: "Network error" }, stored: "" }; }
      if (body.images) body.images.length = 0; body.text = ""; body = null;
      const ok = res.j && res.j.ok;
      if (ok) {
        if (job.kind === "notes") NOTES = res.j.result; else RESULTS.push({ kind: job.kind, name: job.name, ...res.j.result });
        set(i, "ok", "Read · discarded", '<span class="dot ok">✓</span>');
      } else if (res.j && res.j.error === "ai-off") { AI = false; set(i, "err", "Reader off", '<span class="dot err">!</span>'); }
      else if (res.j && (res.j.error === "used" || res.j.error === "pass")) { set(i, "err", res.j.error === "used" ? "Pass used up" : "Pass expired", '<span class="dot err">!</span>'); if (res.j.error === "pass") { savePass(null); PASSINFO = null; } }
      else set(i, "err", "Couldn't read", '<span class="dot err">!</span>');
      RECEIPT.push({ name: job.name, at: new Date(), ok, stored: res.stored, sent: true, err: ok ? "" : (res.j && res.j.error) || "" });
      done++; bar(done, jobs.length);
    }
  };
  await Promise.all([worker(), worker()]);
  FILES = Object.fromEntries(SLOTS.map((s) => [s.k, []])); // drop every file reference
  renderSlots();
  track("scan finished");
  setTimeout(toReview, 500);
}
const bar = (d, t) => { $("pbar").style.width = Math.round(d / t * 100) + "%"; };

/* ======================= PROFILE MODEL ======================= */
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const ym = (iso) => iso && iso !== "present" ? iso.slice(0, 7) : iso === "present" ? "present" : "";
const isCanada = (s) => /canada|\b(ab|bc|on|mb|sk|qc|ns|nb|pe|nl|yt|nt|nu)\b|alberta|ontario|british columbia|manitoba|saskatchewan|quebec|québec|nova scotia|new brunswick|newfoundland|prince edward/i.test(String(s || ""));
const LEVEL = { secondary: "hs", one_year: "one", two_year: "two", bachelors: "bach", two_or_more: "twoplus", masters: "master", phd: "phd" };
const TESTMAP = { ielts_general: "ielts", ielts_academic: "ielts_ac", celpip_general: "celpip", pte_core: "pte", pte_academic: "pte_ac", tef_canada: "tef", tcf_canada: "tcf" };
function ecaLevel(s) {
  s = String(s || "").toLowerCase(); if (!s) return null;
  if (/doctor|ph\.?d/.test(s)) return "phd";
  if (/master|professional degree|\bmba\b|\bmd\b/.test(s)) return "master";
  if (/bachelor|three-year|3-year|four-year|4-year/.test(s)) return "bach";
  if (/two-year|2-year|diploma/.test(s)) return "two";
  if (/one-year|1-year|certificate/.test(s)) return "one";
  if (/secondary|high school/.test(s)) return "hs";
  return null;
}
const normEmp = (s) => String(s || "").toLowerCase().replace(/\b(ltd|limited|inc|incorporated|corp|corporation|llc|pvt|private|co|company)\b\.?/g, "").replace(/[^a-z0-9]/g, "");

let M = null;   // the profile the visitor confirms
let SRC = {};   // where each field came from

function blank() {
  return { dob: "", age: "", marital: "single", spouseAcc: "yes", spousePR: "no",
    enTest: "ielts", en: { L: "", R: "", W: "", S: "" }, enDate: "",
    frTest: "none", fr: { L: "", R: "", W: "", S: "" }, frDate: "",
    edu: "bach", eduWhere: "foreign", eca: "yes", cdnEdu: "none", creds: [],
    jobs: [], offer: "no", offerNoc: "", pnp: "no", sibling: "no", cert: "no",
    spEdu: "bach", spClb: "", spCdn: "0", family: "", funds: "", rules: "new" };
}

function build() {
  const m = blank(); SRC = {}; const issues = [];
  const by = (pred) => RESULTS.filter(pred);
  const mine = (r) => r.person !== "spouse" && r.kind !== "spouse";
  const theirs = (r) => r.person === "spouse" || r.kind === "spouse";
  RESULTS.forEach((r) => (r.issues || []).forEach((t) => issues.push([r.name, t])));
  // passport → age
  const pp = by((r) => r.passport && r.passport.date_of_birth && mine(r))[0];
  if (pp) { m.dob = pp.passport.date_of_birth; SRC.dob = pp.name;
    if (pp.passport.expiry_date && pp.passport.expiry_date < todayISO()) issues.push([pp.name, "This passport has expired. You'll need a valid passport for your Express Entry profile."]); }
  // language
  const langs = by((r) => r.language && r.language.test);
  const asTest = (r) => { const t = TESTMAP[r.language.test] || "ielts"; const l = r.language; return { t, s: { L: l.listening ?? "", R: l.reading ?? "", W: l.writing ?? "", S: l.speaking ?? "" }, date: l.test_date || "", name: r.name }; };
  const minClb = (x) => Math.min(...AB.map(([a]) => toClb(x.t.replace("_ac", ""), a, x.s[a])));
  const myL = langs.filter(mine).map(asTest), spL = langs.filter(theirs).map(asTest);
  const best = (arr) => arr.sort((a, b) => minClb(b) - minClb(a))[0];
  const enT = best(myL.filter((x) => !FRENCH.includes(x.t))), frT = best(myL.filter((x) => FRENCH.includes(x.t)));
  if (enT) { m.enTest = enT.t; m.en = enT.s; m.enDate = enT.date; SRC.en = enT.name; }
  if (frT) { m.frTest = frT.t; m.fr = frT.s; m.frDate = frT.date; SRC.fr = frT.name; }
  const spT = best(spL);
  if (spT) { m.spClb = String(minClb(spT)); SRC.spClb = spT.name; }
  // education
  const eds = by((r) => r.education);
  const myE = eds.filter(mine), spE = eds.filter(theirs);
  const pick = (arr) => {
    const eca = arr.find((r) => r.education.is_eca && ecaLevel(r.education.eca_equivalent || r.education.credential));
    const creds = arr.filter((r) => !r.education.is_eca && LEVEL[r.education.level]);
    let lvl = creds.reduce((a, r) => EDU_ORDER.indexOf(LEVEL[r.education.level]) > EDU_ORDER.indexOf(a) ? LEVEL[r.education.level] : a, "none");
    const postsec = creds.filter((r) => !["secondary", "other"].includes(r.education.level));
    if (postsec.length >= 2 && ["one", "two", "bach"].includes(lvl) && postsec.some((r) => (r.education.length_years || 0) >= 3 || r.education.level === "bachelors")) lvl = "twoplus";
    if (eca) { const e = ecaLevel(eca.education.eca_equivalent || eca.education.credential); if (EDU_ORDER.indexOf(e) > EDU_ORDER.indexOf(lvl) || lvl === "none") lvl = e; }
    return { lvl, eca, creds };
  };
  if (myE.length) {
    const p = pick(myE); m.edu = p.lvl; SRC.edu = (p.eca || p.creds[0] || myE[0]).name; m.creds = p.creds.map((r) => r.education.credential).filter(Boolean);
    const cdn = p.creds.filter((r) => isCanada(r.education.country) || isCanada(r.education.institution));
    const foreign = p.creds.length > cdn.length;
    m.eduWhere = foreign ? "foreign" : "canada"; SRC.eduWhere = SRC.edu;
    m.eca = p.eca ? "yes" : foreign ? "no" : "yes"; SRC.eca = p.eca ? p.eca.name : "assumed";
    const cdnPost = cdn.filter((r) => !["secondary", "other"].includes(r.education.level));
    if (cdnPost.length) { const yrs = Math.max(...cdnPost.map((r) => r.education.length_years || (r.education.level === "bachelors" ? 4 : r.education.level === "two_year" ? 2 : 1))); m.cdnEdu = yrs >= 3 ? "long" : "short"; SRC.cdnEdu = cdnPost[0].name; }
  }
  if (spE.length) { m.spEdu = pick(spE).lvl; SRC.spEdu = spE[0].name; }
  // work
  const works = by((r) => r.work);
  const addJob = (r, who) => {
    const w = r.work; const key = normEmp(w.employer);
    const list = who === "sp" ? (m._spJobs = m._spJobs || []) : m.jobs;
    let j = key && list.find((x) => normEmp(x.employer) === key);
    const s = ym(w.start_date), e = ym(w.end_date);
    if (!j) { j = { employer: w.employer || "", country: isCanada(w.country) || isCanada(w.employer) ? "canada" : w.country ? "foreign" : "canada", noc: w.noc_code || "", title: w.job_title || w.noc_title || "", start: s, end: e, hours: w.hours_per_week || "", src: r.name, letter: r.doc_type === "work_letter" }; list.push(j); }
    else { if (s && (!j.start || s < j.start)) j.start = s; if (e === "present" || (e && j.end !== "present" && (!j.end || e > j.end))) j.end = e; if (w.hours_per_week && !j.hours) j.hours = w.hours_per_week; if (!j.noc && w.noc_code) j.noc = w.noc_code; j.src += ", " + r.name; if (r.doc_type === "work_letter") j.letter = true; }
    if (r.doc_type === "work_letter") { const miss = [!w.hours_per_week && "hours a week", !w.pay && "pay", !w.duties_summary && "duties", !w.start_date && "start date"].filter(Boolean); if (miss.length) issues.push([r.name, `IRCC reference letters must show ${miss.join(", ")}. We couldn't find ${miss.length > 1 ? "these" : "this"} in the letter.`]); }
  };
  works.forEach((r) => {
    if (r.work.is_job_offer || r.doc_type === "job_offer") { if (mine(r)) { m.offer = "yes"; m.offerNoc = r.work.noc_code || ""; SRC.offer = r.name; } return; }
    addJob(r, theirs(r) ? "sp" : "me");
  });
  m.jobs.forEach((j) => {
    if (!j.start) issues.push([j.src, `We couldn't find when the job at ${j.employer || "this employer"} started. Add the dates below so it counts.`]);
    else if (!j.end) { j.end = "present"; issues.push([j.src, `No end date for ${j.employer || "this job"}, so we've assumed you still work there. Change it below if not.`]); }
  });
  if (m._spJobs) { const y = years(m._spJobs).cdn; m.spCdn = String(Math.min(5, Math.floor(y))); SRC.spCdn = m._spJobs[0].src; delete m._spJobs; }
  // other documents
  by((r) => r.other && r.other.provincial_nomination || r.doc_type === "nomination").forEach((r) => { m.pnp = "yes"; SRC.pnp = r.name; });
  if (by((r) => r.education && /certificate of qualification|red seal|journeyperson/i.test(r.education.credential || "")).length) { m.cert = "yes"; SRC.cert = "your documents"; }
  // notes fill in the rest (documents win where both exist)
  const f = NOTES && NOTES.facts;
  if (f) {
    const N = "your notes", setIf = (k, v) => { if (v != null && v !== "" && !SRC[k]) { m[k] = v; SRC[k] = N; } };
    if (f.age && !m.dob) { m.age = String(Math.round(f.age)); SRC.age = N; }
    if (f.marital_status) { m.marital = f.marital_status; SRC.marital = N; }
    if (f.spouse_accompanying != null) { m.spouseAcc = f.spouse_accompanying ? "yes" : "no"; SRC.spouseAcc = N; }
    if (f.spouse_is_canadian_or_pr != null) { m.spousePR = f.spouse_is_canadian_or_pr ? "yes" : "no"; SRC.spousePR = N; }
    setIf("spEdu", f.spouse_education && LEVEL[f.spouse_education]);
    setIf("spClb", f.spouse_language_clb != null ? String(f.spouse_language_clb) : null);
    setIf("spCdn", f.spouse_canadian_work_years != null ? String(Math.min(5, Math.floor(f.spouse_canadian_work_years))) : null);
    if (f.job_offer) { m.offer = "yes"; SRC.offer = SRC.offer || N; if (f.job_offer_noc && !m.offerNoc) m.offerNoc = f.job_offer_noc; }
    if (f.provincial_nomination) { m.pnp = "yes"; SRC.pnp = SRC.pnp || N; }
    if (f.sibling_in_canada != null) { m.sibling = f.sibling_in_canada ? "yes" : "no"; SRC.sibling = N; }
    if (f.canadian_study && !SRC.cdnEdu) { m.cdnEdu = { none: "none", one_or_two_years: "short", three_plus_years: "long" }[f.canadian_study]; SRC.cdnEdu = N; }
    if (f.trade_certificate) { m.cert = "yes"; SRC.cert = SRC.cert || N; }
    if (f.french_clb && m.frTest === "none") { m.frTest = "clb"; const v = String(f.french_clb); m.fr = { L: v, R: v, W: v, S: v }; SRC.fr = N; }
    if (f.family_size) { m.family = String(f.family_size); SRC.family = N; }
    if (f.funds_cad) { m.funds = String(f.funds_cad); SRC.funds = N; }
    const yAgo = (y) => { const d = new Date(); d.setMonth(d.getMonth() - Math.round(y * 12)); return d.toISOString().slice(0, 7); };
    if (!m.jobs.some((j) => j.country === "canada") && f.canadian_work_years) m.jobs.push({ employer: "From your notes", country: "canada", noc: f.noc_code || "", title: f.occupation || "", start: yAgo(f.canadian_work_years), end: "present", hours: "", src: N });
    if (!m.jobs.some((j) => j.country === "foreign") && f.foreign_work_years) {
      const cs = m.jobs.filter((j) => j.country === "canada" && j.start).map((j) => j.start).sort()[0]; // foreign work ends where Canadian work starts
      const end = cs || yAgo(f.canadian_work_years || 0), e = new Date(end + "-15"); e.setMonth(e.getMonth() - Math.round(f.foreign_work_years * 12));
      m.jobs.push({ employer: "From your notes", country: "foreign", noc: f.noc_code || "", title: f.occupation || "", start: e.toISOString().slice(0, 7), end, hours: "", src: N });
    }
    (NOTES.issues || []).forEach((t) => issues.push(["Your notes", t]));
  }
  if (!m.dob && !m.age) { m.age = ""; }
  M = m; M._issues = issues;
}

/* months of work by place, TEER and high-wage tier, over the last 10 years */
function monthIdx(s) { if (!s) return null; if (s === "present") { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); } const x = s.match(/^(\d{4})-(\d{2})/); return x ? +x[1] * 12 + +x[2] - 1 : null; }
const teerOf = (c) => /^\d{5}$/.test(c || "") ? +c[1] : null;
function years(jobs) {
  const now = monthIdx("present"), from = now - 120;
  const cdn = {}, cdnRecent = {}, fo = {}, tier = { A: {}, B: {}, C: {} };
  let skipped = 0, longest = 0, unknownNoc = 0, bestTeer = 9, trade = 0;
  jobs.forEach((j) => {
    let s = monthIdx(j.start), e = monthIdx(j.end || (j.start ? "present" : ""));
    if (s == null || e == null || e < s) return;
    const t = teerOf(j.noc);
    if (t != null && t >= 4) { skipped++; return; }
    if (t == null) unknownNoc++; else bestTeer = Math.min(bestTeer, t);
    const fte = Math.min(1, (+j.hours || 30) / 30);
    if (+j.hours >= 30 || !j.hours) longest = Math.max(longest, Math.min(e, now) - Math.max(s, from) + 1);
    const lvl = NOC[j.noc] && NOC[j.noc][1];
    if (/^7[23]|^8[23]|^9[23]/.test(j.noc || "") && t != null && t <= 3) trade = Math.max(trade, Math.min(e, now) - Math.max(s, now - 60) + 1);
    for (let mth = Math.max(s, from); mth <= Math.min(e, now); mth++) {
      const bucket = j.country === "canada" ? cdn : fo;
      bucket[mth] = Math.min(1, (bucket[mth] || 0) + fte);
      if (j.country === "canada" && mth > now - 36) cdnRecent[mth] = Math.min(1, (cdnRecent[mth] || 0) + fte);
      if (j.country === "canada" && lvl) tier[lvl][mth] = Math.min(1, (tier[lvl][mth] || 0) + fte);
    }
  });
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const cm = sum(cdn), fm = sum(fo), rm = sum(cdnRecent), a = sum(tier.A), b = sum(tier.B), c = sum(tier.C);
  const hw = a >= 12 ? 20 : a + b >= 12 ? 15 : a + b + c >= 12 ? 13 : 0;
  return { cdn: cm / 12, foreign: fm / 12, recent: rm / 12, hw, skipped, longest, unknownNoc, bestTeer, trade: trade / 12, tierMonths: { A: a, B: b, C: c } };
}

function ageOf(m) {
  if (m.dob) { const d = new Date(m.dob + "T12:00:00"), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; }
  return parseInt(m.age) || 0;
}
function clbOf(test, s) { if (!test || test === "none") return null; const t = test.replace("_ac", ""); const o = {}; AB.forEach(([a]) => o[a] = toClb(t, a, s[a])); o.min = Math.min(o.L, o.R, o.W, o.S); return (o.L || o.R || o.W || o.S) ? o : null; }
function toP(m, over) {
  m = Object.assign({}, m, over || {});
  const y = years(m.jobs);
  const enValid = m.enTest && !/_ac$/.test(m.enTest);
  const en = enValid ? clbOf(m.enTest, m.en) : null;
  const fr = m.frTest !== "none" && !/_ac$/.test(m.frTest) ? clbOf(m.frTest, m.fr) : null;
  const married = m.marital === "married" || m.marital === "common_law";
  const offerLvl = NOC[m.offerNoc] && NOC[m.offerNoc][1];
  return {
    age: ageOf(m), withSpouse: married && m.spouseAcc === "yes" && m.spousePR !== "yes",
    edu: m.eduWhere === "foreign" && m.eca !== "yes" ? "none" : m.edu, eduRaw: m.edu,
    en: (over && over._en) || en, fr: (over && over._fr !== undefined) ? over._fr : fr,
    cdnYears: Math.min(5, Math.floor(over && over._cdn != null ? over._cdn : y.cdn + 1e-9)), forYears: Math.floor(y.foreign + 1e-9),
    hwTier: over && over._hw != null ? over._hw : y.hw, jobOffer: m.offer === "yes" || !!(over && over._offer), offerTier: over && over._offer ? over._offer : (offerLvl ? HW[offerLvl] : 0),
    pnp: m.pnp === "yes", sibling: m.sibling === "yes", cert: m.cert === "yes", cdnEdu: m.cdnEdu,
    spEdu: m.spEdu, spClb: +m.spClb || 0, spCdn: +m.spCdn || 0, rules: m.rules, y };
}

/* ======================= REVIEW UI ======================= */
const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
const srcTag = (k) => SRC[k] ? `<span class="src${SRC[k] === "assumed" ? " as" : ""}" title="${esc(SRC[k])}">${SRC[k] === "assumed" ? "assumed" : "from " + esc(SRC[k])}</span>` : "";
const fld = (k, label, html) => `<label class="f"><span>${label}${srcTag(k)}</span>${html}</label>`;
const sel = (k, opts) => `<select data-k="${k}">${opts.map(([v, l]) => opt(v, l, M[k])).join("")}</select>`;
const inp = (k, type, attrs = "") => `<input data-k="${k}" type="${type}" value="${esc(M[k])}" ${attrs}>`;
const TESTOPTS = [["ielts", "IELTS General Training"], ["celpip", "CELPIP-General"], ["pte", "PTE Core"], ["ielts_ac", "IELTS Academic (not accepted)"], ["pte_ac", "PTE Academic (not accepted)"], ["clb", "I know my CLB levels"]];
const FRTESTOPTS = [["none", "No French test"], ["tef", "TEF Canada"], ["tcf", "TCF Canada"], ["clb", "I know my NCLC levels"]];
const EDUOPTS = EDU_ORDER.map((k) => [k, EDU_LABEL[k]]);

function renderReview() {
  const married = M.marital === "married" || M.marital === "common_law";
  const scoreRow = (kind) => {
    const test = kind === "en" ? M.enTest : M.frTest, s = M[kind];
    if (kind === "fr" && test === "none") return "";
    const c = clbOf(test, s);
    return `<div class="fg f4">${AB.map(([a, l]) => `<label class="f"><span>${l}</span><input data-sc="${kind}.${a}" inputmode="decimal" value="${esc(s[a])}" placeholder="${test === "ielts" || test === "ielts_ac" ? "0–9" : test === "celpip" || test === "clb" ? "1–12" : test === "pte" || test === "pte_ac" ? "10–90" : ""}"></label>`).join("")}</div>
      <p class="clbline">${c ? `${kind === "en" ? "CLB" : "NCLC"}: L <b>${c.L}</b> · R <b>${c.R}</b> · W <b>${c.W}</b> · S <b>${c.S}</b>` : "Enter your scores to see your CLB levels."}${/_ac$/.test(test) ? ` · <b style="color:var(--bad)">Academic tests aren't accepted for Express Entry.</b>` : ""}</p>`;
  };
  const age = ageOf(M);
  $("rv").innerHTML = `
  <div class="grp"><h3>${svgI("passport", 18)} You</h3>
    <div class="fg">
      ${fld("dob", "Date of birth", inp("dob", "date", 'max="' + todayISO() + '"'))}
      ${fld("age", "Age", `<input data-k="age" type="number" min="15" max="80" value="${esc(M.dob ? age : M.age)}"${M.dob ? " readonly title=\"Worked out from your date of birth\"" : ""}>`)}
      ${fld("marital", "Marital status", sel("marital", [["single", "Single"], ["married", "Married"], ["common_law", "Common-law"], ["separated", "Separated"], ["divorced", "Divorced"], ["widowed", "Widowed"]]))}
      ${married ? fld("spouseAcc", "Partner coming to Canada with you?", sel("spouseAcc", [["yes", "Yes"], ["no", "No"]])) : ""}
      ${married ? fld("spousePR", "Partner is a Canadian citizen or PR?", sel("spousePR", [["no", "No"], ["yes", "Yes"]])) : ""}
      ${fld("sibling", "Brother or sister in Canada (citizen or PR)?", sel("sibling", [["no", "No"], ["yes", "Yes"]]))}
    </div></div>
  <div class="grp"><h3>${svgI("language", 18)} Language</h3>
    ${fld("en", "English test", sel("enTest", TESTOPTS))}
    ${scoreRow("en")}
    ${fld("enDate", "Test date", inp("enDate", "date", 'max="' + todayISO() + '"'))}
    ${fld("fr", "French test", sel("frTest", FRTESTOPTS))}
    ${scoreRow("fr")}
  </div>
  <div class="grp"><h3>${svgI("education", 18)} Education</h3>
    <div class="fg">
      ${fld("edu", "Highest education", sel("edu", EDUOPTS))}
      ${fld("eduWhere", "Where you studied", sel("eduWhere", [["foreign", "Outside Canada"], ["canada", "In Canada"]]))}
      ${M.eduWhere === "foreign" ? fld("eca", "Educational Credential Assessment (ECA)", sel("eca", [["yes", "I have one or will get one"], ["no", "No ECA"]])) : ""}
      ${fld("cdnEdu", "Study in Canada", sel("cdnEdu", [["none", "None"], ["short", "1 or 2-year credential"], ["long", "3+ year credential"]]))}
      ${fld("cert", "Canadian trade certificate", sel("cert", [["no", "No"], ["yes", "Yes"]]))}
    </div>
    ${M.creds.length ? `<p class="hint">Found: ${esc(M.creds.join(" · "))}</p>` : ""}
  </div>
  <div class="grp"><h3>${svgI("other", 18)} Job offer and nomination</h3>
    <div class="fg">
      ${fld("offer", "Job offer in Canada", sel("offer", [["no", "No"], ["yes", "Yes"]]))}
      ${M.offer === "yes" ? fld("offerNoc", "Job offer NOC (5 digits)", inp("offerNoc", "text", 'inputmode="numeric" maxlength="5" placeholder="e.g. 21232"') ) : ""}
      ${fld("pnp", "Provincial nomination", sel("pnp", [["no", "No"], ["yes", "Yes"]]))}
    </div>
    ${M.offer === "yes" ? `<p class="hint">${nocLine(M.offerNoc, true)}</p>` : ""}
  </div>
  <div class="grp wide"><h3>${svgI("work", 18)} Work experience <span class="hint" style="font-weight:400;margin-left:auto">Last 10 years · skilled jobs (TEER 0–3) count</span></h3>
    <div class="jobs" id="jobs">${M.jobs.map(jobRow).join("") || '<p class="hint">No work found yet. Add each job below.</p>'}</div>
    <div><button class="btn ghost sm" type="button" id="addJob">+ Add a job</button></div>
    <p class="clbline" id="ysum"></p>
  </div>
  ${married && M.spouseAcc === "yes" && M.spousePR !== "yes" ? `<div class="grp wide"><h3>${svgI("spouse", 18)} Your partner</h3><div class="fg">
      ${fld("spEdu", "Partner's education", sel("spEdu", EDUOPTS))}
      ${fld("spClb", "Partner's lowest CLB (English or French)", sel("spClb", [["", "No test"], ...[4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), "CLB " + n + (n === 10 ? "+" : "")])]))}
      ${fld("spCdn", "Partner's skilled work in Canada", sel("spCdn", [["0", "None or under 1 year"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years"], ["4", "4 years"], ["5", "5+ years"]]))}
    </div></div>` : ""}`;
  $("issues").innerHTML = (M._issues || []).slice(0, 8).map(([n, t]) => `<div class="iss"><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join("");
  bindReview();
  liveScore();
}
function nocLine(c, offer) {
  if (!c) return offer ? "Add the NOC to see if the job offer earns points." : "";
  if (!/^\d{5}$/.test(c)) return "Use the 5-digit NOC 2021 code.";
  const h = NOC[c], t = +c[1];
  if (h) return `<b>${esc(h[0])}</b> · TEER ${t} · high-wage ${TIER_NAME[HW[h[1]]]}`;
  return `TEER ${t}${t >= 4 ? " · doesn't count for Express Entry" : ""} · not on the high-wage list${offer ? " (no job offer points from November 3, 2026)" : ""}`;
}
function jobRow(j, i) {
  return `<div class="job" data-j="${i}">
    <label class="f c3 wide"><span>Employer${j.src ? `<span class="src" title="${esc(j.src)}">from ${esc(j.src)}</span>` : ""}</span><input data-jk="employer" value="${esc(j.employer)}" placeholder="Employer name"></label>
    <label class="f c1"><span>Where</span><select data-jk="country">${opt("canada", "Canada", j.country)}${opt("foreign", "Outside Canada", j.country)}</select></label>
    <label class="f c1"><span>NOC</span><input data-jk="noc" value="${esc(j.noc)}" inputmode="numeric" maxlength="5" placeholder="5 digits"></label>
    <label class="f c1"><span>Hours/week</span><input data-jk="hours" type="number" min="1" max="80" value="${esc(j.hours)}" placeholder="40"></label>
    <label class="f c2"><span>Started</span><input data-jk="start" type="month" value="${esc(j.start)}" placeholder="YYYY-MM"></label>
    <label class="f c2"><span>Ended</span>${j.end === "present" ? '<input type="text" value="Present" readonly>' : `<input data-jk="end" type="month" value="${esc(j.end)}" placeholder="YYYY-MM">`}</label>
    <label class="f c1"><span>Still working?</span><select data-jk="now">${opt("no", "No", j.end === "present" ? "yes" : "no")}${opt("yes", "Yes", j.end === "present" ? "yes" : "no")}</select></label>
    <button class="rm c1" type="button" data-rmj="${i}" aria-label="Remove this job">Remove</button>
    <p class="jm">${j.title ? esc(j.title) + " · " : ""}${nocLine(j.noc) || "Add the NOC code. <a href=\"/tools/noc/\" target=\"_blank\">Find your NOC</a>"}</p>
  </div>`;
}
function bindReview() {
  $("rv").querySelectorAll("[data-k]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
    M[el.dataset.k] = el.value; if (SRC[el.dataset.k] === "assumed") delete SRC[el.dataset.k];
    if (el.tagName === "SELECT" || el.dataset.k === "dob") renderReview(); else liveScore();
  }));
  $("rv").querySelectorAll("[data-sc]").forEach((el) => el.addEventListener("input", () => { const [k, a] = el.dataset.sc.split("."); M[k][a] = el.value.trim(); const p = el.closest(".grp"); liveScore(); const line = el.closest(".fg").nextElementSibling; const c = clbOf(k === "en" ? M.enTest : M.frTest, M[k]); if (line && c) line.innerHTML = `${k === "en" ? "CLB" : "NCLC"}: L <b>${c.L}</b> · R <b>${c.R}</b> · W <b>${c.W}</b> · S <b>${c.S}</b>`; void p; }));
  $("rv").querySelectorAll(".job").forEach((row) => {
    const j = M.jobs[+row.dataset.j];
    row.querySelectorAll("[data-jk]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      const k = el.dataset.jk;
      if (k === "now") { j.end = el.value === "yes" ? "present" : ""; renderReview(); return; }
      j[k] = el.value.trim();
      if (k === "noc") row.querySelector(".jm").innerHTML = (j.title ? esc(j.title) + " · " : "") + (nocLine(j.noc) || "");
      if (k === "country") renderReview(); else liveScore();
    }));
  });
  $("rv").querySelectorAll("[data-rmj]").forEach((b) => b.onclick = () => { M.jobs.splice(+b.dataset.rmj, 1); renderReview(); });
  $("addJob").onclick = () => { M.jobs.push({ employer: "", country: "canada", noc: "", title: "", start: "", end: "", hours: "" }); renderReview(); };
}
function liveScore() {
  const p = toP(M), y = p.y, c = crs(p);
  const ys = $("ysum");
  if (ys) ys.innerHTML = `Counts as <b>${y.cdn.toFixed(1)}</b> years in Canada and <b>${y.foreign.toFixed(1)}</b> years outside Canada (full-time equivalent)${y.skipped ? ` · ${y.skipped} TEER 4–5 job${y.skipped > 1 ? "s" : ""} not counted` : ""}${y.hw ? ` · high-wage ${TIER_NAME[y.hw]}` : ""}`;
  ["toScore"].forEach((id) => { $(id).firstChild.textContent = `See my score (${c.total}) `; });
}

/* ======================= RESULTS ======================= */
let DRAWS = null;
function loadDraws() { if (!DRAWS) DRAWS = fetch("/api/draws?days=200").then((r) => r.json()).then((j) => (j.draws || []).filter((d) => d.jur === "CA" && d.score != null)).catch(() => []); return DRAWS; }
const cleanStream = (t) => String(t).replace(/,?\s*\d{4}\s*-\s*Version\s*\d+/i, "").replace(/\s*\(Version \d+\)/i, "").replace(/ with Canadian Work Experience/i, "").replace(/ occupations?$/i, "").trim();
const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });

async function renderResults() {
  const p = toP(M), c = crs(p), y = p.y, sp = p.withSpouse;
  const pOther = toP(M, { rules: M.rules === "new" ? "old" : "new" }), cOther = crs(pOther);
  // ring
  const pct = Math.min(1, c.total / 1200), R = 92, C = 2 * Math.PI * R;
  const col = c.total >= 500 ? "var(--good)" : c.total >= 420 ? "var(--accent)" : "var(--warn)";
  $("ring").innerHTML = `<svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="${R}" fill="none" stroke="var(--band)" stroke-width="16"/><circle id="arc" cx="110" cy="110" r="${R}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)"/></svg><div class="num"><b id="big">0</b><small>CRS points</small></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => { const a = $("arc"); if (a) a.style.strokeDashoffset = C * (1 - Math.max(0.02, pct)); }));
  countUp($("big"), c.total);
  const draws = await loadDraws();
  const latest = (re) => draws.filter((d) => re.test(d.stream)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const cec = latest(/canadian experience/i), gen = latest(/general|no program specified|all programs/i), pnpD = latest(/provincial nominee/i), frD = latest(/french/i);
  const cats = categories(p);
  const catD = cats.map((k) => latest(CAT_RE[k])).filter(Boolean);
  const cutList = [cec && { n: "Canadian Experience Class", d: cec }, gen && { n: "All programs", d: gen }, frD && cats.includes("French") && { n: "French-language", d: frD }, ...catD.filter((d) => d !== frD).map((d) => ({ n: cleanStream(d.stream), d })), pnpD && { n: "Provincial nominees", d: pnpD, pnp: true }].filter(Boolean).slice(0, 4);
  const elig = eligibility(p);
  const best = cutList.filter((x) => !x.pnp && (x.n !== "Canadian Experience Class" || elig.cec.ok)).map((x) => c.total - x.d.score).sort((a, b) => b - a)[0];
  const headline = c.total >= 600 ? "Very competitive" : best != null && best >= 0 ? "In range of recent draws" : best != null && best > -40 ? "Close to recent cut-offs" : c.total >= 450 ? "A solid base to build on" : "Room to grow";
  $("verdict").innerHTML = `<span class="eyebrow">${M.rules === "new" ? "Rules from November 3, 2026" : "Rules until November 2, 2026"}</span>
    <h2>${headline}</h2>
    <p>Your estimated Comprehensive Ranking System score is <b>${c.total}</b>${sp ? " with your partner coming with you" : ""}. ${best != null ? (best >= 0 ? `That's ${best} points above the most recent cut-off you'd likely be considered for.` : `You're ${-best} points below the most recent cut-off you'd likely be considered for.`) : ""} ${M.rules === "new" ? `Under the rules in force until November 2 it would be ${cOther.total}.` : `Under the rules from November 3, 2026 it would be ${cOther.total}.`}</p>
    <div class="rules" role="group" aria-label="Rules"><button type="button" data-r="new" aria-pressed="${M.rules === "new"}">From Nov 3, 2026</button><button type="button" data-r="old" aria-pressed="${M.rules === "old"}">Until Nov 2, 2026</button></div>`;
  $("verdict").querySelectorAll("[data-r]").forEach((b) => b.onclick = () => { M.rules = b.dataset.r; renderResults(); });
  $("cuts").innerHTML = cutList.map((x) => { const s = x.pnp ? c.total + (p.pnp ? 0 : 600) : c.total, gap = s - x.d.score; return `<div class="cutc ${gap >= 0 ? "yes" : "no"}"><small>${esc(x.n)} · ${fmtDay(x.d.date)}</small><b>${x.d.score}</b><span class="gap">${x.pnp && !p.pnp ? "With a nomination: " : ""}${gap >= 0 ? "+" + gap + " above" : gap + " below"}</span></div>`; }).join("") || "";
  // breakdown
  const rows = [
    ["Age", c.age, sp ? 100 : 110, p.age ? p.age + " years" : "add your age"],
    ["Education", c.edu, sp ? 140 : 150, M.eduWhere === "foreign" && M.eca !== "yes" ? "needs an ECA" : EDU_LABEL[p.eduRaw]],
    ["First official language", c.lang1, sp ? 128 : 136, c.firstMin ? (c.useFr ? "NCLC " : "CLB ") + c.firstMin + " lowest" : "no valid test"],
    ["Second official language", c.lang2, sp ? 22 : 24, ""],
    [M.rules === "new" ? "Canadian experience or job offer" : "Canadian work experience", c.cdn, c.cdnMax, p.cdnYears ? p.cdnYears + " yr" + (p.cdnYears > 1 ? "s" : "") + " · " + c.cdnWhy : c.cdn ? c.cdnWhy : "none yet"],
    ...(sp ? [["Partner factors", c.spouse, 40, ""]] : []),
    ["Skill transferability", c.skill, 100, ""],
    ...c.extra.map(([n, v]) => [n, v, null, ""]),
  ];
  $("bd").innerHTML = rows.map(([n, v, mx, why]) => `<tr><td>${esc(n)}${why ? ` <small>· ${esc(why)}</small>` : ""}${mx ? `<span class="meter"><i style="width:${Math.round(v / mx * 100)}%"></i></span>` : ""}</td><td>${v}${mx ? `<small>/${mx}</small>` : ""}</td></tr>`).join("") + `<tr class="tot"><td>Total</td><td>${c.total}</td></tr>`;
  // strengths, weaknesses, levers
  const { strong, weak } = assess(p, c, y);
  $("strong").innerHTML = strong.map(li).join("") || '<li><span>Add more documents to see your strengths.</span></li>';
  $("weak").innerHTML = weak.map(li).join("") || '<li><span>No major weaknesses found.</span></li>';
  $("levers").innerHTML = levers(p, c).map((l) => `<li><b>${esc(l.t)}</b><span class="plus">+${l.g}</span>${l.d ? `<p>${l.d}</p>` : ""}</li>`).join("") || "<li><span>Your profile is near the top of every factor you can still change.</span></li>";
  $("elig").innerHTML = [["Canadian Experience Class", elig.cec], ["Federal Skilled Worker", elig.fsw], ["Federal Skilled Trades", elig.fst]].filter(([, e]) => e.show !== false)
    .map(([n, e]) => `<div class="el"><span class="dot ${e.ok ? "ok" : "err"}">${e.ok ? "✓" : "–"}</span><div><b>${n}</b><small>${esc(e.why)}</small></div></div>`).join("")
    + (cats.length ? `<div class="el"><span class="dot ok">✓</span><div><b>Possible category draws</b><small>${esc(cats.join(", "))}. Check your NOC against IRCC's category lists.</small></div></div>` : "");
  renderReceipt();
  $("democta").hidden = !(DEMO && !unlocked());
  document.querySelector(".cta").hidden = !$("democta").hidden;
  track("score shown");
}
const li = (x) => `<li><b>${esc(x.t)}</b>${x.v != null ? `<span class="${x.neg ? "minus" : "plus"}">${x.v}</span>` : "<span></span>"}${x.d ? `<p>${x.d}</p>` : ""}</li>`;
function countUp(el, to) { const t0 = performance.now(), d = 900; const f = (t) => { const k = Math.min(1, (t - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); }; if (matchMedia("(prefers-reduced-motion: reduce)").matches) el.textContent = to; else requestAnimationFrame(f); }

const CAT_RE = { French: /french/i, Healthcare: /health/i, Trades: /trade/i, STEM: /stem|science, technology/i, Education: /education/i, Transport: /transport/i };
function categories(p) {
  const out = [], nocs = M.jobs.filter((j) => teerOf(j.noc) != null && teerOf(j.noc) <= 3).map((j) => j.noc);
  if (p.fr && p.fr.min >= 7) out.push("French");
  if (nocs.some((n) => /^3[123]/.test(n) || /^4130[01]|^4220[1]|^4421/.test(n))) out.push("Healthcare");
  if (nocs.some((n) => /^7[23]/.test(n))) out.push("Trades");
  if (nocs.some((n) => /^2[12]/.test(n))) out.push("STEM");
  if (nocs.some((n) => /^4122[01]|^4220[2]|^4320[0]/.test(n))) out.push("Education");
  if (nocs.some((n) => /^726|^733|^7330|^7240/.test(n))) out.push("Transport");
  return out;
}
function eligibility(p) {
  const y = p.y, first = p.en && (!p.fr || p.en.min >= p.fr.min) ? p.en : p.fr, m = first ? first.min : 0;
  const teer = y.bestTeer;
  const cecLang = teer <= 1 ? 7 : 5;
  const cec = { ok: y.recent >= 1 && m >= cecLang,
    why: y.recent < 1 ? "Needs 1 year of skilled work in Canada in the last 3 years" : m < cecLang ? `Needs CLB ${cecLang} in all four abilities` : "1+ year of skilled Canadian work in the last 3 years and the language level" };
  // FSW 67-point grid
  const skilled = y.cdn + y.foreign;
  const lp = first ? AB.reduce((s, [k]) => s + (first[k] >= 9 ? 6 : first[k] === 8 ? 5 : first[k] === 7 ? 4 : 0), 0) : 0;
  const second = first === p.en ? p.fr : p.en, l2p = second && second.min >= 5 ? 4 : 0;
  const ed = { none: 0, hs: 5, one: 15, two: 19, bach: 21, twoplus: 22, master: 23, phd: 25 }[p.edu] || 0;
  const ex = skilled >= 6 ? 15 : skilled >= 4 ? 13 : skilled >= 2 ? 11 : skilled >= 1 ? 9 : 0;
  const ag = p.age < 18 ? 0 : p.age <= 35 ? 12 : p.age >= 47 ? 0 : 12 - (p.age - 35);
  const ae = p.jobOffer && (teerOf(M.offerNoc) ?? 9) <= 3 ? 10 : 0;
  const ad = Math.min(10, (p.withSpouse && p.spClb >= 4 ? 5 : 0) + (p.cdnEdu !== "none" ? 5 : 0) + (y.cdn >= 1 ? 10 : 0) + (p.withSpouse && p.spCdn >= 1 ? 5 : 0) + (ae ? 5 : 0) + (p.sibling ? 5 : 0));
  const grid = lp + l2p + ed + ex + ag + ae + ad;
  const family = Math.max(1, parseInt(M.family) || (p.withSpouse ? 2 : 1)), need = FSW_FUNDS[Math.min(family, 7)] || FSW_FUNDS[7];
  const fswWhy = y.longest < 12 ? "Needs 1 year of continuous full-time skilled work (any country) in the last 10 years"
    : m < 7 ? "Needs CLB 7 in all four abilities" : p.edu === "none" ? "Needs education with an ECA (or a Canadian credential)"
    : grid < 67 ? `Scores ${grid} of 100 on the FSW grid; 67 is needed` : `Scores ${grid} of 100 on the FSW grid. You'll also need about $${need.toLocaleString("en-CA")} in settlement funds for a family of ${family}${ae || y.recent >= 1 ? " unless you have a valid job offer and are working in Canada" : ""}.`;
  const fsw = { ok: y.longest >= 12 && m >= 7 && p.edu !== "none" && grid >= 67, why: fswWhy };
  const tradeLang = first && first.S >= 5 && first.L >= 5 && first.R >= 4 && first.W >= 4;
  const fst = { show: y.trade > 0, ok: y.trade >= 2 && tradeLang && (p.cert || p.jobOffer), why: y.trade < 2 ? "Needs 2 years of trade work in the last 5 years" : !tradeLang ? "Needs CLB 5 speaking and listening, CLB 4 reading and writing" : !(p.cert || p.jobOffer) ? "Needs a job offer or a Canadian certificate of qualification" : "Trade experience, language and a job offer or certificate" };
  return { cec, fsw, fst };
}

function assess(p, c, y) {
  const strong = [], weak = [], sp = p.withSpouse;
  const ageMax = sp ? 100 : 110, eduMax = sp ? 140 : 150;
  // age
  if (p.age) {
    if (c.age >= ageMax * 0.9) strong.push({ t: `Age ${p.age}`, v: c.age, d: "You get full or nearly full age points." });
    else if (p.age >= 45) weak.push({ t: `Age ${p.age}`, v: "0", neg: true, d: "Express Entry gives no age points from 45. The other factors have to carry your score." });
    else if (p.age >= 33) weak.push({ t: `Age ${p.age}`, v: `−${ageMax - c.age}`, neg: true, d: "Age points drop each year after 30. Applying sooner keeps more of them." });
    const nb = nextBirthday();
    if (nb && p.age >= 29 && p.age < 45) { const lose = c.total - crs({ ...p, age: p.age + 1 }).total; if (lose > 0) weak.push({ t: `You'll lose ${lose} points on ${nb}`, v: `−${lose}`, neg: true, d: "That's your next birthday. Points already in your profile drop the day you turn a year older." }); }
  } else weak.push({ t: "Age missing", d: "Add your passport or date of birth. Age is worth up to " + ageMax + " points." });
  // language
  const testN = TESTS[M.enTest] || "your test";
  if (/_ac$/.test(M.enTest)) weak.push({ t: `${testN}`, v: "0", neg: true, d: "Express Entry only accepts IELTS General Training, CELPIP-General or PTE Core for English. This result earns no points." });
  else if (!p.en && !p.fr) weak.push({ t: "No language test", v: "0", neg: true, d: "A valid test is required to enter the Express Entry pool, and language is worth up to 160 points plus skill transferability." });
  else {
    const f = c.useFr ? p.fr : p.en;
    if (f.min >= 9) strong.push({ t: `${c.useFr ? "NCLC" : "CLB"} ${f.min}+ in every ability`, v: c.lang1, d: "CLB 9 unlocks the highest skill-transferability points with your education and work." });
    else if (f.min >= 7) weak.push({ t: `Lowest ability is CLB ${f.min}`, d: `Your weakest ability (${AB.filter(([a]) => f[a] === f.min).map(([, l]) => l.toLowerCase()).join(", ")}) caps your skill-transferability points.` });
    else weak.push({ t: `Lowest ability is CLB ${f.min}`, v: c.lang1, neg: true, d: "Below CLB 7 most programs are closed to you, and you lose the language combinations in skill transferability." });
    const d = M.enDate; if (d) { const exp = new Date(d + "T12:00:00"); exp.setFullYear(exp.getFullYear() + 2); const left = (exp - new Date()) / 864e5;
      if (left < 0) weak.push({ t: "Language test expired", d: `Tests are valid for 2 years. This one expired on ${exp.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}. You'll need a new result.` });
      else if (left < 180) weak.push({ t: "Language test expires soon", d: `It's valid until ${exp.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}. It must still be valid when you apply for PR.` }); }
  }
  if (p.fr && p.fr.min >= 7) strong.push({ t: "French at NCLC 7+", v: c.extra.find((x) => /French/.test(x[0]))?.[1] || null, d: "Extra points and access to French-language draws, which often have much lower cut-offs." });
  // education
  if (M.eduWhere === "foreign" && M.eca !== "yes") weak.push({ t: "No ECA for your education", v: "0", neg: true, d: `Education outside Canada only counts with an Educational Credential Assessment (WES, ICAS, IQAS, CES or ICES). With one, this is worth ${(sp ? EDU_W : EDU_WO)[p.eduRaw]} points.` });
  else if (c.edu >= eduMax * 0.85) strong.push({ t: EDU_LABEL[p.edu], v: c.edu, d: "Strong education points." });
  else if (["none", "hs", "one", "two"].includes(p.edu)) weak.push({ t: EDU_LABEL[p.edu], d: "A bachelor's level credential or a second credential adds education points and unlocks more skill transferability." });
  if (p.cdnEdu !== "none") strong.push({ t: "Study in Canada", v: p.cdnEdu === "long" ? 30 : 15, d: "Canadian education earns additional points." });
  // Canadian experience
  if (p.cdnYears >= 1) strong.push({ t: `${p.cdnYears} year${p.cdnYears > 1 ? "s" : ""} of skilled Canadian work`, v: c.cdn, d: c.hwBonus ? `Includes the high-wage occupation bonus (${TIER_NAME[p.hwTier]}).` : "Canadian experience is one of the strongest factors in Express Entry." });
  else weak.push({ t: "No skilled Canadian work experience", d: M.rules === "new" ? "Canadian work or a high-wage job offer can add up to 150 points from November 3, 2026." : "Canadian work experience can add up to 80 points plus skill transferability." });
  if (c.offerPts && c.offerPts >= (c.lenPts || 0) + (c.hwBonus || 0)) strong.push({ t: "High-wage job offer", v: c.offerPts, d: "Your job offer is worth more than your Canadian experience, so it's the one that counts." });
  if (M.offer === "yes" && !c.offerPts && M.rules === "new") weak.push({ t: "Job offer earns no points", d: "From November 3, 2026 only job offers in high-wage occupations earn CRS points. " + (M.offerNoc ? "This NOC isn't on the list." : "Add the job offer's NOC to check.") });
  if (y.skipped) weak.push({ t: `${y.skipped} job${y.skipped > 1 ? "s" : ""} in TEER 4 or 5`, d: "Work in TEER 4 and 5 occupations doesn't count for Express Entry work points." });
  if (y.unknownNoc) weak.push({ t: "Some jobs have no NOC", d: "Add the NOC for each job so we can check it's skilled work. We've counted those jobs for now." });
  if (p.forYears >= 3) strong.push({ t: `${p.forYears}+ years of skilled work abroad`, d: "Foreign experience adds skill-transferability points with your language and Canadian experience." });
  // skill transferability
  if (c.skill >= 75) strong.push({ t: "Skill transferability", v: c.skill, d: "Your education, language and work combine well." });
  else if (c.skill < 50 && (p.en || p.fr)) weak.push({ t: `Skill transferability ${c.skill} of 100`, d: "This rises with CLB 9 in every ability and with more Canadian or foreign skilled work." });
  // spouse
  if (sp) { if (c.spouse >= 25) strong.push({ t: "Your partner's profile", v: c.spouse, d: "Your partner's education, language and Canadian work add points." });
    else weak.push({ t: `Partner factors ${c.spouse} of 40`, d: "Your partner's language test (CLB 9 is worth 20 points) and education can add up to 40 points." }); }
  if (p.pnp) strong.push({ t: "Provincial nomination", v: 600, d: "A nomination all but guarantees an invitation in the next Provincial Nominee Program draw." });
  if (p.sibling) strong.push({ t: "Brother or sister in Canada", v: 15 });
  const elig = eligibility(p);
  if (elig.cec.ok) strong.push({ t: "Eligible for the Canadian Experience Class", d: "CEC draws happen often and usually have lower cut-offs than draws for everyone." });
  if (!elig.cec.ok && !elig.fsw.ok && !(elig.fst.show && elig.fst.ok)) weak.push({ t: "Not yet eligible for an Express Entry program", d: "You need to meet CEC, FSW or FST rules to enter the pool. See “Programs you may qualify for”." });
  return { strong: strong.slice(0, 7), weak: weak.slice(0, 8) };
}
function nextBirthday() {
  if (!M.dob) return null; const d = new Date(M.dob + "T12:00:00"), n = new Date(); const b = new Date(n.getFullYear(), d.getMonth(), d.getDate()); if (b <= n) b.setFullYear(b.getFullYear() + 1);
  return b.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}
function levers(p, c) {
  const out = [], base = c.total, gain = (q) => crs(q).total - base;
  const f = c.useFr ? p.fr : p.en, testKey = c.useFr ? M.frTest : M.enTest;
  const lift = (o, n) => ({ L: Math.max(o.L, n), R: Math.max(o.R, n), W: Math.max(o.W, n), S: Math.max(o.S, n), min: Math.max(o.min, n) });
  const tgt = (n) => (CONV[testKey] || testKey === "celpip") ? ` (${TESTS[testKey]}: ${AB.map(([a, l]) => l[0] + " " + target(testKey, a, n)).join(", ")})` : "";
  if (f && f.min < 9) { const q = { ...p, [c.useFr ? "fr" : "en"]: lift(f, 9) }; const g = gain(q); if (g > 0) out.push({ t: `Reach CLB 9 in every ability`, g, d: "Retaking the test is the fastest way to add points" + tgt(9) + "." }); }
  else if (f && f.min < 10) { const q = { ...p, [c.useFr ? "fr" : "en"]: lift(f, 10) }; const g = gain(q); if (g > 0) out.push({ t: "Reach CLB 10 in every ability", g, d: tgt(10).replace(/^ \(|\)$/g, "") }); }
  if (!f && !p.en) { const q = { ...p, en: { L: 9, R: 9, W: 9, S: 9, min: 9 } }; out.push({ t: "Take an accepted English test and reach CLB 9", g: gain(q), d: "IELTS General Training, CELPIP-General or PTE Core." }); }
  if (!(p.fr && p.fr.min >= 7) && p.en) { const q = { ...p, fr: { L: 7, R: 7, W: 7, S: 7, min: 7 } }; const g = gain(q); if (g > 0) out.push({ t: "Learn French to NCLC 7", g, d: "French also opens French-language draws, which have had cut-offs around 380–440." }); }
  if (M.eduWhere === "foreign" && M.eca !== "yes") { const q = { ...p, edu: p.eduRaw }; const g = gain(q); if (g > 0) out.push({ t: "Get your ECA", g, d: "Usually 4 to 8 weeks with WES. Without it, your education counts for nothing." }); }
  const nextEdu = { hs: "two", one: "two", two: "bach", bach: "twoplus", twoplus: "master" }[p.edu];
  if (nextEdu) { const g = gain({ ...p, edu: nextEdu }); if (g > 0) out.push({ t: nextEdu === "twoplus" ? "Add a second post-secondary credential" : `Complete a ${EDU_LABEL[nextEdu].toLowerCase()}`, g, d: nextEdu === "twoplus" ? "A second credential (one of them 3+ years) moves you to the next education level. Needs an ECA if earned outside Canada." : "A longer-term step, but it lifts education and skill-transferability points." }); }
  if (p.cdnYears < 5 && (p.cdnYears >= 1 || M.jobs.some((j) => j.country === "canada"))) { const g = gain({ ...p, cdnYears: Math.min(5, p.cdnYears + 1) }); if (g > 0) out.push({ t: `Reach ${p.cdnYears + 1} year${p.cdnYears ? "s" : ""} of skilled Canadian work`, g, d: "Keep working full-time in a TEER 0–3 job. Points update once you pass each full year." }); }
  if (M.rules === "new" && !(c.offerPts) && !c.hwBonus) { const g = gain({ ...p, jobOffer: true, offerTier: 15 }); if (g > 0) out.push({ t: "A job offer in a high-wage occupation", g, d: "A 1.5× tier job offer is worth 70 points (2× tier: 100). No LMIA needed from November 3, 2026. <a href=\"/express-entry-2026/#noc-check\">Check which NOCs qualify</a>." }); }
  if (p.withSpouse && p.spClb < 9) { const g = gain({ ...p, spClb: 9 }); if (g > 0) out.push({ t: "Your partner reaches CLB 9", g, d: "Your partner's language test adds up to 20 points." }); }
  if (p.withSpouse) { const g = gain({ ...p, withSpouse: false }); if (g > 0) out.push({ t: "If your partner were not coming with you", g, d: "Only relevant if that's genuinely your plan. A partner who isn't coming still has to be declared and examined." }); }
  if (!p.pnp) out.push({ t: "A provincial nomination", g: 600, d: "The biggest single boost. Many provinces select straight from the Express Entry pool. <a href=\"/tools/bc/\">BC</a>, <a href=\"/tools/ab/\">Alberta</a> and <a href=\"/tools/mb/\">Manitoba</a> pathway checks." });
  return out.sort((a, b) => b.g - a.g).slice(0, 7);
}
function renderReceipt() {
  const t = (d) => d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const all = RECEIPT.length ? RECEIPT : [];
  if (DEMO) { $("receipt").innerHTML = `<h3>This was an example</h3><p>No documents were used. Press Start over to scan your own.</p>`; return; }
  $("receipt").innerHTML = `<h3><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" fill="none" stroke="#7fe0b5" stroke-width="2.2" stroke-linejoin="round"/><path d="M8.5 12.5l2.5 2.5 4.5-5" fill="none" stroke="#7fe0b5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Your documents are gone</h3>
    ${all.length ? `<ul>${all.map((r) => `<li><span>${esc(r.name)}</span><span>${r.sent ? `read ${t(r.at)} · ${r.stored === "none" ? "server confirmed not stored" : "not stored"}` : "never sent"}</span></li>`).join("")}</ul>` : ""}
    <p>${all.length ? "Every file was read in memory and discarded. The server confirmed for each one that nothing was stored. " : ""}Your files have been removed from this page too. These results exist only in this browser tab: they disappear when you close it or press Start over.</p>`;
}

/* ======================= NAV ======================= */
function show(id) {
  const lock = id === "p1" && !unlocked();
  ["p1", "pp", "p2", "p3"].forEach((x) => $(x).hidden = lock || x !== id);
  $("unlock").hidden = !lock;
  if (id === "p1") renderPass();
  const s = { p1: 1, pp: 1, p2: 2, p3: 3 }[id];
  document.querySelectorAll("#steps li").forEach((li) => { const n = +li.dataset.s; li.className = n === s ? "on" : n < s ? "done" : ""; });
  $("scanner").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
function toReview() { build(); renderReview(); show("p2"); }
function toResults() { show("p3"); renderResults(); }

function demo() {
  RESULTS = [
    { kind: "passport", name: "Sample passport", doc_type: "passport", person: "applicant", passport: { date_of_birth: (new Date().getFullYear() - 29) + "-03-14" } },
    { kind: "language", name: "Sample IELTS result", doc_type: "language_test", person: "applicant", language: { test: "ielts_general", listening: 8, reading: 6.5, writing: 6.5, speaking: 7, test_date: (new Date().getFullYear() - 1) + "-06-10" } },
    { kind: "education", name: "Sample WES report", doc_type: "eca_report", person: "applicant", education: { credential: "Bachelor of Technology", level: "bachelors", country: "India", is_eca: true, eca_equivalent: "Bachelor's degree (four years)" } },
    { kind: "work", name: "Sample reference letter", doc_type: "work_letter", person: "applicant", work: { employer: "Infosys Ltd", country: "India", job_title: "Software Developer", start_date: (new Date().getFullYear() - 6) + "-07-01", end_date: (new Date().getFullYear() - 2) + "-05-01", hours_per_week: 45, pay: "INR 9,00,000 a year", noc_code: "21232", duties_summary: "Built and maintained web applications." } },
    { kind: "work", name: "Sample pay stubs", doc_type: "paystub", person: "applicant", work: { employer: "Maple Systems Inc.", country: "Canada", job_title: "Software Developer", start_date: (new Date().getFullYear() - 2) + "-08-01", end_date: "present", hours_per_week: 40, noc_code: "21232" } },
  ];
  NOTES = { facts: { marital_status: "married", spouse_accompanying: true, spouse_education: "bachelors", spouse_language_clb: 6 } };
  RECEIPT = []; DEMO = true;
  track("demo");
  toReview();
}

/* ======================= START ======================= */
renderSlots();
$("buy").onclick = () => buy($("buy"));
document.querySelectorAll("[data-buy]").forEach((b) => b.onclick = () => buy(b));
$("demoBuy").onclick = () => { if (unlocked()) { RESULTS = []; NOTES = null; DEMO = false; show("p1"); } else { show("p1"); } };
$("tryDemo").onclick = () => demo();
$("showCoupon").onclick = () => { $("couponForm").hidden = !$("couponForm").hidden; if (!$("couponForm").hidden) $("couponCode").focus(); };
$("couponForm").onsubmit = async (e) => { e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true; await applyCoupon($("couponCode").value); b.disabled = false; };
$("showRestore").onclick = () => { $("restoreForm").hidden = !$("restoreForm").hidden; if (!$("restoreForm").hidden) $("restoreEmail").focus(); };
$("restoreForm").onsubmit = async (e) => {
  e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true;
  try { const j = await (await fetch("/api/scanner/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: $("restoreEmail").value }) })).json(); pmsg(j.message || j.error || "Done."); }
  catch (x) { pmsg("Something went wrong. Please try again."); }
  b.disabled = false;
};
$("agree").onchange = updGo; $("notes").oninput = updGo;
$("scan").onclick = () => runScan();
$("demo").onclick = demo;
$("toScore").onclick = $("toScore2").onclick = toResults;
$("back1").onclick = () => show("p1");
$("edit").onclick = () => { renderReview(); show("p2"); };
$("print").onclick = () => window.print();
$("restart").onclick = () => { if (!confirm("Clear everything and start over?")) return; RESULTS = []; RECEIPT = []; NOTES = null; M = null; SRC = {}; FILES = Object.fromEntries(SLOTS.map((s) => [s.k, []])); $("notes").value = ""; $("agree").checked = false; renderSlots(); show("p1"); };
Promise.all([fetch("/api/tools/scan").then((r) => r.json()).catch(() => ({})), claimFromUrl(), initPlay()]).then(([j]) => {
  CFG = { free: !!j.free, payments: j.payments !== false, ai: j.ai !== false };
  if (j.price) { PRICE = j.price; paintPrice(); }
  if (PENDING_COUPON && !unlocked()) applyCoupon(PENDING_COUPON);
  AI = !!j.ai; $("aiOff").hidden = AI; updGo();
  if ($("p2").hidden && $("p3").hidden && $("pp").hidden) show("p1");
  if (/paid=|pass=/.test(document.referrer) || PASSINFO) renderPass();
});
$("p1").hidden = true; // paywall or uploads appear once the pass is checked
window.__scanner = { inApp: IN_APP, crs, toClb, years, toP, build, set: (r, n) => { RESULTS = r; NOTES = n || null; }, get: () => M }; // for tests
})();
