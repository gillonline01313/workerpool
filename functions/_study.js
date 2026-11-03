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

export async function ensureStudyTables(env, request) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, province TEXT, city TEXT, dli TEXT,
    applyboard INTEGER NOT NULL DEFAULT 0, website TEXT, note TEXT, updated TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_programs (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL, level TEXT NOT NULL, field TEXT,
    campus TEXT, intakes TEXT, tuition INTEGER, months INTEGER, min_prior TEXT, min_percent REAL, max_gap INTEGER, max_backlogs INTEGER,
    ielts REAL, ielts_band REAL, pte REAL, toefl REAL, duolingo REAL, pgwp TEXT, link TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1, updated TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS study_programs_school ON study_programs (school_id)`).run();
  try { await env.DB.prepare(`ALTER TABLE study_schools ADD COLUMN ab_source TEXT`).run(); } catch {}
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM study_schools`).first();
  if (!n || !n.n) await seedSchools(env);
  await applyEvidence(env);
  for (const c of ["origin TEXT", "source TEXT"]) { try { await env.DB.prepare(`ALTER TABLE study_programs ADD COLUMN ${c}`).run(); } catch {} }
  if (request && env.ASSETS) await loadCatalog(env, request);
}

// PGWP-eligible programs collected from each college's official page (data/study-programs.json, built by
// scripts/programs/build.mjs). Loaded into D1 whenever the file's version changes. Rows the admin edited (origin
// 'admin') are never overwritten; catalog programs that drop off a college's list are paused, not deleted.
async function loadCatalog(env, request) {
  let cat;
  try { const r = await env.ASSETS.fetch(new URL("/data/study-programs.json", request.url)); if (!r.ok) return; cat = await r.json(); } catch { return; }
  if (!cat || !cat.version || !Array.isArray(cat.programs)) return;
  const done = await env.DB.prepare(`SELECT v FROM study_meta WHERE k = 'catalog-version'`).first();
  if (done && done.v === cat.version) return;
  const now = new Date().toISOString(), stmts = [];
  for (const sc of cat.schools || []) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO study_schools (id, name, kind, province, city, applyboard, updated) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)`)
    .bind(sc.id, sc.name, sc.kind || "college", sc.province || null, sc.city || null, now));
  const ids = [];
  for (const p of cat.programs) {
    ids.push(p.id);
    stmts.push(env.DB.prepare(`INSERT INTO study_programs (id, school_id, name, level, field, campus, intakes, pgwp, link, note, active, origin, source, updated)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, 'catalog', ?11, ?12)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, level = excluded.level, field = excluded.field, campus = excluded.campus, intakes = COALESCE(excluded.intakes, study_programs.intakes),
        pgwp = excluded.pgwp, link = excluded.link, source = excluded.source, active = 1, updated = excluded.updated WHERE study_programs.origin = 'catalog'`)
      .bind(p.id, p.school, p.name, p.level, p.field || "other", p.campus || null, p.intakes || null, p.pgwp || "yes", p.link || null, p.note || null, p.source || null, now));
  }
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  // programs no longer on a college's list: pause them (only catalog rows from schools this file covers)
  const covered = [...new Set(cat.programs.map((p) => p.school))];
  const old = (await env.DB.prepare(`SELECT id, school_id FROM study_programs WHERE origin = 'catalog' AND active = 1`).all()).results;
  const keep = new Set(ids), gone = old.filter((r) => covered.includes(r.school_id) && !keep.has(r.id));
  for (let i = 0; i < gone.length; i += 90) await env.DB.batch(gone.slice(i, i + 90).map((r) => env.DB.prepare(`UPDATE study_programs SET active = 0, updated = ?1 WHERE id = ?2`).bind(now, r.id)));
  await env.DB.prepare(`INSERT OR REPLACE INTO study_meta (k, v) VALUES ('catalog-version', ?1)`).bind(cat.version).run();
}
// Schools with public evidence of being on ApplyBoard (its own public school page, help-centre article or blog), checked
// November 3, 2026. Applied once as the starting ticks; the admin can untick or tick anything afterwards. Schools without
// such evidence (e.g. UBC, SFU, Camosun, Algonquin, Durham, Lambton, U of A, U of C, Dalhousie) stay unticked.
export const AB_EVIDENCE = {
  "douglas-college": "https://www.applyboard.com/schools/douglas-college-new-westminster",
  "langara-college": "https://www.applyboard.com/schools/langara-college",
  "vancouver-community-college": "https://www.applyboard.com/schools/vancouver-community-college-broadway",
  "british-columbia-institute-of-technology": "https://assist.applyboard.com/hc/en-us/articles/6478177974285-British-Columbia-Institute-of-Technology-BCIT-Programs-Fees-and-How-to-Apply",
  "okanagan-college": "https://www.applyboard.com/schools/okanagan-college-kelowna",
  "selkirk-college": "https://www.applyboard.com/schools/selkirk-college-nelson",
  "college-of-new-caledonia": "https://www.applyboard.com/schools/college-of-new-caledonia",
  "north-island-college": "https://www.applyboard.com/schools/north-island-college-comox-valley",
  "coast-mountain-college": "https://www.applyboard.com/schools/coast-mountain-college-terrace",
  "college-of-the-rockies": "https://www.applyboard.com/schools/college-of-the-rockies",
  "kwantlen-polytechnic-university": "https://www.applyboard.com/schools/kwantlen-polytechnic-university-surrey",
  "capilano-university": "https://www.applyboard.com/schools/capilano-university",
  "vancouver-island-university": "https://www.applyboard.com/schools/vancouver-island-university",
  "thompson-rivers-university": "https://www.applyboard.com/schools/thompson-rivers-university",
  "university-of-the-fraser-valley": "https://www.applyboard.com/schools/university-of-the-fraser-valley",
  "university-of-victoria": "https://assist.applyboard.com/hc/en-us/articles/47516928158989-University-of-Victoria-Programs-Fees-and-How-to-Apply",
  "university-of-northern-british-columbia": "https://www.applyboard.com/schools/university-of-northern-british-columbia",
  "royal-roads-university": "https://www.applyboard.com/schools/royal-roads-university",
  "bow-valley-college": "https://www.applyboard.com/schools/bow-valley-college",
  "sait": "https://assist.applyboard.com/hc/en-us/articles/6478190335757-Southern-Alberta-Institute-of-Technology-Programs-Fees-and-How-to-Apply",
  "nait": "https://www.applyboard.com/schools/northern-alberta-institute-of-technology-nait-main",
  "norquest-college": "https://www.applyboard.com/schools/norquest-college",
  "red-deer-polytechnic": "https://www.applyboard.com/schools/red-deer-polytechnic",
  "lakeland-college": "https://www.applyboard.com/schools/lakeland-college-vermilion",
  "olds-college": "https://www.applyboard.com/schools/olds-college",
  "northwestern-polytechnic": "https://www.applyboard.com/schools/northwestern-polytechnic-grande-prairie",
  "keyano-college": "https://www.applyboard.com/schools/keyano-college",
  "macewan-university": "https://www.applyboard.com/schools/macewan-university",
  "mount-royal-university": "https://www.applyboard.com/schools/mount-royal-university",
  "university-of-lethbridge": "https://www.applyboard.com/schools/university-of-lethbridge-lethbridge",
  "saskatchewan-polytechnic": "https://www.applyboard.com/blog/introducing-the-partner-schools-presenting-at-top-recruiters-workshop",
  "university-of-regina": "https://www.applyboard.com/schools/university-of-regina",
  "university-of-saskatchewan": "https://www.applyboard.com/schools/university-of-saskatchewan",
  "red-river-college-polytechnic": "https://assist.applyboard.com/hc/en-us/articles/6478115211277-Red-River-College-Polytechnic-Programs-Fees-and-How-to-Apply",
  "assiniboine-college": "https://www.applyboard.com/schools/assiniboine-college",
  "university-of-manitoba": "https://www.applyboard.com/schools/270",
  "brandon-university": "https://www.applyboard.com/schools/brandon-university",
  "conestoga-college": "https://assist.applyboard.com/hc/en-us/articles/6478291604621-Conestoga-College-Programs-Fees-and-How-to-Apply",
  "seneca-polytechnic": "https://assist.applyboard.com/hc/en-us/articles/6478305628173-Seneca-Polytechnic-Programs-Fees-and-How-to-Apply",
  "humber-polytechnic": "https://www.applyboard.com/best-programs/best-undergraduate-advertising-programs-in-canada",
  "george-brown-college": "https://assist.applyboard.com/hc/en-us/articles/6478177492493-George-Brown-Polytechnic-Programs-Fees-and-How-to-Apply",
  "centennial-college": "https://assist.applyboard.com/hc/en-us/articles/6478323312525-Centennial-College-Programs-Fees-and-How-to-Apply",
  "sheridan-college": "https://www.applyboard.com/best-programs/best-undergraduate-advertising-programs-in-canada",
  "fanshawe-college": "https://www.applyboard.com/schools/fanshawe-college",
  "georgian-college": "https://www.applyboard.com/schools/georgian-college-midland",
  "niagara-college": "https://assist.applyboard.com/hc/en-us/articles/47290566156301-Niagara-College-Programs-Fees-and-How-to-Apply",
  "mohawk-college": "https://www.applyboard.com/best-programs/best-undergraduate-advertising-programs-in-canada",
  "st-clair-college": "https://www.applyboard.com/best-programs/best-undergraduate-advertising-programs-in-canada",
  "fleming-college": "https://www.applyboard.com/schools/fleming-college",
  "loyalist-college": "https://www.applyboard.com/schools/loyalist-college-belleville-campus",
  "st-lawrence-college": "https://www.applyboard.com/schools/st-lawrence-college-kingston",
  "cambrian-college": "https://www.applyboard.com/schools/cambrian-college",
  "canadore-college": "https://www.applyboard.com/schools/canadore-college-college-drive",
  "confederation-college": "https://www.applyboard.com/schools/confederation-college-thunder-bay",
  "northern-college": "https://www.applyboard.com/schools/northern-college-timmins",
  "sault-college": "https://www.applyboard.com/schools/sault-college-sault-ste-marie",
  "university-of-windsor": "https://assist.applyboard.com/hc/en-us/articles/41391287334925-Study-at-the-University-of-Windsor-A-Guide-for-International-Students",
  "lakehead-university": "https://www.applyboard.com/schools/lakehead-university",
  "trent-university": "https://www.applyboard.com/schools/trent-university-peterborough",
  "algoma-university": "https://www.applyboard.com/blog/which-universities-in-ontario-are-partnered-with-applyboard",
  "laurentian-university": "https://www.applyboard.com/blog/which-universities-in-ontario-are-partnered-with-applyboard",
  "brock-university": "https://www.applyboard.com/schools/brock-university",
  "ontario-tech-university": "https://www.applyboard.com/schools/ontario-tech-university-north-oshawa",
  "wilfrid-laurier-university": "https://www.applyboard.com/schools/wilfrid-laurier-university-waterloo",
  "university-of-waterloo": "https://www.applyboard.com/schools/2",
  "toronto-metropolitan-university": "https://www.applyboard.com/schools/toronto-metropolitan-university",
  "cape-breton-university": "https://www.applyboard.com/schools/cape-breton-university",
  "new-brunswick-community-college": "https://assist.applyboard.com/hc/en-us/articles/47678110685709-New-Brunswick-Community-College-Programs-Fees-and-How-to-Apply",
  "university-of-new-brunswick": "https://www.applyboard.com/schools/university-of-new-brunswick-fredericton",
  "university-of-prince-edward-island": "https://www.applyboard.com/schools/university-of-prince-edward-island",
  "college-of-the-north-atlantic": "https://www.applyboard.com/schools/college-of-the-north-atlantic-ridge-road",
  "memorial-university-of-newfoundland": "https://www.applyboard.com/schools/memorial-university-of-newfoundland-mun-st-john-s-campus",
};
async function applyEvidence(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_meta (k TEXT PRIMARY KEY, v TEXT)`).run();
  if (await env.DB.prepare(`SELECT v FROM study_meta WHERE k = 'ab-evidence-2026-11'`).first()) return;
  const now = new Date().toISOString();
  await env.DB.batch([...Object.entries(AB_EVIDENCE).map(([id, url]) =>
    env.DB.prepare(`UPDATE study_schools SET applyboard = 1, ab_source = ?1, updated = ?2 WHERE id = ?3 AND ab_source IS NULL`).bind(url, now, id)),
    env.DB.prepare(`INSERT OR REPLACE INTO study_meta (k, v) VALUES ('ab-evidence-2026-11', ?1)`).bind(now)]);
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
    // the field the student typed decides; their last major is used only when they left it blank
    fields: String(plans.field || "").trim() ? fieldsOf(plans.field) : fieldsOf([top && top.major, top && top.credential].join(" ")), fieldTxt: plans.field || "",
    province: String(plans.province || "").toUpperCase().slice(0, 2),
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
  if (!anyReq) add("english", f.test === "none" || f.test === "planned" ? "soft" : "ok", f.test === "none" || f.test === "planned" ? "English test needed (IELTS Academic, PTE or similar)" : "No English score listed – check the program page");
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
