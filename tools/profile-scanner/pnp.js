/* WorkerPool Profile Scanner: provincial assessments for British Columbia (BC PNP Skills Immigration)
   and Alberta (AAIP worker streams). Pure functions only; scanner.js gathers the profile and renders.

   Scoring grids match the BC and Alberta Pathway Checks (tools/src/prov_bc.js and prov_ab.js):
   - BC PNP Skills Immigration Registration System (SIRS), out of 200.
   - AAIP Worker Expression of Interest grid, out of 100.
   Cut-offs come from the live draws feed (/api/draws, jur "BC" and "AB"), so they stay current with
   the "Latest draws" section without editing this file. */
(function () {
"use strict";

/* ---------------- occupation groups ---------------- */
const teer = (c) => (/^\d{5}$/.test(c || "") ? +c[1] : null);
// BC PNP 2026 priority groups (Care, Build, Innovate). Approximate NOC mapping; BC publishes the exact lists.
function bcGroup(noc) {
  if (!/^\d{5}$/.test(noc || "")) return null;
  if (noc === "42202") return "childcare";
  if (noc === "31103" || noc === "32104") return "vet";
  if (noc === "41220" || noc === "41221") return "education";
  if (/^3[0-3]/.test(noc) || noc === "41300" || noc === "41301") return "health";
  if (/^7001[01]|^72|^73|^22303/.test(noc)) return "build";
  if (teer(noc) <= 3 && /^(00|10|20|21|22)/.test(noc)) return "innovate";
  return null;
}
const BC_GROUP = {
  health: { name: "Care: Health", re: /Care: Health/i },
  childcare: { name: "Care: Childcare", re: /Care: Childcare/i },
  vet: { name: "Care: Veterinary care", re: /Veterinary/i },
  education: { name: "Care: Education", re: /Care: Education/i },
  build: { name: "Build: Construction trades", re: /Build: Construction/i },
  innovate: { name: "Innovate: High economic impact", re: /Innovate/i },
};
// Alberta Express Entry priority sectors.
function abSector(noc) {
  if (!/^\d{5}$/.test(noc || "")) return null;
  if (/^3[0-3]/.test(noc)) return "health";
  if (/^(72600|72601|72404|22313)$/.test(noc)) return "aviation";
  if (/^(2001[12]|21[1-3]\d\d|2222\d|2231\d)$/.test(noc)) return "tech";
  if (/^(80020|82030|84120|85100|85101|85103|94141|94142)$/.test(noc)) return "agri";
  if (/^7001[01]|^72|^73|^22303/.test(noc)) return "construction";
  if (/^9(0010|2|3|4|5)/.test(noc)) return "manufacturing";
  return null;
}
const AB_SECTOR = { health: "Health care", tech: "Accelerated Tech", agri: "Agriculture", construction: "Construction", aviation: "Aviation", manufacturing: "Manufacturing" };

/* ---------------- draws ---------------- */
function latest(draws, jur, test) {
  return draws.filter((d) => d.jur === jur && test(d)).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}
const scored = (re) => (d) => d.score != null && re.test(d.stream);

/* ---------------- BC PNP SIRS (out of 200) ---------------- */
function sirs(x) {
  const wage = Math.max(0, Math.min(55, Math.floor(x.wage || 0) - 15));
  const area = { 1: 0, 2: 5, 3: 15 }[x.area] || 0, reg = x.area !== 1 && x.regional ? 10 : 0;
  const dy = x.drYears, drBase = dy >= 5 ? 20 : dy >= 4 ? 16 : dy >= 3 ? 12 : dy >= 2 ? 8 : dy >= 1 ? 4 : dy > 0 ? 1 : 0;
  const dr = Math.min(40, drBase + (x.drCdn ? 10 : 0) + (x.current ? 10 : 0));
  let ed = { none: 0, hs: 0, one: 5, two: 5, bach: 15, twoplus: 15, master: 22, phd: 27 }[x.edu] || 0;
  const edLoc = !["none", "hs"].includes(x.edu) ? (x.eduWhere === "prov" ? 8 : x.eduWhere === "canada" ? 6 : 0) : 0;
  const des = x.designation ? 5 : 0;
  const edT = Math.min(40, ed + edLoc + des);
  const best = Math.max(x.en ? x.en.min : 0, x.fr ? x.fr.min : 0);
  let lg = best >= 9 ? 30 : best === 8 ? 25 : best === 7 ? 20 : best === 6 ? 15 : best === 5 ? 10 : best === 4 ? 5 : 0;
  const bi = x.en && x.fr && x.en.min >= 4 && x.fr.min >= 4 ? 10 : 0;
  lg = Math.min(40, lg + bi);
  const human = dr + edT + lg, econ = wage + area + reg;
  return { total: human + econ, human, econ, rows: [
    ["Directly related work experience", dr, 40, `${dy ? (+dy).toFixed(1) : 0} yrs${x.drCdn ? " · 1+ yr in Canada" : ""}${x.current ? " · working for the employer now" : ""}`],
    ["Education", edT, 40, (edLoc ? (x.eduWhere === "prov" ? "BC credential" : "Canadian credential") : "") + (des ? " · BC designation" : "")],
    ["Language", lg, 40, best ? `best CLB ${best}${bi ? " · both languages" : ""}` : "no valid test"],
    ["Hourly wage", wage, 55, x.wage ? "$" + (+x.wage).toFixed(2) + "/h" : "no BC job offer"],
    ["Area of employment", area + reg, 25, x.area ? ["", "Metro Vancouver", "Squamish to Chilliwack", "Rest of BC"][x.area] + (reg ? " · regional bonus" : "") : ""],
  ] };
}

/* ---------------- AAIP Worker EOI (out of 100) ---------------- */
function aaip(x) {
  let ed = { none: 0, hs: 0, one: 4, two: 4, bach: 7, twoplus: 7, master: 10, phd: 12 }[x.edu] || 0;
  if (x.cert) ed = Math.max(ed, 7);
  const post = !["none", "hs"].includes(x.edu) || x.cert;
  const edLoc = post ? (x.eduWhere === "prov" ? 10 : x.eduWhere === "canada" ? 6 : 0) : 0;
  const en = x.en ? x.en.min : 0, fr = x.fr ? x.fr.min : 0;
  const enP = en >= 6 ? 10 : en === 5 ? 8 : en === 4 ? 5 : 0, frP = fr >= 6 ? 8 : fr === 5 ? 5 : fr === 4 ? 3 : 0;
  const bi = en >= 4 && fr >= 4 ? 3 : 0, lang = Math.min(13, Math.max(enP, frP) + bi);
  const we = x.drYears >= 1 ? 11 : x.drYears > 0 ? 7 : 0;
  const ce = x.cdnYears >= 0.5 || x.current ? (x.expWhere === "ab" ? 10 : x.expWhere === "canada" ? 6 : 0) : 0;
  const a = x.age, age = !a ? 0 : a < 18 ? 0 : a <= 20 ? 3 : a <= 34 ? 5 : a <= 49 ? 4 : 3;
  const fam = x.family ? 8 : 0, job = x.jobOffer ? 10 : 0, end = x.jobOffer && x.endorse !== "none" ? 6 : 0;
  const loc = x.jobOffer && x.loc === "outside" ? 5 : 0, reg = x.certReg ? 10 : 0;
  const total = ed + edLoc + lang + we + ce + age + fam + job + end + loc + reg;
  return { total, rows: [
    ["Education level", ed, 12, ""], ["Where you studied", edLoc, 10, edLoc ? (x.eduWhere === "prov" ? "in Alberta" : "in Canada") : ""],
    ["Official language", lang, 13, `English CLB ${en || "—"}, French NCLC ${fr || "—"}`],
    ["Work experience in the occupation", we, 11, `${(+x.drYears || 0).toFixed(1)} yrs`],
    ["Canadian work experience", ce, 10, ce ? (x.expWhere === "ab" ? "in Alberta" : "outside Alberta") : ""],
    ["Age", age, 5, a ? a + " years" : ""], ["Family in Alberta", fam, 8, ""],
    ["Alberta job offer", job, 10, ""], ["Endorsement or designated employer", end, 6, ""],
    ["Job outside Calgary and Edmonton", loc, 5, ""], ["Alberta certification or licence", reg, 10, ""],
  ] };
}

/* ---------------- shared helpers ---------------- */
const gapTxt = (score, cut) => (score >= cut ? `+${score - cut} above` : `${score - cut} below`);
function stream(name, why, draw, score, extra) {
  return { name, ok: !why.length, why, draw, score, gap: draw && draw.score != null && score != null ? score - draw.score : null, ...(extra || {}) };
}

/* ---------------- British Columbia ---------------- */
// x: { en, fr, edu, eduWhere, offer (bool, BC offer), offerNoc, wage, area, regional, current, designation, ha,
//      drYears, drCdn, skilledYears, eeOk, crs, noc (main occupation) }
function bc(x, draws) {
  const groupKey = bcGroup(x.offer ? x.offerNoc || x.noc : x.noc), G = groupKey && BC_GROUP[groupKey];
  const s = sirs(x.offer ? x : { ...x, wage: 0, area: 0, regional: false, current: false });
  const groupDraw = G ? latest(draws, "BC", scored(G.re)) : null;
  const wageDraw = latest(draws, "BC", (d) => d.score == null && /Innovate/i.test(d.stream) && /\$\d+\/hour/.test(d.stream));
  const wageNeed = wageDraw ? +wageDraw.stream.match(/\$(\d+)\/hour/)[1] : null;
  const offerTeer = teer(x.offerNoc);
  const bestClb = Math.max(x.en ? x.en.min : 0, x.fr ? x.fr.min : 0);
  const streams = [], strong = [], weak = [], levers = [];

  if (x.offer) {
    { const why = [];
      if (offerTeer == null) why.push("add the job offer's NOC to check it's TEER 0–3");
      else if (offerTeer > 3) why.push("needs a TEER 0–3 job offer");
      if (x.skilledYears < 2) why.push("needs 2 years of full-time skilled work experience");
      streams.push(stream("Skills Immigration: Skilled Worker", why, groupDraw, s.total, { group: G && G.name })); }
    if (x.ha) streams.push(stream("Skills Immigration: Health Authority", [], null, s.total, { note: "A BC health authority job offer: apply directly, without waiting for a draw." }));
    if (wageNeed && offerTeer != null && offerTeer <= 3) {
      const why = x.wage >= wageNeed ? [] : [`needs a wage of at least $${wageNeed}/hour (latest round)`];
      streams.push(stream("Innovate: wage-based round", why, wageDraw, null, { note: `Latest round invited TEER 0–3 job offers paying $${wageNeed}/hour or more.` }));
    }
    if (x.eeOk) streams.push(stream("Express Entry BC (EEBC option)", [], null, s.total, { note: `Uses the same SIRS ranking. A nomination adds 600 CRS points: ${x.crs} → ${x.crs + 600}.` }));
  } else {
    streams.push(stream("Skills Immigration (any stream)", ["needs a full-time, ongoing job offer from a BC employer"], groupDraw, null));
  }

  // headline
  const eligible = streams.filter((t) => t.ok);
  const competitive = eligible.some((t) => (t.gap != null && t.gap >= 0) || /Health Authority|wage-based/.test(t.name));
  const headline = !x.offer ? "Needs a BC job offer" : !eligible.length ? "Not eligible yet" : competitive ? "Competitive in BC" : groupDraw ? "Eligible, below the latest cut-off" : "Eligible, but no recent draws for this occupation";

  // strengths and weaknesses
  if (bestClb >= 9) strong.push({ t: `CLB ${bestClb} language`, v: s.rows[2][1], d: "Full or nearly full SIRS language points." });
  else if (bestClb && bestClb < 7) weak.push({ t: `Language CLB ${bestClb}`, d: "SIRS gives 5 points per CLB level up to CLB 9. Language is the factor most people can raise fastest." });
  if (x.drYears >= 5) strong.push({ t: `${x.drYears.toFixed(1)} years in your occupation`, v: s.rows[0][1], d: "Maximum points for directly related experience." });
  else if (x.drYears < 2) weak.push({ t: "Less than 2 years in your occupation", d: "Skilled Worker needs 2 years of full-time skilled work, and SIRS rewards each extra year." });
  if (x.drCdn) strong.push({ t: "1+ year of related work in Canada", v: 10 });
  if (x.eduWhere === "prov" && !["none", "hs"].includes(x.edu)) strong.push({ t: "Post-secondary education in BC", v: 8 });
  if (x.offer) {
    if (x.current) strong.push({ t: "Working for your BC employer now", v: 10, d: "Full-time work for the employer making the offer earns 10 points." });
    if (s.rows[3][1] >= 30) strong.push({ t: `$${(+x.wage).toFixed(2)}/hour wage`, v: s.rows[3][1], d: "Wage is the largest economic factor in SIRS." });
    else if (x.wage) weak.push({ t: `Wage $${(+x.wage).toFixed(2)}/hour`, d: `Each $1/hour above $15 adds a point (max 55 at $70/hour).${wageNeed ? ` Innovate wage rounds recently needed $${wageNeed}/hour.` : ""}` });
    else weak.push({ t: "Job offer wage missing", d: "Add the hourly wage of the BC job offer. It's worth up to 55 SIRS points." });
    if (x.area === 3) strong.push({ t: "Job outside the Lower Mainland", v: 15 + (x.regional ? 10 : 0) });
    if (!G) weak.push({ t: "Occupation isn't in a 2026 priority group", d: "In 2026 BC has invited only Care, Build and Innovate priority groups (plus a rural health initiative). You can register, but there have been no general rounds." });
    if (offerTeer != null && offerTeer > 3) weak.push({ t: `Job offer is TEER ${offerTeer}`, d: "Skilled Worker needs a TEER 0–3 job. The Entry Level and Semi-Skilled stream covers only limited occupations and regions." });
    if (groupDraw && s.total < groupDraw.score) weak.push({ t: `${groupDraw.score - s.total} points short of the ${G.name} cut-off`, d: `Latest ${G.name} round (${groupDraw.date}) needed ${groupDraw.score}.` });
  } else {
    weak.push({ t: "No BC job offer", d: "Every BC PNP Skills stream needs a full-time, ongoing job offer from a BC employer." });
  }
  if (x.eduWhere === "foreign" && !x.ecaOk && !["none", "hs"].includes(x.edu)) weak.push({ t: "Keep your ECA ready", d: "Express Entry BC needs an Educational Credential Assessment for education outside Canada." });

  // levers: real point gains on the SIRS grid
  const base = s.total, alt = (o) => sirs({ ...x, ...(x.offer ? {} : { wage: 0, area: 0, regional: false, current: false }), ...o }).total - base;
  const lift = (o, n) => o && { ...o, min: Math.max(o.min, n) };
  if (bestClb < 9) { const n = Math.min(9, Math.max(4, bestClb + 2)); const useEn = x.en && (!x.fr || x.en.min >= x.fr.min) || !x.fr; const g = alt(useEn ? { en: lift(x.en, n) || { min: n } } : { fr: lift(x.fr, n) }); if (g > 0) levers.push({ t: `Reach CLB ${n} in every ability`, g, d: "SIRS adds 5 points for each CLB level up to 9." }); }
  if (!(x.en && x.fr && x.en.min >= 4 && x.fr.min >= 4) && x.en) { const g = alt({ fr: { min: 4 } }); if (g > 0) levers.push({ t: "French at NCLC 4", g, d: "Basic French in both languages adds 10 points." }); }
  if (x.drYears < 5) { const g = alt({ drYears: Math.floor(x.drYears) + 1 }); if (g > 0) levers.push({ t: "One more year in your occupation", g }); }
  if (x.offer && !x.current) levers.push({ t: "Work full-time for your BC employer before registering", g: alt({ current: true }) });
  if (x.offer && x.wage && x.wage < 70) levers.push({ t: "A $5/hour higher wage offer", g: alt({ wage: Math.min(70, +x.wage + 5) }) });
  if (!x.designation && G && /health|childcare|vet|build/.test(groupKey)) levers.push({ t: "Get your BC professional designation", g: alt({ designation: true }), d: "E.g. BCCNM registration, ECE certificate or SkilledTradesBC certification." });
  if (x.offer && x.area === 1) levers.push({ t: "A job outside Metro Vancouver", g: alt({ area: 3 }), d: "Jobs outside the Lower Mainland earn up to 15 points, plus 10 for regional experience or study." });
  if (!x.offer) {
    // what wage would close the gap
    const cut = groupDraw ? groupDraw.score : null;
    if (cut) {
      const need = cut - s.human, w3 = Math.max(16, need), w1 = Math.max(16, need + 15);
      if (w3 > 70) levers.push({ t: "Raise your work, education or language points first", g: null, d: `Your work, education and language give ${s.human} of 120 points. The latest ${G.name} cut-off (${cut}) is out of reach with wage and location alone.` });
      else levers.push({ t: `A BC job offer paying about $${w3}${w1 > w3 && w1 <= 70 ? "–" + w1 : ""}/hour`, g: Math.max(0, need), d: `Your work, education and language give ${s.human} of 120 points. To reach the latest ${G.name} cut-off (${cut}, ${groupDraw.date}) you'd need about $${w3}/hour outside the Lower Mainland${w1 <= 70 ? ` or $${w1}/hour in Metro Vancouver` : ""}.` });
    } else if (wageNeed) levers.push({ t: `A TEER 0–3 BC job offer at $${wageNeed}/hour+`, g: null, d: "That's what the latest Innovate wage-based round needed. Your occupation isn't in a points-based priority group right now." });
  }
  return { key: "bc", prov: "British Columbia", program: "BC PNP Skills Immigration", label: "SIRS", score: x.offer ? s.total : s.human, max: x.offer ? 200 : 120,
    scoreNote: x.offer ? "SIRS registration score" : "Work, education and language points (before a job offer)",
    headline, group: G && G.name, streams, strong: strong.slice(0, 5), weak: weak.slice(0, 5), levers: levers.filter((l) => l.g == null || l.g > 0).sort((a, b) => (b.g || 0) - (a.g || 0)).slice(0, 5), rows: s.rows };
}

/* ---------------- Alberta ---------------- */
// x: { en, fr, edu, cert, eduWhere, age, cdnYears, drYears, current (working in AB now), expWhere, family, certReg,
//      offer (AB job offer), offerNoc, loc, endorse, eeOk, crs, noc, inCanadaWp }
function ab(x, draws) {
  const a = aaip({ ...x, jobOffer: x.offer });
  const firstClb = Math.max(x.en ? x.en.min : 0, x.fr ? x.fr.min : 0);
  const occNoc = x.offer ? x.offerNoc || x.noc : x.noc, offerTeer = teer(occNoc) ?? 3, needClb = offerTeer <= 3 ? 5 : 4;
  const sec = abSector(occNoc), tie = x.offer || x.current;
  const L = (re) => latest(draws, "AB", scored(re));
  const streams = [], strong = [], weak = [], levers = [];

  { const why = [];
    if (!x.offer) why.push("needs a full-time Alberta job offer");
    if (!x.current) why.push("must be working in Alberta now on a valid work permit");
    if (x.drYears < 1) why.push("needs 12 months of experience in the occupation");
    if (firstClb < needClb) why.push(`needs CLB ${needClb} for a TEER ${offerTeer} job`);
    if (x.edu === "none") why.push("needs high school or higher");
    streams.push(stream("Alberta Opportunity Stream", why, L(/^Alberta Opportunity Stream$/i), a.total)); }
  { const why = []; if (!x.eeOk) why.push("needs an active Express Entry profile (CEC, FSW or FST eligible)"); if (x.crs < 300) why.push("needs a CRS score of at least 300");
    let name = "Alberta Express Entry: Priority Sectors (General)", draw = L(/Priority Sectors \(General\)/i);
    if (sec === "tech" && tie) { name = "Alberta Express Entry: Accelerated Tech"; draw = L(/Accelerated Tech/i) || draw; }
    else if (x.endorse === "law") { name = "Alberta Express Entry: Law Enforcement"; draw = L(/Law Enforcement/i) || draw; }
    else if (sec && tie) { const re = new RegExp("Priority Sectors \\(" + AB_SECTOR[sec].split(" ")[0], "i"); name = `Alberta Express Entry: ${AB_SECTOR[sec]}`; draw = L(re) || draw; }
    const loose = !tie && !x.family && x.expWhere !== "ab" && x.eduWhere !== "prov";
    streams.push(stream(name, why, draw, a.total, loose ? { note: "Alberta mostly invites people with an Alberta connection: work, study, a job offer or family here." } : null)); }
  if (sec === "health") { const why = []; if (!x.eeOk && !x.offer) why.push("needs an Express Entry profile or an Alberta health care job offer"); if (firstClb < needClb) why.push(`needs CLB ${needClb}`);
    streams.push(stream("Dedicated Health Care Pathway", why, L(x.eeOk ? /Dedicated Health Care Pathway – Express Entry/i : /Dedicated Health Care Pathway – non-Express/i), a.total)); }
  if (x.endorse === "rrs") { const why = []; if (!x.offer) why.push("needs a job offer from an employer in a designated Rural Renewal community"); if (firstClb < needClb) why.push(`needs CLB ${needClb}`); if (x.drYears < 1) why.push("needs 12 months of related work experience");
    streams.push(stream("Rural Renewal Stream", why, L(/Rural Renewal/i), a.total)); }
  if (x.endorse === "tourism") { const why = []; if (!x.current) why.push("must be working in Alberta for an approved tourism and hospitality employer (6+ months)"); if (firstClb < 4) why.push("needs CLB 4");
    streams.push(stream("Tourism and Hospitality Stream", why, L(/Tourism and Hospitality/i), a.total)); }

  const eligible = streams.filter((t) => t.ok), above = eligible.filter((t) => t.gap != null && t.gap >= 0);
  const headline = above.length ? "Competitive in Alberta" : eligible.length ? "Eligible, below recent cut-offs" : "Not eligible yet";

  if (x.expWhere === "ab") strong.push({ t: "Canadian work experience in Alberta", v: 10 });
  if (x.offer) strong.push({ t: "Alberta job offer", v: 10 + (x.loc === "outside" ? 5 : 0) + (x.endorse !== "none" ? 6 : 0), d: x.loc === "outside" ? "Includes 5 points for a job outside Calgary and Edmonton." : "" });
  if (x.family) strong.push({ t: "Family in Alberta", v: 8 });
  if (x.certReg) strong.push({ t: "Alberta certification or licence", v: 10 });
  if (x.eduWhere === "prov") strong.push({ t: "Studied in Alberta", v: 10 });
  if (firstClb >= 6) strong.push({ t: `CLB ${firstClb} language`, v: a.rows[2][1], d: "Alberta gives full language points from CLB 6." });
  else weak.push({ t: firstClb ? `Language CLB ${firstClb}` : "No valid language test", d: "Full AAIP language points start at CLB 6, and most streams need CLB 4 or 5." });
  if (!x.offer) weak.push({ t: "No Alberta job offer", d: "A full-time Alberta job offer is worth 10 EOI points (15 outside Calgary and Edmonton) and is required for the Alberta Opportunity Stream." });
  if (!x.current && x.offer) weak.push({ t: "Not working in Alberta yet", d: "The Alberta Opportunity Stream needs you to be working in Alberta on a valid work permit." });
  if (x.cdnYears >= 0.5 && x.expWhere === "canada") weak.push({ t: "Canadian work is outside Alberta", d: "Alberta work experience earns 10 points; experience elsewhere in Canada earns 6." });
  if (x.drYears < 1) weak.push({ t: "Under 12 months in your occupation", d: "Most AAIP streams need at least a year of experience in the occupation." });
  if (sec && !tie) weak.push({ t: `${AB_SECTOR[sec]} is a priority sector`, d: "Sector draws need an Alberta job offer or current Alberta work in that sector. Without one you'd only fit the general draws." });
  const best = eligible.filter((t) => t.gap != null).sort((p, q) => q.gap - p.gap)[0];
  if (best && best.gap < 0) weak.push({ t: `${-best.gap} points from the ${best.name.replace("Alberta Express Entry: ", "AEE ")} cut-off`, d: `Latest round (${best.draw.date}) needed ${best.draw.score}.` });

  const base = a.total, g = (o) => aaip({ ...x, jobOffer: x.offer, ...o }).total - base;
  if (!x.offer) levers.push({ t: "An Alberta job offer outside Calgary and Edmonton", g: g({ offer: true, jobOffer: true, loc: "outside" }), d: "10 points for the offer and 5 for the location. A designated Rural Renewal employer adds 6 more." });
  else if (x.endorse === "none") levers.push({ t: "Rural Renewal endorsement or designated employer", g: g({ endorse: "rrs" }) });
  if (firstClb < 6) levers.push({ t: "Reach CLB 6 in English", g: g({ en: { min: 6 } }) });
  if (!(x.fr && x.fr.min >= 4) && x.en && x.en.min >= 4) levers.push({ t: "French at NCLC 4", g: g({ fr: { min: 4 } }), d: "Bilingual candidates get 3 extra points." });
  if (!x.certReg) levers.push({ t: "An Alberta certification or licence", g: g({ certReg: true }), d: "For regulated occupations, e.g. an Alberta journeyperson certificate or a nursing licence." });
  if (x.expWhere !== "ab") levers.push({ t: "6+ months of work in Alberta", g: g({ expWhere: "ab", cdnYears: Math.max(0.5, x.cdnYears) }) });
  if (x.drYears < 1) levers.push({ t: "12 months in your occupation", g: g({ drYears: 1 }) });
  if (x.eduWhere !== "prov" && x.edu !== "phd") levers.push({ t: "A post-secondary credential from an Alberta school", g: g({ eduWhere: "prov", edu: ["none", "hs"].includes(x.edu) ? "one" : x.edu }), d: "A longer-term step." });

  return { key: "ab", prov: "Alberta", program: "Alberta Advantage Immigration Program (AAIP)", label: "EOI", score: a.total, max: 100, scoreNote: "AAIP Worker EOI score",
    headline, group: sec && AB_SECTOR[sec], streams, strong: strong.slice(0, 5), weak: weak.slice(0, 5),
    levers: levers.filter((l) => l.g > 0).sort((p, q) => q.g - p.g).slice(0, 5), rows: a.rows };
}

window.WP_PNP = { sirs, aaip, bc, ab, bcGroup, abSector, gapTxt };
})();
