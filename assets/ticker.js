/* WorkerPool "Hot & New" ticker.
   Add <div id="hn"></div> where it should appear, then <script src="/assets/ticker.js?v=1" defer></script>.
   Items come from /api/news (managed in the admin dashboard under "Hot & New"). */
(function () {
  const root = document.getElementById("hn");
  if (!root) return;
  const css = `
.hn{--hn-bg:#0d1c1a;--hn-bg2:#173531;--hn-fg:#f4faf8;--hn-dim:#a9c4bf;--hn-hot:#ff5a36;--hn-hot2:#ff9a1f;--hn-new:#ffd23f;--hn-tr:#a48bff;
  position:relative;background:linear-gradient(100deg,var(--hn-bg) 0%,var(--hn-bg2) 55%,var(--hn-bg) 100%);color:var(--hn-fg);
  border-bottom:1px solid #000;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);font-family:"Figtree","Segoe UI",system-ui,sans-serif;overflow:hidden}
.hn::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(600px 80px at 0% 50%,rgba(255,90,54,.22),transparent 70%)}
.hn-in{display:flex;align-items:stretch;min-height:54px;max-width:1440px;margin:0 auto;position:relative;z-index:1}
.hn-badge{flex:none;display:flex;align-items:center;gap:9px;padding:0 18px 0 max(16px,env(safe-area-inset-left,0px));text-decoration:none;color:#fff;
  background:linear-gradient(120deg,var(--hn-hot),var(--hn-hot2));clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%);padding-right:30px}
.hn-badge b{font-family:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;font-weight:800;font-size:1.02rem;letter-spacing:.06em;text-transform:uppercase;line-height:1;white-space:nowrap;text-shadow:0 1px 0 rgba(0,0,0,.18)}
.hn-flame{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.2);animation:hnPulse 1.6s ease-in-out infinite}
@keyframes hnPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}60%{box-shadow:0 0 0 7px rgba(255,255,255,0)}}
.hn-track{flex:1;min-width:0;overflow:hidden;display:flex;align-items:center;-webkit-mask-image:linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 40px),transparent)}
.hn-rail{display:flex;width:max-content;animation:hnRoll var(--hn-dur,60s) linear infinite}
.hn:hover .hn-rail,.hn:focus-within .hn-rail,.hn.paused .hn-rail{animation-play-state:paused}
@keyframes hnRoll{to{transform:translateX(-50%)}}
.hn-set{display:flex;align-items:center}
.hn-item{display:inline-flex;align-items:center;gap:10px;padding:8px 22px;text-decoration:none;color:var(--hn-fg);font-weight:700;font-size:.97rem;white-space:nowrap;border-radius:8px}
.hn-item:hover .hn-t,.hn-item:focus-visible .hn-t{text-decoration:underline;text-decoration-color:var(--hn-hot2);text-decoration-thickness:2px;text-underline-offset:4px}
.hn-item:focus-visible{outline:2px solid var(--hn-new);outline-offset:-2px}
.hn-item+.hn-item::before,.hn-set+.hn-set .hn-item:first-child::before{content:"";width:6px;height:6px;transform:rotate(45deg);background:var(--hn-hot2);margin:0 22px 0 -22px;opacity:.85}
.hn-tag{font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:3px 7px;border-radius:5px;line-height:1.2}
.hn-tag.hot{background:var(--hn-hot);color:#fff}.hn-tag.new{background:var(--hn-new);color:#2a2100}
.hn-tag.trending{background:var(--hn-tr);color:#fff}.hn-tag.update{background:rgba(255,255,255,.14);color:var(--hn-fg)}
.hn-pin{color:var(--hn-new);font-size:.85rem}
.hn-ctl{flex:none;display:flex;align-items:center;gap:4px;padding:0 max(12px,env(safe-area-inset-right,0px)) 0 8px}
.hn-pp{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:transparent;color:var(--hn-fg);cursor:pointer;display:grid;place-items:center}
.hn-pp:hover{background:rgba(255,255,255,.1)}
.hn-pp:focus-visible,.hn-all:focus-visible,.hn-badge:focus-visible{outline:2px solid var(--hn-new);outline-offset:2px}
.hn-all{font-size:.85rem;font-weight:700;color:var(--hn-fg);text-decoration:none;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.1);white-space:nowrap}
.hn-all:hover{background:rgba(255,255,255,.18)}
@media (max-width:640px){.hn-badge b{font-size:.86rem}.hn-badge{padding-left:12px;padding-right:24px}.hn-all{display:none}.hn-item{font-size:.9rem;padding:8px 16px}.hn-in{min-height:48px}}
@media (prefers-reduced-motion:reduce){.hn-rail{animation:none}.hn-track{overflow-x:auto;-webkit-mask-image:none;mask-image:none}.hn-set[aria-hidden]{display:none}.hn-flame{animation:none}.hn-pp{display:none}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LABEL = { hot: "Hot", new: "New", trending: "Trending", update: "Update" };
  const flame = `<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M13.5 1.5s.9 3.2-1.3 6.1C10.6 9.7 8 10.9 8 14.6a4 4 0 0 0 8 0c0-1.6-.7-2.6-.7-2.6s2.7 1.2 2.7 5A6 6 0 0 1 6 17c0-5.1 3.5-7.2 5.2-9.6C13 4.8 13.5 1.5 13.5 1.5z"/></svg>`;
  const pauseIc = `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>`;
  const playIc = `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4l13 8-13 8z"/></svg>`;

  fetch("/api/news").then((r) => r.json()).then((j) => {
    const items = (j && j.items) || [];
    if (!items.length) return;
    const one = (it, hidden) => {
      const tag = it.trending && it.tag !== "hot" ? "trending" : it.tag;
      const href = it.link || "/news/";
      const ext = /^https:/.test(href);
      return `<a class="hn-item" href="${esc(href)}" data-id="${esc(it.id)}"${ext ? ' target="_blank" rel="noopener"' : ""}${hidden ? ' tabindex="-1"' : ""}>
        <span class="hn-tag ${esc(tag)}">${esc(LABEL[tag] || "New")}</span>${it.pinned ? '<span class="hn-pin" aria-hidden="true">★</span>' : ""}<span class="hn-t">${esc(it.title)}</span></a>`;
    };
    const set = (hidden) => `<div class="hn-set"${hidden ? ' aria-hidden="true"' : ""}>${items.map((it) => one(it, hidden)).join("")}</div>`;
    root.className = "hn";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Hot and new updates");
    root.innerHTML = `<div class="hn-in">
      <a class="hn-badge" href="/news/" aria-label="Hot and new: see all updates"><span class="hn-flame">${flame}</span><b>Hot &amp; New</b></a>
      <div class="hn-track"><div class="hn-rail">${set(false)}${set(true)}</div></div>
      <div class="hn-ctl"><button class="hn-pp" type="button" aria-label="Pause updates" title="Pause">${pauseIc}</button><a class="hn-all" href="/news/">All updates</a></div></div>`;
    // Keep a steady reading speed (about 70px per second) whatever the number of items.
    const rail = root.querySelector(".hn-rail");
    requestAnimationFrame(() => { rail.style.setProperty("--hn-dur", Math.max(25, rail.scrollWidth / 2 / 70) + "s"); });
    const pp = root.querySelector(".hn-pp");
    pp.onclick = () => {
      const p = root.classList.toggle("paused");
      pp.innerHTML = p ? playIc : pauseIc; pp.setAttribute("aria-label", p ? "Play updates" : "Pause updates"); pp.title = p ? "Play" : "Pause";
    };
    root.addEventListener("click", (e) => {
      const a = e.target.closest(".hn-item"); if (!a) return;
      try { navigator.sendBeacon("/api/news", new Blob([JSON.stringify({ id: a.dataset.id })], { type: "application/json" })); } catch (x) {}
      if (window.wpaSection) window.wpaSection("Ticker: " + a.textContent.trim().slice(0, 60));
    });
  }).catch(() => {});
})();
