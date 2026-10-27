/* "Latest draws" section on the home page. Data: /api/draws (official IRCC, provincial and RCIP community pages,
   checked at 8 am, 2 pm and 8 pm Edmonton time, plus any changes made in the admin dashboard). */
(function () {
  const root = document.getElementById("draws-root");
  if (!root) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const GROUPS = [
    ["all", "All", () => true],
    ["CA", "Federal · Express Entry", (d) => d.jur === "CA"],
    // a province's filter also shows its RCIP / FCIP community draws
    ["BC", "BC", (d) => d.jur === "BC" || d.prov === "BC"], ["AB", "Alberta", (d) => d.jur === "AB" || d.prov === "AB"], ["SK", "Saskatchewan", (d) => d.jur === "SK" || d.prov === "SK"],
    ["MB", "Manitoba", (d) => d.jur === "MB" || d.prov === "MB"], ["ON", "Ontario", (d) => d.jur === "ON" || d.prov === "ON"], ["QC", "Québec", (d) => d.jur === "QC"],
    ["ATL", "Atlantic", (d) => ["NB", "NS", "PE", "NL"].includes(d.jur) || ["NB", "NS", "PE", "NL"].includes(d.prov)],
    ["NT", "NWT · Yellowknife", (d) => d.jur === "NT"], ["YT", "Yukon", (d) => d.jur === "YT"],
    ["RCIP", "RCIP / FCIP", (d) => d.jur === "RCIP"],
  ];
  const PROVS = { NL: "Newfoundland and Labrador", PE: "Prince Edward Island", NS: "Nova Scotia", NB: "New Brunswick", ON: "Ontario", MB: "Manitoba", SK: "Saskatchewan", AB: "Alberta", BC: "British Columbia" };
  const GROUP_PROVS = { BC: ["BC"], AB: ["AB"], SK: ["SK"], MB: ["MB"], ON: ["ON"], ATL: ["NB", "NS", "PE", "NL"], RCIP: Object.keys(PROVS) };
  const BADGE = { CA: "EE", NT: "NWT" };
  const badgeOf = (d) => d.jur === "RCIP" ? (/^FCIP/.test(d.program) ? "FCIP" : "RCIP") : BADGE[d.jur] || d.jur;
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const dayOf = (iso) => new Date(iso + "T00:00:00");
  const longDay = (iso) => dayOf(iso).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: dayOf(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const rel = (iso) => { const n = Math.round((today() - dayOf(iso)) / 864e5); return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 7 ? n + " days ago" : n < 14 ? "Last week" : ""; };
  const stamp = (iso) => iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " MT" : "";
  let all = [], group = "all", shown = 8, data = null;

  fetch("/api/draws?days=400").then((r) => r.json()).then((j) => {
    if (!j || !j.ok) throw 0;
    data = j; all = j.draws || [];
    const has = new Set(all.map((d) => d.jur));
    // a province with no recent draws still gets a chip when its official page names its latest selection (e.g. Saskatchewan's PDF)
    // ...and so does a province that has RCIP / FCIP communities, even before they publish a draw
    const quiet = (j.sources || []).filter((s) => s.latest || s.prov);
    const chips = GROUPS.filter(([k, , f]) => k === "all" || all.some(f) || quiet.some((s) => f({ jur: s.jur, prov: s.prov })));
    root.innerHTML = `
      <div class="dr-bar">
        <div class="dr-chips" role="tablist" aria-label="Filter draws">${chips.map(([k, l]) => `<button type="button" role="tab" data-g="${k}" aria-selected="${k === group}">${esc(l)}</button>`).join("")}</div>
        <p class="dr-stamp">${j.checked ? `<span class="dr-live" aria-hidden="true"></span>Last checked ${esc(stamp(j.checked))}` : ""}</p>
      </div>
      <div class="dr-comm" id="drComm" hidden></div>
      <div class="dr-list" id="drList"></div>
      <div class="dr-more"><button type="button" class="btn ghost" id="drMore">Show earlier draws</button></div>
      <details class="dr-src"><summary>Where this comes from</summary>
        <p>Every draw is read from an official government page: IRCC for Express Entry, the provincial nominee program sites, and IRCC-designated RCIP and FCIP community partners. No news sites, blogs or consultants. Some provinces block automated readers or post results as PDFs, so we add those by hand. Always confirm a draw on the official page before acting.</p>
        <ul>${(j.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.program)}</a> <span>${esc(s.name.split(" – ")[0])}${s.manual ? " · added by hand" : ""}</span></li>`).join("")}</ul>
      </details>`;
    root.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => {
      group = b.dataset.g; shown = 8;
      root.querySelectorAll("[data-g]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      draw();
    });
    document.getElementById("drMore").onclick = () => { shown += 10; draw(); };
    draw();
  }).catch(() => { root.innerHTML = `<p class="dr-empty">Draws couldn't load right now. See <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html" target="_blank" rel="noopener">IRCC's rounds of invitations</a>.</p>`; });

  function draw() {
    const f = GROUPS.find((g) => g[0] === group)[2];
    const rows = all.filter(f);
    paintCommunities();
    const days = [...new Set(rows.map((d) => d.date))];
    const list = document.getElementById("drList");
    if (!rows.length) {
      const q = ((data && data.sources) || []).filter((s) => s.latest && !s.prov && f({ jur: s.jur }));
      list.innerHTML = q.length
        ? q.map((s) => `<p class="dr-empty"><b>${esc(s.program)}</b> hasn't published a selection in the last 14 months. The latest on the official page was on <b>${esc(longDay(s.latest))}</b>. <a href="${esc(s.url)}" target="_blank" rel="noopener">See the official page ↗</a></p>`).join("")
        : `<p class="dr-empty">No draws in the last few months for this filter.</p>`;
      document.getElementById("drMore").hidden = true; return;
    }
    list.innerHTML = days.slice(0, shown).map((day, di) => {
      const ds = rows.filter((d) => d.date === day), r = rel(day);
      return `<section class="dr-day${di === 0 ? " first" : ""}" aria-label="${esc(longDay(day))}">
        <div class="dr-date"><b>${esc(longDay(day))}</b>${r ? `<span class="${r === "Today" ? "today" : ""}">${r}</span>` : ""}</div>
        <ul class="dr-rows">${ds.map(row).join("")}</ul></section>`;
    }).join("");
    document.getElementById("drMore").hidden = days.length <= shown;
  }
  /* RCIP / FCIP communities, province by province: latest draw read from the official page, or what the page says */
  function paintCommunities() {
    const box = document.getElementById("drComm"); if (!box) return;
    const provs = GROUP_PROVS[group];
    const comms = ((data && data.sources) || []).filter((s) => s.prov && provs && provs.includes(s.prov));
    if (!comms.length) { box.hidden = true; box.innerHTML = ""; return; }
    const name = (s) => s.program.replace(/^(RCIP|FCIP|RCIP \/ FCIP) – /, "");
    const latest = (s) => all.filter((d) => d.jur === "RCIP" && d.prov === s.prov && d.program.endsWith("– " + name(s))).sort((a, b) => b.date.localeCompare(a.date));
    const order = Object.keys(PROVS).filter((p) => comms.some((s) => s.prov === p));
    box.hidden = false;
    box.innerHTML = `<h3 class="dr-ch">${group === "RCIP" ? "All RCIP and FCIP communities, by province" : "RCIP and FCIP communities in " + (group === "ATL" ? "Atlantic Canada" : PROVS[provs[0]])}</h3>` + order.map((p) => `
      <div class="dr-prov"><b>${esc(PROVS[p])}</b><div class="dr-cg">${comms.filter((s) => s.prov === p).map((s) => {
        const ds = latest(s), last = ds[0], lastDay = last ? last.date : null, same = last ? ds.filter((d) => d.date === lastDay) : [];
        const what = same.map((d) => `${/^FCIP/.test(d.program) ? "FCIP" : "RCIP"}: ${[d.invites ? d.invites + " recommended" : "", d.score != null ? (d.scoreLabel || "score") + " " + d.score : ""].filter(Boolean).join(", ") || "draw held"}`).join(" · ");
        return `<a class="dr-cc" href="${esc(s.url)}" target="_blank" rel="noopener">
          <span class="dr-ct"><b>${esc(name(s))}</b><span class="dr-pp">${esc(s.pilot || "RCIP")}</span></span>
          ${last ? `<span class="dr-cl">Latest draw ${esc(longDay(lastDay))}</span><span class="dr-cs">${esc(what)}</span>` : `<span class="dr-cs">${esc(s.status || "Check the official page for intake and draw news.")}</span>`}
          <span class="dr-cf">Official page ↗${s.changed && !last ? ` · page updated ${esc(longDay(String(s.changed).slice(0, 10)))}` : ""}</span></a>`; }).join("")}</div></div>`).join("") +
      `<p class="dr-cn">Most communities publish intake dates or yearly totals rather than draw-by-draw results. Draws shown are read from each community's official page. Always confirm on the official page before acting.</p>`;
  }
  function row(d) {
    const code = badgeOf(d);
    const sc = d.score != null ? `<span class="dr-num"><b>${esc(d.score)}</b><small>${d.jur === "CA" ? "CRS cut-off" : d.jur === "QC" ? "min. score" : "min. score"}</small></span>` : "";
    const inv = d.invites ? `<span class="dr-num"><b>${esc(d.invites)}</b><small>${d.jur === "NB" && /Atlantic/i.test(d.stream) ? "selected" : "invited"}</small></span>` : "";
    return `<li class="dr-row">
      <span class="dr-badge j-${esc(d.jur)}" title="${esc(d.prov ? code + " community in " + (PROVS[d.prov] || d.prov) : (data.jur || {})[d.jur] || d.jur)}">${esc(code)}${d.prov ? `<small>${esc(d.prov)}</small>` : ""}</span>
      <div class="dr-what"><b>${d.pinned ? "★ " : ""}${esc(d.program)}</b><span>${esc(d.stream)}</span>${d.note ? `<small>${esc(d.note)}</small>` : ""}</div>
      <div class="dr-nums">${inv}${sc}</div>
      ${d.source ? `<a class="dr-go" href="${esc(d.source)}" target="_blank" rel="noopener" aria-label="Official source for ${esc(d.program)} on ${esc(longDay(d.date))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>` : ""}
    </li>`;
  }
})();
