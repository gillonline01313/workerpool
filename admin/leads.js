/* Admin → Lead Desk. Referral partners ("lead managers") punch client leads at /leads/; here admin sees every lead,
   sets the status, records the fee and payments received, attaches an RCIC (the name is never shown to the manager),
   sends a lead back to its manager with instructions, comments (visible to the manager or internal), and manages
   lead manager accounts. Loaded by admin/index.html. API: /api/leads/admin/. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (t) => t ? new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
  const day = (t) => t ? new Date(t.length === 10 ? t + "T12:00:00" : t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "–";
  const money = (c) => "$" + ((c || 0) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kbs = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB";
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  let KEY = "", body = null, D = null, open = null, item = null, f = { view: "attention", status: "", mgr: "", q: "" }, showMgrs = false, editMgr = null, flash = "", share = null;

  async function call(path, opts = {}) {
    const r = await fetch("/api/leads/admin/" + path, { ...opts, headers: { "x-admin-key": KEY, "Content-Type": "application/json", ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  const post = (path, b) => call(path, { method: "POST", body: JSON.stringify(b) });

  const css = `.ld-in{font:inherit;font-size:.88rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg);width:100%;min-width:0}
textarea.ld-in{resize:vertical;min-height:64px}
.ld-btn{font:inherit;font-weight:600;font-size:.85rem;padding:8px 15px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.ld-btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}.ld-btn.red{background:transparent;color:#b3412e;border-color:#b3412e}.ld-btn.warn{background:#9a5b1e;border-color:#9a5b1e}
.ld-btn:disabled{opacity:.55;cursor:default}
.ld-note{font-size:.8rem;color:var(--muted)}.ld-row{cursor:pointer}.ld-row:hover td{background:var(--accent-soft)}
.ld-row.fresh td{background:color-mix(in srgb,var(--accent) 12%,transparent)}.ld-row.fresh td:first-child{box-shadow:inset 4px 0 0 var(--accent)}
.ld-row.reply td:first-child{box-shadow:inset 4px 0 0 #8a74c9}
.ld-pill{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.ld-pill.s-new{background:var(--accent);color:var(--surface);border-color:var(--accent)}.ld-pill.s-discussion,.ld-pill.s-pending{background:#f6ebdc;color:#7a4a17;border-color:transparent}
.ld-pill.s-process{background:var(--accent-soft);color:var(--fg);border-color:transparent}.ld-pill.s-finalized,.ld-pill.s-completed{background:#dcefe3;color:#24613d;border-color:transparent}
.ld-pill.wait{background:#9a5b1e;color:#fff;border-color:#9a5b1e}.ld-pill.rep{background:#8a74c9;color:#fff;border-color:#8a74c9}
.ld-lab{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted);min-width:0}
.ld-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.ld-two{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;align-items:start}@media (max-width:980px){.ld-two{grid-template-columns:1fr}}
.ld-dl{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.5fr);gap:5px 14px;margin:0;font-size:.88rem}.ld-dl dt{color:var(--muted)}.ld-dl dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.ld-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.ld-tl li{border-left:3px solid var(--line);padding:2px 0 2px 11px;font-size:.88rem;white-space:pre-wrap;overflow-wrap:anywhere}
.ld-tl li small{display:block;color:var(--muted);font-size:.74rem;white-space:normal}
.ld-tl li.admin{border-color:var(--accent)}.ld-tl li.manager{border-color:#8a74c9}.ld-tl li.priv{border-style:dashed;background:rgba(0,0,0,.035);border-radius:0 8px 8px 0;padding:5px 9px 5px 11px}
.ld-tl li.sendback{border-color:#9a5b1e;background:#f6ebdc;color:#5a3a12;border-radius:0 8px 8px 0;padding:5px 9px 5px 11px}
.ld-stats{display:flex;gap:18px;flex-wrap:wrap;font-size:.9rem}
.ld-seg{display:flex;border:1px solid var(--line);border-radius:999px;padding:3px;flex-wrap:wrap;background:var(--surface)}
.ld-seg button{font:inherit;font-size:.8rem;font-weight:600;border:0;background:none;color:var(--muted);padding:5px 11px;border-radius:999px;cursor:pointer}
.ld-seg button[aria-pressed="true"]{background:var(--accent);color:var(--surface)}
.ld-box{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px}
.ld-box h4{margin:0;font-size:.92rem}
.ld-flash{background:var(--accent-soft);border-radius:10px;padding:9px 12px;font-size:.88rem}`;

  async function load(key, el) {
    KEY = key; body = el;
    if (!document.getElementById("ldCss")) { const s = document.createElement("style"); s.id = "ldCss"; s.textContent = css; document.head.appendChild(s); }
    // the dashboard refreshes every minute: don't wipe something the admin is typing in
    if (D && body.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (D && body.querySelector("[data-dirty]")) return;
    try { D = await call("list"); if (open) item = await call("item?id=" + encodeURIComponent(open)); }
    catch (e) { body.innerHTML = `<div class="wpa-empty">Couldn't load the Lead Desk: ${esc(e.message)}</div>`; return; }
    draw();
  }
  const refresh = async (msg) => { flash = msg || ""; D = await call("list"); if (open) item = await call("item?id=" + encodeURIComponent(open)); draw(); };
  const fresh = (l) => !l.admin_seen;
  const reply = (l) => l.admin_seen && l.mgr_at && l.mgr_at > l.admin_seen;
  const pill = (l) => `<span class="ld-pill s-${esc(l.status)}">${esc(l.status_label)}</span>`;

  function draw() {
    label();
    if (open && item) return drawItem();
    const R = D.rows, mg = D.managers;
    const n = { fresh: R.filter(fresh).length, reply: R.filter(reply).length, wait: R.filter((l) => l.action_needed).length, open: R.filter((l) => !["completed", "closed"].includes(l.status)).length,
      won: R.filter((l) => ["finalized", "completed"].includes(l.status)).length, paid: R.reduce((a, l) => a + (l.paid_cents || 0), 0) };
    const q = f.q.trim().toLowerCase();
    const L = R.filter((l) => f.view === "all" ? true : f.view === "attention" ? (fresh(l) || reply(l)) : f.view === "wait" ? l.action_needed : f.view === "open" ? !["completed", "closed"].includes(l.status) : true)
      .filter((l) => (!f.status || l.status === f.status) && (!f.mgr || l.manager_id === f.mgr))
      .filter((l) => !q || [l.ref, l.client_name, l.phone, l.whatsapp, l.email, l.service, l.location, l.manager_name, l.rcic_name].some((x) => String(x || "").toLowerCase().includes(q)));
    if (f.view === "attention" && !L.length && !q && !f.status && !f.mgr && R.length) f.view = "open", setTimeout(draw);
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
      <div class="wpa-card wide"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3>Lead Desk</h3>
          <button class="ld-btn g" type="button" id="ldMg">${showMgrs ? "Hide lead managers" : `Lead managers (${mg.length})`}</button></div>
        <p class="sub" style="margin:0">Lead managers refer clients at <a href="/leads/" target="_blank" rel="noopener">workerpool.ca/leads/</a> and see only their own leads. They see everything here except the RCIC's name and your internal notes.</p>
        ${flash ? `<div class="ld-flash">${flash}</div>` : ""}
        <div class="ld-stats"><span><b>${R.length}</b> leads</span>${n.fresh ? `<span><b style="color:var(--accent)">${n.fresh}</b> new</span>` : ""}${n.reply ? `<span><b style="color:#8a74c9">${n.reply}</b> with a manager reply</span>` : ""}
          <span><b>${n.wait}</b> waiting on managers</span><span><b>${n.open}</b> open</span><span><b>${n.won}</b> finalized / completed</span><span><b>${money(n.paid)}</b> received</span></div>
        ${showMgrs ? mgrsHtml(mg) : ""}</div>
      <div class="wpa-card wide">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
          <div class="ld-seg" id="ldSeg">${[["attention", `Needs attention${n.fresh + n.reply ? ` (${n.fresh + n.reply})` : ""}`], ["open", "Open"], ["wait", "Sent back"], ["all", "All"]].map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${f.view === k}">${t}</button>`).join("")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select class="ld-in" id="ldSt" style="width:auto"><option value="">Any status</option>${Object.entries(D.statuses).map(([k, v]) => `<option value="${k}"${f.status === k ? " selected" : ""}>${esc(v)}</option>`).join("")}</select>
            <select class="ld-in" id="ldM" style="width:auto"><option value="">All managers</option>${mg.map((m) => `<option value="${m.id}"${f.mgr === m.id ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
            <input class="ld-in" id="ldQ" type="search" placeholder="Search client, phone, L-number, RCIC…" value="${esc(f.q)}" style="width:240px"></div></div>
        ${L.length ? `<div class="wpa-tbl"><table><thead><tr><th>Lead</th><th>Client</th><th>Service</th><th>Manager</th><th>Status</th><th>RCIC</th><th>Fee / received</th><th>Updated</th></tr></thead><tbody>
          ${L.map((l) => `<tr class="ld-row${fresh(l) ? " fresh" : reply(l) ? " reply" : ""}" data-l="${l.id}" tabindex="0">
            <td><b>${esc(l.ref)}</b>${fresh(l) ? `<br><span class="ld-pill s-new">New</span>` : reply(l) ? `<br><span class="ld-pill rep">Manager replied</span>` : ""}${l.action_needed ? `<br><span class="ld-pill wait">With manager</span>` : ""}</td>
            <td><b>${esc(l.client_name)}</b><br><span class="ld-note">${esc(l.phone || l.whatsapp || l.email || "")}</span></td><td>${esc(l.service)}</td>
            <td>${esc(l.manager_name || "–")}${l.manager_company ? `<br><span class="ld-note">${esc(l.manager_company)}</span>` : ""}</td><td>${pill(l)}</td>
            <td>${l.rcic_attached ? esc(l.rcic_name || "Yes") : `<span class="ld-note">No</span>`}</td>
            <td>${l.fee_cents ? money(l.fee_cents) : "–"}<br><span class="ld-note">${money(l.paid_cents)} received</span></td><td>${when(l.updated)}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="wpa-empty">${R.length ? "No lead matches." : mg.length ? "No leads yet. They appear here when a lead manager sends one." : "No lead managers yet. Press Lead managers above to add your first one."}</div>`}</div></div>`;
    const $ = (s) => body.querySelector(s);
    $("#ldMg").onclick = () => { showMgrs = !showMgrs; editMgr = null; share = null; flash = ""; draw(); };
    $("#ldSeg").onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) { f.view = b.dataset.v; draw(); } };
    $("#ldSt").onchange = (e) => { f.status = e.target.value; if (f.status) f.view = "all"; draw(); };
    $("#ldM").onchange = (e) => { f.mgr = e.target.value; if (f.mgr) f.view = "all"; draw(); };
    $("#ldQ").oninput = (e) => { f.q = e.target.value; if (f.q) f.view = "all"; const pos = e.target.selectionStart; draw(); const i = $("#ldQ"); i.focus(); i.setSelectionRange(pos, pos); };
    body.querySelectorAll("[data-l]").forEach((tr) => { const go = async () => { open = tr.dataset.l; flash = ""; try { item = await call("item?id=" + encodeURIComponent(open)); D = await call("list"); draw(); body.scrollIntoView({ block: "start" }); } catch (e) { alert(e.message); } }; tr.onclick = go; tr.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
    if (showMgrs) wireMgrs();
  }

  /* ---------- lead managers ---------- */
  function mgrsHtml(mg) {
    const e = editMgr && editMgr !== "new" ? mg.find((m) => m.id === editMgr) || {} : {};
    return `<div class="ld-box"><h4>Lead managers</h4>
      ${mg.length ? `<div class="wpa-tbl"><table><thead><tr><th>Manager</th><th>Account</th><th>Leads</th><th>Finalized</th><th>Received</th><th>Last sign-in</th><th></th></tr></thead><tbody>
        ${mg.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.company ? ` · ${esc(m.company)}` : ""}<br><span class="ld-note">${[m.email, m.phone].filter(Boolean).map(esc).join(" · ") || "No email or phone yet"}</span>${m.note ? `<br><span class="ld-note">${esc(m.note)}</span>` : ""}</td>
          <td>${m.status === "paused" ? `<span class="ld-pill">Paused</span>` : m.has_password ? `<span class="ld-pill s-process">Signed up</span>` : `<span class="ld-pill s-pending">Not signed up yet</span><br><span class="ld-note">Link made ${day(m.invited)}</span>`}</td>
          <td>${m.leads}</td><td>${m.won}</td><td>${money(m.paid)}</td><td>${when(m.last_login)}</td>
          <td style="white-space:nowrap"><button class="ld-btn g" type="button" data-me="${m.id}">Edit</button> <button class="ld-btn g" type="button" data-mi="${m.id}">${m.has_password ? "Password reset link" : "Sign-up link"}</button>
            <button class="ld-btn ${m.status === "paused" ? "" : "red"}" type="button" data-mp="${m.id}" data-st="${m.status === "paused" ? "active" : "paused"}">${m.status === "paused" ? "Activate" : "Pause"}</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="ld-note" style="margin:0">No lead managers yet.</p>`}
      ${share ? shareHtml() : ""}
      ${editMgr ? `<form id="ldMf" class="ld-box" style="background:var(--bg)"><h4>${editMgr === "new" ? "Add a lead manager" : "Edit " + esc(e.name)}</h4>
        <div class="ld-grid"><label class="ld-lab">Name *<input class="ld-in" id="mfN" value="${esc(e.name || "")}" maxlength="120"></label>
          <label class="ld-lab">Email (optional)<input class="ld-in" id="mfE" type="email" value="${esc(e.email || "")}" maxlength="160"></label>
          <label class="ld-lab">Phone / WhatsApp (optional)<input class="ld-in" id="mfP" type="tel" value="${esc(e.phone || "")}" maxlength="40" placeholder="+1 780 555 0100"></label>
          <label class="ld-lab">Company / partner<input class="ld-in" id="mfC" value="${esc(e.company || "")}" maxlength="160"></label></div>
        <label class="ld-lab">Note (admin only: commission agreed, how you know them…)<textarea class="ld-in" id="mfO" maxlength="2000">${esc(e.note || "")}</textarea></label>
        ${editMgr === "new" ? `<label class="ld-note"><input type="checkbox" id="mfS" checked> Also email them the sign-up link (if you entered an email)</label>
        <span class="ld-note">Only the name is needed. You'll get a sign-up link to send by WhatsApp, text or email, or to copy. They choose their own sign-in (email or phone) and password.</span>` : ""}
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="ld-btn" type="submit">${editMgr === "new" ? "Add and get the sign-up link" : "Save"}</button><button class="ld-btn g" type="button" id="mfX">Cancel</button><span class="ld-note" id="mfErr"></span></div></form>`
        : `<div><button class="ld-btn" type="button" id="ldMAdd">+ Add lead manager</button></div>`}</div>`;
  }
  // The sign-up (or reset) link with ways to send it: copy, WhatsApp, text message, email.
  function shareHtml() {
    const { m, link, signup, emailed } = share, digits = String(m.phone || "").replace(/\D/g, "");
    const text = signup ? `Hi ${m.name.split(" ")[0]}, here is your WorkerPool Lead Desk sign-up link. Open it to create your login and refer clients: ${link}` : `Hi ${m.name.split(" ")[0]}, here is a link to reset your WorkerPool Lead Desk password: ${link}`;
    const enc = encodeURIComponent(text);
    return `<div class="ld-box" style="border-color:var(--accent);background:var(--accent-soft)"><h4>${signup ? "Sign-up link" : "Password reset link"} for ${esc(m.name)}</h4>
      ${emailed ? `<span class="ld-note">✓ Emailed to ${esc(m.email)}.</span>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="ld-in" id="shL" readonly value="${esc(link)}" style="flex:1;min-width:240px"><button class="ld-btn" type="button" id="shC">Copy link</button></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="ld-btn g" href="https://wa.me/${digits.length >= 10 ? digits : ""}?text=${enc}" target="_blank" rel="noopener">WhatsApp</a>
        ${digits ? `<a class="ld-btn g" href="sms:${esc(m.phone)}?&body=${enc}">Text message</a>` : ""}
        ${m.email ? `<button class="ld-btn g" type="button" id="shE">${emailed ? "Email again" : "Email it"}</button><a class="ld-btn g" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("WorkerPool Lead Desk")}&body=${enc}">Open in my email</a>` : ""}
        <button class="ld-btn g" type="button" id="shX">Done</button></div>
      <span class="ld-note">Works for 7 days and only once. ${signup ? "They choose their own sign-in (email or phone) and password." : "Their old password stops working once they choose a new one."}${digits && digits.length < 11 ? " For WhatsApp, include the country code in their phone number." : ""}</span></div>`;
  }
  function wireMgrs() {
    const $ = (s) => body.querySelector(s);
    const add = $("#ldMAdd"); if (add) add.onclick = () => { editMgr = "new"; share = null; draw(); $("#mfN").focus(); };
    body.querySelectorAll("[data-me]").forEach((b) => b.onclick = () => { editMgr = b.dataset.me; share = null; draw(); });
    body.querySelectorAll("[data-mi]").forEach((b) => b.onclick = async () => { const m = D.managers.find((x) => x.id === b.dataset.mi); try { const r = await post("manager-invite", { id: m.id }); share = { m, ...r }; editMgr = null; await refresh(); } catch (e) { alert(e.message); } });
    if (share) {
      $("#shC").onclick = async () => { const i = $("#shL"); i.select(); try { await navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand("copy"); } $("#shC").textContent = "Copied ✓"; };
      $("#shX").onclick = () => { share = null; draw(); };
      const se = $("#shE"); if (se) se.onclick = async () => { se.disabled = true; try { const r = await post("manager-invite", { id: share.m.id, send: true }); share = { ...share, ...r }; if (!r.emailed) alert("The email didn't go out. Copy the link or send it by WhatsApp instead."); draw(); } catch (e) { alert(e.message); se.disabled = false; } };
    }
    body.querySelectorAll("[data-mp]").forEach((b) => b.onclick = async () => { const m = D.managers.find((x) => x.id === b.dataset.mp); if (b.dataset.st === "paused" && !confirm(`Pause ${m.name}? They're signed out and can't sign in until you activate them. Their leads stay.`)) return; await post("manager-status", { id: m.id, status: b.dataset.st }); await refresh(); });
    const fm = $("#ldMf"); if (fm) {
      $("#mfX").onclick = () => { editMgr = null; draw(); };
      fm.onsubmit = async (e) => {
        e.preventDefault(); const isNew = editMgr === "new", fields = { name: $("#mfN").value, email: $("#mfE").value.trim(), phone: $("#mfP").value.trim(), company: $("#mfC").value, note: $("#mfO").value };
        try { const r = await post("manager", { id: isNew ? "" : editMgr, ...fields, send: isNew && $("#mfS").checked });
          if (isNew) share = { m: { id: r.id, ...fields }, ...r };
          editMgr = null; await refresh(isNew ? "Lead manager added. Send them the sign-up link below." : "Saved."); }
        catch (x) { $("#mfErr").textContent = x.message; }
      };
    }
  }

  /* ---------- one lead ---------- */
  function drawItem() {
    const l = item.lead, st = D.statuses, bal = l.fee_cents ? l.fee_cents - (l.paid_cents || 0) : null;
    const kind = { created: "Lead created", status: "Status", payment: "Payment", fee: "Fee", rcic: "RCIC", sendback: "Sent back to manager", reply: "Manager finished and returned it", comment: "Comment", note: "Internal note", edit: "Details", file: "File" };
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
      <div class="wpa-card wide"><div><button class="ld-btn g" type="button" id="ldBack">← All leads</button></div>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
          <div><span class="ld-note">${esc(l.ref)} · referred ${when(l.created)} by <b>${esc(l.manager_name || "–")}</b>${l.manager_company ? ` (${esc(l.manager_company)})` : ""}</span>
            <h3 style="font-size:1.35rem;margin-top:4px">${esc(l.client_name)}</h3><div class="ld-note" style="font-size:.9rem">${esc(l.service)}</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${pill(l)}${l.action_needed ? `<span class="ld-pill wait">With manager since ${day(l.action_at)}</span>` : ""}${l.rcic_attached ? `<span class="ld-pill s-process">RCIC attached</span>` : ""}</div></div>
        ${flash ? `<div class="ld-flash">${flash}</div>` : ""}</div>
      <div class="ld-two">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="wpa-card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Client</h3><button class="ld-btn g" type="button" id="ldEd">Edit</button></div>
            <div id="ldDet"><dl class="ld-dl"><dt>Phone</dt><dd>${esc(l.phone || "–")}</dd><dt>WhatsApp</dt><dd>${esc(l.whatsapp || "–")}</dd><dt>Email</dt><dd>${esc(l.email || "–")}</dd><dt>Location</dt><dd>${esc(l.location || "–")}</dd>
              <dt>Service</dt><dd>${esc(l.service)}</dd><dt>Details</dt><dd>${esc(l.details || "–")}</dd><dt>Consent</dt><dd>${l.consent_at ? "Manager confirmed the client agreed to be referred · " + when(l.consent_at) : "–"}</dd>
              <dt>Lead manager</dt><dd>${esc(l.manager_name || "–")}${l.manager_email ? `\n${esc(l.manager_email)}` : ""}${l.manager_phone ? ` · ${esc(l.manager_phone)}` : ""}</dd></dl></div></div>
          <div class="wpa-card"><h3>CV and files</h3>
            ${item.files.length ? `<div class="wpa-tbl"><table><tbody>${item.files.map((x) => `<tr><td><button class="ld-btn g" type="button" data-fo="${x.id}" data-n="${esc(x.name)}" style="white-space:normal;text-align:left">📎 ${esc(x.name)}</button></td><td class="ld-note">${x.kind === "cv" ? "CV" : "File"} · ${kbs(x.size)}<br>${x.by === "manager" ? esc(l.manager_name || "Manager") : "WorkerPool"} · ${when(x.created)}</td><td><button class="ld-btn red" type="button" data-fr="${x.id}" title="Remove">×</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="ld-note" style="margin:0">No CV yet.</p>`}
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="ld-btn g" style="cursor:pointer">Upload CV / file<input type="file" id="ldUp" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" hidden></label><span class="ld-note" id="ldUpMsg">PDF, DOC, DOCX, JPG or PNG · 10 MB. The manager sees these files too.</span></div></div>
          <div class="wpa-card"><h3>Timeline</h3>
            <ul class="ld-tl">${item.events.map((e) => `<li class="${e.kind === "sendback" ? "sendback" : e.who}${e.priv ? " priv" : ""}"><small>${e.who === "manager" ? esc(l.manager_name || "Manager") : "WorkerPool"} · ${esc(kind[e.kind] || e.kind)}${e.priv ? " · 🔒 only you see this" : ""} · ${when(e.created)}</small>${esc(e.text)}</li>`).join("")}</ul>
            <div class="ld-box"><h4>Comment</h4><textarea class="ld-in" id="ldC" maxlength="4000" placeholder="Write a comment…"></textarea>
              <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><label class="ld-note"><input type="radio" name="ldCv" value="mgr" checked> Visible to the manager</label><label class="ld-note"><input type="radio" name="ldCv" value="int"> Internal note (only you)</label>
                <label class="ld-note"><input type="checkbox" id="ldCn"> Email the manager</label><button class="ld-btn" type="button" id="ldCs">Add</button></div></div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="wpa-card"><h3>Status</h3>
            <label class="ld-lab">Status<select class="ld-in" id="ldS">${Object.entries(st).map(([k, v]) => `<option value="${k}"${k === l.status ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
            <label class="ld-lab">Note for the manager (optional)<input class="ld-in" id="ldSn" maxlength="2000"></label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="ld-btn" type="button" id="ldSs">Update status</button><label class="ld-note"><input type="checkbox" id="ldSe" checked> Email the manager</label></div>
            ${l.finalized_at ? `<span class="ld-note">Finalized ${day(l.finalized_at)}</span>` : ""}</div>
          <div class="wpa-card"><h3>Payments from the client</h3>
            <div class="ld-stats"><span>Fee <b>${l.fee_cents ? money(l.fee_cents) : "–"}</b></span><span>Received <b>${money(l.paid_cents)}</b></span>${bal !== null ? `<span>Balance <b style="color:${bal > 0 ? "#9a5b1e" : "#24613d"}">${money(Math.max(0, bal))}</b></span>` : ""}</div>
            <div style="display:flex;gap:8px;align-items:end"><label class="ld-lab" style="flex:1">Service fee agreed with the client ($ CAD)<input class="ld-in" id="ldF" inputmode="decimal" value="${l.fee_cents ? (l.fee_cents / 100).toFixed(2) : ""}"></label><button class="ld-btn g" type="button" id="ldFs">Save fee</button></div>
            ${item.payments.length ? `<div class="wpa-tbl"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th></th></tr></thead><tbody>${item.payments.map((p) => `<tr><td>${day(p.received_on)}</td><td>${money(p.amount_cents)}</td><td>${esc(p.method)}${p.note ? `<br><span class="ld-note">${esc(p.note)}</span>` : ""}</td><td><button class="ld-btn red" type="button" data-pd="${p.id}" title="Remove this payment">×</button></td></tr>`).join("")}</tbody></table></div>` : ""}
            <div class="ld-box"><h4>Record a payment received</h4><div class="ld-grid">
              <label class="ld-lab">Amount ($ CAD)<input class="ld-in" id="ldPa" inputmode="decimal" placeholder="500"></label>
              <label class="ld-lab">Date received<input class="ld-in" id="ldPd" type="date" value="${today()}"></label>
              <label class="ld-lab">Method<select class="ld-in" id="ldPm">${D.methods.map((x) => `<option>${esc(x)}</option>`).join("")}</select></label></div>
              <label class="ld-lab">Note (reference number, instalment…)<input class="ld-in" id="ldPn" maxlength="500"></label>
              <div><button class="ld-btn" type="button" id="ldPs">Add payment</button></div></div></div>
          <div class="wpa-card"><h3>RCIC</h3>
            <label class="ld-note" style="font-size:.88rem"><input type="checkbox" id="ldR" ${l.rcic_attached ? "checked" : ""}> An RCIC is attached to this file</label>
            <div class="ld-grid" id="ldRf" ${l.rcic_attached ? "" : "hidden"}><label class="ld-lab">RCIC name<input class="ld-in" id="ldRn" value="${esc(l.rcic_name || "")}" maxlength="160"></label><label class="ld-lab">Licence no. (R…)<input class="ld-in" id="ldRl" value="${esc(l.rcic_licence || "")}" maxlength="40"></label></div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="ld-btn g" type="button" id="ldRs">Save RCIC</button><span class="ld-note">🔒 The manager only sees "RCIC attached: Yes / No", never the name.</span></div></div>
          <div class="wpa-card"><h3>Send back to the manager</h3>
            ${l.action_needed ? `<div class="ld-flash" style="background:#f6ebdc;color:#5a3a12"><b>With ${esc(l.manager_name || "the manager")} since ${when(l.action_at)}:</b><br>${esc(l.action_msg)}</div>` : ""}
            <textarea class="ld-in" id="ldB" maxlength="4000" placeholder="What the manager needs to do: get the passport copy, confirm the client's budget, call the client back…"></textarea>
            <div><button class="ld-btn warn" type="button" id="ldBs">${l.action_needed ? "Send back again" : "Send back to manager"}</button></div>
            <span class="ld-note">The manager is emailed, the lead is flagged "Action needed" for them, and it comes back here when they press Done.</span></div>
          <div><button class="ld-btn red" type="button" id="ldDel">Delete lead</button></div>
        </div></div></div>`;
    const $ = (s) => body.querySelector(s);
    const act = async (path, b, msg) => { try { await post(path, { id: l.id, ...b }); await refresh(msg); } catch (e) { flash = `<span style="color:#b3412e">${esc(e.message)}</span>`; drawItem(); } };
    $("#ldBack").onclick = async () => { open = null; item = null; flash = ""; await refresh(); };
    // keep the 1-minute refresh from wiping typed text
    body.querySelectorAll("textarea, input:not([type=checkbox]):not([type=radio])").forEach((x) => x.addEventListener("input", () => x.setAttribute("data-dirty", "1")));
    $("#ldEd").onclick = () => {
      $("#ldDet").innerHTML = `<form id="ldEf" style="display:flex;flex-direction:column;gap:10px"><div class="ld-grid">
        <label class="ld-lab">Name<input class="ld-in" id="eN" value="${esc(l.client_name)}"></label><label class="ld-lab">Service<select class="ld-in" id="eS">${D.services.map((s) => `<option${s === l.service ? " selected" : ""}>${esc(s)}</option>`).join("")}${D.services.includes(l.service) ? "" : `<option selected>${esc(l.service)}</option>`}</select></label>
        <label class="ld-lab">Phone<input class="ld-in" id="eP" value="${esc(l.phone || "")}"></label><label class="ld-lab">WhatsApp<input class="ld-in" id="eW" value="${esc(l.whatsapp || "")}"></label>
        <label class="ld-lab">Email<input class="ld-in" id="eE" value="${esc(l.email || "")}"></label><label class="ld-lab">Location<input class="ld-in" id="eL" value="${esc(l.location || "")}"></label></div>
        <label class="ld-lab">Details<textarea class="ld-in" id="eD" data-dirty="1">${esc(l.details || "")}</textarea></label>
        <div style="display:flex;gap:8px"><button class="ld-btn" type="submit">Save</button><button class="ld-btn g" type="button" id="eX">Cancel</button></div></form>`;
      $("#eX").onclick = () => drawItem();
      $("#ldEf").onsubmit = (e) => { e.preventDefault(); act("edit", { client_name: $("#eN").value, service: $("#eS").value, phone: $("#eP").value, whatsapp: $("#eW").value, email: $("#eE").value, location: $("#eL").value, details: $("#eD").value }, "Client details saved."); };
    };
    $("#ldCs").onclick = () => { const internal = body.querySelector('input[name=ldCv]:checked').value === "int"; act("comment", { text: $("#ldC").value, internal, notify: !internal && $("#ldCn").checked }, internal ? "Internal note added." : "Comment added."); };
    $("#ldSs").onclick = () => act("status", { status: $("#ldS").value, note: $("#ldSn").value, notify: $("#ldSe").checked }, "Status updated.");
    $("#ldFs").onclick = () => act("fee", { fee: $("#ldF").value }, "Fee saved.");
    $("#ldPs").onclick = () => act("payment", { amount: $("#ldPa").value, date: $("#ldPd").value, method: $("#ldPm").value, note: $("#ldPn").value }, "Payment recorded.");
    body.querySelectorAll("[data-pd]").forEach((b) => b.onclick = () => { if (confirm("Remove this payment entry?")) act("payment-delete", { pid: b.dataset.pd }, "Payment removed."); });
    body.querySelectorAll("[data-fo]").forEach((b) => b.onclick = async () => {
      try { const r = await fetch("/api/leads/admin/file?fid=" + encodeURIComponent(b.dataset.fo), { headers: { "x-admin-key": KEY } }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't open the file.");
        const url = URL.createObjectURL(await r.blob()), a = document.createElement("a"); a.href = url; a.download = b.dataset.n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 6e4); } catch (e) { alert(e.message); } });
    body.querySelectorAll("[data-fr]").forEach((b) => b.onclick = () => { if (confirm("Remove this file? The manager won't see it any more.")) act("file-delete", { fid: b.dataset.fr }, "File removed."); });
    $("#ldUp").onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) { $("#ldUpMsg").textContent = "That file is over 10 MB."; return; }
      $("#ldUpMsg").textContent = "Uploading…";
      try { const r = await fetch("/api/leads/admin/file?id=" + encodeURIComponent(l.id), { method: "POST", body: file, headers: { "x-admin-key": KEY, "x-file-name": encodeURIComponent(file.name), "x-kind": item.files.some((x) => x.kind === "cv") ? "file" : "cv" } });
        const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || "Upload failed."); await refresh("File uploaded."); } catch (x) { $("#ldUpMsg").textContent = x.message; }
    };
    $("#ldR").onchange = (e) => { $("#ldRf").hidden = !e.target.checked; };
    $("#ldRs").onclick = () => act("rcic", { attached: $("#ldR").checked, name: $("#ldRn").value, licence: $("#ldRl").value }, "RCIC saved.");
    $("#ldBs").onclick = () => act("sendback", { message: $("#ldB").value }, `Sent back to ${esc(l.manager_name || "the manager")}. They've been emailed.`);
    $("#ldDel").onclick = async () => { if (!confirm(`Delete ${l.ref} (${l.client_name}) with its payments and timeline? This can't be undone.`)) return; try { await post("delete", { id: l.id }); open = null; item = null; await refresh("Lead deleted."); } catch (e) { alert(e.message); } };
  }

  function label(c) {
    const t = document.getElementById("ldTab"); if (!t) return;
    const n = c ? c.fresh + c.replies : D ? D.rows.filter((l) => fresh(l) || reply(l)).length : 0;
    t.textContent = n ? `Lead Desk (${n})` : "Lead Desk"; t.style.fontWeight = n ? "700" : "";
  }
  let bIv = null;
  async function badge(key) {
    if (key) KEY = key; if (!KEY) return;
    try { label(await call("count")); } catch (e) {}
    if (!bIv) bIv = setInterval(() => { if (!document.hidden) badge(); }, 60000);
  }
  function leave() { open = null; item = null; flash = ""; }
  window.WPLeads = { load, badge, leave };
})();
try { const k = sessionStorage.getItem("wp_admin"); if (k) window.WPLeads.badge(k); } catch (e) {}
