/* Eligibility checkers for provinces that don't publish an EOI points grid: Nova Scotia, New Brunswick,
   Prince Edward Island and Newfoundland and Labrador. The page sets window.WP_PROV to "ns", "nb", "pe" or "nl".
   Sources are listed per province below. Each province selects from its pool on its own priorities. */
(function () {
const { H } = WPCalc;
const P = window.WP_PROV;
const NAME = { ns: "Nova Scotia", nb: "New Brunswick", pe: "Prince Edward Island", nl: "Newfoundland and Labrador" }[P];
const SHORT = { ns: "NSNP", nb: "NBPNP", pe: "PEI PNP", nl: "NLPNP" }[P];

const common = [
  { title: "About you", fields: [
    { id: "age", type: "number", label: "Age", min: 16, max: 80, def: 30 },
    { id: "edu", type: "select", label: "Highest completed education", def: "post", options: [["none", "Less than high school"], ["hs", "High school diploma"], ["post", "Post-secondary diploma, certificate or degree"]] },
    { id: "en", type: "lang", label: "English test", tests: ["ielts", "celpip", "pte", "clb"] },
    { id: "fr", type: "lang", label: "French test", tests: ["tef", "tcf", "clb"], nclc: true },
    { id: "eeProfile", type: "yesno", label: "Do you have an active Express Entry profile?" },
  ] },
  { title: `Job in ${NAME}`, fields: [
    { id: "offer", type: "yesno", label: `Full-time, permanent (non-seasonal) job offer from a ${NAME} employer?`, def: true },
    { id: "noc", type: "noc", label: "Job offer NOC", show: (v) => v.offer },
    { id: "expM", type: "number", label: "Months of full-time experience related to the job (last 5 years)", min: 0, max: 120, def: 12 },
    { id: "empM", type: "number", label: `Months working full-time for the ${NAME} employer`, min: 0, max: 120, def: 0, show: (v) => v.offer },
    { id: "provM", type: "number", label: `Months living and working in ${NAME}`, min: 0, max: 240, def: 0 },
    { id: "wp", type: "yesno", label: "Valid work permit in Canada now?" },
  ] },
];
const extra = {
  ns: { title: "Nova Scotia details", fields: [
    { id: "nsGrad", type: "yesno", label: "Completed a program (30+ weeks) at a Nova Scotia institution in the last 3 years?" },
    { id: "constr", type: "yesno", label: "Is the job in construction, in a listed occupation?", help: "Construction pathway: industry training can replace the high school diploma" },
  ] },
  nb: { title: "New Brunswick details", fields: [
    { id: "nbGrad", type: "yesno", label: "Graduated from a PGWP-eligible program at a New Brunswick institution?" },
    { id: "sector", type: "select", label: "Employer's sector", def: "health", options: [["health", "Health care"], ["edu", "Education"], ["constr", "Construction"], ["excl", "Accommodation and food, retail, or fish and seafood processing"], ["other", "Another sector"]] },
    { id: "mission", type: "yesno", label: "Job offer came from a New Brunswick government recruitment mission?" },
  ] },
  pe: { title: "Prince Edward Island details", fields: [
    { id: "inPei", type: "yesno", label: "Already working in PEI on a valid work permit?" },
    { id: "auth", type: "yesno", label: "Employer has PEI's prior authorization to recruit from abroad?", show: (v) => !v.inPei },
  ] },
  nl: { title: "Newfoundland and Labrador details", fields: [
    { id: "pgwp", type: "yesno", label: "Valid post-graduation work permit with 4+ months left?" },
    { id: "nlGrad", type: "yesno", label: "Graduated from a Newfoundland and Labrador institution?", show: (v) => v.pgwp },
  ] },
}[P];

const sources = {
  ns: [["Nova Scotia: Skilled Worker stream guide (PDF)", "https://liveinnovascotia.com/sites/default/files/2026-02/Guide-NSNP-Skilled-Worker-English.pdf"], ["Nova Scotia: Express Entry stream guide (PDF)", "https://liveinnovascotia.com/sites/default/files/2026-02/Guide-NSNP-Nova%20Scotia%20Express%20Entry-English.pdf"]],
  nb: [["New Brunswick: NB Skilled Worker stream", "https://www2.gnb.ca/content/gnb/en/corporate/promo/immigration/immigrating-to-nb/nb-immigration-program-streams/nb-skilled-worker-stream.html"]],
  pe: [["PEI: Workforce application guide (PDF)", "https://www.princeedwardisland.ca/sites/default/files/publications/pei_workforce_application_guide.pdf"]],
  nl: [["Newfoundland and Labrador: Office of Immigration and Multiculturalism", "https://www.gov.nl.ca/immigration/"]],
}[P];

function streams(v) {
  const age = Math.floor(H.num(v.age, 0)), t = H.teerOf(v.noc), haveT = t != null;
  const best = H.best(v.en, v.fr), m = best ? best.min : 0, enM = v.en ? v.en.min : 0;
  const exp = H.num(v.expM, 0), emp = H.num(v.empM, 0), prov = H.num(v.provM, 0);
  const hs = v.edu !== "none";
  const tr = (lo, hi) => (haveT ? t >= lo && t <= hi : null);
  const L = (n) => [m >= n, `Language: CLB/NCLC ${n} in all four abilities${m ? ` (yours: ${m})` : ""}`];
  if (P === "ns") return [
    { name: "Skilled Worker", desc: "Includes construction, physicians and occupations in demand", items: [
      [age >= 21 && age <= 55, "Age 21 to 55"], [v.offer, "Full-time, permanent Nova Scotia job offer at the provincial wage range"],
      [haveT ? (t <= 3 ? exp >= 12 : exp >= 12 && emp >= 6) : exp >= 12, haveT && t >= 4 ? "12 months (1,560 hours) of related experience in 5 years, plus 6 months with the Nova Scotia employer" : "12 months (1,560 hours) of related experience in the last 5 years"],
      haveT && t >= 4 ? [!!best && m >= 4, `Language test: CLB/NCLC 4 (TEER 4–5)${m ? ` (yours: ${m})` : ""}`] : L(5),
      [hs || v.constr, "High school diploma (construction-specific training can count)"], [null, "Settlement funds, and family income above Statistics Canada's low income cut-off"]] },
    { name: "Nova Scotia: Express Entry", desc: "Includes the physicians pathway", items: [
      [v.eeProfile, "Active Express Entry profile"], [age >= 21 && age <= 55, "Age 21 to 55"],
      [tr(0, 3) !== false && prov >= 12, "1 year of Nova Scotia work in a TEER 0–3 occupation (PGWP work needs a Nova Scotia graduation)"],
      haveT && t <= 1 ? L(7) : L(5), [hs, "High school diploma"]] },
    { name: "Nova Scotia Graduate", desc: "NOC 42202, 33102, 32102 or 32124", items: [
      [age >= 19 && age <= 55, "Age 19 to 55"], [["42202", "33102", "32102", "32124"].includes(v.noc), "Full-time job offer in an eligible NOC related to your studies"],
      [v.nsGrad, "Nova Scotia program completed in the last 3 years (30+ weeks, half of it in Nova Scotia)"], L(5), [null, "Any certification the Nova Scotia regulator requires"]] },
  ];
  if (P === "nb") {
    const sectOk = ["health", "edu", "constr"].includes(v.sector);
    return [
      { name: "Skilled Worker: New Brunswick Experience", desc: "Since May 4, 2026: health care, education and construction only", items: [
        [age >= 19 && age <= 55, "Age 19 to 55"], [v.offer, "Full-time, non-seasonal job with an eligible New Brunswick employer"], [emp >= 6, "6+ months full-time with the supporting employer"], [prov >= 6, "Lived in New Brunswick for the 6 months before the EOI"],
        [sectOk, "Employer in health care, education or construction"], L(4), [hs, "Post-secondary education, or a Canadian high school diploma for lower-skilled jobs"]] },
      { name: "Skilled Worker: New Brunswick Graduates", items: [[age >= 19 && age <= 55, "Age 19 to 55"], [v.nbGrad, "PGWP-eligible program completed at a New Brunswick institution"], [v.offer, "Full-time, non-seasonal job or accepted offer"], L(4), [v.sector !== "excl", "Not in a sector New Brunswick has paused"]] },
      { name: "Skilled Worker: Priority Occupations", items: [[v.mission, "Offer from a New Brunswick government recruitment mission"], [exp >= 12, "1+ year of related paid experience"], [null, "NOC on the priority list in the pathway guide"], L(4)] },
      { name: "New Brunswick Express Entry", items: [[v.eeProfile, "Active Express Entry profile"], [tr(0, 3) !== false && prov >= 12 && v.offer, "Full-time New Brunswick job in TEER 0–3 for the last 12 months, living in the province (or a letter of interest)"], [null, "Meets a federal program (FSW, CEC or FST)"]] },
    ];
  }
  if (P === "pe") return [
    { name: "Critical Worker (TEER 4–5)", items: [[age >= 18 && age <= 59, "Age 18 to 59"], [tr(4, 5), "Job offer in a TEER 4 or 5 occupation, permanent or at least 2 years"], [emp >= 6, "6 months continuous with the PEI employer"], [exp >= 24, "2 years full-time in the last 5 years (or relevant education)"], L(4), [hs, "High school diploma"], [v.wp, "Valid status and work permit in Canada"]] },
    { name: "Occupations in Demand", items: [[age >= 18 && age <= 59, "Age 18 to 59"], [v.offer, "Job offer in a listed in-demand occupation"], [exp >= 12, "1 year full-time experience directly related to the job"], L(4), [hs, "High school diploma"]] },
    { name: "Skilled Workers in PEI", items: [[v.inPei, "Already working in PEI on a valid work permit"], [v.offer, "Full-time, non-seasonal PEI job offer"], [null, "Education, experience and language as set in PEI's guide for your occupation"]] },
    { name: "Skilled Workers Outside Canada", items: [[!v.inPei && v.auth, "Employer has PEI's prior authorization to recruit from abroad"], [v.offer, "Full-time PEI job offer"], [null, "Education, experience and language as set in PEI's guide"]] },
    { name: "PEI Express Entry", items: [[v.eeProfile, "Active Express Entry profile"], [null, "Meets a federal program (FSW, CEC or FST). PEI prefers people already living and working on the Island"]] },
  ];
  if (P === "nl") return [
    { name: "Skilled Worker", items: [[age >= 21 && age <= 59, "Age 21 to 59"], [v.offer, "Full-time (30+ hours) job offer for at least 1 year, paid by salary or hourly wage"], haveT && t >= 4 ? [!!best, "A valid English or French test (TEER 4–5 jobs)"] : [true, "No language test needed for TEER 0–3 unless asked"], [null, "Qualifications, training and licences the job needs"]] },
    { name: "International Graduate", items: [[age >= 21 && age <= 59, "Age 21 to 59"], [v.pgwp, "Valid PGWP with 4+ months left"], [tr(0, 4), "Full-time offer in TEER 0–3, or an in-demand TEER 4 job"], [v.nlGrad || prov >= 12, "Graduates from outside the province need 1 year of work in Newfoundland and Labrador"], haveT && t === 4 ? [enM >= 4, "IELTS 4.5 listening, 3.5 reading, 4.0 writing and speaking (or equivalent) for TEER 4"] : [true, "Language test only needed for TEER 4 jobs"]] },
    { name: "Express Entry Skilled Worker", items: [[v.eeProfile, "Active Express Entry profile"], [v.offer, "Job or job offer from an eligible Newfoundland and Labrador employer"], [null, "Meets a federal program (FSW, CEC or FST)"]] },
  ];
  return [];
}

WPCalc.define({
  id: "elig-" + P, short: SHORT + " eligibility",
  resultTitle: `${SHORT} stream check`, resultEyebrow: `${NAME} · eligibility`,
  checked: "November 2, 2026", sources,
  sections: [...common, extra],
  compute(v) {
    const s = streams(v).map((x) => ({ ...x, ok: x.items.some(([o]) => o === false) ? false : true }));
    const n = s.filter((x) => x.ok).length;
    const notes = [`${NAME} doesn't publish an EOI points grid. It selects from its pool on provincial priorities (occupation, sector, region and allocation), so meeting the basics doesn't guarantee an invitation.`];
    if (P === "nb") notes.push("Since February 3, 2026 New Brunswick isn't issuing EOIs or invitations for accommodation and food services, retail, or fish and seafood processing.");
    if (P === "ns") notes.push("These are the streams after Nova Scotia's February 18, 2026 consolidation. The Atlantic Immigration Program is separate.");
    if (P === "pe" || P === "nb" || P === "nl" || P === "ns") notes.push("The federal Atlantic Immigration Program is another route with a designated employer's job offer.");
    return { status: n ? "good" : "bad", miniText: `${n} of ${s.length} streams fit`,
      verdict: n ? `You meet the basic requirements of <b>${n}</b> of ${s.length} streams. Items marked “?” you need to confirm in the guide.` : "You don't meet the basic requirements of any stream yet. The ✕ items show what's missing.",
      checks: s, notes };
  },
});
})();
