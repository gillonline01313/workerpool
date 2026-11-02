/* AAIP Worker Expression of Interest points grid, out of 100.
   Source: Alberta.ca "AAIP Worker Expression of Interest Points Grid" (page dated September 28, 2026). */
(function () {
const { H } = WPCalc;
WPCalc.define({
  id: "ab-aaip", short: "AAIP EOI", max: 100,
  resultTitle: "AAIP Worker EOI score", resultEyebrow: "Alberta · Alberta Advantage Immigration Program",
  checked: "November 2, 2026",
  sources: [
    ["Alberta: AAIP Worker EOI points grid (PDF)", "https://www.alberta.ca/system/files/im-worker-stream-expression-of-interest-points-grid.pdf"],
    ["Alberta: How to apply to AAIP worker streams", "https://www.alberta.ca/how-to-apply-to-aaip-worker-streams"],
  ],
  sections: [
    { title: "Education", fields: [
      { id: "edu", type: "select", label: "Highest completed credential", full: true, def: "bach", options: [["none", "Secondary school or lower"], ["dip", "Diploma or certificate"], ["trade", "Trades certificate or diploma"], ["bach", "Bachelor's degree"], ["master", "Master's degree"], ["phd", "Doctorate"]] },
      { id: "eduWhere", type: "select", label: "Where was it completed?", def: "outside", show: (v) => v.edu !== "none", options: [["outside", "Outside Canada"], ["ab", "In Alberta"], ["canada", "In another province or territory"]] },
    ] },
    { title: "Language", hint: "Scored on your lowest ability, using whichever of English or French scores higher. CLB or NCLC 4 in all four is needed to submit an EOI.", fields: [
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
    ] },
    { title: "Work experience and age", fields: [
      { id: "exp", type: "select", label: "Total work experience (in Canada or abroad)", def: "12", options: [["0", "Less than 6 months"], ["6", "6 to 11 months"], ["12", "12 months or more"]] },
      { id: "cdn", type: "select", label: "Work experience in Canada (6+ months)", def: "none", options: [["none", "None, or under 6 months"], ["ab", "6+ months in Alberta"], ["canada", "6+ months in another province or territory"]] },
      { id: "age", type: "number", label: "Age", min: 16, max: 80, def: 29 },
      { id: "family", type: "yesno", label: "Parent, child or sibling living in Alberta?", help: "18+, Canadian citizen or PR. In-laws don't count" },
    ] },
    { title: "Alberta job offer", fields: [
      { id: "offer", type: "yesno", label: "Permanent, full-time job offer in Alberta?" },
      { id: "select", type: "yesno", label: "Offer in a select rural community or sector?", show: (v) => v.offer, help: "Rural Renewal endorsement, tourism and hospitality offer from a required association member, or law enforcement offer from an Alberta Association of Chiefs of Police member" },
      { id: "loc", type: "select", label: "Where is the job?", show: (v) => v.offer, def: "cmA", options: [["cmA", "Calgary or Edmonton census metropolitan area"], ["rr", "Rural Renewal designated community"], ["other", "Another Alberta community"]] },
      { id: "reg", type: "yesno", label: "Regulated occupation and you hold the Alberta certification or licence?", show: (v) => v.offer, help: "For trades: an Alberta Qualification Certificate or a trade certificate recognized by Alberta Apprenticeship and Industry Training" },
      { id: "noc", type: "noc", label: "Job offer NOC (optional)", show: (v) => v.offer },
    ] },
  ],
  compute(v) {
    const ed = { none: 0, dip: 4, trade: 7, bach: 7, master: 10, phd: 12 }[v.edu] || 0;
    const edLoc = v.edu !== "none" ? (v.eduWhere === "ab" ? 10 : v.eduWhere === "canada" ? 6 : 0) : 0;
    const en = v.en ? v.en.min : 0, fr = v.fr ? v.fr.min : 0;
    const enP = en >= 6 ? 10 : en === 5 ? 8 : en === 4 ? 5 : 0, frP = fr >= 6 ? 8 : fr === 5 ? 5 : fr === 4 ? 3 : 0;
    const bil = en >= 4 && fr >= 4 ? 3 : 0;
    const lang = Math.max(enP, frP) + bil;
    const we = { 0: 3, 6: 7, 12: 11 }[v.exp] ?? 0;
    const ce = v.cdn === "ab" ? 10 : v.cdn === "canada" ? 6 : 0;
    const a = Math.floor(H.num(v.age, 0)), age = a < 18 ? 0 : a <= 20 ? 3 : a <= 34 ? 5 : a <= 49 ? 4 : 3;
    const fam = v.family ? 8 : 0;
    const job = v.offer ? 10 : 0, sel = v.offer && v.select ? 6 : 0, loc = v.offer && v.loc !== "cmA" ? 5 : 0, reg = v.offer && v.reg ? 10 : 0;
    const total = ed + edLoc + lang + we + ce + age + fam + job + sel + loc + reg;
    const canSubmit = Math.max(en, fr) >= 4;
    const rows = [["Human capital", null, null, true], ["Highest credential", ed, 12], ["Completed in Canada", edLoc, 10],
      [`Language (English CLB ${en || "—"}, French NCLC ${fr || "—"})`, Math.max(enP, frP), 10], ["Bilingual (both 4+)", bil, 3],
      ["Total work experience", we, 11], ["Work experience in Canada", ce, 10], ["Age", age, 5], ["Family in Alberta", fam, 8],
      ["Economic factors", null, null, true], ["Alberta job offer", job, 10], ["Select rural community or sector", sel, 6], ["Job outside Calgary and Edmonton", loc, 5], ["Regulated occupation with licence", reg, 10]];
    const notes = ["Alberta selects from the pool by stream and priority (for example health care, tech, construction, agriculture, aviation and law enforcement), with a separate minimum score in each draw.",
      "Each stream still has its own eligibility rules, such as the Alberta Opportunity Stream's work permit and Alberta work experience requirements.",
      "Your NOC and IRCC status are collected for program priorities but earn no points."];
    return { total, rows, notes, status: !canSubmit ? "bad" : total >= 60 ? "good" : "warn",
      verdict: !canSubmit ? "You need CLB or NCLC 4 in all four abilities to submit an Alberta EOI." :
        `Human capital <b>${ed + edLoc + lang + we + ce + age + fam}</b>/69 · Economic <b>${job + sel + loc + reg}</b>/31.` };
  },
});
})();
