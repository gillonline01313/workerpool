/* WorkerPool Lead Desk — lead manager portal (/leads/).
   Managers punch client leads, follow each lead's status, payments and whether an RCIC is attached,
   comment, and finish what WorkerPool sends back to them. API: /api/leads/. */
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (t) => t ? new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
const day = (t) => t ? new Date(t.length === 10 ? t + "T12:00:00" : t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "–";
const money = (c) => "$" + ((c || 0) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let me = null, services = [], statuses = {}, rows = [], filter = "all", search = "";

async function api(path, body) {
  const r = await fetch("/api/leads/" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.auth) { me = null; header(); signIn("Your session ended. Sign in again."); throw new Error("auth"); }
  if (!r.ok || !j.ok) throw new Error(j.error || "Something went wrong. Try again.");
  return j;
}
const FILE_TYPES = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
// Uploads one file to a lead. Returns an error message, or "" when it worked.
async function upload(id, file, kind) {
  try {
    const r = await fetch("/api/leads/file?id=" + encodeURIComponent(id), { method: "POST", body: file, headers: { "x-file-name": encodeURIComponent(file.name), "x-kind": kind } });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok ? "" : j.error || "upload failed";
  } catch (e) { return "check your connection"; }
}
function header() { $("#who").hidden = !me; if (me) $("#whoName").textContent = me.name + (me.company ? " · " + me.company : ""); }
const pill = (l) => `<span class="pill s-${esc(l.status)}">${esc(l.status_label)}</span>`;
const go = (id) => { history.pushState(null, "", id ? "?id=" + encodeURIComponent(id) : location.pathname); route(); };
window.addEventListener("popstate", () => route());

async function boot() {
  const set = new URLSearchParams(location.search).get("set");
  if (set) return setPassword(set);
  try { const j = await api("me"); me = j.me; services = j.services; statuses = j.statuses; header(); route(); }
  catch (e) { if (e.message !== "auth") signIn(); }
}
function route() {
  const id = new URLSearchParams(location.search).get("id");
  if (!me) return signIn();
  if (id === "new") return newLead();
  if (id) return lead(id);
  list();
}

/* ---------- sign in, set password, forgot ---------- */
function signIn(notice = "") {
  view.innerHTML = `<div class="card" style="max-width:440px;margin:20px auto">
    <div><span class="eyebrow">WorkerPool Lead Desk</span><h1 style="font-size:1.7rem;margin-top:4px">Sign in</h1>
    <p class="lede" style="margin-top:6px">Refer clients to WorkerPool and follow every lead until the service is complete.</p></div>
    ${notice ? `<div class="note warn">${esc(notice)}</div>` : ""}
    <form id="fIn" class="stack" novalidate>
      <div class="f"><label for="iEmail">Email or phone number</label><input id="iEmail" autocomplete="username" placeholder="you@example.com or +1 780 555 0100"></div>
      <div class="f"><label for="iPass">Password</label><input id="iPass" type="password" autocomplete="current-password"></div>
      <div class="err" id="iErr"></div>
      <button class="btn" type="submit">Sign in</button>
      <button class="linkbtn" type="button" id="forgot">Forgot your password?</button>
    </form>
    <p class="muted" style="margin:0">New here? Sign up with the link WorkerPool sent you. If you'd like to refer clients, contact info@workerpool.ca.</p></div>`;
  $("#fIn").onsubmit = async (e) => {
    e.preventDefault(); $("#iErr").textContent = "";
    try { await api("login", { login: $("#iEmail").value, password: $("#iPass").value }); boot(); }
    catch (x) { $("#iErr").textContent = x.message; }
  };
  $("#forgot").onclick = async () => {
    const email = $("#iEmail").value.trim();
    if (!email) { $("#iErr").textContent = "Enter your email or phone first, then press Forgot password."; return; }
    try { await api("forgot", { login: email }); } catch (x) {}
    $("#fIn").outerHTML = `<div class="note">If that account has an email address, a link to reset the password is on its way (it works for 1 hour). If you signed up with a phone number only, ask WorkerPool to send you a new link.</div>`;
  };
}
async function setPassword(token) {
  let info;
  try { info = await api("invite?token=" + encodeURIComponent(token)); }
  catch (e) { view.innerHTML = `<div class="card" style="max-width:440px;margin:20px auto"><h2>Link not working</h2><p class="err" style="margin:0">${esc(e.message)}</p><a class="btn ghost" href="/leads/">Go to sign in</a></div>`; return; }
  const up = info.signup;
  view.innerHTML = `<div class="card" style="max-width:460px;margin:20px auto">
    <div><span class="eyebrow">WorkerPool Lead Desk</span><h1 style="font-size:1.7rem;margin-top:4px">${up ? `Welcome, ${esc(info.name.split(" ")[0])}` : "Choose a new password"}</h1>
    ${up ? `<p class="lede" style="margin-top:6px">Sign up to refer clients to WorkerPool${info.company ? ` for ${esc(info.company)}` : ""} and follow every lead until the service is complete.</p>` : ""}</div>
    <form id="fSet" class="stack" novalidate>
      ${up ? `<p class="muted" style="margin:0">You'll sign in with your email or your phone number. Add at least one. With an email you can also reset your password yourself.</p>
      <div class="f"><label for="sEmail">Email</label><input id="sEmail" type="email" autocomplete="email" value="${esc(info.email || "")}"></div>
      <div class="f"><label for="sPhone">Phone number (with country code)</label><input id="sPhone" type="tel" autocomplete="tel" value="${esc(info.phone || "")}" placeholder="+1 780 555 0100"></div>` : ""}
      <div class="f"><label for="sPass">${up ? "Password" : "New password"}</label><input id="sPass" type="password" autocomplete="new-password" placeholder="At least 10 characters"></div>
      <div class="f"><label for="sPass2">Type it again</label><input id="sPass2" type="password" autocomplete="new-password"></div>
      <div class="err" id="sErr"></div><button class="btn" type="submit">${up ? "Sign up" : "Save and sign in"}</button></form></div>`;
  $("#fSet").onsubmit = async (e) => {
    e.preventDefault(); const p = $("#sPass").value;
    if (p !== $("#sPass2").value) { $("#sErr").textContent = "The two passwords don't match."; return; }
    const body = { token, password: p };
    if (up) { body.email = $("#sEmail").value; body.phone = $("#sPhone").value; if (!body.email.trim() && !body.phone.trim()) { $("#sErr").textContent = "Enter your email or your phone number."; return; } }
    try { await api("set", body); history.replaceState(null, "", location.pathname); boot(); }
    catch (x) { $("#sErr").textContent = x.message; }
  };
}
$("#logout").onclick = async () => { try { await api("logout", {}); } catch (e) {} me = null; header(); history.replaceState(null, "", location.pathname); signIn(); };
$("#pwBtn").onclick = () => {
  view.innerHTML = `<div class="card" style="max-width:440px;margin:20px auto"><h2>Change password</h2>
    <form id="fPw" class="stack" novalidate>
      <div class="f"><label for="pCur">Current password</label><input id="pCur" type="password" autocomplete="current-password"></div>
      <div class="f"><label for="pNew">New password</label><input id="pNew" type="password" autocomplete="new-password" placeholder="At least 10 characters"></div>
      <div class="err" id="pErr"></div><div class="row"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="pBack">Back</button></div></form></div>`;
  $("#pBack").onclick = () => route();
  $("#fPw").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("password", { current: $("#pCur").value, password: $("#pNew").value }); $("#fPw").outerHTML = `<div class="note">Password changed.</div><button class="btn ghost" type="button" id="pBack2">Back to my leads</button>`; $("#pBack2").onclick = () => route(); }
    catch (x) { $("#pErr").textContent = x.message; }
  };
};

/* ---------- my leads ---------- */
const isOpen = (l) => !["completed", "closed"].includes(l.status);
const updated = (l) => l.admin_at && (!l.mgr_seen || l.admin_at > l.mgr_seen);
async function list() {
  try { rows = (await api("list")).rows; } catch (e) { if (e.message !== "auth") view.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  const n = { act: rows.filter((l) => l.action_needed).length, open: rows.filter(isOpen).length, won: rows.filter((l) => ["finalized", "completed"].includes(l.status)).length, paid: rows.reduce((a, l) => a + (l.paid_cents || 0), 0) };
  view.innerHTML = `<div class="stack">
    <div class="row sp"><div><span class="eyebrow">Lead Desk</span><h1>My leads</h1></div><button class="btn" type="button" id="add">+ New lead</button></div>
    ${n.act ? `<div class="note warn"><b>${n.act} lead${n.act > 1 ? "s" : ""} sent back to you.</b> WorkerPool needs something from you on ${n.act > 1 ? "them" : "it"}. ${n.act > 1 ? "They're" : "It's"} at the top of the list.</div>` : ""}
    <div class="stats"><div class="stat"><b>${rows.length}</b><span>Leads referred</span></div><div class="stat"><b>${n.open}</b><span>Still open</span></div>
      <div class="stat"><b>${n.won}</b><span>Finalized or completed</span></div><div class="stat"><b>${money(n.paid)}</b><span>Paid by your clients</span></div></div>
    <div class="row sp"><div class="seg" id="seg">${[["all", "All"], ["act", "Sent back to me"], ["open", "Open"], ["won", "Finalized / completed"], ["closed", "Not proceeding"]].map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${t}</button>`).join("")}</div>
      <input id="q" type="search" placeholder="Search name, phone, service, L-number…" value="${esc(search)}" style="max-width:280px"></div>
    <div id="tbl"></div></div>`;
  $("#add").onclick = () => go("new");
  $("#seg").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; $("#seg").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); table(); };
  $("#q").oninput = (e) => { search = e.target.value; table(); };
  table();
}
function table() {
  const f = search.trim().toLowerCase();
  const L = rows.filter((l) => filter === "all" || (filter === "act" ? l.action_needed : filter === "open" ? isOpen(l) : filter === "won" ? ["finalized", "completed"].includes(l.status) : l.status === "closed"))
    .filter((l) => !f || [l.ref, l.client_name, l.phone, l.whatsapp, l.email, l.service, l.location].some((x) => String(x || "").toLowerCase().includes(f)));
  $("#tbl").innerHTML = L.length ? `<div class="tbl"><table><thead><tr><th>Lead</th><th>Client</th><th>Service</th><th>Status</th><th>RCIC</th><th>Paid</th><th>Last update</th></tr></thead><tbody>
    ${L.map((l) => `<tr class="click${l.action_needed ? " act" : updated(l) ? " upd" : ""}" data-id="${esc(l.id)}" tabindex="0"><td><b>${esc(l.ref)}</b>${l.action_needed ? `<br><span class="pill act">Action needed</span>` : updated(l) ? `<br><span class="pill s-process">Updated</span>` : ""}</td>
      <td><b>${esc(l.client_name)}</b><br><span class="muted">${esc(l.phone || l.whatsapp || l.email || "")}</span></td><td>${esc(l.service)}</td><td>${pill(l)}</td>
      <td>${l.rcic_attached ? "Attached" : `<span class="muted">Not yet</span>`}</td>
      <td>${l.paid_cents ? money(l.paid_cents) : `<span class="muted">–</span>`}${l.fee_cents ? `<br><span class="muted">of ${money(l.fee_cents)}</span>` : ""}</td><td>${when(l.updated)}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="card"><p style="margin:0" class="muted">${rows.length ? "No lead matches." : "No leads yet. Press New lead to refer your first client."}</p></div>`;
  $("#tbl").querySelectorAll("[data-id]").forEach((tr) => { tr.onclick = () => go(tr.dataset.id); tr.onkeydown = (e) => { if (e.key === "Enter") go(tr.dataset.id); }; });
}

/* ---------- new lead / edit ---------- */
function fieldsHtml(l = {}) {
  return `<div class="grid">
    <div class="f"><label for="lName">Client's full name *</label><input id="lName" maxlength="120" value="${esc(l.client_name || "")}"></div>
    <div class="f"><label for="lService">Service needed *</label><select id="lService"><option value="">Choose…</option>${services.map((s) => `<option${s === l.service ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
    <div class="f"><label for="lPhone">Phone (with country code)</label><input id="lPhone" type="tel" maxlength="40" value="${esc(l.phone || "")}" placeholder="+1 780 555 0100"></div>
    <div class="f"><label for="lWa">WhatsApp number or username</label><input id="lWa" maxlength="60" value="${esc(l.whatsapp || "")}"></div>
    <div class="f"><label for="lEmail">Email</label><input id="lEmail" type="email" maxlength="160" value="${esc(l.email || "")}"></div>
    <div class="f"><label for="lLoc">Where the client is (city, province or country)</label><input id="lLoc" maxlength="160" value="${esc(l.location || "")}"></div>
    <div class="f full"><label for="lDet">Details</label><span class="help">Current status in Canada, permit expiry, what they've tried, best time to call, anything that helps.</span><textarea id="lDet" maxlength="4000" rows="5">${esc(l.details || "")}</textarea></div></div>`;
}
const readFields = () => ({ client_name: $("#lName").value, service: $("#lService").value, phone: $("#lPhone").value, whatsapp: $("#lWa").value, email: $("#lEmail").value, location: $("#lLoc").value, details: $("#lDet").value });
function newLead() {
  view.innerHTML = `<div class="stack" style="max-width:820px">
    <div><button class="linkbtn" type="button" id="back">← My leads</button><h1 style="margin-top:8px">New lead</h1><p class="lede">WorkerPool contacts the client and keeps this lead updated here until the service is complete.</p></div>
    <form class="card" id="fLead" novalidate>${fieldsHtml()}
      <div class="f"><label for="lCv">Client's CV / resume (optional)</label><span class="help">PDF, Word (DOC, DOCX), JPG or PNG, up to 10 MB.</span><input id="lCv" type="file" accept="${FILE_TYPES}"></div>
      <label class="cb"><input type="checkbox" id="lConsent"><span>The client agreed to be referred to WorkerPool and to be contacted about this service. *</span></label>
      <div class="err" id="lErr"></div><div class="row"><button class="btn" type="submit">Send lead to WorkerPool</button><button class="btn ghost" type="button" id="cancel">Cancel</button></div></form></div>`;
  $("#back").onclick = $("#cancel").onclick = () => go("");
  $("#fLead").onsubmit = async (e) => {
    e.preventDefault(); $("#lErr").textContent = "";
    const btn = e.submitter || $("#fLead button[type=submit]"); btn.disabled = true;
    const cv = $("#lCv").files[0];
    if (cv && cv.size > 10 * 1024 * 1024) { $("#lErr").textContent = "The CV is over 10 MB. Compress it or save it as a smaller PDF."; btn.disabled = false; return; }
    try {
      const j = await api("lead", { ...readFields(), consent: $("#lConsent").checked });
      let msg = `Lead ${j.ref} sent to WorkerPool.`;
      if (cv) { btn.textContent = "Uploading the CV…"; const e2 = await upload(j.id, cv, "cv"); msg += e2 ? ` The CV didn't upload (${e2}). Add it again below.` : " CV attached."; }
      history.replaceState(null, "", "?id=" + j.id); lead(j.id, msg);
    }
    catch (x) { $("#lErr").textContent = x.message; btn.disabled = false; }
  };
}

/* ---------- one lead ---------- */
async function lead(id, flash = "") {
  let j;
  try { j = await api("item?id=" + encodeURIComponent(id)); } catch (e) { if (e.message !== "auth") view.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><button class="btn ghost" type="button" onclick="history.back()">Back</button></div>`; return; }
  const l = j.lead, canEdit = l.status === "new" || l.action_needed;
  const bal = l.fee_cents ? l.fee_cents - (l.paid_cents || 0) : null;
  const evIcon = { created: "Lead created", status: "Status", payment: "Payment", fee: "Fee", rcic: "RCIC", sendback: "Sent back to you", reply: "Your reply", comment: "Comment", edit: "Details updated", file: "File" };
  view.innerHTML = `<div class="stack">
    <div><button class="linkbtn" type="button" id="back">← My leads</button>
      <div class="row sp" style="margin-top:8px"><div><span class="eyebrow">${esc(l.ref)} · referred ${day(l.created)}</span><h1>${esc(l.client_name)}</h1><p class="lede" style="margin-top:4px">${esc(l.service)}</p></div><div>${pill(l)}</div></div></div>
    ${flash ? `<div class="note">${esc(flash)}</div>` : ""}
    ${l.action_needed ? `<div class="note warn"><b>WorkerPool sent this lead back to you${l.action_at ? " on " + day(l.action_at) : ""}:</b><div style="white-space:pre-wrap;margin:6px 0">${esc(l.action_msg)}</div>Do what's asked, then write your comment below and press <b>Done, send back to WorkerPool</b>.${canEdit ? " You can also correct the client's details." : ""}</div>` : ""}
    <div class="two">
      <div class="stack">
        <div class="card"><div class="row sp"><h2>Client</h2>${canEdit ? `<button class="btn ghost sm" type="button" id="edit">Edit details</button>` : ""}</div>
          <div id="det"><dl class="ro"><dt>Phone</dt><dd>${esc(l.phone || "–")}</dd><dt>WhatsApp</dt><dd>${esc(l.whatsapp || "–")}</dd><dt>Email</dt><dd>${esc(l.email || "–")}</dd>
          <dt>Location</dt><dd>${esc(l.location || "–")}</dd><dt>Service</dt><dd>${esc(l.service)}</dd><dt>Details</dt><dd>${esc(l.details || "–")}</dd></dl></div></div>
        <div class="card"><h2>Comments and updates</h2>
          <ul class="tl">${j.events.map((e) => `<li class="${e.kind === "sendback" ? "sendback" : e.who}"><small>${e.who === "manager" ? "You" : "WorkerPool"} · ${esc(evIcon[e.kind] || "Update")} · ${when(e.created)}</small>${esc(e.text)}</li>`).join("")}</ul>
          <div class="f"><label for="cText">${l.action_needed ? "Your reply to WorkerPool" : "Add a comment for WorkerPool"}</label><textarea id="cText" rows="3" maxlength="4000"></textarea></div>
          <div class="err" id="cErr"></div>
          <div class="row">${l.action_needed ? `<button class="btn" type="button" id="cDone">Done, send back to WorkerPool</button><button class="btn ghost" type="button" id="cSend">Comment only</button>` : `<button class="btn" type="button" id="cSend">Add comment</button>`}</div></div>
      </div>
      <div class="stack">
        <div class="card"><h2>Progress</h2>
          <dl class="ro"><dt>Status</dt><dd>${pill(l)}</dd><dt>RCIC attached</dt><dd>${l.rcic_attached ? "Yes" : "Not yet"}</dd>
            ${l.finalized_at ? `<dt>Finalized</dt><dd>${day(l.finalized_at)}</dd>` : ""}${l.closed_at ? `<dt>${l.status === "completed" ? "Completed" : "Closed"}</dt><dd>${day(l.closed_at)}</dd>` : ""}</dl></div>
        <div class="card"><h2>Payments from the client</h2>
          <div class="money"><div><span class="muted">Fee</span><b>${l.fee_cents ? money(l.fee_cents) : "–"}</b></div><div><span class="muted">Received</span><b>${money(l.paid_cents)}</b></div>${bal !== null ? `<div><span class="muted">Balance</span><b>${money(Math.max(0, bal))}</b></div>` : ""}</div>
          ${j.payments.length ? `<div class="tbl"><table style="min-width:0"><thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead><tbody>${j.payments.map((p) => `<tr><td>${day(p.received_on)}</td><td>${money(p.amount_cents)}</td><td>${esc(p.method)}${p.note ? `<br><span class="muted">${esc(p.note)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="margin:0">No payments recorded yet.</p>`}</div>
        <div class="card"><h2>CV and files</h2>
          ${j.files.length ? `<ul class="tl">${j.files.map((x) => `<li class="${x.by === "manager" ? "manager" : "admin"}"><small>${x.kind === "cv" ? "CV" : "File"} · ${x.by === "manager" ? "added by you" : "added by WorkerPool"} · ${when(x.created)} · ${kb(x.size)}</small>
            <a href="/api/leads/file?fid=${esc(x.id)}" target="_blank" rel="noopener">${esc(x.name)}</a>${x.by === "manager" ? ` · <button class="linkbtn" type="button" data-rm="${esc(x.id)}">Remove</button>` : ""}</li>`).join("")}</ul>` : `<p class="muted" style="margin:0">No CV yet.</p>`}
          <div class="row"><label class="btn ghost sm" style="cursor:pointer">${j.files.some((x) => x.kind === "cv") ? "Add another file" : "Upload the client's CV"}<input type="file" id="fUp" accept="${FILE_TYPES}" hidden></label><span class="muted">PDF, DOC, DOCX, JPG or PNG · 10 MB</span></div>
          <div class="err" id="fErr" style="min-height:0"></div></div>
      </div></div></div>`;
  $("#back").onclick = () => go("");
  $("#fUp").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { $("#fErr").textContent = "That file is over 10 MB."; return; }
    $("#fErr").textContent = "Uploading…";
    const err = await upload(id, file, j.files.some((x) => x.kind === "cv") ? "file" : "cv");
    if (err) $("#fErr").textContent = err; else lead(id, "File uploaded.");
  };
  view.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { if (!confirm("Remove this file?")) return; try { await api("file-delete", { id, fid: b.dataset.rm }); lead(id, "File removed."); } catch (x) { $("#fErr").textContent = x.message; } });
  const ed = $("#edit"); if (ed) ed.onclick = () => {
    $("#det").innerHTML = `<form id="fEd" class="stack" novalidate>${fieldsHtml(l)}<div class="err" id="eErr"></div><div class="row"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="eCancel">Cancel</button></div></form>`;
    ed.hidden = true; $("#eCancel").onclick = () => lead(id);
    $("#fEd").onsubmit = async (e) => { e.preventDefault(); try { await api("edit", { id, ...readFields() }); lead(id, "Details saved."); } catch (x) { $("#eErr").textContent = x.message; } };
  };
  const send = async (done) => {
    $("#cErr").textContent = "";
    try { await api("comment", { id, text: $("#cText").value, done }); lead(id, done ? "Sent back to WorkerPool. Thank you." : "Comment added."); }
    catch (x) { $("#cErr").textContent = x.message; }
  };
  $("#cSend").onclick = () => send(false);
  const dn = $("#cDone"); if (dn) dn.onclick = () => send(true);
}

boot();
