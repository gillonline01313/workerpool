/* OINP Ontario Workforce Priority stream: Expression of Interest score.
   Ontario published the scoring factors on July 20, 2026 and raised the Canadian earnings factor on
   October 5, 2026. Ontario doesn't publish a maximum; the top bands add to 132. Eight older streams
   closed when amendments to O. Reg. 422/17 took effect June 25, 2026. */
(function () {
const { H } = WPCalc;
WPCalc.define({
  id: "on-owp", short: "OINP EOI", max: 132,
  resultTitle: "Ontario Workforce Priority EOI score", resultEyebrow: "Ontario · OINP",
  checked: "November 2, 2026",
  sources: [
    ["Ontario: Ontario Workforce Priority stream", "https://www.ontario.ca/page/ontario-workforce-priority-stream"],
  ],
  sections: [
    { title: "Job offer", hint: "The Ontario Workforce Priority stream needs a job offer from an Ontario employer (self-employed physicians apply in their own category).", fields: [
      { id: "phys", type: "yesno", label: "Are you a self-employed physician practising in Ontario?" },
      { id: "noc", type: "noc", label: "Job offer NOC", show: (v) => !v.phys, help: "Sets the TEER and broad occupation category points" },
      { id: "wage", type: "number", label: "Hourly wage of the job offer ($)", min: 0, step: 0.01, def: 28, show: (v) => !v.phys },
      { id: "region", type: "select", label: "Where is the job?", full: true, def: "gta", options: [["north", "Northern Ontario"], ["east", "Eastern Ontario, Central Ontario outside the GTA, or Southwestern Ontario"], ["gta", "Greater Toronto Area, outside the City of Toronto"], ["toronto", "City of Toronto"]] },
    ] },
    { title: "Ontario work experience", fields: [
      { id: "inPos", type: "select", label: "Full-time months in the job offer position, in Ontario", def: "0", show: (v) => !v.phys, options: [["0", "Under 6 months, or not in this position"], ["6", "6 to 12 months"], ["13", "13 to 24 months"], ["25", "Over 24 months"]] },
      { id: "onExp", type: "select", label: "Other full-time work experience in Ontario", def: "0", show: (v) => !v.phys && v.inPos === "0", options: [["0", "Under 6 months, or none"], ["6", "6 to 12 months"], ["13", "13 to 24 months"], ["25", "Over 24 months"]] },
      { id: "physExp", type: "select", label: "Cumulative Ontario medical practice", def: "0", show: (v) => v.phys, options: [["0", "Under 6 months"], ["6", "6 to 12 months"], ["13", "13 to 24 months"], ["25", "Over 24 months"]] },
      { id: "earn", type: "select", label: "Highest yearly Canadian earnings in the last 5 years (CRA Notice of Assessment)", full: true, def: "0", options: [["0", "Under $30,000"], ["30", "$30,000 to $49,999"], ["50", "$50,000 to $69,999"], ["70", "$70,000 to $79,999"], ["80", "$80,000 or more"]] },
      { id: "status", type: "select", label: "Legal status in Canada", def: "wp", options: [["wp", "Valid work permit"], ["sp", "Valid study permit"], ["none", "Neither, or outside Canada"]] },
    ] },
    { title: "Education and language", fields: [
      { id: "edu", type: "select", label: "Highest education", full: true, def: "bach", options: [["none", "Less than a college or trade credential"], ["college", "College diploma or certificate, trades or apprenticeship credential, or university certificate below bachelor's"], ["bach", "Bachelor's degree, or a university certificate above bachelor's"], ["master", "Master's degree"], ["phd", "Doctorate, or a medicine, dentistry, veterinary or optometry degree"]] },
      { id: "cdnCred", type: "select", label: "Canadian post-secondary credentials (each 1+ year full-time)", def: "0", options: [["0", "None"], ["1", "One"], ["2", "Two or more"]] },
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
    ] },
  ],
  compute(v) {
    const t = H.teerOf(v.noc), boc = H.bocOf(v.noc);
    const teer = v.phys ? 9 : t == null ? 0 : t <= 1 ? 9 : t <= 3 ? 6 : 0;
    const cat = v.phys ? 10 : boc == null ? 0 : boc === 3 ? 10 : boc === 7 ? 8 : boc === 2 ? 6 : [5, 6].includes(boc) ? 2 : 4;
    const w = H.num(v.wage, 0), wage = v.phys ? 0 : w >= 40 ? 15 : w >= 35 ? 12 : w >= 30 ? 10 : w >= 25 ? 8 : w >= 20 ? 5 : 0;
    const A = { 0: 0, 6: 12, 13: 15, 25: 18 }, B = { 0: 0, 6: 6, 13: 9, 25: 12 };
    const exp = v.phys ? A[v.physExp] : v.inPos !== "0" ? A[v.inPos] : B[v.onExp];
    const earn = { 0: 0, 30: 4, 50: 6, 70: 8, 80: 10 }[v.earn];
    const st = { wp: 10, sp: 5, none: 0 }[v.status];
    const ed = { none: 0, college: 5, bach: 6, master: 8, phd: 10 }[v.edu];
    const cc = { 0: 0, 1: 5, 2: 10 }[v.cdnCred];
    const best = H.best(v.en, v.fr), c = best ? best.min : 0;
    const lang = c >= 9 ? 15 : c === 8 ? 12 : c === 7 ? 8 : c === 6 ? 4 : 0;
    const bil = v.en && v.fr && v.en.min >= 6 && v.fr.min >= 6 ? 10 : best ? 5 : 0;
    const reg = { north: 15, east: 10, gta: 5, toronto: 0 }[v.region];
    const total = teer + cat + wage + exp + earn + st + ed + cc + lang + bil + reg;
    const notes = [];
    if (!v.phys && !H.nocOk(v.noc)) notes.push("Enter the job offer's NOC to score the TEER and occupation category.");
    notes.push("Ontario doesn't publish a cut-off for this stream; it invites the highest-ranked profiles in each draw and can target occupations or regions.");
    notes.push("Earnings points changed on October 5, 2026: $80,000+ now earns 10. Existing EOIs were updated automatically.");
    return { total,
      rows: [["Employment", null, null, true], [v.phys ? "TEER (physician)" : `NOC TEER${t != null ? " " + t : ""}`, teer, 9], [v.phys ? "Occupation category (health)" : `Occupation category${boc != null ? " " + boc : ""}`, cat, 10], ["Hourly wage", v.phys ? null : wage, 15], ["Ontario work experience", exp, 18], ["Canadian earnings", earn, 10], ["Legal status in Canada", st, 10],
        ["Education", null, null, true], ["Level of education", ed, 10], ["Canadian credentials", cc, 10],
        ["Language", null, null, true], [`Official language (lowest CLB ${c || "—"})`, lang, 15], ["Knowledge of official languages", bil, 10],
        ["Region", null, null, true], ["Job location", reg, 15]],
      status: total >= 70 ? "good" : total >= 50 ? "warn" : "bad",
      verdict: "Ontario ranks every Workforce Priority profile on this score. The Employer Job Offer, Master's, PhD and Express Entry streams closed on June 25, 2026.",
      notes };
  },
});
})();
