/* WorkerPool live chat widget. Add <script src="/assets/chat.js" defer></script> to any page.
   Live 8:00 a.m. to 11:00 p.m. Mountain Time (America/Edmonton), daily. Outside those hours it takes a message and an email.
   Visitors can also leave a voice note (up to 2 minutes) from the mic button beside the chat button, or inside the chat. */
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
.wpc-dock{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:900;display:flex;align-items:center;gap:10px}
.wpc-vbtn{display:flex;align-items:center;gap:8px;font:600 14px/1 var(--body,system-ui,sans-serif);background:var(--surface,#fff);color:var(--fg,#1b2628);border:1px solid var(--line,#d3dcda);border-radius:999px;padding:7px 14px 7px 7px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.14)}
.wpc-vbtn:hover{border-color:var(--accent,#3f7a72)}
.wpc-vbtn i{width:32px;height:32px;border-radius:50%;background:#e0483a;color:#fff;display:grid;place-items:center;flex:none}
@media (max-width:520px){.wpc-vbtn{padding:7px}.wpc-vbtn span{display:none}}
.wpc-btn{display:flex;align-items:center;gap:9px;font:600 15px/1 var(--body,system-ui,sans-serif);background:var(--accent,#3f7a72);color:var(--accent-fg,#fff);border:0;border-radius:999px;padding:13px 18px 13px 15px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.18)}
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
.wpc-clip{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid var(--line,#d3dcda);background:var(--surface,#fff);color:var(--muted,#5a696b);display:grid;place-items:center;cursor:pointer}
.wpc-clip:hover{color:var(--fg,#1b2628)}
.wpc-clip:disabled{opacity:.5;cursor:default}
.wpc-file{display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-weight:600}
.wpc-file span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wpc-file em{font-style:normal;font-weight:400;opacity:.75;font-size:.8rem;white-space:nowrap}
.wpc-img{display:block;max-width:100%;max-height:220px;border-radius:9px;margin:2px 0}
.wpc-up{font-size:.8rem;color:var(--muted,#5a696b);padding:0 12px 6px;background:var(--surface,#fff)}
.wpc-up:empty{display:none}
.wpc-err{color:#c0532b;font-size:.82rem;padding:0 12px 6px;background:var(--surface,#fff)}
.wpc-err:empty{display:none}
.wpc-mic{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid var(--line,#d3dcda);background:var(--surface,#fff);color:#e0483a;display:grid;place-items:center;cursor:pointer}
.wpc-rec{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 12px;background:var(--surface,#fff);border:1px solid var(--line,#d3dcda);border-radius:14px;text-align:center}
.wpc-recbtn{width:72px;height:72px;border-radius:50%;border:0;background:#e0483a;color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 18px rgba(224,72,58,.35);transition:transform .15s}
.wpc-recbtn:hover{transform:scale(1.04)}
.wpc-recbtn.on{animation:wpcRec 1.3s ease-in-out infinite}
@keyframes wpcRec{0%,100%{box-shadow:0 0 0 0 rgba(224,72,58,.5)}60%{box-shadow:0 0 0 14px rgba(224,72,58,0)}}
.wpc-rect{font:700 1.5rem/1 var(--display,inherit);font-variant-numeric:tabular-nums}
.wpc-rect span{font-size:.9rem;font-weight:500;color:var(--muted,#5a696b)}
.wpc-rech{font-size:.84rem;color:var(--muted,#5a696b)}
.wpc-lvl{width:100%;max-width:220px;height:6px;border-radius:9px;background:var(--line,#d3dcda);overflow:hidden}
.wpc-lvl i{display:block;height:100%;width:0;background:#e0483a;transition:width .08s}
.wpc-rec audio,.wpc-voice audio{width:100%;max-width:280px;height:40px}
.wpc-recrow{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.wpc-ghost{font:600 14px/1 var(--body,system-ui,sans-serif);background:transparent;color:var(--fg,#1b2628);border:1px solid var(--line,#d3dcda);border-radius:999px;padding:11px 14px;cursor:pointer}
.wpc-link{align-self:center;font:600 13px/1 var(--body,system-ui,sans-serif);background:none;border:0;color:var(--muted,#5a696b);text-decoration:underline;cursor:pointer;padding:6px}
.wpc-voice{display:flex;flex-direction:column;gap:6px;min-width:220px}
@media (prefers-reduced-motion:reduce){.wpc-recbtn.on{animation:none}}
.wpc [hidden]{display:none!important}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const root = document.createElement("div"); root.className = "wpc";
  root.innerHTML = `
<div class="wpc-dock"><button class="wpc-vbtn" type="button" aria-label="Leave a voice note" title="Leave a voice note"><i><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></i><span>Voice note</span></button><button class="wpc-btn" type="button" aria-label="Open live chat"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg><span class="wpc-lbl">Chat with us</span><i class="wpc-dot"></i><span class="wpc-badge" hidden></span></button></div>
<div class="wpc-panel" role="dialog" aria-label="Live chat" hidden>
  <div class="wpc-head"><div><b>WorkerPool</b><small><i class="wpc-dot"></i><span class="wpc-status"></span></small></div><button class="wpc-x" type="button" aria-label="Close chat">×</button></div>
  <div class="wpc-body"></div>
  <div class="wpc-err" role="alert"></div><div class="wpc-up" aria-live="polite"></div>
  <div class="wpc-foot" hidden><button class="wpc-clip" type="button" aria-label="Attach a file" title="Attach a file (PDF, JPG, PNG, DOC, DOCX up to 10 MB)"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button><input type="file" class="wpc-fin" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple hidden><button class="wpc-mic" type="button" aria-label="Record a voice note" title="Record a voice note (up to 2 minutes)"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><textarea rows="1" maxlength="2000" placeholder="Type a message" aria-label="Message"></textarea><button class="wpc-go" type="button">Send</button></div>
</div>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  const dock = q(".wpc-dock"), btn = q(".wpc-btn"), panel = q(".wpc-panel"), body = q(".wpc-body"), foot = q(".wpc-foot"), ta = q(".wpc-foot textarea"), errEl = q(".wpc-err"), badge = q(".wpc-badge");
  let inVoice = false, started = ls.get("wp_chat") === "1", lastId = 0, msgs = [], thread = null, timer = null, busy = false;

  function status() {
    const o = isOpen();
    root.querySelectorAll(".wpc-dot").forEach((d) => d.classList.toggle("off", !o));
    q(".wpc-status").textContent = o ? "Online now · we usually reply within minutes" : "Offline · back at 8:00 a.m. Mountain Time";
    q(".wpc-lbl").textContent = o ? "Chat with us" : "Leave a message";
    return o;
  }
  const intro = () => `<div class="wpc-info">${isOpen() ? "Message our team directly. A real person will reply here." : "We're offline right now. Leave a message with your email and we'll reply when we're back."} ${HOURS}.<br>You can send a voice note or attach files. They're stored privately and only our team can hear or see them.<br>We're not immigration representatives and can't give immigration advice.</div>`;
  function renderMsgs(scroll) {
    const near = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    body.innerHTML = intro() + msgs.map((m) => `<div class="wpc-m ${m.sender === "admin" ? "a" : "v"}">${m.file_id ? fileHTML(m) : esc(m.body)}<small>${m.sender === "admin" ? "WorkerPool · " : ""}${time(m.created)}</small></div>`).join("")
      + (thread && thread.status === "closed" ? `<div class="wpc-info">This conversation was closed. Send a message to start it again.</div>` : "")
      + (!isOpen() && msgs.length && msgs[msgs.length - 1].sender === "visitor" ? `<div class="wpc-info">Thanks. We're offline now and will reply ${thread && thread.hasEmail ? "here and by email" : "here"} after 8:00 a.m. Mountain Time.</div>` : "");
    if (scroll || near) body.scrollTop = body.scrollHeight;
    loadAudio();
  }
  // Voice notes play from a local copy so seeking works in every browser (including Safari).
  // Chrome recordings have no length in their header until they are scanned once; this makes the seek bar work.
  const fixDur=(a)=>{ a.addEventListener("loadedmetadata",()=>{ if(a.duration===Infinity){ const t=()=>{ a.removeEventListener("timeupdate",t); a.currentTime=0; }; a.addEventListener("timeupdate",t); a.currentTime=1e101; } },{once:true}); };
  const audioUrls = new Map();
  function loadAudio() {
    body.querySelectorAll("audio[data-aud]").forEach(async (a) => {
      const fid = a.dataset.aud;
      try {
        if (!audioUrls.has(fid)) { const r = await fetch("/api/chat-file?id=" + encodeURIComponent(fid)); if (!r.ok) throw 0; audioUrls.set(fid, URL.createObjectURL(await r.blob())); }
        if (!a.src) { fixDur(a); a.src = audioUrls.get(fid); }
      } catch (e) { a.replaceWith(Object.assign(document.createElement("small"), { textContent: "Couldn't load this voice note." })); }
    });
  }
  function fileHTML(m) {
    const url = "/api/chat-file?id=" + encodeURIComponent(m.file_id);
    if (/^audio\//.test(m.file_type)) return `<div class="wpc-voice"><span>${esc(m.body || "🎤 Voice note")}</span><audio controls preload="metadata" data-aud="${esc(m.file_id)}"></audio></div>`;
    if (/^image\//.test(m.file_type)) return `<a href="${url}" target="_blank" rel="noopener"><img class="wpc-img" src="${url}" alt="${esc(m.file_name)}" loading="lazy"></a>`;
    return `<a class="wpc-file" href="${url}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>${esc(m.file_name)}</span><em>${kb(m.file_size || 0)}</em></a>`;
  }
  async function uploadFiles(files) {
    const up = q(".wpc-up"), clip = q(".wpc-clip"); errEl.textContent = ""; clip.disabled = true;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 10485760) { errEl.textContent = `${f.name} is over 10 MB.`; continue; }
      up.textContent = `Sending ${f.name}${files.length > 1 ? ` (${i + 1} of ${files.length})` : ""}…`;
      try {
        const r = await fetch("/api/chat-file", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) }, body: f });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { errEl.textContent = `${f.name}: ${j.error || "couldn't send."}`; if (j.needEmail) askEmail(); }
      } catch (e) { errEl.textContent = `${f.name}: couldn't send. Check your connection.`; }
    }
    up.textContent = ""; clip.disabled = false; track("Chat file sent");
    await poll(); renderMsgs(true);
  }
  function renderStart() {
    inVoice = false; const o = isOpen();
    body.innerHTML = intro() + `<form class="wpc-form" novalidate>
      <label>Your name<input name="name" autocomplete="name" maxlength="80" required></label>
      <label>Email ${o ? '<span style="font-weight:400;color:var(--muted,#5a696b)">(optional, so we can reply if you leave)</span>' : ""}<input name="email" type="email" autocomplete="email" maxlength="160" ${o ? "" : "required"}></label>
      <label>Message<textarea name="body" rows="4" maxlength="2000" required></textarea></label>
      <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
      <button class="wpc-go" type="submit">${o ? "Start chat" : "Send message"}</button>
      <button class="wpc-link" type="button" data-open-voice>Or leave a voice note instead</button></form>`;
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
  function showThread() { inVoice = false; foot.hidden = false; renderMsgs(true); }
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
        if (!j.thread) { started = false; ls.set("wp_chat", "0"); msgs = []; lastId = 0; if (!panel.hidden && !inVoice) renderStart(); }
        else { const before = msgs.length, was = thread && thread.status; thread = j.thread; merge(j.messages); if (!panel.hidden && !inVoice && (msgs.length !== before || was !== thread.status)) renderMsgs(); }
      }
    } catch (e) {}
    busy = false;
  }
  function schedule() { clearInterval(timer); timer = setInterval(() => { status(); poll(); }, panel.hidden ? 30000 : 4000); }
  async function openPanel() {
    if (voice) stopVoice(); panel.hidden = false; dock.hidden = true; errEl.textContent = ""; status(); track("Chat opened");
    if (started) { await poll(); if (started) { showThread(); ta.focus(); } } else renderStart();
    merge([]); schedule();
  }
  function closePanel() { stopVoice(); inVoice = false; panel.hidden = true; dock.hidden = false; schedule(); if (location.hash === "#chat") history.replaceState(null, "", location.pathname + location.search); }
  async function sendText() {
    const text = ta.value.trim(); if (!text) return;
    const em = body.querySelector(".wpc-email input");
    errEl.textContent = ""; const go = q(".wpc-foot .wpc-go"); go.disabled = true;
    const r = await send({ body: text, email: em ? em.value.trim() : "" });
    go.disabled = false;
    if (r) { ta.value = ""; ta.style.height = ""; if (em && em.value.trim() && thread) thread.hasEmail = true; if (thread) thread.status = "open"; renderMsgs(true); }
  }
  /* ---------- voice notes ---------- */
  const VMAX = 120, fmt = (n) => Math.floor(n / 60) + ":" + String(Math.floor(n % 60)).padStart(2, "0");
  const micIc = `<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const stopIc = `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>`;
  let voice = null; // { stream, rec, chunks, start, tick, blob, url, secs, ctx, raf }
  function stopVoice() {
    if (!voice) return;
    clearInterval(voice.tick); cancelAnimationFrame(voice.raf);
    try { if (voice.rec && voice.rec.state !== "inactive") { voice.rec.onstop = null; voice.rec.stop(); } } catch (e) {}
    if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
    if (voice.ctx) voice.ctx.close().catch(() => {});
    if (voice.url) URL.revokeObjectURL(voice.url);
    voice = null;
  }
  async function openVoice() {
    if (panel.hidden) { panel.hidden = false; dock.hidden = true; status(); schedule(); if (started) await poll(); }
    inVoice = true; errEl.textContent = ""; foot.hidden = true; track("Voice note opened");
    const o = isOpen(), needEmail = !o && !(started && thread && thread.hasEmail);
    body.innerHTML = `<div class="wpc-info">${o ? "Leave a voice note (up to 2 minutes). Our team will listen and reply here, usually within minutes." : "We're offline. Leave a voice note (up to 2 minutes) and your email, and we'll listen and reply after 8:00 a.m. Mountain Time."} We can't give immigration advice.</div>
      <form class="wpc-form" novalidate onsubmit="return false">
        ${started ? "" : `<label>Your name<input name="name" autocomplete="name" maxlength="80"></label>`}
        ${started && !needEmail ? "" : `<label>Email ${needEmail ? "" : '<span style="font-weight:400;color:var(--muted,#5a696b)">(optional, so we can reply if you leave)</span>'}<input name="email" type="email" autocomplete="email" maxlength="160"></label>`}
        <label>Phone <span style="font-weight:400;color:var(--muted,#5a696b)">(optional, if you'd like a call back)</span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      </form>
      <div class="wpc-rec">
        <button class="wpc-recbtn" type="button" aria-label="Start recording">${micIc}</button>
        <div class="wpc-rect">0:00 <span>/ 2:00</span></div>
        <div class="wpc-lvl" hidden><i></i></div>
        <div class="wpc-rech">Tap to start recording</div>
        <audio controls hidden></audio>
        <div class="wpc-recrow" hidden><button class="wpc-ghost wpc-again" type="button">Record again</button><button class="wpc-go wpc-vsend" type="button">Send voice note</button></div>
      </div>
      <button class="wpc-link wpc-vcancel" type="button">${started ? "Back to chat" : "Type a message instead"}</button>`;
    const R = (c) => body.querySelector(c), recBtn = R(".wpc-recbtn");
    recBtn.onclick = () => (voice && voice.rec && voice.rec.state === "recording" ? finishRec() : startRec());
    R(".wpc-again").onclick = () => { stopVoice(); openVoice(); };
    R(".wpc-vsend").onclick = sendVoice;
    R(".wpc-vcancel").onclick = () => { stopVoice(); if (started) showThread(); else renderStart(); };
  }
  async function startRec() {
    errEl.textContent = "";
    if (!navigator.mediaDevices || !window.MediaRecorder) { errEl.textContent = "Your browser can't record voice notes. Please type a message instead."; return; }
    const R = (c) => body.querySelector(c);
    stopVoice();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { errEl.textContent = "We couldn't use your microphone. Allow microphone access for this site in your browser settings, or type a message instead."; return; }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    voice = { stream, rec, chunks: [], start: Date.now() };
    rec.ondataavailable = (e) => { if (e.data && e.data.size) voice.chunks.push(e.data); };
    rec.onstop = () => {
      if (!voice) return;
      voice.secs = Math.max(1, Math.round((Date.now() - voice.start) / 1000));
      voice.blob = new Blob(voice.chunks, { type: rec.mimeType || mime || "audio/webm" });
      voice.stream.getTracks().forEach((t) => t.stop());
      voice.url = URL.createObjectURL(voice.blob);
      const a = R(".wpc-rec audio"); if (!a) return;
      fixDur(a); a.src = voice.url; a.hidden = false; R(".wpc-recrow").hidden = false; R(".wpc-recbtn").hidden = true; R(".wpc-lvl").hidden = true;
      R(".wpc-rech").textContent = "Listen back, then send it or record again.";
      R(".wpc-rect").innerHTML = fmt(voice.secs) + " <span>recorded</span>";
    };
    rec.start(1000);
    const b = R(".wpc-recbtn"); b.classList.add("on"); b.innerHTML = stopIc; b.setAttribute("aria-label", "Stop recording");
    R(".wpc-rech").textContent = "Recording… tap to stop"; R(".wpc-lvl").hidden = false;
    voice.tick = setInterval(() => {
      const t = (Date.now() - voice.start) / 1000, el = R(".wpc-rect");
      if (el) el.innerHTML = fmt(t) + " <span>/ 2:00</span>";
      if (t >= VMAX) finishRec();
    }, 250);
    // Simple input level meter so people can see the mic is picking them up.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an); voice.ctx = ctx;
      const data = new Uint8Array(an.frequencyBinCount);
      const draw = () => { if (!voice) return; an.getByteTimeDomainData(data); let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        const bar = R(".wpc-lvl i"); if (bar) bar.style.width = Math.min(100, peak * 1.6) + "%"; voice.raf = requestAnimationFrame(draw); };
      draw();
    } catch (e) {}
    track("Voice note recording");
  }
  function finishRec() {
    if (!voice || !voice.rec || voice.rec.state !== "recording") return;
    clearInterval(voice.tick); cancelAnimationFrame(voice.raf);
    if (voice.ctx) { voice.ctx.close().catch(() => {}); voice.ctx = null; }
    const b = body.querySelector(".wpc-recbtn"); if (b) b.classList.remove("on");
    voice.rec.stop();
  }
  async function sendVoice() {
    if (!voice || !voice.blob) return;
    const f = body.querySelector(".wpc-form"), d = f ? Object.fromEntries(new FormData(f)) : {};
    const name = (d.name || "").trim(), email = (d.email || "").trim(), phone = (d.phone || "").trim();
    errEl.textContent = "";
    if (!started && !name) return (errEl.textContent = "Enter your name.");
    if (f && f.querySelector("[name=email]") && !isOpen() && !email) return (errEl.textContent = "Add your email so we can reply.");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return (errEl.textContent = "Check your email address.");
    const go = body.querySelector(".wpc-vsend"); go.disabled = true; go.textContent = "Sending…";
    const enc = encodeURIComponent;
    try {
      const r = await fetch("/api/chat-voice", { method: "POST", body: voice.blob, headers: { "Content-Type": "application/octet-stream",
        "X-Name": enc(name), "X-Email": enc(email), "X-Phone": enc(phone), "X-Duration": String(voice.secs), "X-Page": enc(location.pathname) } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { errEl.textContent = j.error || "Couldn't send. Try again."; go.disabled = false; go.textContent = "Send voice note"; return; }
    } catch (e) { errEl.textContent = "Couldn't send. Check your connection."; go.disabled = false; go.textContent = "Send voice note"; return; }
    if (!started) { started = true; ls.set("wp_chat", "1"); thread = { name, hasEmail: !!email, status: "open" }; }
    else if (email && thread) thread.hasEmail = true;
    stopVoice(); track("Voice note sent");
    await poll(); showThread();
  }
  q(".wpc-vbtn").onclick = openVoice;
  q(".wpc-mic").onclick = openVoice;

  const fin = q(".wpc-fin");
  q(".wpc-clip").onclick = () => { fin.value = ""; fin.click(); };
  fin.onchange = () => { const f = [...fin.files]; if (f.length) uploadFiles(f); };
  btn.onclick = openPanel;
  q(".wpc-x").onclick = closePanel;
  q(".wpc-foot .wpc-go").onclick = sendText;
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) closePanel(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  window.addEventListener("hashchange", () => { if (location.hash === "#chat" && panel.hidden) openPanel(); });
  document.addEventListener("click", (e) => { const v = e.target.closest('a[href="#voice"],[data-open-voice]'); if (v) { e.preventDefault(); openVoice(); return; } const a = e.target.closest('a[href="#chat"],[data-open-chat]'); if (a) { e.preventDefault(); if (panel.hidden) openPanel(); } });

  status(); schedule();
  if (started) poll();
  if (location.hash === "#chat") openPanel();
  else if (location.hash === "#voice") openVoice();
})();
