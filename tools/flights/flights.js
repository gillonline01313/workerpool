/* Flight Deal Finder (front end). Talks to /api/flights/*. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-CA"); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function nice(d) { if (!d) return ""; var x = new Date(d.slice(0, 10) + "T12:00:00Z"); return DOW[x.getUTCDay()] + ", " + MON[x.getUTCMonth()] + " " + x.getUTCDate(); }
  function hm(s) { return s && s.length > 15 ? s.slice(11, 16) : ""; } // airport local time, as published
  function dur(m) { if (!m) return ""; return Math.floor(m / 60) + "h " + (m % 60 ? (m % 60) + "m" : ""); }
  function stops(n) { return n === 0 ? "Non-stop" : n == null ? "" : n + " stop" + (n === 1 ? "" : "s"); }
  function logo(a) { return a ? '<img src="https://pics.avs.io/56/56/' + esc(a) + '.png" alt="' + esc(a) + '" loading="lazy" width="28" height="28">' : '<span style="width:28px"></span>'; }
  function api(path, body) {
    return fetch("/api/flights/" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "The server didn't answer." }; }); });
  }
  function track(n) { try { window.wpaSection && window.wpaSection(n); } catch (e) {} }

  /* ---------- form ---------- */
  var oneWay = false, pick = { from: null, to: null }, config = null, last = null;
  var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  var iso = function (d) { return d.toISOString().slice(0, 10); };
  $("depart").min = $("ret").min = iso(today);
  var max = new Date(today.getTime() + 355 * 864e5); $("depart").max = $("ret").max = iso(max);
  function setTrip(one) {
    oneWay = one; $("tOne").setAttribute("aria-pressed", one); $("tRet").setAttribute("aria-pressed", !one);
    $("ret").disabled = one; if (one) $("ret").value = "";
  }
  $("tOne").onclick = function () { setTrip(true); };
  $("tRet").onclick = function () { setTrip(false); };
  $("depart").addEventListener("change", function () { $("ret").min = $("depart").value || iso(today); if ($("ret").value && $("ret").value < $("depart").value) $("ret").value = ""; });
  $("swap").onclick = function () {
    var a = pick.from, b = pick.to, va = $("from").value; pick.from = b; pick.to = a; $("from").value = $("to").value; $("to").value = va;
  };

  function label(p) { return p.city + (p.type === "airport" ? " – " + p.name : "") + " (" + p.code + ")"; }
  function auto(which) {
    var inp = $(which), box = $(which + "Sug"), items = [], sel = -1, timer;
    function close() { box.hidden = true; inp.setAttribute("aria-expanded", "false"); }
    function choose(p) { pick[which] = p; inp.value = label(p); close(); }
    function paint() {
      box.innerHTML = items.map(function (p, i) {
        return '<button type="button" role="option" aria-selected="' + (i === sel) + '" data-i="' + i + '"><code>' + esc(p.code) + '</code><span>' + esc(p.type === "airport" ? p.name : p.city) +
          '<small>' + esc(p.type === "airport" ? p.city + ", " + p.country + " · airport" : p.country + " · all airports") + '</small></span></button>';
      }).join("");
      box.hidden = !items.length; inp.setAttribute("aria-expanded", String(!!items.length));
    }
    box.addEventListener("mousedown", function (e) { var b = e.target.closest("button"); if (b) { e.preventDefault(); choose(items[+b.dataset.i]); } });
    inp.addEventListener("input", function () {
      pick[which] = null; clearTimeout(timer);
      var t = inp.value.trim(); if (t.length < 2) { items = []; paint(); return; }
      timer = setTimeout(function () {
        api("places?term=" + encodeURIComponent(t)).then(function (j) { if (inp.value.trim() !== t) return; items = (j.places || []).filter(function (p) { return p.code; }); sel = items.length ? 0 : -1; paint(); });
      }, 180);
    });
    inp.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); paint(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      else if (e.key === "Enter" && sel >= 0) { choose(items[sel]); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    inp.addEventListener("blur", function () { setTimeout(close, 120); });
    return choose;
  }
  var chooseFrom = auto("from"), chooseTo = auto("to");
  function codeOf(which) {
    if (pick[which]) return pick[which].code;
    var m = $(which).value.match(/\(([A-Za-z]{3})\)\s*$/) || $(which).value.trim().match(/^([A-Za-z]{3})$/);
    return m ? m[1].toUpperCase() : "";
  }
  function showErr(t) { $("err").textContent = t || ""; $("err").hidden = !t; }

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = { from: codeOf("from"), to: codeOf("to"), depart: $("depart").value, ret: oneWay ? "" : $("ret").value };
    if (!q.from) return showErr("Pick where you're flying from in the list.");
    if (!q.to) return showErr("Pick where you're flying to in the list.");
    if (!q.depart) return showErr("Pick a departure date.");
    if (!oneWay && !q.ret) { setTrip(true); q.ret = ""; }
    showErr(""); run(q);
  });

  /* ---------- search ---------- */
  function run(q) {
    var res = $("res");
    res.innerHTML = '<div class="loading"><span class="spin"></span><span>Checking regular tickets, self-transfer routes through hub cities, nearby days and airports…</span></div>';
    $("goBtn").disabled = true; track("search");
    try { history.replaceState(null, "", "?from=" + q.from + "&to=" + q.to + "&depart=" + q.depart + (q.ret ? "&ret=" + q.ret : "")); } catch (e) {}
    api("search", q).then(function (j) {
      $("goBtn").disabled = false;
      if (!j.ok) { res.innerHTML = '<div class="empty">' + esc(j.error || "Something went wrong. Try again.") + "</div>"; return; }
      last = j.result; paint(j.result);
    }).catch(function () { $("goBtn").disabled = false; res.innerHTML = '<div class="empty">Couldn\'t reach the price service. Check your connection and try again.</div>'; });
  }

  function legHTML(f) {
    return '<div class="leg">' + logo(f.airline) + '<div class="t"><b>' + esc(f.from) + " → " + esc(f.to) + "</b> · " + money(f.price) +
      "<small>" + esc(nice(f.depart)) + " " + esc(hm(f.depart)) + (f.minutes ? " · " + dur(f.minutes) : "") + (f.stops != null ? " · " + stops(f.stops) : "") + (f.flight ? " · " + esc(f.flight) : "") +
      '</small></div><a href="' + esc(f.book) + '" target="_blank" rel="noopener sponsored" data-track="Book leg">Book ↗</a></div>';
  }
  function saveTag(o) { return o.save > 0 ? '<span class="save">Save ' + money(o.save) + "</span>" : ""; }
  function optCard(o, win) {
    var h = '<div class="opt' + (win ? " win" : "") + '">';
    if (o.kind === "self") {
      h += '<div class="oh"><div><span class="k">Self-transfer via ' + esc(o.viaCity) + " (" + esc(o.via) + ")</span><br><b>" + money(o.price) + "</b></div>" + saveTag(o) + "</div>";
      h += legHTML(o.legs[0]) + '<div class="lay">Connection in ' + esc(o.viaCity) + ": <b>" + dur(o.layover) + "</b></div>" + legHTML(o.legs[1]);
      if (o.back) h += '<div class="lay">Return ticket</div>' + legHTML(o.back);
      h += '<div class="warn">' + (o.back ? "Three" : "Two") + ' separate tickets: book ' + (o.back ? "all three" : "both") + ', collect and re-check your bags in ' + esc(o.viaCity) + ", and check if you need a transit visa there. If the first flight is late, the second airline doesn't have to rebook you.</div>";
    } else if (o.kind === "oneways") {
      h += '<div class="oh"><div><span class="k">Two one-way tickets</span><br><b>' + money(o.price) + "</b></div>" + saveTag(o) + "</div>" + legHTML(o.legs[0]) + legHTML(o.legs[1]);
    } else if (o.kind === "day") {
      h += '<div class="oh"><div><span class="k">Fly ' + esc(nice(o.date)) + (o.ret ? ", back " + esc(nice(o.ret)) : "") + "</span><br><b>" + money(o.price) + "</b></div>" + saveTag(o) + "</div>";
      h += '<a class="btn sm" href="' + esc(o.book) + '" target="_blank" rel="noopener sponsored" data-track="Book cheaper day">See this fare ↗</a>';
    } else if (o.kind === "nearby") {
      h += '<div class="oh"><div><span class="k">' + esc(o.from) + " → " + esc(o.to) + " · " + esc(nice(o.date)) + "</span><br><b>" + money(o.price) + "</b></div>" + saveTag(o) + "</div>";
      h += '<p class="disc">A nearby airport' + (o.stops != null ? " · " + stops(o.stops) : "") + ". Add the cost of getting there before you decide.</p>";
      h += '<a class="btn sm" href="' + esc(o.book) + '" target="_blank" rel="noopener sponsored" data-track="Book nearby airport">See this fare ↗</a>';
    }
    return h + "</div>";
  }
  function how(c) {
    if (!c) return "";
    if (c.kind === "self") return "Separate tickets through " + c.viaCity + (c.back ? ", plus a one-way ticket home" : "") + ". Most sites don't show this.";
    if (c.kind === "oneways") return "Two one-way tickets instead of a return.";
    if (c.kind === "day") return "Flying " + nice(c.date) + " instead.";
    if (c.kind === "nearby") return "From " + c.from + " to " + c.to + " instead.";
    return [stops(c.stops), c.airline ? "airline " + c.airline : "", c.minutes ? dur(c.minutes) : ""].filter(Boolean).join(" · ");
  }

  function paint(r) {
    var q = r.q, c = r.cheapest, h = "";
    var title = esc(q.from) + " → " + esc(q.to) + " · " + esc(nice(q.depart)) + (q.ret ? " – " + esc(nice(q.ret)) : " · one way");
    if (!c) {
      h += '<div class="empty">No recent fares for ' + title + '. Aviasales only lists fares people searched in the last 48 hours, so try a nearby date or a bigger city (e.g. YTO for all Toronto airports), or set an alert below and we\'ll tell you when fares show up.</div>';
    } else {
      var book = c.book || (c.legs && c.legs[0].book);
      h += '<div class="hero-deal"><div><small>Cheapest way to fly · ' + title + '</small><div class="p">' + money(c.price) + "<span>" + esc(r.currency) + (q.ret ? " return" : "") + "</span></div><p>" + esc(how(c)) + "</p>" +
        (r.deal != null && r.typical ? '<span class="meter">' + (r.deal >= 15 ? "🔥 Great deal: " + r.deal + "% under" : r.deal > 0 ? r.deal + "% under" : "About the same as") + " the usual " + money(r.typical) + " this month</span>" : "") +
        '</div><a class="btn" href="' + esc(book) + '" target="_blank" rel="noopener sponsored" data-track="Book cheapest">' + (c.legs ? "Book first ticket ↗" : "See this fare ↗") + "</a></div>";
      var hidden = [].concat(r.selfTransfer || [], r.twoOneWays ? [r.twoOneWays] : [], r.cheapDays || [], r.nearby || []).sort(function (a, b) { return a.price - b.price; });
      if (hidden.length) {
        h += '<div class="sec"><h2>Deals most sites miss <span class="tag">' + hidden.length + " found</span></h2><p>Each of these is cheaper than the cheapest regular ticket" + (r.best ? " (" + money(r.best.price) + ")" : "") + ".</p><div class=\"grid\">" +
          hidden.map(function (o, i) { return optCard(o, i === 0 && o === c); }).join("") + "</div></div>";
      } else if (r.best) {
        h += '<div class="sec"><h2>Deals most sites miss</h2><p>We checked ' + (r.hubsChecked.length ? "self-transfers via " + r.hubsChecked.join(", ") + ", " : "") + "nearby days and airports" + (q.ret ? " and two one-ways" : "") + ". None beat the regular ticket this time, so the price above is the one to take.</p></div>";
      }
    }
    if (r.tickets && r.tickets.length) {
      h += '<div class="sec"><h2>Regular tickets</h2><div class="list">' + r.tickets.map(function (f) {
        return '<div class="row">' + logo(f.airline) + "<div><b>" + esc(f.from) + " → " + esc(f.to) + "</b> " + esc(hm(f.depart)) + "<small>" + [stops(f.stops), f.minutes ? dur(f.minutes) : "", f.flight, f.ret ? "back " + nice(f.ret) + (f.stopsBack != null ? " (" + stops(f.stopsBack).toLowerCase() + ")" : "") : ""].filter(Boolean).map(esc).join(" · ") +
          '</small></div><span class="pr">' + money(f.price) + '</span><a class="btn sm ghost bk" href="' + esc(f.book) + '" target="_blank" rel="noopener sponsored" data-track="Book ticket">Book ↗</a></div>';
      }).join("") + "</div></div>";
    }
    if (r.calendar && r.calendar.length) h += calendar(r);
    h += alertBox(r);
    h += '<p class="disc">Prices: recent fares found on Aviasales (last 48 hours), in CAD for one adult. The booking page shows the live price. WorkerPool may earn a commission when you book, at no extra cost to you.</p>';
    $("res").innerHTML = h; wireAlert(r);
    $("res").querySelectorAll(".cal button[data-d]").forEach(function (b) {
      b.onclick = function () {
        var d = b.dataset.d, q2 = { from: q.from, to: q.to, depart: d, ret: "" };
        if (q.ret) { var len = (Date.parse(q.ret) - Date.parse(q.depart)) / 864e5; q2.ret = iso(new Date(Date.parse(d) + len * 864e5)); }
        $("depart").value = q2.depart; $("ret").value = q2.ret; run(q2); window.scrollTo({ top: $("res").offsetTop - 80, behavior: "smooth" });
      };
    });
  }
  function calendar(r) {
    var m = r.q.depart.slice(0, 7), first = new Date(m + "-01T12:00:00Z"), days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    var by = {}; r.calendar.forEach(function (c) { by[c.date] = c; });
    var ps = r.calendar.map(function (c) { return c.price; }).sort(function (a, b) { return a - b; });
    var lo = ps[Math.floor(ps.length / 3)], hi = ps[Math.floor((2 * ps.length) / 3)];
    var h = '<div class="sec"><h2>Price calendar · ' + MON[first.getUTCMonth()] + " " + first.getUTCFullYear() + '</h2><p>Cheapest recent fare each day. Green is cheaper, red is pricier. Tap a day to search it.</p><div class="cal">';
    h += DOW.map(function (d) { return '<span class="dow">' + d + "</span>"; }).join("");
    for (var i = 0; i < first.getUTCDay(); i++) h += "<span></span>";
    var t = iso(today);
    for (var d = 1; d <= days; d++) {
      var ds = m + "-" + (d < 10 ? "0" : "") + d, c = by[ds];
      var cls = c ? (c.price <= lo ? "c1" : c.price <= hi ? "c2" : "c3") : "";
      h += '<button type="button" ' + (ds < t ? "disabled" : 'data-d="' + ds + '"') + ' class="' + cls + (ds === r.q.depart ? " sel" : "") + '"><small>' + d + "</small><b>" + (c ? money(c.price) : "–") + "</b></button>";
    }
    return h + "</div></div>";
  }

  /* ---------- alerts ---------- */
  function alertBox(r) {
    var q = r.q, now = r.cheapest ? r.cheapest.price : null;
    return '<div class="alert" id="alertBox"><h2>🔔 Tell me when it gets cheaper</h2><p>We re-check ' + esc(q.from) + " → " + esc(q.to) + " every few hours (including the self-transfer routes) and alert you " +
      "when there's a very good deal: at least 15% under today's price" + (now ? " (" + money(now) + ")" : "") + ", or under your own target.</p>" +
      '<div class="ag"><div class="f"><label for="aTarget">Your target price (optional)</label><input id="aTarget" type="number" min="1" inputmode="numeric" placeholder="' + (now ? "e.g. " + Math.round(now * 0.85) : "e.g. 900") + '"></div>' +
      '<div class="f"><label for="aEmail">Email (optional)</label><input id="aEmail" type="email" placeholder="you@example.com" autocomplete="email"></div></div>' +
      '<div class="ch"><button class="btn" type="button" id="aMail">Email me</button><button class="btn ghost" type="button" id="aPush">Notify this phone / app</button><button class="btn ghost" type="button" id="aTg" hidden>Telegram</button></div>' +
      '<p class="err" id="aErr" hidden></p><p class="ok" id="aOk" hidden></p></div>';
  }
  var alertKey = null;
  function saveMine(key, q) { var l = store.get("wp_flight_alerts", []); l.unshift({ key: key, q: q }); store.set("wp_flight_alerts", l.slice(0, 20)); }
  function ensureAlert(r, extra) {
    if (alertKey) return Promise.resolve({ ok: true, existing: true });
    var t = $("aTarget").value;
    var body = Object.assign({ from: r.q.from, to: r.q.to, depart: r.q.depart, ret: r.q.ret || "", target: t ? +t : null, baseline: r.cheapest ? r.cheapest.price : null }, extra || {});
    return api("alerts", body).then(function (j) {
      if (j.ok) { alertKey = j.alert.key; saveMine(alertKey, r.q); track("alert-created"); if (j.telegramLink) tgLink = j.telegramLink; }
      return j;
    });
  }
  var tgLink = null;
  function aMsg(ok, t) { $("aOk").hidden = !ok; $("aErr").hidden = ok; (ok ? $("aOk") : $("aErr")).textContent = t; }
  function pushSub() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !config || !config.push) return Promise.reject(new Error("This browser can't show notifications. Use email or Telegram instead."));
    return Notification.requestPermission().then(function (p) {
      if (p !== "granted") throw new Error("Notifications are blocked. Allow them in your browser or app settings, or use email.");
      return navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; });
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(config.push) });
      });
    }).then(function (s) { return s.toJSON(); });
  }
  function b64ToBytes(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function wireAlert(r) {
    alertKey = null;
    if (!$("aMail")) return;
    if (config && config.telegram) $("aTg").hidden = false;
    $("aMail").onclick = function () {
      var e = $("aEmail").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { $("aEmail").focus(); return aMsg(false, "Enter your email address first."); }
      $("aMail").disabled = true;
      (alertKey ? api("alerts/" + alertKey, { action: "email", email: e }) : ensureAlert(r, { email: e })).then(function (j) {
        $("aMail").disabled = false;
        if (!j.ok) return aMsg(false, j.error);
        aMsg(true, "Almost done: check your inbox and click the link to confirm your email. Alerts start after that.");
      });
    };
    $("aPush").onclick = function () {
      $("aPush").disabled = true;
      pushSub().then(function (sub) {
        return alertKey ? api("alerts/" + alertKey, { action: "push", push: sub }) : ensureAlert(r, { push: sub });
      }).then(function (j) {
        $("aPush").disabled = false;
        if (!j.ok) return aMsg(false, j.error);
        aMsg(true, "Done. This device will get a notification when the fare drops.");
      }).catch(function (e) { $("aPush").disabled = false; aMsg(false, e.message); });
    };
    $("aTg").onclick = function () {
      var w = window.open("about:blank", "_blank");
      ensureAlert(r).then(function (j) {
        var go = tgLink || j.telegramLink;
        if (!j.ok || !go) { if (w) w.close(); return aMsg(false, j.error || "Telegram isn't available right now."); }
        if (w) w.location = go; else location.href = go;
        aMsg(true, "In Telegram, tap Start. The bot will confirm your alert.");
      });
    };
  }

  /* ---------- manage an alert (links in emails and Telegram) ---------- */
  function manage(key, confirmed) {
    if (key === "invalid") { $("manage").innerHTML = '<div class="empty" style="margin-bottom:16px">That alert link isn\'t valid any more.</div>'; return; }
    api("alerts/" + key).then(function (j) {
      if (!j.ok) { $("manage").innerHTML = '<div class="empty" style="margin-bottom:16px">' + esc(j.error) + "</div>"; return; }
      var a = j.alert;
      var ch = [a.email ? "email " + a.email + (a.emailConfirmed ? "" : " (not confirmed yet)") : "", a.telegram ? "Telegram" : "", a.push ? "phone notification" : ""].filter(Boolean).join(", ") || "no channel yet";
      $("manage").innerHTML = '<div class="alert" style="margin-bottom:16px"><h2>' + (confirmed ? "✅ Email confirmed. " : "") + "Your alert: " + esc(a.from) + " → " + esc(a.to) + "</h2><p>" + esc(nice(a.depart)) + (a.ret ? " – " + esc(nice(a.ret)) : " · one way") +
        " · " + (a.target ? "alert at " + money(a.target) + " or less" : "alert on a very good deal") + (a.last ? " · latest price " + money(a.last) : "") + " · by " + esc(ch) + " · <b>" + (a.active ? "Active" : "Stopped") + "</b></p>" +
        '<div class="ch"><button class="btn sm ' + (a.active ? "ghost" : "") + '" id="mToggle">' + (a.active ? "Stop this alert" : "Turn it back on") + "</button>" + (j.telegramLink ? '<a class="btn sm ghost" href="' + esc(j.telegramLink) + '" target="_blank" rel="noopener">Add Telegram</a>' : "") + "</div></div>";
      $("mToggle").onclick = function () { api("alerts/" + key, { action: a.active ? "stop" : "resume" }).then(function () { manage(key); }); };
      $("from").value = a.from; $("to").value = a.to; $("depart").value = a.depart; if (a.ret) $("ret").value = a.ret; else setTrip(true);
      if (a.depart >= iso(today)) run({ from: a.from, to: a.to, depart: a.depart, ret: a.ret || "" });
    });
  }

  /* ---------- start ---------- */
  api("config").then(function (j) { config = j; if (last && config.telegram && $("aTg")) $("aTg").hidden = false; });
  var P = new URLSearchParams(location.search);
  if (P.get("alert")) manage(P.get("alert"), P.get("confirmed") === "1");
  else if (P.get("from") && P.get("to") && P.get("depart")) {
    var q = { from: P.get("from").toUpperCase(), to: P.get("to").toUpperCase(), depart: P.get("depart"), ret: P.get("ret") || "" };
    $("from").value = q.from; $("to").value = q.to; $("depart").value = q.depart;
    if (q.ret) $("ret").value = q.ret; else setTrip(true);
    if (q.depart >= iso(today)) run(q);
  } else {
    var d = new Date(today.getTime() + 30 * 864e5); $("depart").value = iso(d); $("ret").value = iso(new Date(d.getTime() + 21 * 864e5));
  }
})();
