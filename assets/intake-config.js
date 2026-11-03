/* Client intake forms: the catalog shown in admin → Intake forms, and each form's questions and document list.
   Used by the client page (/intake/), the admin tab and the server (to check required answers and documents).

   Field:   { k: key, l: label, t: type, r: 1 if required, o: [options], if: condition, h: help text, full: 1 for full width }
   Types:   t text · ta long text · d date · s select · yn Yes/No · e email · p phone · n number · c country · cb tick box
   Section: { id, title, intro, if, fields, rep: { min, max, add } }   (rep = the client can add rows, e.g. jobs)
   Document:{ k, l, r: 1 if required, if: condition, h: help text }   (every document takes one or more files)
   Condition: "section.key=A|B" (equals one of), "section.key!=A|B", "section.key" (answered), "@key=A" (same row of a
   repeatable section), "$minor" (applicant under 18 from date of birth). Join with "&" for AND.

   To add a form: add it to FORMS below and set ready: 1 on its catalog entry. Never change a form key that has intakes. */

const YN = ["Yes", "No"];
export const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (Democratic Republic)","Congo (Republic)","Costa Rica","Côte d'Ivoire","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hong Kong SAR","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Korea (North)","Korea (South)","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macao SAR","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Macedonia","Norway","Oman","Pakistan","Palau","Palestinian Authority","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Türkiye","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe","Stateless"];

/* ---------- catalog (admin → Intake forms) ---------- */
export const CATALOG = [
  { key: "temporary", label: "Temporary residence applications", groups: [
    { key: "outside", label: "Outside Canada", forms: [
      { key: "trv-out", name: "Visitor visa (TRV)", ready: 1 },
      { key: "supervisa-out", name: "Parent and grandparent super visa" },
      { key: "eta", name: "Electronic travel authorization (eTA)" },
      { key: "transit-out", name: "Transit visa" },
      { key: "sp-out", name: "Study permit" },
      { key: "wp-lmia-out", name: "Work permit – LMIA-based" },
      { key: "wp-exempt-out", name: "Work permit – LMIA-exempt (employer-specific)" },
      { key: "sowp-out", name: "Spousal open work permit" },
      { key: "iec-out", name: "International Experience Canada (IEC)" },
      { key: "trp-out", name: "Temporary resident permit (TRP)" },
    ]},
    { key: "inside", label: "Inside Canada", forms: [
      { key: "vr-in", name: "Visitor record (extend stay as a visitor)" },
      { key: "trv-in", name: "Visitor visa (TRV) from inside Canada" },
      { key: "sp-ext", name: "Study permit extension" },
      { key: "wp-ext", name: "Work permit extension or new employer" },
      { key: "pgwp", name: "Post-graduation work permit (PGWP)" },
      { key: "sowp-in", name: "Spousal open work permit (inside Canada)" },
      { key: "bowp", name: "Bridging open work permit (BOWP)" },
      { key: "vowp", name: "Open work permit for vulnerable workers" },
      { key: "restore", name: "Restoration of status" },
      { key: "trp-in", name: "Temporary resident permit (inside Canada)" },
    ]},
  ]},
  { key: "permanent", label: "Permanent residence applications", groups: [
    { key: "economic", label: "Economic", forms: [
      { key: "ee", name: "Express Entry (CEC, FSW, FST)" },
      { key: "pnp", name: "Provincial Nominee Program (PNP)" },
      { key: "rcip", name: "Rural Community Immigration Pilot (RCIP)" },
      { key: "fcip", name: "Francophone Community Immigration Pilot (FCIP)" },
      { key: "aip", name: "Atlantic Immigration Program (AIP)" },
      { key: "caregiver", name: "Home care worker pathways" },
    ]},
    { key: "family", label: "Family sponsorship", forms: [
      { key: "spousal", name: "Spousal or common-law sponsorship" },
      { key: "pgp", name: "Parents and grandparents sponsorship" },
      { key: "dependent", name: "Dependent child sponsorship" },
    ]},
    { key: "humanitarian", label: "Humanitarian", forms: [
      { key: "hc", name: "Humanitarian and compassionate (H&C)" },
    ]},
  ]},
];
export function catalogEntry(key) {
  for (const c of CATALOG) for (const g of c.groups) { const f = g.forms.find((x) => x.key === key); if (f) return { cat: c, group: g, form: f }; }
  return null;
}

/* ---------- reusable field sets ---------- */
const ADDRESS = (p, req) => [
  { k: p + "_apt", l: "Apartment / unit number", t: "t" },
  { k: p + "_street_no", l: "House / street number", t: "t", r: req },
  { k: p + "_street", l: "Street name, area or village", t: "t", r: req },
  { k: p + "_city", l: "City or town", t: "t", r: req },
  { k: p + "_district", l: "District", t: "t" },
  { k: p + "_province", l: "Province or state", t: "t", r: req },
  { k: p + "_postal", l: "Postal / PIN code", t: "t", r: req },
  { k: p + "_country", l: "Country", t: "c", r: req },
];

/* ---------- Visitor visa (TRV) – applying from outside Canada ----------
   Follows IRCC's Application for Visitor Visa (IMM 5257) and Schedule 1 (IMM 5257B), the Family Information form
   (IMM 5707 / IMM 5645) and the online visitor visa document checklist. Documents cover what the client can prove on
   paper; questions cover everything the forms ask that a document doesn't show. */
const TRV_OUT = {
  key: "trv-out",
  name: "Visitor visa (TRV) – outside Canada",
  intro: "This form collects everything needed to prepare a Canadian visitor visa application (IMM 5257, Schedule 1 and the Family Information form) and the supporting documents. Answer every question truthfully and completely. Wrong or missing information can lead to a refusal or a finding of misrepresentation, which can bar entry to Canada for 5 years.",
  sections: [
    { id: "about", title: "About this application", fields: [
      { k: "for_whom", l: "Who are you filling this form for?", t: "s", r: 1, o: ["Myself", "My spouse or partner", "My child", "My parent", "Another family member", "Someone else"] },
      { k: "filler_name", l: "Your full name (the person filling this form)", t: "t", r: 1, if: "about.for_whom!=Myself" },
      { k: "filler_rel", l: "Your relationship to the applicant", t: "t", r: 1, if: "about.for_whom!=Myself" },
      { k: "visa_type", l: "Type of visa requested", t: "s", r: 1, o: ["Visitor visa", "Transit visa"] },
      { k: "together", l: "Are other family members applying with this person (in a separate application)?", t: "yn", r: 1 },
      { k: "together_names", l: "Names and relationship of family members applying together", t: "ta", r: 1, if: "about.together=Yes", full: 1 },
      { k: "has_uci", l: "Does the applicant have a UCI (client ID) from an earlier Canadian application?", t: "yn", r: 1, h: "An 8 or 10 digit number on earlier Canadian visas, permits, refusal letters or IRCC letters." },
      { k: "uci", l: "UCI number", t: "t", r: 1, if: "about.has_uci=Yes" },
      { k: "service_lang", l: "Language for IRCC to contact the applicant", t: "s", r: 1, o: ["English", "French"] },
      { k: "source", l: "How did you hear about us?", t: "t" },
    ]},
    { id: "personal", title: "Personal details", intro: "Exactly as written on the passport.", fields: [
      { k: "family_name", l: "Family name (surname)", t: "t", r: 1, h: "If the passport has no surname, write all names here and leave Given names blank." },
      { k: "given_names", l: "Given names", t: "t" },
      { k: "other_names_yn", l: "Has the applicant ever used any other name (birth name, maiden name, nickname, spelling change)?", t: "yn", r: 1 },
      { k: "other_names", l: "All other names used", t: "t", r: 1, if: "personal.other_names_yn=Yes", full: 1 },
      { k: "sex", l: "Sex", t: "s", r: 1, o: ["Female", "Male", "Another gender (X)"] },
      { k: "dob", l: "Date of birth", t: "d", r: 1 },
      { k: "birth_city", l: "City or town of birth", t: "t", r: 1 },
      { k: "birth_country", l: "Country of birth", t: "c", r: 1 },
      { k: "citizenship", l: "Country of citizenship", t: "c", r: 1 },
      { k: "dual_yn", l: "Is the applicant a citizen of any other country?", t: "yn", r: 1 },
      { k: "dual", l: "Other citizenship(s)", t: "t", r: 1, if: "personal.dual_yn=Yes" },
      { k: "height", l: "Height (cm)", t: "n", h: "Asked if biometrics or a visa counterfoil needs it." },
      { k: "eye", l: "Eye colour", t: "s", o: ["Black", "Brown", "Hazel", "Blue", "Green", "Grey", "Other"] },
    ]},
    { id: "residence", title: "Country of residence", fields: [
      { k: "country", l: "Current country of residence", t: "c", r: 1 },
      { k: "status", l: "Status in that country", t: "s", r: 1, o: ["Citizen", "Permanent resident", "Worker", "Student", "Visitor", "Protected person", "Refugee claimant", "Other"] },
      { k: "status_other", l: "Describe the status", t: "t", r: 1, if: "residence.status=Other" },
      { k: "from", l: "Living there since", t: "d", r: 1, if: "residence.status!=Citizen" },
      { k: "to", l: "Status valid until", t: "d", r: 1, if: "residence.status=Worker|Student|Visitor|Refugee claimant" },
      { k: "applying_from", l: "Is the applicant applying from the country where they live now?", t: "yn", r: 1 },
      { k: "applying_country", l: "Country they are applying from", t: "c", r: 1, if: "residence.applying_from=No" },
      { k: "applying_status", l: "Status in that country", t: "s", r: 1, if: "residence.applying_from=No", o: ["Citizen", "Permanent resident", "Worker", "Student", "Visitor", "Other"] },
      { k: "applying_to", l: "Allowed to stay there until", t: "d", if: "residence.applying_from=No" },
      { k: "prev_yn", l: "In the past 5 years, did the applicant live for more than 6 months in any country other than their country of citizenship or current residence?", t: "yn", r: 1, full: 1 },
    ]},
    { id: "prev_res", title: "Previous countries of residence (past 5 years)", if: "residence.prev_yn=Yes", rep: { min: 1, max: 6, add: "Add a country" }, fields: [
      { k: "country", l: "Country", t: "c", r: 1 },
      { k: "status", l: "Status", t: "s", r: 1, o: ["Citizen", "Permanent resident", "Worker", "Student", "Visitor", "Protected person", "Other"] },
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To", t: "d", r: 1 },
    ]},
    { id: "marital", title: "Marital status", fields: [
      { k: "status", l: "Current marital status", t: "s", r: 1, o: ["Single", "Married", "Common-law", "Legally separated", "Divorced", "Widowed", "Annulled marriage"], h: "Common-law means living together in a marriage-like relationship for at least 12 months in a row." },
      { k: "date", l: "Date of marriage, or date you started living together", t: "d", r: 1, if: "marital.status=Married|Common-law" },
      { k: "spouse_family", l: "Spouse or partner's family name", t: "t", r: 1, if: "marital.status=Married|Common-law|Legally separated" },
      { k: "spouse_given", l: "Spouse or partner's given names", t: "t", if: "marital.status=Married|Common-law|Legally separated" },
      { k: "spouse_coming", l: "Is the spouse or partner travelling to Canada too?", t: "yn", r: 1, if: "marital.status=Married|Common-law" },
      { k: "prev_yn", l: "Has the applicant ever been married or in a common-law relationship before?", t: "yn", r: 1 },
      { k: "prev_family", l: "Previous spouse's family name", t: "t", r: 1, if: "marital.prev_yn=Yes" },
      { k: "prev_given", l: "Previous spouse's given names", t: "t", if: "marital.prev_yn=Yes" },
      { k: "prev_dob", l: "Previous spouse's date of birth", t: "d", r: 1, if: "marital.prev_yn=Yes" },
      { k: "prev_type", l: "Type of relationship", t: "s", r: 1, o: ["Married", "Common-law"], if: "marital.prev_yn=Yes" },
      { k: "prev_from", l: "Relationship from", t: "d", r: 1, if: "marital.prev_yn=Yes" },
      { k: "prev_to", l: "Relationship to", t: "d", r: 1, if: "marital.prev_yn=Yes" },
    ]},
    { id: "language", title: "Languages", fields: [
      { k: "native", l: "Native language (first language learned at home)", t: "t", r: 1 },
      { k: "comm", l: "Can communicate in", t: "s", r: 1, o: ["English", "French", "Both", "Neither"] },
      { k: "ease", l: "Most at ease in", t: "s", r: 1, o: ["English", "French"], if: "language.comm=Both" },
      { k: "test_yn", l: "Has the applicant taken an English or French test (IELTS, CELPIP, PTE, TEF, TCF)?", t: "yn", r: 1 },
      { k: "test", l: "Test name, date and overall score", t: "t", if: "language.test_yn=Yes" },
    ]},
    { id: "passport", title: "Passport and identity documents", fields: [
      { k: "number", l: "Passport number", t: "t", r: 1 },
      { k: "country", l: "Country of issue", t: "c", r: 1 },
      { k: "issue", l: "Issue date", t: "d", r: 1 },
      { k: "expiry", l: "Expiry date", t: "d", r: 1, h: "A visa can't be issued past this date. Renew first if it expires within about 6 months." },
      { k: "place", l: "Place of issue", t: "t" },
      { k: "old_yn", l: "Does the applicant have older passports (with past visas or travel stamps)?", t: "yn", r: 1 },
      { k: "nid_yn", l: "Does the applicant have a national identity document (e.g. Aadhaar, CNIC, national ID card)?", t: "yn", r: 1 },
      { k: "nid_no", l: "National ID number", t: "t", r: 1, if: "passport.nid_yn=Yes" },
      { k: "nid_country", l: "Country of issue", t: "c", r: 1, if: "passport.nid_yn=Yes" },
      { k: "nid_issue", l: "Issue date", t: "d", if: "passport.nid_yn=Yes" },
      { k: "nid_expiry", l: "Expiry date (if any)", t: "d", if: "passport.nid_yn=Yes" },
      { k: "uspr_yn", l: "Is the applicant a lawful permanent resident of the United States (green card)?", t: "yn", r: 1 },
      { k: "uspr_no", l: "US green card number", t: "t", r: 1, if: "passport.uspr_yn=Yes" },
      { k: "uspr_expiry", l: "Green card expiry date", t: "d", r: 1, if: "passport.uspr_yn=Yes" },
    ]},
    { id: "contact", title: "Contact details", fields: [
      { k: "email", l: "Email address", t: "e", r: 1, h: "IRCC sends letters here. Use an email you check often." },
      { k: "phone_type", l: "Main phone type", t: "s", r: 1, o: ["Cellular", "Residence", "Business", "Other"] },
      { k: "phone", l: "Main phone number (with country code)", t: "p", r: 1, h: "Example: +91 98765 43210" },
      { k: "alt_phone", l: "Other phone number", t: "p" },
      { k: "whatsapp", l: "WhatsApp number, if different", t: "p" },
      { k: "best_time", l: "Best time to call you", t: "t" },
      { k: "mail_h", l: "Mailing address", t: "h" },
      ...ADDRESS("mail", 1),
      { k: "same", l: "Is the home (residential) address the same as the mailing address?", t: "yn", r: 1, full: 1 },
      ...ADDRESS("res", 1).map((f) => ({ ...f, if: "contact.same=No", l: "Home: " + f.l })),
    ]},
    { id: "visit", title: "Details of the visit", fields: [
      { k: "purpose", l: "Main purpose of the visit", t: "s", r: 1, o: ["Family visit", "Tourism", "Business", "Attend a wedding, convocation or other event", "Medical treatment", "Short-term study (under 6 months)", "Transit", "Other"] },
      { k: "purpose_other", l: "Describe the purpose", t: "t", r: 1, if: "visit.purpose=Other" },
      { k: "details", l: "Explain the visit in your own words: why you are going, what you will do, and why the timing works", t: "ta", r: 1, full: 1 },
      { k: "event", l: "Event name, place and date", t: "t", r: 1, if: "visit.purpose=Attend a wedding, convocation or other event" },
      { k: "arrive", l: "Planned arrival date", t: "d", r: 1 },
      { k: "leave", l: "Planned departure date", t: "d", r: 1 },
      { k: "cities", l: "Cities or provinces you will visit", t: "t", r: 1 },
      { k: "stay_type", l: "Where will you stay?", t: "s", r: 1, o: ["With the person I'm visiting", "Hotel or rental", "With other friends or family", "Other"] },
      { k: "stay_address", l: "Address where you will stay", t: "ta", r: 1, full: 1 },
      { k: "funds", l: "Money available for the trip (CAD)", t: "n", r: 1, h: "The total you can spend on this visit, in Canadian dollars." },
      { k: "payer", l: "Who is paying for the trip?", t: "s", r: 1, o: ["Myself", "My spouse or partner", "My parent(s)", "My child(ren)", "The person I'm visiting in Canada", "My employer or business", "Other"] },
      { k: "payer_details", l: "Name and relationship of the person or company paying", t: "t", r: 1, if: "visit.payer!=Myself" },
      { k: "tickets", l: "Have you booked flights?", t: "s", r: 1, o: ["No, not yet", "Reservation only (not paid)", "Yes, paid"], h: "IRCC advises not to buy non-refundable tickets until the visa is approved." },
      { k: "companions_yn", l: "Is anyone travelling with you (even if they already have a visa or are Canadian)?", t: "yn", r: 1 },
      { k: "companions", l: "Names and relationship of people travelling with you", t: "ta", r: 1, if: "visit.companions_yn=Yes", full: 1 },
      { k: "host_yn", l: "Will you visit or stay with anyone in Canada (family, friends, business contact)?", t: "yn", r: 1, full: 1 },
      { k: "medical_exam", l: "Will the stay be longer than 6 months, or will you work in health care, child care or a school?", t: "yn", r: 1, h: "If yes, a medical exam may be needed." },
    ]},
    { id: "hosts", title: "People or organizations you will visit in Canada", if: "visit.host_yn=Yes", rep: { min: 1, max: 3, add: "Add another person" }, fields: [
      { k: "name", l: "Full name (or company name)", t: "t", r: 1 },
      { k: "relation", l: "Relationship to you", t: "s", r: 1, o: ["Son", "Daughter", "Brother", "Sister", "Parent", "Spouse or partner", "Cousin", "Uncle or aunt", "Nephew or niece", "Other relative", "Friend", "Business contact", "Other"] },
      { k: "status", l: "Their status in Canada", t: "s", r: 1, o: ["Canadian citizen", "Permanent resident", "Work permit", "Study permit", "Visitor", "Don't know", "Company or organization"] },
      { k: "dob", l: "Their date of birth", t: "d", if: "@status!=Company or organization" },
      { k: "address", l: "Their full address in Canada", t: "ta", r: 1, full: 1 },
      { k: "phone", l: "Phone", t: "p", r: 1 },
      { k: "email", l: "Email", t: "e" },
      { k: "occupation", l: "Their occupation and employer", t: "t", if: "@status!=Company or organization" },
      { k: "household", l: "People living in their home", t: "n", if: "@status!=Company or organization" },
      { k: "letter", l: "Will they give you an invitation letter?", t: "yn", r: 1 },
      { k: "paying", l: "Are they paying for any part of your trip?", t: "yn", r: 1 },
    ]},
    { id: "education", title: "Education", fields: [
      { k: "highest", l: "Highest level of education completed", t: "s", r: 1, o: ["None", "Primary school", "Secondary (10th)", "Higher secondary (12th)", "Trade or apprenticeship", "Diploma or certificate", "Bachelor's degree", "Post-graduate diploma", "Master's degree", "PhD"] },
      { k: "post_yn", l: "Has the applicant studied after secondary school (college, university, trade school)?", t: "yn", r: 1 },
    ]},
    { id: "schools", title: "Post-secondary education", if: "education.post_yn=Yes", rep: { min: 1, max: 6, add: "Add a school" }, fields: [
      { k: "school", l: "School, college or university", t: "t", r: 1 },
      { k: "field", l: "Field of study / program", t: "t", r: 1 },
      { k: "credential", l: "Credential earned", t: "t" },
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To", t: "d", r: 1 },
      { k: "city", l: "City", t: "t", r: 1 },
      { k: "province", l: "Province or state", t: "t" },
      { k: "country", l: "Country", t: "c", r: 1 },
    ]},
    { id: "work", title: "Current activity", fields: [
      { k: "current", l: "What does the applicant do now?", t: "s", r: 1, o: ["Employed", "Self-employed or business owner", "Farmer or agriculturist", "Student", "Retired", "Homemaker", "Unemployed", "Other"] },
      { k: "current_other", l: "Describe", t: "t", r: 1, if: "work.current=Other" },
      { k: "income", l: "Monthly income (with currency)", t: "t", if: "work.current=Employed|Self-employed or business owner|Farmer or agriculturist|Retired" },
      { k: "leave", l: "Has the employer approved leave for this trip?", t: "s", r: 1, o: ["Yes", "Not yet", "Not applicable"], if: "work.current=Employed" },
      { k: "business", l: "Business name, type, registration number and years in operation", t: "ta", r: 1, if: "work.current=Self-employed or business owner", full: 1 },
      { k: "land", l: "Land owned (acres or hectares), location and crops", t: "ta", r: 1, if: "work.current=Farmer or agriculturist", full: 1 },
      { k: "who_runs", l: "Who will run the business, farm or job duties while you are away?", t: "t", if: "work.current=Self-employed or business owner|Farmer or agriculturist" },
    ]},
    { id: "jobs", title: "Employment and activity history (past 10 years)", intro: "List everything from today back 10 years, newest first, with no gaps: jobs, business, farming, studies, homemaking, unemployment or retirement.", rep: { min: 1, max: 15, add: "Add another period" }, fields: [
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To (leave blank if current)", t: "d" },
      { k: "title", l: "Occupation, job title or activity", t: "t", r: 1 },
      { k: "employer", l: "Company, employer, school or 'self'", t: "t", r: 1 },
      { k: "city", l: "City", t: "t", r: 1 },
      { k: "province", l: "Province or state", t: "t" },
      { k: "country", l: "Country", t: "c", r: 1 },
      { k: "duties", l: "Main duties", t: "ta", full: 1 },
    ]},
    { id: "ties", title: "Ties to home country", intro: "IRCC must be satisfied the applicant will leave Canada at the end of the visit. Tell us what brings you back.", fields: [
      { k: "family_back", l: "Family members who will stay in your home country while you travel", t: "ta", r: 1, full: 1 },
      { k: "property_yn", l: "Do you or your spouse own a house, land or other property?", t: "yn", r: 1 },
      { k: "property", l: "Describe the property and its approximate value", t: "ta", r: 1, if: "ties.property_yn=Yes", full: 1 },
      { k: "assets", l: "Savings, fixed deposits, investments or pension (approximate total with currency)", t: "t" },
      { k: "return_reason", l: "Why will you return home after the visit?", t: "ta", r: 1, full: 1 },
    ]},
    { id: "travel", title: "Travel history", fields: [
      { k: "canada_yn", l: "Has the applicant visited Canada before?", t: "yn", r: 1 },
      { k: "canada", l: "Dates of each visit, type of visa, and whether they left on time", t: "ta", r: 1, if: "travel.canada_yn=Yes", full: 1 },
      { k: "visas_yn", l: "Does the applicant hold, or ever hold, a visa for the US, UK, Schengen, Australia or New Zealand?", t: "yn", r: 1, full: 1 },
      { k: "visas", l: "Which visas, with issue and expiry dates", t: "ta", r: 1, if: "travel.visas_yn=Yes", full: 1 },
      { k: "abroad_yn", l: "Has the applicant travelled outside their home country in the past 10 years?", t: "yn", r: 1, full: 1 },
      { k: "bio_yn", l: "Has the applicant given biometrics (fingerprints and photo) for a Canadian application in the past 10 years?", t: "yn", r: 1, full: 1 },
      { k: "bio_date", l: "Date biometrics were given", t: "d", if: "travel.bio_yn=Yes" },
    ]},
    { id: "trips", title: "Trips outside your home country (past 10 years)", if: "travel.abroad_yn=Yes", rep: { min: 1, max: 30, add: "Add a trip" }, fields: [
      { k: "country", l: "Country visited", t: "c", r: 1 },
      { k: "city", l: "City", t: "t" },
      { k: "purpose", l: "Purpose", t: "s", r: 1, o: ["Tourism", "Family visit", "Business", "Study", "Work", "Religious", "Medical", "Transit", "Other"] },
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To", t: "d", r: 1 },
    ]},
    { id: "family", title: "Family information", intro: "For the Family Information form (IMM 5707). Add the spouse or partner, every child (including adult, adopted and step-children), both parents and every brother and sister (including half and step). Include family members who are not travelling and those who have died.", rep: { min: 2, max: 25, add: "Add a family member" }, fields: [
      { k: "relation", l: "Relationship to applicant", t: "s", r: 1, o: ["Spouse or common-law partner", "Mother", "Father", "Son", "Daughter", "Step-son", "Step-daughter", "Adopted son", "Adopted daughter", "Brother", "Sister", "Half-brother", "Half-sister", "Step-brother", "Step-sister"] },
      { k: "family_name", l: "Family name", t: "t", r: 1 },
      { k: "given_names", l: "Given names", t: "t", r: 1 },
      { k: "dob", l: "Date of birth", t: "d", r: 1 },
      { k: "birth_country", l: "Country of birth", t: "c", r: 1 },
      { k: "marital", l: "Marital status", t: "s", r: 1, o: ["Single", "Married", "Common-law", "Legally separated", "Divorced", "Widowed", "Annulled marriage"] },
      { k: "deceased", l: "Has this person died?", t: "yn", r: 1 },
      { k: "death", l: "Date and city of death", t: "t", r: 1, if: "@deceased=Yes" },
      { k: "address", l: "Present address (city and country is enough)", t: "t", r: 1, if: "@deceased=No" },
      { k: "occupation", l: "Present occupation", t: "t", r: 1, if: "@deceased=No" },
      { k: "coming", l: "Coming to Canada with the applicant?", t: "yn", r: 1, if: "@deceased=No" },
    ]},
    { id: "background", title: "Background questions", intro: "These are IRCC's own questions. Answer Yes if it applies to you in any country, even if it happened long ago or the matter was closed.", fields: [
      { k: "tb", l: "In the past two years, were you or a family member ever diagnosed with tuberculosis, or have you been in close contact with someone with tuberculosis?", t: "yn", r: 1, full: 1 },
      { k: "health_details", l: "Give details", t: "ta", r: 1, if: "background.tb=Yes", full: 1 },
      { k: "disorder", l: "Do you have any physical or mental disorder that would require social or health services, other than medication, during your stay in Canada?", t: "yn", r: 1, full: 1 },
      { k: "disorder_details", l: "Give details of the disorder", t: "ta", r: 1, if: "background.disorder=Yes", full: 1 },
      { k: "overstay", l: "Have you ever stayed beyond the time you were allowed, studied without permission, or worked without permission in Canada?", t: "yn", r: 1, full: 1 },
      { k: "overstay_details", l: "Give details", t: "ta", r: 1, if: "background.overstay=Yes", full: 1 },
      { k: "refused", l: "Have you ever been refused a visa or permit, denied entry, or ordered to leave Canada or any other country?", t: "yn", r: 1, full: 1, h: "Include refusals by the US, UK, Schengen, Australia and every other country." },
      { k: "refused_details", l: "For each refusal: country, type of visa, month and year, and the reason given", t: "ta", r: 1, if: "background.refused=Yes", full: 1 },
      { k: "applied", l: "Have you ever applied to enter or stay in Canada before (visa, permit, PR, eTA)?", t: "yn", r: 1, full: 1 },
      { k: "applied_details", l: "Type of application, year, result and application or UCI number", t: "ta", r: 1, if: "background.applied=Yes", full: 1 },
      { k: "crime", l: "Have you ever committed, been arrested for, been charged with or convicted of any criminal offence in any country?", t: "yn", r: 1, full: 1, h: "Include traffic offences like drunk driving. Answer Yes even if pardoned or discharged." },
      { k: "crime_details", l: "Give details: offence, date, country and outcome", t: "ta", r: 1, if: "background.crime=Yes", full: 1 },
      { k: "military", l: "Did you ever serve in any military, militia or civil defence unit, or in a security organization or police force (including national service, reserve or volunteer units)?", t: "yn", r: 1, full: 1 },
      { k: "orgs", l: "Are you, or have you ever been, a member of or associated with any political party, or any group that used or supported violence to reach a political or religious goal, or that was associated with criminal activity?", t: "yn", r: 1, full: 1 },
      { k: "illtreat", l: "Have you ever witnessed or taken part in the ill treatment of prisoners or civilians, looting, or the desecration of religious buildings?", t: "yn", r: 1, full: 1 },
      { k: "illtreat_details", l: "Give details", t: "ta", r: 1, if: "background.illtreat=Yes", full: 1 },
      { k: "gov", l: "Have you ever held a government position (civil servant, judge, police officer, mayor, member of a legislature, employee of a security organization, school or hospital administrator)?", t: "yn", r: 1, full: 1 },
      { k: "medical12", l: "Have you had an immigration medical exam with an IRCC panel physician in the past 12 months?", t: "yn", r: 1, full: 1 },
    ]},
    { id: "military", title: "Military, police and security service", if: "background.military=Yes", intro: "For Schedule 1. List every period of service, including compulsory national service.", rep: { min: 1, max: 8, add: "Add a period of service" }, fields: [
      { k: "country", l: "Country", t: "c", r: 1 },
      { k: "branch", l: "Branch, unit and unit number", t: "t", r: 1 },
      { k: "rank", l: "Rank(s)", t: "t", r: 1 },
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To", t: "d", r: 1 },
      { k: "duties", l: "Duties, places of service and reason for leaving", t: "ta", r: 1, full: 1 },
      { k: "combat", l: "Were you in any active combat?", t: "yn", r: 1 },
    ]},
    { id: "govpos", title: "Government positions", if: "background.gov=Yes", rep: { min: 1, max: 8, add: "Add a position" }, fields: [
      { k: "country", l: "Country and jurisdiction (national, state, city)", t: "t", r: 1 },
      { k: "dept", l: "Department or branch", t: "t", r: 1 },
      { k: "position", l: "Position or activity", t: "t", r: 1 },
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To", t: "d" },
    ]},
    { id: "memberships", title: "Political, social and other organizations", if: "background.orgs=Yes", rep: { min: 1, max: 8, add: "Add an organization" }, fields: [
      { k: "name", l: "Organization name", t: "t", r: 1 },
      { k: "type", l: "Type of organization", t: "t", r: 1 },
      { k: "role", l: "Your role or activities", t: "t", r: 1 },
      { k: "city_country", l: "City and country", t: "t", r: 1 },
      { k: "from", l: "From", t: "d", r: 1 },
      { k: "to", l: "To", t: "d" },
    ]},
    { id: "extra", title: "Anything else", fields: [
      { k: "notes", l: "Anything else the processing team should know (medical needs, special circumstances, questions for us)", t: "ta", full: 1 },
    ]},
    { id: "declare", title: "Declaration", fields: [
      { k: "true", l: "I confirm the information in this form is true, complete and correct. I understand that giving false or incomplete information to IRCC is misrepresentation.", t: "cb", r: 1, full: 1 },
      { k: "consent", l: "I agree that WorkerPool may store this information and these documents securely to prepare the application, and share them only with the person or licensed representative handling my file.", t: "cb", r: 1, full: 1 },
      { k: "name", l: "Full name of the person completing this form", t: "t", r: 1 },
      { k: "date", l: "Date", t: "d", r: 1 },
    ]},
  ],
  docs: [
    { k: "passport", l: "Passport: bio page and every page with a stamp, visa or marking", r: 1, h: "Scan in colour. A single PDF is best." },
    { k: "photo", l: "Digital photo", r: 1, h: "Recent (last 6 months), plain white or light background, face and shoulders centred, no glasses, JPG or PNG." },
    { k: "old_passports", l: "Older passports (pages with visas and stamps)", r: 1, if: "passport.old_yn=Yes" },
    { k: "national_id", l: "National identity card (front and back)", r: 1, if: "passport.nid_yn=Yes" },
    { k: "res_status", l: "Proof of legal status in the country of residence (residence card, permit or visa)", r: 1, if: "residence.status!=Citizen" },
    { k: "applying_status", l: "Proof of legal status in the country you are applying from", r: 1, if: "residence.applying_from=No" },
    { k: "bank", l: "Bank statements for the last 4 to 6 months", r: 1, h: "Show the account holder's name, the bank's details and the balance. Explain any large recent deposits in the notes." },
    { k: "itr", l: "Income tax returns (ITR) for the last 2 to 3 years", h: "Strongly recommended for employed, self-employed and business applicants." },
    { k: "assets", l: "Fixed deposits, investments, pension or other savings", if: "ties.assets" },
    { k: "property", l: "Property documents (house or land ownership papers, jamabandi/fard, valuation report)", r: 1, if: "ties.property_yn=Yes" },
    { k: "job_letter", l: "Employment letter: job title, joining date, salary and approved leave dates", r: 1, if: "work.current=Employed", h: "On company letterhead, signed, with contact details." },
    { k: "payslips", l: "Pay slips for the last 3 months", r: 1, if: "work.current=Employed" },
    { k: "business", l: "Business registration, GST/tax registration and business bank statements", r: 1, if: "work.current=Self-employed or business owner" },
    { k: "farm", l: "Land records (fard / jamabandi / 7-12 extract) and crop sale receipts", r: 1, if: "work.current=Farmer or agriculturist" },
    { k: "pension", l: "Retirement or pension proof", r: 1, if: "work.current=Retired" },
    { k: "student", l: "Enrolment letter and leave or no-objection letter from the school", r: 1, if: "work.current=Student" },
    { k: "sponsor_funds", l: "Financial documents of the person paying (bank statements, ITR, job letter) and proof of relationship", r: 1, if: "visit.payer!=Myself&visit.payer!=The person I'm visiting in Canada" },
    { k: "invitation", l: "Invitation letter from the person you will visit in Canada", r: 1, if: "visit.host_yn=Yes", h: "Their name, address, phone, status in Canada, relationship to you, purpose and dates of visit, where you will stay and who pays." },
    { k: "host_status", l: "Host's status in Canada (Canadian passport or citizenship card, PR card or COPR, or work/study permit)", r: 1, if: "visit.host_yn=Yes" },
    { k: "host_funds", l: "Host's financial documents (employment letter, recent pay stubs, latest Notice of Assessment or T4)", r: 1, if: "visit.payer=The person I'm visiting in Canada", h: "Recommended for any host, required when the host pays." },
    { k: "relation_proof", l: "Proof of relationship to the host (birth certificates, marriage certificate)", if: "visit.host_yn=Yes&visit.purpose=Family visit" },
    { k: "event", l: "Event proof (wedding card, convocation letter, event registration)", r: 1, if: "visit.purpose=Attend a wedding, convocation or other event" },
    { k: "business_invite", l: "Invitation from the Canadian company and a letter from your employer about the business trip", r: 1, if: "visit.purpose=Business" },
    { k: "medical_docs", l: "Letter from the Canadian doctor or hospital, and proof of how treatment will be paid", r: 1, if: "visit.purpose=Medical treatment" },
    { k: "study_docs", l: "Acceptance letter for the short course and proof of fees paid", r: 1, if: "visit.purpose=Short-term study (under 6 months)" },
    { k: "itinerary", l: "Travel plan: flight reservation, hotel booking or day-by-day itinerary", h: "Reservations are enough; don't buy non-refundable tickets before approval." },
    { k: "marriage", l: "Marriage certificate", r: 1, if: "marital.status=Married" },
    { k: "common_law", l: "Statutory Declaration of Common-law Union (IMM 5409) and proof of living together", r: 1, if: "marital.status=Common-law", h: "We can prepare IMM 5409 for signature if you don't have it." },
    { k: "divorce", l: "Divorce decree, separation agreement or death certificate", if: "marital.status=Divorced|Legally separated|Widowed|Annulled marriage" },
    { k: "canada_visas", l: "Previous Canadian visas, permits or eTA", r: 1, if: "travel.canada_yn=Yes" },
    { k: "other_visas", l: "US, UK, Schengen, Australia or New Zealand visas (copies)", r: 1, if: "travel.visas_yn=Yes" },
    { k: "refusals", l: "Previous refusal letters (any country)", r: 1, if: "background.refused=Yes", h: "Include the GCMS notes or reasons if you have them." },
    { k: "court", l: "Court records, police reports or certificates for any criminal matter", r: 1, if: "background.crime=Yes" },
    { k: "service", l: "Military or police service records or discharge papers", if: "background.military=Yes" },
    { k: "medical_exam", l: "Immigration medical exam receipt (IMM 1017 / eMedical), if already done", if: "background.medical12=Yes" },
    { k: "birth_cert", l: "Birth certificate naming both parents", r: 1, if: "$minor" },
    { k: "consent_letter", l: "Consent letter from both parents (or the parent not travelling), with a copy of their ID", r: 1, if: "$minor", h: "Needed when a child travels alone or with only one parent." },
    { k: "custody", l: "Custody order or death certificate of a parent, if applicable", if: "$minor" },
    { k: "other", l: "Any other supporting documents (family photos, letters, previous cover letters)" },
  ],
};

export const FORMS = { "trv-out": TRV_OUT };

/* ---------- shared logic (browser and server) ---------- */
function ageOf(dob) {
  const d = new Date(dob); if (isNaN(d)) return 99;
  const n = new Date(); let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}
export function when(cond, data, row) {
  if (!cond) return true;
  return String(cond).split("&").every((c) => {
    c = c.trim();
    if (c === "$minor") return ageOf((data.personal || {}).dob) < 18;
    const m = c.match(/^([@\w.]+?)(!=|=)(.*)$/);
    const ref = m ? m[1] : c;
    let v;
    if (ref[0] === "@") v = (row || {})[ref.slice(1)];
    else { const [s, k] = ref.split("."); v = (data[s] || {})[k]; }
    v = v == null ? "" : String(v).trim();
    if (!m) return !!v;
    const opts = m[3].split("|");
    return m[2] === "=" ? opts.includes(v) : !!v && !opts.includes(v);
  });
}
export const sectionOn = (s, data) => when(s.if, data);
export const fieldOn = (f, data, row) => f.t !== "h" && when(f.if, data, row);
const filled = (f, v) => (f.t === "cb" ? v === true || v === "Yes" : String(v ?? "").trim() !== "");

// Everything still missing, as readable strings. docKeys = set of document keys that have at least one file.
export function missing(form, data, docKeys) {
  const out = [];
  for (const s of form.sections) {
    if (!sectionOn(s, data)) continue;
    const v = data[s.id];
    if (s.rep) {
      const rows = Array.isArray(v) ? v : [];
      if (rows.length < (s.rep.min || 0)) { out.push(`${s.title}: add at least ${s.rep.min}`); continue; }
      rows.forEach((row, i) => s.fields.forEach((f) => { if (f.r && fieldOn(f, data, row) && !filled(f, row[f.k])) out.push(`${s.title} #${i + 1}: ${f.l}`); }));
    } else {
      s.fields.forEach((f) => { if (f.r && fieldOn(f, data) && !filled(f, (v || {})[f.k])) out.push(`${s.title}: ${f.l}`); });
    }
  }
  for (const d of form.docs) if (d.r && when(d.if, data) && !docKeys.has(d.k)) out.push(`Document: ${d.l}`);
  return out;
}
// 0–100: share of required answers and documents completed.
export function progress(form, data, docKeys) {
  let need = 0, have = 0;
  for (const s of form.sections) {
    if (!sectionOn(s, data)) continue;
    const v = data[s.id];
    if (s.rep) {
      const rows = Array.isArray(v) ? v : [];
      need += Math.max(0, (s.rep.min || 0) - rows.length);
      rows.forEach((row) => s.fields.forEach((f) => { if (f.r && fieldOn(f, data, row)) { need++; if (filled(f, row[f.k])) have++; } }));
    } else s.fields.forEach((f) => { if (f.r && fieldOn(f, data)) { need++; if (filled(f, (v || {})[f.k])) have++; } });
  }
  for (const d of form.docs) if (d.r && when(d.if, data)) { need++; if (docKeys.has(d.k)) have++; }
  return need ? Math.round((have / need) * 100) : 100;
}
export function applicantName(data) {
  const p = (data && data.personal) || {};
  return [p.given_names, p.family_name].filter(Boolean).join(" ");
}
