/* SINP International Skilled Worker points assessment grid (pass mark 60, maximum 110).
   Source: Saskatchewan.ca "Assess your eligibility" (International Skilled Worker). */
(function () {
const { H } = WPCalc;
WPCalc.define({
  id: "sk-sinp", short: "SINP points", max: 110,
  resultTitle: "SINP points assessment", resultEyebrow: "Saskatchewan · SINP International Skilled Worker",
  checked: "November 2, 2026",
  sources: [
    ["Saskatchewan: SINP assess your eligibility (points grid)", "https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program/browse-sinp-programs/applicants-international-skilled-workers/assess-your-eligibility"],
    ["Saskatchewan: International Skilled Worker – Employment Offer", "https://www.saskatchewan.ca/Residents/Moving-to-Saskatchewan/Live-in-Saskatchewan/By-Immigrating/Saskatchewan-Immigrant-Nominee-Program/Browse-SINP-Programs/Applicants-International-Skilled-Workers/International-Skilled-Worker-with-Employment-Offer"],
  ],
  sections: [
    { title: "Which subcategory?", fields: [
      { id: "sub", type: "select", label: "International Skilled Worker subcategory", full: true, def: "offer", options: [["offer", "Employment Offer (needs a Saskatchewan job offer)"], ["oid", "Occupation In-Demand (no job offer)"], ["see", "Saskatchewan Express Entry (no job offer)"]] },
    ] },
    { title: "Education and training", fields: [
      { id: "edu", type: "select", label: "Highest education or training", full: true, def: "bach", options: [["none", "Less than a one-year post-secondary credential"], ["cert", "Certificate, or at least two semesters (under a two-year program)"], ["dip", "Diploma requiring two (but under three) years of study"], ["trade", "Trade certification equal to journeyperson status in Saskatchewan"], ["bach", "Bachelor's degree, or a 3+ year degree"], ["master", "Master's or doctorate"]] },
    ] },
    { title: "Skilled work experience", hint: "Experience related to the occupation in your application. One year = 12 full months.", fields: [
      { id: "exp5", type: "select", label: "In the 5 years before you apply", def: "2", options: [["0", "Less than 1 year"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years"], ["4", "4 years"], ["5", "5 years"]] },
      { id: "exp10", type: "select", label: "6 to 10 years before you apply", def: "0", options: [["0", "Less than 1 year"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years"], ["4", "4 years"], ["5", "5 years"]] },
    ] },
    { title: "Language and age", fields: [
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
      { id: "age", type: "number", label: "Age", min: 16, max: 80, def: 29 },
    ] },
    { title: "Connection to Saskatchewan", fields: [
      { id: "offer", type: "yesno", label: "High-skilled employment offer from a Saskatchewan employer?", show: (v) => v.sub === "offer", def: true },
      { id: "rel", type: "yesno", label: "Close family relative in Saskatchewan?", show: (v) => v.sub !== "offer", help: "Citizen or PR, not supporting other relatives when you apply" },
      { id: "pastWork", type: "yesno", label: "12+ months of work in Saskatchewan in the last 5 years (on a valid work permit)?", show: (v) => v.sub !== "offer" },
      { id: "pastStudy", type: "yesno", label: "A full-time academic year of study in Saskatchewan (on a valid study permit)?", show: (v) => v.sub !== "offer" },
    ] },
  ],
  compute(v) {
    const ed = { none: 0, cert: 12, dip: 15, trade: 20, bach: 20, master: 23 }[v.edu] || 0;
    const e5 = [0, 2, 4, 6, 8, 10][+v.exp5], e10 = [0, 0, 2, 3, 4, 5][+v.exp10];
    const langs = [v.en, v.fr].filter(Boolean).sort((a, b) => b.min - a.min);
    const p1 = (c) => (c >= 8 ? 20 : c === 7 ? 18 : c === 6 ? 16 : c === 5 ? 14 : c === 4 ? 12 : 0);
    const p2 = (c) => (c >= 8 ? 10 : c === 7 ? 8 : c === 6 ? 6 : c === 5 ? 4 : c === 4 ? 2 : 0);
    const l1 = langs[0] ? p1(langs[0].min) : 0, l2 = langs[1] ? p2(langs[1].min) : 0;
    const a = Math.floor(H.num(v.age, 0)), age = a < 18 ? 0 : a <= 21 ? 8 : a <= 34 ? 12 : a <= 45 ? 10 : a <= 50 ? 8 : 0;
    let conn = 0; const cr = [];
    if (v.sub === "offer") { conn = v.offer ? 30 : 0; cr.push(["High-skilled Saskatchewan job offer", conn, 30]); }
    else { const r = v.rel ? 20 : 0, w = v.pastWork ? 5 : 0, s = v.pastStudy ? 5 : 0; conn = r + w + s; cr.push(["Close relative in Saskatchewan", r, 20], ["Past work in Saskatchewan", w, 5], ["Past study in Saskatchewan", s, 5]); }
    const f1 = ed + e5 + e10 + l1 + l2 + age, total = f1 + conn;
    const minLang = langs[0] ? langs[0].min : 0;
    const totalYrs = +v.exp5 + +v.exp10;
    const items = [
      [total >= 60, `At least 60 points (yours: ${total})`],
      [minLang >= 4, `CLB 4 or higher in a language test${minLang ? ` (yours: ${minLang})` : ""}. Some employers and regulators need more`],
      [totalYrs >= 1, "At least 1 year of work experience in the last 10 years in your intended occupation"],
      [v.edu !== "none", "Post-secondary education or training equal to a Canadian credential (1 year+), or a trade certificate"],
      v.sub === "offer" ? [v.offer, "A high-skilled job offer from a Saskatchewan employer with an approved Job Approval Letter"] : [null, v.sub === "oid" ? "Your occupation must be on Saskatchewan's in-demand list, and you need proof of settlement funds" : "An Express Entry profile, an occupation on Saskatchewan's in-demand list, and an invitation from the SINP pool"],
    ];
    const ok = !items.some(([o]) => o === false);
    return { total, rows: [["Factor I: Labour market success", null, null, true], ["Education and training", ed, 23], ["Experience (last 5 years)", e5, 10], ["Experience (6–10 years ago)", e10, 5], ["First language", l1, 20], ["Second language", l2, 10], ["Age", age, 12],
        ["Factor II: Connection to Saskatchewan", null, null, true], ...cr],
      mark: 60, markLabel: "Pass mark 60", status: ok ? "good" : "bad",
      verdict: total >= 60 ? `Meets the 60-point pass mark. Occupation In-Demand and Saskatchewan Express Entry candidates are ranked on these points in SINP draws.` : `Below the 60-point pass mark by <b>${60 - total}</b>.`,
      checks: [{ name: "International Skilled Worker: " + { offer: "Employment Offer", oid: "Occupation In-Demand", see: "Saskatchewan Express Entry" }[v.sub], ok, items }],
      notes: ["For 2026 Saskatchewan prioritizes health care, agriculture, skilled trades, mining, manufacturing, energy and technology. Accommodation and food services, trucking and retail are capped and open only in set intake windows.", "Some open work permit holders (including spousal open work permits) can't use certain SINP pathways from 2026."] };
  },
});
})();
