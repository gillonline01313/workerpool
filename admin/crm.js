/* Admin → CRM. Punch every query with the person's phone number and the date; the same number (or email) next time adds
   to the same person's history. Each person keeps: dated calls / emails / WhatsApps / queries, retention with WorkerPool
   and service type, RCIC retention, intake forms sent from here (with their progress), and internal WorkerPool notes.
   Loaded by admin/index.html; server: functions/api/crm/[[path]].js. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const day = (t) => t ? new Date(t).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "–";
  const when = (t) => t ? new Date(t).toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
  const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const toIso = (v) => { const t = new Date(v); return isNaN(t) ? new Date().toISOString() : t.toISOString(); };
  const digits = (p) => String(p || "").replace(/\D/g, "");
  const ST_CLS = { new: "new", "follow-up": "edit", retained: "ok", "in-progress": "ok", submitted: "ok", done: "", lost: "" };
  const ICON = { query: "❓", call: "📞", email: "✉️", whatsapp: "💬", meeting: "🤝", note: "📝", retained: "✅", rcic: "🧑‍⚖️", intake: "📋", status: "🔄", form: "📄" };
  const TYPE_LABEL = { query: "Query", call: "Call", email: "Email", whatsapp: "WhatsApp", meeting: "Meeting", note: "Internal note", retained: "Retained", rcic: "RCIC retained", intake: "Intake form", status: "Update", form: "Intake form" };
  let KEY = "", body = null, C = null;
  const S = { list: null, q: "", st: "all", svc: "", open: null, item: null, act: null, busy: false, look: null, draft: null };

  const css = `
.crm{display:flex;flex-direction:column;gap:16px}
.crm .g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media (max-width:900px){.crm .g{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.crm .g{grid-template-columns:1fr}}
.crm label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)}
.crm .full{grid-column:1/-1}
.crm .in{font:inherit;font-size:.9rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg);width:100%;min-width:0}
.crm textarea.in{resize:vertical;min-height:70px}
.crm .btn{font:inherit;font-weight:600;font-size:.86rem;padding:9px 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer;display:inline-flex;gap:6px;align-items:center;text-decoration:none}
.crm .btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}
.crm .btn.sm{padding:6px 12px;font-size:.8rem}
.crm .btn.red{background:transparent;color:#b3412e;border-color:#b3412e}
.crm .btn:disabled{opacity:.55;cursor:not-allowed}
.crm .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.crm .sp{justify-content:space-between}
.crm .note{font-size:.8rem;color:var(--muted)}
.crm .err{color:#b3412e;font-size:.85rem;min-height:1.1em}
.crm .hit{border:2px solid var(--accent);background:var(--accent-soft);border-radius:12px;padding:10px 12px;font-size:.88rem}
.crm .b{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.crm .b.new{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.crm .b.ok{background:var(--accent-soft);color:var(--fg);border-color:transparent}
.crm .b.edit{background:#f6ebdc;color:#7a4a17;border-color:transparent}
@media (prefers-color-scheme:dark){.crm .b.edit{background:#33281b;color:#e3b27c}}
.crm tr.click{cursor:pointer}.crm tr.click:hover td{background:var(--accent-soft)}
.crm .tl{display:flex;flex-direction:column}
.crm .ev{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.crm .ev:last-child{border-bottom:0}
.crm .ev .ic{width:30px;height:30px;border-radius:50%;background:var(--accent-soft);display:grid;place-items:center;font-size:.9rem}
.crm .ev.note .ic{background:#f6ebdc}
.crm .ev .t{font-size:.8rem;color:var(--muted)}
.crm .ev .t b{color:var(--fg)}
.crm .ev .d{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9rem;margin-top:2px}
.crm .ev.note .d{background:#fbf6ee;border-radius:8px;padding:6px 9px}
@media (prefers-color-scheme:dark){.crm .ev.note .d{background:#2a241c}.crm .ev.note .ic{background:#33281b}}
.crm .x{border:0;background:none;color:var(--muted);cursor:pointer;font-size:.8rem;align-self:start}.crm .x:hover{color:#b3412e}
.crm .facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.crm .fact{border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:.86rem}
.crm .fact small{display:block;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:2px}
.crm .box{border:1px solid var(--accent);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;background:color-mix(in srgb,var(--accent-soft) 45%,transparent)}
.crm .meter{width:70px;height:7px;border-radius:4px;background:var(--line);overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}.crm .meter i{display:block;height:100%;background:var(--accent)}
`;
  function addCss() { if (document.getElementById("crmCss")) return; const s = document.createElement("style"); s.id = "crmCss"; s.textContent = css; document.head.appendChild(s); }
  async function call(path, b) {
    const r = await fetch("/api/crm/" + path, b ? { method: "POST", headers: { "x-admin-key": KEY, "content-type": "application/json" }, body: JSON.stringify(b) } : { headers: { "x-admin-key": KEY } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  const stLabel = (k) => (S.list && S.list.statuses[k]) || k || "–";
  const badge = (k) => `<span class="b ${ST_CLS[k] || ""}">${esc(stLabel(k))}</span>`;
  const datalists = () => `<datalist id="crmSvc">${(S.list ? S.list.services : []).map((s) => `<option value="${esc(s)}">`).join("")}</datalist>`;
  const chanOpts = (sel) => (S.list ? S.list.channels : ["Phone call"]).map((c) => `<option${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("");

  async function load(key, el) {
    KEY = key; body = el; addCss();
    if (!C) { try { C = await import("/assets/intake-config.js?v=11"); } catch (e) {} }
    if (S.busy) return;
    if (body.querySelector(".crm") && (S.open || document.activeElement && body.contains(document.activeElement))) return;   // don't redraw under the cursor on the minute refresh
    if (S.open) return openItem(S.open);
    await refresh(); draw();
  }
  async function refresh() { try { S.list = await call("list"); S.err = ""; } catch (e) { S.err = e.message; } }

  /* ---------- list + punch a query ---------- */
  function draw() {
    S.open = null; S.item = null;
    if (S.err && !S.list) { body.innerHTML = `<div class="wpa-empty">Couldn't load the CRM: ${esc(S.err)}</div>`; return; }
    const R = S.list.rows, d = S.draft || {};
    const counts = { all: R.length }; R.forEach((r) => counts[r.status] = (counts[r.status] || 0) + 1);
    const segs = [["all", "All"], ...Object.entries(S.list.statuses)].filter(([k]) => k === "all" || counts[k]);
    body.innerHTML = `<div class="crm">${datalists()}
      <div class="wpa-card wide"><h3>Punch a query</h3><p class="sub" style="margin:0">Phone number first: if they've contacted us before, this adds to their history instead of making a new person.</p>
        <form id="cqF" class="g" autocomplete="off">
          <label>Phone number *<input class="in" name="phone" type="tel" placeholder="+1 780 555 0101" value="${esc(d.phone || "")}" required></label>
          <label>Name<input class="in" name="name" placeholder="Full name" value="${esc(d.name || "")}"></label>
          <label>Email<input class="in" name="email" type="email" placeholder="name@email.com" value="${esc(d.email || "")}"></label>
          <label>How they reached us<select class="in" name="channel">${chanOpts(d.channel || "Phone call")}</select></label>
          <label>Date & time<input class="in" name="at" type="datetime-local" value="${esc(d.at || localNow())}"></label>
          <label>Service type<input class="in" name="service" list="crmSvc" placeholder="e.g. Work permit – LMIA" value="${esc(d.service || "")}"></label>
          <label class="full" style="grid-column:span 2">Location (optional)<input class="in" name="location" placeholder="e.g. Surrey, BC" value="${esc(d.location || "")}"></label>
          <label class="full">Their query<textarea class="in" name="detail" rows="3" placeholder="What did they ask? Any dates, refusals, deadlines…">${esc(d.detail || "")}</textarea></label>
          <div class="full" id="cqHit"></div>
          <div class="full row"><button class="btn" type="submit">Save query</button><span class="err" id="cqErr"></span></div>
        </form></div>
      <div class="wpa-card wide"><div class="row sp"><h3>People (${R.length})</h3>
          <div class="row"><input id="cS" class="in" type="search" placeholder="Search name, phone, email, RCIC…" value="${esc(S.q)}" style="width:240px">
          <select id="cSv" class="in" style="width:auto"><option value="">Every service</option>${[...new Set(R.map((r) => r.service).filter(Boolean))].sort().map((s) => `<option${s === S.svc ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div></div>
        <div class="wpa-seg" style="align-self:flex-start;flex-wrap:wrap">${segs.map(([k, l]) => `<button type="button" data-st="${k}" aria-pressed="${S.st === k}">${esc(l)} (${counts[k] || 0})</button>`).join("")}</div>
        ${S.list.synced ? `<div class="note">${S.list.synced} new website request${S.list.synced === 1 ? "" : "s"} added from the Candidates questionnaire.</div>` : ""}
        <div id="cList">${tableHtml()}</div></div></div>`;
    wireList();
  }
  function rowsFiltered() {
    const q = S.q.trim().toLowerCase(), qd = digits(q);
    return S.list.rows.filter((r) => (S.st === "all" || r.status === S.st) && (!S.svc || r.service === S.svc) &&
      (!q || [r.name, r.email, r.service, r.rcic_name, r.rcic_firm, r.location, r.pinned].some((x) => String(x || "").toLowerCase().includes(q)) || (qd.length >= 3 && digits(r.phone).includes(qd))));
  }
  function tableHtml() {
    const L = rowsFiltered();
    if (!L.length) return `<div class="wpa-empty">${S.list.rows.length ? "No one matches." : "No one yet. Punch the first query above."}</div>`;
    return `<div class="wpa-tbl"><table><thead><tr><th>Person</th><th>Service</th><th>Status</th><th>RCIC</th><th>Last contact</th><th>Contacts</th></tr></thead><tbody>
      ${L.slice(0, 500).map((r) => `<tr class="click" data-id="${r.id}" tabindex="0"><td><b>${esc(r.name || "(no name)")}</b><br><span class="note">${esc(r.phone || "")}${r.phone && r.email ? " · " : ""}${esc(r.email || "")}</span></td>
        <td>${esc(r.service || "–")}</td><td>${badge(r.status)}${r.intakes_sent ? `<br><span class="note">📋 ${r.intakes_sent} form${r.intakes_sent > 1 ? "s" : ""} sent</span>` : ""}</td>
        <td>${esc([r.rcic_name, r.rcic_firm].filter(Boolean).join(" – ") || "–")}</td>
        <td>${day(r.last_at || r.created)}${r.last_channel ? `<br><span class="note">${esc(r.last_channel)}</span>` : ""}</td><td>${r.touches || 0}</td></tr>`).join("")}
      </tbody></table></div>${L.length > 500 ? `<div class="note">Showing the first 500. Search to narrow it down.</div>` : ""}`;
  }
  let lookT = 0;
  function wireList() {
    const f = body.querySelector("#cqF"), hit = body.querySelector("#cqHit"), err = body.querySelector("#cqErr");
    const keep = () => { S.draft = Object.fromEntries(new FormData(f)); };
    const look = () => { clearTimeout(lookT); lookT = setTimeout(async () => {
      const phone = f.phone.value, email = f.email.value;
      if (digits(phone).length < 7 && !/@.+\./.test(email)) { hit.innerHTML = ""; return; }
      try { const j = await call(`lookup?phone=${encodeURIComponent(phone)}&email=${encodeURIComponent(email)}`); S.look = j.contact;
        hit.innerHTML = j.contact ? `<div class="hit">👤 <b>Already in the CRM: ${esc(j.contact.name || "(no name)")}</b> · ${esc(j.contact.phone || "")} ${esc(j.contact.email || "")} · ${badge(j.contact.status)}${j.contact.service ? ` · ${esc(j.contact.service)}` : ""}${j.contact.rcic_name ? ` · RCIC ${esc(j.contact.rcic_name)}` : ""}
          <br><span class="note">${j.contact.contacts} earlier contact${j.contact.contacts === 1 ? "" : "s"}, last ${day(j.contact.last_at)}. Saving adds this query to their history.</span> <button class="btn g sm" type="button" id="cqOpen">Open their file</button></div>` : `<div class="note">New person. Saving creates their file.</div>`;
        const o = hit.querySelector("#cqOpen"); if (o) o.onclick = () => openItem(j.contact.id);
        if (j.contact && !f.name.value.trim() && j.contact.name) f.name.placeholder = j.contact.name;
      } catch (e) {} }, 350); };
    f.addEventListener("input", (e) => { keep(); if (e.target.name === "phone" || e.target.name === "email") look(); });
    if (S.draft && (S.draft.phone || S.draft.email)) look();
    f.onsubmit = async (e) => {
      e.preventDefault(); err.textContent = "";
      const b = Object.fromEntries(new FormData(f)); b.at = toIso(b.at);
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      try { const j = await call("capture", b); S.draft = null; await refresh(); openItem(j.id, j.created ? "New person saved." : "Query added to their history."); }
      catch (x) { err.textContent = x.message; btn.disabled = false; }
    };
    const s = body.querySelector("#cS"); s.oninput = () => { S.q = s.value; body.querySelector("#cList").innerHTML = tableHtml(); wireRows(); };
    body.querySelector("#cSv").onchange = (e) => { S.svc = e.target.value; body.querySelector("#cList").innerHTML = tableHtml(); wireRows(); };
    body.querySelectorAll("[data-st]").forEach((b) => b.onclick = () => { S.st = b.dataset.st; draw(); });
    wireRows();
  }
  function wireRows() { body.querySelectorAll("tr[data-id]").forEach((tr) => { tr.onclick = () => openItem(tr.dataset.id); tr.onkeydown = (e) => { if (e.key === "Enter") openItem(tr.dataset.id); }; }); }

  /* ---------- one person ---------- */
  async function openItem(id, flash) {
    S.open = id; S.busy = true;
    if (!S.list) await refresh();
    try { S.item = await call("item?id=" + encodeURIComponent(id)); } catch (e) { S.busy = false; S.open = null; body.innerHTML = `<div class="wpa-empty">Couldn't open it: ${esc(e.message)}</div>`; return; }
    S.busy = false; S.flash = flash || ""; drawItem(); window.scrollTo(0, 0);
  }
  function timeline() {
    const it = S.item, ev = it.events.map((e) => ({ ...e }));
    for (const f of it.forms) {   // intake form milestones, read live from the intake forms
      ev.push({ type: "form", at: f.created, detail: `Started the ${f.form} form${f.name ? ` (applicant: ${f.name})` : ""}.`, ro: 1 });
      if (f.submitted) ev.push({ type: "form", at: f.submitted, detail: `Submitted the ${f.form} form${f.partial ? " (partial)" : ""}.`, ro: 1 });
      if (f.resubmitted) ev.push({ type: "form", at: f.resubmitted, detail: `Resubmitted the ${f.form} form.`, ro: 1 });
    }
    return ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function actBox() {
    const a = S.act, c = S.item.contact;
    if (!a) return "";
    const at = `<label>Date & time<input class="in" name="at" type="datetime-local" value="${localNow()}"></label>`;
    if (a === "log") return `<form class="box g" id="aF"><label>Type<select class="in" name="type"><option value="call">Call</option><option value="query">Query</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="meeting">Meeting</option></select></label>
      <label>Channel<select class="in" name="channel">${chanOpts("Phone call")}</select></label>${at}<span></span>
      <label class="full">What was it about?<textarea class="in" name="detail" rows="3"></textarea></label><div class="full row"><button class="btn" type="submit">Save</button><button class="btn g" type="button" data-cancel>Cancel</button><span class="err" id="aErr"></span></div></form>`;
    if (a === "note") return `<form class="box g" id="aF"><input type="hidden" name="type" value="note"><label class="full">Internal WorkerPool note (only the team sees this)<textarea class="in" name="detail" rows="3" placeholder="e.g. Prefers calls after 6 pm. Sister also interested in a super visa."></textarea></label>
      ${at}<div class="full row"><button class="btn" type="submit">Save note</button><button class="btn g" type="button" data-cancel>Cancel</button><span class="err" id="aErr"></span></div></form>`;
    if (a === "retain") return `<form class="box g" id="aF"><label>Service type<input class="in" name="service" list="crmSvc" value="${esc(c.service || "")}" required></label>
      <label>Fee (optional)<input class="in" name="fee" placeholder="e.g. $1,200 + GST" value="${esc(c.fee || "")}"></label>${at}<span></span>
      <label class="full">Notes (optional)<textarea class="in" name="detail" rows="2" placeholder="e.g. Retainer signed, first instalment received."></textarea></label><div class="full row"><button class="btn" type="submit">Mark retained</button><button class="btn g" type="button" data-cancel>Cancel</button><span class="err" id="aErr"></span></div></form>`;
    if (a === "rcic") return `<form class="box g" id="aF"><datalist id="crmRc">${S.list.rcics.map((r) => `<option value="${esc(r.name || r.firm)}" label="${esc([r.firm, r.licence].filter(Boolean).join(" · "))}">`).join("")}</datalist>
      <label>RCIC name<input class="in" name="name" list="crmRc" value="${esc(c.rcic_name || "")}" placeholder="e.g. Gurdeep Singh Sidhu"></label>
      <label>Firm<input class="in" name="firm" value="${esc(c.rcic_firm || "")}" placeholder="e.g. Flying Falcon Immigration"></label>
      <label>Licence # (optional)<input class="in" name="licence" value="${esc(c.rcic_licence || "")}" placeholder="R123456"></label>${at}
      <label class="full">Notes (optional)<textarea class="in" name="detail" rows="2" placeholder="e.g. Use-of-representative form signed."></textarea></label><div class="full row"><button class="btn" type="submit">Save RCIC retention</button><button class="btn g" type="button" data-cancel>Cancel</button><span class="err" id="aErr"></span></div></form>`;
    if (a === "intake") {
      const cats = C ? C.CATALOG : [];
      return `<form class="box g" id="aF"><label class="full">Intake form<select class="in" name="form" required><option value="">Choose a form…</option>${cats.map((cat) => cat.groups.map((g) => `<optgroup label="${esc(cat.label.replace(" applications", ""))} · ${esc(g.label)}">${g.forms.filter((f) => C.FORMS[f.key]).map((f) => `<option value="${f.key}">${esc(f.name)}</option>`).join("")}</optgroup>`).join("")).join("")}</select></label>
        <label style="grid-column:span 2">Their email<input class="in" name="email" type="email" value="${esc(c.email || "")}" placeholder="name@email.com"></label>
        <label style="flex-direction:row;align-items:center;gap:6px;grid-column:span 2"><input type="checkbox" name="send" checked> Email them the link</label>
        <div class="full row"><button class="btn" type="submit">Create link & send</button><button class="btn g" type="button" data-cancel>Cancel</button><span class="err" id="aErr"></span></div></form>`;
    }
    if (a === "edit") return `<form class="box g" id="aF"><label>Name<input class="in" name="name" value="${esc(c.name || "")}"></label><label>Phone<input class="in" name="phone" type="tel" value="${esc(c.phone || "")}"></label>
      <label>Email<input class="in" name="email" type="email" value="${esc(c.email || "")}"></label><label>Location<input class="in" name="location" value="${esc(c.location || "")}"></label>
      <label>Status<select class="in" name="status">${Object.entries(S.list.statuses).map(([k, l]) => `<option value="${k}"${c.status === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label>Service type<input class="in" name="service" list="crmSvc" value="${esc(c.service || "")}"></label>
      <div class="full row"><button class="btn" type="submit">Save</button><button class="btn g" type="button" data-cancel>Cancel</button><span class="err" id="aErr"></span></div></form>`;
    return "";
  }
  function drawItem() {
    const { contact: c, invites, forms } = S.item, ph = digits(c.phone);
    const T = timeline();
    body.innerHTML = `<div class="crm">${datalists()}
      <div class="row sp"><button class="btn g sm" type="button" id="cBack">← All people</button>${S.flash ? `<span class="note" style="color:var(--accent);font-weight:600">✓ ${esc(S.flash)}</span>` : ""}</div>
      <div class="wpa-card wide">
        <div class="row sp" style="align-items:flex-start"><div><h3 style="font-size:1.35rem">${esc(c.name || "(no name)")}</h3>
            <div style="font-size:.9rem;margin-top:4px">${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a> · <a href="https://wa.me/${esc(ph.length === 10 ? "1" + ph : ph)}" target="_blank" rel="noopener">WhatsApp</a>` : "No phone"}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}${c.location ? ` · ${esc(c.location)}` : ""}</div>
            <div class="note" style="margin-top:4px">In the CRM since ${day(c.created)}${c.source ? ` (${esc(c.source)})` : ""}</div></div>
          <div class="row">${badge(c.status)}<button class="btn g sm" type="button" data-a="edit">Edit details</button></div></div>
        <div class="facts">
          <div class="fact"><small>Service type</small>${esc(c.service || "–")}</div>
          <div class="fact"><small>Retained WorkerPool</small>${c.retained_at ? `✅ ${day(c.retained_at)}${c.fee ? ` · ${esc(c.fee)}` : ""}` : "Not yet"}</div>
          <div class="fact"><small>RCIC retained</small>${c.rcic_name || c.rcic_firm ? `${esc([c.rcic_name, c.rcic_firm].filter(Boolean).join(" – "))}${c.rcic_licence ? ` · ${esc(c.rcic_licence)}` : ""}<br><span class="note">${day(c.rcic_at)}</span>` : "Not yet"}</div>
          <div class="fact"><small>Last contact</small>${day(c.last_at)}</div></div>
        <div class="row"><button class="btn" type="button" data-a="log">+ Log a call / query / email</button><button class="btn g" type="button" data-a="note">📝 Internal note</button>
          <button class="btn g" type="button" data-a="retain">${c.retained_at ? "✅ Update retention" : "✅ Mark retained"}</button><button class="btn g" type="button" data-a="rcic">🧑‍⚖️ RCIC retained</button><button class="btn g" type="button" data-a="intake">📋 Send intake form</button></div>
        <div id="cAct">${actBox()}</div></div>
      <div class="wpa-card wide"><div class="row sp"><h3>Pinned internal notes</h3><span class="note">Only the WorkerPool team sees these</span></div>
        <textarea class="in" id="cPin" rows="3" placeholder="Key facts to see first every time: family members, deadlines, what was promised…" style="font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg)">${esc(c.pinned || "")}</textarea>
        <div class="row"><button class="btn g sm" type="button" id="cPinS">Save pinned notes</button><span class="note" id="cPinM"></span></div></div>
      ${invites.length || forms.length ? `<div class="wpa-card wide"><h3>Intake forms</h3>
        ${forms.length ? `<div class="wpa-tbl"><table><thead><tr><th>Form</th><th>Applicant</th><th>Progress</th><th>Status</th><th></th></tr></thead><tbody>${forms.map((f) => `<tr><td>${esc(f.form)}</td><td>${esc(f.name || "–")}</td>
          <td><span class="meter"><i style="width:${f.progress || 0}%"></i></span>${f.progress || 0}%${f.partial && f.status === "submitted" ? " · partial" : ""}</td><td>${f.status === "submitted" ? `Submitted ${day(f.resubmitted || f.submitted)}` : f.status === "editing" ? "Client editing" : `Filling · ${day(f.updated)}`}</td>
          <td><button class="btn g sm" type="button" data-form="${f.id}">Open</button></td></tr>`).join("")}</tbody></table></div>` : ""}
        ${invites.filter((v) => !forms.some((f) => f.invite_code === v.code)).map((v) => `<div class="row sp" style="font-size:.88rem;border-top:1px solid var(--line);padding-top:8px"><span>📋 <b>${esc(C && C.FORMS[v.form_key] ? C.FORMS[v.form_key].name : v.form_key)}</b> · link sent ${day(v.created)} · ${v.opens ? `opened ${v.opens}×, last ${day(v.last_open)}` : "not opened yet"}${v.archived ? " · turned off" : ""}</span>
          <span class="row"><button class="btn g sm" type="button" data-cp="${esc(S.item.link + "/intake/?i=" + v.code)}">Copy link</button>${c.phone ? `<a class="btn g sm" target="_blank" rel="noopener" href="https://wa.me/${esc(ph.length === 10 ? "1" + ph : ph)}?text=${encodeURIComponent(`Please fill your form here: ${S.item.link}/intake/?i=${v.code}`)}">WhatsApp</a>` : ""}</span></div>`).join("")}</div>` : ""}
      <div class="wpa-card wide"><h3>History (${T.length})</h3><div class="tl">${T.length ? T.map((e) => `<div class="ev ${e.type}"><div class="ic">${ICON[e.type] || "•"}</div>
          <div><div class="t"><b>${esc(TYPE_LABEL[e.type] || e.type)}</b>${e.channel ? ` · ${esc(e.channel)}` : ""} · ${when(e.at)}</div>${e.detail ? `<div class="d">${esc(e.detail)}</div>` : ""}
          ${e.meta && e.meta.link ? `<div class="row" style="margin-top:4px"><button class="btn g sm" type="button" data-cp="${esc(e.meta.link)}">Copy form link</button></div>` : ""}</div>
          ${e.ro || !e.id ? "<span></span>" : `<button class="x" type="button" data-del="${e.id}" title="Delete this entry">✕</button>`}</div>`).join("") : `<div class="note">Nothing yet.</div>`}</div></div>
      <div class="wpa-card wide"><div class="row sp"><span class="note">Delete this person and their whole history (intake forms stay in Intake forms).</span><button class="btn red sm" type="button" id="cDel">Delete person</button></div></div></div>`;
    wireItem();
  }
  function wireItem() {
    const c = S.item.contact, $ = (s) => body.querySelector(s), again = async (msg) => { S.act = null; await refresh(); openItem(c.id, msg); };
    $("#cBack").onclick = async () => { S.act = null; await refresh(); draw(); };
    body.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { S.act = S.act === b.dataset.a ? null : b.dataset.a; drawItem(); const f = $("#aF"); if (f) { const t = f.querySelector("textarea,select,input:not([type=hidden])"); if (t) t.focus(); } });
    const f = $("#aF");
    if (f) {
      f.querySelector("[data-cancel]").onclick = () => { S.act = null; drawItem(); };
      f.onsubmit = async (e) => {
        e.preventDefault(); const b = Object.fromEntries(new FormData(f)); b.id = c.id; if (b.at) b.at = toIso(b.at);
        const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
        try {
          if (S.act === "log" || S.act === "note") { await call("event", b); return again(S.act === "note" ? "Note saved." : "Added to their history."); }
          if (S.act === "retain") { await call("retain", b); return again("Marked retained."); }
          if (S.act === "rcic") { await call("rcic", b); return again("RCIC retention saved."); }
          if (S.act === "edit") { await call("update", b); return again("Details saved."); }
          if (S.act === "intake") { b.send = !!f.send.checked; const j = await call("intake", b); try { await navigator.clipboard.writeText(j.link); } catch (x) {}
            return again(j.emailed ? `Intake link emailed to ${b.email} (and copied).` : "Intake link created and copied. Send it on WhatsApp or by email."); }
        } catch (x) { btn.disabled = false; $("#aErr").textContent = x.message; }
      };
    }
    $("#cPinS").onclick = async () => { try { await call("update", { id: c.id, pinned: $("#cPin").value }); c.pinned = $("#cPin").value; $("#cPinM").textContent = "Saved ✓"; } catch (x) { $("#cPinM").textContent = x.message; } };
    body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { if (!confirm("Delete this entry from their history?")) return; await call("event-delete", { id: c.id, eid: b.dataset.del }); again("Entry deleted."); });
    body.querySelectorAll("[data-cp]").forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.cp); b.textContent = "Copied ✓"; } catch (x) { prompt("Copy this link:", b.dataset.cp); } });
    body.querySelectorAll("[data-form]").forEach((b) => b.onclick = () => { if (window.WPIntake && window.WPIntake.focus) window.WPIntake.focus(b.dataset.form); const t = document.querySelector('[data-t="intake"]'); if (t) t.click(); });
    $("#cDel").onclick = async () => { if (!confirm(`Delete ${c.name || "this person"} and their whole history? This can't be undone.`)) return; await call("delete", { id: c.id }); S.act = null; await refresh(); draw(); };
  }
  function leave() { S.open = null; S.item = null; S.act = null; S.list = null; S.draft = null; }
  window.WPCrm = { load, leave };
})();
