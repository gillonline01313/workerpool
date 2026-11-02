/* WorkerPool Student Pool (free).
   1. The student adds documents per level (10th, 12th, diploma, bachelor's, master's, English test, other).
   2. Each file is turned into a few small JPEG page images here in the browser and sent to /api/student/read,
      one document per request. The server reads it in memory and returns facts; nothing is stored.
      As soon as a file has been read, this page drops it too (the file list and inputs are emptied).
   3. The facts become an editable student profile. The student confirms it, adds study plans and contact
      details, and sends it to /api/student/submit. Only those typed details are saved; the student gets an
      email saying an education consultant will reply with study options within 24 hours (free service). */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const track = (s) => { try { window.wpaSection && window.wpaSection("Student Pool: " + s); } catch (e) {} };

const SLOTS = [
  { k: "tenth", t: "10th", ic: "10", hint: "Secondary / matriculation marksheet or certificate" },
  { k: "twelfth", t: "12th", ic: "12", hint: "Senior secondary / intermediate marksheet or certificate" },
  { k: "diploma", t: "Diploma", ic: "Dip", hint: "Polytechnic, ITI or college diploma, if you did one" },
  { k: "bachelors", t: "Graduation (Bachelor's)", ic: "UG", hint: "Degree, consolidated marksheet or transcript" },
  { k: "masters", t: "Post-graduation (Master's)", ic: "PG", hint: "Master's degree, PG diploma, marksheets" },
  { k: "english", t: "English test", ic: "EN", hint: "IELTS, PTE, TOEFL, Duolingo or CELPIP result" },
  { k: "other", t: "Other documents", ic: "+", hint: "Backlog certificate, ECA (WES), anything else" },
];
const LEVELS = [["tenth", "10th"], ["twelfth", "12th"], ["diploma", "Diploma"], ["bachelors", "Bachelor's"], ["masters", "Master's / PG"], ["phd", "PhD"], ["other", "Other"]];
const LEVEL_NAME = Object.fromEntries(LEVELS);
const ORDER = LEVELS.map((l) => l[0]);
const TESTS = [["ielts_academic", "IELTS Academic"], ["ielts_general", "IELTS General"], ["pte_academic", "PTE Academic"], ["pte_core", "PTE Core"], ["toefl_ibt", "TOEFL iBT"], ["duolingo", "Duolingo English Test"], ["celpip", "CELPIP"], ["other", "Other test"], ["planned", "Booked / planning to take one"], ["none", "Not taken yet"]];
const TEST_NAME = Object.fromEntries(TESTS);
const MAX_PER_SLOT = 4, MAX_SIZE = 15 * 1024 * 1024;

let FILES = Object.fromEntries(SLOTS.map((s) => [s.k, []]));
let EDU = [], ENG = { test: "none" }, NO_TEST = false, REF = "";

/* ---------------- upload ---------------- */
function renderSlots() {
  $("slots").innerHTML = SLOTS.map((s) => `
    <div class="slot${FILES[s.k].length ? " has" : ""}" data-k="${s.k}">
      <div class="slot-h"><span class="slot-ic" aria-hidden="true">${s.ic}</span><div><b>${esc(s.t)}</b><small>${esc(s.hint)}</small></div></div>
      ${FILES[s.k].length ? `<ul class="files">${FILES[s.k].map((f, i) => `<li><span>${esc(f.name)}</span><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></li>`).join("")}</ul>` : ""}
      ${FILES[s.k].length < MAX_PER_SLOT ? `<button class="add" type="button" data-add="${s.k}"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>${FILES[s.k].length ? "Add another page" : "Add file or photo"}</button>` : ""}
      ${s.k === "english" ? `<label class="chk"><input type="checkbox" id="noTest"${NO_TEST ? " checked" : ""}> <span>I haven't taken an English test yet</span></label>` : ""}
      <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" multiple data-in="${s.k}">
    </div>`).join("");
  $("slots").querySelectorAll(".slot").forEach((el) => {
    const k = el.dataset.k, input = el.querySelector("input[type=file]");
    const btn = el.querySelector("[data-add]"); if (btn) btn.onclick = () => input.click();
    input.onchange = () => { addFiles(k, input.files); input.value = ""; };
    el.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { FILES[k].splice(+b.dataset.rm, 1); renderSlots(); });
    el.ondragover = (e) => { e.preventDefault(); el.classList.add("drag"); };
    el.ondragleave = () => el.classList.remove("drag");
    el.ondrop = (e) => { e.preventDefault(); el.classList.remove("drag"); addFiles(k, e.dataTransfer.files); };
  });
  const nt = $("noTest"); if (nt) nt.onchange = () => { NO_TEST = nt.checked; };
  const n = SLOTS.reduce((a, s) => a + FILES[s.k].length, 0);
  $("readBtn").disabled = !n;
  $("readBtn").textContent = n ? `Build my profile from ${n} document${n > 1 ? "s" : ""}` : "Build my profile";
}
function addFiles(k, list) {
  for (const f of [...(list || [])]) {
    if (FILES[k].length >= MAX_PER_SLOT) break;
    if (!/pdf|jpe?g|png|webp/i.test(f.type + f.name)) { alert(`${f.name}: please use a PDF, JPG or PNG.`); continue; }
    if (f.size > MAX_SIZE) { alert(`${f.name} is over 15 MB. Try a smaller photo.`); continue; }
    FILES[k].push(f);
  }
  renderSlots();
}

/* ---- turn a file into small page images (and a text layer for PDFs) ---- */
let pdfjs = null;
function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { let n = 0; const wait = () => {
      if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(window.pdfjsLib); }
      else if (n++ < 60) setTimeout(wait, 50); else { pdfjs = null; no(new Error("pdf")); } }; wait(); };
    s.onerror = () => { pdfjs = null; no(new Error("pdf")); };
    document.head.appendChild(s);
  });
  return pdfjs;
}
async function prepare(file) {
  if (/pdf/.test(file.type) || /\.pdf$/i.test(file.name)) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const images = []; let text = "";
    for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
      const page = await doc.getPage(i), v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(2.2, 1500 / Math.max(v1.width, v1.height)) });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      images.push(c.toDataURL("image/jpeg", 0.8)); c.width = c.height = 0;
      try { const tc = await page.getTextContent(); text += tc.items.map((x) => x.str).join(" ") + "\n"; } catch (e) {}
    }
    try { (doc.destroy || doc.cleanup || (() => {})).call(doc); } catch (e) {}
    return { images, text: text.replace(/[ \t]+/g, " ").trim().slice(0, 12000) };
  }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { bmp = await new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error("img")); }; im.src = u; }); }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const out = c.toDataURL("image/jpeg", 0.85); c.width = c.height = 0; // re-drawing also drops photo location data
  return { images: [out], text: "" };
}

/* ---------------- read ---------------- */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
async function runRead() {
  track("read started");
  const jobs = [];
  SLOTS.forEach((s) => FILES[s.k].forEach((f) => jobs.push({ kind: s.k, file: f, name: f.name, label: s.t })));
  FILES = Object.fromEntries(SLOTS.map((s) => [s.k, []])); // the page no longer holds the uploads once reading starts
  show("pr");
  $("rTitle").textContent = "Reading your documents…";
  $("rSub").textContent = "This takes about 10 to 20 seconds per document. Keep this page open.";
  $("rList").innerHTML = jobs.map((j, i) => `<li><span class="nm">${esc(j.name)}<small>${esc(j.label)}</small></span><span class="st" id="st${i}">Waiting</span></li>`).join("");
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i], st = $("st" + i);
    st.className = "st run"; st.textContent = "Reading…";
    let r = null;
    try {
      let body = await prepare(j.file);
      const res = await fetch("/api/student/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: j.kind, today: today(), ...body }) });
      body = null;
      r = await res.json().catch(() => ({}));
    } catch (e) { r = { ok: false }; }
    j.file = null; // destroyed: no copy of the document is kept on this page
    if (r && r.ok && r.result) { results.push({ ...r.result, kind: j.kind, from: j.name }); st.className = "st ok"; st.textContent = "Read · deleted"; }
    else { results.push({ kind: j.kind, from: j.name, failed: true }); st.className = "st bad"; st.textContent = "Type it in · deleted"; }
    $("rBar").style.width = Math.round(((i + 1) / jobs.length) * 100) + "%";
  }
  $("rTitle").textContent = "Done. All documents destroyed.";
  $("rSub").textContent = `${jobs.length} document${jobs.length > 1 ? "s were" : " was"} read and permanently deleted. Nothing was saved.`;
  jobs.length = 0;
  buildProfile(results);
  setTimeout(() => { show("p2"); track("profile review"); }, 900);
}

const resultText = (e) => e.percentage != null ? `${e.percentage}%` : e.cgpa != null ? `${e.cgpa} CGPA${e.cgpa_scale ? " / " + e.cgpa_scale : ""}` : e.grade_or_division || "";
function buildProfile(results) {
  const by = {}; // keep what the student already confirmed or typed (when they go back to add more documents)
  EDU.forEach((e, i) => { by[e.level === "other" ? "other-kept-" + i : e.level] = e; });
  const blank = (level) => ({ level, credential: "", board: "", institution: "", country: "", major: "", start: "", completed: "", result: "", english: "", maths: "", backlogs: "", medium: "", conf: null, issues: [], from: [] });
  const take = (o, k, v) => { if ((o[k] === "" || o[k] == null) && v != null && v !== "") o[k] = String(v); };
  for (const r of results) {
    if (r.language) {
      const l = r.language;
      ENG = { test: l.test || "other", overall: l.overall ?? "", listening: l.listening ?? "", reading: l.reading ?? "", writing: l.writing ?? "", speaking: l.speaking ?? "", date: l.test_date || "", conf: r.confidence, issues: r.issues || [] };
      continue;
    }
    if (r.kind === "english") { if (ENG.test === "none") ENG = { test: "other", conf: "low", issues: [`We couldn't read ${r.from}. Please type your scores.`] }; continue; }
    const e = r.education;
    const level = e && e.level && e.level !== "other" ? e.level : r.kind;
    const key = level === "other" ? "other-" + r.from : level;
    const o = by[key] || (by[key] = blank(level));
    o.from.push(r.from);
    if (r.failed || !e) { o.issues.push(`We couldn't read ${r.from}. Please fill in the details.`); o.conf = o.conf || "low"; continue; }
    take(o, "credential", e.credential); take(o, "board", e.board_or_university); take(o, "institution", e.institution); take(o, "country", e.country);
    take(o, "major", e.stream_or_major); take(o, "start", e.start); take(o, "completed", e.completed); take(o, "result", resultText(e));
    take(o, "english", e.english_marks); take(o, "maths", e.maths_marks); take(o, "backlogs", e.backlogs); take(o, "medium", e.medium_of_instruction);
    o.conf = o.conf === "low" || r.confidence === "low" ? "low" : r.confidence;
    (r.issues || []).forEach((x) => o.issues.push(x));
  }
  EDU = Object.values(by).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  EDU.forEach((e) => { e.from = e.from || []; e.issues = e.issues || []; });
  if (!EDU.length) EDU = [blank("tenth"), blank("twelfth")];
  if (NO_TEST && ENG.test === "none") ENG = { test: "none" };
  renderReview();
}

/* ---------------- review ---------------- */
const FIELDS = [["credential", "Qualification / degree name", "e.g. Senior Secondary, B.Com, B.Tech CSE", "w2"], ["major", "Stream / major", "e.g. Science, Commerce, Computer Science"],
  ["board", "Board / university", "e.g. PSEB, CBSE, Punjabi University"], ["institution", "School / college", ""], ["country", "Country", "e.g. India"],
  ["start", "Started (YYYY-MM)", "2019-07"], ["completed", "Completed (YYYY-MM)", "2023-06"], ["result", "Overall result", "e.g. 78% or 7.4 CGPA"],
  ["english", "English marks", "e.g. 72/100"], ["maths", "Maths marks", "e.g. 64/100"], ["backlogs", "Backlogs / re-appears", "0"], ["medium", "Medium of instruction", "e.g. English"]];
function renderReview() {
  $("eduList").innerHTML = EDU.map((e, i) => `
    <div class="grp" data-i="${i}">
      <div class="grp-h"><h3><select data-f="level" aria-label="Level" style="width:auto;font-weight:700">${LEVELS.map(([k, l]) => `<option value="${k}"${k === e.level ? " selected" : ""}>${l}</option>`).join("")}</select>
        ${e.from && e.from.length ? `<span class="pill${e.conf === "low" ? " low" : ""}">${e.conf === "low" ? "Please check" : "Read from " + e.from.length + " doc" + (e.from.length > 1 ? "s" : "")}</span>` : ""}</h3>
        <button class="rm" type="button" data-del="${i}">Remove</button></div>
      <div class="grid">${FIELDS.filter(([k]) => !(["english", "maths"].includes(k) && !["tenth", "twelfth"].includes(e.level))).map(([k, l, ph, w]) =>
        `<label class="f${w ? " " + w : ""}">${l}<input type="text" data-f="${k}" value="${esc(e[k])}" maxlength="${k === "credential" || k === "major" || k === "board" || k === "institution" ? 120 : 40}" placeholder="${esc(ph || "")}"></label>`).join("")}</div>
      ${e.issues && e.issues.length ? `<div class="issues"><b>Please check:</b><ul>${[...new Set(e.issues)].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    </div>`).join("");
  $("eduList").querySelectorAll(".grp").forEach((g) => {
    const e = EDU[+g.dataset.i];
    g.querySelectorAll("[data-f]").forEach((inp) => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => { e[inp.dataset.f] = inp.value; if (inp.dataset.f === "level") renderReview(); }));
    g.querySelector("[data-del]").onclick = () => { EDU.splice(+g.dataset.i, 1); renderReview(); };
  });
  const have = new Set(EDU.map((e) => e.level));
  $("addq").innerHTML = LEVELS.filter(([k]) => k === "other" || !have.has(k)).map(([k, l]) => `<button class="add rm" type="button" data-addl="${k}">+ Add ${l}</button>`).join("");
  $("addq").querySelectorAll("[data-addl]").forEach((b) => b.onclick = () => {
    EDU.push({ level: b.dataset.addl, credential: "", board: "", institution: "", country: "", major: "", start: "", completed: "", result: "", english: "", maths: "", backlogs: "", medium: "", issues: [] });
    EDU.sort((a, c) => ORDER.indexOf(a.level) - ORDER.indexOf(c.level)); renderReview();
  });
  renderEnglish();
}
function renderEnglish() {
  const off = ENG.test === "none" || ENG.test === "planned";
  $("engBox").innerHTML = `<div class="grid">
    <label class="f w2">Test<select data-e="test">${TESTS.map(([k, l]) => `<option value="${k}"${k === ENG.test ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    ${off ? `<label class="f">${ENG.test === "planned" ? "Which test and when?" : "Planning to take one?"}<input type="text" data-e="planned" maxlength="120" value="${esc(ENG.planned)}" placeholder="e.g. IELTS Academic in January"></label>`
      : `<label class="f">Overall<input type="text" inputmode="decimal" data-e="overall" maxlength="8" value="${esc(ENG.overall)}"></label>
    <label class="f">Listening<input type="text" inputmode="decimal" data-e="listening" maxlength="8" value="${esc(ENG.listening)}"></label>
    <label class="f">Reading<input type="text" inputmode="decimal" data-e="reading" maxlength="8" value="${esc(ENG.reading)}"></label>
    <label class="f">Writing<input type="text" inputmode="decimal" data-e="writing" maxlength="8" value="${esc(ENG.writing)}"></label>
    <label class="f">Speaking<input type="text" inputmode="decimal" data-e="speaking" maxlength="8" value="${esc(ENG.speaking)}"></label>
    <label class="f">Test date (YYYY-MM)<input type="text" data-e="date" maxlength="7" value="${esc(ENG.date)}" placeholder="2026-08"></label>`}
  </div>${ENG.issues && ENG.issues.length ? `<div class="issues"><b>Please check:</b><ul>${ENG.issues.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}`;
  $("engBox").querySelectorAll("[data-e]").forEach((inp) => inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
    ENG[inp.dataset.e] = inp.value; if (inp.dataset.e === "test") renderEnglish(); }));
}
function intakes() { // the next six January, May and September intakes, starting at least two months out
  const out = [], d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 2);
  for (let i = 0; i < 30 && out.length < 6; i++, d.setMonth(d.getMonth() + 1))
    if ([0, 4, 8].includes(d.getMonth())) out.push(d.toLocaleDateString("en-CA", { month: "long", year: "numeric" }));
  $("pIntake").innerHTML = `<option value="">Choose…</option>` + out.map((x) => `<option>${x}</option>`).join("") + `<option>Flexible</option>`;
}

/* gap: whole years since the most recent completed qualification */
function gapYears() {
  const ds = EDU.map((e) => (e.completed || "").match(/^(\d{4})(?:-(\d{2}))?/)).filter(Boolean).map((m) => new Date(+m[1], (m[2] ? +m[2] : 6) - 1, 1));
  if (!ds.length) return null;
  const last = new Date(Math.max(...ds)), y = (Date.now() - last) / (365.25 * 864e5);
  return y < 0 ? 0 : Math.floor(y);
}

/* ---------------- submit ---------------- */
async function submit() {
  const err = $("sErr"); err.textContent = "";
  const contact = { name: $("cName").value.trim(), email: $("cEmail").value.trim(), phone: $("cPhone").value.trim(), whatsapp: $("cWa").value.trim() };
  const edu = EDU.map(({ level, credential, board, institution, country, major, start, completed, result, english, maths, backlogs, medium }) => ({ level, credential, board, institution, country, major, start, completed, result, english, maths, backlogs, medium }))
    .filter((e) => e.credential || e.institution || e.board || e.result || e.completed);
  if (!edu.length) { err.textContent = "Add at least one qualification (for example your 12th)."; return; }
  if (!contact.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.phone.replace(/\D/g, "").length < 7) { err.textContent = "Add your full name, a working email and a phone number with country code."; $("cName").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  if (!$("consent").checked) { err.textContent = "Please tick the box to agree to share your profile with our education team."; return; }
  const g = gapYears();
  const plans = { country: $("pCountry").value, level: $("pLevel").value, field: $("pField").value.trim(), intake: $("pIntake").value, budget: $("pBudget").value,
    living_in: $("pLiving").value.trim(), city: $("pCity").value.trim(), in_canada: $("pInCa").value, gap: g == null ? "" : `${g} year${g === 1 ? "" : "s"} since last qualification`, notes: $("pNotes").value.trim() };
  const english = { test: ENG.test, overall: ENG.overall || "", listening: ENG.listening || "", reading: ENG.reading || "", writing: ENG.writing || "", speaking: ENG.speaking || "", date: ENG.date || "", planned: ENG.planned || "" };
  const b = $("submit"); b.disabled = true; b.textContent = "Sending…";
  try {
    const r = await fetch("/api/student/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact, education: edu, english, plans, consent: true, website: $("website").value }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || "Something went wrong. Please try again.");
    REF = j.ref || "";
    track("submitted");
    renderDone(contact, edu, english, plans);
    show("p3");
  } catch (e) { err.textContent = e.message; }
  b.disabled = false; b.textContent = "Send my profile · Free";
}
function engLine(e) {
  if (e.test === "none") return "Not taken yet";
  if (e.test === "planned") return "Planned" + (e.planned ? ": " + e.planned : "");
  const bands = [e.listening, e.reading, e.writing, e.speaking];
  return `${TEST_NAME[e.test] || "Test"} ${e.overall || ""}${bands.some(Boolean) ? ` (L ${bands[0] || "–"} · R ${bands[1] || "–"} · W ${bands[2] || "–"} · S ${bands[3] || "–"})` : ""}`.trim();
}
function renderDone(c, edu, eng, plans) {
  const sorted = [...edu].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const top = [...sorted].reverse().find((e) => e.level !== "other") || sorted[sorted.length - 1];
  const due = new Date(Date.now() + 864e5).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const g = gapYears();
  $("doneSub").innerHTML = `We've emailed <b>${esc(c.email)}</b>. One of our education consultants is now working on your credentials and will get back to you with the study options available to you within 24 hours. It's free.`;
  $("pcard").innerHTML = `<div class="pcard">
    <div class="pc-h"><div><small>Student profile${REF ? " · " + esc(REF) : ""}</small><b>${esc(c.name)}</b></div>
      <div class="pc-free"><span>Free service</span><span class="t">Reply by ${esc(due)}</span></div></div>
    <div class="pc-stats">
      <div><small>Highest</small><b>${esc(LEVEL_NAME[top.level])}${top.credential ? `<br><span style="font-size:.85rem;font-weight:600">${esc(top.credential)}</span>` : ""}</b></div>
      <div><small>Result</small><b>${esc(top.result || "–")}</b></div>
      <div><small>English</small><b>${esc(eng.test === "none" || eng.test === "planned" ? "Not yet" : (TEST_NAME[eng.test] || "") + " " + (eng.overall || ""))}</b></div>
      <div><small>Study gap</small><b>${g == null ? "–" : g + (g === 1 ? " year" : " years")}</b></div>
    </div>
    <ul class="pc-tl">${sorted.map((e) => `<li><span class="lv">${esc(LEVEL_NAME[e.level])}<small>${esc(e.completed || "")}</small></span>
      <span class="dt"><b>${esc([e.credential, e.major].filter(Boolean).join(" · ") || LEVEL_NAME[e.level])}</b>${esc([e.institution || e.board, e.country].filter(Boolean).join(", "))}${e.result ? " · " + esc(e.result) : ""}${e.english ? " · English " + esc(e.english) : ""}${e.backlogs && e.backlogs !== "0" ? " · " + esc(e.backlogs) + " backlog(s)" : ""}</span></li>`).join("")}
      <li><span class="lv">English</span><span class="dt"><b>${esc(engLine(eng))}</b>${esc(eng.date ? "Taken " + eng.date : "")}</span></li>
      ${plans.level || plans.field || plans.intake ? `<li><span class="lv">Looking for</span><span class="dt"><b>${esc([plans.level, plans.field].filter(Boolean).join(" · ") || "Study options")}</b>${esc([plans.country, plans.intake, plans.budget].filter(Boolean).join(" · "))}</span></li>` : ""}
    </ul>
    <div class="pc-foot">An education consultant is working on your credentials. Your documents were read once and permanently deleted; only this profile is kept.</div>
  </div>`;
}

/* ---------------- steps ---------------- */
function show(id) {
  ["p1", "pr", "p2", "p3"].forEach((p) => { $(p).hidden = p !== id; });
  const step = { p1: 0, pr: 0, p2: 1, p3: 2 }[id];
  $("steps").querySelectorAll("li").forEach((li, i) => { li.className = i < step ? "done" : i === step ? "on" : ""; });
  document.getElementById("start").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("readBtn").onclick = runRead;
$("manual").onclick = () => { track("manual"); buildProfile([]); if (NO_TEST) ENG = { test: "none" }; show("p2"); };
$("back").onclick = () => { renderSlots(); show("p1"); };
$("submit").onclick = submit;
$("print").onclick = () => window.print();
intakes();
renderSlots();
})();
