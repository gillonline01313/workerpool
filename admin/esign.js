/* Admin → eSign. Three parts:
   • Envelopes: send documents for signature as WorkerPool (no limits) and see every subscriber's envelopes (master view).
   • Plans & offers: subscription plans (price, envelopes a month, free trial such as "first month free"), promo codes
     (percent off for N months, free months, free access) and whether new subscriptions are open.
   • Subscribers: everyone with an eSign subscription, their usage, and free access you grant by hand.
   Sender screens come from /assets/esign-ui.js. Loaded by admin/index.html. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (t) => t ? new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "–";
  const money = (c) => "$" + ((c || 0) / 100).toFixed(2);
  let KEY = "", host = null, wrap = null, part = "env", ui = null, bill = null, editPlan = null, editPromo = null;

  async function call(path, body) {
    const r = await fetch("/api/esign/admin/" + path, { method: body ? "POST" : "GET", headers: { "x-admin-key": KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Request failed");
    return j;
  }

  async function load(key, el) {
    KEY = key; host = el;
    if (wrap && el.contains(wrap)) { if (part === "env" && ui) ui.refresh(); return; }  // the dashboard refreshes every minute: keep what's on screen
    if (wrap) { el.innerHTML = ""; el.appendChild(wrap); if (part === "env" && ui) ui.refresh(); return; } // back from another tab: same screen as before
    wrap = document.createElement("div"); wrap.style.cssText = "display:flex;flex-direction:column;gap:14px";
    wrap.innerHTML = `<div class="wpa-card wide" style="gap:10px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <h3 style="margin:0">eSign</h3><div class="es-seg" id="esPart" style="display:flex;gap:4px;flex-wrap:wrap"></div></div>
        <p class="sub" style="margin:0">Send any PDF for electronic signature. Signers confirm a one-time email code, every action is logged with time and IP in a tamper-evident audit trail, and the signed PDF comes with a Certificate of Completion. Anyone can check a copy at <a href="/esign/verify/" target="_blank" rel="noopener">workerpool.ca/esign/verify/</a>. Others use it through a subscription at <a href="/esign/" target="_blank" rel="noopener">workerpool.ca/esign/</a>.</p></div>
      <div id="esPartBody"></div>`;
    el.innerHTML = ""; el.appendChild(wrap);
    drawNav(); show();
  }
  function drawNav() {
    const n = wrap.querySelector("#esPart");
    n.innerHTML = [["env", "Envelopes"], ["plans", "Plans & offers"], ["subs", "Subscribers"]].map(([k, l]) => `<button type="button" data-p="${k}" aria-pressed="${part === k}" style="font:inherit;font-size:.82rem;font-weight:600;border:1px solid var(--line);background:${part === k ? "var(--accent)" : "var(--surface)"};color:${part === k ? "var(--surface)" : "var(--muted)"};padding:6px 13px;border-radius:999px;cursor:pointer">${l}</button>`).join("");
    n.querySelectorAll("button").forEach((b) => b.onclick = () => { part = b.dataset.p; drawNav(); show(); });
  }
  async function show() {
    const b = wrap.querySelector("#esPartBody");
    if (part === "env") {
      if (!window.WPEsign) { b.innerHTML = `<div class="wpa-empty">eSign didn't load. Refresh the page.</div>`; return; }
      if (!ui) { const d = document.createElement("div"); ui = window.WPEsign.mount(d, { base: "/api/esign/admin/", headers: { "x-admin-key": KEY }, admin: true }); ui.el = d; }
      b.innerHTML = ""; b.appendChild(ui.el); return;
    }
    b.innerHTML = `<div class="wpa-empty">Loading…</div>`;
    try { bill = await call("bill"); } catch (e) { b.innerHTML = `<div class="wpa-empty">Couldn't load: ${esc(e.message)}</div>`; return; }
    if (part === "plans") drawPlans(b); else drawSubs(b);
  }

  const inp = "font:inherit;font-size:.88rem;padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg)";
  const lab = "display:flex;flex-direction:column;gap:4px;font-size:.76rem;font-weight:600;color:var(--muted)";
  const btn = (cls = "") => `font:inherit;font-weight:600;font-size:.84rem;padding:8px 15px;border-radius:999px;cursor:pointer;border:1px solid ${cls === "g" ? "var(--line)" : cls === "red" ? "#b3412e" : "var(--accent)"};background:${cls ? "transparent" : "var(--accent)"};color:${cls === "red" ? "#b3412e" : cls === "g" ? "var(--fg)" : "var(--surface)"}`;

  function drawPlans(b) {
    const P = bill.plans, R = bill.promos;
    const pf = editPlan || {};
    const rf = editPromo || { kind: "free_months", value: 1, months: 3 };
    b.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="wpa-card wide"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">Subscriptions</h3>
        <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="pOpen" ${bill.open ? "checked" : ""}> Open to new subscribers</label></div>
        <p class="sub" style="margin:0">${bill.stripe ? "Stripe is on: subscribers pay by card and are billed automatically every month or year." : "<b style='color:#b3412e'>Stripe is off</b> (set STRIPE_SECRET_KEY). Until then only free plans, 100% promo codes and free access you grant work."} Prices are in CAD.</p></div>

      <div class="wpa-card wide"><h3>Plans</h3>
        <div class="wpa-tbl"><table><thead><tr><th>Plan</th><th>Price</th><th>Envelopes</th><th>Free trial</th><th>Card at sign-up</th><th>Shown</th><th></th></tr></thead><tbody>
        ${P.map((p) => `<tr><td><b>${esc(p.name)}</b><br><span class="ik-note" style="font-size:.8rem;color:var(--muted)">${esc(p.blurb || "")}</span></td><td>${p.price_cents ? money(p.price_cents) + "/" + (p.interval === "year" ? "year" : "month") : "Free"}</td>
          <td>${p.envelopes || "Unlimited"}${p.envelopes ? "/" + (p.interval === "year" ? "year" : "month") : ""}</td><td>${p.trial_days ? esc(p.text.trial) : "–"}</td><td>${p.trial_days ? (p.card_upfront ? "Yes" : "No, only when the trial ends") : "–"}</td>
          <td>${p.active ? "Yes" : "Hidden"}</td><td style="white-space:nowrap"><button type="button" data-ep="${esc(p.id)}" style="${btn("g")};padding:5px 11px">Edit</button> <button type="button" data-dp="${esc(p.id)}" style="${btn("red")};padding:5px 11px">Delete</button></td></tr>`).join("") || `<tr><td colspan="7">No plans yet.</td></tr>`}
        </tbody></table></div>
        <form id="pForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;border-top:1px solid var(--line);padding-top:12px">
          <b style="width:100%">${pf.id ? "Edit plan: " + esc(pf.name) : "Add a plan"}</b>
          <label style="${lab}">Name<input style="${inp};width:150px" name="name" required maxlength="60" value="${esc(pf.name || "")}"></label>
          <label style="${lab}">Price ($ CAD, 0 = free)<input style="${inp};width:110px" name="price" type="number" step="0.01" min="0" value="${pf.price_cents != null ? (pf.price_cents / 100).toFixed(2) : "15.00"}"></label>
          <label style="${lab}">Billed<select style="${inp}" name="interval"><option value="month">Monthly</option><option value="year">Yearly</option></select></label>
          <label style="${lab}">Envelopes per period (0 = unlimited)<input style="${inp};width:120px" name="envelopes" type="number" min="0" value="${pf.envelopes ?? 10}"></label>
          <label style="${lab}">Free trial days (30 = first month free)<input style="${inp};width:120px" name="trial_days" type="number" min="0" max="365" value="${pf.trial_days ?? 30}"></label>
          <label style="${lab}">Order<input style="${inp};width:70px" name="sort" type="number" value="${pf.sort ?? P.length + 1}"></label>
          <label style="${lab};flex:1;min-width:220px">Short description<input style="${inp}" name="blurb" maxlength="160" value="${esc(pf.blurb || "")}" placeholder="e.g. For individuals: 10 envelopes a month"></label>
          <label style="display:flex;gap:6px;align-items:center;font-size:.84rem"><input type="checkbox" name="card_upfront" ${pf.card_upfront === 0 ? "" : "checked"}> Ask for a card when the trial starts</label>
          <label style="display:flex;gap:6px;align-items:center;font-size:.84rem"><input type="checkbox" name="active" ${pf.active === 0 ? "" : "checked"}> Show on the pricing page</label>
          <button type="submit" style="${btn()}">${pf.id ? "Save plan" : "Add plan"}</button>${pf.id ? `<button type="button" id="pCancel" style="${btn("g")}">Cancel</button>` : ""}<span id="pMsg" style="font-size:.84rem;color:#b3412e"></span></form>
        <p style="margin:0;font-size:.8rem;color:var(--muted)">Price changes apply to new subscribers. People already subscribed keep the price they signed up at (change theirs in Stripe if needed). A plan someone is on can't be deleted; it's hidden instead.</p></div>

      <div class="wpa-card wide"><h3>Offers and promo codes</h3>
        <p class="sub" style="margin:0">A code the subscriber types at checkout, or an <b>automatic offer</b> that applies to everyone without a code while it's running (for example “first 3 months free” during a launch). Free trial days on the plan apply once per account; a free-months offer adds to them. A percent-off discount's months count from sign-up, free trial included (Stripe's rule).</p>
        <div class="wpa-tbl"><table><thead><tr><th>Code</th><th>Offer</th><th>Plan</th><th>How</th><th>Used</th><th>Ends</th><th>Status</th><th></th></tr></thead><tbody>
        ${R.map((p) => `<tr><td><b>${esc(p.code)}</b>${p.note ? `<br><span style="font-size:.78rem;color:var(--muted)">${esc(p.note)}</span>` : ""}</td><td>${esc(p.text)}</td><td>${esc((P.find((x) => x.id === p.plan_id) || {}).name || "Any plan")}</td>
          <td>${p.auto ? "Automatic" : "Code"}</td><td>${p.uses}${p.max_uses ? " / " + p.max_uses : ""}</td><td>${p.expires ? esc(p.expires) : "No end"}</td><td>${p.active ? "On" : "Off"}</td>
          <td style="white-space:nowrap"><button type="button" data-er="${esc(p.code)}" style="${btn("g")};padding:5px 11px">Edit</button> <button type="button" data-dr="${esc(p.code)}" style="${btn("red")};padding:5px 11px">Delete</button></td></tr>`).join("") || `<tr><td colspan="8">No offers yet.</td></tr>`}
        </tbody></table></div>
        <form id="rForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;border-top:1px solid var(--line);padding-top:12px">
          <b style="width:100%">${editPromo && editPromo.code ? "Edit offer " + esc(editPromo.code) : "Add an offer"}</b>
          <label style="${lab}">Code<input style="${inp};width:140px;text-transform:uppercase" name="code" required maxlength="32" value="${esc(rf.code || "")}" ${editPromo && editPromo.code ? "readonly" : ""} placeholder="LAUNCH3"></label>
          <label style="${lab}">Offer<select style="${inp}" name="kind" id="rKind"><option value="free_months">Free months</option><option value="percent">Percent off</option><option value="free_forever">Free access (no charge)</option></select></label>
          <label style="${lab}" id="rValL">Value<input style="${inp};width:90px" name="value" type="number" min="1" max="100" value="${rf.value ?? 1}"></label>
          <label style="${lab}" id="rMonL">Discount lasts<select style="${inp}" name="months"><option value="0">First payment only</option>${[1, 2, 3, 6, 12].map((n) => `<option value="${n}">${n} month${n > 1 ? "s" : ""}</option>`).join("")}<option value="forever">Forever</option></select></label>
          <label style="${lab}">Plan<select style="${inp}" name="plan_id"><option value="">Any plan</option>${P.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
          <label style="${lab}">Max uses (blank = no limit)<input style="${inp};width:110px" name="max_uses" type="number" min="1" value="${rf.max_uses || ""}"></label>
          <label style="${lab}">Last day (optional)<input style="${inp}" name="expires" type="date" value="${esc(rf.expires || "")}"></label>
          <label style="${lab};flex:1;min-width:160px">Note (only you see it)<input style="${inp}" name="note" maxlength="200" value="${esc(rf.note || "")}"></label>
          <label style="display:flex;gap:6px;align-items:center;font-size:.84rem"><input type="checkbox" name="auto" ${rf.auto ? "checked" : ""}> Automatic (no code needed)</label>
          <label style="display:flex;gap:6px;align-items:center;font-size:.84rem"><input type="checkbox" name="active" ${rf.active === 0 ? "" : "checked"}> On</label>
          <button type="submit" style="${btn()}">${editPromo && editPromo.code ? "Save offer" : "Add offer"}</button>${editPromo && editPromo.code ? `<button type="button" id="rCancel" style="${btn("g")}">Cancel</button>` : ""}<span id="rMsg" style="font-size:.84rem;color:#b3412e"></span></form></div></div>`;
    const pF = b.querySelector("#pForm"), rF = b.querySelector("#rForm");
    pF.interval.value = pf.interval || "month";
    rF.kind.value = rf.kind || "free_months"; rF.months.value = rf.months >= 999 ? "forever" : String(rf.months ?? 0); rF.plan_id.value = rf.plan_id || "";
    const kindUi = () => { const k = rF.kind.value; b.querySelector("#rValL").style.display = k === "free_forever" ? "none" : ""; b.querySelector("#rValL").firstChild.textContent = k === "percent" ? "Percent off" : "Free months"; b.querySelector("#rMonL").style.display = k === "percent" ? "" : "none"; };
    rF.kind.onchange = kindUi; kindUi();
    b.querySelector("#pOpen").onchange = async (ev) => { try { await call("settings", { open: ev.target.checked }); } catch (x) { alert(x.message); } };
    pF.onsubmit = async (ev) => {
      ev.preventDefault();
      try { await call("plan-save", { id: pf.id, name: pF.elements.namedItem("name").value, price: pF.price.value, interval: pF.interval.value, envelopes: pF.envelopes.value, trial_days: pF.trial_days.value,
        sort: pF.sort.value, blurb: pF.blurb.value, card_upfront: pF.card_upfront.checked, active: pF.active.checked }); editPlan = null; show(); }
      catch (x) { b.querySelector("#pMsg").textContent = x.message; }
    };
    rF.onsubmit = async (ev) => {
      ev.preventDefault();
      try { await call("promo-save", { code: rF.code.value, kind: rF.kind.value, value: rF.value.value, months: rF.months.value, plan_id: rF.plan_id.value, max_uses: rF.max_uses.value,
        expires: rF.expires.value, note: rF.note.value, auto: rF.auto.checked, active: rF.active.checked }); editPromo = null; show(); }
      catch (x) { b.querySelector("#rMsg").textContent = x.message; }
    };
    if (b.querySelector("#pCancel")) b.querySelector("#pCancel").onclick = () => { editPlan = null; show(); };
    if (b.querySelector("#rCancel")) b.querySelector("#rCancel").onclick = () => { editPromo = null; show(); };
    b.querySelectorAll("[data-ep]").forEach((x) => x.onclick = () => { editPlan = P.find((p) => p.id === x.dataset.ep); drawPlans(b); pF.scrollIntoView && b.querySelector("#pForm").scrollIntoView({ behavior: "smooth", block: "center" }); });
    b.querySelectorAll("[data-dp]").forEach((x) => x.onclick = async () => { if (!confirm("Delete this plan?")) return; try { const r = await call("plan-delete", { id: x.dataset.dp }); if (r.hidden) alert("Someone is on this plan, so it was hidden instead of deleted."); show(); } catch (e) { alert(e.message); } });
    b.querySelectorAll("[data-er]").forEach((x) => x.onclick = () => { editPromo = R.find((p) => p.code === x.dataset.er); drawPlans(b); b.querySelector("#rForm").scrollIntoView({ behavior: "smooth", block: "center" }); });
    b.querySelectorAll("[data-dr]").forEach((x) => x.onclick = async () => { if (!confirm("Delete this offer? People who already used it keep their discount.")) return; try { await call("promo-delete", { code: x.dataset.dr }); show(); } catch (e) { alert(e.message); } });
  }

  const SUBST = { trialing: "Free trial", active: "Active", past_due: "Payment failed", canceled: "Cancelled", comp: "Free access (given by you)", free: "Free", incomplete: "Payment not finished", unpaid: "Unpaid" };
  function drawSubs(b) {
    const S = bill.subs, P = bill.plans;
    const live = S.filter((s) => ["trialing", "active", "comp", "free"].includes(s.status));
    b.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="wpa-card wide"><h3>Subscribers</h3>
        <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:.9rem"><span><b>${live.length}</b> with access</span><span><b>${S.filter((s) => s.status === "trialing").length}</b> on a free trial</span><span><b>${S.filter((s) => s.status === "active").length}</b> paying</span><span><b>${S.filter((s) => s.status === "comp").length}</b> free access</span></div>
        <div class="wpa-tbl"><table><thead><tr><th>Person</th><th>Plan</th><th>Status</th><th>Renews / ends</th><th>Envelopes sent</th><th>Offer</th><th></th></tr></thead><tbody>
        ${S.map((s) => { const p = P.find((x) => x.id === s.plan_id); return `<tr><td><b>${esc(s.name || "–")}</b><br><span style="font-size:.8rem;color:var(--muted)">${esc(s.email || s.user_id)}</span></td>
          <td>${esc(p ? p.name : s.plan_id)}</td><td>${esc(SUBST[s.status] || s.status)}${s.cancel_at_end ? "<br><span style='font-size:.78rem;color:#b3412e'>Cancels at period end</span>" : ""}${s.comp_note ? `<br><span style="font-size:.78rem;color:var(--muted)">${esc(s.comp_note)}</span>` : ""}</td>
          <td>${s.status === "comp" ? (s.comp_until ? "Until " + esc(s.comp_until) : "No end date") : s.status === "trialing" ? "Trial ends " + when(s.trial_end) : when(s.period_end)}</td>
          <td>${s.sent} (${s.completed} completed)</td><td>${esc(s.promo || "–")}</td>
          <td>${["trialing", "active", "comp", "free", "past_due"].includes(s.status) ? `<button type="button" data-end="${esc(s.user_id)}" data-stripe="${s.stripe_sub ? 1 : 0}" style="${btn("red")};padding:5px 11px">End access</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="7">No subscribers yet. Share workerpool.ca/esign/.</td></tr>`}
        </tbody></table></div></div>
      <div class="wpa-card wide"><h3>Give free access</h3>
        <p class="sub" style="margin:0">For a partner, a friend or a trial you arrange yourself. They need a WorkerPool account first (they can create one at workerpool.ca/esign/). No card, no Stripe.</p>
        <form id="cForm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <label style="${lab}">Their account email<input style="${inp};width:230px" name="email" type="email" required></label>
          <label style="${lab}">Plan limits<select style="${inp}" name="plan_id">${P.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.envelopes || "unlimited"} envelopes)</option>`).join("")}</select></label>
          <label style="${lab}">Until (blank = no end)<input style="${inp}" name="until" type="date"></label>
          <label style="${lab};flex:1;min-width:160px">Note<input style="${inp}" name="note" maxlength="200" placeholder="e.g. Partner firm, 3 months free"></label>
          <label style="display:flex;gap:6px;align-items:center;font-size:.84rem"><input type="checkbox" name="notify" checked> Email them</label>
          <button type="submit" style="${btn()}">Give access</button><span id="cMsg" style="font-size:.84rem"></span></form></div></div>`;
    const f = b.querySelector("#cForm");
    f.onsubmit = async (ev) => {
      ev.preventDefault(); const m = b.querySelector("#cMsg");
      try { await call("comp", { email: f.email.value, plan_id: f.plan_id.value, until: f.until.value, note: f.note.value, notify: f.notify.checked }); show(); }
      catch (x) { m.style.color = "#b3412e"; m.textContent = x.message; }
    };
    b.querySelectorAll("[data-end]").forEach((x) => x.onclick = async () => {
      const stripe = x.dataset.stripe === "1";
      const nowEnd = stripe ? confirm("End this paid subscription immediately?\n\nOK = end now (no refund is issued automatically)\nCancel = let it run to the end of the paid period") : confirm("End this person's access now?");
      if (!stripe && !nowEnd) return;
      try { await call("sub-end", { user_id: x.dataset.end, now: nowEnd }); show(); } catch (e) { alert(e.message); }
    });
  }

  window.WPEsignAdmin = { load };
})();
