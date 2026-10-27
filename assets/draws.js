/* "Latest draws" section on the home page. Data: /api/draws (official IRCC, provincial and RCIP community pages,
   checked at 8 am, 2 pm and 8 pm Edmonton time, plus any changes made in the admin dashboard). */
(function () {
  const root = document.getElementById("draws-root");
  if (!root) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const GROUPS = [
    ["all", "All", () => true],
    ["CA", "Federal · Express Entry", (d) => d.jur === "CA"],
    ["BC", "BC", (d) => d.jur === "BC"], ["AB", "Alberta", (d) => d.jur === "AB"], ["SK", "Saskatchewan", (d) => d.jur === "SK"],
    ["MB", "Manitoba", (d) => d.jur === "MB"], ["ON", "Ontario", (d) => d.jur === "ON"], ["QC", "Québec", (d) => d.jur === "QC"],
    ["ATL", "Atlantic", (d) => ["NB", "NS", "PE", "NL"].includes(d.jur)], ["NORTH", "Territories", (d) => ["YT", "NT"].includes(d.jur)],
    ["RCIP", "RCIP / FCIP", (d) => d.jur === "RCIP"],
  ];
  const BADGE = { CA: "EE", RCIP: "RCIP" };
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
    const chips = GROUPS.filter(([k, , f]) => k === "all" || all.some(f));
    root.innerHTML = `
      <div class="dr-bar">
        <div class="dr-chips" role="tablist" aria-label="Filter draws">${chips.map(([k, l]) => `<button type="button" role="tab" data-g="${k}" aria-selected="${k === group}">${esc(l)}</button>`).join("")}</div>
        <p class="dr-stamp">${j.checked ? `<span class="dr-live" aria-hidden="true"></span>Last checked ${esc(stamp(j.checked))}` : ""}</p>
      </div>
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
    const days = [...new Set(rows.map((d) => d.date))];
    const list = document.getElementById("drList");
    if (!rows.length) { list.innerHTML = `<p class="dr-empty">No draws in the last few months for this filter.</p>`; document.getElementById("drMore").hidden = true; return; }
    list.innerHTML = days.slice(0, shown).map((day, di) => {
      const ds = rows.filter((d) => d.date === day), r = rel(day);
      return `<section class="dr-day${di === 0 ? " first" : ""}" aria-label="${esc(longDay(day))}">
        <div class="dr-date"><b>${esc(longDay(day))}</b>${r ? `<span class="${r === "Today" ? "today" : ""}">${r}</span>` : ""}</div>
        <ul class="dr-rows">${ds.map(row).join("")}</ul></section>`;
    }).join("");
    document.getElementById("drMore").hidden = days.length <= shown;
  }
  function row(d) {
    const code = BADGE[d.jur] || d.jur;
    const sc = d.score != null ? `<span class="dr-num"><b>${esc(d.score)}</b><small>${d.jur === "CA" ? "CRS cut-off" : d.jur === "QC" ? "min. score" : "min. score"}</small></span>` : "";
    const inv = d.invites ? `<span class="dr-num"><b>${esc(d.invites)}</b><small>${d.jur === "NB" && /Atlantic/i.test(d.stream) ? "selected" : "invited"}</small></span>` : "";
    return `<li class="dr-row">
      <span class="dr-badge j-${esc(d.jur)}" title="${esc((data.jur || {})[d.jur] || d.jur)}">${esc(code)}</span>
      <div class="dr-what"><b>${d.pinned ? "★ " : ""}${esc(d.program)}</b><span>${esc(d.stream)}</span>${d.note ? `<small>${esc(d.note)}</small>` : ""}</div>
      <div class="dr-nums">${inv}${sc}</div>
      ${d.source ? `<a class="dr-go" href="${esc(d.source)}" target="_blank" rel="noopener" aria-label="Official source for ${esc(d.program)} on ${esc(longDay(d.date))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>` : ""}
    </li>`;
  }
})();
