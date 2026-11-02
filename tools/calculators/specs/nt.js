/* NWT Nominee Program Employer Driven stream: EOI points grid, out of 845 (EOI model since March 9, 2026).
   Source: Immigrate NWT "Employer Driven Stream Expression of Interest Points Grid". */
(function () {
const { H } = WPCalc;
const TRADES = ["72310", "72200", "72300", "72302", "72401", "72410", "72106", "72400", "72404", "72600", "62200"];
WPCalc.define({
  id: "nt-ntnp", short: "NWT EOI", max: 845,
  resultTitle: "NWT Employer Driven EOI score", resultEyebrow: "Northwest Territories · NWT Nominee Program",
  checked: "November 2, 2026",
  sources: [
    ["Immigrate NWT: Employer Driven stream EOI points grid (PDF)", "https://www.immigratenwt.ca/sites/immigratenwt/files/employer-driven_stream_expression_of_interest_points_grid.pdf"],
    ["Immigrate NWT", "https://www.immigratenwt.ca/"],
  ],
  sections: [
    { title: "Job and stream", fields: [
      { id: "stream", type: "select", label: "Stream", full: true, def: "sw", options: [["sw", "Skilled Worker"], ["el", "Entry Level / Semi-Skilled Occupations"], ["ee", "NWT Express Entry"]] },
      { id: "noc", type: "noc", label: "Job offer NOC" },
      { id: "outside", type: "yesno", label: "Full-time job in an NWT community outside Yellowknife?" },
      { id: "wp", type: "yesno", label: "Valid employer-specific work permit with this NWT employer?" },
      { id: "nwtYrs", type: "select", label: "Work experience in the NWT", def: "0", options: [["0", "Less than 1 year"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years or more"]] },
    ] },
    { title: "Human capital", fields: [
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
      { id: "age", type: "number", label: "Age", min: 16, max: 80, def: 30 },
      { id: "exp", type: "select", label: "Full-time experience in the same or a similar occupation (last 10 years)", full: true, def: "2", options: [["h", "Under 6 months"], ["6", "6 to 11 months"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years"], ["4", "4 years"], ["5", "5 years or more"]] },
      { id: "edu", type: "select", label: "Highest completed education", full: true, def: "bach", options: [["none", "No formal post-secondary education"], ["cert", "Post-secondary certificate"], ["dip", "Post-secondary diploma"], ["trade", "Trade certificate"], ["bach", "Bachelor's degree"], ["master", "Master's or doctorate"]], help: "Foreign credentials need an ECA" },
      { id: "related", type: "yesno", label: "Is your post-secondary education related to the nominating occupation?", show: (v) => v.edu !== "none", help: "Earns the top education score (100)" },
    ] },
    { title: "Adaptability to the NWT", fields: [
      { id: "nwtEdu", type: "select", label: "Education completed in the NWT", def: "none", options: [["none", "None"], ["cert", "Post-secondary certificate"], ["dip", "Diploma or higher"]] },
      { id: "family", type: "yesno", label: "Grandparent, parent or sibling living in the NWT (citizen or PR)?" },
    ] },
  ],
  compute(v) {
    const langs = [v.en, v.fr].filter(Boolean).sort((a, b) => b.min - a.min);
    const ab = (c) => (c >= 8 ? 25 : c === 7 ? 22 : c === 6 ? 20 : c === 5 ? 17 : c === 4 ? 12 : 0);
    const l1 = langs[0] ? ["L", "R", "W", "S"].reduce((s, k) => s + ab(langs[0][k]), 0) : 0;
    const l2 = langs[1] && langs[1].min >= 5 ? 25 : 0;
    const a = Math.floor(H.num(v.age, 0)), age = a < 18 ? 0 : a <= 20 ? 40 : a <= 44 ? 50 : a <= 49 ? 30 : 10;
    const exp = { h: 0, 6: 10, 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }[v.exp];
    const edu = v.edu !== "none" && v.related ? 100 : { none: 0, cert: 20, dip: 40, trade: 50, bach: 60, master: 80 }[v.edu];
    const t = H.teerOf(v.noc), emp = t == null ? 0 : t <= 1 ? 100 : t <= 3 ? 60 : 30;
    const trade = TRADES.includes(v.noc) ? 40 : 0, loc = v.outside ? 50 : 0, nwtExp = [0, 50, 75, 100][+v.nwtYrs], wp = v.wp ? 50 : 0;
    const ne = { none: 0, cert: 75, dip: 100 }[v.nwtEdu], fam = v.family ? 30 : 0;
    const A = Math.min(125, l1 + l2) + age + exp + edu, B = emp + trade + loc + nwtExp + wp, C = ne + fam;
    const total = A + B + C;
    const m = langs[0] ? langs[0].min : 0;
    const need = v.stream === "el" ? 4 : v.stream === "ee" ? (t != null && t <= 1 ? 7 : 5) : (t != null && t <= 1 ? 6 : 5);
    const items = [[H.nocOk(v.noc) ? (v.stream === "el" ? t >= 4 : t <= 3) : null, v.stream === "el" ? "Job offer in a TEER 4 or 5 occupation" : "Job offer in a TEER 0–3 occupation"],
      [m >= need, `Language: CLB ${need} in all four abilities${m ? ` (yours: ${m})` : ""}`],
      [v.stream === "el" ? null : exp >= 20, v.stream === "el" ? "12 months in the same job with your NWT employer" : "1 year of related experience in the last 10 years"]];
    if (v.stream === "ee") items.push([null, "An active federal Express Entry profile"]);
    const ok = !items.some(([o]) => o === false);
    return { total,
      rows: [["A. Human capital", null, null, true], ["Language", Math.min(125, l1 + l2), 125], ["Age", age, 50], ["Work experience", exp, 100], ["Education", edu, 100],
        ["B. NWT labour market connections", null, null, true], [`Employment in the NWT${t != null ? ` (TEER ${t})` : ""}`, emp, 100], ["Skilled trades job offer", trade, 40], ["Outside Yellowknife", loc, 50], ["NWT work experience", nwtExp, 100], ["Employer-specific NWT work permit", wp, 50],
        ["C. Adaptability", null, null, true], ["Education in the NWT", ne, 100], ["Family in the NWT", fam, 30]],
      status: ok ? "good" : "bad", verdict: "The NWT ranks employer-nominated profiles on this grid and invites the highest scores in each draw. 2026 draws were held in March, June, August and September; the next is expected in early 2027.",
      checks: [{ name: { sw: "Skilled Worker", el: "Entry Level / Semi-Skilled", ee: "NWT Express Entry" }[v.stream], ok, items }],
      notes: ["Your employer registers and nominates you; you then complete an EOI profile. Profiles stay in the pool for up to 12 months.", "French speakers (NCLC 5 and English CLB 4) can also use the Francophone stream, which runs first come, first served."] };
  },
});
})();
