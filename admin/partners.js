/* Admin → Partners. RCICs and law firms who use WorkerPool intake forms for their own clients:
   prices per form, every firm with its credits, links and forms, pause/activate, add or remove credits,
   and every payment. Their clients' forms themselves appear under Intake forms (filter "Partner firms").
   Loaded by admin/index.html. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (t) => t ? new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
  const money = (c) => "$" + ((c || 0) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let KEY = "", body = null, D = null, open = null, detail = null, q = "", adding = false, made = null;
  const KINDS = [["rcic", "Regulated Canadian Immigration Consultant (RCIC)"], ["lawyer", "Lawyer"], ["paralegal", "Paralegal (Law Society of Ontario)"], ["notary", "Notary (Quebec)"], ["firm", "Immigration law or consulting firm"]];
  const PROV = ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Northwest Territories", "Nunavut", "Yukon", "Outside Canada"];
  const lbl = (t, inner, extra = "") => `<label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)${extra}">${t}${inner}</label>`;
  const own = (p, k) => p["price_" + k] === 0 || p["price_" + k] >= 50;
  const priceOf = (p, k) => own(p, k) ? p["price_" + k] : D.prices[k];
  const custom = (p) => own(p, "tr") || own(p, "pr");
  const pm = (c) => c === 0 ? "Free" : money(c);
  const notSetUp = (p) => p.added_by === "admin" && !p.agreed_at;
  const credText = (p, k) => `${k.toUpperCase()} ${(p["credits_" + k] || 0) + (p["free_" + k] || 0)}${p["free_" + k] ? ` <span class="ik-note">(${p["free_" + k]} free)</span>` : ""}`;

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
          <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted)">Permanent residence & citizenship form ($ CAD)<input class="ik-in" id="ptPr" type="number" step="0.01" min="0.5" value="${(D.prices.pr / 100).toFixed(2)}" style="width:150px"></label>
          <button class="ik-btn" type="submit">Save standard prices</button><span class="ik-note" id="ptPriceMsg">Standard prices for every firm without its own price. ${D.ready.pr ? "" : "Permanent residence and citizenship forms aren't built yet, so firms can't buy them yet."}</span></form>
        <div><button class="ik-btn${adding ? " g" : ""}" type="button" id="ptAdd">${adding ? "Close" : "+ Sign up a partner firm"}</button></div>
        ${made ? madeHtml() : ""}${adding ? addHtml() : ""}</div>
      <div class="wpa-card wide"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3>Firms</h3>
        <input id="ptQ" class="ik-in" type="search" placeholder="Search firm, contact, email, licence…" value="${esc(q)}" style="width:260px"></div>
        ${L.length ? `<div class="wpa-tbl"><table><thead><tr><th>Firm</th><th>Contact</th><th>Status</th><th>Price per form</th><th>Forms left</th><th>Links</th><th>Forms</th><th>Paid</th><th>Joined</th></tr></thead><tbody>
          ${L.map((p) => `<tr class="ik-row${open === p.id ? " new" : ""}" data-p="${p.id}" tabindex="0"><td><b>${esc(p.firm)}</b><br><span class="ik-note">${esc(p.kind_label)} · ${esc(p.licence)}</span></td>
            <td>${esc(p.contact)}<br><span class="ik-note">${esc(p.email)} · ${esc(p.phone)}</span></td>
            <td>${p.status === "active" && notSetUp(p) ? `<span class="ik-badge edit" title="You signed them up; they haven't set their password yet">Invited · not set up</span>` : p.status === "active" ? `<span class="ik-badge sub">Active</span>` : p.status === "pending" ? `<span class="ik-badge new" style="background:var(--accent);color:var(--surface);border-color:var(--accent)">Needs approval</span>` : p.status === "declined" ? `<span class="ik-badge">Declined</span>` : `<span class="ik-badge edit">Paused</span>`}</td>
            <td>TR ${pm(priceOf(p, "tr"))} · PR ${pm(priceOf(p, "pr"))}${custom(p) ? `<br><span class="ik-badge sub">Own price</span>` : ""}</td>
            <td>${credText(p, "tr")} · ${credText(p, "pr")}</td><td>${p.links}</td><td>${p.submitted} submitted${p.filling ? ` · ${p.filling} filling` : ""}</td><td>${money(p.paid)}</td>
            <td>${when(p.created)}<br><span class="ik-note">Last sign-in ${when(p.last_login)}</span></td></tr>
            ${open === p.id ? `<tr><td colspan="9" style="background:var(--surface)">${detailHtml(p)}</td></tr>` : ""}`).join("")}
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
      ${notSetUp(p) ? `<div style="background:#f6ebdc;color:#5a3a12;border-radius:12px;padding:10px 14px;font-size:.88rem;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span><b>Not set up yet.</b> You signed this firm up ${when(p.invited_at || p.created)}; they haven't chosen a password. A set-up link works for 14 days.</span>
        <button class="ik-btn g" type="button" id="ptLink">New set-up link</button><button class="ik-btn g" type="button" id="ptLinkSend">Email a new set-up link</button></div>` : ""}
      <div style="border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">
        <b style="font-size:.85rem">Price for this firm</b>
        <form id="ptFP" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          ${lbl("Temporary residence ($ CAD)", `<input class="ik-in" id="ptFTr" type="number" step="0.01" min="0" placeholder="${(D.prices.tr / 100).toFixed(2)} standard" value="${own(p, "tr") ? (p.price_tr / 100).toFixed(2) : ""}" style="width:170px">`)}
          ${lbl("Permanent residence & citizenship ($ CAD)", `<input class="ik-in" id="ptFPr" type="number" step="0.01" min="0" placeholder="${(D.prices.pr / 100).toFixed(2)} standard" value="${own(p, "pr") ? (p.price_pr / 100).toFixed(2) : ""}" style="width:170px">`)}
          <button class="ik-btn" type="submit">Save price</button>${custom(p) ? `<button class="ik-btn g" type="button" id="ptFPStd">Use standard prices</button>` : ""}</form>
        <span class="ik-note">Leave a box empty for the standard price. Enter <b>0</b> to make that form type free for this firm: unlimited client links, no credits needed. Otherwise the lowest price is $0.50 (card payments). Applies to their next purchases and links; credits they already have stay.</span></div>
      <div style="border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">
        <b style="font-size:.85rem">Forms on the account</b>
        <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:.88rem"><span>Complimentary: <b>TR ${p.free_tr || 0} · PR ${p.free_pr || 0}</b> left${p.comp_used ? ` · ${p.comp_used} used` : ""}</span><span>Paid credits: <b>TR ${p.credits_tr || 0} · PR ${p.credits_pr || 0}</b></span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          ${lbl("Type", `<select class="ik-in" id="ptT"><option value="comp">Complimentary (free)</option><option value="paid">Paid credits (e.g. e-Transfer)</option></select>`)}
          ${lbl("Form", `<select class="ik-in" id="ptK"><option value="tr">Temporary residence</option><option value="pr">Permanent residence & citizenship</option></select>`)}
          ${lbl("Add (or −remove)", `<input class="ik-in" id="ptN" type="number" value="1" style="width:110px">`)}
          ${lbl("Reason (shown to the firm)", `<input class="ik-in" id="ptWhy" placeholder="e.g. welcome offer, paid by e-Transfer">`, ";flex:1;min-width:180px")}
          <button class="ik-btn" type="button" id="ptGrant">Update forms</button></div>
        <label class="ik-note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ptNotify" checked> Email the firm when I add complimentary forms</label>
        <span class="ik-note">Complimentary forms are used first whenever the firm creates a client link; then paid credits. A complimentary link turned off before the client starts it goes back as complimentary.</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--muted);flex:1;min-width:220px">Private note (only you see it)<textarea class="ik-in" id="ptNote" rows="2">${esc(p.admin_note || "")}</textarea></label>
        <button class="ik-btn g" type="button" id="ptSaveNote">Save note</button>
        ${p.status === "pending" ? `<button class="ik-btn" type="button" id="ptApprove">Approve firm</button><button class="ik-btn red" type="button" id="ptDecline">Decline</button>` : p.status === "active" ? `<button class="ik-btn red" type="button" id="ptPause" title="Signs them out, stops their links working and stops new links">Pause account</button>` : `<button class="ik-btn" type="button" id="ptResume">Reactivate account</button>`}</div>
      <div class="ik-note" id="ptMsg"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><b style="font-size:.85rem">Client links (${d.links.length})</b><div class="wpa-tbl"><table style="min-width:0"><tbody>${d.links.map((v) => `<tr><td>${esc(v.label || "–")}<br><span class="ik-note">${esc(v.form_key)} · ${when(v.created)}</span></td><td>${v.archived ? (v.refunded ? "Off · refunded" : "Off") : v.done ? "Submitted" : v.opens ? `Opened ${v.opens}×` : "Not opened"}<br><span class="ik-note">${v.comp === 2 ? "Free ($0 price)" : v.comp ? "Complimentary" : v.price_cents ? money(v.price_cents) : ""}</span></td></tr>`).join("") || `<tr><td class="ik-note">None yet</td></tr>`}</tbody></table></div></div>
        <div><b style="font-size:.85rem">Credit history</b><div class="wpa-tbl"><table style="min-width:0"><tbody>${d.ledger.map((x) => `<tr><td>${when(x.created)}</td><td>${x.delta > 0 ? "+" : ""}${x.delta} ${x.kind.toUpperCase()}${x.comp ? " <span class='ik-badge sub'>free</span>" : ""}</td><td class="ik-note">${esc(x.reason || "")}</td></tr>`).join("") || `<tr><td class="ik-note">No changes yet</td></tr>`}</tbody></table></div></div>
      </div></div>`;
  }

  function addHtml() {
    const i = (id, ph = "", t = "text", extra = "") => `<input class="ik-in" id="${id}" type="${t}" placeholder="${ph}" ${extra}>`;
    return `<form id="ptNew" style="border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px">
      <b>Sign up a partner firm</b>
      <span class="ik-note">The firm is approved straight away. They get an email with a link to choose their password and accept the partner terms; you can also copy the link and send it by WhatsApp.</span>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px">
        ${lbl("Firm or practice name *", i("nFirm"))}
        ${lbl("Type *", `<select class="ik-in" id="nKind"><option value="">Choose…</option>${KINDS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`)}
        ${lbl("Licence number *", i("nLic", "e.g. R712345"))}
        ${lbl("Contact person *", i("nContact"))}
        ${lbl("Email (they sign in with it) *", i("nEmail", "name@firm.ca", "email"))}
        ${lbl("Phone", i("nPhone", "", "tel"))}
        ${lbl("City", i("nCity"))}
        ${lbl("Province", `<select class="ik-in" id="nProv"><option value="">Choose…</option>${PROV.map((x) => `<option>${x}</option>`).join("")}</select>`)}
        ${lbl("Website", i("nWeb", "https://"))}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px">
        ${lbl("Price · Temporary residence ($)", i("nPTr", (D.prices.tr / 100).toFixed(2) + " standard · 0 = free", "number", 'step="0.01" min="0"'))}
        ${lbl("Price · Permanent residence & citizenship ($)", i("nPPr", (D.prices.pr / 100).toFixed(2) + " standard · 0 = free", "number", 'step="0.01" min="0"'))}
        ${lbl("Complimentary Temporary residence forms", i("nFTr", "0", "number", 'min="0" max="1000"'))}
        ${lbl("Complimentary Permanent residence & citizenship forms", i("nFPr", "0", "number", 'min="0" max="1000"'))}
      </div>
      ${lbl("Private note (only you see it)", `<textarea class="ik-in" id="nNote" rows="2" placeholder="e.g. referred by Gurdeep, agreed $8 per TR form"></textarea>`)}
      <label class="ik-note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="nSend" checked> Email them the set-up link now</label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="ik-btn" type="submit">Sign up firm</button><span class="ik-note" id="nMsg" style="color:#b3412e"></span></div></form>`;
  }
  function madeHtml() {
    const wa = `https://wa.me/?text=${encodeURIComponent(`Hi ${made.contact.split(" ")[0]}, your WorkerPool partner account for ${made.firm} is ready. Set your password here: ${made.link}`)}`;
    return `<div style="background:var(--accent-soft);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">
      <b>${esc(made.title)}${made.emailed ? " · emailed to " + esc(made.email) + " ✓" : made.tried ? " · <span style='color:#b3412e'>email couldn't be sent, copy the link</span>" : ""}</b>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="ik-in" readonly id="ptMade" value="${esc(made.link)}" style="flex:1;min-width:240px">
        <button class="ik-btn" type="button" id="ptCopy">Copy link</button><a class="ik-btn g" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><button class="ik-btn g" type="button" id="ptMadeX">Done</button></div>
      <span class="ik-note">The link works for 14 days and only once. They choose their password and accept the partner terms.</span></div>`;
  }

  function wire() {
    const $ = (s) => body.querySelector(s);
    $("#ptPrice").onsubmit = async (e) => { e.preventDefault(); try { await post("prices", { tr: $("#ptTr").value, pr: $("#ptPr").value }); $("#ptPriceMsg").textContent = "Saved ✓"; D = await call("list"); } catch (x) { $("#ptPriceMsg").textContent = x.message; } };
    $("#ptAdd").onclick = () => { adding = !adding; draw(); if (adding) $("#nFirm").focus(); };
    const mx = $("#ptMadeX"); if (mx) mx.onclick = () => { made = null; draw(); };
    const cp = $("#ptCopy"); if (cp) cp.onclick = async () => { const v = $("#ptMade").value; try { await navigator.clipboard.writeText(v); } catch (e) { $("#ptMade").select(); document.execCommand("copy"); } cp.textContent = "Copied ✓"; setTimeout(() => cp.textContent = "Copy link", 1500); };
    const nf = $("#ptNew"); if (nf) nf.onsubmit = async (e) => {
      e.preventDefault(); const v = (id) => $("#" + id).value.trim(), err = (t) => $("#nMsg").textContent = t;
      const b = { firm: v("nFirm"), kind: v("nKind"), licence: v("nLic"), contact: v("nContact"), email: v("nEmail").toLowerCase(), phone: v("nPhone"), city: v("nCity"), province: v("nProv"), website: v("nWeb"),
        price_tr: v("nPTr"), price_pr: v("nPPr"), free_tr: v("nFTr"), free_pr: v("nFPr"), note: v("nNote"), send: $("#nSend").checked };
      if (!b.firm) return err("Enter the firm name."); if (!b.kind) return err("Choose the type."); if (!b.licence) return err("Enter the licence number.");
      if (!b.contact) return err("Enter the contact person."); if (!/^\S+@\S+\.\S+$/.test(b.email)) return err("Enter a valid email.");
      const btn = nf.querySelector('button[type="submit"]'); btn.disabled = true;
      try { const r = await post("create", b); made = { title: `${b.firm} is signed up and approved`, firm: b.firm, contact: b.contact, email: b.email, link: r.link, emailed: r.emailed, tried: b.send };
        adding = false; open = r.id; D = await call("list"); detail = await call("ledger?id=" + encodeURIComponent(open)); draw(); }
      catch (x) { btn.disabled = false; err(x.message); }
    };
    const qi = $("#ptQ"); qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; draw(); const n = $("#ptQ"); n.focus(); n.setSelectionRange(pos, pos); };
    body.querySelectorAll("[data-p]").forEach((tr) => { const go = async () => { open = open === tr.dataset.p ? null : tr.dataset.p; detail = null; if (open) { try { detail = await call("ledger?id=" + encodeURIComponent(open)); } catch (e) {} } draw(); }; tr.onclick = go; tr.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
    if (!open) return;
    const p = D.rows.find((x) => x.id === open), msg = (t) => $("#ptMsg").textContent = t;
    const refresh = async () => { D = await call("list"); detail = await call("ledger?id=" + encodeURIComponent(open)); draw(); };
    $("#ptGrant").onclick = async () => { const n = parseInt($("#ptN").value); if (!n) return msg("Enter a number."); try { await post("grant", { id: open, kind: $("#ptK").value, qty: n, note: $("#ptWhy").value, comp: $("#ptT").value === "comp", notify: $("#ptNotify").checked }); await refresh(); } catch (e) { msg(e.message); } };
    $("#ptFP").onsubmit = async (e) => { e.preventDefault(); try { await post("firm-prices", { id: open, tr: $("#ptFTr").value, pr: $("#ptFPr").value }); await refresh(); } catch (x) { msg(x.message); } };
    const std = $("#ptFPStd"); if (std) std.onclick = async () => { try { await post("firm-prices", { id: open, tr: "", pr: "" }); await refresh(); } catch (x) { msg(x.message); } };
    const sl = async (send) => { try { const r = await post("setup-link", { id: open, send }); made = { title: `New set-up link for ${p.firm}`, firm: p.firm, contact: p.contact || "", email: p.email, link: r.link, emailed: r.emailed, tried: send }; await refresh(); window.scrollTo({ top: 0, behavior: "smooth" }); } catch (x) { msg(x.message); } };
    const l1 = $("#ptLink"), l2 = $("#ptLinkSend"); if (l1) l1.onclick = () => sl(false); if (l2) l2.onclick = () => sl(true);
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
