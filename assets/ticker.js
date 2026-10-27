/* WorkerPool highlight bar (replaces the old scrolling "Hot & New" ticker).
   Add <div id="hn"></div> under the header, then <script src="/assets/ticker.js?v=2" defer></script>.
   Shows one highlight at a time: the newest immigration draws (from /api/draws) and the Hot & New items (from /api/news),
   gently cycling every few seconds. Hovering, focusing or pressing pause stops it. */
(function () {
  const root = document.getElementById("hn");
  if (!root) return;
  const css = `
.hb{--hb-bg:#12302c;--hb-bg2:#1a403a;--hb-fg:#f3faf8;--hb-dim:#a8c8c1;--hb-amber:#ffc65c;--hb-line:rgba(255,255,255,.14);
  background:linear-gradient(90deg,var(--hb-bg),var(--hb-bg2));color:var(--hb-fg);border-bottom:1px solid #0a1c19;font-family:"Figtree","Segoe UI",system-ui,sans-serif;position:relative}
.hb::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--hb-amber)}
.hb-in{max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:14px;min-height:50px;padding:6px max(20px,env(safe-area-inset-right,0px)) 6px max(20px,env(safe-area-inset-left,0px))}
.hb-lab{flex:none;display:inline-flex;align-items:center;gap:8px;font-size:.7rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--hb-amber)}
.hb-dot{width:8px;height:8px;border-radius:50%;background:var(--hb-amber);box-shadow:0 0 0 0 rgba(255,198,92,.6);animation:hbPing 2.2s ease-out infinite}
@keyframes hbPing{0%{box-shadow:0 0 0 0 rgba(255,198,92,.55)}70%,100%{box-shadow:0 0 0 8px rgba(255,198,92,0)}}
.hb-view{flex:1;min-width:0;position:relative;height:38px;overflow:hidden}
.hb-item{position:absolute;inset:0;display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--hb-fg);opacity:0;transform:translateY(10px);transition:opacity .45s ease,transform .45s ease;pointer-events:none}
.hb-item.on{opacity:1;transform:none;pointer-events:auto}
.hb-item.out{opacity:0;transform:translateY(-10px)}
.hb-k{flex:none;font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.12);color:var(--hb-fg);white-space:nowrap}
.hb-k.draw{background:var(--hb-amber);color:#3a2700}
.hb-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:.96rem}
.hb-t b{font-family:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;font-weight:750}
.hb-t span{color:var(--hb-dim);font-weight:500}
.hb-item:hover .hb-t,.hb-item:focus-visible .hb-t{text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--hb-amber)}
.hb-ctl{flex:none;display:flex;align-items:center;gap:6px}
.hb-ctl button{width:30px;height:30px;border-radius:50%;border:1px solid var(--hb-line);background:transparent;color:var(--hb-fg);display:grid;place-items:center;cursor:pointer}
.hb-ctl button:hover{background:rgba(255,255,255,.1)}
.hb-n{font-size:.75rem;color:var(--hb-dim);min-width:34px;text-align:center;font-variant-numeric:tabular-nums}
.hb-all{font-size:.84rem;font-weight:700;color:var(--hb-fg);text-decoration:none;padding:6px 12px;border-radius:999px;border:1px solid var(--hb-line);white-space:nowrap}
.hb-all:hover{background:rgba(255,255,255,.1)}
.hb a:focus-visible,.hb button:focus-visible{outline:2px solid var(--hb-amber);outline-offset:2px}
@media (max-width:720px){.hb-all,.hb-n{display:none}.hb-lab span{display:none}.hb-in{gap:10px}.hb-t{font-size:.9rem}}
@media (max-width:420px){.hb-k{display:none}.hb-ctl [data-a="prev"],.hb-ctl [data-a="pause"]{display:none}}
@media (prefers-reduced-motion:reduce){.hb-dot{animation:none}.hb-item{transition:none}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LABEL = { hot: "Hot", new: "New", trending: "Trending", update: "Update" };
  const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const onHome = !!document.getElementById("draws");
  const ic = { prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>', pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="M8 5l11 7-11 7z"/>' };
  const svg = (k) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[k]}</svg>`;

  const pick = (p) => p.then((r) => r.json()).catch(() => ({}));
  Promise.all([pick(fetch("/api/draws?days=21")), pick(fetch("/api/news"))]).then(([dj, nj]) => {
    const items = [];
    const draws = (dj && dj.draws) || [];
    if (draws.length) {
      const latestDay = draws[0].date;
      // newest day's draws first (at most 4), then one per program from the days after
      const seen = new Set();
      draws.filter((d) => d.date === latestDay).slice(0, 4).forEach((d) => { seen.add(d.program); items.push(drawItem(d)); });
      draws.filter((d) => d.date !== latestDay && !seen.has(d.program)).slice(0, 3).forEach((d) => { seen.add(d.program); items.push(drawItem(d)); });
    }
    ((nj && nj.items) || []).slice(0, 8).forEach((it) => {
      const tag = it.trending && it.tag !== "hot" ? "trending" : it.tag;
      items.push({ k: LABEL[tag] || "New", cls: "", href: it.link || "/news/", html: esc(it.title), id: it.id });
    });
    if (!items.length) return;
    render(items);
  });

  function drawItem(d) {
    const nums = [d.invites ? d.invites + " invited" : "", d.score != null ? (d.jur === "CA" ? "CRS " : "min score ") + d.score : ""].filter(Boolean).join(" · ");
    return { k: "Draw · " + day(d.date), cls: "draw", href: onHome ? "#draws" : "/#draws",
      html: `<b>${esc(d.program)}</b> ${esc(d.stream)}${nums ? ` <span>— ${esc(nums)}</span>` : ""}` };
  }

  function render(items) {
    root.className = "hb";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Latest draws and updates");
    root.innerHTML = `<div class="hb-in">
      <span class="hb-lab"><i class="hb-dot" aria-hidden="true"></i><span>Latest</span></span>
      <div class="hb-view" aria-live="polite">${items.map((it, i) => {
        const ext = /^https:/.test(it.href);
        return `<a class="hb-item${i === 0 ? " on" : ""}" href="${esc(it.href)}"${ext ? ' target="_blank" rel="noopener"' : ""}${it.id ? ` data-id="${esc(it.id)}"` : ""}${i ? ' tabindex="-1" aria-hidden="true"' : ""}><span class="hb-k ${it.cls}">${esc(it.k)}</span><span class="hb-t">${it.html}</span></a>`;
      }).join("")}</div>
      ${items.length > 1 ? `<div class="hb-ctl"><button type="button" data-a="prev" aria-label="Previous">${svg("prev")}</button><span class="hb-n">1/${items.length}</span><button type="button" data-a="pause" aria-label="Pause">${svg("pause")}</button><button type="button" data-a="next" aria-label="Next">${svg("next")}</button></div>` : ""}
      <a class="hb-all" href="${onHome ? "#draws" : "/#draws"}">All draws</a></div>`;
    const els = [...root.querySelectorAll(".hb-item")], n = root.querySelector(".hb-n");
    let i = 0, paused = false, hold = false, timer;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const show = (j) => {
      const old = els[i]; i = (j + els.length) % els.length;
      old.classList.remove("on"); old.classList.add("out"); old.tabIndex = -1; old.setAttribute("aria-hidden", "true");
      setTimeout(() => old.classList.remove("out"), 460);
      els[i].classList.add("on"); els[i].removeAttribute("tabindex"); els[i].removeAttribute("aria-hidden");
      if (n) n.textContent = `${i + 1}/${els.length}`;
    };
    const tick = () => { clearInterval(timer); if (els.length > 1 && !reduce) timer = setInterval(() => { if (!paused && !hold && !document.hidden) show(i + 1); }, 5500); };
    root.addEventListener("mouseenter", () => (hold = true)); root.addEventListener("mouseleave", () => (hold = false));
    root.addEventListener("focusin", () => (hold = true)); root.addEventListener("focusout", () => (hold = false));
    root.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
      if (b.dataset.a === "prev") show(i - 1);
      else if (b.dataset.a === "next") show(i + 1);
      else { paused = !paused; b.innerHTML = svg(paused ? "play" : "pause"); b.setAttribute("aria-label", paused ? "Play" : "Pause"); }
      tick();
    });
    root.addEventListener("click", (e) => { // count news clicks (ranks trending items)
      const a = e.target.closest(".hb-item[data-id]");
      if (a) try { navigator.sendBeacon("/api/news", new Blob([JSON.stringify({ id: a.dataset.id })], { type: "application/json" })); } catch (x) {}
    });
    tick();
  }
})();
