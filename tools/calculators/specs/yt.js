/* Yukon Nominee Program 2026: EOI scoring and stream basics.
   Source: Yukon Nominee Program 2026 Operational Guidance (updated July 3, 2026). Only employers submit EOIs;
   Yukon scores all EOIs from an intake and invites the highest. */
(function () {
const { H } = WPCalc;
WPCalc.define({
  id: "yt-ynp", short: "YNP EOI", max: 20,
  resultTitle: "Yukon Nominee Program EOI score", resultEyebrow: "Yukon · YNP 2026",
  checked: "November 2, 2026",
  sources: [
    ["Yukon: Yukon Nominee Program 2026 operational guidance (PDF)", "https://yukon.ca/sites/default/files/ecdev-ynp-2026-operational-guidance-2026-07-03.pdf"],
    ["Yukon: Learn about the Yukon Nominee Program process for 2026", "https://yukon.ca/en/yukon-nominee-program"],
  ],
  sections: [
    { title: "Stream and job", fields: [
      { id: "stream", type: "select", label: "Stream", full: true, def: "sw", options: [["sw", "Skilled Worker (management or jobs needing more education)"], ["ciw", "Critical Impact Worker (entry-level jobs)"], ["ee", "Express Entry (you're in the federal Express Entry pool)"]] },
      { id: "fullTime", type: "yesno", label: "Full-time (35–40 hours), permanent, year-round job offer from a Yukon employer?", def: true },
      { id: "median", type: "yesno", label: "Pays at least the median wage for the position?", def: true },
      { id: "advertised", type: "yesno", label: "Employer advertised locally and nationally and couldn't hire a citizen or PR?", def: true },
      { id: "empYear", type: "yesno", label: "Employer has operated in Yukon for at least 1 year?", def: true },
      { id: "rural", type: "yesno", label: "Is the employer outside Whitehorse?", help: "15% of nominations are set aside for rural employers" },
    ] },
    { title: "Scoring factors", fields: [
      { id: "fr", type: "lang", label: "French test (optional)", tests: ["tef", "tcf", "clb"], nclc: true, help: "Francophone points: NCLC 5" },
      { id: "health", type: "yesno", label: "Regulated health care profession?" },
      { id: "yu", type: "yesno", label: "Yukon University graduate?" },
      { id: "yrs", type: "select", label: "Living and working in Yukon", def: "0", options: [["0", "1 year or less"], ["1", "More than 1 year"], ["2", "More than 2 years"], ["3", "More than 3 years"], ["4", "More than 4 years"]] },
      { id: "prior", type: "select", label: "Intake 1, 2026 history for this candidate", full: true, def: "none", options: [["none", "No EOI submitted in intake 1"], ["notinv", "EOI submitted in intake 1 but not invited"], ["inv", "EOI submitted and invited in intake 1"]] },
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"], help: "Each stream has a minimum language level" },
    ] },
  ],
  compute(v) {
    const fr = v.fr && v.fr.min >= 5 ? 5 : 0, hc = v.health ? 8 : 0, yu = v.yu ? 1 : 0, yr = +v.yrs, pr = { none: 1, notinv: 2, inv: 0 }[v.prior];
    const total = fr + hc + yu + yr + pr;
    const items = [[v.fullTime, "Full-time, permanent, year-round job offer"], [v.median, "Median wage for the position"], [v.advertised, "Local and national advertising, no qualified citizen or PR available"], [v.empYear, "Employer has operated in Yukon for 1+ year"],
      [v.stream === "ee" ? null : null, v.stream === "ciw" ? "Documented experience for the role (6 months if moving between positions with the same employer)" : "Documented education and experience for the role (12 months if moving between positions with the same employer)"]];
    if (v.stream === "ee") items.push([null, "An active federal Express Entry profile"]);
    const ok = !items.some(([o]) => o === false);
    return { total,
      rows: [["Francophone (NCLC 5+)", fr, 5], ["Regulated health care profession", hc, 8], ["Yukon University graduate", yu, 1], ["Living and working in Yukon", yr, 4], ["Intake 1 history", pr, 2]],
      status: ok ? "good" : "bad",
      verdict: "Yukon invites the highest-scoring EOIs in each intake. Ties go first to the person who has lived and worked longest in Yukon, then to the one whose work permit expires soonest.",
      checks: [{ name: { sw: "Skilled Worker", ciw: "Critical Impact Worker", ee: "Express Entry" }[v.stream], ok, items }],
      notes: ["Only employers can submit an EOI. 2026 intakes ran January 19–30 and July 6–17; watch Yukon's site for 2027 dates.", "Yukon has 282 nominations for 2026: 85% for Whitehorse employers and 15% for rural employers, after Temporary Measure letter of support holders."] };
  },
});
})();
