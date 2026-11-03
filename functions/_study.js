// Study options matcher for Student Pool.
// The catalog is WorkerPool's own: schools and programs the admin enters from each college's official website.
// Only schools the admin has ticked "On ApplyBoard" are ever suggested, so every option can be applied for through
// the admin's own ApplyBoard recruiter account by hand. Nothing here reads, copies or automates ApplyBoard itself.

export const LEVELS = {
  certificate: "Certificate", diploma: "Diploma", "advanced-diploma": "Advanced diploma", bachelors: "Bachelor's degree",
  "pg-cert": "Post-graduate certificate / diploma", masters: "Master's degree",
};
export const FIELDS = {
  business: "Business & management", accounting: "Accounting & finance", it: "Computers & IT", health: "Healthcare & nursing",
  engineering: "Engineering & technology", trades: "Skilled trades", hospitality: "Hospitality, tourism & culinary", ece: "Early childhood education",
  community: "Community & social services", supply: "Supply chain & logistics", arts: "Arts, media & design", science: "Science",
  environment: "Agriculture & environment", aviation: "Aviation", education: "Education", law: "Law, justice & public safety", other: "Other",
};
// Words in a student's "field you're interested in" (or their last major) that point to each field
const FIELD_WORDS = {
  business: "business management admin administration marketing hr human resources entrepreneur commerce bba mba sales office project",
  accounting: "accounting accountant finance financial banking bcom b.com commerce audit tax payroll economics",
  it: "it computer computers software programming developer web cyber security data analytics analyst ai network cloud bca mca btech b.tech cse information technology",
  health: "health healthcare nursing nurse pharmacy medical lab psw personal support caregiver dental physio gnm anm bsc nursing paramedic",
  engineering: "engineering engineer technology technician mechanical electrical civil electronics automation robotics construction diploma engineering",
  trades: "trades trade welding welder electrician plumbing carpentry automotive mechanic hvac heavy equipment millwright",
  hospitality: "hospitality hotel tourism culinary chef cook cooking baking pastry restaurant food event travel",
  ece: "ece early childhood education childcare child care kids montessori",
  community: "community social work worker services counselling counseling youth addiction disability support",
  supply: "supply chain logistics warehouse procurement operations shipping transport",
  arts: "arts design graphic media film animation photography fashion interior music journalism",
  science: "science biology chemistry physics biotech biotechnology mathematics statistics bsc",
  environment: "agriculture farming environment environmental horticulture forestry sustainability",
  aviation: "aviation pilot aircraft aerospace flight",
  education: "education teaching teacher b.ed bed",
  law: "law legal paralegal justice police public safety policing security",
};

export async function ensureStudyTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, province TEXT, city TEXT, dli TEXT,
    applyboard INTEGER NOT NULL DEFAULT 0, website TEXT, note TEXT, updated TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_programs (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL, level TEXT NOT NULL, field TEXT,
    campus TEXT, intakes TEXT, tuition INTEGER, months INTEGER, min_prior TEXT, min_percent REAL, max_gap INTEGER, max_backlogs INTEGER,
    ielts REAL, ielts_band REAL, pte REAL, toefl REAL, duolingo REAL, pgwp TEXT, link TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1, updated TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS study_programs_school ON study_programs (school_id)`).run();
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM study_schools`).first();
  if (!n || !n.n) await seedSchools(env);
}

// Starter list of well-known public colleges, polytechnics and universities (name, type, city, province only).
// None is marked "On ApplyBoard": the admin ticks the ones they can see in their ApplyBoard account.
const SEED = {
  BC: [["Douglas College", "college", "New Westminster"], ["Langara College", "college", "Vancouver"], ["Vancouver Community College", "college", "Vancouver"],
    ["British Columbia Institute of Technology (BCIT)", "polytechnic", "Burnaby"], ["Camosun College", "college", "Victoria"], ["Okanagan College", "college", "Kelowna"],
    ["Selkirk College", "college", "Castlegar"], ["College of New Caledonia", "college", "Prince George"], ["North Island College", "college", "Courtenay"],
    ["Coast Mountain College", "college", "Terrace"], ["College of the Rockies", "college", "Cranbrook"], ["Northern Lights College", "college", "Dawson Creek"],
    ["Kwantlen Polytechnic University", "university", "Surrey"], ["Capilano University", "university", "North Vancouver"], ["Vancouver Island University", "university", "Nanaimo"],
    ["Thompson Rivers University", "university", "Kamloops"], ["University of the Fraser Valley", "university", "Abbotsford"], ["Simon Fraser University", "university", "Burnaby"],
    ["University of Victoria", "university", "Victoria"], ["University of British Columbia", "university", "Vancouver"], ["University of Northern British Columbia", "university", "Prince George"],
    ["Royal Roads University", "university", "Victoria"]],
  AB: [["Bow Valley College", "college", "Calgary"], ["SAIT", "polytechnic", "Calgary"], ["NAIT", "polytechnic", "Edmonton"], ["NorQuest College", "college", "Edmonton"],
    ["Red Deer Polytechnic", "polytechnic", "Red Deer"], ["Lethbridge Polytechnic", "polytechnic", "Lethbridge"], ["Medicine Hat College", "college", "Medicine Hat"],
    ["Lakeland College", "college", "Vermilion"], ["Olds College", "college", "Olds"], ["Northwestern Polytechnic", "polytechnic", "Grande Prairie"], ["Keyano College", "college", "Fort McMurray"],
    ["MacEwan University", "university", "Edmonton"], ["Mount Royal University", "university", "Calgary"], ["University of Alberta", "university", "Edmonton"],
    ["University of Calgary", "university", "Calgary"], ["University of Lethbridge", "university", "Lethbridge"]],
  SK: [["Saskatchewan Polytechnic", "polytechnic", "Saskatoon"], ["University of Regina", "university", "Regina"], ["University of Saskatchewan", "university", "Saskatoon"]],
  MB: [["Red River College Polytechnic", "polytechnic", "Winnipeg"], ["Assiniboine College", "college", "Brandon"], ["University of Manitoba", "university", "Winnipeg"],
    ["University of Winnipeg", "university", "Winnipeg"], ["Brandon University", "university", "Brandon"]],
  ON: [["Conestoga College", "college", "Kitchener"], ["Seneca Polytechnic", "polytechnic", "Toronto"], ["Humber Polytechnic", "polytechnic", "Toronto"],
    ["George Brown College", "college", "Toronto"], ["Centennial College", "college", "Toronto"], ["Sheridan College", "college", "Oakville"], ["Fanshawe College", "college", "London"],
    ["Algonquin College", "college", "Ottawa"], ["Durham College", "college", "Oshawa"], ["Georgian College", "college", "Barrie"], ["Niagara College", "college", "Welland"],
    ["Mohawk College", "college", "Hamilton"], ["St. Clair College", "college", "Windsor"], ["Lambton College", "college", "Sarnia"], ["Fleming College", "college", "Peterborough"],
    ["Loyalist College", "college", "Belleville"], ["St. Lawrence College", "college", "Kingston"], ["Cambrian College", "college", "Sudbury"], ["Canadore College", "college", "North Bay"],
    ["Confederation College", "college", "Thunder Bay"], ["Northern College", "college", "Timmins"], ["Sault College", "college", "Sault Ste. Marie"],
    ["University of Windsor", "university", "Windsor"], ["Lakehead University", "university", "Thunder Bay"], ["Trent University", "university", "Peterborough"],
    ["Algoma University", "university", "Sault Ste. Marie"], ["Laurentian University", "university", "Sudbury"], ["Brock University", "university", "St. Catharines"],
    ["Ontario Tech University", "university", "Oshawa"], ["Wilfrid Laurier University", "university", "Waterloo"], ["University of Waterloo", "university", "Waterloo"],
    ["York University", "university", "Toronto"], ["Toronto Metropolitan University", "university", "Toronto"]],
  NS: [["Nova Scotia Community College", "college", "Halifax"], ["Cape Breton University", "university", "Sydney"], ["Saint Mary's University", "university", "Halifax"], ["Dalhousie University", "university", "Halifax"]],
  NB: [["New Brunswick Community College", "college", "Fredericton"], ["University of New Brunswick", "university", "Fredericton"]],
  PE: [["Holland College", "college", "Charlottetown"], ["University of Prince Edward Island", "university", "Charlottetown"]],
  NL: [["College of the North Atlantic", "college", "St. John's"], ["Memorial University of Newfoundland", "university", "St. John's"]],
};
async function seedSchools(env) {
  const now = new Date().toISOString(), stmts = [];
  for (const [prov, list] of Object.entries(SEED)) for (const [name, kind, city] of list)
    stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO study_schools (id, name, kind, province, city, applyboard, updated) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)`)
      .bind(slug(name), name, kind, prov, city, now));
  await env.DB.batch(stmts);
}
export const slug = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/* ---------------- reading the student's profile ---------------- */
const ORDER = ["tenth", "twelfth", "diploma", "bachelors", "masters", "phd"];
const LEVEL_RANK = { tenth: 0, twelfth: 1, diploma: 2, bachelors: 3, masters: 4, phd: 5 };
// Which program levels each highest qualification can normally go on to (a program's own "minimum prior" overrides)
const NEEDS = { certificate: "twelfth", diploma: "twelfth", "advanced-diploma": "twelfth", bachelors: "twelfth", "pg-cert": "diploma", masters: "bachelors" };

// "78%", "78.4 %", "CGPA 7.6/10", "3.2/4", "7.2" (out of 10), "640/800" → a percentage, or null when it can't be read
export function percent(s) {
  const t = String(s || "").replace(/,/g, "");
  let m = t.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (m && +m[2] > 0) { const p = +m[2] === 10 ? +m[1] * 9.5 : (+m[1] / +m[2]) * 100; return p <= 100 ? round1(p) : null; } // CGPA out of 10 → ×9.5
  m = t.match(/(\d+(?:\.\d+)?)\s*%/); if (m && +m[1] <= 100) return round1(+m[1]);
  m = t.match(/(\d+(?:\.\d+)?)/); if (!m) return null;
  const v = +m[1];
  if (/cgpa|gpa|sgpa|cpi/i.test(t) || v <= 10) return v <= 4.0 && /\/\s*4|gpa/i.test(t) && !/cgpa/i.test(t) ? round1(v * 25) : v <= 10 ? round1(v * 9.5) : null; // Indian CGPA ×9.5
  return v <= 100 ? round1(v) : null;
}
const round1 = (x) => Math.round(x * 10) / 10;
const year = (s) => { const m = String(s || "").match(/(19|20)\d\d/); return m ? +m[0] : null; };
export function budgetMax(s) {
  const n = [...String(s || "").replace(/,/g, "").matchAll(/\d{4,6}/g)].map((m) => +m[0]);
  if (/over|above|more than/i.test(s) && n.length) return Infinity;
  return n.length ? Math.max(...n) : null;
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const intakeMonth = (s) => { const m = String(s || "").toLowerCase().match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/); return m ? m[0] : null; };
const PLAN_LEVEL = (s) => {
  s = String(s || "").toLowerCase();
  if (/master/.test(s)) return ["masters"]; if (/post-?graduate|pg /.test(s)) return ["pg-cert"]; if (/advanced/.test(s)) return ["advanced-diploma"];
  if (/bachelor/.test(s)) return ["bachelors"]; if (/certificate|diploma/.test(s)) return ["certificate", "diploma"]; return null; // not sure → any level
};
export function fieldsOf(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[^a-z0-9.+ ]+/g, " ") + " ";
  const hits = {};
  for (const [f, words] of Object.entries(FIELD_WORDS)) for (const w of words.split(" ")) if (w && t.includes(" " + w + " ")) hits[f] = (hits[f] || 0) + (w.length > 3 ? 2 : 1);
  return hits;
}

export function studentFacts(row) {
  let plans = {}, prof = {};
  try { plans = JSON.parse(row.plans || "{}"); } catch {}
  try { prof = JSON.parse(row.profile || "{}"); } catch {}
  const edu = (prof.education || []).filter((e) => LEVEL_RANK[e.level] != null).sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  const top = edu[edu.length - 1] || null;
  const lastYear = Math.max(0, ...edu.map((e) => year(e.completed) || 0)) || null;
  const gapTxt = (String(plans.gap || "").match(/(\d+)\s*year/) || [])[1];
  const gap = gapTxt != null ? +gapTxt : lastYear ? Math.max(0, new Date().getFullYear() - lastYear) : null;
  const e = prof.english || {};
  const num = (x) => { const v = parseFloat(x); return isNaN(v) ? null : v; };
  const bands = [e.listening, e.reading, e.writing, e.speaking].map(num).filter((v) => v != null);
  return {
    top: top ? top.level : null, topName: top ? [top.credential, top.major].filter(Boolean).join(" – ") : "",
    percent: top ? percent(top.result) : null, backlogs: top ? parseInt(top.backlogs) || 0 : 0, gap,
    test: e.test || "none", overall: num(e.overall), minBand: bands.length ? Math.min(...bands) : null,
    levels: PLAN_LEVEL(plans.level), budget: budgetMax(plans.budget), intake: intakeMonth(plans.intake), intakeTxt: plans.intake || "",
    fields: fieldsOf([plans.field, plans.field, top && top.major, top && top.credential].join(" ")), fieldTxt: plans.field || "",
    where: String([plans.notes].join(" ")).toLowerCase(), country: plans.country || "",
  };
}

/* ---------------- matching ---------------- */
// Each check gives ok / soft (fixable or worth a word with the student) / hard (not eligible).
export function matchOne(f, p, school) {
  const checks = [], add = (k, state, text) => checks.push({ k, state, text });
  // Level the student can enter
  const need = p.min_prior || NEEDS[p.level] || "twelfth";
  if (!f.top) add("level", "soft", "Highest qualification not confirmed");
  else if (LEVEL_RANK[f.top] >= LEVEL_RANK[need]) add("level", "ok", `${cap(f.top)} meets the entry level`);
  else add("level", "hard", `Needs ${need === "twelfth" ? "12th" : need === "bachelors" ? "a bachelor's" : "a diploma or degree"} first`);
  // Marks
  if (p.min_percent) {
    if (f.percent == null) add("marks", "soft", `Needs ${p.min_percent}% – check the marks`);
    else if (f.percent >= p.min_percent) add("marks", "ok", `${f.percent}% ≥ ${p.min_percent}%`);
    else if (f.percent >= p.min_percent - 3) add("marks", "soft", `${f.percent}% is just under ${p.min_percent}%`);
    else add("marks", "hard", `${f.percent}% is below ${p.min_percent}%`);
  }
  if (p.max_backlogs != null && f.backlogs > p.max_backlogs) add("backlogs", "hard", `${f.backlogs} backlogs (max ${p.max_backlogs})`);
  // English
  const req = { ielts_academic: p.ielts, pte_academic: p.pte, toefl_ibt: p.toefl, duolingo: p.duolingo }[f.test];
  const anyReq = p.ielts || p.pte || p.toefl || p.duolingo;
  if (!anyReq) add("english", "ok", "No English score listed – check the program page");
  else if (f.test === "none" || f.test === "planned") add("english", "soft", `English test needed${p.ielts ? ` (IELTS ${p.ielts}${p.ielts_band ? `, no band below ${p.ielts_band}` : ""})` : ""}`);
  else if (f.test === "ielts_general") add("english", "soft", "Has IELTS General – colleges usually need IELTS Academic");
  else if (req == null) add("english", "soft", `Check whether ${testName(f.test)} is accepted`);
  else if (f.overall == null) add("english", "soft", "English score not confirmed");
  else if (f.overall < req) add("english", f.overall >= req - (f.test === "ielts_academic" ? 0.5 : 5) ? "soft" : "hard", `${testName(f.test)} ${f.overall} below ${req}`);
  else if (f.test === "ielts_academic" && p.ielts_band && f.minBand != null && f.minBand < p.ielts_band) add("english", "soft", `A band of ${f.minBand} is under ${p.ielts_band}`);
  else add("english", "ok", `${testName(f.test)} ${f.overall} ≥ ${req}`);
  // Study gap
  if (p.max_gap != null && f.gap != null && f.gap > p.max_gap) add("gap", "soft", `${f.gap}-year gap (program prefers ${p.max_gap} or less) – gap explanation needed`);
  // Budget (first-year tuition)
  if (p.tuition && f.budget != null && f.budget !== Infinity) {
    if (p.tuition <= f.budget) add("budget", "ok", `$${fmt(p.tuition)} a year fits the budget`);
    else add("budget", p.tuition <= f.budget * 1.2 ? "soft" : "hard", `$${fmt(p.tuition)} a year is over the $${fmt(f.budget)} budget`);
  }
  // Intake
  const ints = String(p.intakes || "").toLowerCase();
  if (f.intake && ints) add("intake", ints.includes(f.intake) ? "ok" : "soft", ints.includes(f.intake) ? `${cap(f.intake)} intake offered` : `No ${cap(f.intake)} intake (offers ${p.intakes})`);
  // Score: field fit matters most, then the level they asked for, then the rest
  const fieldHit = f.fields[p.field] || 0, nameHit = Object.keys(fieldsOf(p.name)).some((k) => f.fields[k]);
  let score = fieldHit ? 40 + Math.min(10, fieldHit * 2) : nameHit ? 30 : Object.keys(f.fields).length ? 0 : 15;
  if (!f.levels || f.levels.includes(p.level)) score += 20;
  score += checks.filter((c) => c.state === "ok").length * 4 - checks.filter((c) => c.state === "soft").length * 8;
  if (p.pgwp === "yes") score += 6;
  if (school && f.where && (f.where.includes(String(school.city || "").toLowerCase()) || f.where.includes(String(school.name).toLowerCase()))) score += 10;
  const hard = checks.some((c) => c.state === "hard"), soft = checks.filter((c) => c.state === "soft").length;
  return { score, checks, grade: hard ? "no" : soft ? "maybe" : "good", fieldFit: !!(fieldHit || nameHit) };
}

export function matchAll(row, programs, schools) {
  const f = studentFacts(row), byId = new Map(schools.map((s) => [s.id, s]));
  const out = [];
  for (const p of programs) {
    const s = byId.get(p.school_id);
    if (!s || !s.applyboard || !p.active) continue; // ApplyBoard schools only
    const m = matchOne(f, p, s);
    out.push({ ...m, program: p, school: { id: s.id, name: s.name, city: s.city, province: s.province, kind: s.kind } });
  }
  out.sort((a, b) => ({ good: 0, maybe: 1, no: 2 })[a.grade] - ({ good: 0, maybe: 1, no: 2 })[b.grade] || b.score - a.score);
  return { facts: f, matches: out };
}

const cap = (s) => ({ twelfth: "12th", tenth: "10th", diploma: "Diploma", bachelors: "Bachelor's", masters: "Master's", phd: "PhD" })[s] || (s ? s[0].toUpperCase() + s.slice(1) : "");
const testName = (t) => ({ ielts_academic: "IELTS", ielts_general: "IELTS General", pte_academic: "PTE", pte_core: "PTE Core", toefl_ibt: "TOEFL", duolingo: "Duolingo", celpip: "CELPIP" })[t] || "This test";
const fmt = (n) => Number(n).toLocaleString("en-CA");
