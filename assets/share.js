/* "Share WorkerPool" buttons ([data-share]). Shared links carry ?s=<visitor id>, so the admin's Analytics can show
   who shared and when someone opens a shared link. Uses the phone's share menu when there is one. */
(function () {
  "use strict";
  var TITLE = "WorkerPool", TEXT = "Free tools for working and immigrating to Canada: latest draws, wage checker, CRS scanner and more.";
  function url() { return window.wpaShareUrl ? window.wpaShareUrl() : location.origin + location.pathname; }
  function ev(l) { try { window.wpaEvent && window.wpaEvent(l); } catch (e) {} }
  var pop = null;
  function close() { if (pop) { pop.remove(); pop = null; document.removeEventListener("click", outside, true); } }
  function outside(e) { if (pop && !pop.contains(e.target)) close(); }
  function menu(btn) {
    close();
    var u = url(), enc = encodeURIComponent;
    var items = [
      ["WhatsApp", "https://wa.me/?text=" + enc(TEXT + " " + u)],
      ["Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + enc(u)],
      ["Email", "mailto:?subject=" + enc(TITLE) + "&body=" + enc(TEXT + "\n\n" + u)],
      ["Copy link", null],
    ];
    pop = document.createElement("div");
    pop.setAttribute("role", "menu");
    pop.style.cssText = "position:absolute;z-index:60;background:var(--surface,#fff);color:var(--fg,#1b2628);border:1px solid var(--line,#d3dcda);border-radius:14px;box-shadow:0 20px 40px -20px rgba(0,0,0,.35);padding:6px;display:flex;flex-direction:column;min-width:180px;font-size:.92rem";
    items.forEach(function (it) {
      var a = document.createElement(it[1] ? "a" : "button");
      a.textContent = it[0]; a.setAttribute("role", "menuitem"); a.setAttribute("data-track", "Share: " + it[0]);
      a.style.cssText = "all:unset;cursor:pointer;padding:9px 12px;border-radius:9px;font:inherit;color:inherit";
      a.onmouseenter = function () { a.style.background = "var(--accent-soft,#dcebe7)"; }; a.onmouseleave = function () { a.style.background = ""; };
      if (it[1]) { a.href = it[1]; a.target = "_blank"; a.rel = "noopener"; a.onclick = function () { ev("Shared: " + it[0]); setTimeout(close, 50); }; }
      else a.onclick = function () {
        var done = function () { a.textContent = "Link copied ✓"; ev("Shared: Copy link"); setTimeout(close, 900); };
        if (navigator.clipboard) navigator.clipboard.writeText(u).then(done, function () { prompt("Copy this link:", u); done(); });
        else { prompt("Copy this link:", u); done(); }
      };
      pop.appendChild(a);
    });
    document.body.appendChild(pop);
    var r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 6) + "px";
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, document.documentElement.clientWidth - pop.offsetWidth - 8)) + "px";
    setTimeout(function () { document.addEventListener("click", outside, true); }, 0);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-share]");
    if (!b) return;
    e.preventDefault();
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ title: TITLE, text: TEXT, url: url() }).then(function () { ev("Shared with the phone's share menu"); }, function () {});
    } else menu(b);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})();
