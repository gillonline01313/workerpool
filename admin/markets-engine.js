/* Admin → Market pulse: the analysis engine. Pure functions, no DOM, no network.

   Input: candles [{t, o, h, l, c, v}] oldest first (t in ms). Output, for each horizon (15 min, 30 min, 1 hour):
   a Bullish / Bearish / Sideways call, a score from -1 to +1, a confidence, the indicator votes behind it, a likely
   price range, nearby support / resistance, and a walk-forward test of this same model on the symbol's own recent
   bars (how often its calls were right, against the plain base rate), so a call never comes without its track record.

   Horizons and the bars they read:
     15 min → 1-minute bars, look 15 bars ahead, 60-bar lookback
     30 min → 3-minute bars (built from 1-minute), 10 bars ahead, 40-bar lookback
     1 hour → 5-minute bars, 12 bars ahead, 48-bar lookback

   Indicators (all causal: bar i only uses bars 0..i, so the walk-forward test can't peek):
     EMA 9/21 gap and EMA 21 slope (trend), least-squares slope × √R² (trend quality), MACD histogram,
     RSI 14 (momentum, and a mean-reversion pull when above 75 / below 25), price vs rolling VWAP,
     up-volume vs down-volume, higher highs / lower lows, rate of change.
   Regime: ADX 14 (trend strength) and Choppiness Index 14. Low ADX + high choppiness = sideways market, which
   raises the bar for a directional call. Bollinger band width in its lowest fifth of the window = squeeze
   (a breakout is building, direction unknown).

   This is statistics on recent prices, not a forecast anyone can rely on: short-horizon moves are mostly noise.
   The walk-forward hit rate is there to show how much (or how little) edge the model has had on this symbol. */
(function (root) {
"use strict";

const HORIZONS = [
  { id: "15m", label: "Next 15 min", src: "m1", group: 1, ahead: 15, look: 60 },
  { id: "30m", label: "Next 30 min", src: "m1", group: 3, ahead: 10, look: 40 },
  { id: "1h", label: "Next 1 hour", src: "m5", group: 1, ahead: 12, look: 48 },
];

const WEIGHTS = { ema: 0.16, slope: 0.10, reg: 0.16, macd: 0.12, rsi: 0.10, rsiX: 0.08, vwap: 0.10, flow: 0.08, struct: 0.06, roc: 0.04 };
const LABELS = {
  ema: "EMA 9 vs 21", slope: "EMA 21 slope", reg: "Trend line (regression)", macd: "MACD histogram", rsi: "RSI momentum",
  rsiX: "RSI overbought / oversold", vwap: "Price vs VWAP", flow: "Volume flow", struct: "Highs and lows", roc: "Rate of change",
};
const TH_DIR = 0.18, TH_SIDE = 0.30; // |score| needed for a directional call (normal / choppy market)

const clamp = (x, a = -1, b = 1) => (x < a ? a : x > b ? b : x);
const tanh = Math.tanh;
const num = (x) => typeof x === "number" && isFinite(x);

/* ---------- candles ---------- */
function clean(bars) {
  const out = [];
  let last = -Infinity;
  for (const b of bars || []) {
    if (!b || !num(b.t) || !num(b.c) || b.c <= 0) continue;
    const o = num(b.o) && b.o > 0 ? b.o : b.c, h = num(b.h) ? Math.max(b.h, o, b.c) : Math.max(o, b.c), l = num(b.l) && b.l > 0 ? Math.min(b.l, o, b.c) : Math.min(o, b.c);
    if (b.t <= last) continue; // drop duplicates / out-of-order
    last = b.t;
    out.push({ t: b.t, o, h, l, c: b.c, v: num(b.v) && b.v > 0 ? b.v : 0 });
  }
  return out;
}
function resample(bars, n) { // n consecutive minutes → one bar, aligned to the clock
  if (n <= 1) return bars;
  const ms = n * 60000, out = [];
  let cur = null;
  for (const b of bars) {
    const k = Math.floor(b.t / ms) * ms;
    if (!cur || cur.t !== k) { if (cur) out.push(cur); cur = { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  if (cur) out.push(cur);
  return out;
}

/* ---------- indicator series (causal) ---------- */
function ema(x, p) {
  const k = 2 / (p + 1), out = new Array(x.length);
  let e = x[0];
  for (let i = 0; i < x.length; i++) { e = i ? x[i] * k + e * (1 - k) : x[0]; out[i] = e; }
  return out;
}
function wilder(x, p) { // Wilder's smoothing (RMA), seeded with a simple mean
  const out = new Array(x.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    if (i < p) { s += x[i]; if (i === p - 1) out[i] = s / p; continue; }
    out[i] = (out[i - 1] * (p - 1) + x[i]) / p;
  }
  return out;
}
function trueRange(B) { return B.map((b, i) => (i ? Math.max(b.h - b.l, Math.abs(b.h - B[i - 1].c), Math.abs(b.l - B[i - 1].c)) : b.h - b.l)); }
function rsi(c, p = 14) {
  const up = [0], dn = [0];
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; up.push(d > 0 ? d : 0); dn.push(d < 0 ? -d : 0); }
  const U = wilder(up, p), D = wilder(dn, p);
  return U.map((u, i) => (num(u) && num(D[i]) ? (D[i] === 0 ? (u === 0 ? 50 : 100) : 100 - 100 / (1 + u / D[i])) : NaN));
}
function adx(B, p = 14) {
  const pdm = [0], ndm = [0];
  for (let i = 1; i < B.length; i++) {
    const u = B[i].h - B[i - 1].h, d = B[i - 1].l - B[i].l;
    pdm.push(u > d && u > 0 ? u : 0); ndm.push(d > u && d > 0 ? d : 0);
  }
  const tr = wilder(trueRange(B), p), P = wilder(pdm, p), N = wilder(ndm, p);
  const dx = tr.map((t, i) => { if (!num(t) || t === 0) return NaN; const pi = (100 * P[i]) / t, ni = (100 * N[i]) / t; return pi + ni === 0 ? 0 : (100 * Math.abs(pi - ni)) / (pi + ni); });
  const out = new Array(B.length).fill(NaN);
  let s = 0, k = 0, first = -1;
  for (let i = 0; i < dx.length; i++) {
    if (!num(dx[i])) continue;
    if (first < 0) { s += dx[i]; k++; if (k === p) { first = i; out[i] = s / p; } continue; }
    out[i] = (out[i - 1] * (p - 1) + dx[i]) / p;
  }
  return out;
}
function chop(B, tr, p = 14) { // Choppiness Index: 100 = pure chop, 0 = straight line
  const out = new Array(B.length).fill(NaN);
  for (let i = p; i < B.length; i++) {
    let s = 0, hi = -Infinity, lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) { s += tr[j]; if (B[j].h > hi) hi = B[j].h; if (B[j].l < lo) lo = B[j].l; }
    out[i] = hi > lo && s > 0 ? (100 * Math.log10(s / (hi - lo))) / Math.log10(p) : 50;
  }
  return out;
}
function series(B) {
  const c = B.map((b) => b.c), tr = trueRange(B);
  const e9 = ema(c, 9), e21 = ema(c, 21), e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = e12.map((v, i) => v - e26[i]), sig = ema(macd, 9);
  return { c, tr, atr: wilder(tr, 14), e9, e21, hist: macd.map((v, i) => v - sig[i]), rsi: rsi(c), adx: adx(B), chop: chop(B, tr) };
}

/* ---------- one bar's signal ---------- */
function linreg(c, from, to) { // slope per bar and R² of closes[from..to]
  const n = to - from + 1;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const y = c[from + i]; sx += i; sy += y; sxx += i * i; sxy += i * y; syy += y * y; }
  const dx = n * sxx - sx * sx, dy = n * syy - sy * sy;
  if (dx === 0) return { slope: 0, r2: 0 };
  const slope = (n * sxy - sx * sy) / dx;
  return { slope, r2: dy > 0 ? Math.min(1, ((n * sxy - sx * sy) ** 2) / (dx * dy)) : 0 };
}
function signalAt(B, S, i, H) {
  const L = Math.min(H.look, i), half = Math.max(4, Math.floor(L / 2));
  const c = S.c[i];
  let atr = S.atr[i];
  if (!num(atr) || atr <= 0) atr = Math.max(c * 1e-4, 1e-12);
  const f = {};
  f.ema = tanh((S.e9[i] - S.e21[i]) / atr);
  const k = Math.min(5, i);
  f.slope = tanh((S.e21[i] - S.e21[i - k]) / atr);
  const lr = linreg(S.c, i - L, i);
  f.reg = tanh((lr.slope * H.ahead) / atr) * Math.sqrt(lr.r2);
  f.macd = tanh(S.hist[i] / (0.25 * atr));
  const r = num(S.rsi[i]) ? S.rsi[i] : 50;
  f.rsi = clamp((r - 50) / 20);
  f.rsiX = r > 75 ? -clamp((r - 75) / 15, 0, 1) : r < 25 ? clamp((25 - r) / 15, 0, 1) : 0;
  let pv = 0, vv = 0, up = 0, dn = 0;
  for (let j = i - L + 1; j <= i; j++) {
    const b = B[j], tp = (b.h + b.l + b.c) / 3;
    pv += tp * b.v; vv += b.v;
    if (j > i - half) { if (b.c > b.o) up += b.v; else if (b.c < b.o) dn += b.v; }
  }
  let vwap = vv > 0 ? pv / vv : 0;
  if (!vwap) { let s = 0; for (let j = i - L + 1; j <= i; j++) s += S.c[j]; vwap = s / L; } // no volume (some indexes)
  f.vwap = tanh((c - vwap) / atr);
  f.flow = up + dn > 0 ? (up - dn) / (up + dn) : 0;
  let hiA = -Infinity, loA = Infinity, hiB = -Infinity, loB = Infinity;
  for (let j = i - half + 1; j <= i; j++) { hiA = Math.max(hiA, B[j].h); loA = Math.min(loA, B[j].l); }
  for (let j = i - 2 * half + 1; j <= i - half; j++) { if (j < 0) continue; hiB = Math.max(hiB, B[j].h); loB = Math.min(loB, B[j].l); }
  f.struct = isFinite(hiB) ? (Math.sign(hiA - hiB) + Math.sign(loA - loB)) / 2 : 0;
  const a = Math.min(H.ahead, i);
  f.roc = tanh((c - S.c[i - a]) / (atr * Math.sqrt(a)));

  let score = 0;
  for (const key in WEIGHTS) score += WEIGHTS[key] * (num(f[key]) ? f[key] : 0);
  const ad = num(S.adx[i]) ? S.adx[i] : 20, ch = num(S.chop[i]) ? S.chop[i] : 50;
  const choppy = ad < 18 && ch > 58;
  const th = choppy ? TH_SIDE : TH_DIR;
  const call = score > th ? "bull" : score < -th ? "bear" : "side";
  return { score, call, f, atr, adx: ad, chop: ch, choppy, rsi: r, vwap };
}

/* ---------- walk-forward test: the model's own record on this symbol ---------- */
function backtest(B, S, H, start) {
  const out = { calls: 0, right: 0, side: 0, sideRight: 0, n: 0, upBase: 0, inRange: 0 };
  const from = Math.max(start, B.length - 1 - H.ahead - 600);
  for (let i = from; i < B.length - H.ahead; i++) {
    const s = signalAt(B, S, i, H), d = S.c[i + H.ahead] - S.c[i], band = s.atr * Math.sqrt(H.ahead);
    out.n++;
    if (d > 0) out.upBase++;
    if (Math.abs(d) <= band) out.inRange++;
    if (s.call === "side") { out.side++; if (Math.abs(d) <= 0.5 * band) out.sideRight++; }
    else { out.calls++; if ((s.call === "bull" && d > 0) || (s.call === "bear" && d < 0)) out.right++; }
  }
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  return { tested: out.n, calls: out.calls, hit: pct(out.right, out.calls), sideCalls: out.side, sideHit: pct(out.sideRight, out.side), baseUp: pct(out.upBase, out.n), rangeHit: pct(out.inRange, out.n) };
}

/* ---------- one horizon ---------- */
function analyseHorizon(raw, H) {
  const B = resample(raw, H.group), need = H.look + 30;
  if (B.length < need) return { id: H.id, label: H.label, error: `Not enough recent data (${B.length} bars, need ${need}).` };
  const S = series(B), i = B.length - 1, s = signalAt(B, S, i, H);
  const keys = Object.keys(WEIGHTS), dir = Math.sign(s.score) || 1;
  let agreeW = 0, totW = 0;
  for (const key of keys) { const v = s.f[key]; if (Math.abs(v) < 0.05) continue; totW += WEIGHTS[key]; if (Math.sign(v) === dir) agreeW += WEIGHTS[key]; }
  const agree = totW ? agreeW / totW : 0.5;
  let conf = s.call === "side"
    ? 0.45 * (1 - Math.abs(s.score) / TH_SIDE) + 0.35 * clamp((s.chop - 38) / 30, 0, 1) + 0.2 * clamp((25 - s.adx) / 15, 0, 1)
    : 0.4 * clamp(Math.abs(s.score) / 0.6, 0, 1) + 0.35 * agree + 0.25 * clamp(s.adx / 40, 0, 1);
  conf = clamp(conf, 0, 1);
  const test = backtest(B, S, H, H.look + 30);
  // No proven edge: up/down calls no better than a coin flip → Low; no better than always betting on the majority
  // direction of this window → at most Medium.
  const majority = test.baseUp == null ? null : Math.max(test.baseUp, 100 - test.baseUp);
  test.edge = test.hit == null || test.calls < 20 ? "few" : test.hit < 52 ? "none" : majority != null && test.hit <= majority + 2 ? "base" : "yes";
  test.majority = majority; test.majorityDir = test.baseUp >= 50 ? "up" : "down";
  if (s.call !== "side") conf = Math.min(conf, test.edge === "none" ? 0.34 : test.edge === "base" ? 0.6 : 1);
  const band = s.atr * Math.sqrt(H.ahead), c = S.c[i];
  // support / resistance: lowest low and highest high of the lookback, plus the nearest swing points
  const L = H.look; let sup = Infinity, res = -Infinity;
  for (let j = i - L + 1; j <= i; j++) { sup = Math.min(sup, B[j].l); res = Math.max(res, B[j].h); }
  // squeeze: Bollinger width now vs its own recent range
  const bw = []; for (let j = Math.max(20, i - L * 2); j <= i; j++) { let m = 0, v = 0; for (let k = j - 19; k <= j; k++) m += S.c[k]; m /= 20; for (let k = j - 19; k <= j; k++) v += (S.c[k] - m) ** 2; bw.push(Math.sqrt(v / 20) / m); }
  const sorted = bw.slice().sort((a, b) => a - b), squeeze = bw.length > 20 && bw[bw.length - 1] <= sorted[Math.floor(sorted.length * 0.2)];
  const votes = keys.map((key) => ({ key, label: LABELS[key], value: s.f[key], weight: WEIGHTS[key] })).sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight));
  return {
    id: H.id, label: H.label, call: s.call, score: s.score, conf, confLabel: conf >= 0.62 ? "High" : conf >= 0.4 ? "Medium" : "Low",
    price: c, low: c - band, high: c + band, support: sup, resistance: res, atr: s.atr, adx: s.adx, chop: s.chop, rsi: s.rsi, vwap: s.vwap,
    choppy: s.choppy, squeeze, votes, test, bars: B.length, barMin: H.group * (H.src === "m5" ? 5 : 1), lastT: B[i].t,
  };
}

/* ---------- context: day change, volume, freshness ---------- */
function context(m1, m5, meta) {
  const last = m1[m1.length - 1] || m5[m5.length - 1];
  if (!last) return {};
  const off = (meta && meta.gmtoffset) || 0, day = (t) => Math.floor((t / 1000 + off) / 86400);
  let ref = null, refLabel = "";
  if (meta && meta.type === "crypto") {
    const src = m5.length ? m5 : m1, t0 = last.t - 864e5;
    const b = src.find((x) => x.t >= t0);
    if (b && b.t - t0 < 36e5) { ref = b.o; refLabel = "24 h"; }
  } else {
    const src = m5.length ? m5 : m1, d = day(last.t);
    for (let j = src.length - 1; j >= 0; j--) if (day(src[j].t) < d) { ref = src[j].c; refLabel = "today"; break; }
    if (ref == null && meta && num(meta.prevClose)) { ref = meta.prevClose; refLabel = "today"; }
  }
  const vol = (a, b) => { let s = 0; for (let j = a; j <= b; j++) s += m1[j] ? m1[j].v : 0; return s; };
  const n = m1.length, recent = n > 15 ? vol(n - 15, n - 1) / 15 : 0, base = n > 135 ? vol(n - 135, n - 16) / 120 : 0;
  return { price: last.c, lastT: last.t, change: ref ? last.c - ref : null, changePct: ref ? ((last.c - ref) / ref) * 100 : null, changeLabel: refLabel, volRatio: base > 0 ? recent / base : null };
}

function analyse(data) {
  const m1 = clean(data.m1), m5 = clean(data.m5);
  const meta = data.meta || {};
  const results = HORIZONS.map((H) => analyseHorizon(H.src === "m5" ? (m5.length >= 80 ? m5 : resample(m1, 5)) : m1, H));
  const ok = results.filter((r) => !r.error);
  const s = ok.reduce((a, r) => a + r.score * (r.id === "1h" ? 0.4 : r.id === "30m" ? 0.35 : 0.25), 0) / (ok.length ? ok.reduce((a, r) => a + (r.id === "1h" ? 0.4 : r.id === "30m" ? 0.35 : 0.25), 0) : 1);
  const calls = ok.map((r) => r.call), allSame = calls.length && calls.every((x) => x === calls[0]);
  return { meta, ctx: context(m1, m5, meta), results, overall: { score: s, call: s > TH_DIR ? "bull" : s < -TH_DIR ? "bear" : "side", aligned: allSame }, spark: m1.slice(-120) };
}

const api = { analyse, analyseHorizon, clean, resample, series, signalAt, backtest, HORIZONS, WEIGHTS, LABELS };
if (typeof module === "object" && module.exports) module.exports = api;
else root.WPMarketsEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
