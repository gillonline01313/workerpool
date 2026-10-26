// Forum categories and job locations. This is the single source: the forum page loads it from /api/forum?view=meta.
// To add a category, add a line to the right section. Ids must stay the same once topics exist (topics store the id).

const c = (id, name, desc = "") => ({ id, name, desc });

export const SECTIONS = [
  {
    id: "tr", name: "Temporary residence", desc: "Visitor visas, work permits, study permits and changing status inside Canada.",
    cats: [
      c("tr-visitor", "Visitor visa (TRV) and eTA", "Tourist and family visits, eTA, multiple-entry visas"),
      c("tr-supervisa", "Super Visa", "Long stays for parents and grandparents"),
      c("tr-visitor-extend", "Extending a visit (visitor record)", "Staying longer as a visitor"),
      c("tr-wp-outside", "Work permit from outside Canada", "Applying for a work permit from your home country"),
      c("tr-wp-inside", "Work permit from inside Canada", "Extensions, new employer, changing conditions"),
      c("tr-lmia-wp", "LMIA-based work permits", "Employer-specific permits backed by an LMIA"),
      c("tr-lmia-exempt", "LMIA-exempt work permits", "Intra-company transfer, CUSMA, significant benefit, francophone mobility"),
      c("tr-iec", "IEC: Working Holiday, Young Professionals, Co-op", "International Experience Canada pools and invitations"),
      c("tr-sowp", "Spousal open work permit", "Open work permits for spouses and partners of workers and students"),
      c("tr-pgwp", "Post-graduation work permit (PGWP)", "Eligibility, field of study, length, applying"),
      c("tr-bowp", "Bridging open work permit", "Working while your PR application is processed"),
      c("tr-vowp", "Vulnerable worker open work permit", "Workers facing abuse or risk of abuse"),
      c("tr-sp-outside", "Study permit from outside Canada", "Admission, PAL/TAL, proof of funds, visa office"),
      c("tr-sp-inside", "Study permit from inside Canada", "Extensions, changing schools or programs"),
      c("tr-work-to-study", "Work to study", "Workers in Canada going back to school"),
      c("tr-study-to-work", "Study to work", "Students moving to PGWP or other work permits"),
      c("tr-visitor-to-status", "Visitor to worker or student", "Changing status from visitor inside Canada"),
      c("tr-family", "Family of temporary residents", "Bringing spouse and children, minor children's study permits"),
      c("tr-seasonal", "Seasonal agricultural and agri-food workers", "SAWP, farm and food processing work permits"),
      c("tr-caregiver-wp", "Caregiver and in-home work permits", "Child care and home support work permits"),
      c("tr-status", "Maintained status and restoration", "Applying before expiry, restoring lost status"),
      c("tr-trp", "Temporary resident permit and inadmissibility", "TRPs, criminal and medical inadmissibility"),
      c("tr-refusal", "TR refusals, reconsideration and judicial review", "Understanding refusal reasons and next steps"),
      c("tr-process", "Biometrics, medicals and processing times", "Biometrics, medical exams, police certificates, wait times"),
    ],
  },
  {
    id: "pr", name: "Permanent residence", desc: "Express Entry, family sponsorship, pilots, humanitarian cases and life after PR.",
    cats: [
      c("pr-ee", "Express Entry: profiles, CRS and draws", "General Express Entry questions and draw discussion"),
      c("pr-cec", "Canadian Experience Class (CEC)", "PR with Canadian work experience"),
      c("pr-fsw", "Federal Skilled Worker (FSW)", "PR from outside Canada with foreign experience"),
      c("pr-fst", "Federal Skilled Trades (FST)", "Trades, certificates of qualification, job offers"),
      c("pr-ee-cat", "Express Entry category-based draws", "French, health care, trades, education, physicians and other categories"),
      c("pr-spouse-inland", "Spouse or partner sponsorship: inland", "Sponsoring a spouse or common-law partner living in Canada"),
      c("pr-spouse-outland", "Spouse or partner sponsorship: outland", "Sponsoring a spouse, common-law or conjugal partner abroad"),
      c("pr-child", "Dependent child sponsorship", "Sponsoring children and adopted children"),
      c("pr-pgp", "Parents and grandparents (PGP)", "Interest to sponsor, invitations, income requirements"),
      c("pr-relatives", "Other relatives and orphaned relatives", "Lonely Canadian rule, orphaned siblings, nieces and nephews"),
      c("pr-pnp", "Provincial nominee: general questions", "Base vs enhanced nominations; see the Provincial Nominee Programs section for each province"),
      c("pr-aip", "Atlantic Immigration Program", "Designated employers in NB, NS, PEI and NL"),
      c("pr-rcip-fcip", "Rural and Francophone pilots: general", "RCIP and FCIP questions; see their sections for each community"),
      c("pr-caregiver", "Home care worker pilots (caregivers)", "Child care and home support PR pathways"),
      c("pr-agri", "Agri-food workers to PR", "Agri-Food Pilot and replacement pathways"),
      c("pr-empp", "Economic Mobility Pathways Pilot", "Skilled refugees and displaced people"),
      c("pr-business", "Business, start-up and self-employed", "Start-up Visa, entrepreneur pilots, self-employed persons"),
      c("pr-quebec", "Quebec immigration", "PSTQ, PEQ, CSQ and Quebec-selected workers"),
      c("pr-hc", "Humanitarian and compassionate (H&C)", "H&C applications from inside or outside Canada"),
      c("pr-refugee", "Refugee claims and protected persons", "Asylum claims, hearings, PR as a protected person"),
      c("pr-trpr", "TR to PR public policies and special measures", "Time-limited pathways for people already in Canada"),
      c("pr-copr", "COPR, landing and PR confirmation", "Passport requests, landing at the border or online"),
      c("pr-card", "PR card, PRTD and residency obligation", "Renewals, travel documents, two-in-five-years rule"),
      c("pr-refusal", "PR refusals, fairness letters and appeals", "Procedural fairness letters, IAD appeals, re-applying"),
      c("pr-citizenship", "Citizenship", "Physical presence, test, oath, proof of citizenship"),
    ],
  },
  {
    id: "pnp", name: "Provincial Nominee Programs", desc: "One forum for each province and territory with a nominee program.",
    cats: [
      c("pnp-bc", "BC PNP (British Columbia)", "Skills Immigration, health authority, entrepreneur, draws"),
      c("pnp-ab", "AAIP (Alberta)", "Alberta Opportunity, Express Entry, rural and tourism streams"),
      c("pnp-sk", "SINP (Saskatchewan)", "International skilled worker, experience and entrepreneur categories"),
      c("pnp-mb", "MPNP (Manitoba)", "Skilled workers in Manitoba and overseas, international education"),
      c("pnp-on", "OINP (Ontario)", "Employer job offer, human capital and in-demand skills streams"),
      c("pnp-nb", "NB PNP (New Brunswick)", "Skilled worker, Express Entry and business streams"),
      c("pnp-ns", "NSNP (Nova Scotia)", "Nova Scotia nominee streams and labour market priorities"),
      c("pnp-pe", "PEI PNP (Prince Edward Island)", "Labour impact, Express Entry and business streams"),
      c("pnp-nl", "NL PNP (Newfoundland and Labrador)", "Skilled worker, international graduate and priority skills"),
      c("pnp-yt", "Yukon Nominee Program", "Skilled worker, critical impact worker, Express Entry"),
      c("pnp-nt", "NWT Nominee Program", "Employer-driven and Express Entry streams"),
    ],
  },
  {
    id: "rcip", name: "Rural Community Immigration Pilot (RCIP)", desc: "One forum for each participating rural community.",
    cats: [
      c("rcip-pictou", "Pictou County, NS"),
      c("rcip-north-bay", "North Bay and Area, ON"),
      c("rcip-sudbury", "Sudbury, ON"),
      c("rcip-timmins", "Timmins, ON"),
      c("rcip-sault", "Sault Ste. Marie, ON"),
      c("rcip-thunder-bay", "Thunder Bay, ON"),
      c("rcip-steinbach", "Steinbach, MB"),
      c("rcip-altona", "Altona/Rhineland, MB"),
      c("rcip-brandon", "Brandon, MB"),
      c("rcip-moose-jaw", "Moose Jaw, SK"),
      c("rcip-claresholm", "Claresholm, AB"),
      c("rcip-west-kootenay", "West Kootenay, BC"),
      c("rcip-north-okanagan", "North Okanagan Shuswap, BC"),
      c("rcip-peace-liard", "Peace Liard, BC"),
    ],
  },
  {
    id: "fcip", name: "Francophone Community Immigration Pilot (FCIP)", desc: "One forum for each participating francophone community.",
    cats: [
      c("fcip-acadian", "Acadian Peninsula, NB"),
      c("fcip-sudbury", "Sudbury, ON"),
      c("fcip-timmins", "Timmins, ON"),
      c("fcip-superior-east", "Superior East Region, ON"),
      c("fcip-st-pierre-jolys", "St. Pierre Jolys, MB"),
      c("fcip-kelowna", "Kelowna, BC"),
    ],
  },
  {
    id: "jobs", name: "Jobs", desc: "Job search and hiring, organized by province and city.",
    cats: [
      { id: "jobs-seekers", name: "Job seekers", desc: "Looking for work? Talk about jobs, employers and hiring in your area.", loc: true },
      { id: "jobs-employers", name: "Employers hiring", desc: "Employers about to hire: discuss roles, LMIAs and finding workers in your area.", loc: true },
    ],
  },
];

const P = (id, name, cities) => ({ id, name, cities });
export const PROVINCES = [
  P("ab", "Alberta", ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Medicine Hat", "Grande Prairie", "Fort McMurray", "Airdrie", "St. Albert", "Sherwood Park", "Spruce Grove", "Leduc", "Fort Saskatchewan", "Beaumont", "Stony Plain", "Okotoks", "Cochrane", "Chestermere", "High River", "Strathmore", "Canmore", "Banff", "Camrose", "Wetaskiwin", "Lacombe", "Sylvan Lake", "Olds", "Brooks", "Claresholm", "Cold Lake", "Bonnyville", "Lloydminster", "Whitecourt", "Hinton", "Edson", "Peace River", "Slave Lake"]),
  P("bc", "British Columbia", ["Vancouver", "Surrey", "Burnaby", "Richmond", "Delta", "Langley", "Abbotsford", "Coquitlam", "Port Coquitlam", "New Westminster", "North Vancouver", "Maple Ridge", "Mission", "Chilliwack", "Squamish", "Whistler", "Victoria", "Nanaimo", "Courtenay", "Campbell River", "Kelowna", "Vernon", "Penticton", "Salmon Arm", "Kamloops", "Nelson", "Castlegar", "Trail", "Cranbrook", "Prince George", "Quesnel", "Williams Lake", "Fort St. John", "Dawson Creek", "Fort Nelson", "Terrace", "Prince Rupert"]),
  P("sk", "Saskatchewan", ["Saskatoon", "Regina", "Prince Albert", "Moose Jaw", "Swift Current", "Yorkton", "North Battleford", "Estevan", "Weyburn", "Lloydminster", "Martensville", "Warman", "Humboldt", "Melfort", "Kindersley", "Meadow Lake"]),
  P("mb", "Manitoba", ["Winnipeg", "Brandon", "Steinbach", "Winkler", "Morden", "Altona", "Portage la Prairie", "Selkirk", "Niverville", "St. Pierre-Jolys", "Dauphin", "Neepawa", "Thompson", "The Pas", "Flin Flon"]),
  P("on", "Ontario", ["Toronto", "Brampton", "Mississauga", "Vaughan", "Markham", "Richmond Hill", "Oakville", "Burlington", "Milton", "Hamilton", "Ajax", "Pickering", "Whitby", "Oshawa", "Ottawa", "Kitchener", "Waterloo", "Cambridge", "Guelph", "London", "Windsor", "Leamington", "Chatham-Kent", "Sarnia", "Brantford", "Woodstock", "Stratford", "St. Catharines", "Niagara Falls", "Barrie", "Orillia", "Owen Sound", "Peterborough", "Belleville", "Kingston", "Cornwall", "Sudbury", "North Bay", "Timmins", "Sault Ste. Marie", "Wawa", "Thunder Bay", "Kenora"]),
  P("qc", "Quebec", ["Montréal", "Laval", "Longueuil", "Terrebonne", "Québec City", "Lévis", "Gatineau", "Sherbrooke", "Trois-Rivières", "Drummondville", "Saint-Jean-sur-Richelieu", "Granby", "Saguenay", "Rimouski", "Rouyn-Noranda", "Val-d'Or", "Sept-Îles"]),
  P("nb", "New Brunswick", ["Moncton", "Dieppe", "Riverview", "Saint John", "Fredericton", "Miramichi", "Bathurst", "Edmundston", "Caraquet", "Shippagan", "Tracadie", "Sussex", "Woodstock"]),
  P("ns", "Nova Scotia", ["Halifax", "Dartmouth", "Sydney", "Truro", "New Glasgow", "Stellarton", "Pictou", "Antigonish", "Kentville", "Wolfville", "Bridgewater", "Yarmouth", "Amherst"]),
  P("pe", "Prince Edward Island", ["Charlottetown", "Summerside", "Stratford", "Cornwall", "Montague", "Souris"]),
  P("nl", "Newfoundland and Labrador", ["St. John's", "Mount Pearl", "Paradise", "Conception Bay South", "Corner Brook", "Gander", "Grand Falls-Windsor", "Happy Valley-Goose Bay", "Labrador City"]),
  P("yt", "Yukon", ["Whitehorse", "Dawson City", "Watson Lake"]),
  P("nt", "Northwest Territories", ["Yellowknife", "Hay River", "Inuvik", "Fort Smith"]),
  P("nu", "Nunavut", ["Iqaluit", "Rankin Inlet", "Cambridge Bay"]),
];

export const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Meta sent to the page: sections plus provinces with city ids ("ab:edmonton"; "ab:other" for any other town).
export const META = {
  sections: SECTIONS,
  provinces: PROVINCES.map((p) => ({ id: p.id, name: p.name, cities: p.cities.map((n) => ({ id: `${p.id}:${slug(n)}`, name: n })).concat([{ id: `${p.id}:other`, name: `Other town in ${p.name}` }]) })),
};

const CAT = new Map(SECTIONS.flatMap((s) => s.cats.map((x) => [x.id, { ...x, section: s.id }])));
const LOC = new Set(META.provinces.flatMap((p) => [p.id, ...p.cities.map((x) => x.id)]));
export const getCat = (id) => CAT.get(id) || null;
// A location is a province ("ab") or a city/town in it ("ab:edmonton"). Topics must name a city or "other town".
export const validLoc = (loc) => LOC.has(loc);
export const isCityLoc = (loc) => LOC.has(loc) && loc.includes(":");

// Usernames: 3 to 20 letters, numbers, dot, dash or underscore; start with a letter or number.
const RESERVED = /^(admin|administrator|mod|moderator|workerpool|support|staff|ircc|cic|rcic|cicc|official|system|root|help|team)$/i;
export function checkUsername(u) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,19}$/.test(u)) return "Usernames are 3 to 20 characters: letters, numbers, dot, dash or underscore, starting with a letter or number.";
  if (RESERVED.test(u) || /workerpool|ircc/i.test(u)) return "That username is reserved. Pick another.";
  return "";
}
