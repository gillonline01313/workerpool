/* Rural Community Immigration Pilot (RCIP) and Francophone Community Immigration Pilot (FCIP) calculator.
   The page sets window.WP_PILOT to "rcip" or "fcip".
   Federal requirements: IRCC RCIP program delivery instructions ("Application process and who can apply");
   proof of funds (updated July 29, 2025, same amounts for both pilots).
   Community grids (125 points: job offer, experience, language, education, intent to reside, 25 each):
   Sudbury (Invest Sudbury RCIP grid), Timmins (Timmins EDC 2026 grid, RCIP and FCIP), Pictou County
   (2026 grid), West Kootenay and North Okanagan Shuswap (published grids). Others don't publish their
   job offer points, so that factor is an estimate. */
(function () {
const { H } = WPCalc;
const PILOT = window.WP_PILOT === "fcip" ? "fcip" : "rcip";
const BC = window.WP_RCIP_BC || { wk: [], nos: [] };

// Sector points by NOC broad category (first digit); occupation points by NOC.
const GRIDS = {
  sudbury: { name: "Sudbury", sector: { 3: 15, 8: 15, 7: 15, 1: 10, 4: 10, 2: 10 }, occ: { "42202": 12, "31102": 10, "31301": 10, "32101": 10, "42201": 10, "42203": 10, "21330": 10, "22100": 10, "22300": 10, "22301": 10, "22303": 10, "22310": 10, "72401": 10, "72410": 10, "72106": 10, "72400": 10, "32109": 8, "70010": 8, "72411": 8, "73300": 2, "74203": 2 }, minEach: false },
  timmins: { name: "Timmins", sector: { 3: 10, 4: 10, 7: 15, 8: 15, 9: 15 }, occ: { "31301": 10, "32101": 10, "72401": 10, "73400": 10, "12111": 8, "21330": 8, "32104": 8, "42201": 8, "42202": 8, "44101": 8, "72100": 8, "72200": 8, "72410": 8, "33102": 7, "72106": 7, "72400": 7, "12200": 5, "13110": 5, "22101": 5, "33101": 5, "73300": 5, "74203": 5, "75110": 5, "84100": 5, "95103": 5 }, minEach: true },
  pictou: { name: "Pictou County", sector: { 1: 5, 3: 5, 4: 5, 6: 5, 7: 5, 9: 5 }, occ: { "12200": 10, "21211": 20, "22212": 15, "21220": 20, "21221": 20, "21232": 20, "21301": 20, "22301": 15, "31120": 20, "33103": 15, "42202": 15, "60020": 15, "63200": 10, "63202": 10, "72100": 20, "72310": 20, "72400": 20, "72402": 15, "72410": 15, "72411": 15, "75110": 10, "92014": 15, "94132": 15, "94152": 15, "94201": 15 }, minEach: true },
  wk: { name: "West Kootenay", sector: { 1: 15, 2: 15, 3: 20, 4: 20, 6: 10, 7: 20, 8: 15, 9: 15 }, occ: Object.fromEntries((BC.wk || []).map((n) => [n[0], n[2]])), minEach: true },
};
const COMM = PILOT === "rcip" ? [
  ["pictou", "Pictou County, NS", "pictou"], ["northbay", "North Bay and Area, ON", null], ["sudbury", "Sudbury, ON", "sudbury"], ["timmins", "Timmins, ON", "timmins"],
  ["sault", "Sault Ste. Marie, ON", null], ["thunderbay", "Thunder Bay, ON", null], ["steinbach", "Steinbach, MB", null], ["altona", "Altona / Rhineland, MB", "fcfs"],
  ["brandon", "Brandon, MB", null], ["moosejaw", "Moose Jaw, SK", null], ["claresholm", "Claresholm, AB", null], ["wk", "West Kootenay, BC", "wk"],
  ["nos", "North Okanagan Shuswap, BC", "nos"], ["pl", "Peace Liard, BC", null],
] : [
  ["acadian", "Acadian Peninsula, NB", null], ["sudburyF", "Sudbury, ON", null], ["timminsF", "Timmins, ON", "timmins"], ["superior", "Superior East Region, ON", null],
  ["stpj", "St. Pierre Jolys, MB", null], ["kelowna", "Kelowna, BC", null],
];
const gridOf = (k) => (COMM.find((c) => c[0] === k) || [])[2] || null;
const nameOf = (k) => (COMM.find((c) => c[0] === k) || [])[1] || "";

WPCalc.define({
  id: PILOT, short: PILOT.toUpperCase() + " points", max: 125,
  resultTitle: "Community ranking score", resultEyebrow: PILOT === "rcip" ? "Rural Community Immigration Pilot" : "Francophone Community Immigration Pilot",
  checked: "November 2, 2026",
  sources: [
    ["IRCC: RCIP application process and who can apply", "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/permanent-residence/economic-classes/rural-community-immigration/application-who.html"],
    ["IRCC: RCIP proof of funds", "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/rural-franco-pilots/rural-immigration/eligibility/proof-funds.html"],
    ["Invest Sudbury: RCIP community scoring grid", "https://investsudbury.ca/why-sudbury/newcomers/rcipfcip/rcip-program-community-scoring-grid/"],
    ["Timmins EDC: community scoring grid 2026 (PDF)", "https://timminsedc.com/wp-content/uploads/2026/02/Community-Scoring-Grid-RCIP-2026-EN.pdf"],
    ["Pictou County RCIP: 2026 scoring grids (PDF)", "https://pcrcip.ca/wp-content/uploads/Scoring-Grids-for-EDOs-2026_PCP.pdf"],
  ],
  sections: [
    { title: "Community and job offer", hint: "You need a full-time, year-round, permanent job offer from an employer the community has designated.", fields: [
      { id: "comm", type: "select", label: "Community", full: true, def: COMM[0][0], options: COMM.map((c) => [c[0], c[1]]) },
      { id: "noc", type: "noc", label: "Job offer NOC" },
      { id: "wage", type: "number", label: "Hourly wage of the job offer ($)", min: 0, step: 0.01, def: "", show: (v) => gridOf(v.comm) === "nos", help: "North Okanagan Shuswap sets a minimum wage per NOC and adds points for paying above it" },
      { id: "onList", type: "yesno", label: "Is the occupation on the community's priority list?", show: (v) => !["sudbury", "timmins", "pictou", "wk", "nos", "fcfs"].includes(gridOf(v.comm)), def: true, help: "This community doesn't publish job offer points, so we estimate this factor" },
      { id: "designated", type: "yesno", label: "Is the employer designated by the community?", def: true },
      { id: "wageOk", type: "yesno", label: "Wage at or above Job Bank's median for the occupation in the region?", def: true },
    ] },
    { title: "Work experience", hint: "1 year (1,560 hours) of paid work in the last 3 years, full-time or the same amount part-time.", fields: [
      { id: "exp", type: "select", label: "Related work experience (last 3 years)", def: "1", options: [["0", "Less than 1 year"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years"], ["4", "4 years or more"]], help: "Some communities count up to 4 years for points; IRCC checks 1 year in the last 3" },
      { id: "expTeer", type: "select", label: "TEER of that experience", def: "same", options: [["same", "Same 5-digit NOC as the job offer"], ["0", "TEER 0"], ["1", "TEER 1"], ["2", "TEER 2"], ["3", "TEER 3"], ["4", "TEER 4"], ["5", "TEER 5 (different NOC)"]] },
      { id: "rn", type: "yesno", label: "Is the experience as a registered nurse (NOC 31301)?", show: (v) => ["33102", "44101"].includes(v.noc), help: "Healthcare exception for nurse aide and home support jobs" },
      { id: "grad", type: "yesno", label: "Do you qualify for the international graduate exemption?", help: "Full-time 2+ year program (or master's/PhD) at a public institution in the community, finished in the last 18 months, with the required time living there" },
    ] },
    { title: "Language and education", fields: [
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true, help: PILOT === "fcip" ? "FCIP needs NCLC 5 in all four abilities" : "" },
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"], show: () => PILOT === "rcip" },
      { id: "edu", type: "select", label: "Highest completed education", full: true, def: "bach", options: [["none", "Less than high school"], ["hs", "Canadian high school diploma, or foreign equivalent (ECA)"], ["post", "Post-secondary credential (1+ year), diploma or trade certificate"], ["bach", "Bachelor's degree (3+ years)"], ["master", "Master's or PhD"]] },
    ] },
    { title: "Intent to reside", hint: "A written statement of intent to live in the community is required. Ties to the community add points.", fields: [
      { id: "intent", type: "yesno", label: "Will you provide a genuine written statement of intent?", def: true },
      { id: "local", type: "select", label: "Past work or study in the community", def: "0", options: [["0", "None"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years or more"]] },
      { id: "ties", type: "checks", label: "Other ties", options: [["fam", "Close family member (18+, citizen or PR) living in the community 12+ months"], ["vol", "Volunteering or active in a community group for 3+ months (with a reference letter)"], ["home", "Renting or owning a home in the community"], ["sp", "Spouse or partner with 6+ months of work or study in the community"]] },
    ] },
    { title: "Proof of funds", fields: [
      { id: "family", type: "number", label: "Family size", min: 1, max: 15, def: 1, help: "Include family members who won't come with you" },
      { id: "wp", type: "yesno", label: "Working in Canada now with a valid work permit?", help: "If yes, you don't need proof of funds" },
    ] },
  ],
  compute(v) {
    const G = gridOf(v.comm), cname = nameOf(v.comm), t = H.teerOf(v.noc), boc = H.bocOf(v.noc), haveT = t != null;
    const rows = [], notes = [];
    let estimate = false;
    // ---- job offer factor
    let job = 0;
    if (G === "fcfs") { notes.push(`${cname} doesn't rank candidates with points. Designated employers post jobs on the community's job board and eligible candidates are recommended first come, first served.`); }
    if (!H.nocOk(v.noc)) notes.push("Enter the job offer's NOC to score the job offer factor.");
    else if (G && GRIDS[G]) {
      const g = GRIDS[G], s = g.sector[boc] || 0, o = g.occ[v.noc] || 0;
      job = Math.min(25, s + o);
      rows.push([`Job offer: sector (${H.BOC[boc]})`, s], [`Job offer: occupation NOC ${v.noc}`, o]);
      if (!o) notes.push(`NOC ${v.noc} isn't on ${cname}'s priority occupation list, so it earns sector points only.`);
    } else if (G === "nos") {
      const list = BC.nos || [], e = list.find((n) => n[0] === v.noc), min = e ? e[2] : null, w = H.num(v.wage, 0);
      const s = GRIDS.wk.sector[boc] || 0, over = min ? w - min : 0, wb = min && w ? (over >= 5 ? 5 : over >= 2 ? 3 : 0) : 0;
      job = Math.min(25, s + wb); estimate = true;
      rows.push(["Job offer: occupation category (estimated)", s], ["Wage above the community minimum", wb]);
      if (min && w && w < min) notes.push(`North Okanagan Shuswap's minimum wage for NOC ${v.noc} is $${min.toFixed(2)}/hour.`);
      if (!e) notes.push(`NOC ${v.noc} isn't on North Okanagan Shuswap's eligible occupation list.`);
    } else if (G !== "fcfs") {
      job = v.onList ? 20 : 10; estimate = true;
      rows.push([`Job offer (estimate: ${v.onList ? "priority occupation" : "valid offer, not a priority occupation"})`, job]);
    }
    // ---- experience
    const ey = +v.exp;
    const we = ey >= 1 ? [0, 10, 15, 20, 25][ey] : v.grad ? 10 : 0;
    rows.push([`Work experience${ey < 1 && v.grad ? " (graduate exemption)" : ""}`, we, 25]);
    // ---- language
    let lang = 0, lmin = 0, lname = "";
    if (PILOT === "fcip") {
      lmin = v.fr ? v.fr.min : 0; lname = `French NCLC ${lmin || "—"}`;
      lang = lmin >= 8 ? 25 : lmin === 7 ? 20 : lmin === 6 ? 15 : lmin === 5 ? 10 : 0;
    } else {
      const b = H.best(v.en, v.fr); lmin = b ? b.min : 0; lname = `CLB ${lmin || "—"}, TEER ${haveT ? t : "?"} job`;
      const base = !haveT ? 6 : t <= 1 ? 6 : t <= 3 ? 5 : 4;
      lang = lmin >= base + 3 ? 25 : lmin === base + 2 ? 20 : lmin === base + 1 ? 15 : lmin === base ? 10 : 0;
    }
    rows.push([`Language (${lname})`, lang, 25]);
    // ---- education
    const ed = { none: 0, hs: 10, post: 15, bach: 20, master: 25 }[v.edu];
    rows.push(["Education", ed, 25]);
    // ---- intent
    const tie = { 0: 0, 1: 2, 2: 4, 3: 6 }[v.local] + (v.ties || []).reduce((s, k) => s + (k === "sp" ? 3 : 2), 0);
    const intent = v.intent ? 10 + Math.min(15, tie) : 0;
    rows.push(["Intent to reside: statement", v.intent ? 10 : 0], ["Intent to reside: community ties", v.intent ? Math.min(15, tie) : 0, 15]);
    const factors = [job, we, lang, ed, intent];
    const total = factors.reduce((a, b) => a + b, 0);
    const minEach = G && GRIDS[G] ? GRIDS[G].minEach : true;
    const passComm = G === "fcfs" ? null : total >= 50 && (!minEach || factors.every((f) => f >= 10));
    if (estimate) notes.push(`${cname} doesn't publish all of its grid, so the job offer factor is an estimate on the common 125-point structure.`);
    if (minEach && G !== "fcfs") notes.push("Most communities need at least 50 points and at least 10 in each of the five factors to enter the candidate pool.");

    // ---- federal (IRCC) requirements
    const famN = Math.max(1, Math.floor(H.num(v.family, 1))), funds = H.funds(H.FUNDS_RURAL, H.FUNDS_RURAL_ADD, famN);
    const et = v.expTeer;
    let teerOk = null;
    if (haveT && ey >= 1) {
      if (et === "same") teerOk = true;
      else { const e = +et; teerOk = t <= 1 ? e <= 3 : t === 2 ? e >= 1 && e <= 4 : t <= 4 ? (e >= 2 && e <= 4) || (v.rn && ["33102", "44101"].includes(v.noc)) : false; }
    }
    const fed = [
      [v.designated, "Job offer from a designated employer in the community (full-time, year-round, permanent)"],
      [v.wageOk, "Wage at or above Job Bank's regional median for the occupation"],
      [ey >= 1 || v.grad, "1 year (1,560 hours) of paid work in the last 3 years, or the international graduate exemption"],
      [v.grad && ey < 1 ? true : teerOk, haveT ? `Experience TEER fits a TEER ${t} job offer${t === 5 ? " (TEER 5: same NOC only)" : ""}` : "Experience TEER must fit the job offer's TEER"],
      PILOT === "fcip" ? [lmin >= 5, `French NCLC 5 in all four abilities${lmin ? ` (yours: ${lmin})` : ""}`]
        : [haveT ? lmin >= (t <= 1 ? 6 : t <= 3 ? 5 : 4) : null, haveT ? `CLB/NCLC ${t <= 1 ? 6 : t <= 3 ? 5 : 4} in all four abilities for a TEER ${t} job${lmin ? ` (yours: ${lmin})` : ""}` : "Language minimum depends on the job offer's TEER"],
      [v.edu !== "none", "Canadian high school diploma or equivalent (foreign credentials need an ECA)"],
      [v.wp ? true : null, v.wp ? "No proof of funds needed: you're working in Canada with a work permit" : `Proof of funds: ${H.money(funds)} for a family of ${famN}`],
      [v.intent, "Intends to live in the community"],
    ];
    const fedOk = !fed.some(([o]) => o === false);
    const status = !fedOk ? "bad" : passComm === false ? "warn" : "good";
    const verdict = G === "fcfs" ? (fedOk ? "You meet the federal basics. This community recommends first come, first served." : "You don't meet the federal basics yet; see the checks.") :
      !fedOk ? `You score <b>${total}</b> on ${cname}'s grid, but you don't meet IRCC's basic requirements yet.` :
      passComm ? `You meet the federal basics and ${cname}'s pool minimum. Communities recommend the highest scores in each intake, so a higher score improves your chances.` :
      `You meet the federal basics, but not ${cname}'s minimum to enter the pool (50 points${minEach ? " and 10 in each factor" : ""}).`;
    return { total: G === "fcfs" ? null : total, max: 125, mark: 50, markLabel: "Pool minimum 50", rows: G === "fcfs" ? [] : rows, status, verdict,
      title: `${cname} ranking score`, notes,
      panels: [{ eyebrow: "IRCC requirements", title: `Federal ${PILOT.toUpperCase()} eligibility`, checks: [{ name: PILOT === "rcip" ? "Rural Community Immigration Pilot" : "Francophone Community Immigration Pilot", ok: fedOk, items: fed }],
        notes: ["After the community recommends you, you apply to IRCC for permanent residence. Each community has a yearly allocation and its own intake dates."] }] };
  },
});
})();
