/* WorkerPool first-party analytics. No third-party services, no cookies, no IP addresses stored.
   Each page load is one "visit"; the browser sends it to /api/collect when it starts and as it changes. */
(function () {
  var PAGE = window.WPA_PAGE || "page";
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  var vid;
  try { vid = localStorage.getItem("wp_vid"); if (!vid) { vid = rid(); localStorage.setItem("wp_vid", vid); } } catch (e) { vid = rid(); }
  var tz = "Unknown"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown"; } catch (e) {}
  var src = "Direct";
  try {
    var r = document.referrer;
    if (r) { var h = new URL(r).hostname.replace(/^www\./, ""); src = h === location.hostname ? "Internal" : h; }
    var u = new URLSearchParams(location.search).get("utm_source"); if (u) src = u.slice(0, 40);
  } catch (e) {}
  var dev = innerWidth <= 700 ? "Mobile" : (navigator.maxTouchPoints > 0 && innerWidth < 1100 ? "Tablet" : "Desktop");
  var visit = { id: rid(), vid: vid, page: PAGE, t: new Date().toISOString(), tz: tz,
    lang: (navigator.language || "unknown").slice(0, 16), src: src, dev: dev, sec: [], clk: [], dur: 0 };
  var activeMs = 0, visibleSince = document.hidden ? null : Date.now(), timer = null, curSec = "";
  function active() { return activeMs + (visibleSince ? Date.now() - visibleSince : 0); }
  function send(beacon) {
    visit.dur = Math.round(active() / 1000);
    var body = JSON.stringify(visit);
    try {
      if (beacon && navigator.sendBeacon) { navigator.sendBeacon("/api/collect", new Blob([body], { type: "application/json" })); return; }
      fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(function () { send(false); }, ms == null ? 4000 : ms); }

  var queued = window.__wpaq || [];
  window.wpaSection = function (name) {
    curSec = name;
    if (visit.sec.indexOf(name) < 0 && visit.sec.length < 40) { visit.sec.push(String(name).slice(0, 60)); schedule(); }
  };
  queued.forEach(function (n) { window.wpaSection(n); }); window.__wpaq = [];

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("a,button,[data-track]");
    if (!el) return;
    var t = (el.getAttribute("data-track") || el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
    if (!t) return;
    var s = el.closest("[data-sec]"), sec = s ? s.getAttribute("data-sec") : curSec;
    var l = sec ? sec + ": " + t : t;
    for (var i = 0; i < visit.clk.length; i++) if (visit.clk[i].l === l) { visit.clk[i].n++; schedule(); return; }
    if (visit.clk.length < 60) visit.clk.push({ l: l, n: 1 });
    schedule();
  }, true);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (visibleSince) { activeMs += Date.now() - visibleSince; visibleSince = null; } clearTimeout(timer); send(true); }
    else visibleSince = Date.now();
  });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) window.wpaSection(en.target.getAttribute("data-sec")); }); }, { threshold: 0.35 });
    document.querySelectorAll("[data-sec]").forEach(function (el) { io.observe(el); });
  }
  send(false);
})();
