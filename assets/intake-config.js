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
      { key: "supervisa-out", name: "Parent and grandparent super visa", ready: 1 },
      { key: "eta", name: "Electronic travel authorization (eTA)", ready: 1 },
      { key: "transit-out", name: "Transit visa", ready: 1 },
      { key: "sp-out", name: "Study permit", ready: 1 },
      { key: "wp-lmia-out", name: "Work permit – LMIA-based", ready: 1 },
      { key: "wp-exempt-out", name: "Work permit – LMIA-exempt (employer-specific)", ready: 1 },
      { key: "sowp-out", name: "Spousal open work permit", ready: 1 },
      { key: "iec-out", name: "International Experience Canada (IEC)", ready: 1 },
      { key: "trp-out", name: "Temporary resident permit (TRP)", ready: 1 },
    ]},
    { key: "inside", label: "Inside Canada", forms: [
      { key: "vr-in", name: "Visitor record (extend stay as a visitor)", ready: 1 },
      { key: "trv-in", name: "Visitor visa (TRV) from inside Canada", ready: 1 },
      { key: "sp-ext", name: "Study permit extension", ready: 1 },
      { key: "wp-ext", name: "Work permit extension or new employer", ready: 1 },
      { key: "pgwp", name: "Post-graduation work permit (PGWP)", ready: 1 },
      { key: "sowp-in", name: "Spousal open work permit (inside Canada)", ready: 1 },
      { key: "bowp", name: "Bridging open work permit (BOWP)", ready: 1 },
      { key: "vowp", name: "Open work permit for vulnerable workers", ready: 1 },
      { key: "restore", name: "Restoration of status", ready: 1 },
      { key: "trp-in", name: "Temporary resident permit (inside Canada)", ready: 1 },
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


/* =====================================================================================================
   INSIDE CANADA (temporary residence). Built on IRCC's in-Canada forms: IMM 5708 (visitor record, TRP,
   restoration as a visitor), IMM 5709 (study permit), IMM 5710 (work permit), IMM 5257 (visitor visa from inside
   Canada) and IMM 5707 (family information). Shared sections are reused from the TRV form above so the same
   questions read the same way everywhere; each form adds its own sections and document list.
   ===================================================================================================== */
const ref = (id) => TRV_OUT.sections.find((s) => s.id === id);
const TAIL = ["education", "schools", "jobs", "family", "background", "military", "govpos", "memberships"].map(ref);
const END = [ref("extra"), ref("declare")];

const ABOUT_IN = (extra = []) => ({ id: "about", title: "About this application", fields: [
  { k: "for_whom", l: "Who are you filling this form for?", t: "s", r: 1, o: ["Myself", "My spouse or partner", "My child", "My parent", "Another family member", "Someone else"] },
  { k: "filler_name", l: "Your full name (the person filling this form)", t: "t", r: 1, if: "about.for_whom!=Myself" },
  { k: "filler_rel", l: "Your relationship to the applicant", t: "t", r: 1, if: "about.for_whom!=Myself" },
  ...extra,
  { k: "together", l: "Are other family members applying at the same time (spouse, children)?", t: "yn", r: 1 },
  { k: "together_names", l: "Names, relationship and what each one is applying for", t: "ta", r: 1, if: "about.together=Yes", full: 1 },
  { k: "has_uci", l: "Does the applicant have a UCI (client ID)?", t: "yn", r: 1, h: "The 8 or 10 digit number on your Canadian permit, visitor record, visa or IRCC letters." },
  { k: "uci", l: "UCI number", t: "t", r: 1, if: "about.has_uci=Yes" },
  { k: "service_lang", l: "Language for IRCC to contact the applicant", t: "s", r: 1, o: ["English", "French"] },
  { k: "source", l: "How did you hear about us?", t: "t" },
]});

const CONTACT_IN = { id: "contact", title: "Contact details", fields: [
  { k: "email", l: "Email address", t: "e", r: 1, h: "IRCC sends letters here. Use an email you check often." },
  { k: "phone", l: "Canadian phone number", t: "p", r: 1, h: "Example: +1 604 555 0123" },
  { k: "alt_phone", l: "Other phone number (home country or WhatsApp)", t: "p" },
  { k: "best_time", l: "Best time to call you", t: "t" },
  { k: "mail_h", l: "Mailing address in Canada", t: "h" },
  ...ADDRESS("mail", 1),
  { k: "same", l: "Is the home (residential) address the same as the mailing address?", t: "yn", r: 1, full: 1 },
  ...ADDRESS("res", 1).map((f) => ({ ...f, if: "contact.same=No", l: "Home: " + f.l })),
  { k: "since", l: "Living at this address since", t: "d", r: 1 },
  { k: "home_addr", l: "Address in your home country (if you still have one)", t: "ta", full: 1 },
]};

const STATUS_IN = (title = "Your status in Canada now") => ({ id: "status", title, intro: "Copy these from the permit or visitor record you hold now, and from the stamp in your passport.", fields: [
  { k: "first_entry", l: "Date you first entered Canada", t: "d", r: 1 },
  { k: "first_place", l: "Place of first entry (airport or land border)", t: "t", r: 1 },
  { k: "first_purpose", l: "Purpose of that first entry", t: "s", r: 1, o: ["Visit", "Study", "Work", "Other"] },
  { k: "last_entry", l: "Date of your most recent entry", t: "d", r: 1 },
  { k: "last_place", l: "Place of most recent entry", t: "t", r: 1 },
  { k: "current", l: "Current status in Canada", t: "s", r: 1, o: ["Visitor", "Worker", "Student", "Temporary resident permit holder", "Maintained status (waiting on an extension I applied for)", "Status has expired", "Other"] },
  { k: "current_other", l: "Describe your status", t: "t", r: 1, if: "status.current=Other" },
  { k: "doc_type", l: "Document you hold now", t: "s", r: 1, o: ["Work permit", "Study permit", "Visitor record", "Temporary resident permit", "Passport entry stamp only", "No stamp or document"] },
  { k: "doc_no", l: "Document number", t: "t", r: 1, if: "status.doc_type=Work permit|Study permit|Visitor record|Temporary resident permit", h: "Top right of the document, one letter and 9 digits, e.g. U123456789." },
  { k: "doc_issue", l: "Issue date", t: "d", r: 1, if: "status.doc_type=Work permit|Study permit|Visitor record|Temporary resident permit" },
  { k: "doc_expiry", l: "Expiry date (the date you must leave by)", t: "d", r: 1, h: "For a stamp only, this is usually 6 months after the entry date." },
  { k: "conditions", l: "Conditions printed on the document (employer, school, 'not authorized to work', etc.)", t: "ta", if: "status.doc_type=Work permit|Study permit|Visitor record|Temporary resident permit", full: 1 },
  { k: "maintained", l: "Have you already sent IRCC an application to extend or change your status that hasn't been decided yet?", t: "yn", r: 1, full: 1 },
  { k: "maint_app", l: "Type of that application, application number and date submitted", t: "t", r: 1, if: "status.maintained=Yes", full: 1 },
  { k: "visa_yn", l: "Is there a Canadian visitor visa (counterfoil sticker) in your passport?", t: "yn", r: 1 },
  { k: "visa_expiry", l: "Visitor visa expiry date", t: "d", r: 1, if: "status.visa_yn=Yes" },
  { k: "prev_yn", l: "Have you held any other Canadian permit or visitor record before the one you hold now?", t: "yn", r: 1, full: 1 },
  { k: "exits_yn", l: "Have you left Canada and come back since you first arrived?", t: "yn", r: 1, full: 1 },
]});
const PERMITS = { id: "permits", title: "Earlier Canadian permits and visitor records", if: "status.prev_yn=Yes", rep: { min: 1, max: 12, add: "Add a permit" }, fields: [
  { k: "type", l: "Type", t: "s", r: 1, o: ["Work permit", "Study permit", "Visitor record", "Temporary resident permit", "Co-op work permit", "Post-graduation work permit", "Open work permit"] },
  { k: "number", l: "Document number", t: "t" },
  { k: "from", l: "Valid from", t: "d", r: 1 },
  { k: "to", l: "Valid to", t: "d", r: 1 },
  { k: "where", l: "Employer or school named on it (if any)", t: "t" },
]};
const EXITS = { id: "exits", title: "Trips outside Canada since you first arrived", if: "status.exits_yn=Yes", rep: { min: 1, max: 30, add: "Add a trip" }, fields: [
  { k: "country", l: "Country", t: "c", r: 1 },
  { k: "from", l: "Left Canada on", t: "d", r: 1 },
  { k: "to", l: "Returned on", t: "d", r: 1 },
  { k: "purpose", l: "Purpose", t: "t" },
]};
const IN_HEAD = (extra) => [ABOUT_IN(extra), ref("personal"), STATUS_IN(), PERMITS, EXITS, ref("marital"), ref("language"), ref("passport"), CONTACT_IN];

const D_ID = [
  { k: "passport", l: "Passport: bio page and every page with a stamp, visa or marking", r: 1, h: "Scan in colour. A single PDF is best." },
  { k: "photo", l: "Digital photo", r: 1, h: "Recent (last 6 months), plain white or light background, face and shoulders centred, no glasses, JPG or PNG." },
  { k: "old_passports", l: "Older passports (pages with visas and stamps)", if: "passport.old_yn=Yes" },
  { k: "national_id", l: "National identity card (front and back)", if: "passport.nid_yn=Yes" },
];
const D_STATUS = [
  { k: "status_doc", l: "Your current permit or visitor record (both sides if it has two)", r: 1, if: "status.doc_type=Work permit|Study permit|Visitor record|Temporary resident permit" },
  { k: "entry_stamp", l: "Passport page with your most recent Canadian entry stamp", if: "status.doc_type=Passport entry stamp only|No stamp or document" },
  { k: "prev_permits", l: "Earlier Canadian permits and visitor records", r: 1, if: "status.prev_yn=Yes" },
  { k: "maint_proof", l: "Proof of the application still in process (IRCC submission confirmation or AOR)", r: 1, if: "status.maintained=Yes" },
  { k: "visa", l: "Canadian visitor visa (counterfoil page)", if: "status.visa_yn=Yes" },
];
const D_FAMILY = [
  { k: "marriage", l: "Marriage certificate", r: 1, if: "marital.status=Married" },
  { k: "common_law", l: "Statutory Declaration of Common-law Union (IMM 5409) and proof of living together", r: 1, if: "marital.status=Common-law", h: "We can prepare IMM 5409 for signature if you don't have it." },
  { k: "divorce", l: "Divorce decree, separation agreement or death certificate", if: "marital.status=Divorced|Legally separated|Widowed|Annulled marriage" },
];
const D_BACK = [
  { k: "refusals", l: "Previous refusal letters (any country)", r: 1, if: "background.refused=Yes", h: "Include the GCMS notes or reasons if you have them." },
  { k: "court", l: "Court records, police reports or certificates for any criminal matter", r: 1, if: "background.crime=Yes" },
  { k: "service", l: "Military or police service records or discharge papers", if: "background.military=Yes" },
  { k: "medical_exam", l: "Immigration medical exam receipt (IMM 1017 / eMedical), if already done", if: "background.medical12=Yes" },
  { k: "birth_cert", l: "Birth certificate naming both parents", r: 1, if: "$minor" },
  { k: "consent_letter", l: "Consent letter from both parents or legal guardians, with a copy of their ID", r: 1, if: "$minor" },
  { k: "custodian", l: "Custodianship declaration (IMM 5646), if the minor is studying in Canada without a parent", if: "$minor" },
];
const D_MONEY = [
  { k: "bank", l: "Bank statements for the last 4 months (Canadian and home-country accounts)", r: 1, h: "Show the account holder's name and the balance. Explain any large recent deposits in the notes." },
];
const D_OTHER = [{ k: "other", l: "Any other supporting documents (letters, previous cover letters, anything you think helps)" }];
const docsOf = (...lists) => lists.flat();

const HOSTS_IN = { id: "hosts", title: "People you live with or are visiting in Canada", if: "visit.host_yn=Yes", rep: { min: 1, max: 4, add: "Add another person" }, fields: [
  { k: "name", l: "Full name", t: "t", r: 1 },
  { k: "relation", l: "Relationship to you", t: "s", r: 1, o: ["Son", "Daughter", "Brother", "Sister", "Parent", "Spouse or partner", "Cousin", "Uncle or aunt", "Nephew or niece", "Other relative", "Friend", "Other"] },
  { k: "status", l: "Their status in Canada", t: "s", r: 1, o: ["Canadian citizen", "Permanent resident", "Work permit", "Study permit", "Visitor", "Don't know"] },
  { k: "address", l: "Their address in Canada", t: "ta", r: 1, full: 1 },
  { k: "phone", l: "Phone", t: "p", r: 1 },
  { k: "occupation", l: "Their occupation and employer", t: "t" },
  { k: "support", l: "Are they supporting you financially during the extension?", t: "yn", r: 1 },
]};

/* ---------- Visitor record (IMM 5708) ---------- */
const VR_IN = {
  key: "vr-in",
  name: "Visitor record – extend stay in Canada",
  intro: "This form collects everything needed to apply for a visitor record to extend your stay in Canada as a visitor (IMM 5708 and the Family Information form) and the supporting documents. Apply before your current status expires. Answer every question truthfully and completely: wrong or missing information can lead to a refusal or a finding of misrepresentation.",
  sections: [
    ...IN_HEAD(),
    { id: "visit", title: "Why you want to stay longer", fields: [
      { k: "reason", l: "Main reason for the extension", t: "s", r: 1, o: ["Visiting family or friends", "Tourism", "Waiting for a decision on another application (PR, work or study permit)", "Medical treatment or recovery", "Caring for a family member", "Attending an event (wedding, birth, convocation)", "Business", "Other"] },
      { k: "reason_other", l: "Describe the reason", t: "t", r: 1, if: "visit.reason=Other" },
      { k: "details", l: "Explain in your own words why you need more time, what you will do during it and why you will leave at the end", t: "ta", r: 1, full: 1 },
      { k: "pending_app", l: "Which application are you waiting on? Type, application number and date submitted", t: "t", r: 1, if: "visit.reason=Waiting for a decision on another application (PR, work or study permit)", full: 1 },
      { k: "until", l: "Stay requested until", t: "d", r: 1 },
      { k: "done", l: "What have you done in Canada since you arrived?", t: "ta", r: 1, full: 1 },
      { k: "worked", l: "Have you worked or studied in Canada without a permit?", t: "yn", r: 1 },
      { k: "worked_details", l: "Give details", t: "ta", r: 1, if: "visit.worked=Yes", full: 1 },
      { k: "funds", l: "Money available for the extra time (CAD)", t: "n", r: 1 },
      { k: "payer", l: "Who is paying for your stay?", t: "s", r: 1, o: ["Myself", "My spouse or partner", "My child(ren) in Canada", "Another family member or friend in Canada", "Family at home", "Other"] },
      { k: "payer_details", l: "Name and relationship of the person paying", t: "t", r: 1, if: "visit.payer!=Myself" },
      { k: "ticket", l: "Do you have a return ticket?", t: "s", r: 1, o: ["Yes, booked", "Reservation only", "Not yet"] },
      { k: "host_yn", l: "Are you living with or visiting someone in Canada?", t: "yn", r: 1 },
      { k: "ties", l: "What brings you back home (family, job, property, business)?", t: "ta", r: 1, full: 1 },
      { k: "insurance", l: "Do you have health insurance for the extra time?", t: "yn", r: 1 },
    ]},
    HOSTS_IN,
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, D_MONEY, [
    { k: "letter", l: "Your letter explaining why you need to stay longer and when you will leave", h: "We can write this from your answers if you don't have one." },
    { k: "sponsor_funds", l: "Financial documents of the person paying (bank statements, job letter, Notice of Assessment) and proof of relationship", r: 1, if: "visit.payer!=Myself" },
    { k: "host_letter", l: "Letter from the person you live with in Canada (support, address, relationship)", r: 1, if: "visit.host_yn=Yes" },
    { k: "host_status", l: "Host's status in Canada (Canadian passport or citizenship card, PR card, or permit)", r: 1, if: "visit.host_yn=Yes" },
    { k: "pending_proof", l: "Proof of the application you are waiting on (acknowledgment of receipt or submission confirmation)", r: 1, if: "visit.reason=Waiting for a decision on another application (PR, work or study permit)" },
    { k: "medical", l: "Doctor's letter about the treatment or recovery, and proof of how it is paid", r: 1, if: "visit.reason=Medical treatment or recovery" },
    { k: "care", l: "Medical letter for the family member you are caring for", r: 1, if: "visit.reason=Caring for a family member" },
    { k: "event", l: "Event proof (wedding card, due date letter, convocation letter)", r: 1, if: "visit.reason=Attending an event (wedding, birth, convocation)" },
    { k: "ticket", l: "Return ticket or reservation", if: "visit.ticket!=Not yet" },
    { k: "insurance", l: "Health insurance policy", if: "visit.insurance=Yes" },
    { k: "ties_docs", l: "Proof of ties at home (job leave letter, property papers, business documents)" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Visitor visa from inside Canada (IMM 5257) ---------- */
const TRV_IN = {
  key: "trv-in",
  name: "Visitor visa (TRV) from inside Canada",
  intro: "For workers, students and their families in Canada who need a new visitor visa to travel and come back. This form collects everything for the visitor visa application (IMM 5257 and the Family Information form) and the supporting documents. Answer every question truthfully and completely.",
  sections: [
    ...IN_HEAD([{ k: "entries", l: "Type of visa wanted", t: "s", r: 1, o: ["Multiple entry", "Single entry"] }]),
    { id: "trip", title: "Your travel plans", fields: [
      { k: "why", l: "Why do you need a new visitor visa?", t: "s", r: 1, o: ["Old visa expired, I want to travel and return", "Old visa was for one entry only", "I never had a visa (entered as a student or worker from a visa-exempt route)", "Passport renewed and visa was in the old one", "Other"] },
      { k: "why_other", l: "Explain", t: "t", r: 1, if: "trip.why=Other" },
      { k: "plan_yn", l: "Do you have a trip planned?", t: "yn", r: 1 },
      { k: "dest", l: "Where are you going and why?", t: "t", r: 1, if: "trip.plan_yn=Yes", full: 1 },
      { k: "leave", l: "Planned departure from Canada", t: "d", if: "trip.plan_yn=Yes" },
      { k: "back", l: "Planned return to Canada", t: "d", if: "trip.plan_yn=Yes" },
      { k: "doing", l: "What you are doing in Canada now (job title and employer, or program and school)", t: "t", r: 1, full: 1 },
      { k: "funds", l: "Money available (CAD)", t: "n", r: 1 },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, D_MONEY, [
    { k: "job_letter", l: "Letter from your employer confirming your job, salary and approved leave", r: 1, if: "status.current=Worker" },
    { k: "payslips", l: "Pay stubs for the last 3 months", r: 1, if: "status.current=Worker" },
    { k: "enrolment", l: "Enrolment letter from your school and latest transcript", r: 1, if: "status.current=Student" },
    { k: "itinerary", l: "Travel plan or flight reservation", if: "trip.plan_yn=Yes" },
    { k: "spouse_status", l: "Spouse or parent's permit and job or enrolment letter (if you are here as a family member)", if: "status.current=Visitor|Other" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Study permit extension (IMM 5709) ---------- */
const SP_EXT = {
  key: "sp-ext",
  name: "Study permit extension (inside Canada)",
  intro: "This form collects everything needed to extend your study permit or change your school or program from inside Canada (IMM 5709 and the Family Information form) and the supporting documents. Apply at least 30 days before your permit expires. Answer every question truthfully and completely.",
  sections: [
    ...IN_HEAD(),
    { id: "study", title: "School and program", fields: [
      { k: "change", l: "What are you applying for?", t: "s", r: 1, o: ["More time in the same program", "New program at the same school", "New school", "Moving from high school to college or university"] },
      { k: "school", l: "School name", t: "t", r: 1 },
      { k: "dli", l: "DLI number", t: "t", r: 1, h: "Starts with O, e.g. O19395677498. It's on your letter of acceptance." },
      { k: "student_id", l: "Student ID number", t: "t", r: 1 },
      { k: "campus", l: "Campus city and province", t: "t", r: 1 },
      { k: "program", l: "Program name", t: "t", r: 1 },
      { k: "level", l: "Level of study", t: "s", r: 1, o: ["Secondary (high school)", "Certificate or diploma", "Bachelor's degree", "Post-graduate certificate or diploma", "Master's degree", "PhD", "Language school", "Other"] },
      { k: "field", l: "Field of study", t: "t", r: 1 },
      { k: "start", l: "Program start date", t: "d", r: 1 },
      { k: "end", l: "Expected completion date", t: "d", r: 1 },
      { k: "tuition", l: "Tuition for the first year (CAD)", t: "n", r: 1 },
      { k: "paid", l: "Tuition already paid (CAD)", t: "n" },
      { k: "pal", l: "Do you have a provincial or territorial attestation letter (PAL/TAL) for this application?", t: "s", r: 1, o: ["Yes", "No", "Not sure"], h: "Most extension applications need one; graduate (master's and PhD) and some other students don't. We will confirm for you." },
      { k: "quebec", l: "Is the school in Quebec?", t: "yn", r: 1 },
      { k: "caq", l: "CAQ number and expiry date", t: "t", r: 1, if: "study.quebec=Yes" },
      { k: "reason", l: "Why do you need more time, or why are you changing school or program?", t: "ta", r: 1, full: 1 },
    ]},
    { id: "history", title: "Your studies in Canada so far", fields: [
      { k: "fulltime", l: "Have you studied full time in every regular term?", t: "yn", r: 1 },
      { k: "gaps", l: "Explain any term you were part time, on leave, or not enrolled, with dates", t: "ta", r: 1, if: "history.fulltime=No", full: 1 },
      { k: "standing", l: "Are you in good academic standing?", t: "s", r: 1, o: ["Yes", "On academic probation", "Not sure"] },
      { k: "failed", l: "Have you failed or repeated any course?", t: "yn", r: 1 },
      { k: "work_off", l: "Have you worked off campus?", t: "yn", r: 1 },
      { k: "work_hours", l: "Employer(s) and average weekly hours during class terms", t: "ta", r: 1, if: "history.work_off=Yes", full: 1, h: "Off-campus work during class terms is limited (24 hours a week since late 2024). Tell us honestly; we will advise you." },
      { k: "coop", l: "Does your program include a co-op or internship?", t: "yn", r: 1 },
      { k: "coop_wp", l: "Do you already have a co-op work permit?", t: "yn", r: 1, if: "history.coop=Yes" },
    ]},
    { id: "money", title: "How you will pay", fields: [
      { k: "funds", l: "Money available for tuition and living costs for the next year (CAD)", t: "n", r: 1 },
      { k: "payer", l: "Who is paying?", t: "s", r: 1, o: ["Myself (savings and part-time job)", "My parents", "My spouse", "Education loan", "Scholarship", "Other"] },
      { k: "payer_details", l: "Name and relationship of the sponsor or lender", t: "t", r: 1, if: "money.payer!=Myself (savings and part-time job)" },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, [
    { k: "loa", l: "Letter of acceptance for the new program or school", r: 1, if: "study.change!=More time in the same program" },
    { k: "pal", l: "Provincial or territorial attestation letter (PAL/TAL)", r: 1, if: "study.pal=Yes" },
    { k: "enrolment", l: "Current enrolment letter showing expected completion date", r: 1 },
    { k: "transcripts", l: "Transcripts for every term studied in Canada", r: 1 },
    { k: "tuition_receipt", l: "Tuition fee receipts", r: 1 },
    { k: "caq", l: "Quebec acceptance certificate (CAQ)", r: 1, if: "study.quebec=Yes" },
    { k: "gap_letter", l: "Letter from your school confirming any leave, part-time term or schedule change", if: "history.fulltime=No" },
    { k: "bank", l: "Bank statements for the last 4 months", r: 1 },
    { k: "sponsor", l: "Sponsor's financial documents and proof of relationship (or loan sanction letter)", r: 1, if: "money.payer!=Myself (savings and part-time job)" },
    { k: "pay_stubs", l: "Pay stubs or T4 from your off-campus job", if: "history.work_off=Yes" },
    { k: "explanation", l: "Your letter explaining the extension or the change", h: "We can write this from your answers." },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Work permit extension or new employer (IMM 5710) ---------- */
const JOB = (id, title) => ({ id, title, fields: [
  { k: "basis", l: "What is the new work permit based on?", t: "s", r: 1, o: ["LMIA", "LMIA-exempt job offer (employer portal offer number)", "Provincial nomination (employer-specific)", "Open work permit", "Not sure"] },
  { k: "same_employer", l: "Is it the same employer as your current permit?", t: "yn", r: 1 },
  { k: "lmia_no", l: "LMIA number", t: "t", r: 1, if: `${id}.basis=LMIA`, h: "The 7 to 9 digit number on the positive LMIA letter." },
  { k: "offer_no", l: "Offer of employment number", t: "t", r: 1, if: `${id}.basis=LMIA-exempt job offer (employer portal offer number)`, h: "Starts with A followed by 7 digits. The employer gets it from the IRCC Employer Portal." },
  { k: "exempt_code", l: "Exemption code, if you know it (e.g. C10, C16, A75)", t: "t", if: `${id}.basis=LMIA-exempt job offer (employer portal offer number)|Provincial nomination (employer-specific)` },
  { k: "employer", l: "Employer's legal business name", t: "t", r: 1, if: `${id}.basis!=Open work permit` },
  { k: "emp_address", l: "Employer's address", t: "ta", r: 1, if: `${id}.basis!=Open work permit`, full: 1 },
  { k: "emp_contact", l: "Contact person, phone and email at the employer", t: "t", r: 1, if: `${id}.basis!=Open work permit`, full: 1 },
  { k: "work_address", l: "Work location, if different", t: "t", if: `${id}.basis!=Open work permit` },
  { k: "job_title", l: "Job title", t: "t", r: 1, if: `${id}.basis!=Open work permit` },
  { k: "noc", l: "NOC code", t: "t", if: `${id}.basis!=Open work permit`, h: "5 digits, e.g. 62020. It's on the LMIA or offer." },
  { k: "wage", l: "Wage (per hour, or per year)", t: "t", r: 1, if: `${id}.basis!=Open work permit` },
  { k: "hours", l: "Hours per week", t: "n", r: 1, if: `${id}.basis!=Open work permit` },
  { k: "start", l: "Start date (or date the new permit should start)", t: "d", r: 1 },
  { k: "duration", l: "Length of permit requested", t: "t", r: 1, h: "For example 2 years, or until the LMIA end date." },
  { k: "duties", l: "Main duties", t: "ta", if: `${id}.basis!=Open work permit`, full: 1 },
  { k: "province", l: "Province of work", t: "s", r: 1, o: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Northwest Territories", "Nunavut", "Yukon"] },
  { k: "caq", l: "CAQ number (Quebec jobs)", t: "t", if: `${id}.province=Quebec` },
  { k: "licence", l: "Does the job need a licence or certificate (e.g. Red Seal, nursing, driving class)?", t: "yn", r: 1 },
  { k: "licence_details", l: "Licence or certificate, number and expiry", t: "t", r: 1, if: `${id}.licence=Yes` },
]});
const WP_EXT = {
  key: "wp-ext",
  name: "Work permit extension or new employer (inside Canada)",
  intro: "This form collects everything needed to extend your work permit or change employers from inside Canada (IMM 5710 and the Family Information form) and the supporting documents. Apply before your current permit expires so you keep maintained status. Answer every question truthfully and completely.",
  sections: [
    ...IN_HEAD(),
    { id: "now", title: "Your current job", fields: [
      { k: "working", l: "Are you working now?", t: "yn", r: 1 },
      { k: "employer", l: "Current employer", t: "t", r: 1, if: "now.working=Yes" },
      { k: "title", l: "Job title", t: "t", r: 1, if: "now.working=Yes" },
      { k: "since", l: "Working there since", t: "d", r: 1, if: "now.working=Yes" },
      { k: "wage", l: "Current wage", t: "t", if: "now.working=Yes" },
      { k: "matches", l: "Has your work always matched the conditions on your permit (employer, job, location)?", t: "yn", r: 1, full: 1 },
      { k: "matches_details", l: "Explain what was different", t: "ta", r: 1, if: "now.matches=No", full: 1 },
      { k: "pr_yn", l: "Have you applied for permanent residence or a provincial nomination?", t: "yn", r: 1 },
      { k: "pr_details", l: "Program, application or file number, and stage", t: "t", r: 1, if: "now.pr_yn=Yes", full: 1 },
    ]},
    JOB("job", "The new work permit"),
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, [
    { k: "lmia", l: "Positive LMIA letter and Annex A", r: 1, if: "job.basis=LMIA" },
    { k: "offer", l: "Signed job offer or employment contract", r: 1, if: "job.basis!=Open work permit" },
    { k: "offer_confirm", l: "Employer Portal offer of employment confirmation (shows the A-number and fee paid)", r: 1, if: "job.basis=LMIA-exempt job offer (employer portal offer number)" },
    { k: "nomination", l: "Provincial nomination letter and work permit support letter", r: 1, if: "job.basis=Provincial nomination (employer-specific)" },
    { k: "caq", l: "Quebec acceptance certificate (CAQ)", r: 1, if: "job.province=Quebec" },
    { k: "resume", l: "Resume (CV)", r: 1 },
    { k: "education", l: "Education certificates and transcripts", r: 1 },
    { k: "experience", l: "Experience letters for the kind of work in the new job", h: "On letterhead with job title, dates, hours, duties and salary." },
    { k: "licence", l: "Licence or certificate for the job", r: 1, if: "job.licence=Yes" },
    { k: "language", l: "English or French test results", if: "language.test_yn=Yes" },
    { k: "pay", l: "Recent pay stubs and T4s from your Canadian jobs", if: "now.working=Yes" },
    { k: "pr_proof", l: "PR or nomination acknowledgment letter", if: "now.pr_yn=Yes" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Post-graduation work permit (IMM 5710) ---------- */
const PGWP = {
  key: "pgwp",
  name: "Post-graduation work permit (PGWP)",
  intro: "This form collects everything needed to apply for a post-graduation work permit (IMM 5710 and the Family Information form) and the supporting documents. Apply within 180 days of the date your school confirmed you completed your program. Answer every question truthfully and completely.",
  sections: [
    ...IN_HEAD(),
    { id: "program", title: "The program you completed", fields: [
      { k: "school", l: "School name", t: "t", r: 1 },
      { k: "dli", l: "DLI number", t: "t", r: 1 },
      { k: "campus", l: "Campus city and province", t: "t", r: 1 },
      { k: "program", l: "Program name", t: "t", r: 1 },
      { k: "credential", l: "Credential earned", t: "s", r: 1, o: ["Certificate", "Diploma", "Advanced diploma", "Post-graduate certificate or diploma", "Bachelor's degree", "Master's degree", "PhD", "Other"] },
      { k: "cip", l: "CIP code of the program, if you know it", t: "t", h: "Some college programs must be in an eligible field of study. Your school can give you the CIP code." },
      { k: "start", l: "Program start date", t: "d", r: 1 },
      { k: "end", l: "Date you finished classes", t: "d", r: 1 },
      { k: "length", l: "Program length (months)", t: "n", r: 1 },
      { k: "completion", l: "Date of the completion letter or final transcript (whichever came first)", t: "d", r: 1, h: "The 180-day deadline starts on this date." },
      { k: "fulltime", l: "Did you study full time in every regular term?", t: "yn", r: 1 },
      { k: "gaps", l: "Explain any part-time term, leave or break, with dates", t: "ta", r: 1, if: "program.fulltime=No", full: 1 },
      { k: "online", l: "Did you study any part of the program online from outside Canada?", t: "yn", r: 1 },
      { k: "online_details", l: "Which terms and dates", t: "t", r: 1, if: "program.online=Yes" },
      { k: "other_programs", l: "Did you complete any other program in Canada before this one?", t: "yn", r: 1 },
      { k: "other_details", l: "School, program, dates and credential", t: "ta", r: 1, if: "program.other_programs=Yes", full: 1 },
      { k: "sp_valid", l: "Was your study permit valid on the day you will apply (or are you on maintained status)?", t: "s", r: 1, o: ["Yes, valid", "Maintained status", "No, it expired"], full: 1 },
      { k: "pgwp_before", l: "Have you ever had a post-graduation work permit before?", t: "yn", r: 1, h: "A PGWP is given only once." },
      { k: "lang_test", l: "Have you taken an English or French test for this application?", t: "s", r: 1, o: ["Yes", "Booked", "No"], h: "IRCC requires a language test for most PGWP applications made since November 2024 (CLB 7 for degree programs, CLB 5 for college programs)." },
      { k: "lang_result", l: "Test, date and scores (listening, reading, writing, speaking)", t: "t", r: 1, if: "program.lang_test=Yes", full: 1 },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, [
    { k: "completion", l: "Official completion letter from the school", r: 1 },
    { k: "transcript", l: "Final official transcript", r: 1 },
    { k: "lang_test", l: "English or French test result (IELTS, CELPIP, PTE Core, TEF, TCF)", r: 1, if: "program.lang_test=Yes" },
    { k: "online_letter", l: "School letter showing terms studied online", if: "program.online=Yes" },
    { k: "gap_letter", l: "School letter about any leave or part-time term", if: "program.fulltime=No" },
    { k: "other_programs", l: "Completion letters and transcripts for earlier programs in Canada", if: "program.other_programs=Yes" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Spousal open work permit inside Canada (IMM 5710) ---------- */
const SOWP_IN = {
  key: "sowp-in",
  name: "Spousal open work permit (inside Canada)",
  intro: "For the spouse or common-law partner of a worker or student in Canada. This form collects everything needed for the open work permit application (IMM 5710 and the Family Information form) and the supporting documents. Eligibility depends on your partner's job or program, so answer the partner questions carefully.",
  sections: [
    ...IN_HEAD(),
    { id: "partner", title: "Your spouse or partner in Canada", fields: [
      { k: "family_name", l: "Partner's family name", t: "t", r: 1 },
      { k: "given_names", l: "Partner's given names", t: "t", r: 1 },
      { k: "dob", l: "Partner's date of birth", t: "d", r: 1 },
      { k: "uci", l: "Partner's UCI number", t: "t" },
      { k: "status", l: "Partner's status in Canada", t: "s", r: 1, o: ["Worker", "Student", "Permanent residence applicant with a work permit", "Other"] },
      { k: "permit_no", l: "Partner's permit number", t: "t", r: 1 },
      { k: "permit_expiry", l: "Partner's permit expiry date", t: "d", r: 1 },
      { k: "employer", l: "Partner's employer", t: "t", r: 1, if: "partner.status=Worker|Permanent residence applicant with a work permit" },
      { k: "job_title", l: "Partner's job title", t: "t", r: 1, if: "partner.status=Worker|Permanent residence applicant with a work permit" },
      { k: "noc", l: "Partner's NOC code and TEER", t: "t", r: 1, if: "partner.status=Worker|Permanent residence applicant with a work permit", h: "Since January 2025 the partner's job must usually be TEER 0 or 1, or in a listed TEER 2 or 3 occupation." },
      { k: "wp_type", l: "Partner's work permit type", t: "s", r: 1, if: "partner.status=Worker|Permanent residence applicant with a work permit", o: ["LMIA-based", "LMIA-exempt employer-specific", "Open work permit (PGWP, BOWP, etc.)", "Not sure"] },
      { k: "school", l: "Partner's school and program", t: "t", r: 1, if: "partner.status=Student", full: 1 },
      { k: "level", l: "Partner's level of study", t: "s", r: 1, if: "partner.status=Student", o: ["Master's (16 months or longer)", "Master's (under 16 months)", "PhD", "Professional degree (medicine, law, dentistry, nursing, pharmacy, engineering, education, etc.)", "College or bachelor's", "Other"] },
      { k: "prog_end", l: "Partner's program end date", t: "d", r: 1, if: "partner.status=Student" },
      { k: "pr_app", l: "Partner's PR or nomination program and file number", t: "t", r: 1, if: "partner.status=Permanent residence applicant with a work permit" },
      { k: "in_canada", l: "Is your partner living in Canada now?", t: "yn", r: 1 },
    ]},
    { id: "relation", title: "Your relationship", fields: [
      { k: "met", l: "When and where did you first meet?", t: "t", r: 1, full: 1 },
      { k: "together_since", l: "Living together since", t: "d", r: 1 },
      { k: "same_address", l: "Do you live at the same address in Canada?", t: "yn", r: 1 },
      { k: "why_apart", l: "Explain why you live apart", t: "ta", r: 1, if: "relation.same_address=No", full: 1 },
      { k: "children", l: "Do you have children together?", t: "yn", r: 1 },
      { k: "kids_apply", l: "Are any children applying for a study or visitor permit with this application?", t: "yn", r: 1, if: "relation.children=Yes" },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, [
    { k: "marriage_proof", l: "Marriage certificate, or IMM 5409 with proof of 12 months living together", r: 1 },
    { k: "partner_passport", l: "Partner's passport bio page", r: 1 },
    { k: "partner_permit", l: "Partner's work or study permit", r: 1 },
    { k: "partner_job", l: "Partner's employment letter (job title, NOC, wage, start date) and 3 recent pay stubs", r: 1, if: "partner.status=Worker|Permanent residence applicant with a work permit" },
    { k: "partner_lmia", l: "Partner's LMIA or offer of employment confirmation", if: "partner.status=Worker|Permanent residence applicant with a work permit" },
    { k: "partner_school", l: "Partner's enrolment letter and transcript", r: 1, if: "partner.status=Student" },
    { k: "partner_pr", l: "Partner's PR or nomination acknowledgment letter", r: 1, if: "partner.status=Permanent residence applicant with a work permit" },
    { k: "together_proof", l: "Proof you live together (lease, joint bills or bank account, ID with the same address)", r: 1 },
    { k: "photos", l: "Photos of you together (wedding and everyday life)" },
  ], D_FAMILY.filter((d) => d.k === "divorce"), D_BACK, D_OTHER),
};

/* ---------- Bridging open work permit (IMM 5710) ---------- */
const BOWP = {
  key: "bowp",
  name: "Bridging open work permit (BOWP)",
  intro: "For workers in Canada who have applied for permanent residence and whose work permit is about to expire. This form collects everything for the bridging open work permit application (IMM 5710) and the supporting documents. Apply before your current work permit expires.",
  sections: [
    ...IN_HEAD(),
    { id: "pr", title: "Your permanent residence application", fields: [
      { k: "program", l: "PR program", t: "s", r: 1, o: ["Express Entry – Canadian Experience Class", "Express Entry – Federal Skilled Worker", "Express Entry – Federal Skilled Trades", "Provincial Nominee Program (PNP)", "Agri-Food Pilot", "Home care worker pathway", "Quebec skilled worker", "Other"] },
      { k: "program_other", l: "Describe", t: "t", r: 1, if: "pr.program=Other" },
      { k: "app_no", l: "PR application number", t: "t", r: 1 },
      { k: "submitted", l: "Date the PR application was submitted", t: "d", r: 1 },
      { k: "aor", l: "Date of the acknowledgment of receipt (AOR) letter", t: "d", r: 1, h: "For Express Entry and PNP, the PR application must have passed the completeness check." },
      { k: "province", l: "Province that nominated you", t: "t", r: 1, if: "pr.program=Provincial Nominee Program (PNP)" },
      { k: "nom_date", l: "Nomination date and certificate number", t: "t", r: 1, if: "pr.program=Provincial Nominee Program (PNP)" },
      { k: "nom_employer", l: "Is the nomination tied to an employer?", t: "yn", r: 1, if: "pr.program=Provincial Nominee Program (PNP)" },
      { k: "employer", l: "Current employer and job title", t: "t", r: 1, full: 1 },
      { k: "living_prov", l: "Province you live and work in", t: "t", r: 1 },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, [
    { k: "aor", l: "PR acknowledgment of receipt (AOR) letter", r: 1 },
    { k: "pr_confirm", l: "PR application submission confirmation", r: 1 },
    { k: "nomination", l: "Provincial nomination certificate", r: 1, if: "pr.program=Provincial Nominee Program (PNP)" },
    { k: "nom_employer", l: "Employment letter from the nominating employer", r: 1, if: "pr.nom_employer=Yes" },
    { k: "csq", l: "Quebec selection certificate (CSQ)", r: 1, if: "pr.program=Quebec skilled worker" },
    { k: "pay", l: "Recent pay stubs", r: 1 },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Open work permit for vulnerable workers (IMM 5710) ----------
   Questions are kept factual and optional where they can be; the client can explain in their own words. */
const VOWP = {
  key: "vowp",
  name: "Open work permit for vulnerable workers",
  intro: "For workers on an employer-specific work permit who are experiencing abuse, or are at risk of abuse, in their job. This form is private: only the person handling your file sees it. Share what you are comfortable sharing; we will help you with the rest. If you are in danger right now, call 911.",
  sections: [
    ...IN_HEAD(),
    { id: "safety", title: "Staying safe while we contact you", fields: [
      { k: "safe_phone", l: "Is it safe for us to call you at the number you gave?", t: "yn", r: 1 },
      { k: "safe_contact", l: "Safest way and time to reach you", t: "t", r: 1, full: 1 },
      { k: "safe_email", l: "Is the email address you gave private (your employer can't see it)?", t: "yn", r: 1 },
      { k: "housing", l: "Do you live in housing provided by the employer?", t: "yn", r: 1 },
    ]},
    { id: "job", title: "The employer named on your permit", fields: [
      { k: "employer", l: "Employer name", t: "t", r: 1 },
      { k: "address", l: "Work address", t: "ta", r: 1, full: 1 },
      { k: "title", l: "Your job title", t: "t", r: 1 },
      { k: "start", l: "Date you started", t: "d", r: 1 },
      { k: "still", l: "Are you still working there?", t: "yn", r: 1 },
      { k: "left", l: "Date you stopped working there", t: "d", r: 1, if: "job.still=No" },
    ]},
    { id: "situation", title: "What is happening", intro: "Tick what applies. You don't need proof to apply, but anything you have helps.", fields: [
      { k: "physical", l: "Physical abuse or threats of harm", t: "yn", r: 1 },
      { k: "sexual", l: "Sexual abuse or harassment", t: "yn", r: 1 },
      { k: "psych", l: "Psychological abuse (threats, intimidation, control, threats about your status)", t: "yn", r: 1, full: 1 },
      { k: "financial", l: "Financial abuse (unpaid wages, illegal fees or deductions, taking your money)", t: "yn", r: 1, full: 1 },
      { k: "reprisal", l: "Punishment for complaining about your job", t: "yn", r: 1 },
      { k: "documents", l: "Has the employer kept your passport or other documents?", t: "yn", r: 1 },
      { k: "story", l: "In your own words, what has happened and when", t: "ta", r: 1, full: 1 },
      { k: "reported", l: "Have you reported this to anyone (police, employment standards, a support organization, a doctor)?", t: "yn", r: 1, full: 1 },
      { k: "reported_details", l: "Who, and when", t: "ta", r: 1, if: "situation.reported=Yes", full: 1 },
      { k: "family_owp", l: "Are family members in Canada with you who also need a permit?", t: "yn", r: 1 },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, [
    { k: "statement", l: "Your written statement (optional; we can prepare it from your answers)" },
    { k: "evidence", l: "Anything that supports what happened: messages, photos, pay records, bank deposits, medical notes", h: "Optional. Share only what is safe to upload." },
    { k: "support_letter", l: "Letter from a support organization, social worker, doctor or counsellor", if: "situation.reported=Yes" },
    { k: "reports", l: "Police report or employment standards complaint", if: "situation.reported=Yes" },
    { k: "pay", l: "Pay stubs, contract or job offer from the employer" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Restoration of status (IMM 5708 / 5709 / 5710) ---------- */
const RESTORE = {
  key: "restore",
  name: "Restoration of status",
  intro: "If your visitor, student or worker status expired in the last 90 days, you may be able to apply to restore it. This form collects everything needed for the restoration application and the supporting documents. Do not work or study while your status is expired. Answer every question truthfully and completely.",
  sections: [
    ...IN_HEAD(),
    { id: "lost", title: "How your status expired", fields: [
      { k: "had", l: "Status you had", t: "s", r: 1, o: ["Visitor", "Student", "Worker"] },
      { k: "expired_on", l: "Date your status expired (or the date of a refusal letter)", t: "d", r: 1, h: "Restoration must be applied for within 90 days of this date." },
      { k: "why", l: "Why did it expire?", t: "s", r: 1, o: ["Extension application was refused", "I didn't apply in time", "Application was returned as incomplete", "Other"] },
      { k: "refusal_date", l: "Date of the refusal or return letter", t: "d", r: 1, if: "lost.why=Extension application was refused|Application was returned as incomplete" },
      { k: "explain", l: "Explain what happened in your own words", t: "ta", r: 1, full: 1 },
      { k: "since", l: "Have you worked or studied since your status expired?", t: "yn", r: 1 },
      { k: "since_details", l: "Give details (where and dates)", t: "ta", r: 1, if: "lost.since=Yes", full: 1 },
      { k: "kept", l: "Before it expired, did you follow every condition on your permit (employer, school, no work)?", t: "yn", r: 1, full: 1 },
      { k: "kept_details", l: "Explain", t: "ta", r: 1, if: "lost.kept=No", full: 1 },
    ]},
    { id: "restore_to", title: "What you want to restore to", fields: [
      { k: "to", l: "Restore status as a", t: "s", r: 1, o: ["Visitor", "Student", "Worker"] },
      { k: "reason", l: "Why do you need to stay, and until when?", t: "ta", r: 1, full: 1 },
      { k: "until", l: "Stay requested until", t: "d", r: 1 },
      { k: "school", l: "School, DLI number and program", t: "t", r: 1, if: "restore_to.to=Student", full: 1 },
      { k: "prog_dates", l: "Program start and end dates", t: "t", r: 1, if: "restore_to.to=Student" },
      { k: "pal", l: "Do you have a PAL/TAL?", t: "s", r: 1, if: "restore_to.to=Student", o: ["Yes", "No", "Not sure"] },
      { k: "wp_basis", l: "Work permit based on", t: "s", r: 1, if: "restore_to.to=Worker", o: ["LMIA", "LMIA-exempt job offer", "Open work permit (spousal, PGWP, BOWP)", "Not sure"] },
      { k: "employer", l: "Employer, job title and LMIA or offer number", t: "t", r: 1, if: "restore_to.to=Worker&restore_to.wp_basis!=Open work permit (spousal, PGWP, BOWP)", full: 1 },
      { k: "funds", l: "Money available (CAD)", t: "n", r: 1 },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, D_MONEY, [
    { k: "refusal", l: "Refusal or return letter", r: 1, if: "lost.why=Extension application was refused|Application was returned as incomplete" },
    { k: "expired_doc", l: "The permit or visitor record that expired", r: 1 },
    { k: "explanation", l: "Your letter explaining why the status expired and why it should be restored", h: "We can write this from your answers." },
    { k: "loa", l: "Letter of acceptance or enrolment letter", r: 1, if: "restore_to.to=Student" },
    { k: "pal", l: "Provincial or territorial attestation letter (PAL/TAL)", r: 1, if: "restore_to.pal=Yes" },
    { k: "transcripts", l: "Transcripts and tuition receipts", if: "restore_to.to=Student" },
    { k: "lmia", l: "LMIA, offer of employment confirmation or job offer", r: 1, if: "restore_to.to=Worker&restore_to.wp_basis!=Open work permit (spousal, PGWP, BOWP)" },
    { k: "owp_basis", l: "Documents for the open work permit (spouse's permit and job letter, completion letter, or PR AOR)", r: 1, if: "restore_to.wp_basis=Open work permit (spousal, PGWP, BOWP)" },
    { k: "host", l: "Letter and status proof of the person you live with in Canada", if: "restore_to.to=Visitor" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Temporary resident permit inside Canada (IMM 5708) ---------- */
const TRP_IN = {
  key: "trp-in",
  name: "Temporary resident permit (inside Canada)",
  intro: "A temporary resident permit (TRP) lets a person who is inadmissible, or who can no longer restore their status, stay in Canada when there is a strong reason. This form collects everything needed to prepare the request and the supporting documents. Answer every question truthfully and completely.",
  sections: [
    ...IN_HEAD(),
    { id: "inadm", title: "Why you need a TRP", fields: [
      { k: "ground", l: "Main reason you can't stay or extend the usual way", t: "s", r: 1, o: ["Criminal record (including impaired driving)", "Medical reasons", "Out of status more than 90 days (can't restore)", "Misrepresentation finding", "Previous removal or deportation", "Other"] },
      { k: "ground_other", l: "Describe", t: "t", r: 1, if: "inadm.ground=Other" },
      { k: "details", l: "Full details: what happened, when and where", t: "ta", r: 1, full: 1 },
      { k: "offence_date", l: "Date of the offence or conviction", t: "d", r: 1, if: "inadm.ground=Criminal record (including impaired driving)" },
      { k: "sentence_done", l: "Date you finished the whole sentence (including probation and fines)", t: "d", if: "inadm.ground=Criminal record (including impaired driving)" },
      { k: "rehab", l: "Have you applied for criminal rehabilitation?", t: "yn", if: "inadm.ground=Criminal record (including impaired driving)" },
      { k: "out_since", l: "Date your status ended", t: "d", r: 1, if: "inadm.ground=Out of status more than 90 days (can't restore)" },
      { k: "reasons", l: "Why should you be allowed to stay? (family, work, medical care, events, how long)", t: "ta", r: 1, full: 1 },
      { k: "until", l: "Stay requested until", t: "d", r: 1 },
      { k: "prev_trp", l: "Have you had a TRP before?", t: "yn", r: 1 },
      { k: "prev_trp_details", l: "Dates and permit numbers", t: "t", r: 1, if: "inadm.prev_trp=Yes" },
      { k: "pr_app", l: "Is there a PR, H&C or other application in process for you?", t: "yn", r: 1 },
      { k: "pr_app_details", l: "Type, file number and stage", t: "t", r: 1, if: "inadm.pr_app=Yes" },
      { k: "funds", l: "Money available (CAD)", t: "n", r: 1 },
    ]},
    ...TAIL, ...END,
  ],
  docs: docsOf(D_ID, D_STATUS, D_MONEY, [
    { k: "explanation", l: "Your letter explaining your situation and why you need to stay", h: "We can write this from your answers." },
    { k: "court_docs", l: "Court records, sentence and proof every part of the sentence was completed", r: 1, if: "inadm.ground=Criminal record (including impaired driving)" },
    { k: "police_certs", l: "Police certificates from every country you lived in for 6 months or more since age 18", if: "inadm.ground=Criminal record (including impaired driving)" },
    { k: "medical", l: "Medical reports and treatment plan", r: 1, if: "inadm.ground=Medical reasons" },
    { k: "ircc_letters", l: "IRCC or CBSA letters (refusals, removal orders, misrepresentation findings)", if: "inadm.ground!=Medical reasons" },
    { k: "support", l: "Support letters (family, employer, community), with the writer's status in Canada" },
    { k: "family_proof", l: "Proof of family in Canada (birth or marriage certificates, their status)" },
    { k: "work_proof", l: "Job offer or employment proof, if you are asking to work" },
    { k: "pr_proof", l: "Proof of the PR, H&C or other application in process", r: 1, if: "inadm.pr_app=Yes" },
  ], D_FAMILY, D_BACK, D_OTHER),
};

/* =====================================================================================================
   OUTSIDE CANADA (temporary residence). Built on IRCC's overseas forms: IMM 5257 (visitor, super visa, transit, TRP),
   IMM 1294 (study permit), IMM 1295 (work permit), the eTA online form, IEC profile questions and IMM 5707 (family
   information). Shared sections are reused from the TRV form; each form adds its own questions and documents.
   ===================================================================================================== */
const tdoc = (...keys) => keys.map((k) => TRV_OUT.docs.find((d) => d.k === k));
const ABOUT_OUT = (extra = []) => {
  const a = ABOUT_IN(extra);
  return { ...a, fields: a.fields.map((f) => f.k === "has_uci" ? { ...f, l: "Does the applicant have a UCI (client ID) from an earlier Canadian application?", h: "An 8 or 10 digit number on earlier Canadian visas, permits, refusal letters or IRCC letters." } : f) };
};
const OUT_HEAD = (extra) => [ABOUT_OUT(extra), ref("personal"), ref("residence"), ref("prev_res"), ref("marital"), ref("language"), ref("passport"), ref("contact")];
const OUT_TAIL = ["education", "schools", "jobs", "travel", "trips", "family", "background", "military", "govpos", "memberships"].map(ref);
const D_OUT = [...D_ID, ...tdoc("res_status", "applying_status")];
const D_TRAVEL = tdoc("canada_visas", "other_visas");
const D_WORK = tdoc("itr", "job_letter", "payslips", "business", "farm", "pension", "student");
const D_POLICE = { k: "police", l: "Police certificates from every country you lived in for 6 months or more since age 18", h: "Upload any you already have. We will tell you which ones IRCC needs." };
const PROVINCES = ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Northwest Territories", "Nunavut", "Yukon"];

/* ---------- Parent and grandparent super visa (IMM 5257) ---------- */
const SUPERVISA_OUT = {
  key: "supervisa-out",
  name: "Parent and grandparent super visa",
  intro: "For parents and grandparents of Canadian citizens and permanent residents. The super visa allows stays of up to 5 years at a time. This form collects everything needed for the application (IMM 5257, Schedule 1 and the Family Information form) and the supporting documents, including your child's or grandchild's documents. Answer every question truthfully and completely.",
  sections: [
    ...OUT_HEAD(),
    { id: "visit", title: "Details of the visit", fields: [
      { k: "arrive", l: "Planned arrival date", t: "d", r: 1 },
      { k: "length", l: "How long do you plan to stay?", t: "t", r: 1 },
      { k: "details", l: "Why are you visiting and what will you do in Canada?", t: "ta", r: 1, full: 1 },
      { k: "spouse_too", l: "Is your spouse or partner applying for a super visa too?", t: "yn", r: 1 },
      { k: "insurance", l: "Have you bought Canadian medical insurance for the super visa?", t: "s", r: 1, o: ["Yes, bought", "Quote only", "Not yet"], h: "Required: at least $100,000 coverage for at least 1 year from the date of entry, from a Canadian company or an approved foreign insurer. Paid in full or in instalments with a deposit." },
      { k: "insurer", l: "Insurance company, policy number and coverage", t: "t", if: "visit.insurance=Yes, bought", full: 1 },
      { k: "ime", l: "Have you done the immigration medical exam?", t: "s", r: 1, o: ["Yes", "Booked", "Not yet"], h: "A medical exam with an IRCC panel physician is required for the super visa." },
    ]},
    { id: "host", title: "Your child or grandchild in Canada", intro: "The person inviting you must be your child or grandchild, a Canadian citizen or permanent resident, and meet the minimum income for their family size.", fields: [
      { k: "family_name", l: "Their family name", t: "t", r: 1 },
      { k: "given_names", l: "Their given names", t: "t", r: 1 },
      { k: "relation", l: "Relationship to you", t: "s", r: 1, o: ["Son", "Daughter", "Grandson", "Granddaughter"] },
      { k: "dob", l: "Their date of birth", t: "d", r: 1 },
      { k: "status", l: "Their status", t: "s", r: 1, o: ["Canadian citizen", "Permanent resident", "Registered Indian"] },
      { k: "address", l: "Their full address in Canada", t: "ta", r: 1, full: 1 },
      { k: "phone", l: "Phone", t: "p", r: 1 },
      { k: "email", l: "Email", t: "e", r: 1 },
      { k: "occupation", l: "Their job title and employer", t: "t", r: 1 },
      { k: "income", l: "Their total income on the latest Notice of Assessment (CAD)", t: "n", r: 1 },
      { k: "spouse_income", l: "Their spouse's income, if combining (CAD)", t: "n" },
      { k: "household", l: "Number of people in their household, including you and your spouse if coming", t: "n", r: 1 },
      { k: "cosigner", l: "Is their spouse or partner co-signing the letter of support?", t: "yn", r: 1 },
    ]},
    ref("work"), ref("ties"),
    ...OUT_TAIL, ...END,
  ],
  docs: docsOf(D_OUT, [
    { k: "invitation", l: "Signed letter of invitation from your child or grandchild, promising financial support for your whole stay", r: 1, h: "We can draft it. It lists everyone in their household." },
    { k: "host_status", l: "Their proof of status (Canadian passport, citizenship certificate or PR card)", r: 1 },
    { k: "host_noa", l: "Their latest Notice of Assessment (and T4 or T1) from CRA", r: 1 },
    { k: "host_job", l: "Their employment letter and recent pay stubs", r: 1 },
    { k: "cosigner_docs", l: "Co-signing spouse's status proof, Notice of Assessment and marriage certificate", r: 1, if: "host.cosigner=Yes" },
    { k: "relation_proof", l: "Proof you are their parent or grandparent (their birth certificate naming you; for grandchildren, the parent's too)", r: 1 },
    { k: "insurance", l: "Medical insurance policy and proof of payment", r: 1, if: "visit.insurance=Yes, bought" },
    { k: "ime", l: "Medical exam confirmation (IMM 1017 or eMedical information sheet)", r: 1, if: "visit.ime=Yes" },
    { k: "bank", l: "Your bank statements for the last 4 to 6 months", r: 1 },
    { k: "property", l: "Property documents", r: 1, if: "ties.property_yn=Yes" },
  ], D_WORK, D_TRAVEL, D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Electronic travel authorization (eTA) ---------- */
const ETA = {
  key: "eta",
  name: "Electronic travel authorization (eTA)",
  intro: "For citizens of visa-exempt countries (and some visa-required travellers who held a Canadian visa in the last 10 years or have a valid US visa) flying to or through Canada. This short form collects everything the online eTA application asks. Answer every question truthfully.",
  sections: [
    ABOUT_OUT(),
    ref("personal"),
    { id: "residence", title: "Where you live", fields: [
      { k: "country", l: "Current country of residence", t: "c", r: 1 },
      { k: "status", l: "Status in that country", t: "s", r: 1, o: ["Citizen", "Permanent resident", "Worker", "Student", "Visitor", "Other"] },
    ]},
    { id: "marital", title: "Marital status", fields: [
      { k: "status", l: "Current marital status", t: "s", r: 1, o: ["Single", "Married", "Common-law", "Legally separated", "Divorced", "Widowed", "Annulled marriage"] },
    ]},
    ref("passport"),
    { id: "eta", title: "Job and trip", fields: [
      { k: "occupation", l: "Occupation", t: "t", r: 1 },
      { k: "job_title", l: "Job title", t: "t" },
      { k: "employer", l: "Employer or school", t: "t" },
      { k: "job_city", l: "City and country of the job", t: "t" },
      { k: "since", l: "Working or studying there since", t: "d" },
      { k: "purpose", l: "Purpose of the trip", t: "s", r: 1, o: ["Tourism", "Visiting family or friends", "Business", "Transit", "Study (under 6 months)", "Work (with a work permit)", "Other"] },
      { k: "travel_known", l: "Do you know when you will travel?", t: "yn", r: 1 },
      { k: "travel_date", l: "Travel date and time (and time zone)", t: "t", r: 1, if: "eta.travel_known=Yes" },
      { k: "visa_10y", l: "Have you held a Canadian visitor visa in the past 10 years?", t: "yn", r: 1, h: "Only matters for passports from some visa-required countries." },
      { k: "us_visa", l: "Do you hold a valid US non-immigrant visa?", t: "yn", r: 1 },
      { k: "us_visa_no", l: "US visa number and expiry date", t: "t", r: 1, if: "eta.us_visa=Yes" },
    ]},
    { id: "background", title: "Background questions", fields: [
      { k: "refused", l: "Have you ever been refused a visa or permit, denied entry, or ordered to leave Canada or any other country?", t: "yn", r: 1, full: 1 },
      { k: "refused_details", l: "Country, year and reason for each", t: "ta", r: 1, if: "background.refused=Yes", full: 1 },
      { k: "crime", l: "Have you ever committed, been arrested for, been charged with or convicted of any criminal offence in any country?", t: "yn", r: 1, full: 1, h: "Include drunk or impaired driving." },
      { k: "crime_details", l: "Offence, date, country and outcome", t: "ta", r: 1, if: "background.crime=Yes", full: 1 },
      { k: "tb", l: "In the past two years, were you diagnosed with tuberculosis or in close contact with someone who had it?", t: "yn", r: 1, full: 1 },
      { k: "condition", l: "Do you have any of these: untreated syphilis, untreated drug or alcohol addiction, or an untreated mental health condition with psychosis?", t: "yn", r: 1, full: 1 },
      { k: "details", l: "Anything else you want to explain", t: "ta", full: 1 },
    ]},
    ref("contact"),
    ...END,
  ],
  docs: [
    { k: "passport", l: "Passport bio page", r: 1, h: "The eTA is linked to this passport. Travel with the same one." },
    { k: "uspr", l: "US green card (front and back)", r: 1, if: "passport.uspr_yn=Yes" },
    { k: "us_visa", l: "US visa page", if: "eta.us_visa=Yes" },
    { k: "refusals", l: "Refusal letters", if: "background.refused=Yes" },
    { k: "court", l: "Court records for any criminal matter", r: 1, if: "background.crime=Yes" },
    ...D_OTHER,
  ],
};

/* ---------- Transit visa (IMM 5257) ---------- */
const TRANSIT_OUT = {
  key: "transit-out",
  name: "Transit visa",
  intro: "For travellers from visa-required countries who will change flights in Canada for 48 hours or less on the way to another country. This form collects everything needed for the transit visa application (IMM 5257 and the Family Information form) and the supporting documents.",
  sections: [
    ...OUT_HEAD(),
    { id: "transit", title: "Your journey", fields: [
      { k: "final", l: "Final destination country", t: "c", r: 1 },
      { k: "purpose", l: "Purpose of the trip to that country", t: "t", r: 1 },
      { k: "dest_visa", l: "Do you have a visa or permit for the destination country (if needed)?", t: "s", r: 1, o: ["Yes", "Not needed", "Applied, waiting"] },
      { k: "airport", l: "Canadian airport(s) you will pass through", t: "t", r: 1 },
      { k: "arrive", l: "Arrival in Canada (date and time)", t: "t", r: 1 },
      { k: "depart", l: "Departure from Canada (date and time)", t: "t", r: 1, h: "Must be within 48 hours of arrival." },
      { k: "airline", l: "Airline and flight numbers", t: "t", r: 1 },
      { k: "leave_airport", l: "Will you need to leave the airport (change airports, overnight hotel)?", t: "yn", r: 1 },
      { k: "funds", l: "Money available for the trip (CAD)", t: "n", r: 1 },
    ]},
    ref("work"),
    ...["jobs", "travel", "trips", "family", "background", "military", "govpos", "memberships"].map(ref), ...END,
  ],
  docs: docsOf(D_OUT, [
    { k: "itinerary", l: "Flight itinerary or e-ticket for the whole journey", r: 1 },
    { k: "dest_visa", l: "Visa or permit for the destination country", r: 1, if: "transit.dest_visa=Yes" },
    { k: "dest_pending", l: "Proof you applied for the destination country visa", if: "transit.dest_visa=Applied, waiting" },
    { k: "purpose_proof", l: "Proof of the purpose at the destination (invitation, job, school or business letter)" },
    { k: "bank", l: "Bank statements for the last 3 months", r: 1 },
  ], D_WORK, D_TRAVEL, D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Study permit (IMM 1294) ---------- */
const SP_OUT = {
  key: "sp-out",
  name: "Study permit – outside Canada",
  intro: "This form collects everything needed for a Canadian study permit application from outside Canada (IMM 1294 and the Family Information form) and the supporting documents. Answer every question truthfully and completely. Wrong or missing information can lead to a refusal or a finding of misrepresentation.",
  sections: [
    ...OUT_HEAD(),
    { id: "study", title: "School and program in Canada", fields: [
      { k: "school", l: "School name", t: "t", r: 1 },
      { k: "dli", l: "DLI number", t: "t", r: 1, h: "Starts with O, e.g. O19395677498. It's on your letter of acceptance." },
      { k: "loa_id", l: "Student ID or LOA reference number", t: "t", r: 1 },
      { k: "campus", l: "Campus city", t: "t", r: 1 },
      { k: "province", l: "Province", t: "s", r: 1, o: PROVINCES },
      { k: "program", l: "Program name", t: "t", r: 1 },
      { k: "level", l: "Level of study", t: "s", r: 1, o: ["Primary or secondary school", "Certificate or diploma", "Bachelor's degree", "Post-graduate certificate or diploma", "Master's degree", "PhD", "Language school", "Other"] },
      { k: "field", l: "Field of study", t: "t", r: 1 },
      { k: "start", l: "Program start date", t: "d", r: 1 },
      { k: "end", l: "Program end date", t: "d", r: 1 },
      { k: "tuition", l: "Tuition for the first year (CAD)", t: "n", r: 1 },
      { k: "paid", l: "Tuition already paid (CAD)", t: "n", r: 1 },
      { k: "pal", l: "Do you have a provincial or territorial attestation letter (PAL/TAL)?", t: "s", r: 1, o: ["Yes", "Not needed (master's, PhD, school-age or other exempt)", "Not yet"] },
      { k: "caq", l: "CAQ number and expiry (Quebec schools)", t: "t", r: 1, if: "study.province=Quebec" },
      { k: "coop", l: "Does the program include a co-op or internship?", t: "yn", r: 1 },
    ]},
    { id: "plan", title: "Your study plan", intro: "IRCC must be satisfied the program makes sense for you and that you will leave Canada at the end of your stay.", fields: [
      { k: "why_program", l: "Why this program, and how does it connect to your past studies or work?", t: "ta", r: 1, full: 1 },
      { k: "why_canada", l: "Why study in Canada rather than in your home country?", t: "ta", r: 1, full: 1 },
      { k: "career", l: "What job do you plan to do after you finish, and where?", t: "ta", r: 1, full: 1 },
      { k: "gap_yn", l: "Is there any gap in your education or work since finishing school?", t: "yn", r: 1 },
      { k: "gap", l: "Explain every gap, with dates", t: "ta", r: 1, if: "plan.gap_yn=Yes", full: 1 },
      { k: "test", l: "English or French test", t: "s", r: 1, o: ["IELTS Academic", "IELTS General", "PTE Academic", "TOEFL iBT", "Duolingo", "CELPIP", "TEF or TCF", "None (school waived it)"] },
      { k: "score", l: "Overall score and each band", t: "t", r: 1, if: "plan.test!=None (school waived it)" },
    ]},
    { id: "money", title: "How you will pay", fields: [
      { k: "funds", l: "Total money available for the first year, excluding tuition already paid (CAD)", t: "n", r: 1, h: "IRCC asks for one year of tuition plus living costs. We will check the current amount for you." },
      { k: "gic", l: "Have you bought a GIC (Guaranteed Investment Certificate) from a Canadian bank?", t: "yn", r: 1 },
      { k: "gic_details", l: "Bank and amount", t: "t", r: 1, if: "money.gic=Yes" },
      { k: "payer", l: "Who is paying?", t: "s", r: 1, o: ["Myself", "My parents", "My spouse", "Other family member", "Education loan", "Scholarship", "Employer"] },
      { k: "payer_details", l: "Name, relationship, occupation and annual income of the sponsor", t: "ta", r: 1, if: "money.payer=My parents|My spouse|Other family member|Employer", full: 1 },
      { k: "loan_details", l: "Bank, loan amount and sanction date", t: "t", r: 1, if: "money.payer=Education loan" },
      { k: "family_canada", l: "Do you have family in Canada?", t: "yn", r: 1 },
      { k: "family_canada_details", l: "Name, relationship, city and status", t: "t", r: 1, if: "money.family_canada=Yes" },
    ]},
    ...["education", "schools", "jobs", "travel", "trips", "family", "background", "military", "govpos", "memberships"].map(ref), ...END,
  ],
  docs: docsOf(D_OUT, [
    { k: "loa", l: "Letter of acceptance", r: 1 },
    { k: "pal", l: "Provincial or territorial attestation letter (PAL/TAL)", r: 1, if: "study.pal=Yes" },
    { k: "caq", l: "Quebec acceptance certificate (CAQ)", r: 1, if: "study.province=Quebec" },
    { k: "tuition", l: "Tuition fee receipt", r: 1 },
    { k: "gic", l: "GIC certificate", r: 1, if: "money.gic=Yes" },
    { k: "bank", l: "Bank statements (yours and your sponsor's) for the last 4 to 6 months", r: 1 },
    { k: "sponsor", l: "Sponsor's income proof (ITR for 3 years, job letter or business papers) and proof of relationship", r: 1, if: "money.payer=My parents|My spouse|Other family member|Employer" },
    { k: "loan", l: "Education loan sanction letter", r: 1, if: "money.payer=Education loan" },
    { k: "scholarship", l: "Scholarship letter", r: 1, if: "money.payer=Scholarship" },
    { k: "marks", l: "Mark sheets and certificates: 10th, 12th, and every diploma or degree", r: 1 },
    { k: "language", l: "English or French test result", r: 1, if: "plan.test!=None (school waived it)" },
    { k: "sop", l: "Statement of purpose (study plan)", h: "We can write it from your answers." },
    { k: "resume", l: "Resume (CV)" },
    { k: "experience", l: "Experience letters for jobs listed in your history" },
    { k: "gap_proof", l: "Proof for any education gap (job letters, course certificates, medical records)", if: "plan.gap_yn=Yes" },
    { k: "property", l: "Family property or asset documents" },
  ], D_TRAVEL, D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Work permits from outside Canada (IMM 1295) ---------- */
const JOB_OUT = (exempt) => ({ id: "job", title: "The job in Canada", fields: [
  ...(exempt ? [
    { k: "category", l: "LMIA exemption category", t: "s", r: 1, o: ["Francophone Mobility (C16)", "Intra-company transfer (C12)", "CUSMA or other free trade professional (T23, T24 and others)", "Significant benefit (C10)", "Reciprocal employment (C20, C21)", "Provincial nomination support (T13)", "Other", "Not sure"] },
    { k: "category_other", l: "Category or exemption code", t: "t", r: 1, if: "job.category=Other" },
    { k: "offer_no", l: "Offer of employment number", t: "t", r: 1, h: "Starts with A followed by 7 digits. The employer gets it from the IRCC Employer Portal." },
  ] : [
    { k: "lmia_no", l: "LMIA number", t: "t", r: 1, h: "The 7 to 9 digit number on the positive LMIA letter." },
    { k: "lmia_date", l: "LMIA approval date", t: "d", r: 1 },
    { k: "stream", l: "LMIA stream", t: "s", r: 1, o: ["High-wage", "Low-wage", "Agricultural", "Seasonal Agricultural Worker Program", "Global Talent Stream", "In-home caregiver", "Permanent residence only", "Not sure"] },
  ]),
  { k: "employer", l: "Employer's legal business name", t: "t", r: 1 },
  { k: "emp_address", l: "Employer's address", t: "ta", r: 1, full: 1 },
  { k: "emp_contact", l: "Contact person, phone and email", t: "t", r: 1, full: 1 },
  { k: "work_address", l: "Work location, if different", t: "t" },
  { k: "province", l: "Province of work", t: "s", r: 1, o: PROVINCES },
  { k: "job_title", l: "Job title", t: "t", r: 1 },
  { k: "noc", l: "NOC code", t: "t", r: 1, h: "5 digits, e.g. 72106. It's on the LMIA or offer." },
  { k: "wage", l: "Wage (per hour or per year)", t: "t", r: 1 },
  { k: "hours", l: "Hours per week", t: "n", r: 1 },
  { k: "start", l: "Expected start date", t: "d", r: 1 },
  { k: "duration", l: "Length of the job or permit requested", t: "t", r: 1 },
  { k: "duties", l: "Main duties", t: "ta", r: 1, full: 1 },
  { k: "how_found", l: "How did you find this job?", t: "t", r: 1 },
  { k: "fee", l: "Did you or anyone pay money to get this job offer?", t: "yn", r: 1, h: "Employers and recruiters may not charge workers for a job. Tell us honestly." },
  { k: "fee_details", l: "Who was paid, how much and when", t: "t", r: 1, if: "job.fee=Yes", full: 1 },
]});
const QUAL = { id: "qual", title: "Your qualifications for the job", fields: [
  { k: "exp_years", l: "Years of experience in this kind of work", t: "n", r: 1 },
  { k: "exp_where", l: "Where you got that experience", t: "t", r: 1, full: 1 },
  { k: "edu_match", l: "Does your education match the job requirements?", t: "s", r: 1, o: ["Yes", "Partly", "No", "The job doesn't require any"] },
  { k: "licence", l: "Does the job need a licence or certificate in Canada (Red Seal, nursing, driving class, etc.)?", t: "yn", r: 1, full: 1 },
  { k: "licence_details", l: "Which one, and the status of yours", t: "t", r: 1, if: "qual.licence=Yes", full: 1 },
  { k: "lang_req", l: "Language level the job needs, and yours", t: "t" },
  { k: "family_come", l: "Will your spouse or children come with you?", t: "yn", r: 1 },
]};
const WP_DOCS = (exempt) => docsOf(D_OUT, exempt ? [
  { k: "offer_confirm", l: "Employer Portal offer of employment confirmation (shows the A-number and fee paid)", r: 1 },
  { k: "contract", l: "Signed job offer or employment contract", r: 1 },
  { k: "category_proof", l: "Documents for the exemption category (company relationship letter, French test, free trade degree, etc.)" },
  { k: "language_fr", l: "French test result (TEF or TCF)", r: 1, if: "job.category=Francophone Mobility (C16)", h: "Francophone Mobility needs NCLC 5 or higher in speaking and listening." },
] : [
  { k: "lmia", l: "Positive LMIA letter and Annex A", r: 1 },
  { k: "contract", l: "Signed job offer or employment contract", r: 1 },
], [
  { k: "caq", l: "Quebec acceptance certificate (CAQ)", r: 1, if: "job.province=Quebec" },
  { k: "resume", l: "Resume (CV)", r: 1 },
  { k: "education", l: "Education certificates and transcripts", r: 1 },
  { k: "experience", l: "Experience letters: job title, dates, hours, duties and salary, on letterhead", r: 1 },
  { k: "pay_proof", l: "Proof of past pay (salary slips, bank credits or tax returns)" },
  { k: "licence", l: "Licence or certificate for the job", r: 1, if: "qual.licence=Yes" },
  { k: "language", l: "English or French test results", if: "language.test_yn=Yes" },
  D_POLICE,
], D_TRAVEL, D_FAMILY, D_BACK, D_OTHER);
const WP_INTRO = (what) => `This form collects everything needed for an ${what} work permit application from outside Canada (IMM 1295 and the Family Information form) and the supporting documents. Answer every question truthfully and completely. Wrong or missing information can lead to a refusal or a finding of misrepresentation.`;
const WP_LMIA_OUT = {
  key: "wp-lmia-out", name: "Work permit – LMIA-based (outside Canada)", intro: WP_INTRO("LMIA-based"),
  sections: [...OUT_HEAD(), JOB_OUT(0), QUAL, ...OUT_TAIL, ...END],
  docs: WP_DOCS(0),
};
const WP_EXEMPT_OUT = {
  key: "wp-exempt-out", name: "Work permit – LMIA-exempt (outside Canada)", intro: WP_INTRO("LMIA-exempt employer-specific"),
  sections: [...OUT_HEAD(), JOB_OUT(1), QUAL, ...OUT_TAIL, ...END],
  docs: WP_DOCS(1),
};

/* ---------- Spousal open work permit from outside Canada (IMM 1295) ---------- */
const SOWP_OUT = {
  key: "sowp-out",
  name: "Spousal open work permit (outside Canada)",
  intro: "For the spouse or common-law partner of a worker or student in Canada, applying from outside Canada. This form collects everything for the open work permit application (IMM 1295 and the Family Information form) and the supporting documents. Eligibility depends on your partner's job or program, so answer the partner questions carefully.",
  sections: [
    ...OUT_HEAD(),
    SOWP_IN.sections.find((s) => s.id === "partner"),
    { id: "relation", title: "Your relationship", fields: [
      { k: "met", l: "When and where did you first meet?", t: "t", r: 1, full: 1 },
      { k: "wedding", l: "Date and place of marriage (or date you started living together)", t: "t", r: 1, full: 1 },
      { k: "arranged", l: "Was it an arranged marriage?", t: "yn", r: 1 },
      { k: "together_time", l: "Periods you have lived together, with dates", t: "ta", r: 1, full: 1 },
      { k: "contact", l: "How do you keep in touch while apart?", t: "t", r: 1 },
      { k: "visits", l: "Has your partner visited you since moving to Canada?", t: "yn", r: 1 },
      { k: "visit_dates", l: "Dates of the visits", t: "t", r: 1, if: "relation.visits=Yes" },
      { k: "children", l: "Do you have children together?", t: "yn", r: 1 },
      { k: "kids_apply", l: "Are any children applying with you?", t: "yn", r: 1, if: "relation.children=Yes" },
      { k: "where_live", l: "Where will you live in Canada?", t: "t", r: 1 },
    ]},
    ref("work"),
    ...OUT_TAIL, ...END,
  ],
  docs: docsOf(D_OUT, [
    { k: "marriage_proof", l: "Marriage certificate, or IMM 5409 with proof of 12 months living together", r: 1 },
    { k: "wedding", l: "Wedding photos, invitation card and marriage registration" },
    { k: "partner_passport", l: "Partner's passport bio page", r: 1 },
    { k: "partner_permit", l: "Partner's work or study permit", r: 1 },
    { k: "partner_job", l: "Partner's employment letter (job title, NOC, wage, start date) and 3 recent pay stubs", r: 1, if: "partner.status=Worker|Permanent residence applicant with a work permit" },
    { k: "partner_lmia", l: "Partner's LMIA or offer of employment confirmation", if: "partner.status=Worker|Permanent residence applicant with a work permit" },
    { k: "partner_school", l: "Partner's enrolment letter, transcript and tuition receipt", r: 1, if: "partner.status=Student" },
    { k: "partner_pr", l: "Partner's PR or nomination acknowledgment letter", r: 1, if: "partner.status=Permanent residence applicant with a work permit" },
    { k: "contact_proof", l: "Proof of ongoing contact (call logs, chats, money transfers, visits)" },
    { k: "partner_funds", l: "Partner's bank statements and lease in Canada" },
    { k: "bank", l: "Your bank statements for the last 4 months" },
  ], D_WORK.filter((d) => d.k !== "student"), D_TRAVEL, D_FAMILY.filter((d) => d.k === "divorce"), D_BACK, D_OTHER),
};

/* ---------- International Experience Canada (IEC) ---------- */
const IEC_OUT = {
  key: "iec-out",
  name: "International Experience Canada (IEC)",
  intro: "For young people from countries with a youth mobility agreement with Canada (Working Holiday, Young Professionals and International Co-op). This form collects everything for the IEC profile and the work permit application after an invitation, plus the supporting documents.",
  sections: [
    ...OUT_HEAD(),
    { id: "iec", title: "Your IEC application", fields: [
      { k: "category", l: "IEC category", t: "s", r: 1, o: ["Working Holiday", "Young Professionals", "International Co-op (internship)", "Not sure"] },
      { k: "stage", l: "Where are you in the process?", t: "s", r: 1, o: ["No profile yet", "Profile in the pool", "Invited (ITA received)", "Application submitted"] },
      { k: "ita_date", l: "Date of the invitation (ITA)", t: "d", r: 1, if: "iec.stage=Invited (ITA received)|Application submitted", h: "You have 10 days to accept and 20 days after that to submit." },
      { k: "rco", l: "Are you applying through a recognized organization (RO)?", t: "yn", r: 1 },
      { k: "rco_name", l: "Recognized organization name", t: "t", r: 1, if: "iec.rco=Yes" },
      { k: "prev_iec", l: "Have you taken part in IEC before?", t: "yn", r: 1 },
      { k: "prev_iec_details", l: "Category and years", t: "t", r: 1, if: "iec.prev_iec=Yes" },
      { k: "funds", l: "Money you will have when you arrive (CAD)", t: "n", r: 1, h: "IEC asks for at least CAD 2,500 to cover initial expenses." },
      { k: "insurance", l: "Will you buy health insurance for your whole stay before you travel?", t: "yn", r: 1, h: "Required at the border, for the whole length of the permit." },
      { k: "employer", l: "Employer name and address in Canada", t: "ta", r: 1, if: "iec.category=Young Professionals|International Co-op (internship)", full: 1 },
      { k: "offer_no", l: "Offer of employment number (A followed by 7 digits)", t: "t", r: 1, if: "iec.category=Young Professionals|International Co-op (internship)" },
      { k: "job_title", l: "Job title and NOC", t: "t", r: 1, if: "iec.category=Young Professionals|International Co-op (internship)" },
      { k: "school_home", l: "Your school at home and why the internship is part of your program", t: "ta", r: 1, if: "iec.category=International Co-op (internship)", full: 1 },
      { k: "plans", l: "What do you plan to do in Canada?", t: "ta", full: 1 },
    ]},
    ...OUT_TAIL, ...END,
  ],
  docs: docsOf(D_OUT, [
    { k: "resume", l: "Resume (CV)", r: 1 },
    { ...D_POLICE, r: 1, h: "Required for IEC: from your country of citizenship and every country you lived in for 6 months or more since age 18." },
    { k: "funds", l: "Bank statement showing the funds", r: 1 },
    { k: "offer", l: "Job offer or contract", r: 1, if: "iec.category=Young Professionals|International Co-op (internship)" },
    { k: "offer_confirm", l: "Offer of employment confirmation from the Employer Portal", r: 1, if: "iec.category=Young Professionals|International Co-op (internship)" },
    { k: "school_letter", l: "Letter from your school confirming the internship is part of your program", r: 1, if: "iec.category=International Co-op (internship)" },
    { k: "education", l: "Education certificates (diploma or degree)", if: "iec.category=Young Professionals" },
    { k: "ro_letter", l: "Recognized organization letter", r: 1, if: "iec.rco=Yes" },
    { k: "ita", l: "Invitation (ITA) or IEC profile printout", if: "iec.stage!=No profile yet" },
  ], D_TRAVEL, D_FAMILY, D_BACK, D_OTHER),
};

/* ---------- Temporary resident permit from outside Canada (IMM 5257 + TRP request) ---------- */
const TRP_OUT = {
  key: "trp-out",
  name: "Temporary resident permit (outside Canada)",
  intro: "A temporary resident permit (TRP) lets a person who is inadmissible to Canada (for example, for a criminal record or a past immigration issue) come to Canada for a specific, strong reason. This form collects everything needed to prepare the request and the supporting documents. Answer every question truthfully and completely.",
  sections: [
    ...OUT_HEAD(),
    { id: "inadm", title: "Why you need a TRP", fields: [
      { k: "ground", l: "Reason you are inadmissible", t: "s", r: 1, o: ["Criminal record (including impaired driving)", "Medical reasons", "Previous overstay or work without permission", "Misrepresentation finding", "Previous removal or deportation", "Other"] },
      { k: "ground_other", l: "Describe", t: "t", r: 1, if: "inadm.ground=Other" },
      { k: "details", l: "Full details: what happened, when and where", t: "ta", r: 1, full: 1 },
      { k: "offence_date", l: "Date of the offence or conviction", t: "d", r: 1, if: "inadm.ground=Criminal record (including impaired driving)" },
      { k: "sentence_done", l: "Date you finished the whole sentence (including probation, fines and licence suspension)", t: "d", if: "inadm.ground=Criminal record (including impaired driving)", full: 1 },
      { k: "rehab", l: "Have you applied for criminal rehabilitation?", t: "s", if: "inadm.ground=Criminal record (including impaired driving)", o: ["Yes", "No", "Not yet eligible (under 5 years since sentence ended)"] },
      { k: "removal_date", l: "Date of the removal order or deportation, and the country", t: "t", r: 1, if: "inadm.ground=Previous removal or deportation" },
      { k: "arc", l: "Have you applied for an Authorization to Return to Canada (ARC)?", t: "yn", if: "inadm.ground=Previous removal or deportation" },
      { k: "prev_trp", l: "Have you had a TRP before?", t: "yn", r: 1 },
      { k: "prev_trp_details", l: "Dates and permit numbers", t: "t", r: 1, if: "inadm.prev_trp=Yes" },
    ]},
    { id: "visit", title: "Why you need to come to Canada", fields: [
      { k: "purpose", l: "Purpose of the trip", t: "s", r: 1, o: ["Business", "Family event (wedding, funeral, birth)", "Visiting family", "Medical", "Work", "Tourism", "Other"] },
      { k: "reasons", l: "Why must you travel to Canada, and why can't it wait or happen elsewhere?", t: "ta", r: 1, full: 1 },
      { k: "arrive", l: "Planned arrival date", t: "d", r: 1 },
      { k: "leave", l: "Planned departure date", t: "d", r: 1 },
      { k: "entry", l: "Port of entry (airport or border crossing)", t: "t", r: 1 },
      { k: "stay_address", l: "Where you will stay", t: "ta", r: 1, full: 1 },
      { k: "funds", l: "Money available for the trip (CAD)", t: "n", r: 1 },
    ]},
    ref("work"), ref("ties"),
    ...OUT_TAIL, ...END,
  ],
  docs: docsOf(D_OUT, [
    { k: "explanation", l: "Your letter explaining what happened, what has changed since, and why you need to come", h: "We can write this from your answers." },
    { k: "court_docs", l: "Court records, charge and sentence, and proof every part of the sentence was completed", r: 1, if: "inadm.ground=Criminal record (including impaired driving)" },
    { ...D_POLICE, r: 1, if: "inadm.ground=Criminal record (including impaired driving)" },
    { k: "fbi", l: "FBI identity history summary (if you lived in the US)", if: "inadm.ground=Criminal record (including impaired driving)" },
    { k: "medical", l: "Medical reports and treatment plan", r: 1, if: "inadm.ground=Medical reasons" },
    { k: "ircc_letters", l: "IRCC or CBSA letters (refusals, removal orders, misrepresentation findings)", if: "inadm.ground!=Medical reasons" },
    { k: "purpose_proof", l: "Proof of the reason for travel (invitation, event card, business letter, medical appointment)", r: 1 },
    { k: "support", l: "Character references and support letters" },
    { k: "bank", l: "Bank statements for the last 4 months", r: 1 },
    { k: "property", l: "Property documents", if: "ties.property_yn=Yes" },
  ], D_WORK, D_TRAVEL, D_FAMILY, D_BACK, D_OTHER),
};

export const FORMS = Object.fromEntries([TRV_OUT, SUPERVISA_OUT, ETA, TRANSIT_OUT, SP_OUT, WP_LMIA_OUT, WP_EXEMPT_OUT, SOWP_OUT, IEC_OUT, TRP_OUT, VR_IN, TRV_IN, SP_EXT, WP_EXT, PGWP, SOWP_IN, BOWP, VOWP, RESTORE, TRP_IN].map((f) => [f.key, f]));

/* ---------- consent shown before every submission (stored word for word with the submission) ----------
   Bump CONSENT_V when the wording changes. KEEP_DAYS must match functions/_intake_file.js. */
export const CONSENT_V = "2026-11-03";
export const KEEP_DAYS = 30;
export const CONSENT_TEXT = "I give my consent to WorkerPool to use the information and documents in this form only to prepare my application. I understand that once my file is complete, the WorkerPool team will permanently destroy all the documents I uploaded, and will share the complete submitted file (my answers and all my documents) with me for my future reference.";
// Forms sent by a partner firm (an RCIC or law firm using WorkerPool intake links for its own clients).
export const partnerConsent = (firm) => `I give my consent to WorkerPool, a data processing company collecting this form on behalf of ${firm}, to share the information and documents in this form with ${firm} so that ${firm} can prepare my application. Only ${firm} and the WorkerPool team can see them. ${firm} downloads my complete file from WorkerPool, and my uploaded documents are permanently deleted from WorkerPool when ${firm} has finished with my file or when I ask.`;
export const KEEP_TEXT = {
  1: "Yes, save my complete file with WorkerPool for future reference. It stays in my WorkerPool account until I ask for it to be removed.",
  0: `No, don't save it. Remove my complete file from WorkerPool ${KEEP_DAYS} days after it is shared with me (I will download my own copy).`,
};

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
