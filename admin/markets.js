/* Admin → Market pulse. Search any crypto coin, or any stock / ETF listed on a Canadian (TSX, TSX Venture, CSE,
   Cboe Canada) or US (Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe) exchange, press Analyse, and get a Bullish,
   Bearish or Sideways read for the next 15 minutes, 30 minutes and 1 hour.

   Prices come from /api/markets (admin only; Yahoo Finance for stocks, Binance / Coinbase / Kraken for crypto).
   The maths is in admin/markets-engine.js and runs in this tab. Each call shows the indicators behind it and how
   often the same model was right on this symbol's own recent bars, next to the plain base rate.

   Not financial advice: short-horizon price moves are mostly noise, and the page says so. */
(function () {
"use strict";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const QUICK = [["BTC", "crypto"], ["ETH", "crypto"], ["XRP", "crypto"], ["SOL", "crypto"], ["SHOP.TO", "stock"], ["RY.TO", "stock"], ["TD.TO", "stock"], ["AAPL", "stock"], ["NVDA", "stock"], ["TSLA", "stock"], ["SPY", "etf"]];
const AUTO_S = 60;
let KEY = "", ROOT = null, S = null, timer = null, sTimer = null, seq = 0;
const fresh = () => ({ q: "", sug: [], sugOpen: false, sugI: -1, sugBusy: false, pick: null, busy: false, err: "", res: null, at: null, auto: false, recent: [] });

const css = `
.mp{display:flex;flex-direction:column;gap:14px}
.mp-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px}
.mp-note{font-size:.8rem;color:var(--muted);margin:0}
.mp-srch{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;position:relative}
.mp-in{position:relative;flex:1 1 300px}
.mp-in input{width:100%;box-sizing:border-box;font:inherit;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
.mp-sug{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.14);max-height:340px;overflow:auto;padding:4px}
.mp-sug button{display:flex;width:100%;gap:10px;align-items:center;text-align:left;font:inherit;border:0;background:transparent;color:var(--fg);padding:8px 10px;border-radius:8px;cursor:pointer}
.mp-sug button[aria-selected="true"],.mp-sug button:hover{background:var(--accent-soft)}
.mp-sug b{min-width:84px;font-size:.88rem}
.mp-sug span{flex:1;font-size:.84rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-tag{font-style:normal;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.mp-tag.us{background:#e6edf8;color:#2d5596}.mp-tag.ca{background:#f8e7e5;color:#a33b2f}.mp-tag.cr{background:#f6efd9;color:#8a6510}
@media (prefers-color-scheme:dark){.mp-tag.us{background:#1f2c40;color:#9dbbf0}.mp-tag.ca{background:#3a2421;color:#f0a99f}.mp-tag.cr{background:#352d17;color:#e5c56d}}
.mp-go{font:inherit;font-weight:700;padding:11px 22px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);cursor:pointer}
.mp-go:disabled{opacity:.55;cursor:default}
.mp-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.mp-chips button{font:inherit;font-size:.76rem;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
.mp-chips button:hover{border-color:var(--accent)}
.mp-err{color:#b3412e;font-size:.86rem;margin-top:8px}
.mp-hd{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.mp-hd h2{margin:2px 0 0;font-family:var(--display);font-size:1.35rem}
.mp-px{text-align:right}.mp-px b{font-size:1.5rem;font-family:var(--display)}
.up{color:#1f8a5b}.dn{color:#c2412d}.fl{color:var(--muted)}
@media (prefers-color-scheme:dark){.up{color:#5fd39c}.dn{color:#ff8a76}}
.mp-meta{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:.78rem;color:var(--muted);margin-top:8px}
.mp-warn{border-radius:10px;padding:8px 12px;font-size:.82rem;background:#fff4dc;color:#7a5600;margin-top:10px}
@media (prefers-color-scheme:dark){.mp-warn{background:#3a2f14;color:#f2d185}}
.mp-ov{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:.9rem}
.mp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.mp-h{display:flex;flex-direction:column;gap:10px;border-top:5px solid var(--line)}
.mp-h.bull{border-top-color:#1f8a5b}.mp-h.bear{border-top-color:#c2412d}.mp-h.side{border-top-color:#c79a1e}
.mp-h h3{margin:0;font-size:.86rem;color:var(--muted);font-weight:600;display:flex;justify-content:space-between}
.mp-v{font-family:var(--display);font-size:1.45rem;font-weight:700;display:flex;align-items:center;gap:8px}
.mp-v.bull{color:#1f8a5b}.mp-v.bear{color:#c2412d}.mp-v.side{color:#a87f0e}
@media (prefers-color-scheme:dark){.mp-v.bull{color:#5fd39c}.mp-v.bear{color:#ff8a76}.mp-v.side{color:#e5c56d}}
.mp-meter{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#c2412d 0%,#e9b949 50%,#1f8a5b 100%);opacity:.9}
.mp-meter i{position:absolute;top:-4px;width:4px;height:18px;border-radius:3px;background:var(--fg);transform:translateX(-50%)}
.mp-sc{display:flex;justify-content:space-between;font-size:.68rem;color:var(--muted)}
.mp-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:.82rem}
.mp-kv span{color:var(--muted)}.mp-kv b{text-align:right;font-weight:600}
.mp-cf{font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
.mp-flags{display:flex;gap:6px;flex-wrap:wrap}.mp-flags span{font-size:.72rem;padding:2px 8px;border-radius:999px;background:var(--accent-soft)}
.mp-test{font-size:.78rem;border-radius:10px;background:var(--bg);padding:8px 10px;line-height:1.45}
.mp-test.weak{background:#fff4dc}@media (prefers-color-scheme:dark){.mp-test.weak{background:#3a2f14}}
.mp-h details summary{cursor:pointer;font-size:.8rem;font-weight:600}
.mp-vt{width:100%;border-collapse:collapse;font-size:.76rem;margin-top:6px}
.mp-vt td{padding:3px 0;border-bottom:1px solid var(--line)}
.mp-bar{position:relative;width:90px;height:8px;background:var(--bg);border-radius:4px;margin-left:auto}
.mp-bar i{position:absolute;top:0;bottom:0;border-radius:4px}
.mp-chart svg{width:100%;height:auto;display:block}
.mp-leg{display:flex;gap:14px;font-size:.74rem;color:var(--muted);margin-top:6px;flex-wrap:wrap}
.mp-leg i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:5px}
.mp-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mp-auto{font-size:.82rem;display:flex;gap:6px;align-items:center}
.mp-rec{display:flex;gap:6px;flex-wrap:wrap}
.mp-rec button{font:inherit;font-size:.76rem;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer}
.mp-how{font-size:.8rem;color:var(--muted);line-height:1.5}.mp-how summary{cursor:pointer;font-weight:600;color:var(--fg)}
.mp-spin{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:mpS .7s linear infinite;vertical-align:-2px}
@keyframes mpS{to{transform:rotate(360deg)}}
`;

const CALL = { bull: ["Bullish", "▲"], bear: ["Bearish", "▼"], side: ["Sideways", "◆"] };
const tagCls = (x) => (x.type === "crypto" ? "cr" : x.region === "Canada" ? "ca" : "us");
const tagTxt = (x) => (x.type === "crypto" ? "Crypto" : `${x.exch || x.region}${x.type === "etf" ? " · ETF" : ""}`);
function money(v, cur) {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v), d = a >= 1000 ? 2 : a >= 1 ? (a >= 100 ? 2 : 3) : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8;
  return v.toLocaleString("en-CA", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }) + (cur ? " " + cur : "");
}
const pct = (v, d = 2) => (v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(d) + "%");
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
const clock = (t) => new Date(t).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

async function get(path) {
  const r = await fetch("/api/markets/" + path, { headers: { "x-admin-key": KEY } });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401) throw new Error("Admin key not accepted. Lock and sign in again.");
  if (!j || !j.ok) throw new Error((j && j.error) || "The price service didn't answer. Try again in a minute.");
  return j;
}
const toBars = (a) => (a || []).map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));

/* ---------- search ---------- */
function onType(v) {
  S.q = v; S.pick = null; S.sugI = -1;
  clearTimeout(sTimer);
  if (v.trim().length < 1) { S.sug = []; S.sugOpen = false; drawSug(); return; }
  sTimer = setTimeout(async () => {
    const my = ++seq; S.sugBusy = true; drawSug();
    try { const j = await get("search?q=" + encodeURIComponent(v.trim())); if (my !== seq) return; S.sug = j.results; S.sugOpen = true; }
    catch (e) { if (my !== seq) return; S.sug = []; S.sugOpen = true; S.err = e.message; }
    S.sugBusy = false; drawSug();
  }, 250);
}
function choose(x) {
  S.pick = x; S.q = x.symbol; S.sugOpen = false; S.err = "";
  const inp = ROOT.querySelector("#mpQ"); if (inp) inp.value = x.symbol;
  drawSug(); analyse();
}
function drawSug() {
  const box = ROOT && ROOT.querySelector("#mpSug"); if (!box) return;
  if (!S.sugOpen && !S.sugBusy) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = S.sugBusy && !S.sug.length ? `<div class="mp-note" style="padding:10px"><span class="mp-spin"></span> Searching…</div>`
    : S.sug.length ? S.sug.map((x, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === S.sugI}"><b>${esc(x.symbol)}</b><span>${esc(x.name)}</span><em class="mp-tag ${tagCls(x)}">${esc(tagTxt(x))}</em></button>`).join("")
    : `<div class="mp-note" style="padding:10px">Nothing found on Canadian or US exchanges, or in crypto. Try the ticker (e.g. SHOP.TO, AAPL, BTC) or the company name.</div>`;
  box.querySelectorAll("button[data-i]").forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); choose(S.sug[+b.dataset.i]); }));
}
function guessPick() { // Analyse pressed without picking from the list
  const q = S.q.trim().toUpperCase();
  if (!q) return null;
  const hit = S.sug.find((x) => x.symbol.toUpperCase() === q) || S.sug[0];
  if (hit) return hit;
  if (/^[A-Z0-9]+-USDT?$|^[A-Z0-9]+USDT$/.test(q)) return { symbol: q.replace(/-?USDT?$/, ""), name: q, type: "crypto", region: "Crypto" };
  return { symbol: q, name: q, type: "stock", region: /\.(TO|V|CN|NE)$/.test(q) ? "Canada" : "US" };
}

/* ---------- analyse ---------- */
async function analyse(silent) {
  if (!S.pick) S.pick = guessPick();
  if (!S.pick) { S.err = "Type a coin or stock and pick it from the list."; render(); return; }
  if (S.busy) return;
  S.busy = true; if (!silent) S.err = ""; render();
  const p = S.pick;
  try {
    if (!window.WPMarketsEngine) throw new Error("The analysis engine didn't load. Refresh the page.");
    const j = await get(`bars?type=${p.type === "crypto" ? "crypto" : "stock"}&s=${encodeURIComponent(p.symbol)}`);
    const out = window.WPMarketsEngine.analyse({ meta: j.meta, m1: toBars(j.m1), m5: toBars(j.m5) });
    if (S.pick !== p) return; // the admin picked something else meanwhile
    S.res = { pick: p, ...out }; S.at = Date.now(); S.err = "";
    S.recent = [p, ...S.recent.filter((x) => !(x.symbol === p.symbol && x.type === p.type))].slice(0, 8);
  } catch (e) { S.err = e.message; if (!silent) S.res = S.res && S.res.pick === p ? S.res : null; }
  S.busy = false; render();
}
function setAuto(on) {
  S.auto = on; clearInterval(timer); timer = null;
  if (on) timer = setInterval(() => { if (ROOT && document.body.contains(ROOT) && S.res) analyse(true); }, AUTO_S * 1000);
}

/* ---------- drawing ---------- */
function chart(r) {
  const bars = r.spark || [], h15 = r.results.find((x) => x.id === "15m" && !x.error);
  if (bars.length < 10) return "";
  const W = 760, H = 220, P = 8, xr = W - 110;
  const c = bars.map((b) => b.c), E = window.WPMarketsEngine.series(bars);
  let lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h));
  if (h15) { lo = Math.min(lo, h15.low); hi = Math.max(hi, h15.high); }
  const pad = (hi - lo) * 0.06 || hi * 0.001; lo -= pad; hi += pad;
  const X = (i) => P + (i / (bars.length - 1)) * (xr - P), Y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P - 14);
  const line = (a) => a.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const last = c[c.length - 1], lx = X(bars.length - 1), ly = Y(last);
  let fut = "";
  if (h15) {
    const col = h15.call === "bull" ? "#1f8a5b" : h15.call === "bear" ? "#c2412d" : "#c79a1e";
    const fx = W - 20;
    fut = `<path d="M${lx},${ly} L${fx},${Y(h15.high)} L${fx},${Y(h15.low)} Z" fill="${col}" opacity=".13"/>
      <line x1="${lx}" y1="${ly}" x2="${fx}" y2="${Y(last + (h15.high - last) * h15.score)}" stroke="${col}" stroke-width="2" stroke-dasharray="5 4"/>
      <text x="${fx - 2}" y="${Y(h15.high) - 4}" font-size="10" text-anchor="end" fill="currentColor" opacity=".7">${esc(money(h15.high))}</text>
      <text x="${fx - 2}" y="${Y(h15.low) + 12}" font-size="10" text-anchor="end" fill="currentColor" opacity=".7">${esc(money(h15.low))}</text>`;
  }
  const t0 = bars[0].t, t1 = bars[bars.length - 1].t;
  return `<div class="mp-card mp-chart"><div class="mp-row" style="justify-content:space-between"><b style="font-size:.88rem">Last ${Math.round((t1 - t0) / 60000)} minutes (1-minute bars) and the 15-minute range</b><span class="mp-note">${esc(clock(t0))} – ${esc(clock(t1))}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price chart">
      ${[0.25, 0.5, 0.75].map((f) => `<line x1="${P}" x2="${W - P}" y1="${P + f * (H - 2 * P - 14)}" y2="${P + f * (H - 2 * P - 14)}" stroke="currentColor" opacity=".08"/>`).join("")}
      ${fut}
      <path d="${line(E.e21)}" fill="none" stroke="#c79a1e" stroke-width="1.4" opacity=".9"/>
      <path d="${line(E.e9)}" fill="none" stroke="#6b8fd6" stroke-width="1.4" opacity=".9"/>
      <path d="${line(c)}" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="${lx}" cy="${ly}" r="3.5" fill="currentColor"/>
      <text x="${P}" y="${H - 2}" font-size="10" fill="currentColor" opacity=".6">${esc(money(lo + pad))} – ${esc(money(hi - pad))}</text>
    </svg>
    <div class="mp-leg"><span><i style="background:currentColor"></i>Price</span><span><i style="background:#6b8fd6"></i>EMA 9</span><span><i style="background:#c79a1e"></i>EMA 21</span><span><i style="background:#9aa;opacity:.5"></i>Likely 15-min range, dashed line = lean</span></div></div>`;
}
function horizonCard(h, cur) {
  if (h.error) return `<div class="mp-card mp-h"><h3>${esc(h.label)}</h3><p class="mp-note">${esc(h.error)}</p></div>`;
  const [name, icon] = CALL[h.call], pos = ((h.score + 1) / 2) * 100;
  const t = h.test, weak = t.edge === "none" || t.edge === "base";
  const flags = [h.choppy && "Choppy market", h.squeeze && "Squeeze: breakout building", h.rsi > 75 && "Overbought (RSI " + h.rsi.toFixed(0) + ")", h.rsi < 25 && "Oversold (RSI " + h.rsi.toFixed(0) + ")", h.adx >= 30 && "Strong trend (ADX " + h.adx.toFixed(0) + ")"].filter(Boolean);
  const votes = h.votes.map((v) => { const w = Math.abs(v.value) * 45; return `<tr><td>${esc(v.label)}</td><td style="width:100px"><div class="mp-bar"><i style="${v.value >= 0 ? `left:50%;width:${w}%;background:#1f8a5b` : `right:50%;width:${w}%;background:#c2412d`}"></i></div></td><td style="text-align:right;width:44px" class="${v.value > 0.05 ? "up" : v.value < -0.05 ? "dn" : "fl"}">${v.value > 0 ? "+" : ""}${v.value.toFixed(2)}</td></tr>`; }).join("");
  return `<div class="mp-card mp-h ${h.call}">
    <h3><span>${esc(h.label)}</span><span>${h.barMin}-min bars</span></h3>
    <div class="mp-v ${h.call}">${icon} ${name} <span class="mp-cf" title="How strongly the indicators agree, the trend strength, and this model's record on this symbol">${h.confLabel} confidence</span></div>
    <div><div class="mp-meter"><i style="left:${pos.toFixed(1)}%"></i></div><div class="mp-sc"><span>Bearish</span><span>Score ${h.score >= 0 ? "+" : ""}${h.score.toFixed(2)}</span><span>Bullish</span></div></div>
    <div class="mp-kv">
      <span>Likely range</span><b>${esc(money(h.low))} – ${esc(money(h.high, cur))}</b>
      <span>Support / resistance</span><b>${esc(money(h.support))} / ${esc(money(h.resistance))}</b>
      <span>RSI 14 · ADX 14</span><b>${h.rsi.toFixed(0)} · ${h.adx.toFixed(0)}</b>
      <span>Choppiness</span><b>${h.chop.toFixed(0)} ${h.chop > 61.8 ? "(sideways)" : h.chop < 38.2 ? "(trending)" : ""}</b>
    </div>
    ${flags.length ? `<div class="mp-flags">${flags.map((f) => `<span>${esc(f)}</span>`).join("")}</div>` : ""}
    <div class="mp-test${weak ? " weak" : ""}"><b>Track record on ${esc(S.res.pick.symbol)}</b> (last ${t.tested} ${h.barMin}-min bars):
      ${t.calls ? `up/down calls right <b>${t.hit}%</b> of ${t.calls}` : "no up/down calls"}${t.sideCalls ? `, sideways calls right ${t.sideHit}% of ${t.sideCalls}` : ""}. Price went up ${t.baseUp}% of the time; ${t.rangeHit}% of moves stayed inside the range.
      ${t.edge === "none" ? "<br><b>No proven edge here:</b> treat this call as a coin flip." : t.edge === "base" ? `<br><b>No better than the trend itself:</b> simply assuming "${t.majorityDir}" was right ${t.majority}% of the time.` : t.edge === "few" ? "<br>Too few up/down calls to judge." : `<br><b>Beat the base rate</b> (${t.majority}% for always "${t.majorityDir}") on this window.`}</div>
    <details><summary>Why: indicator votes</summary><table class="mp-vt">${votes}</table></details>
  </div>`;
}
function resultsHtml() {
  const r = S.res; if (!r) return "";
  const m = r.meta, x = r.ctx, cur = m.currency || "";
  const dir = x.change > 0 ? "up" : x.change < 0 ? "dn" : "fl";
  const age = x.lastT ? Date.now() - x.lastT : 0;
  const warns = [];
  if (m.type !== "crypto" && m.marketOpen === false) warns.push(`The ${esc(m.exchange || "exchange")} is closed right now. These reads use the last session's bars and apply once trading resumes; the first minutes after the open often break them.`);
  else if (age > (m.type === "crypto" ? 10 : 25) * 60000) warns.push(`The latest bar is from ${esc(clock(x.lastT))} (${esc(ago(x.lastT))}). The source may be delayed or the symbol thinly traded.`);
  const ok = r.results.filter((h) => !h.error), o = r.overall;
  const ovTxt = !ok.length ? "" : o.aligned ? `All three horizons agree: <b class="${o.call === "bull" ? "up" : o.call === "bear" ? "dn" : ""}">${CALL[ok[0].call][0]}</b>.` : `Mixed signals across horizons (${ok.map((h) => `${h.id} ${CALL[h.call][0].toLowerCase()}`).join(", ")}). Weighted overall: <b>${CALL[o.call][0]}</b>.`;
  return `<div class="mp-card">
      <div class="mp-hd"><div><span class="mp-tag ${tagCls(r.pick)}">${esc(m.type === "crypto" ? "Crypto · " + (m.source || "") : m.exchange || r.pick.exch || "")}</span><h2>${esc(m.name || r.pick.name)} <span class="mp-note" style="font-size:.95rem">${esc(m.symbol || r.pick.symbol)}${m.type === "crypto" ? "/" + esc(cur) : ""}</span></h2></div>
        <div class="mp-px"><b>${esc(money(x.price, cur))}</b><div class="${dir}" style="font-size:.86rem;font-weight:600">${x.change == null ? "" : `${x.change > 0 ? "+" : ""}${esc(money(x.change))} (${pct(x.changePct)}) ${esc(x.changeLabel)}`}</div></div></div>
      <div class="mp-meta"><span>Last bar ${esc(x.lastT ? clock(x.lastT) : "–")} (${esc(x.lastT ? ago(x.lastT) : "–")})</span><span>Source: ${esc(m.source || "")}</span>${x.volRatio ? `<span>Volume last 15 min: ${x.volRatio.toFixed(1)}× normal${x.volRatio > 2 ? " (surge)" : ""}</span>` : ""}<span>Analysed ${esc(clock(S.at))}</span></div>
      ${warns.map((w) => `<div class="mp-warn">${w}</div>`).join("")}
      ${ovTxt ? `<div class="mp-ov">${ovTxt}</div>` : ""}
    </div>
    <div class="mp-grid">${r.results.map((h) => horizonCard(h, cur)).join("")}</div>
    ${chart(r)}`;
}
function render() {
  if (!ROOT) return;
  const focus = document.activeElement && document.activeElement.id === "mpQ";
  ROOT.innerHTML = `<style>${css}</style>
    <div class="mp-card">
      <div class="mp-srch">
        <div class="mp-in"><input id="mpQ" type="search" autocomplete="off" spellcheck="false" placeholder="Search a coin or stock: BTC, XRP, Shopify, SHOP.TO, Apple, TSLA…" value="${esc(S.q)}" aria-label="Coin or stock"><div class="mp-sug" id="mpSug" role="listbox" hidden></div></div>
        <button class="mp-go" type="button" id="mpGo" ${S.busy ? "disabled" : ""}>${S.busy ? '<span class="mp-spin"></span> Analysing…' : "Analyse"}</button>
      </div>
      <div class="mp-chips">${QUICK.map(([s, t]) => `<button type="button" data-q="${esc(s)}" data-t="${t}">${esc(s)}</button>`).join("")}</div>
      ${S.err ? `<div class="mp-err">${esc(S.err)}</div>` : ""}
      <div class="mp-row" style="margin-top:10px;justify-content:space-between">
        <label class="mp-auto"><input type="checkbox" id="mpAuto" ${S.auto ? "checked" : ""}> Re-analyse every ${AUTO_S} s</label>
        ${S.recent.length ? `<div class="mp-rec"><span class="mp-note">Recent:</span>${S.recent.map((x, i) => `<button type="button" data-r="${i}">${esc(x.symbol)}</button>`).join("")}</div>` : ""}
      </div>
    </div>
    ${S.res ? resultsHtml() : `<div class="wpa-empty">Search a crypto coin, or a stock or ETF on the TSX, TSX Venture, CSE, Cboe Canada, Nasdaq or NYSE, then press <b>Analyse</b>.</div>`}
    <div class="mp-card mp-how"><details><summary>How this works, and its limits</summary>
      <p>Each horizon reads recent bars (15 min → 1-minute bars, 30 min → 3-minute bars, 1 hour → 5-minute bars) and scores ten indicators from −1 to +1: EMA 9/21 gap and EMA 21 slope, a least-squares trend line weighted by how straight it is (R²), MACD histogram, RSI 14 momentum plus an overbought / oversold pull, price against the rolling VWAP, up-volume against down-volume, higher highs and lows, and rate of change. The weighted total is the score. ADX and the Choppiness Index decide whether the market is trending: in a choppy, low-ADX market the score must be bigger before the call leaves <b>Sideways</b>. A Bollinger squeeze flags a coming breakout without guessing its direction.</p>
      <p>The likely range is the current price ± ATR × √(bars ahead), roughly one typical move. The <b>track record</b> replays the same model bar by bar over this symbol's own recent history (it never looks ahead) and counts how often its up/down calls were right. Compare it with how often price simply went up: if the model doesn't beat that, it has no edge on this symbol right now and confidence is capped at Low.</p>
      <p>Prices: stocks and ETFs from Yahoo Finance (some exchanges delay quotes; the age of the last bar is shown), crypto from Binance, Coinbase or Kraken in USD / USDT. Over 15 to 60 minutes prices are mostly noise and news can move them at any time. This is a statistical read for research, not financial advice or a reason to trade.</p>
    </details></div>`;
  const q = ROOT.querySelector("#mpQ");
  q.oninput = (e) => onType(e.target.value);
  q.onfocus = () => { if (S.sug.length && !S.pick) { S.sugOpen = true; drawSug(); } };
  q.onblur = () => setTimeout(() => { S.sugOpen = false; drawSug(); }, 120);
  q.onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!S.sug.length) return; e.preventDefault(); S.sugOpen = true; S.sugI = (S.sugI + (e.key === "ArrowDown" ? 1 : -1) + S.sug.length) % S.sug.length; drawSug(); }
    else if (e.key === "Enter") { e.preventDefault(); if (S.sugOpen && S.sugI >= 0 && S.sug[S.sugI]) choose(S.sug[S.sugI]); else { S.sugOpen = false; drawSug(); analyse(); } }
    else if (e.key === "Escape") { S.sugOpen = false; drawSug(); }
  };
  ROOT.querySelector("#mpGo").onclick = () => { S.sugOpen = false; analyse(); };
  ROOT.querySelector("#mpAuto").onchange = (e) => setAuto(e.target.checked);
  ROOT.querySelectorAll(".mp-chips button").forEach((b) => (b.onclick = () => choose({ symbol: b.dataset.q, name: b.dataset.q, type: b.dataset.t === "crypto" ? "crypto" : b.dataset.t, region: b.dataset.t === "crypto" ? "Crypto" : /\.TO$/.test(b.dataset.q) ? "Canada" : "US", exch: /\.TO$/.test(b.dataset.q) ? "TSX" : "" })));
  ROOT.querySelectorAll(".mp-rec button").forEach((b) => (b.onclick = () => choose(S.recent[+b.dataset.r])));
  drawSug();
  if (focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

async function load(key, body) {
  KEY = key;
  if (ROOT && body.contains(ROOT)) return; // the console refreshes tabs every minute; keep the current analysis
  if (!S) S = fresh();
  ROOT = document.createElement("div"); ROOT.className = "mp";
  body.innerHTML = ""; body.appendChild(ROOT); render();
}
function leave() { clearInterval(timer); timer = null; clearTimeout(sTimer); ROOT = null; S = null; KEY = ""; }
window.WPMarkets = { load, leave };
})();
