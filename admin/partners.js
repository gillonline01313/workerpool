/* Admin → Partners. RCICs and law firms who use WorkerPool intake forms for their own clients:
   prices per form, every firm with its credits, links and forms, pause/activate, add or remove credits,
   and every payment. Their clients' forms themselves appear under Intake forms (filter "Partner firms").
   Loaded by admin/index.html. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (t) => t ? new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
  const money = (c) => "$" + ((c || 0) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let KEY = "", body = null, D = null, open = null, detail = null, q = "";

  async function call(path, opts = {}) {
    const r = await fetch("/api/partners/admin/" + path, { ...opts, headers: { "x-admin-key": KEY, "Content-Type": "application/json", ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Request failed");
    return j;
  }
  const post = (path, b) => call(path, { method: "POST", body: JSON.stringify(b) });

  const css = `.ik-in{font:inherit;font-size:.88rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg);width:100%}
.ik-btn{font:inherit;font-weight:600;font-size:.85rem;padding:9px 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ik-btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}.ik-btn.red{background:transparent;color:#b3412e;border-color:#b3412e}
.ik-note{font-size:.8rem;color:var(--muted)}.ik-row{cursor:pointer}.ik-row:hover td{background:var(--accent-soft)}
.ik-row.new td{background:color-mix(in srgb,var(--accent) 12%,transparent)}
.ik-badge{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.ik-badge.sub{background:var(--accent-soft);color:var(--fg);border-color:transparent}.ik-badge.edit{background:#f6ebdc;color:#7a4a17;border-color:transparent}`;
  async function load(key, el) {
    KEY = key; body = el;
    if (!document.getElementById("ikCss") && !document.getElementById("ptCss")) { const s = document.createElement("style"); s.id = "ptCss"; s.textContent = css; document.head.appendChild(s); }
    // the dashboard refreshes every minute: don't wipe something the admin is typing in
    if (D && body.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    try { D = await call("list"); if (open) detail = await call("ledger?id=" + encodeURIComponent(open)); }
    catch (e) { body.innerHTML = `<div class="wpa-empty">Couldn't load partners: ${esc(e.message)}</div>`; return; }
    draw();
  }

  function draw() {
    label();
    const R = D.rows, f = q.trim().toLowerCase();
    const L = R.slice().sort((a, b) => (b.status === "pending") - (a.status === "pending")).filter((p) => !f || [p.firm, p.contact, p.email, p.licence, p.phone, p.city].some((x) => String(x || "").toLowerCase().includes(f)));
    const tot = { pending: R.filter((p) => p.status === "pending").length, firms: R.length, active: R.filter((p) => p.status === "active").length, paid: R.reduce((a, p) => a + (p.paid || 0), 0), submitted: R.reduce((a, p) => a + p.submitted, 0) };
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
      <div class="wpa-card wide"><h3>Partner intake forms</h3>
        <p class="sub" style="margin:0">RCICs and law firms sign up at <a href="/partners/" target="_blank" rel="noopener">workerpool.ca/partners/</a>, buy form credits and send personal links to their own clients. They see only their own clients' forms; you see every form under <b>Intake forms → Partner firms</b>.</p>
        ${tot.pending ? `<div style="background:#f6ebdc;color:#5a3a12;border-radius:12px;padding:10px 14px;font-size:.9rem"><b>${tot.pending} firm${tot.pending > 1 ? "s" : ""} waiting for your approval.</b> Check the licence, then open the firm below and press Approve. They can't buy credits or send forms until you do.</div>` : ""}
        <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:.9rem"><span><b>${tot.firms}</b> firms (${tot.active} active)</span><span><b>${tot.submitted}</b> forms submitted</span><span><b>${money(tot.paid)}</b> paid online</span>
          <span>${D.stripe ? "Stripe payments: on" : "<b style='color:#b3412e'>Stripe payments: off</b> (set STRIPE_SECRET_KEY; until then add credits by hand)"}</span></div>
        <form id="ptPrice" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)">Temporary residence form ($ CAD)<input class="ik-in" id="ptTr" type="number" step="0.01" min="0.5" value="${(D.prices.tr / 100).toFixed(2)}" style="width:150px"></label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)">Permanent residence form ($ CAD)<input class="ik-in" id="ptPr" type="number" step="0.01" min="0.5" value="${(D.prices.pr / 100).toFixed(2)}" style="width:150px"></label>
          <button class="ik-btn" type="submit">Save prices</button><span class="ik-note" id="ptPriceMsg">New purchases use these prices. ${D.ready.pr ? "" : "Permanent residence forms aren't built yet, so firms can't buy them yet."}</span></form></div>
      <div class="wpa-card wide"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3>Firms</h3>
        <input id="ptQ" class="ik-in" type="search" placeholder="Search firm, contact, email, licence…" value="${esc(q)}" style="width:260px"></div>
        ${L.length ? `<div class="wpa-tbl"><table><thead><tr><th>Firm</th><th>Contact</th><th>Status</th><th>Credits left</th><th>Links</th><th>Forms</th><th>Paid</th><th>Joined</th></tr></thead><tbody>
          ${L.map((p) => `<tr class="ik-row${open === p.id ? " new" : ""}" data-p="${p.id}" tabindex="0"><td><b>${esc(p.firm)}</b><br><span class="ik-note">${esc(p.kind_label)} · ${esc(p.licence)}</span></td>
            <td>${esc(p.contact)}<br><span class="ik-note">${esc(p.email)} · ${esc(p.phone)}</span></td>
            <td>${p.status === "active" ? `<span class="ik-badge sub">Active</span>` : p.status === "pending" ? `<span class="ik-badge new" style="background:var(--accent);color:var(--surface);border-color:var(--accent)">Needs approval</span>` : p.status === "declined" ? `<span class="ik-badge">Declined</span>` : `<span class="ik-badge edit">Paused</span>`}</td>
            <td>TR ${p.credits_tr} · PR ${p.credits_pr}</td><td>${p.links}</td><td>${p.submitted} submitted${p.filling ? ` · ${p.filling} filling` : ""}</td><td>${money(p.paid)}</td>
            <td>${when(p.created)}<br><span class="ik-note">Last sign-in ${when(p.last_login)}</span></td></tr>
            ${open === p.id ? `<tr><td colspan="8" style="background:var(--surface)">${detailHtml(p)}</td></tr>` : ""}`).join("")}
        </tbody></table></div>` : `<div class="wpa-empty">${R.length ? "No firm matches that search." : "No partner firms yet. Share workerpool.ca/partners/ with RCICs and law firms."}</div>`}</div>
      ${D.payments.length ? `<div class="wpa-card wide"><h3>Payments</h3><div class="wpa-tbl"><table><thead><tr><th>Date</th><th>Firm</th><th>Temporary</th><th>Permanent</th><th>Amount</th><th>Stripe session</th></tr></thead><tbody>
        ${D.payments.map((x) => `<tr><td>${when(x.created)}</td><td>${esc(x.firm || "–")}</td><td>${x.tr}</td><td>${x.pr}</td><td>${money(x.amount)} ${esc(String(x.currency || "").toUpperCase())}</td><td class="ik-note">${esc(x.session_id.slice(0, 24))}…</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}</div>`;
    wire();
  }

  function detailHtml(p) {
    const d = detail || { ledger: [], links: [] };
    const reg = p.kind === "rcic" ? `<a href="https://college-ic.ca/" target="_blank" rel="noopener">Check licence on the CICC register ↗</a>` : "";
    return `<div style="display:flex;flex-direction:column;gap:12px;padding:6px 0">
      <div class="ik-note">${[p.website ? `<a href="${esc(/^https?:/.test(p.website) ? p.website : "https://" + p.website)}" target="_blank" rel="noopener">${esc(p.website)}</a>` : "", esc([p.city, p.province].filter(Boolean).join(", ")), reg].filter(Boolean).join(" · ")}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)">Credits<select class="ik-in" id="ptK"><option value="tr">Temporary residence</option><option value="pr">Permanent residence</option></select></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)">Add (or −remove)<input class="ik-in" id="ptN" type="number" value="1" style="width:110px"></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted);flex:1;min-width:180px">Reason (shown to the firm)<input class="ik-in" id="ptWhy" placeholder="e.g. paid by e-Transfer, free trial"></label>
        <button class="ik-btn" type="button" id="ptGrant">Update credits</button></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted);flex:1;min-width:220px">Private note (only you see it)<textarea class="ik-in" id="ptNote" rows="2">${esc(p.admin_note || "")}</textarea></label>
        <button class="ik-btn g" type="button" id="ptSaveNote">Save note</button>
        ${p.status === "pending" ? `<button class="ik-btn" type="button" id="ptApprove">Approve firm</button><button class="ik-btn red" type="button" id="ptDecline">Decline</button>` : p.status === "active" ? `<button class="ik-btn red" type="button" id="ptPause" title="Signs them out, stops their links working and stops new links">Pause account</button>` : `<button class="ik-btn" type="button" id="ptResume">Reactivate account</button>`}</div>
      <div class="ik-note" id="ptMsg"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><b style="font-size:.85rem">Client links (${d.links.length})</b><div class="wpa-tbl"><table style="min-width:0"><tbody>${d.links.map((v) => `<tr><td>${esc(v.label || "–")}<br><span class="ik-note">${esc(v.form_key)} · ${when(v.created)}</span></td><td>${v.archived ? (v.refunded ? "Off · refunded" : "Off") : v.done ? "Submitted" : v.opens ? `Opened ${v.opens}×` : "Not opened"}</td></tr>`).join("") || `<tr><td class="ik-note">None yet</td></tr>`}</tbody></table></div></div>
        <div><b style="font-size:.85rem">Credit history</b><div class="wpa-tbl"><table style="min-width:0"><tbody>${d.ledger.map((x) => `<tr><td>${when(x.created)}</td><td>${x.delta > 0 ? "+" : ""}${x.delta} ${x.kind.toUpperCase()}</td><td class="ik-note">${esc(x.reason || "")}</td></tr>`).join("") || `<tr><td class="ik-note">No changes yet</td></tr>`}</tbody></table></div></div>
      </div></div>`;
  }

  function wire() {
    const $ = (s) => body.querySelector(s);
    $("#ptPrice").onsubmit = async (e) => { e.preventDefault(); try { await post("prices", { tr: $("#ptTr").value, pr: $("#ptPr").value }); $("#ptPriceMsg").textContent = "Saved ✓"; D = await call("list"); } catch (x) { $("#ptPriceMsg").textContent = x.message; } };
    const qi = $("#ptQ"); qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; draw(); const n = $("#ptQ"); n.focus(); n.setSelectionRange(pos, pos); };
    body.querySelectorAll("[data-p]").forEach((tr) => { const go = async () => { open = open === tr.dataset.p ? null : tr.dataset.p; detail = null; if (open) { try { detail = await call("ledger?id=" + encodeURIComponent(open)); } catch (e) {} } draw(); }; tr.onclick = go; tr.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
    if (!open) return;
    const p = D.rows.find((x) => x.id === open), msg = (t) => $("#ptMsg").textContent = t;
    const refresh = async () => { D = await call("list"); detail = await call("ledger?id=" + encodeURIComponent(open)); draw(); };
    $("#ptGrant").onclick = async () => { const n = parseInt($("#ptN").value); if (!n) return msg("Enter a number."); try { await post("grant", { id: open, kind: $("#ptK").value, qty: n, note: $("#ptWhy").value }); await refresh(); } catch (e) { msg(e.message); } };
    $("#ptSaveNote").onclick = async () => { try { await post("status", { id: open, note: $("#ptNote").value }); msg("Saved ✓"); p.admin_note = $("#ptNote").value; } catch (e) { msg(e.message); } };
    const pz = $("#ptPause"); if (pz) pz.onclick = async () => { if (!confirm(`Pause ${p.firm}? They're signed out, their client links stop working and they can't create new ones. Forms already submitted stay.`)) return; await post("status", { id: open, status: "suspended" }); await refresh(); };
    const ap = $("#ptApprove"); if (ap) ap.onclick = async () => { if (!confirm(`Approve ${p.firm} (${p.licence})? They're emailed and can start buying credits and sending forms.`)) return; await post("status", { id: open, status: "active" }); await refresh(); };
    const dc = $("#ptDecline"); if (dc) dc.onclick = async () => { const reason = prompt(`Decline ${p.firm}? Optional reason to include in the email to them:`, ""); if (reason === null) return; await post("status", { id: open, status: "declined", reason }); await refresh(); };
    const rs = $("#ptResume"); if (rs) rs.onclick = async () => { await post("status", { id: open, status: "active" }); await refresh(); };
  }

  function label() { const t = document.getElementById("ptTab"); if (!t || !D) return; const n = D.rows.filter((p) => p.status === "pending").length; t.textContent = n ? `Partners (${n} to approve)` : "Partners"; t.style.fontWeight = n ? "700" : ""; }
  let bIv = null;
  async function badge(key) { if (key) KEY = key; if (!KEY) return; try { D = await call("list"); label(); } catch (e) {} if (!bIv) bIv = setInterval(() => { if (!document.hidden && !body) badge(); }, 60000); }
  window.WPPartners = { load, badge };
})();
try { const k = sessionStorage.getItem("wp_admin"); if (k) window.WPPartners.badge(k); } catch (e) {}
