/* MPNP Skilled Worker Expression of Interest ranking, out of 1,000 (risk factors can deduct up to 200).
   Source: Manitoba Provincial Nominee Program EOI points (immigratemanitoba.com/mpnp/apply/eoi/). */
(function () {
const { H } = WPCalc;
WPCalc.define({
  id: "mb-mpnp", short: "MPNP EOI", max: 1000,
  resultTitle: "MPNP EOI ranking score", resultEyebrow: "Manitoba · MPNP Skilled Worker",
  checked: "November 2, 2026",
  sources: [["Manitoba: MPNP Expression of Interest", "https://immigratemanitoba.com/mpnp/apply/eoi/"]],
  sections: [
    { title: "Language", hint: "Your stronger official language is scored per ability; the other earns 25 points at CLB 5+.", fields: [
      { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
      { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
    ] },
    { title: "Age, experience and education", fields: [
      { id: "age", type: "number", label: "Age when you submit the EOI", min: 16, max: 80, def: 29 },
      { id: "exp", type: "select", label: "Full-time work experience in the last 5 years", def: "2", options: [["0", "Less than 1 year"], ["1", "1 year"], ["2", "2 years"], ["3", "3 years"], ["4", "4 years or more"]], help: "Full years only; partial years aren't rounded up" },
      { id: "licence", type: "yesno", label: "Fully recognized by a Manitoba licensing body?", help: "Regulated occupations only, after every licensing step is complete (+100)" },
      { id: "edu", type: "select", label: "Highest completed education", full: true, def: "three", options: [["none", "No formal post-secondary education"], ["one", "One-year post-secondary program"], ["trade", "Trade certificate"], ["two", "One post-secondary program of 2 years"], ["three", "One post-secondary program of 3+ years"], ["twotwo", "Two post-secondary programs of at least 2 years each"], ["master", "Master's or doctorate"]] },
    ] },
    { title: "Connection to Manitoba", hint: "Only your highest connection counts.", fields: [
      { id: "conn", type: "checks", label: "Which apply to you?", options: [
        ["demand", "Working in Manitoba 6+ months, with a long-term job offer from the same employer (500)"],
        ["ita", "Invited to apply through a strategic recruitment initiative (500)"],
        ["rel", "Close relative in Manitoba (200)"],
        ["work", "Past authorized work in Manitoba, 6+ months (100)"],
        ["study2", "Completed a Manitoba post-secondary program of 2+ years (100)"],
        ["study1", "Completed a Manitoba post-secondary program of 1 year (50)"],
        ["friend", "Close friend or distant relative in Manitoba (50)"]] },
      { id: "outside", type: "yesno", label: "Planning to settle outside Winnipeg?", help: "+50, added only to a connection other than Manitoba demand" },
    ] },
    { title: "Risk assessment", fields: [
      { id: "risk", type: "checks", label: "Which apply to you?", options: [["ow", "Work experience in another province (−100)"], ["os", "Studies in another province (−100)"]] },
    ] },
  ],
  compute(v) {
    const langs = [v.en, v.fr].filter(Boolean).sort((a, b) => b.min - a.min);
    const ab = (c) => (c >= 8 ? 25 : c === 7 ? 22 : c === 6 ? 20 : c === 5 ? 17 : c === 4 ? 12 : 0);
    const l1 = langs[0] ? ["L", "R", "W", "S"].reduce((s, k) => s + ab(langs[0][k]), 0) : 0;
    const l2 = langs[1] && langs[1].min >= 5 ? 25 : 0;
    const a = Math.floor(H.num(v.age, 0));
    const age = a < 18 ? 0 : a === 18 ? 20 : a === 19 ? 30 : a === 20 ? 40 : a <= 45 ? 75 : a === 46 ? 40 : a === 47 ? 30 : a === 48 ? 20 : a === 49 ? 10 : 0;
    const exp = [0, 40, 50, 60, 75][+v.exp] + (v.licence ? 100 : 0);
    const ed = { none: 0, one: 70, trade: 70, two: 100, three: 110, twotwo: 115, master: 125 }[v.edu] || 0;
    const C = v.conn || [];
    const val = { demand: 500, ita: 500, rel: 200, work: 100, study2: 100, study1: 50, friend: 50 };
    const top = C.length ? C.reduce((b, k) => (val[k] > val[b] ? k : b), C[0]) : null;
    const topPts = top ? val[top] : 0, isDemand = top === "demand" || top === "ita";
    const reg = v.outside && !isDemand ? 50 : 0;
    const adapt = Math.min(500, topPts + reg);
    const risk = (v.risk || []).length * -100;
    const total = Math.max(0, l1 + l2 + age + exp + ed + adapt + risk);
    const lbl = { demand: "Manitoba demand: working 6+ months with a long-term offer", ita: "Manitoba demand: strategic initiative invitation", rel: "Close relative in Manitoba", work: "Past work in Manitoba", study2: "Manitoba study (2+ years)", study1: "Manitoba study (1 year)", friend: "Close friend or distant relative" };
    return { total,
      rows: [["First official language", l1, 100], ["Second official language", l2, 25], ["Age", age, 75], ["Work experience", [0, 40, 50, 60, 75][+v.exp], 75], ["Licensed by a Manitoba body", v.licence ? 100 : 0, 100], ["Education", ed, 125],
        ["Adaptability: " + (top ? lbl[top] : "no Manitoba connection"), topPts, 500], ["Regional development (outside Winnipeg)", reg, 50], ["Risk assessment", risk]],
      status: top ? (total >= 600 ? "good" : "warn") : "bad",
      verdict: !top ? "Skilled Worker in Manitoba and Overseas candidates need an established connection to Manitoba (a relative, past work or study, ongoing employment or a strategic invitation). Without one you can't be invited." :
        `Recent MPNP draws have had lowest scores from about 630 to 825, but each draw targets its own group, so compare with draws for your stream.`,
      notes: ["Skilled Worker in Manitoba needs a full-time permanent job offer and usually 6+ months working for that employer. Skilled Worker Overseas usually needs a strategic recruitment invitation or a close relative in Manitoba.", "Manitoba may change the points or invite by occupation or connection without notice."] };
  },
});
})();
