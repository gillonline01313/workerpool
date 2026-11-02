/* BC PNP Skills Immigration Registration System (SIRS), out of 200.
   Source: BC PNP Skills Immigration Program Guide, Part 8 (guide effective June 10, 2026). */
(function () {
const { H } = WPCalc;
WPCalc.define({
  id: "bc-sirs", short: "BC PNP SIRS", max: 200,
  resultTitle: "SIRS registration score", resultEyebrow: "British Columbia · BC PNP Skills Immigration",
  checked: "November 2, 2026",
  sources: [
    ["BC PNP Skills Immigration Program Guide (Part 8: scoring)", "https://www.welcomebc.ca/immigrate-to-b-c/bc-pnp-si-program-guide-pdf"],
    ["WelcomeBC: Invitations to apply", "https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program/invitations-to-apply"],
  ],
  sections: [
    { title: "BC job offer", hint: "Skills Immigration registrations need a full-time, indeterminate job offer from a BC employer.", fields: [
      { id: "noc", type: "noc", label: "Job offer NOC" },
      { id: "wage", type: "number", label: "Hourly base wage of the job offer ($)", min: 0, step: 0.01, def: 28, help: "Base rate only. Tips, overtime, bonuses and allowances don't count. Annual salary ÷ (weekly hours × 52)" },
      { id: "area", type: "select", label: "Where is the job?", full: true, def: "1", options: [["1", "Area 1: Metro Vancouver Regional District"], ["2", "Area 2: Squamish, Abbotsford, Agassiz, Mission or Chilliwack"], ["3", "Area 3: anywhere else in BC"]] },
      { id: "regional", type: "yesno", label: "Regional experience or alumni bonus", show: (v) => v.area !== "1", help: "You've worked in, or graduated from a post-secondary institution in, the same Area 2 or 3 region as the job (see the guide for details)" },
    ] },
    { title: "Directly related work experience", hint: "Experience in the same occupation as the job offer, in the last 10 years. Part-time counts at 50%.", fields: [
      { id: "dr", type: "select", label: "Directly related experience", def: "2", options: [["0", "None"], ["0.5", "Less than 1 year"], ["1", "1 to under 2 years"], ["2", "2 to under 3 years"], ["3", "3 to under 4 years"], ["4", "4 to under 5 years"], ["5", "5 years or more"]] },
      { id: "drCdn", type: "yesno", label: "At least 1 year of it was in Canada?", show: (v) => +v.dr >= 1 },
      { id: "current", type: "yesno", label: "Currently working full-time in BC for this employer in this job?" },
    ] },
    { title: "Education", fields: [
      { id: "edu", type: "select", label: "Highest completed education", full: true, def: "bach", options: [["none", "Secondary school (high school) or less"], ["dip", "Post-secondary diploma or certificate (trades or non-trades)"], ["assoc", "Associate degree"], ["bach", "Bachelor's degree"], ["pgcert", "Post-graduate certificate or diploma"], ["master", "Master's degree"], ["phd", "Doctoral degree"]] },
      { id: "eduWhere", type: "select", label: "Where was it completed?", def: "outside", show: (v) => v.edu !== "none", options: [["outside", "Outside Canada"], ["bc", "In BC"], ["canada", "In Canada, outside BC"]] },
      { id: "desig", type: "yesno", label: "Eligible professional designation in BC?", help: "For example a trade certificate of qualification or a listed professional designation tied to the job" },
    ] },
    { title: "Language", hint: "Points use the lowest of your four abilities.", fields: [
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
    ] },
  ],
  compute(v) {
    const wage = H.num(v.wage, 0), wPts = wage >= 70 ? 55 : wage < 16 ? 0 : Math.max(0, Math.min(55, Math.floor(wage) - 15));
    const area = { 1: 0, 2: 5, 3: 15 }[v.area] || 0, reg = v.area !== "1" && v.regional ? 10 : 0;
    const dy = +v.dr, base = dy >= 5 ? 20 : dy >= 4 ? 16 : dy >= 3 ? 12 : dy >= 2 ? 8 : dy >= 1 ? 4 : dy > 0 ? 1 : 0;
    const drB1 = dy >= 1 && v.drCdn ? 10 : 0, drB2 = v.current ? 10 : 0;
    const dr = Math.min(40, base + drB1 + drB2);
    const edBase = { none: 0, dip: 5, assoc: 5, bach: 15, pgcert: 15, master: 22, phd: 27 }[v.edu] || 0;
    const edLoc = v.edu !== "none" ? (v.eduWhere === "bc" ? 8 : v.eduWhere === "canada" ? 6 : 0) : 0;
    const ed = Math.min(40, edBase + edLoc + (v.desig ? 5 : 0));
    const best = H.best(v.en, v.fr), c = best ? best.min : 0;
    const lb = c >= 9 ? 30 : c === 8 ? 25 : c === 7 ? 20 : c === 6 ? 15 : c === 5 ? 10 : c === 4 ? 5 : 0;
    const bil = v.en && v.fr && v.en.min >= 4 && v.fr.min >= 4 ? 10 : 0;
    const lang = Math.min(40, lb + bil);
    const total = dr + ed + lang + wPts + area + reg;
    const rows = [["Human capital", null, null, true],
      ["Directly related experience", base], ["· 1+ year in Canada", drB1], ["· Working full-time in BC for the employer", drB2],
      ["Education", edBase], ["· Completed in BC / Canada", edLoc], ["· Professional designation in BC", v.desig ? 5 : 0],
      [`Language (lowest CLB ${c || "—"})`, lb], ["· English and French both CLB 4+", bil],
      ["Economic factors", null, null, true],
      [`Hourly wage ($${wage.toFixed(2)})`, wPts, 55], ["Area of employment", area, 15], ["· Regional bonus", reg, 10]];
    const notes = [];
    const t = H.teerOf(v.noc);
    if (t != null && t >= 4) notes.push("TEER 4 and 5 jobs only qualify under the Entry Level and Semi-Skilled stream (Northeast BC and some tourism, hospitality and food processing jobs) or the Health Authority stream.");
    notes.push("Since 2025 BC invites mostly by priority group (for example health, childcare, veterinary care, construction trades and high economic impact jobs) with their own cut-offs. Check the latest BC PNP rounds before registering.");
    notes.push("Since June 13, 2026 some occupations are ineligible for Skills Immigration. Check the guide's ineligible occupations list for your NOC.");
    if (v.fr && !v.en) notes.push("BC needs valid test results; French results count toward language points.");
    return { total, rows, notes,
      status: total >= 120 ? "good" : total >= 90 ? "warn" : "bad",
      verdict: `Human capital <b>${dr + ed + lang}</b>/120 · Economic <b>${wPts + area + reg}</b>/80. Recent BC priority rounds have invited scores from the 60s (health, rural health) to the 130s (high economic impact), so your score matters most within your priority group.` };
  },
});
})();
