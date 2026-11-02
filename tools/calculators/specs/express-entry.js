/* Express Entry calculator: full CRS (current rules and the November 3, 2026 rules), Federal Skilled
   Worker 67-point grid, program eligibility (FSW, CEC, FST) and proof of funds.
   Sources: IRCC CRS criteria page (modified 2026-10-16); IRCC news release "Changes to Express Entry for
   high-wage occupations" (October 2026); FSW six selection factors; proof of funds (July 7, 2025). */
(function () {
const { H } = WPCalc;
const HW = window.WP_HW_NOC || {};              // NOC -> [title, "A"|"B"|"C"] (2x, 1.5x, 1.3x)
const TIER = { A: ["2× median wage", 70, 100], B: ["1.5× median wage", 40, 70], C: ["1.3× median wage", 20, 50] };
const tierOf = (noc) => (HW[noc] ? HW[noc][1] : null);

const EDU = [["none", "Less than secondary (high) school"], ["hs", "Secondary diploma (high school)"], ["one", "One-year post-secondary program"], ["two", "Two-year post-secondary program"], ["bach", "Bachelor's degree, or a 3+ year program"], ["twoplus", "Two or more credentials, one of them 3+ years"], ["master", "Master's or professional degree (e.g. medicine, law)"], ["phd", "Doctoral degree (PhD)"]];
const AGE_W = [0, 90, 95, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 35, 25, 15, 5];
const AGE_WO = [0, 99, 105, 110, 110, 110, 110, 110, 110, 110, 110, 110, 110, 105, 99, 94, 88, 83, 77, 72, 66, 61, 55, 50, 39, 28, 17, 6];
const EDU_W = { none: 0, hs: 28, one: 84, two: 91, bach: 112, twoplus: 119, master: 126, phd: 140 };
const EDU_WO = { none: 0, hs: 30, one: 90, two: 98, bach: 120, twoplus: 128, master: 135, phd: 150 };
const CDN_W = [0, 35, 46, 56, 63, 70], CDN_WO = [0, 40, 53, 64, 72, 80];
const SP_EDU = { none: 0, hs: 2, one: 6, two: 7, bach: 8, twoplus: 9, master: 10, phd: 10 };
const SP_CDN = [0, 5, 7, 8, 9, 10];
const AB = ["L", "R", "W", "S"];
const l1 = (c, sp) => (c < 4 ? 0 : c <= 5 ? 6 : c === 6 ? (sp ? 8 : 9) : c === 7 ? (sp ? 16 : 17) : c === 8 ? (sp ? 22 : 23) : c === 9 ? (sp ? 29 : 31) : sp ? 32 : 34);
const l2 = (c) => (c <= 4 ? 0 : c <= 6 ? 1 : c <= 8 ? 3 : 6);
const spl = (c) => (c <= 4 ? 0 : c <= 6 ? 1 : c <= 8 ? 3 : 5);

const YRS = (n, plus) => Array.from({ length: n + 1 }, (_, i) => [String(i), i === 0 ? "None, or less than 1 year" : i === n && plus ? `${i} years or more` : `${i} year${i > 1 ? "s" : ""}`]);
const yes = (v, k) => v[k] === true;

WPCalc.define({
  id: "express-entry",
  short: "CRS score",
  max: 1200,
  resultTitle: "Comprehensive Ranking System score",
  resultEyebrow: "Express Entry · CRS",
  checked: "November 2, 2026",
  sources: [
    ["IRCC: Comprehensive Ranking System criteria", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html"],
    ["IRCC: Changes to Express Entry for high-wage occupations (from Nov 3, 2026)", "https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/changes-to-express-entry-for-high-wage-occupations.html"],
    ["IRCC: Federal Skilled Worker six selection factors", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/federal-skilled-workers/six-selection-factors-federal-skilled-workers.html"],
    ["IRCC: Proof of funds", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/become-candidate/eligibility/proof-funds.html"],
    ["IRCC: Language test equivalency charts", "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/standard-requirements/language-requirements/test-equivalency-charts.html"],
  ],
  sections: [
    { title: "Which rules?", hint: "IRCC changes how Canadian work experience and job offers score on November 3, 2026. Every profile in the pool is recalculated automatically.",
      fields: [
        { id: "rules", type: "select", label: "Score my profile under", full: true, def: "new", options: [["new", "Rules from November 3, 2026 (high-wage occupation points)"], ["old", "Rules until November 2, 2026"]] },
      ] },
    { title: "About you", fields: [
        { id: "age", type: "number", label: "Your age", min: 16, max: 70, def: 29, help: "Age on the day you'd get an invitation" },
        { id: "marital", type: "select", label: "Marital status", def: "single", options: [["single", "Single, divorced, separated or widowed"], ["married", "Married or common-law"]] },
        { id: "spAcc", type: "select", label: "Is your spouse or partner coming with you to Canada?", def: "yes", options: [["yes", "Yes, they'll come with me"], ["no", "No, they won't come"], ["cdn", "They're a Canadian citizen or permanent resident"]], show: (v) => v.marital === "married",
          help: "If they won't come, or they're already a citizen or PR, you're scored as single" },
        { id: "family", type: "number", label: "Family size", min: 1, max: 15, def: 1, help: "You, your spouse or partner and dependent children, even if they won't come. Used for proof of funds" },
      ] },
    { title: "Education", fields: [
        { id: "edu", type: "select", label: "Highest completed education", full: true, def: "bach", options: EDU, help: "Foreign education needs an Educational Credential Assessment (ECA)" },
        { id: "cdnEdu", type: "select", label: "Post-secondary education completed in Canada", full: true, def: "none", options: [["none", "None"], ["short", "1- or 2-year diploma or certificate"], ["long", "Degree, diploma or certificate of 3+ years, or a master's, professional or doctoral degree"]] },
      ] },
    { title: "Official languages", hint: "Enter your results. We convert them to CLB or NCLC levels using IRCC's charts.", fields: [
        { id: "en", type: "lang", label: "English test", def: "ielts", tests: ["ielts", "celpip", "pte", "clb"], help: "IELTS General Training, CELPIP-General or PTE Core. Academic versions aren't accepted" },
        { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true, help: "TEF Canada or TCF Canada" },
      ] },
    { title: "Work experience", hint: "Paid, full-time work (30 hours a week), or the same amount part-time.", fields: [
        { id: "cdnYears", type: "select", label: "Skilled work experience in Canada (last 10 years)", def: "0", options: YRS(5, true), help: "TEER 0, 1, 2 or 3 jobs with work authorization, not as a full-time student" },
        { id: "cdnTeer", type: "select", label: "TEER of your main Canadian job", def: "1", show: (v) => +v.cdnYears >= 1, options: [["0", "TEER 0 (management)"], ["1", "TEER 1"], ["2", "TEER 2"], ["3", "TEER 3"]], help: "Used for the Canadian Experience Class language minimum" },
        { id: "cdnRecent", type: "yesno", label: "Was at least 1 year of it in the last 3 years?", def: true, show: (v) => +v.cdnYears >= 1, help: "Needed for the Canadian Experience Class" },
        { id: "forYears", type: "select", label: "Skilled work experience outside Canada (last 10 years)", def: "0", options: YRS(6, true) },
        { id: "hwNoc1", type: "noc", label: "NOC of your Canadian job (high-wage check)", show: (v) => v.rules === "new" && +v.cdnYears >= 1, describe: (c) => (tierOf(c) ? `On IRCC's high-wage list: ${TIER[tierOf(c)][0]}` : "Not on IRCC's high-wage list"),
          help: "We check it against IRCC's high-wage occupation list" },
        { id: "hwMonths", type: "select", label: "Months of your Canadian experience in high-wage occupations", def: "auto", show: (v) => v.rules === "new" && +v.cdnYears >= 1,
          options: [["auto", "Use the NOC above for all my Canadian experience"], ["A", "12+ months in 2× tier jobs"], ["B", "12+ months in 1.5× tier or higher jobs (combined)"], ["C", "12+ months in 1.3× tier or higher jobs (combined)"], ["none", "Less than 12 months in high-wage jobs"]] },
        { id: "trade", type: "yesno", label: "Do you have a certificate of qualification in a skilled trade from a Canadian province or territory?" },
        { id: "tradeYears", type: "select", label: "Experience in a skilled trade (last 5 years)", def: "0", show: (v) => v.trade, options: YRS(5, true), help: "For the Federal Skilled Trades Program" },
      ] },
    { title: "Job offer and other points", fields: [
        { id: "offer", type: "yesno", label: "Do you have a valid job offer in Canada?", help: "Full-time, non-seasonal, at least 1 year after you become a permanent resident, TEER 0–3" },
        { id: "offerNoc", type: "noc", label: "Job offer NOC", show: (v) => v.offer, describe: (c) => (tierOf(c) ? `High-wage: ${TIER[tierOf(c)][0]}` : "Not on IRCC's high-wage list") },
        { id: "authWork", type: "yesno", label: "Are you authorized to work in Canada now?", show: (v) => v.offer, help: "Valid work permit or authorization. With a valid job offer this exempts you from proof of funds" },
        { id: "pnp", type: "yesno", label: "Provincial or territorial nomination", help: "+600 points" },
        { id: "sibling", type: "yesno", label: "Brother or sister in Canada", help: "18+, citizen or PR, living in Canada. Yours or your spouse's" },
        { id: "relative", type: "yesno", label: "Other relative in Canada (for FSW adaptability)", help: "Parent, grandparent, child, grandchild, aunt or uncle, niece or nephew, 18+, citizen or PR" },
      ] },
    { title: "Spouse or common-law partner", hint: "Only counts when they're coming with you and aren't a Canadian citizen or PR.", show: (v) => v.marital === "married" && v.spAcc === "yes", fields: [
        { id: "spEdu", type: "select", label: "Their highest education", def: "bach", options: EDU },
        { id: "spCdn", type: "select", label: "Their skilled work experience in Canada", def: "0", options: YRS(5, true) },
        { id: "spLang", type: "lang", label: "Their language test (first official language)", tests: ["ielts", "celpip", "pte", "tef", "tcf", "clb"] },
        { id: "spStudy", type: "yesno", label: "Did they study full-time in Canada for 2+ years?", help: "FSW adaptability" },
      ] },
  ],

  compute(v) {
    const sp = v.marital === "married" && v.spAcc === "yes";
    const age = Math.floor(H.num(v.age, 0)), newRules = v.rules === "new";
    const cy = +v.cdnYears || 0, fyRaw = +v.forYears || 0, fy = Math.min(fyRaw, 3);
    const en = v.en, fr = v.fr;
    const rows = [];
    // ---- A. core human capital
    const aAge = age < 17 || age >= 45 ? 0 : (sp ? AGE_W : AGE_WO)[age - 17] || 0;
    const aEdu = (sp ? EDU_W : EDU_WO)[v.edu] || 0;
    const pts = (first, second) => ({ a: first ? AB.reduce((s, k) => s + l1(first[k], sp), 0) : 0, b: second ? Math.min(sp ? 22 : 24, AB.reduce((s, k) => s + l2(second[k]), 0)) : 0 });
    const o1 = pts(en, fr), o2 = pts(fr, en);
    const frFirst = !!fr && o2.a + o2.b > o1.a + o1.b;
    const L = frFirst ? o2 : o1, first = frFirst ? fr : en;
    const lenPts = (sp ? CDN_W : CDN_WO)[Math.min(cy, 5)];
    let cdn = lenPts, cdnMax = sp ? 70 : 80, hwBonus = 0, offerPts = 0, cdnWhy = "";
    // high-wage tier of the Canadian experience
    let hwT = null;
    if (cy >= 1) hwT = v.hwMonths === "auto" ? tierOf(v.hwNoc1) : ["A", "B", "C"].includes(v.hwMonths) ? v.hwMonths : null;
    const offT = v.offer ? tierOf(v.offerNoc) : null;
    if (newRules) {
      hwBonus = hwT ? TIER[hwT][1] : 0;
      offerPts = offT ? TIER[offT][2] : 0;
      cdnMax = sp ? 140 : 150;
      const expRoute = lenPts + hwBonus;
      cdn = Math.min(cdnMax, Math.max(expRoute, offerPts));
      cdnWhy = offerPts > expRoute ? "job offer route" : "experience route";
    }
    const core = aAge + aEdu + L.a + L.b + cdn;
    rows.push(["A. Core / human capital", null, null, true],
      ["Age", aAge, sp ? 100 : 110], ["Education", aEdu, sp ? 140 : 150],
      [`First official language (${frFirst ? "French" : "English"})`, L.a, sp ? 128 : 136],
      [`Second official language (${frFirst ? "English" : "French"})`, L.b, sp ? 22 : 24]);
    if (newRules) {
      rows.push([`Labour market integration (${cdnWhy})`, cdn, cdnMax],
        ["· Canadian work length", lenPts], ["· High-wage occupation bonus", hwBonus], ["· Job offer (counts only if higher)", offerPts]);
    } else rows.push(["Canadian work experience", cdn, cdnMax]);
    // ---- B. spouse
    let spTot = 0;
    if (sp) {
      const se = SP_EDU[v.spEdu] || 0, sl = v.spLang ? Math.min(20, AB.reduce((s, k) => s + spl(v.spLang[k]), 0)) : 0, sc = SP_CDN[Math.min(+v.spCdn || 0, 5)];
      spTot = se + sl + sc;
      rows.push(["B. Spouse or partner factors", null, null, true], ["Spouse's education", se, 10], ["Spouse's first official language", sl, 20], ["Spouse's Canadian work experience", sc, 10]);
    }
    // ---- C. skill transferability (experience-length rules, not the high-wage rule)
    const m = first ? first.min : 0, all7 = m >= 7, all9 = m >= 9;
    const strong = ["twoplus", "master", "phd"].includes(v.edu), post = ["one", "two", "bach"].includes(v.edu);
    const eL = strong ? (all9 ? 50 : all7 ? 25 : 0) : post ? (all9 ? 25 : all7 ? 13 : 0) : 0;
    const eC = strong ? (cy >= 2 ? 50 : cy >= 1 ? 25 : 0) : post ? (cy >= 2 ? 25 : cy >= 1 ? 13 : 0) : 0;
    const fL = fy >= 3 ? (all9 ? 50 : all7 ? 25 : 0) : fy >= 1 ? (all9 ? 25 : all7 ? 13 : 0) : 0;
    const fC = fy >= 3 ? (cy >= 2 ? 50 : cy >= 1 ? 25 : 0) : fy >= 1 ? (cy >= 2 ? 25 : cy >= 1 ? 13 : 0) : 0;
    const allOver5 = first && m >= 5;
    const tc = v.trade ? (all7 ? 50 : allOver5 ? 25 : 0) : 0;
    const edT = Math.min(50, eL + eC), frT = Math.min(50, fL + fC), skill = Math.min(100, edT + frT + tc);
    rows.push(["C. Skill transferability", null, null, true], ["Education + language / Canadian work", edT, 50], ["Foreign work + language / Canadian work", frT, 50], ["Trade certificate + language", tc, 50]);
    // ---- D. additional
    let add = 0; const addRows = [];
    if (v.pnp) { add += 600; addRows.push(["Provincial or territorial nomination", 600]); }
    if (fr && fr.min >= 7) { const x = en && en.min >= 5 ? 50 : 25; add += x; addRows.push(["French-language skills", x]); }
    if (v.cdnEdu === "short") { add += 15; addRows.push(["Post-secondary education in Canada (1–2 years)", 15]); }
    if (v.cdnEdu === "long") { add += 30; addRows.push(["Post-secondary education in Canada (3+ years)", 30]); }
    if (v.sibling) { add += 15; addRows.push(["Brother or sister in Canada", 15]); }
    add = Math.min(600, add);
    rows.push(["D. Additional points", null, null, true], ...(addRows.length ? addRows : [["None", 0]]));
    const total = core + spTot + skill + add;

    // ---- FSW 67-point grid
    const fswLang1 = first ? AB.reduce((s, k) => s + (first[k] >= 9 ? 6 : first[k] === 8 ? 5 : first[k] === 7 ? 4 : 0), 0) : 0;
    const second = frFirst ? en : fr;
    const fswLang2 = second && second.min >= 5 ? 4 : 0;
    const fEdu = { none: 0, hs: 5, one: 15, two: 19, bach: 21, twoplus: 22, master: 23, phd: 25 }[v.edu] || 0;
    const skilledYrs = cy + fyRaw;
    const fExp = skilledYrs >= 6 ? 15 : skilledYrs >= 4 ? 13 : skilledYrs >= 2 ? 11 : skilledYrs >= 1 ? 9 : 0;
    const fAge = age < 18 ? 0 : age <= 35 ? 12 : Math.max(0, 12 - (age - 35));
    const fJob = v.offer ? 10 : 0;
    let ad = 0; const adRows = [];
    if (sp && v.spLang && v.spLang.min >= 4) { ad += 5; adRows.push("spouse's language CLB 4+ (5)"); }
    if (v.cdnEdu !== "none") { ad += 5; adRows.push("your Canadian study (5)"); }
    if (sp && v.spStudy) { ad += 5; adRows.push("spouse's Canadian study (5)"); }
    if (cy >= 1) { ad += 10; adRows.push("your Canadian work (10)"); }
    if (sp && +v.spCdn >= 1) { ad += 5; adRows.push("spouse's Canadian work (5)"); }
    if (v.offer) { ad += 5; adRows.push("arranged employment (5)"); }
    if (v.sibling || v.relative) { ad += 5; adRows.push("relative in Canada (5)"); }
    ad = Math.min(10, ad);
    const fsw = Math.min(28, fswLang1 + fswLang2) + fEdu + fExp + fAge + fJob + ad;

    // ---- program eligibility
    const famN = Math.max(1, Math.floor(H.num(v.family, 1)));
    const needFunds = H.funds(H.FUNDS_EE, H.FUNDS_EE_ADD, famN);
    const fundsExempt = v.offer && v.authWork;
    const clbTeer = +v.cdnTeer <= 1 ? 7 : 5;
    const cec = [
      [cy >= 1 && v.cdnRecent, "1 year of skilled Canadian work experience in the last 3 years"],
      [!!first && m >= clbTeer, `Language: CLB ${clbTeer} in all four abilities for TEER ${v.cdnTeer || "0–3"} work${first ? ` (yours: ${m})` : ""}`],
      [true, "No proof of funds needed"],
    ];
    const fswC = [
      [skilledYrs >= 1, "1 year of continuous skilled work (TEER 0–3) in the last 10 years"],
      [!!first && m >= 7, `CLB 7 in all four abilities${first ? ` (yours: ${m})` : ""}`],
      [v.edu !== "none", "Secondary education or higher (with an ECA if completed abroad)"],
      [fsw >= 67, `At least 67 of 100 selection points (yours: ${fsw})`],
      [fundsExempt ? true : null, fundsExempt ? "Exempt from proof of funds: authorized to work with a valid job offer" : `Proof of funds: ${H.money(needFunds)} for a family of ${famN}`],
    ];
    const ts = first ? (first.S >= 5 && first.L >= 5 && first.R >= 4 && first.W >= 4) : false;
    const fst = [
      [v.trade ? +v.tradeYears >= 2 : false, "2 years of full-time work in a skilled trade in the last 5 years"],
      [ts, "CLB 5 speaking and listening, CLB 4 reading and writing"],
      [v.trade || v.offer ? true : false, "A Canadian certificate of qualification in the trade, or a valid job offer"],
      [fundsExempt ? true : null, fundsExempt ? "Exempt from proof of funds" : `Proof of funds: ${H.money(needFunds)} for a family of ${famN}`],
    ];
    const okAll = (items) => (items.some(([ok]) => ok === false) ? false : true);
    const checks = [
      { name: "Canadian Experience Class", ok: okAll(cec), items: cec },
      { name: "Federal Skilled Worker Program", ok: okAll(fswC), items: fswC },
      { name: "Federal Skilled Trades Program", ok: okAll(fst), items: fst },
    ];
    const eligibleAny = checks.some((c) => c.ok);

    const notes = [];
    if (newRules && cy >= 1 && v.hwMonths === "auto" && !H.nocOk(v.hwNoc1)) notes.push("Enter your Canadian job's NOC to check for high-wage occupation points.");
    if (newRules && v.offer && !H.nocOk(v.offerNoc)) notes.push("Enter the job offer's NOC to see if it earns job offer points.");
    if (newRules && v.offer && H.nocOk(v.offerNoc) && !offT) notes.push("The job offer's NOC isn't on IRCC's high-wage list, so it earns no CRS points. It can still count for program eligibility and FSW points.");
    if (!newRules && v.offer) notes.push("Until November 2, 2026, job offers earn no CRS points (removed March 25, 2025). From November 3 they can earn 50, 70 or 100 if the NOC is on the high-wage list.");
    if (newRules) notes.push("From November 3, 2026, no LMIA is needed for job offer points, and an LMIA gives no extra points. IRCC still checks that every offer is genuine.");
    if (v.en && v.en.test === "clb" || v.fr && v.fr.test === "clb") notes.push("You entered CLB/NCLC levels directly. Make sure they come from an approved test taken in the last 2 years.");
    if (!first) notes.push("Add a language test. You can't enter the Express Entry pool without one.");
    if (age >= 45) notes.push("Age points end at 45. Other factors still count.");

    const verdict = !first ? "Add your language results to see a full score." :
      eligibleAny ? `You look eligible for at least one Express Entry program. Your estimated CRS is <b>${total}</b>${v.pnp ? " including the 600 nomination points" : ""}. Compare it with the latest draws on the WorkerPool home page.` :
      `Your estimated CRS is <b>${total}</b>, but you don't meet a program's minimum requirements yet, so you couldn't enter the pool. See the checks below.`;

    return {
      total, max: 1200, rows, status: !first ? "warn" : eligibleAny ? "good" : "bad", verdict, notes,
      panels: [
        { eyebrow: "Federal Skilled Worker", title: "FSW selection grid", total: fsw, max: 100, mark: 67, markLabel: "Pass mark 67",
          status: fsw >= 67 ? "good" : "bad", verdict: fsw >= 67 ? "Meets the 67-point pass mark." : `Below the 67-point pass mark by ${67 - fsw}.`,
          rows: [["Language (first + second)", Math.min(28, fswLang1 + fswLang2), 28], ["Education", fEdu, 25], ["Experience", fExp, 15], ["Age", fAge, 12], ["Arranged employment", fJob, 10], ["Adaptability" + (adRows.length ? ` (${adRows.join(", ")})` : ""), ad, 10]] },
        { eyebrow: "Program eligibility", title: "Which Express Entry programs fit", checks,
          notes: ["Each program's work experience must be paid, in TEER 0–3 (FST: a listed skilled trade) and match the main duties of the NOC.", "From November 3, 2026, IRCC's temporary public policy lets candidates invited on or after that date use a job offer without an LMIA to meet FSW and FST requirements."] },
      ],
    };
  },
});
})();
