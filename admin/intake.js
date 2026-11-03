/* Admin → Intake forms. Pick an application type (Temporary / Permanent, then Outside / Inside Canada),
   copy its client link (or make a personal link for one client), and open every form clients fill:
   answers, missing items and uploaded documents. Loaded by admin/index.html. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB";
  const when = (t) => t ? new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
  const STATUS = [["new", "New"], ["reviewing", "Reviewing"], ["need-info", "Waiting for client"], ["in-progress", "Preparing application"], ["done", "Done"]];
  const stLabel = (k) => (STATUS.find((s) => s[0] === k) || [0, k])[1];
  let C = null, KEY = "", body = null, S = { pick: "trv-out", filter: "new", q: "", open: null, item: null, list: null, made: null, busy: false };

  const css = `
.ik-wrap{display:flex;flex-direction:column;gap:16px}
.ik-cats{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:820px){.ik-cats{grid-template-columns:1fr}}
.ik-cat h3{display:flex;align-items:center;gap:8px}
.ik-grp{display:flex;flex-direction:column;gap:6px}
.ik-grp>small{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-top:4px}
.ik-forms{display:flex;flex-wrap:wrap;gap:6px}
.ik-f{font:inherit;font-size:.84rem;font-weight:600;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:10px;padding:7px 11px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.ik-f.soon{color:var(--muted);font-weight:500}
.ik-f.soon::after{content:"Soon";font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--line);border-radius:999px;padding:0 6px}
.ik-f.ready::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent)}
.ik-f[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent)}
.ik-link{border:2px solid var(--accent);background:var(--accent-soft);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;animation:ikGlow 1.4s ease-out 1}
@keyframes ikGlow{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}100%{box-shadow:0 0 0 14px transparent}}
@media (prefers-reduced-motion:reduce){.ik-link{animation:none}}
.ik-link h3{margin:0}
.ik-url{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ik-url input{flex:1;min-width:220px;font:inherit;font-size:.92rem;font-weight:600;padding:10px 12px;border:1px solid var(--accent);border-radius:10px;background:var(--surface);color:var(--fg)}
.ik-btn{font:inherit;font-weight:600;font-size:.85rem;padding:9px 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.ik-btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}
.ik-btn.red{background:transparent;color:#b3412e;border-color:#b3412e}
.ik-btn:disabled{opacity:.55;cursor:not-allowed}
.ik-inv{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end}
@media (max-width:760px){.ik-inv{grid-template-columns:1fr}}
.ik-inv label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)}
.ik-in{font:inherit;font-size:.88rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg);width:100%}
.ik-note{font-size:.8rem;color:var(--muted)}
.ik-row{cursor:pointer}
.ik-row:hover td{background:var(--accent-soft)}
.ik-row.new td{background:color-mix(in srgb,var(--accent) 12%,transparent);font-weight:600}
.ik-row.new td:first-child{box-shadow:inset 4px 0 0 var(--accent)}
.ik-badge{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.ik-badge.new{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.ik-badge.sub{background:var(--accent-soft);color:var(--fg);border-color:transparent}
.ik-badge.edit{background:#f6ebdc;color:#7a4a17;border-color:transparent}
.ik-meter{width:80px;height:7px;border-radius:4px;background:var(--line);overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}
.ik-meter i{display:block;height:100%;background:var(--accent)}
.ik-top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.ik-acts{display:flex;gap:8px;flex-wrap:wrap}
.ik-sec{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--surface)}
.ik-sec h4{margin:0 0 10px;font-family:var(--display);font-size:.98rem}
.ik-dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:5px 16px;margin:0;font-size:.86rem}
.ik-dl dt{color:var(--muted)}.ik-dl dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-width:620px){.ik-dl{grid-template-columns:1fr}.ik-dl dd{margin-bottom:6px}}
.ik-rep{border-top:1px dashed var(--line);padding-top:8px;margin-top:8px}
.ik-rep:first-of-type{border-top:0;margin-top:0;padding-top:0}
.ik-doc{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:.86rem;flex-wrap:wrap}
.ik-doc:last-child{border-bottom:0}
.ik-doc .n{min-width:0;overflow-wrap:anywhere}
.ik-miss{background:#f6ebdc;color:#5a3a12;border-radius:12px;padding:12px 14px;font-size:.86rem}
.ik-miss ul{margin:6px 0 0;padding-left:18px;max-height:200px;overflow:auto}
@media (prefers-color-scheme:dark){.ik-miss{background:#33281b;color:#f0d8b8}.ik-badge.edit{background:#33281b;color:#e3b27c}}
`;
  function addCss() { if (document.getElementById("ikCss")) return; const s = document.createElement("style"); s.id = "ikCss"; s.textContent = css; document.head.appendChild(s); }

  async function call(path, opts = {}) {
    const r = await fetch("/api/intake/admin/" + path, { ...opts, headers: { "x-admin-key": KEY, "Content-Type": "application/json", ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  const post = (path, b) => call(path, { method: "POST", body: JSON.stringify(b) });
  async function cfg() { if (!C) C = await import("/assets/intake-config.js?v=2"); return C; }
  const site = () => location.origin;
  const genLink = (k) => `${site()}/intake/?f=${encodeURIComponent(k)}`;
  const formName = (k) => (C.FORMS[k] && C.FORMS[k].name) || ((C.catalogEntry(k) || {}).form || {}).name || k;

  /* ---------- badge on the tab ---------- */
  let bIv = null;
  async function badge(key) {
    if (key) KEY = key;
    const t = document.getElementById("inTab"); if (!t || !KEY) return;
    try { const j = await call("count"); t.textContent = j.unseen ? `Intake forms (${j.unseen} new)` : "Intake forms"; t.style.fontWeight = j.unseen ? "700" : ""; } catch (e) {}
    if (!bIv) bIv = setInterval(() => { if (!document.hidden) badge(); }, 60000);
  }

  /* ---------- main view ---------- */
  async function load(key, el) {
    KEY = key; body = el; addCss(); await cfg();
    if (S.busy) return;
    if (S.open) { if (!S.item) await openItem(S.open); else if (!body.querySelector("#ikBack")) drawItem(); return; }   // keep the open form steady during the minute refresh
    try { S.list = await call("list"); } catch (e) { body.innerHTML = `<div class="wpa-empty">Couldn't load intake forms: ${esc(e.message)}</div>`; return; }
    if (body.querySelector("#ikLinkWrap")) drawList(); else draw();
    badge();
  }
  function catalogHtml() {
    return `<div class="ik-cats">${C.CATALOG.map((c) => `<div class="wpa-card ik-cat"><h3>${esc(c.label)}</h3>
      ${c.groups.map((g) => `<div class="ik-grp"><small>${esc(g.label)}</small><div class="ik-forms">
        ${g.forms.map((f) => `<button type="button" class="ik-f ${C.FORMS[f.key] ? "ready" : "soon"}" data-pick="${f.key}" aria-pressed="${S.pick === f.key}">${esc(f.name)}</button>`).join("")}
      </div></div>`).join("")}</div>`).join("")}</div>`;
  }
  function linkHtml() {
    const k = S.pick, e = C.catalogEntry(k);
    if (!e) return "";
    const where = `${e.cat.label.replace(" applications", "")} · ${e.group.label}`;
    if (!C.FORMS[k]) return `<div class="wpa-card"><h3>${esc(e.form.name)}</h3><p class="ik-note" style="margin:0">${esc(where)}. This intake form isn't built yet. Visitor visa (TRV) from outside Canada is ready now; the others will be added one by one.</p></div>`;
    const f = C.FORMS[k], made = S.made && S.made.f === k ? S.made : null;
    const invites = ((S.list && S.list.invites) || []).filter((v) => v.form_key === k);
    const wa = (u) => `https://wa.me/?text=${encodeURIComponent(`Please fill your ${f.name} form here: ${u}`)}`;
    return `<div class="ik-link" id="ikLink">
      <div><small class="ik-note">${esc(where)}</small><h3>${esc(f.name)}: client link</h3></div>
      <div class="ik-url"><input readonly id="ikGen" value="${esc(genLink(k))}" aria-label="Client link"><button class="ik-btn" type="button" data-copy="ikGen">Copy link</button>
        <a class="ik-btn g" href="${esc(wa(genLink(k)))}" target="_blank" rel="noopener">WhatsApp</a><a class="ik-btn g" href="${esc(genLink(k))}" target="_blank" rel="noopener">Preview ↗</a></div>
      <p class="ik-note" style="margin:0">Send this link to any client. They create an account (or sign in), then fill the form and upload documents. ${f.sections.length} sections and up to ${f.docs.length} document types; questions and the document list adapt to their answers.</p>
      <details${made ? " open" : ""}><summary style="cursor:pointer;font-weight:600;font-size:.88rem">Make a personal link for one client (shows their name on the form and tells you who opened it)</summary>
        <div class="ik-inv" style="margin-top:10px">
          <label>Client name<input class="ik-in" id="ikName" placeholder="e.g. Jaspreet Kaur"></label>
          <label>Client email (optional)<input class="ik-in" id="ikEmail" type="email" placeholder="client@email.com"></label>
          <label>Private note (only you see it)<input class="ik-in" id="ikNote" placeholder="e.g. referred by …"></label>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="ik-btn" type="button" id="ikMake">Create link</button><button class="ik-btn g" type="button" id="ikMakeSend" title="Creates the link and emails it to the client">Create &amp; email</button></div>
        </div><div class="ik-note" id="ikInvErr"></div>
        ${made ? `<div class="ik-link" style="margin-top:10px"><strong>Personal link for ${esc(made.label || "client")}${made.emailed ? " · emailed ✓" : ""}</strong>
          <div class="ik-url"><input readonly id="ikMade" value="${esc(made.link)}"><button class="ik-btn" type="button" data-copy="ikMade">Copy link</button><a class="ik-btn g" href="${esc(wa(made.link))}" target="_blank" rel="noopener">WhatsApp</a></div></div>` : ""}
        ${invites.length ? `<div class="wpa-tbl" style="margin-top:12px"><table><thead><tr><th>Personal link</th><th>Created</th><th>Opened</th><th>Forms</th><th></th></tr></thead><tbody>
          ${invites.map((v) => `<tr><td><b>${esc(v.label || "(no name)")}</b>${v.email ? `<br><span class="ik-note">${esc(v.email)}</span>` : ""}${v.note ? `<br><span class="ik-note">${esc(v.note)}</span>` : ""}</td><td>${when(v.created)}</td>
            <td>${v.opens ? `${v.opens}× · last ${when(v.last_open)}` : "Not yet"}</td><td>${v.started} started · ${v.done} submitted</td>
            <td style="white-space:nowrap"><button class="dl" type="button" data-cp="${esc(site() + "/intake/?i=" + v.code)}">Copy</button> <button class="dl" type="button" data-arch="${esc(v.code)}" title="Stops the link working">Turn off</button></td></tr>`).join("")}
        </tbody></table></div>` : ""}
      </details></div>`;
  }
  function rows() {
    const R = (S.list && S.list.rows) || [], q = S.q.trim().toLowerCase();
    return R.filter((r) => {
      const isNew = r.status === "submitted" && !r.admin_seen;
      if (S.filter === "new" && !isNew) return false;
      if (S.filter === "submitted" && r.status !== "submitted") return false;
      if (S.filter === "progress" && r.status === "submitted") return false;
      if (!q) return true;
      return [r.name, r.acct_name, r.acct_email, r.acct_phone, r.email, r.phone, formName(r.form_key), r.invite_label, stLabel(r.admin_status)].some((x) => String(x || "").toLowerCase().includes(q));
    });
  }
  function listHtml() {
    const R = (S.list && S.list.rows) || [];
    const n = { new: R.filter((r) => r.status === "submitted" && !r.admin_seen).length, submitted: R.filter((r) => r.status === "submitted").length, progress: R.filter((r) => r.status !== "submitted").length, all: R.length };
    const L = rows();
    const segs = [["new", `New (${n.new})`], ["submitted", `Submitted (${n.submitted})`], ["progress", `Still filling (${n.progress})`], ["all", `All (${n.all})`]];
    return `<div class="wpa-card wide"><div class="ik-top"><h3>Client forms</h3>
      <div class="ik-acts"><div class="wpa-seg">${segs.map(([v, l]) => `<button type="button" data-f="${v}" aria-pressed="${S.filter === v}">${l}</button>`).join("")}</div>
      <input id="ikQ" class="ik-in" type="search" placeholder="Search name, email, phone, form…" value="${esc(S.q)}" style="width:240px"></div></div>
      ${L.length ? `<div class="wpa-tbl"><table><thead><tr><th>Status</th><th>Applicant</th><th>Form</th><th>Account</th><th>Progress</th><th>Files</th><th>Submitted</th></tr></thead><tbody>
        ${L.map((r) => { const isNew = r.status === "submitted" && !r.admin_seen;
          const badge = isNew ? `<span class="ik-badge new">${r.resubmitted ? "Updated" : "New"}</span>` : r.status === "submitted" ? `<span class="ik-badge sub">${esc(stLabel(r.admin_status))}</span>` : r.status === "editing" ? `<span class="ik-badge edit">Client editing</span>` : `<span class="ik-badge">Filling</span>`;
          return `<tr class="ik-row${isNew ? " new" : ""}" data-open="${r.id}" tabindex="0"><td>${badge}</td><td>${esc(r.name || "(name not entered)")}${r.invite_label ? `<br><span class="ik-note">Link: ${esc(r.invite_label)}</span>` : ""}</td>
            <td>${esc(formName(r.form_key))}</td><td>${esc(r.acct_name)}<br><span class="ik-note">${esc(r.acct_email)} · ${esc(r.acct_phone)}</span></td>
            <td><span class="ik-meter"><i style="width:${r.progress || 0}%"></i></span>${r.progress || 0}%</td><td>${r.files}</td><td>${r.submitted ? when(r.resubmitted || r.submitted) : `<span class="ik-note">Last saved ${when(r.updated)}</span>`}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="wpa-empty">${S.filter === "new" ? "No new submissions. Forms clients submit appear here, highlighted, until you open them." : "Nothing here yet."}</div>`}</div>`;
  }
  function draw() {
    body.innerHTML = `<div class="ik-wrap">${catalogHtml()}<div id="ikLinkWrap">${linkHtml()}</div><div id="ikList">${listHtml()}</div></div>`;
    wire();
  }
  function drawList() { const l = body.querySelector("#ikList"); if (l) { l.innerHTML = listHtml(); wire(); } }
  function wire() {
    body.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { S.pick = b.dataset.pick; S.made = null;
      body.querySelectorAll("[data-pick]").forEach((x) => x.setAttribute("aria-pressed", x === b)); body.querySelector("#ikLinkWrap").innerHTML = linkHtml(); wire();
      const l = body.querySelector("#ikLink"); if (l) l.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    body.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => copy(document.getElementById(b.dataset.copy).value, b));
    body.querySelectorAll("[data-cp]").forEach((b) => b.onclick = () => copy(b.dataset.cp, b));
    body.querySelectorAll("[data-arch]").forEach((b) => b.onclick = async () => { if (!confirm("Turn off this personal link? Forms already started stay.")) return; await post("invite-archive", { code: b.dataset.arch }); S.list = await call("list"); body.querySelector("#ikLinkWrap").innerHTML = linkHtml(); wire(); });
    const mk = (send) => async () => {
      const label = body.querySelector("#ikName").value.trim(), email = body.querySelector("#ikEmail").value.trim(), note = body.querySelector("#ikNote").value.trim(), err = body.querySelector("#ikInvErr");
      if (send && !email) { err.textContent = "Add the client's email to send it."; return; }
      try { const j = await post("invite", { f: S.pick, label, email, note, send }); S.made = { f: S.pick, label, link: `${site()}/intake/?i=${j.code}`, emailed: j.emailed }; S.list = await call("list");
        body.querySelector("#ikLinkWrap").innerHTML = linkHtml(); wire(); const m = document.getElementById("ikMade"); if (m) { m.select(); copy(m.value); }
        if (send && !j.emailed) body.querySelector("#ikInvErr").textContent = "Link created, but the email couldn't be sent (check RESEND_API_KEY). Copy it instead.";
      } catch (e) { err.textContent = e.message; }
    };
    const m1 = body.querySelector("#ikMake"), m2 = body.querySelector("#ikMakeSend"); if (m1) m1.onclick = mk(false); if (m2) m2.onclick = mk(true);
    body.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { S.filter = b.dataset.f; drawList(); });
    const q = body.querySelector("#ikQ"); if (q) q.oninput = (e) => { S.q = e.target.value; const pos = e.target.selectionStart; drawList(); const n = body.querySelector("#ikQ"); n.focus(); n.setSelectionRange(pos, pos); };
    body.querySelectorAll("[data-open]").forEach((tr) => { tr.onclick = () => openItem(tr.dataset.open); tr.onkeydown = (e) => { if (e.key === "Enter") openItem(tr.dataset.open); }; });
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    if (btn) { const o = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => btn.textContent = o, 1600); }
  }

  /* ---------- one client's form ---------- */
  const shown = (v) => v === true ? "Yes" : String(v ?? "").trim();
  function answers(form, data) {
    return form.sections.filter((s) => C.sectionOn(s, data)).map((s) => {
      const one = (row) => s.fields.filter((f) => f.t !== "h" && C.fieldOn(f, data, row) && shown((row || {})[f.k])).map((f) => [f.l, shown(row[f.k])]);
      if (s.rep) { const R = Array.isArray(data[s.id]) ? data[s.id] : []; return { title: s.title, reps: R.map(one) }; }
      return { title: s.title, pairs: one(data[s.id] || {}) };
    });
  }
  function asText(r, form, A, docs) {
    const out = [`${form.name}`, `Applicant: ${C.applicantName(r.data) || "-"}`, `Account: ${r.acct_name} · ${r.acct_email} · ${r.acct_phone}`, `Submitted: ${when(r.submitted)}`, ""];
    A.forEach((s) => { out.push(s.title.toUpperCase()); if (s.reps) (s.reps.length ? s.reps : [[["", "None"]]]).forEach((p, i) => { out.push(`  ${i + 1}.`); p.forEach(([l, v]) => out.push(`     ${l}: ${v}`)); }); else s.pairs.forEach(([l, v]) => out.push(`  ${l}: ${v}`)); out.push(""); });
    out.push("DOCUMENTS"); form.docs.forEach((d) => { const f = docs.filter((x) => x.doc_key === d.k); if (f.length) out.push(`  ${d.l}: ${f.map((x) => x.name).join(", ")}`); });
    return out.join("\n");
  }
  async function openItem(id) {
    S.open = id; S.item = null; S.busy = true;
    body.innerHTML = `<div class="wpa-empty">Opening…</div>`;
    try { S.item = await call("item?id=" + encodeURIComponent(id)); } catch (e) { S.busy = false; S.open = null; body.innerHTML = `<div class="wpa-empty">Couldn't open it: ${esc(e.message)}</div>`; return; }
    S.busy = false; drawItem(); badge();
    const r = S.list && S.list.rows.find((x) => x.id === id); if (r && !r.admin_seen && r.status === "submitted") r.admin_seen = new Date().toISOString();
  }
  function drawItem() {
    const { row: r, docs, missing } = S.item, form = C.FORMS[r.form_key];
    if (!form) { body.innerHTML = `<div class="wpa-empty">Unknown form ${esc(r.form_key)}.</div>`; return; }
    const A = answers(form, r.data), d = r.data, c = d.contact || {}, name = C.applicantName(d) || "(name not entered)";
    const sec = (s) => `<div class="ik-sec"><h4>${esc(s.title)}</h4>${s.reps ? (s.reps.length ? s.reps.map((p, i) => `<div class="ik-rep"><div class="ik-note" style="font-weight:700;margin-bottom:4px">${i + 1}</div><dl class="ik-dl">${p.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`).join("") : `<span class="ik-note">None</span>`)
      : (s.pairs.length ? `<dl class="ik-dl">${s.pairs.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<span class="ik-note">Nothing entered</span>`)}</div>`;
    const docRows = form.docs.filter((x) => C.when(x.if, d) || docs.some((y) => y.doc_key === x.k)).map((x) => {
      const f = docs.filter((y) => y.doc_key === x.k);
      return `<div class="ik-doc"><div class="n"><b>${esc(x.l)}</b>${!f.length ? ` <span class="ik-badge${x.r ? " edit" : ""}">${x.r ? "Missing" : "Not uploaded"}</span>` : ""}
        ${f.map((y) => `<div class="ik-note">${esc(y.name)} · ${kb(y.size)} · ${when(y.uploaded)}</div>`).join("")}</div>
        <div class="ik-acts">${f.map((y) => `<button class="dl" type="button" data-view="${y.id}" data-name="${esc(y.name)}">View</button><button class="dl" type="button" data-dl="${y.id}" data-name="${esc(y.name)}">Download</button>`).join("")}</div></div>`;
    }).join("");
    const stat = r.status === "submitted" ? (r.resubmitted ? `Resubmitted ${when(r.resubmitted)} (first ${when(r.submitted)})` : `Submitted ${when(r.submitted)}`) : r.status === "editing" ? "Client is making changes (not resubmitted yet)" : `Still filling · ${r.progress || 0}% · last saved ${when(r.updated)}`;
    const phone = String(c.phone || r.acct_phone || "").replace(/[^\d+]/g, "");
    body.innerHTML = `<div class="ik-wrap">
      <div><button class="dl" type="button" id="ikBack">← All intake forms</button></div>
      <div class="wpa-card wide"><div class="ik-top"><div><small class="ik-note">${esc(form.name)}</small><h3 style="font-size:1.3rem">${esc(name)}</h3>
          <div class="ik-note">${esc(stat)}${r.invite_label ? ` · personal link: ${esc(r.invite_label)}` : ""}</div>
          <div style="margin-top:8px;font-size:.88rem">Account: <b>${esc(r.acct_name)}</b> · <a href="mailto:${esc(r.acct_email)}">${esc(r.acct_email)}</a> · ${phone ? `<a href="tel:${esc(phone)}">${esc(r.acct_phone)}</a> · <a href="https://wa.me/${esc(phone.replace(/^\+/, ""))}" target="_blank" rel="noopener">WhatsApp</a>` : esc(r.acct_phone)}
          ${c.email && c.email !== r.acct_email ? `<br>Applicant email: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}${c.phone && c.phone !== r.acct_phone ? ` · Applicant phone: ${esc(c.phone)}` : ""}</div></div>
        <div class="ik-acts"><button class="ik-btn" type="button" id="ikAll">Download all files (${docs.length})</button><button class="ik-btn g" type="button" id="ikPrint">Print / save PDF</button><button class="ik-btn g" type="button" id="ikCopy">Copy answers</button></div></div>
        <div class="ik-inv" style="grid-template-columns:220px 1fr auto">
          <label>Work status<select class="ik-in" id="ikSt">${STATUS.map(([v, l]) => `<option value="${v}"${r.admin_status === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Private notes<textarea class="ik-in" id="ikNotes" rows="2" placeholder="Only you see this">${esc(r.admin_note || "")}</textarea></label>
          <div><button class="ik-btn" type="button" id="ikSave">Save</button></div></div><div class="ik-note" id="ikMsg"></div>
        ${missing.length ? `<div class="ik-miss"><b>${missing.length} required item${missing.length > 1 ? "s" : ""} not complete</b>${r.status === "submitted" ? " (the form rules changed after they submitted)" : ""}<ul>${missing.slice(0, 60).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      </div>
      ${lifeCard(r, docs)}
      <div class="wpa-card wide"><h3>Documents (${docs.length} file${docs.length === 1 ? "" : "s"})</h3>${r.docs_destroyed_at ? `<span class="ik-note">${r.docs_destroyed_count || 0} uploaded document${r.docs_destroyed_count === 1 ? " was" : "s were"} permanently destroyed on ${when(r.docs_destroyed_at)}.</span>` : docRows || `<span class="ik-note">No documents.</span>`}</div>
      <div class="wpa-card wide"><h3>Answers</h3>${A.map(sec).join("")}</div>
      <div class="wpa-card wide"><h3>Manage</h3><div class="ik-acts">
        ${r.status === "submitted" && !r.docs_destroyed_at ? `<button class="ik-btn g" type="button" id="ikUnlock">Let client edit and resubmit</button>` : ""}
        <button class="ik-btn g" type="button" id="ikUnread">Mark as new again</button>
        <button class="ik-btn red" type="button" id="ikDel">Delete form and all files permanently</button></div>
        <p class="ik-note" style="margin:0">Only you can see this page. Files are stored privately and are never public.</p></div></div>`;
    const $ = (s) => body.querySelector(s), msg = (t) => $("#ikMsg").textContent = t;
    $("#ikBack").onclick = back;
    $("#ikSave").onclick = async () => { try { await post("status", { id: r.id, status: $("#ikSt").value, note: $("#ikNotes").value }); r.admin_status = $("#ikSt").value; r.admin_note = $("#ikNotes").value; msg("Saved ✓"); } catch (e) { msg(e.message); } };
    $("#ikCopy").onclick = (e) => copy(asText(r, form, A, docs), e.target);
    $("#ikPrint").onclick = () => printView(r, form, A, docs, name);
    $("#ikAll").onclick = async (e) => { const b = e.target; b.disabled = true; for (let i = 0; i < docs.length; i++) { b.textContent = `Downloading ${i + 1} of ${docs.length}…`; await getFile(docs[i].id, prefix(form, docs[i]) + docs[i].name, false).catch(() => {}); await new Promise((ok) => setTimeout(ok, 400)); } b.textContent = `Download all files (${docs.length})`; b.disabled = false; };
    body.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => getFile(b.dataset.view, b.dataset.name, true).catch((e) => alert(e.message)));
    body.querySelectorAll("[data-dl]").forEach((b) => b.onclick = () => getFile(b.dataset.dl, b.dataset.name, false).catch((e) => alert(e.message)));
    const fz = $("#ikFinal"); if (fz) fz.onclick = async () => {
      if (!confirm(`${r.final_key ? "Rebuild the complete file and share it again" : "Build the complete file (answers summary + all " + docs.length + " documents) and share it with the client"}? They get an email and can download it from their WorkerPool account.`)) return;
      fz.disabled = true; fz.textContent = "Building the complete file…";
      try { const j = await post("finalize", { id: r.id }); alert(`Complete file shared: ${j.files} documents, ${(j.final_size / 1048576).toFixed(1)} MB.${j.emailed ? " The client was emailed." : " (The email couldn't be sent; tell the client to sign in.)"}`); openItem(r.id); }
      catch (e) { fz.disabled = false; fz.textContent = "Create & share complete file with client"; alert(e.message); }
    };
    const fd = $("#ikFinalDl"); if (fd) fd.onclick = async () => { fd.disabled = true; try { const x = await fetch("/api/intake/admin/final?id=" + encodeURIComponent(r.id), { headers: { "x-admin-key": KEY } }); if (!x.ok) throw new Error("Couldn't download it."); const url = URL.createObjectURL(await x.blob()); const a = document.createElement("a"); a.href = url; a.download = r.final_name || "complete-file.zip"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (e) { alert(e.message); } fd.disabled = false; };
    const ds = $("#ikDestroy"); if (ds) ds.onclick = async () => {
      if (!confirm(`Permanently destroy all ${docs.length} uploaded documents for ${name}? The client consented to this. Their complete file is ${r.keep_file ? "kept (they asked WorkerPool to save it)" : "kept only until " + when(r.final_expires)}.`)) return;
      if (prompt("Type DESTROY to confirm") !== "DESTROY") return;
      ds.disabled = true; try { const j = await post("destroy", { id: r.id }); alert(`${j.destroyed} documents destroyed. The client was told by email.`); openItem(r.id); } catch (e) { ds.disabled = false; alert(e.message); }
    };
    const u = $("#ikUnlock"); if (u) u.onclick = async () => { if (!confirm("Unlock this form so the client can change answers and documents? It returns here as Updated when they resubmit.")) return; await post("unlock", { id: r.id }); openItem(r.id); };
    $("#ikUnread").onclick = async () => { await post("unseen", { id: r.id }); back(); };
    $("#ikDel").onclick = async () => { if (!confirm(`Permanently delete ${name}'s form and all ${docs.length} files? This can't be undone.`)) return; if (prompt('Type DELETE to confirm') !== "DELETE") return; await post("delete", { id: r.id }); back(); };
  }
  function lifeCard(r, docs) {
    if (r.status !== "submitted" && !r.consent_at) return "";
    const keep = r.keep_file == null ? "–" : r.keep_file ? "<b>Yes</b> – keep the complete file in their account" : `<b>No</b> – remove the complete file ${r.final_expires ? "on " + when(r.final_expires) : "30 days after it's shared"}`;
    const step1 = r.final_key ? `✓ Shared ${when(r.final_at)} · ${kb(r.final_size)} · downloaded by client ${r.final_downloads || 0}×` : r.final_at ? `Shared ${when(r.final_at)}; since removed (client chose not to keep it)` : "Not yet";
    const step2 = r.docs_destroyed_at ? `✓ Destroyed ${when(r.docs_destroyed_at)} (${r.docs_destroyed_count} files)` : "Not yet";
    return `<div class="wpa-card wide"><h3>Consent, complete file and document destruction</h3>
      <dl class="ik-dl">
        <dt>Client consent</dt><dd>${r.consent_at ? `✓ Given ${when(r.consent_at)}` : "Not given (form not submitted)"}</dd>
        <dt>Save complete file with WorkerPool</dt><dd>${keep}${r.keep_changed && r.keep_changed !== r.consent_at ? ` <span class="ik-note">(changed ${when(r.keep_changed)})</span>` : ""}</dd>
        <dt>1. Complete file shared with client</dt><dd>${step1}</dd>
        <dt>2. Uploaded documents destroyed</dt><dd>${step2}</dd>
      </dl>
      ${r.consent_text ? `<details><summary class="ik-note" style="cursor:pointer">Exact consent wording the client agreed to</summary><p class="ik-note" style="white-space:pre-wrap">${esc(r.consent_text.replace(/ \| /g, "\n"))}</p></details>` : ""}
      <div class="ik-acts">
        ${r.consent_at && !r.docs_destroyed_at ? `<button class="ik-btn" type="button" id="ikFinal">${r.final_key ? "Rebuild & share complete file again" : "Create & share complete file with client"}</button>` : ""}
        ${r.final_key ? `<button class="ik-btn g" type="button" id="ikFinalDl">Download complete file</button>` : ""}
        ${r.final_key && !r.docs_destroyed_at && docs.length ? `<button class="ik-btn red" type="button" id="ikDestroy">Destroy uploaded documents (${docs.length})</button>` : ""}
      </div>
      <p class="ik-note" style="margin:0">Order: finish your work, then share the complete file (a ZIP with an answers summary PDF and every document in numbered folders), then destroy the uploaded documents. The client is emailed at each step.</p></div>`;
  }
  const prefix = (form, d) => { const i = form.docs.findIndex((x) => x.k === d.doc_key); return (i >= 0 ? String(i + 1).padStart(2, "0") + "-" + d.doc_key + "-" : ""); };
  async function getFile(id, name, view) {
    const w = view ? window.open("", "_blank") : null;
    const r = await fetch(`/api/intake/admin/doc?id=${encodeURIComponent(id)}${view ? "&view=1" : ""}`, { headers: { "x-admin-key": KEY } });
    if (!r.ok) { if (w) w.close(); let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.error || "Couldn't open the file."); }
    const url = URL.createObjectURL(await r.blob());
    if (w) { w.location.href = url; } else { const a = document.createElement("a"); a.href = url; a.download = name || "document"; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  function printView(r, form, A, docs, name) {
    const w = window.open("", "_blank"); if (!w) return alert("Allow pop-ups to print.");
    const tbl = (p) => `<table>${p.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} – ${esc(form.name)}</title><style>
      body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;padding-bottom:3px;border-bottom:2px solid #24514b;color:#24514b;text-transform:uppercase;letter-spacing:.04em}
      table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #ddd}th{width:45%;font-weight:500;color:#555}td{white-space:pre-wrap}
      .n{font-weight:700;margin-top:8px}.m{color:#555}@media print{body{margin:12mm}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>
      <h1>${esc(name)}</h1><div class="m">${esc(form.name)} · Submitted ${esc(when(r.submitted))} · Account ${esc(r.acct_name)}, ${esc(r.acct_email)}, ${esc(r.acct_phone)}</div>
      ${A.map((s) => `<h2>${esc(s.title)}</h2>${s.reps ? (s.reps.length ? s.reps.map((p, i) => `<div class="n">${i + 1}.</div>${tbl(p)}`).join("") : "<p>None</p>") : tbl(s.pairs)}`).join("")}
      <h2>Documents</h2>${tbl(form.docs.filter((d) => docs.some((x) => x.doc_key === d.k)).map((d) => [d.l, docs.filter((x) => x.doc_key === d.k).map((x) => x.name).join("\n")]))}
      <p class="m">Confidential client information. WorkerPool.</p><script>onload=()=>print()<\/script></body></html>`);
    w.document.close();
  }
  async function back() { S.open = null; S.item = null; body.innerHTML = `<div class="wpa-empty">Loading…</div>`; try { S.list = await call("list"); } catch (e) {} draw(); badge(); }
  function leave() { S.open = null; S.item = null; }

  window.WPIntake = { load, badge, leave };
})();
try { const k = sessionStorage.getItem("wp_admin"); if (k) window.WPIntake.badge(k); } catch (e) {}
