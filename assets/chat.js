/* WorkerPool live chat widget. Add <script src="/assets/chat.js" defer></script> to any page.
   Live 8:00 a.m. to 11:00 p.m. Mountain Time (America/Edmonton), daily. Outside those hours it takes a message and an email. */
(function () {
  if (window.__wpChat) return; window.__wpChat = true;
  const TZ = "America/Edmonton", OPEN = 8, CLOSE = 23;
  const HOURS = "Live 8:00 a.m. to 11:00 p.m. Mountain Time, daily";
  const isOpen = () => { const h = parseInt(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date())); return h >= OPEN && h < CLOSE; };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const time = (t) => new Date(t).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  const track = (n) => window.wpaSection && window.wpaSection(n);

  const css = `
.wpc-btn{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:900;display:flex;align-items:center;gap:9px;font:600 15px/1 var(--body,system-ui,sans-serif);background:var(--accent,#3f7a72);color:var(--accent-fg,#fff);border:0;border-radius:999px;padding:13px 18px 13px 15px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.18)}
.wpc-btn:hover{filter:brightness(1.06)}
.wpc-btn svg{flex:none}
.wpc-dot{width:9px;height:9px;border-radius:50%;background:#7ee2a8;box-shadow:0 0 0 2px var(--accent,#3f7a72)}
.wpc-dot.off{background:#b9c2c1}
.wpc-badge{min-width:20px;height:20px;border-radius:10px;background:#d4572f;color:#fff;font-size:12px;display:grid;place-items:center;padding:0 6px}
.wpc-panel{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:901;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 32px));display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--fg,#1b2628);border:1px solid var(--line,#d3dcda);border-radius:18px;box-shadow:0 14px 44px rgba(0,0,0,.22);overflow:hidden;font:15px/1.5 var(--body,system-ui,sans-serif)}
@media (max-width:520px){.wpc-panel{inset:0;width:auto;height:auto;border-radius:0;border:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
.wpc-head{background:var(--accent,#3f7a72);color:var(--accent-fg,#fff);padding:14px 16px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.wpc-head b{display:block;font-family:var(--display,inherit);font-size:1.05rem}
.wpc-head small{display:flex;align-items:center;gap:7px;font-size:.8rem;opacity:.92;margin-top:2px}
.wpc-x{border:0;background:rgba(255,255,255,.16);color:inherit;width:32px;height:32px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer;flex:none}
.wpc-body{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px;background:var(--bg,#f3f6f5)}
.wpc-info{font-size:.8rem;color:var(--muted,#5a696b);background:var(--surface,#fff);border:1px solid var(--line,#d3dcda);border-radius:12px;padding:10px 12px}
.wpc-m{max-width:82%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;font-size:.92rem}
.wpc-m small{display:block;font-size:.7rem;opacity:.7;margin-top:2px}
.wpc-m.v{align-self:flex-end;background:var(--accent,#3f7a72);color:var(--accent-fg,#fff);border-bottom-right-radius:4px}
.wpc-m.a{align-self:flex-start;background:var(--surface,#fff);border:1px solid var(--line,#d3dcda);border-bottom-left-radius:4px}
.wpc-form{display:flex;flex-direction:column;gap:9px;padding:4px 0}
.wpc-form label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:600}
.wpc input,.wpc textarea{font:inherit;font-size:16px;font-weight:400;color:var(--fg,#1b2628);background:var(--surface,#fff);border:1px solid var(--line,#d3dcda);border-radius:10px;padding:9px 11px;width:100%;box-sizing:border-box}
.wpc textarea{resize:none}
.wpc-go{font:600 15px/1 var(--body,system-ui,sans-serif);background:var(--accent,#3f7a72);color:var(--accent-fg,#fff);border:0;border-radius:999px;padding:12px 16px;cursor:pointer}
.wpc-go:disabled{opacity:.6;cursor:default}
.wpc-foot{display:flex;gap:8px;align-items:flex-end;padding:10px;border-top:1px solid var(--line,#d3dcda);background:var(--surface,#fff)}
.wpc-foot textarea{max-height:120px}
.wpc-foot .wpc-go{padding:11px 14px}
.wpc-err{color:#c0532b;font-size:.82rem;padding:0 12px 6px;background:var(--surface,#fff)}
.wpc-err:empty{display:none}
.wpc [hidden]{display:none!important}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const root = document.createElement("div"); root.className = "wpc";
  root.innerHTML = `
<button class="wpc-btn" type="button" aria-label="Open live chat"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg><span class="wpc-lbl">Chat with us</span><i class="wpc-dot"></i><span class="wpc-badge" hidden></span></button>
<div class="wpc-panel" role="dialog" aria-label="Live chat" hidden>
  <div class="wpc-head"><div><b>WorkerPool</b><small><i class="wpc-dot"></i><span class="wpc-status"></span></small></div><button class="wpc-x" type="button" aria-label="Close chat">×</button></div>
  <div class="wpc-body"></div>
  <div class="wpc-err" role="alert"></div>
  <div class="wpc-foot" hidden><textarea rows="1" maxlength="2000" placeholder="Type a message" aria-label="Message"></textarea><button class="wpc-go" type="button">Send</button></div>
</div>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  const btn = q(".wpc-btn"), panel = q(".wpc-panel"), body = q(".wpc-body"), foot = q(".wpc-foot"), ta = q(".wpc-foot textarea"), errEl = q(".wpc-err"), badge = q(".wpc-badge");
  let started = ls.get("wp_chat") === "1", lastId = 0, msgs = [], thread = null, timer = null, busy = false;

  function status() {
    const o = isOpen();
    root.querySelectorAll(".wpc-dot").forEach((d) => d.classList.toggle("off", !o));
    q(".wpc-status").textContent = o ? "Online now · we usually reply within minutes" : "Offline · back at 8:00 a.m. Mountain Time";
    q(".wpc-lbl").textContent = o ? "Chat with us" : "Leave a message";
    return o;
  }
  const intro = () => `<div class="wpc-info">${isOpen() ? "Message our team directly. A real person will reply here." : "We're offline right now. Leave a message with your email and we'll reply when we're back."} ${HOURS}.<br>We're not immigration representatives and can't give immigration advice. Please don't share passport or ID numbers in chat.</div>`;
  function renderMsgs(scroll) {
    const near = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    body.innerHTML = intro() + msgs.map((m) => `<div class="wpc-m ${m.sender === "admin" ? "a" : "v"}">${esc(m.body)}<small>${m.sender === "admin" ? "WorkerPool · " : ""}${time(m.created)}</small></div>`).join("")
      + (thread && thread.status === "closed" ? `<div class="wpc-info">This conversation was closed. Send a message to start it again.</div>` : "")
      + (!isOpen() && msgs.length && msgs[msgs.length - 1].sender === "visitor" ? `<div class="wpc-info">Thanks. We're offline now and will reply ${thread && thread.hasEmail ? "here and by email" : "here"} after 8:00 a.m. Mountain Time.</div>` : "");
    if (scroll || near) body.scrollTop = body.scrollHeight;
  }
  function renderStart() {
    const o = isOpen();
    body.innerHTML = intro() + `<form class="wpc-form" novalidate>
      <label>Your name<input name="name" autocomplete="name" maxlength="80" required></label>
      <label>Email ${o ? '<span style="font-weight:400;color:var(--muted,#5a696b)">(optional, so we can reply if you leave)</span>' : ""}<input name="email" type="email" autocomplete="email" maxlength="160" ${o ? "" : "required"}></label>
      <label>Message<textarea name="body" rows="4" maxlength="2000" required></textarea></label>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
      <button class="wpc-go" type="submit">${o ? "Start chat" : "Send message"}</button></form>`;
    foot.hidden = true;
    const f = body.querySelector("form");
    f.onsubmit = async (e) => {
      e.preventDefault(); errEl.textContent = "";
      const d = Object.fromEntries(new FormData(f));
      if (!d.name.trim()) return errEl.textContent = "Enter your name.";
      if (!d.body.trim()) return errEl.textContent = "Type a message first.";
      if (!isOpen() && !d.email.trim()) return errEl.textContent = "Add your email so we can reply.";
      const b = f.querySelector("button"); b.disabled = true; b.textContent = "Sending…";
      const r = await send({ ...d, page: location.pathname });
      if (!r) { b.disabled = false; b.textContent = isOpen() ? "Start chat" : "Send message"; return; }
      started = true; ls.set("wp_chat", "1"); thread = { name: d.name, hasEmail: !!d.email.trim(), status: "open" }; track("Chat started");
      showThread();
    };
    setTimeout(() => f.querySelector("input").focus(), 50);
  }
  function showThread() { foot.hidden = false; renderMsgs(true); }
  function merge(list) {
    for (const m of list || []) if (m.id > lastId) { msgs.push(m); lastId = m.id; }
    const seen = parseInt(ls.get("wp_chat_seen")) || 0;
    const unread = msgs.filter((m) => m.sender === "admin" && m.id > seen).length;
    if (!panel.hidden) { ls.set("wp_chat_seen", String(lastId)); badge.hidden = true; }
    else { badge.textContent = unread; badge.hidden = !unread; }
  }
  async function send(payload) {
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, after: lastId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { errEl.textContent = j.error || "Couldn't send. Try again."; if (j.needEmail) askEmail(); return null; }
      merge(j.messages); return j;
    } catch (e) { errEl.textContent = "Couldn't send. Check your connection."; return null; }
  }
  function askEmail() {
    if (body.querySelector(".wpc-email")) return;
    const w = document.createElement("div"); w.className = "wpc-info wpc-email";
    w.innerHTML = `<label style="display:flex;flex-direction:column;gap:6px;font-weight:600">Your email, so we can reply<input type="email" autocomplete="email" maxlength="160"></label>`;
    body.appendChild(w); body.scrollTop = body.scrollHeight; w.querySelector("input").focus();
  }
  async function poll() {
    if (!started || busy || document.hidden) return;
    busy = true;
    try {
      const r = await fetch("/api/chat?after=" + lastId);
      const j = await r.json();
      if (j.ok) {
        if (!j.thread) { started = false; ls.set("wp_chat", "0"); msgs = []; lastId = 0; if (!panel.hidden) renderStart(); }
        else { const before = msgs.length, was = thread && thread.status; thread = j.thread; merge(j.messages); if (!panel.hidden && (msgs.length !== before || was !== thread.status)) renderMsgs(); }
      }
    } catch (e) {}
    busy = false;
  }
  function schedule() { clearInterval(timer); timer = setInterval(() => { status(); poll(); }, panel.hidden ? 30000 : 4000); }
  async function openPanel() {
    panel.hidden = false; btn.hidden = true; errEl.textContent = ""; status(); track("Chat opened");
    if (started) { await poll(); if (started) { showThread(); ta.focus(); } } else renderStart();
    merge([]); schedule();
  }
  function closePanel() { panel.hidden = true; btn.hidden = false; schedule(); if (location.hash === "#chat") history.replaceState(null, "", location.pathname + location.search); }
  async function sendText() {
    const text = ta.value.trim(); if (!text) return;
    const em = body.querySelector(".wpc-email input");
    errEl.textContent = ""; const go = q(".wpc-foot .wpc-go"); go.disabled = true;
    const r = await send({ body: text, email: em ? em.value.trim() : "" });
    go.disabled = false;
    if (r) { ta.value = ""; ta.style.height = ""; if (em && em.value.trim() && thread) thread.hasEmail = true; if (thread) thread.status = "open"; renderMsgs(true); }
  }
  btn.onclick = openPanel;
  q(".wpc-x").onclick = closePanel;
  q(".wpc-foot .wpc-go").onclick = sendText;
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) closePanel(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  window.addEventListener("hashchange", () => { if (location.hash === "#chat" && panel.hidden) openPanel(); });
  document.addEventListener("click", (e) => { const a = e.target.closest('a[href="#chat"],[data-open-chat]'); if (a) { e.preventDefault(); if (panel.hidden) openPanel(); } });

  status(); schedule();
  if (started) poll();
  if (location.hash === "#chat") openPanel();
})();
