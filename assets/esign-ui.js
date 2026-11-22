/* WorkerPool eSign — sender screens, shared by the admin console (admin/esign.js) and the subscriber portal (/esign/).
   Envelope list, envelope builder (upload, recipients, message, drag-and-drop fields on the rendered PDF) and the
   envelope detail view (recipient status, reminders, void, downloads, audit trail).
   Usage: WPEsign.mount(element, { base: "/api/esign/admin/", headers: { "x-admin-key": KEY }, admin: true, me: { name, email }, onNeedPlan })
   Uses the page's CSS variables (--accent, --line, --surface, --fg, --muted, --accent-soft). PDF pages are drawn with pdf.js (assets/vendor/pdfjs). */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (t) => t ? new Date(t).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "–";
  const COLORS = ["#f5c84c", "#7fb8f0", "#9ad19a", "#f2a0a0", "#c7a6ef", "#f4b67a", "#7fd6cf", "#e7a6cf"];
  const FIELDS = [
    { t: "signature", label: "Signature", icon: "✍", w: 170, h: 46 },
    { t: "initials", label: "Initials", icon: "DG", w: 62, h: 40 },
    { t: "date", label: "Date signed", icon: "📅", w: 100, h: 18 },
    { t: "name", label: "Full name", icon: "👤", w: 150, h: 18 },
    { t: "email", label: "Email", icon: "@", w: 170, h: 18 },
    { t: "text", label: "Text", icon: "T", w: 150, h: 18 },
    { t: "checkbox", label: "Checkbox", icon: "☑", w: 14, h: 14 },
  ];
  const FMAP = Object.fromEntries(FIELDS.map((f) => [f.t, f]));
  const STATUS = { draft: ["Draft", ""], sent: ["Out for signature", "out"], completed: ["Completed", "done"], declined: ["Declined", "bad"], voided: ["Voided", "bad"], expired: ["Expired", "bad"] };
  const RSTATUS = { created: "Waiting", sent: "Email sent", viewed: "Opened", verified: "Identity confirmed", signed: "Signed", declined: "Declined", completed: "Copy sent" };

  const CSS = `.es{display:flex;flex-direction:column;gap:14px;color:var(--fg)}
.es-recent{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.es-recent>span{font-size:.78rem;color:var(--muted);font-weight:600;margin-right:2px}
.es-chip{font:inherit;font-size:.8rem;font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:4px 11px;cursor:pointer;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.es-chip:hover{border-color:var(--accent);background:var(--accent-soft)}
#esSug{position:fixed;z-index:9000;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:280px;overflow:auto;padding:4px;min-width:280px}
#esSug .it{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;cursor:pointer}
#esSug .it[aria-selected="true"],#esSug .it:hover{background:var(--accent-soft)}
#esSug .it div{flex:1;min-width:0}#esSug .it b{display:block;font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#esSug .it small{display:block;font-size:.76rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#esSug .x{border:0;background:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:2px 5px;border-radius:5px}#esSug .x:hover{color:#b3412e;background:var(--bg)}
#esSug .hd{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:5px 9px 3px}
.es *{box-sizing:border-box}
.es-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.es-card h3{margin:0;font-size:1rem}
.es-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.es-sp{justify-content:space-between}
.es-in{font:inherit;font-size:.9rem;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg);min-width:0}
.es-in:focus{outline:2px solid var(--accent);outline-offset:0}
.es-btn{font:inherit;font-weight:600;font-size:.86rem;padding:8px 15px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none}
.es-btn.g{background:var(--surface);color:var(--fg);border-color:var(--line)}.es-btn.red{background:transparent;color:#b3412e;border-color:#b3412e}
.es-btn.sm{padding:5px 11px;font-size:.8rem}.es-btn:disabled{opacity:.5;cursor:not-allowed}
.es-note{font-size:.8rem;color:var(--muted)}.es-err{color:#b3412e;font-size:.85rem;min-height:1.1em}
.es-badge{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.es-badge.out{background:#fdf1d6;color:#7a5410;border-color:transparent}.es-badge.done{background:var(--accent-soft);color:var(--fg);border-color:transparent}.es-badge.bad{background:#f8e1dc;color:#8a2d1d;border-color:transparent}
.es-tbl{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
.es-tbl table{width:100%;border-collapse:collapse;font-size:.86rem;min-width:620px}
.es-tbl th{text-align:left;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line)}
.es-tbl td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}.es-tbl tr:last-child td{border-bottom:0}
.es-tbl tr.click{cursor:pointer}.es-tbl tr.click:hover td{background:var(--accent-soft)}
.es-seg{display:flex;flex-wrap:wrap;gap:4px}.es-seg button{font:inherit;font-size:.8rem;font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:5px 11px;border-radius:999px;cursor:pointer}
.es-seg button[aria-pressed="true"]{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.es-drop{border:2px dashed var(--line);border-radius:12px;padding:20px;text-align:center;color:var(--muted);cursor:pointer;font-size:.9rem}
.es-drop.over{border-color:var(--accent);background:var(--accent-soft)}
.es-rc{display:grid;grid-template-columns:14px 130px 1fr 1.2fr 64px 120px 34px;gap:8px;align-items:center}
.es-rc .dot{width:14px;height:14px;border-radius:4px}
.es-rc>*{min-width:0;width:100%}.es-rc .dot{width:14px}
@media (max-width:820px){.es-rc{grid-template-columns:14px 70px 1fr 40px;grid-template-areas:"dot role role del" ". name name name" ". email email email" ". ord acc acc";padding-bottom:10px;border-bottom:1px solid var(--line)}
.es-rc .dot{grid-area:dot}.es-rc [data-k=role]{grid-area:role}.es-rc [data-k=name]{grid-area:name}.es-rc [data-k=email]{grid-area:email}.es-rc [data-k=ord]{grid-area:ord}.es-rc [data-k=access]{grid-area:acc}.es-rc [data-del]{grid-area:del;justify-content:center}}
.es-build{display:grid;grid-template-columns:210px 1fr;gap:14px;align-items:start}
@media (max-width:820px){.es-build{grid-template-columns:1fr}}
.es-pal{position:sticky;top:10px;display:flex;flex-direction:column;gap:8px}
.es-pal button.f{font:inherit;font-size:.86rem;font-weight:600;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--fg);padding:8px 10px;border-radius:9px;cursor:grab;display:flex;gap:8px;align-items:center}
.es-pal button.f i{font-style:normal;width:26px;text-align:center;font-size:.8rem;font-weight:700;border-radius:5px;padding:2px 0}
.es-pal button.f[aria-pressed="true"]{outline:2px solid var(--accent)}
.es-pages{display:flex;flex-direction:column;gap:14px;align-items:center;background:color-mix(in srgb,var(--line) 45%,transparent);padding:14px;border-radius:12px;max-height:80vh;overflow:auto}
.es-page{position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);width:100%;max-width:860px}
.es-page canvas{display:block;width:100%;height:auto}
.es-page .pn{position:absolute;right:-2px;top:-18px;font-size:.7rem;color:var(--muted)}
.es-page.arm{cursor:crosshair}
.es-f{position:absolute;border:1.5px solid rgba(0,0,0,.45);border-radius:3px;font:600 11px/1.1 system-ui,sans-serif;color:#1b2628;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:move;user-select:none;touch-action:none;opacity:.92}
.es-f.sel{outline:2px solid #1b4fd6;outline-offset:1px;z-index:3}
.es-f .rs{position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;background:#1b4fd6;cursor:nwse-resize;border-radius:2px 0 2px 0}
.es-f.ro{cursor:default;opacity:.8}
.es-fp{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line);padding-top:10px;font-size:.84rem}
.es-tl{display:flex;flex-direction:column;gap:8px}
.es-tl .r{display:grid;grid-template-columns:14px 1fr auto;gap:10px;align-items:start;border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.es-sig{height:40px;max-width:180px;background:#fff;border-radius:6px;border:1px solid var(--line)}
.es-kv{display:grid;grid-template-columns:170px 1fr;gap:4px 12px;font-size:.84rem}.es-kv b{word-break:break-all;font-weight:600}
@media (max-width:640px){.es-kv{grid-template-columns:1fr}}
.es-modal{position:fixed;inset:0;background:rgba(10,20,20,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.es-modal>div{background:var(--surface);color:var(--fg);border-radius:14px;padding:18px;max-width:520px;width:100%;display:flex;flex-direction:column;gap:12px;max-height:90vh;overflow:auto}
.es-modal h3{margin:0}`;

  function loadPdfjs() {
    if (!window.__wpPdfjs) window.__wpPdfjs = import("/assets/vendor/pdfjs/pdf.min.js").then((m) => { m.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs/pdf.worker.min.js"; return m; });
    return window.__wpPdfjs;
  }
  // Renders every page of a PDF (ArrayBuffer) into `host`; returns the page wrapper elements.
  async function renderPdf(host, data, width) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
    host.innerHTML = "";
    const out = [];
    const W = Math.min(width || 860, 860), dpr = Math.min(2, window.devicePixelRatio || 1);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 }), scale = (W / vp1.width) * dpr, vp = page.getViewport({ scale });
      const wrap = document.createElement("div"); wrap.className = "es-page"; wrap.dataset.page = i - 1;
      wrap.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
      const c = document.createElement("canvas"); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      wrap.appendChild(c); const pn = document.createElement("span"); pn.className = "pn"; pn.textContent = `Page ${i} of ${doc.numPages}`; wrap.appendChild(pn);
      host.appendChild(wrap); out.push(wrap);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    }
    return out;
  }
  window.WPEsignRender = renderPdf;

  function mount(el, opts) {
    if (!document.getElementById("esCss")) { const s = document.createElement("style"); s.id = "esCss"; s.textContent = CSS; document.head.appendChild(s); }
    const root = document.createElement("div"); root.className = "es"; el.innerHTML = ""; el.appendChild(root);
    const S = { view: "list", filter: "all", q: "", scope: "mine", rows: [], access: null, id: null, B: null, D: null, dirty: false };

    async function api(path, o = {}) {
      const r = await fetch(opts.base + path, { method: o.method || "GET", headers: { ...(opts.headers || {}), ...(o.raw ? { "x-file-name": encodeURIComponent(o.name || "file") } : { "content-type": "application/json" }), ...(o.headers || {}) },
        body: o.raw || (o.body ? JSON.stringify(o.body) : undefined), credentials: "same-origin" });
      if (o.blob) { if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Download failed"); } return r; }
      const j = await r.json().catch(() => ({}));
      if (j.needPlan && opts.onNeedPlan) opts.onNeedPlan(j.error);
      if (!r.ok || !j.ok) throw new Error(j.error || "Request failed");
      return j;
    }
    const post = (p, b) => api(p, { method: "POST", body: b });
    async function download(route, id, name, view) {
      const r = await api(`${route}?id=${encodeURIComponent(id)}${view ? "&view=1" : ""}`, { blob: true });
      const url = URL.createObjectURL(await r.blob());
      if (view) { window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); return; }
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    const toast = (msg) => { const n = document.createElement("div"); n.textContent = msg; n.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b2628;color:#fff;padding:10px 16px;border-radius:10px;z-index:99999;font-size:.9rem;box-shadow:0 4px 14px rgba(0,0,0,.25)"; document.body.appendChild(n); setTimeout(() => n.remove(), 2600); };
    function modal(html, bind) {
      const m = document.createElement("div"); m.className = "es-modal"; m.innerHTML = `<div role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(m); const close = () => m.remove();
      m.addEventListener("click", (e) => { if (e.target === m) close(); });
      bind(m, close); return m;
    }

    /* ---------------- list ---------------- */
    async function showList() {
      S.view = "list"; S.id = null;
      root.innerHTML = `<div class="es-card"><div class="es-row es-sp"><h3>Envelopes</h3><div class="es-row">
        ${opts.admin ? `<select class="es-in" id="esScope"><option value="mine">Sent by WorkerPool</option><option value="subs">Sent by subscribers</option><option value="all">Everything</option></select>` : ""}
        <input class="es-in" id="esQ" type="search" placeholder="Search title or signer…" style="width:220px"><button class="es-btn" id="esNew" type="button">+ New envelope</button></div></div>
        <div class="es-seg" id="esF"></div><div id="esList"><div class="es-note">Loading…</div></div></div>`;
      if (opts.admin) { root.querySelector("#esScope").value = S.scope; root.querySelector("#esScope").onchange = (e) => { S.scope = e.target.value; refreshList(); }; }
      root.querySelector("#esQ").value = S.q; root.querySelector("#esQ").oninput = (e) => { S.q = e.target.value; drawList(); };
      root.querySelector("#esNew").onclick = newEnvelope;
      await refreshList();
    }
    async function refreshList() {
      try { const j = await api("list" + (opts.admin ? "?scope=" + S.scope : "")); S.rows = j.rows; S.access = j.access || null; if (opts.onAccess && j.access) opts.onAccess(j.access); drawList(); }
      catch (e) { const l = root.querySelector("#esList"); if (l) l.innerHTML = `<div class="es-err">${esc(e.message)}</div>`; }
    }
    function drawList() {
      const box = root.querySelector("#esList"); if (!box) return;
      const counts = { all: S.rows.length }; for (const r of S.rows) { const k = ["voided", "declined", "expired"].includes(r.status) ? "ended" : r.status; counts[k] = (counts[k] || 0) + 1; }
      const F = [["all", "All"], ["draft", "Drafts"], ["sent", "Out for signature"], ["completed", "Completed"], ["ended", "Declined / voided / expired"]];
      root.querySelector("#esF").innerHTML = F.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${S.filter === k}">${l} (${counts[k] || 0})</button>`).join("");
      root.querySelectorAll("#esF button").forEach((b) => b.onclick = () => { S.filter = b.dataset.f; drawList(); });
      const q = S.q.trim().toLowerCase();
      const L = S.rows.filter((r) => (S.filter === "all" || (S.filter === "ended" ? ["voided", "declined", "expired"].includes(r.status) : r.status === S.filter)) && (!q || [r.title, r.names, r.owner_name, r.owner_email, r.id].some((x) => String(x || "").toLowerCase().includes(q))));
      box.innerHTML = L.length ? `<div class="es-tbl"><table><thead><tr><th>Document</th><th>Signers</th><th>Status</th><th>Last change</th></tr></thead><tbody>
        ${L.map((r) => { const st = STATUS[r.status] || [r.status, ""]; return `<tr class="click" data-id="${r.id}" tabindex="0"><td><b>${esc(r.title)}</b><br><span class="es-note">${r.pages || 0} page${r.pages === 1 ? "" : "s"}${opts.admin && r.owner !== "admin" ? ` · from ${esc(r.owner_name)} (${esc(r.owner_email)})` : ""}</span></td>
          <td>${esc(r.names || "–")}<br><span class="es-note">${r.signed}/${r.signers} signed</span></td><td><span class="es-badge ${st[1]}">${st[0]}</span>${r.final_error ? `<br><span class="es-err">Final PDF failed</span>` : ""}</td>
          <td>${when(r.updated || r.created)}${r.status === "sent" && r.expires_at ? `<br><span class="es-note">Expires ${when(r.expires_at)}</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="es-note" style="padding:12px 2px">${S.rows.length ? "Nothing matches." : "No envelopes yet. Press <b>+ New envelope</b> to upload a document and send it for signature."}</div>`;
      box.querySelectorAll("tr[data-id]").forEach((tr) => { tr.onclick = () => open(tr.dataset.id); tr.onkeydown = (e) => { if (e.key === "Enter") open(tr.dataset.id); }; });
    }
    async function newEnvelope() {
      try { const j = await post("new", { title: "Untitled document" }); await open(j.id); } catch (e) { toast(e.message); }
    }
    async function open(id) {
      root.innerHTML = `<div class="es-card"><div class="es-note">Opening…</div></div>`;
      try {
        const j = await api("item?id=" + encodeURIComponent(id));
        S.id = id; S.D = j;
        if (j.env.status === "draft" && (j.mine || opts.admin)) return showBuilder(j);
        showDetail(j);
      } catch (e) { root.innerHTML = `<div class="es-card"><div class="es-err">${esc(e.message)}</div><button class="es-btn g" type="button" id="esBack">← Back</button></div>`; root.querySelector("#esBack").onclick = showList; }
    }

    /* ---------------- builder ---------------- */
    function showBuilder(j) {
      S.view = "build";
      const e = j.env;
      const B = S.B = { id: e.id, title: e.title === "Untitled document" ? "" : e.title, message: e.message || "", seq: !!e.seq, expires_days: e.expires_days || 30, remind_days: e.remind_days ?? 3,
        pages: e.pages, sizes: e.page_sizes || [], names: e.names || [],
        recipients: j.recipients.map((r) => ({ id: r.id, key: r.id, role: r.role, name: r.name, email: r.email, ord: r.ord, has_access: r.has_access, access: undefined })),
        fields: j.fields.map((f) => ({ ...f, key: f.id })), cur: null, armed: null, sel: null, pageEls: [] };
      if (!B.recipients.length) B.recipients.push({ key: "k" + Math.random().toString(36).slice(2, 8), role: "signer", name: "", email: "", ord: 1 });
      B.cur = (B.recipients.find((r) => r.role === "signer") || B.recipients[0]).key;
      root.innerHTML = `
      <div class="es-row es-sp"><button class="es-btn g" type="button" id="bBack">← Envelopes</button>
        <div class="es-row"><span class="es-note" id="bSaved"></span><button class="es-btn g" type="button" id="bSave">Save draft</button><button class="es-btn" type="button" id="bSend">Send for signature</button></div></div>
      <div class="es-card"><h3>1 · Document</h3>
        <label class="es-note">Envelope name (signers see this in the email subject)<input class="es-in" id="bTitle" style="width:100%;margin-top:4px" maxlength="160" placeholder="e.g. Employment agreement – Jasmine Kaur"></label>
        <div id="bDoc"></div>
        <div class="es-drop" id="bDrop" tabindex="0">Drop PDF, JPG or PNG files here, or <u>choose files</u>. Several files are joined into one document in the order you add them.<input type="file" id="bFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" multiple hidden></div>
        <div class="es-err" id="bUpErr"></div></div>
      <div class="es-card"><div class="es-row es-sp"><h3>2 · Recipients</h3><label class="es-row es-note" style="gap:6px"><input type="checkbox" id="bSeq"> Set signing order (signer 2 gets the email after signer 1 signs)</label></div>
        <div class="es-recent" id="bRecent" hidden></div>
        <div id="bRc"></div>
        <div class="es-row"><button class="es-btn g sm" type="button" id="bAdd">+ Add recipient</button>${opts.me ? `<button class="es-btn g sm" type="button" id="bMe">+ Add me</button>` : ""}</div>
        <div class="es-note">Each signer gets a personal link and must confirm a one-time code sent to their email before they can see the document. An optional access code (that you tell them by phone or text) adds a second check. “Receives a copy” gets the completed document only.</div></div>
      <div class="es-card"><h3>3 · Message</h3>
        <textarea class="es-in" id="bMsg" rows="3" maxlength="2000" placeholder="Optional message shown in the email, e.g. Please review and sign by Friday."></textarea>
        <div class="es-row"><label class="es-note">Expires after <input class="es-in" id="bExp" type="number" min="1" max="120" style="width:70px"> days</label>
          <label class="es-note">Remind every <input class="es-in" id="bRem" type="number" min="0" max="30" style="width:64px"> days (0 = no reminders)</label></div></div>
      <div class="es-card"><div class="es-row es-sp"><h3>4 · Place fields</h3><span class="es-note">Pick a field, then click the page where it goes (or drag it on). Drag to move, corner to resize, Delete key to remove.</span></div>
        <div class="es-build"><div class="es-pal" id="bPal"></div><div class="es-pages" id="bPages"><div class="es-note">Upload a document to place fields.</div></div></div></div>`;
      const $ = (s) => root.querySelector(s);
      $("#bTitle").value = B.title; $("#bMsg").value = B.message; $("#bSeq").checked = B.seq; $("#bExp").value = B.expires_days; $("#bRem").value = B.remind_days;
      $("#bTitle").oninput = (ev) => { B.title = ev.target.value; dirty(); };
      $("#bMsg").oninput = (ev) => { B.message = ev.target.value; dirty(); };
      $("#bSeq").onchange = (ev) => { B.seq = ev.target.checked; if (B.seq) B.recipients.forEach((r, i) => r.ord = i + 1); drawRecipients(); dirty(); };
      $("#bExp").oninput = (ev) => { B.expires_days = ev.target.value; dirty(); };
      $("#bRem").oninput = (ev) => { B.remind_days = ev.target.value; dirty(); };
      $("#bBack").onclick = async () => { closeSug(); if (S.dirty) await save(true); showList(); };
      loadContacts();
      $("#bSave").onclick = () => save();
      $("#bSend").onclick = send;
      $("#bAdd").onclick = () => { B.recipients.push({ key: "k" + Math.random().toString(36).slice(2, 8), role: "signer", name: "", email: "", ord: B.recipients.length + 1 }); drawRecipients(); dirty(); };
      if ($("#bMe")) $("#bMe").onclick = () => { B.recipients.push({ key: "k" + Math.random().toString(36).slice(2, 8), role: "signer", name: opts.me.name || "", email: opts.me.email || "", ord: B.recipients.length + 1 }); drawRecipients(); dirty(); };
      const drop = $("#bDrop"), file = $("#bFile");
      drop.onclick = () => file.click(); drop.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); file.click(); } };
      drop.ondragover = (ev) => { ev.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = (ev) => { ev.preventDefault(); drop.classList.remove("over"); upload([...ev.dataTransfer.files]); };
      file.onchange = () => { upload([...file.files]); file.value = ""; };
      drawDoc(); drawRecipients(); drawPalette(); drawPages();
      document.addEventListener("keydown", keyDel);
    }
    function keyDel(ev) {
      const B = S.B; if (S.view !== "build" || !B || !B.sel) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); B.fields = B.fields.filter((f) => f.key !== B.sel); B.sel = null; drawFields(); drawFieldPanel(); dirty(); }
    }
    let saveTimer = null;
    function dirty() { S.dirty = true; const s = root.querySelector("#bSaved"); if (s) s.textContent = "Unsaved changes"; clearTimeout(saveTimer); saveTimer = setTimeout(() => save(true), 2500); }
    function payload() {
      const B = S.B;
      return { id: B.id, title: B.title.trim() || "Untitled document", message: B.message, seq: B.seq, expires_days: B.expires_days, remind_days: B.remind_days,
        recipients: B.recipients.map((r) => ({ id: r.id, key: r.key, role: r.role, name: r.name, email: r.email, ord: B.seq ? r.ord : 1, ...(r.access !== undefined ? { access: r.access } : {}) })),
        fields: B.fields.map((f) => ({ rcpt_id: f.rcpt_id, type: f.type, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: f.required, label: f.label })) };
    }
    let saving = null;
    async function save(quiet) {
      const B = S.B; if (!B) return;
      clearTimeout(saveTimer);
      if (saving) await saving;
      const s = root.querySelector("#bSaved");
      saving = (async () => {
        try {
          const j = await post("save", payload());
          // server ids replace the temporary keys
          for (const r of B.recipients) { const nid = j.ids[r.key] || j.ids[r.id]; if (nid) { for (const f of B.fields) if (f.rcpt_id === r.key || f.rcpt_id === r.id) f.rcpt_id = nid; if (B.cur === r.key || B.cur === r.id) B.cur = nid; r.id = nid; r.key = nid; if (r.access !== undefined) { r.has_access = !!r.access; r.access = undefined; } } }
          S.dirty = false; if (s) s.textContent = "Saved " + new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
          if (!quiet) toast("Draft saved");
        } catch (e) { if (s) s.textContent = "Not saved: " + e.message; if (!quiet) toast(e.message); }
      })();
      await saving; saving = null;
    }
    async function upload(files) {
      const B = S.B, err = root.querySelector("#bUpErr"); err.textContent = "";
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) { err.textContent = `${f.name} is over 15 MB.`; continue; }
        root.querySelector("#bDrop").firstChild.textContent = `Adding ${f.name}…`;
        try { const j = await api("upload?id=" + encodeURIComponent(B.id), { method: "POST", raw: await f.arrayBuffer(), name: f.name }); B.pages = j.pages; B.sizes = j.page_sizes; B.names = j.names; }
        catch (e) { err.textContent = `${f.name}: ${e.message}`; }
      }
      root.querySelector("#bDrop").firstChild.textContent = "Drop PDF, JPG or PNG files here, or ";
      if (!B.title.trim() && B.names.length) { B.title = B.names[0].replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " "); root.querySelector("#bTitle").value = B.title; dirty(); }
      drawDoc(); drawPages();
    }
    function drawDoc() {
      const B = S.B, box = root.querySelector("#bDoc");
      box.innerHTML = B.pages ? `<div class="es-row es-sp"><span><b>${esc(B.names.join(", "))}</b> <span class="es-note">· ${B.pages} page${B.pages > 1 ? "s" : ""}</span></span>
        <span class="es-row"><button class="es-btn g sm" type="button" id="bView">Preview</button><button class="es-btn red sm" type="button" id="bClear">Remove document</button></span></div>` : "";
      if (B.pages) {
        box.querySelector("#bView").onclick = () => download("doc", B.id, "document.pdf", true).catch((e) => toast(e.message));
        box.querySelector("#bClear").onclick = async () => { if (!confirm("Remove the document and every field placed on it?")) return; try { await post("clear", { id: B.id }); B.pages = 0; B.sizes = []; B.names = []; B.fields = []; drawDoc(); drawPages(); } catch (e) { toast(e.message); } };
      }
    }
    function color(key) { const i = S.B.recipients.findIndex((r) => r.key === key || r.id === key); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }
    /* ---- saved recipients: people this sender has used before ---- */
    let SUG = null;   // { inp, r, list, at }
    async function loadContacts() {
      try { S.contacts = (await api("contacts")).contacts || []; } catch (x) { S.contacts = []; }
      drawRecent();
    }
    const used = (except) => new Set((S.B ? S.B.recipients : []).filter((x) => x !== except).map((x) => String(x.email || "").trim().toLowerCase()).filter(Boolean));
    function drawRecent() {
      const box = root.querySelector("#bRecent"); if (!box || !S.B) return;
      const u = used(), list = (S.contacts || []).filter((c) => !u.has(c.email)).slice(0, 8);
      box.hidden = !list.length;
      box.innerHTML = list.length ? `<span>Recent:</span>${list.map((c, i) => `<button type="button" class="es-chip" data-rc="${i}" title="${esc(c.name)} · ${esc(c.email)}">+ ${esc(c.name)}</button>`).join("")}` : "";
      box.querySelectorAll("[data-rc]").forEach((b) => b.onclick = () => addContact(list[+b.dataset.rc]));
    }
    function addContact(c, r) {
      const B = S.B; if (!B || !c) return;
      r = r || B.recipients.find((x) => !String(x.name || "").trim() && !String(x.email || "").trim());
      if (!r) { r = { key: "k" + Math.random().toString(36).slice(2, 8), role: "signer", name: "", email: "", ord: B.recipients.length + 1 }; B.recipients.push(r); }
      r.name = c.name; r.email = c.email; closeSug(); drawRecipients(); drawPalette(); drawFields(); dirty();
    }
    function openSug(inp, r) {
      const q = inp.value.trim().toLowerCase(), u = used(r);
      const list = (S.contacts || []).filter((c) => !u.has(c.email) && (!q || c.name.toLowerCase().includes(q) || c.email.includes(q))).slice(0, 8);
      if (!list.length || (q && list.length === 1 && (list[0].email === q || list[0].name.toLowerCase() === q))) return closeSug();
      let box = document.getElementById("esSug");
      if (!box) { box = document.createElement("div"); box.id = "esSug"; box.setAttribute("role", "listbox"); document.body.appendChild(box); window.addEventListener("scroll", closeSug, true); }
      const rc = inp.getBoundingClientRect(), below = window.innerHeight - rc.bottom > 200;
      box.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - 300)) + "px"; box.style.width = Math.max(280, rc.width) + "px";
      box.style.top = below ? rc.bottom + 4 + "px" : ""; box.style.bottom = below ? "" : window.innerHeight - rc.top + 4 + "px";
      SUG = { inp, r, list, at: -1 };
      box.innerHTML = `<div class="hd">${q ? "Matching people you've sent to" : "People you've sent to before"}</div>` + list.map((c, i) => `<div class="it" role="option" data-si="${i}" aria-selected="false">
        <div><b>${esc(c.name)}</b><small>${esc(c.email)} · used ${c.uses}×</small></div><button type="button" class="x" data-sx="${i}" title="Remove from this list">✕</button></div>`).join("");
      box.querySelectorAll("[data-si]").forEach((el) => el.onmousedown = (ev) => { if (ev.target.closest("[data-sx]")) return; ev.preventDefault(); addContact(list[+el.dataset.si], r); });
      box.querySelectorAll("[data-sx]").forEach((b) => b.onmousedown = async (ev) => { ev.preventDefault(); ev.stopPropagation(); const c = list[+b.dataset.sx];
        S.contacts = S.contacts.filter((x) => x !== c); openSug(inp, r); drawRecent();
        try { await post("contact-hide", { email: c.email }); toast(`${c.name} removed from saved recipients.`); } catch (x) {} });
    }
    function sugKey(ev, r) {
      if (!SUG || SUG.r !== r) return;
      const box = document.getElementById("esSug"); if (!box) return;
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); SUG.at = (SUG.at + (ev.key === "ArrowDown" ? 1 : -1) + SUG.list.length) % SUG.list.length;
        box.querySelectorAll("[data-si]").forEach((el) => el.setAttribute("aria-selected", String(+el.dataset.si === SUG.at))); }
      else if (ev.key === "Enter" && SUG.at >= 0) { ev.preventDefault(); addContact(SUG.list[SUG.at], r); }
      else if (ev.key === "Escape") closeSug();
    }
    function closeSug() { SUG = null; const b = document.getElementById("esSug"); if (b) b.remove(); window.removeEventListener("scroll", closeSug, true); }

    function drawRecipients() {
      const B = S.B, box = root.querySelector("#bRc"); queueMicrotask(drawRecent);
      box.innerHTML = B.recipients.map((r, i) => `<div class="es-rc" data-i="${i}" style="margin-bottom:6px">
        <span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>
        <select class="es-in" data-k="role"><option value="signer">Needs to sign</option><option value="cc">Receives a copy</option></select>
        <input class="es-in" data-k="name" placeholder="Full name" value="${esc(r.name)}" maxlength="120">
        <input class="es-in" data-k="email" type="email" placeholder="Email" value="${esc(r.email)}" maxlength="160">
        <input class="es-in" data-k="ord" type="number" min="1" max="20" title="Signing order" aria-label="Signing order" value="${r.ord || i + 1}" ${B.seq ? "" : "disabled"} style="${B.seq ? "" : "opacity:.4"}">
        <input class="es-in wide" data-k="access" placeholder="${r.has_access ? "Access code set (type to change)" : "Access code (optional)"}" maxlength="40" value="${r.access ? esc(r.access) : ""}" ${r.role === "cc" ? "disabled style='opacity:.4'" : ""}>
        <button class="es-btn g sm" type="button" data-del title="Remove" aria-label="Remove recipient">✕</button></div>`).join("");
      box.querySelectorAll(".es-rc").forEach((row) => {
        const r = B.recipients[+row.dataset.i];
        row.querySelector('[data-k="role"]').value = r.role;
        ["name", "email"].forEach((k) => { const inp = row.querySelector(`[data-k="${k}"]`); inp.setAttribute("autocomplete", "off");
          inp.addEventListener("focus", () => openSug(inp, r)); inp.addEventListener("input", () => openSug(inp, r)); inp.addEventListener("keydown", (ev) => sugKey(ev, r));
          inp.addEventListener("blur", () => setTimeout(() => { if (!SUG || SUG.inp === inp) closeSug(); }, 180)); });
        row.querySelectorAll("[data-k]").forEach((inp) => inp.oninput = inp.onchange = () => {
          const k = inp.dataset.k;
          r[k] = k === "ord" ? parseInt(inp.value) || 1 : inp.value;
          if (k === "email") drawRecent();
          if (k === "role") { if (r.role === "cc") B.fields = B.fields.filter((f) => f.rcpt_id !== r.key && f.rcpt_id !== r.id); drawRecipients(); drawFields(); }
          drawPalette(); dirty();
        });
        row.querySelector("[data-del]").onclick = () => {
          if (B.fields.some((f) => f.rcpt_id === r.key || f.rcpt_id === r.id) && !confirm(`Remove ${r.name || "this recipient"} and their fields?`)) return;
          B.fields = B.fields.filter((f) => f.rcpt_id !== r.key && f.rcpt_id !== r.id);
          B.recipients.splice(+row.dataset.i, 1); if (B.cur === r.key) B.cur = (B.recipients.find((x) => x.role === "signer") || {}).key || null;
          drawRecipients(); drawPalette(); drawFields(); dirty();
        };
      });
    }
    function drawPalette() {
      const B = S.B, pal = root.querySelector("#bPal"); if (!pal) return;
      const signers = B.recipients.filter((r) => r.role === "signer");
      if (!signers.some((r) => r.key === B.cur)) B.cur = signers[0] ? signers[0].key : null;
      pal.innerHTML = signers.length ? `<label class="es-note">Fields for<select class="es-in" id="bCur" style="width:100%;margin-top:4px">${signers.map((r) => `<option value="${r.key}">${esc(r.name || r.email || "Signer")}</option>`).join("")}</select></label>
        <span style="height:6px;border-radius:3px;background:${color(B.cur)}"></span>
        ${FIELDS.map((f) => `<button class="f" type="button" draggable="true" data-t="${f.t}" aria-pressed="${B.armed === f.t}"><i style="background:${color(B.cur)}">${f.icon}</i>${f.label}</button>`).join("")}
        <div class="es-note">${B.fields.length} field${B.fields.length === 1 ? "" : "s"} placed</div><div id="bFp"></div>`
        : `<div class="es-note">Add a signer first.</div>`;
      if (!signers.length) return;
      pal.querySelector("#bCur").value = B.cur;
      pal.querySelector("#bCur").onchange = (ev) => { B.cur = ev.target.value; drawPalette(); };
      pal.querySelectorAll("button.f").forEach((b) => {
        b.onclick = () => { B.armed = B.armed === b.dataset.t ? null : b.dataset.t; drawPalette(); B.pageEls.forEach((p) => p.classList.toggle("arm", !!B.armed)); };
        b.ondragstart = (ev) => { ev.dataTransfer.setData("text/plain", "esf:" + b.dataset.t); ev.dataTransfer.effectAllowed = "copy"; };
      });
      drawFieldPanel();
    }
    async function drawPages() {
      const B = S.B, host = root.querySelector("#bPages");
      B.pageEls = [];
      if (!B.pages) { host.innerHTML = `<div class="es-note">Upload a document to place fields.</div>`; return; }
      host.innerHTML = `<div class="es-note">Drawing pages…</div>`;
      try {
        const r = await api("doc?id=" + encodeURIComponent(B.id), { blob: true });
        B.pageEls = await renderPdf(host, await r.arrayBuffer(), host.clientWidth - 28);
      } catch (e) { host.innerHTML = `<div class="es-err">Couldn't show the document: ${esc(e.message)}</div>`; return; }
      B.pageEls.forEach((p) => {
        p.classList.toggle("arm", !!B.armed);
        p.addEventListener("click", (ev) => {
          if (ev.target.closest(".es-f")) return;
          if (!B.armed) { if (B.sel) { B.sel = null; drawFields(); drawFieldPanel(); } return; }
          place(+p.dataset.page, B.armed, ev, p); B.armed = null; drawPalette(); B.pageEls.forEach((x) => x.classList.remove("arm"));
        });
        p.addEventListener("dragover", (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; });
        p.addEventListener("drop", (ev) => { const d = ev.dataTransfer.getData("text/plain"); if (!d.startsWith("esf:")) return; ev.preventDefault(); place(+p.dataset.page, d.slice(4), ev, p); });
      });
      drawFields();
    }
    function place(page, type, ev, el) {
      const B = S.B; if (!B.cur) { toast("Add a signer first."); return; }
      const rect = el.getBoundingClientRect(), size = B.sizes[page] || [612, 792], d = FMAP[type];
      const w = d.w / size[0], h = d.h / size[1];
      const x = Math.max(0, Math.min(1 - w, (ev.clientX - rect.left) / rect.width - w / 2)), y = Math.max(0, Math.min(1 - h, (ev.clientY - rect.top) / rect.height - h / 2));
      const f = { key: "f" + Math.random().toString(36).slice(2, 9), rcpt_id: B.cur, type, page, x, y, w, h, required: type === "checkbox" ? 0 : 1, label: type === "text" ? "" : "" };
      B.fields.push(f); B.sel = f.key; drawFields(); drawPalette(); dirty();
    }
    function fieldLabel(f) {
      const r = S.B.recipients.find((x) => x.key === f.rcpt_id || x.id === f.rcpt_id);
      return f.type === "checkbox" ? "" : `${FMAP[f.type].label}${f.type === "text" && f.label ? ": " + f.label : ""}${r && f.type === "signature" ? " · " + (r.name || "").split(" ")[0] : ""}`;
    }
    function drawFields() {
      const B = S.B;
      B.pageEls.forEach((p) => p.querySelectorAll(".es-f").forEach((n) => n.remove()));
      for (const f of B.fields) {
        const p = B.pageEls[f.page]; if (!p) continue;
        const n = document.createElement("div"); n.className = "es-f" + (B.sel === f.key ? " sel" : "");
        Object.assign(n.style, { left: f.x * 100 + "%", top: f.y * 100 + "%", width: f.w * 100 + "%", height: f.h * 100 + "%", background: color(f.rcpt_id) });
        n.title = fieldLabel(f) || "Checkbox"; n.innerHTML = `<span style="padding:0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fieldLabel(f))}</span><span class="rs"></span>`;
        p.appendChild(n);
        n.addEventListener("pointerdown", (ev) => drag(ev, f, n, p, ev.target.classList.contains("rs")));
      }
    }
    function drag(ev, f, n, p, resize) {
      ev.preventDefault(); ev.stopPropagation();
      const B = S.B; if (B.sel !== f.key) { B.sel = f.key; root.querySelectorAll(".es-f.sel").forEach((x) => x.classList.remove("sel")); n.classList.add("sel"); drawFieldPanel(); }
      const rect = p.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY, o = { x: f.x, y: f.y, w: f.w, h: f.h };
      let moved = false;
      const mv = (e) => {
        const dx = (e.clientX - sx) / rect.width, dy = (e.clientY - sy) / rect.height;
        if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 2) moved = true;
        if (resize) { f.w = Math.max(0.012, Math.min(1 - f.x, o.w + dx)); f.h = Math.max(0.008, Math.min(1 - f.y, o.h + dy)); if (f.type === "checkbox") { const sz = B.sizes[f.page] || [612, 792]; f.h = f.w * sz[0] / sz[1]; } }
        else { f.x = Math.max(0, Math.min(1 - f.w, o.x + dx)); f.y = Math.max(0, Math.min(1 - f.h, o.y + dy)); }
        Object.assign(n.style, { left: f.x * 100 + "%", top: f.y * 100 + "%", width: f.w * 100 + "%", height: f.h * 100 + "%" });
      };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); if (moved) dirty(); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    }
    function drawFieldPanel() {
      const B = S.B, box = root.querySelector("#bFp"); if (!box) return;
      const f = B.fields.find((x) => x.key === B.sel);
      if (!f) { box.innerHTML = ""; return; }
      const signers = B.recipients.filter((r) => r.role === "signer");
      box.innerHTML = `<div class="es-fp"><b>${FMAP[f.type].label}</b> <span class="es-note">page ${f.page + 1}</span>
        <label class="es-note">Signer<select class="es-in" id="fpR" style="width:100%">${signers.map((r) => `<option value="${r.key}">${esc(r.name || r.email || "Signer")}</option>`).join("")}</select></label>
        ${f.type === "text" ? `<label class="es-note">Label (what to type)<input class="es-in" id="fpL" maxlength="80" style="width:100%" value="${esc(f.label || "")}"></label>` : ""}
        ${f.type === "text" || f.type === "checkbox" ? `<label class="es-row es-note" style="gap:6px"><input type="checkbox" id="fpQ" ${f.required ? "checked" : ""}> Required</label>` : `<span class="es-note">${["date", "name", "email"].includes(f.type) ? "Filled in automatically when they sign." : "Always required."}</span>`}
        <button class="es-btn red sm" type="button" id="fpD">Delete field</button></div>`;
      box.querySelector("#fpR").value = f.rcpt_id;
      box.querySelector("#fpR").onchange = (e) => { f.rcpt_id = e.target.value; drawFields(); dirty(); };
      if (box.querySelector("#fpL")) box.querySelector("#fpL").oninput = (e) => { f.label = e.target.value; drawFields(); dirty(); };
      if (box.querySelector("#fpQ")) box.querySelector("#fpQ").onchange = (e) => { f.required = e.target.checked ? 1 : 0; dirty(); };
      box.querySelector("#fpD").onclick = () => { B.fields = B.fields.filter((x) => x.key !== f.key); B.sel = null; drawFields(); drawPalette(); dirty(); };
    }
    async function send() {
      const B = S.B;
      const signers = B.recipients.filter((r) => r.role === "signer");
      const problems = [];
      if (!B.pages) problems.push("Upload the document.");
      if (!signers.length) problems.push("Add at least one signer.");
      for (const r of B.recipients) { if (!r.name.trim()) problems.push("Every recipient needs a name."); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) problems.push(`Check the email for ${r.name || "a recipient"}.`); }
      for (const r of signers) if (!B.fields.some((f) => (f.rcpt_id === r.key || f.rcpt_id === r.id) && f.type === "signature")) problems.push(`Place a Signature field for ${r.name || r.email || "each signer"}.`);
      if (problems.length) { toast([...new Set(problems)][0]); return; }
      await save(true);
      if (S.dirty) return;
      modal(`<h3>Send “${esc(B.title)}”?</h3>
        <div class="es-note">${signers.length} signer${signers.length > 1 ? "s" : ""}${B.seq ? ", one after another in signing order" : ", all at once"}. ${B.recipients.length - signers.length ? `${B.recipients.length - signers.length} will receive a copy when it's completed. ` : ""}After sending, the document and fields can't be changed (you can void it and send a copy).</div>
        <div>${B.recipients.map((r) => `<div>${r.role === "cc" ? "Copy" : B.seq ? r.ord + "." : "•"} <b>${esc(r.name)}</b> <span class="es-note">${esc(r.email)}</span></div>`).join("")}</div>
        <div class="es-err" id="mErr"></div><div class="es-row"><button class="es-btn" type="button" id="mGo">Send now</button><button class="es-btn g" type="button" id="mNo">Cancel</button></div>`, (m, close) => {
        m.querySelector("#mNo").onclick = close;
        m.querySelector("#mGo").onclick = async () => {
          m.querySelector("#mGo").disabled = true;
          try { await post("send", { id: B.id }); close(); toast("Sent for signature"); document.removeEventListener("keydown", keyDel); open(B.id); }
          catch (e) { m.querySelector("#mErr").textContent = e.message; m.querySelector("#mGo").disabled = false; }
        };
      });
    }

    /* ---------------- detail ---------------- */
    function showDetail(j) {
      S.view = "detail"; document.removeEventListener("keydown", keyDel);
      const e = j.env, st = STATUS[e.status] || [e.status, ""];
      const signers = j.recipients.filter((r) => r.role === "signer"), ccs = j.recipients.filter((r) => r.role === "cc");
      const done = signers.filter((r) => r.status === "signed").length;
      root.innerHTML = `<div class="es-row es-sp"><button class="es-btn g" type="button" id="dBack">← Envelopes</button><div class="es-row" id="dAct"></div></div>
      <div class="es-card"><div class="es-row es-sp"><div><h3 style="font-size:1.2rem">${esc(e.title)}</h3><div class="es-note">${esc(e.names.join(", "))} · ${e.pages} pages · Envelope ID ${esc(e.id)}${opts.admin && e.owner !== "admin" ? ` · sent by ${esc(e.owner_name)} (${esc(e.owner_email)})` : ""}</div></div>
        <span class="es-badge ${st[1]}" style="font-size:.78rem">${st[0]}</span></div>
        ${e.status === "sent" ? `<div class="es-note">${done} of ${signers.length} signed · sent ${when(e.sent_at)} · expires ${when(e.expires_at)}${e.remind_days ? ` · automatic reminder every ${e.remind_days} day${e.remind_days > 1 ? "s" : ""}` : ""}</div>` : ""}
        ${e.status === "completed" ? `<div class="es-note">Completed ${when(e.completed_at)} · everyone received the signed PDF by email.</div>` : ""}
        ${e.end_reason && e.status !== "completed" ? `<div class="es-note"><b>${esc(e.end_reason)}</b> (${when(e.ended_at)})</div>` : ""}
        ${e.final_error ? `<div class="es-err">The signed PDF couldn't be built: ${esc(e.final_error)}</div>` : ""}
        ${e.message ? `<div class="es-note">Message: “${esc(e.message)}”</div>` : ""}</div>
      <div class="es-card"><h3>Recipients</h3><div class="es-tl">${j.recipients.map((r, i) => `<div class="r"><span style="width:14px;height:14px;border-radius:4px;background:${COLORS[i % 8]}"></span>
        <div><b>${esc(r.name)}</b> <span class="es-note">${esc(r.email)} · ${r.role === "cc" ? "receives a copy" : (e.seq ? "signing order " + r.ord : "signer")}${r.has_access ? " · access code" : ""}</span>
          <div class="es-note">${[r.sent_at && "Sent " + when(r.sent_at), r.viewed_at && "Opened " + when(r.viewed_at), r.verified_at && "Identity confirmed " + when(r.verified_at), r.signed_at && "Signed " + when(r.signed_at), r.declined_at && "Declined " + when(r.declined_at)].filter(Boolean).join(" · ") || (r.role === "cc" ? "Gets the completed document" : "Waiting for earlier signers")}</div>
          ${r.decline_reason ? `<div class="es-note">Reason: “${esc(r.decline_reason)}”</div>` : ""}
          ${r.signed_at ? `<div class="es-note">IP ${esc(r.ip || "–")}${r.geo ? " · " + esc(r.geo) : ""}</div>` : ""}
          ${r.sig_png ? `<img class="es-sig" alt="Signature of ${esc(r.name)}" src="${r.sig_png}">` : ""}</div>
        <div style="text-align:right"><span class="es-badge ${r.status === "signed" || r.status === "completed" ? "done" : r.status === "declined" ? "bad" : r.status === "created" ? "" : "out"}">${RSTATUS[r.status] || r.status}</span>
          ${e.status === "sent" && r.role === "signer" && ["sent", "viewed", "verified"].includes(r.status) ? `<br><button class="es-btn g sm" type="button" data-rem="${r.id}" style="margin-top:6px">Resend</button>` : ""}</div></div>`).join("")}</div></div>
      <div class="es-card"><div class="es-row es-sp"><h3>Audit trail</h3><span class="es-note">${j.chain.ok ? `✓ Hash chain intact (${j.chain.count} events)` : `<b style="color:#b3412e">⚠ Audit trail was altered at event ${j.chain.at}</b>`}</span></div>
        <div class="es-tbl"><table><thead><tr><th>Time</th><th>Action</th><th>By</th><th>IP / location</th></tr></thead><tbody>
        ${j.events.map((v) => `<tr><td style="white-space:nowrap">${when(v.at)}</td><td><b>${esc(v.action)}</b>${v.detail ? `<br><span class="es-note" style="word-break:break-all">${esc(v.detail)}</span>` : ""}</td><td>${esc(v.actor)}</td><td>${esc(v.ip || "")}${v.geo ? `<br><span class="es-note">${esc(v.geo)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
        <div class="es-kv"><span class="es-note">Original document SHA-256</span><b>${esc(e.orig_sha || "–")}</b>${e.final_sha ? `<span class="es-note">Signed document SHA-256</span><b>${esc(e.final_sha)}</b>` : ""}<span class="es-note">Audit trail hash</span><b>${esc(e.last_hash || "–")}</b></div></div>`;
      const act = root.querySelector("#dAct"), btn = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "es-btn " + cls; b.textContent = label; b.onclick = fn; act.appendChild(b); };
      const fname = (e.title || "document").replace(/[^\w .()-]/g, "_");
      if (e.has_final) {
        btn("Download signed PDF", "", () => download("final", e.id, `${fname} (signed).pdf`).catch((x) => toast(x.message)));
        btn("Certificate", "g", () => download("cert", e.id, `${fname} - Certificate of Completion.pdf`).catch((x) => toast(x.message)));
      }
      btn("Original", "g", () => download("doc", e.id, `${fname}.pdf`, true).catch((x) => toast(x.message)));
      if (e.status === "sent") btn("Remind everyone", "g", async () => { try { const r = await post("remind", { id: e.id }); toast(`Reminder sent to ${r.sent}`); open(e.id); } catch (x) { toast(x.message); } });
      if (e.status === "completed" && (e.final_error || !e.has_final)) btn("Rebuild signed PDF", "g", async () => { try { await post("rebuild", { id: e.id }); toast("Signed PDF built"); open(e.id); } catch (x) { toast(x.message); } });
      btn("Copy to new draft", "g", async () => { try { const r = await post("copy", { id: e.id }); toast("Copy created"); open(r.id); } catch (x) { toast(x.message); } });
      if (e.status === "sent") btn("Void", "red", () => modal(`<h3>Void this envelope?</h3><div class="es-note">Signing stops, the links stop working and signers who already got the email are told it's voided.</div>
        <textarea class="es-in" id="vR" rows="3" placeholder="Reason (signers see this)"></textarea><div class="es-err" id="vE"></div><div class="es-row"><button class="es-btn red" type="button" id="vGo">Void envelope</button><button class="es-btn g" type="button" id="vNo">Cancel</button></div>`, (m, close) => {
          m.querySelector("#vNo").onclick = close;
          m.querySelector("#vGo").onclick = async () => { try { await post("void", { id: e.id, reason: m.querySelector("#vR").value }); close(); open(e.id); } catch (x) { m.querySelector("#vE").textContent = x.message; } };
        }));
      if (e.status !== "sent") btn("Delete", "red", async () => {
        if (!confirm(e.status === "completed" ? "Delete this completed envelope, its signed PDF, certificate and audit trail permanently? Keep your own copy first." : "Delete this envelope permanently?")) return;
        try { await post("delete", { id: e.id, confirm: true }); toast("Deleted"); showList(); } catch (x) { toast(x.message); }
      });
      root.querySelector("#dBack").onclick = showList;
      root.querySelectorAll("[data-rem]").forEach((b) => b.onclick = async () => { try { await post("remind", { id: e.id, rcpt: b.dataset.rem }); toast("Reminder sent"); open(e.id); } catch (x) { toast(x.message); } });
    }

    showList();
    return { root, refresh: () => { if (S.view === "list") refreshList(); }, showList, open };
  }
  window.WPEsign = { mount, renderPdf, loadPdfjs };
})();
