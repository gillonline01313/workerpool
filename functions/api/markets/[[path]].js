// Admin → Market pulse: symbol search and recent candles for crypto and for stocks / ETFs listed in Canada or the US.
// Admin only (x-admin-key). Nothing is stored: responses are cached at the edge for a few seconds so repeated
// Analyse clicks don't hammer the data sources.
//
// GET search?q=shop            → { ok, results: [{ symbol, name, exch, type: "stock" | "etf" | "crypto", region }] }
// GET bars?s=SHOP.TO&type=stock → { ok, meta, m1: [[t,o,h,l,c,v]…], m5: [[…]…] }   t = bar open time in ms
//
// Sources (free, no key):
//   Stocks / ETFs: Yahoo Finance chart API. US listings use the plain ticker (AAPL); Canadian listings use Yahoo's
//   suffix: .TO TSX, .V TSX Venture, .CN CSE, .NE Cboe Canada. Exchanges may delay quotes; the page shows how old
//   the last bar is.
//   Crypto (priced in USD / USDT), first that answers: Binance public market data → Coinbase Exchange → Kraken → Yahoo.
import { json } from "../../_lib.js";

function same(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const isAdmin = (request, env) => !!env.ADMIN_KEY && same(request.headers.get("x-admin-key") || "", env.ADMIN_KEY);
const UA = { "user-agent": "Mozilla/5.0 (compatible; WorkerPoolMarketPulse/1.0; +https://workerpool.ca)", accept: "application/json" };

const US = { NMS: "Nasdaq", NGM: "Nasdaq", NCM: "Nasdaq", NAS: "Nasdaq", NYQ: "NYSE", NYS: "NYSE", ASE: "NYSE American", PCX: "NYSE Arca", BTS: "Cboe BZX", BATS: "Cboe BZX" };
const CA = { TOR: "TSX", VAN: "TSX Venture", CNQ: "CSE", NEO: "Cboe Canada" };
const CRYPTO = {
  BTC: "Bitcoin", ETH: "Ethereum", XRP: "XRP", SOL: "Solana", BNB: "BNB", DOGE: "Dogecoin", ADA: "Cardano", TRX: "TRON", AVAX: "Avalanche",
  LINK: "Chainlink", DOT: "Polkadot", LTC: "Litecoin", BCH: "Bitcoin Cash", XLM: "Stellar", SHIB: "Shiba Inu", TON: "Toncoin", SUI: "Sui",
  NEAR: "NEAR Protocol", APT: "Aptos", HBAR: "Hedera", UNI: "Uniswap", ATOM: "Cosmos", ETC: "Ethereum Classic", FIL: "Filecoin",
  ARB: "Arbitrum", OP: "Optimism", PEPE: "Pepe", AAVE: "Aave", HYPE: "Hyperliquid", XMR: "Monero", ZEC: "Zcash", ALGO: "Algorand",
  ICP: "Internet Computer", INJ: "Injective", RENDER: "Render", SEI: "Sei", TIA: "Celestia", WIF: "dogwifhat", BONK: "Bonk", ENA: "Ethena",
  MKR: "Maker", CRV: "Curve", SAND: "The Sandbox", MANA: "Decentraland", AXS: "Axie Infinity", GRT: "The Graph", VET: "VeChain", KAS: "Kaspa",
  TAO: "Bittensor", FET: "Artificial Superintelligence Alliance", ONDO: "Ondo", JUP: "Jupiter", PYTH: "Pyth Network", POL: "Polygon", USDC: "USD Coin",
};

async function getJson(url, ms = 8000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.json();
}
async function cached(request, key, ttl, make) {
  const cache = caches.default, k = new Request(new URL(request.url).origin + "/__mp/" + key);
  const hit = await cache.match(k);
  if (hit) return hit.json();
  const body = await make();
  if (body && body.ok) await cache.put(k, new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } }));
  return body;
}

/* ---------- search ---------- */
async function search(q) {
  const out = [], seen = new Set();
  const add = (x) => { const k = x.type + ":" + x.symbol; if (!seen.has(k)) { seen.add(k); out.push(x); } };
  const Q = q.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  const ql = q.toLowerCase();
  // crypto from the built-in list first when the ticker or name matches
  for (const [sym, name] of Object.entries(CRYPTO)) {
    if (sym === Q || sym === Q.replace(/-?USDT?$/, "")) add({ symbol: sym, name, exch: "Crypto", type: "crypto", region: "Crypto" });
  }
  for (const [sym, name] of Object.entries(CRYPTO)) {
    if (out.length >= 3) break;
    if (ql.length >= 3 && name.toLowerCase().startsWith(ql)) add({ symbol: sym, name, exch: "Crypto", type: "crypto", region: "Crypto" });
  }
  let yahooOk = false;
  for (const host of ["query2", "query1"]) {
    try {
      const j = await getJson(`https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false`, 6000);
      yahooOk = true;
      for (const x of j.quotes || []) {
        const t = String(x.quoteType || "").toUpperCase(), sym = String(x.symbol || ""), name = x.longname || x.shortname || sym;
        if (t === "CRYPTOCURRENCY") { const m = sym.match(/^([A-Z0-9]+)-USD$/); if (m) add({ symbol: m[1], name: String(name).replace(/\s+USD$/, ""), exch: "Crypto", type: "crypto", region: "Crypto" }); continue; }
        if (t !== "EQUITY" && t !== "ETF") continue;
        const ex = String(x.exchange || "").toUpperCase();
        if (US[ex]) add({ symbol: sym, name, exch: US[ex], type: t === "ETF" ? "etf" : "stock", region: "US" });
        else if (CA[ex]) add({ symbol: sym, name, exch: CA[ex], type: t === "ETF" ? "etf" : "stock", region: "Canada" });
      }
      break;
    } catch (e) { /* try the other host */ }
  }
  if (!out.length && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(Q)) { // nothing found (or Yahoo down): offer the ticker as typed
    add({ symbol: Q, name: "As typed (US listing)", exch: "US", type: "stock", region: "US" });
    if (!/\.(TO|V|CN|NE)$/.test(Q)) add({ symbol: Q + ".TO", name: "As typed (TSX listing)", exch: "TSX", type: "stock", region: "Canada" });
  }
  return { ok: true, results: out.slice(0, 15), partial: !yahooOk };
}

/* ---------- candles ---------- */
const num = (x) => (x == null || x === "" ? NaN : +x);
const bar = (t, o, h, l, c, v) => [t, num(o), num(h), num(l), num(c), num(v) || 0];
const good = (a) => a.filter((b) => b.every((x, i) => i === 5 || (isFinite(x) && x > 0))).sort((a, b) => a[0] - b[0]);

async function yahooChart(sym, interval, range) {
  let last;
  for (const host of ["query1", "query2"]) {
    try {
      const j = await getJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}&includePrePost=false&events=`);
      const r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || "Symbol not found");
      const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, ts = r.timestamp || [];
      return { meta: r.meta || {}, bars: good(ts.map((t, i) => bar(t * 1000, q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i]))) };
    } catch (e) { last = e; }
  }
  throw last;
}
async function stockBars(sym) {
  const [a, b] = await Promise.all([yahooChart(sym, "1m", "5d"), yahooChart(sym, "5m", "1mo").catch(() => null)]);
  const m = a.meta, reg = m.currentTradingPeriod && m.currentTradingPeriod.regular, now = Date.now() / 1000;
  const open = reg ? now >= reg.start && now < reg.end : null;
  const ex = String(m.exchangeName || "").toUpperCase();
  return {
    ok: true,
    meta: {
      type: "stock", symbol: m.symbol || sym, name: m.longName || m.shortName || sym, currency: m.currency || "", exchange: m.fullExchangeName || US[ex] || CA[ex] || ex,
      region: CA[ex] || /\.(TO|V|CN|NE)$/i.test(sym) ? "Canada" : "US", source: "Yahoo Finance", gmtoffset: m.gmtoffset || 0, tz: m.exchangeTimezoneName || "",
      marketOpen: open, sessionStart: reg ? reg.start * 1000 : null, sessionEnd: reg ? reg.end * 1000 : null, prevClose: m.previousClose ?? null,
      instrument: m.instrumentType || "",
    },
    m1: a.bars, m5: b ? b.bars : [],
  };
}

const CRYPTO_SOURCES = [
  { name: "Binance", quote: "USDT", get: async (s) => {
    const k = (iv) => getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${s}USDT&interval=${iv}&limit=1000`);
    const [a, b] = await Promise.all([k("1m"), k("5m")]);
    const map = (x) => good(x.map((r) => bar(r[0], r[1], r[2], r[3], r[4], r[5])));
    return [map(a), map(b)];
  } },
  { name: "Coinbase", quote: "USD", get: async (s) => {
    const k = (g) => getJson(`https://api.exchange.coinbase.com/products/${s}-USD/candles?granularity=${g}`);
    const [a, b] = await Promise.all([k(60), k(300)]);
    const map = (x) => good(x.map((r) => bar(r[0] * 1000, r[3], r[2], r[1], r[4], r[5]))); // [time, low, high, open, close, volume]
    return [map(a), map(b)];
  } },
  { name: "Kraken", quote: "USD", get: async (s) => {
    const p = (s === "BTC" ? "XBT" : s === "DOGE" ? "XDG" : s) + "USD";
    const k = async (iv) => { const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${p}&interval=${iv}`); if (j.error && j.error.length) throw new Error(j.error[0]); const key = Object.keys(j.result || {}).find((x) => x !== "last"); return (j.result[key] || []); };
    const [a, b] = await Promise.all([k(1), k(5)]);
    const map = (x) => good(x.map((r) => bar(r[0] * 1000, r[1], r[2], r[3], r[4], r[6]))); // [time, o, h, l, c, vwap, volume, count]
    return [map(a), map(b)];
  } },
  { name: "Yahoo Finance", quote: "USD", get: async (s) => {
    const [a, b] = await Promise.all([yahooChart(s + "-USD", "1m", "1d"), yahooChart(s + "-USD", "5m", "5d").catch(() => null)]);
    return [a.bars, b ? b.bars : []];
  } },
];
async function cryptoBars(sym) {
  const tried = [];
  for (const src of CRYPTO_SOURCES) {
    try {
      const [m1, m5] = await src.get(sym);
      if (m1.length < 100) { tried.push(`${src.name}: only ${m1.length} bars`); continue; }
      return { ok: true, meta: { type: "crypto", symbol: sym, name: CRYPTO[sym] || sym, currency: src.quote, exchange: src.name, region: "Crypto", source: src.name, marketOpen: true, gmtoffset: 0 }, m1, m5 };
    } catch (e) { tried.push(`${src.name}: ${e.message}`); }
  }
  return { ok: false, error: `Couldn't get prices for ${sym}. ${tried.join("; ")}` };
}

export async function onRequest({ request, env, params }) {
  if (!isAdmin(request, env)) return json({ ok: false, error: "Wrong admin key." }, 401);
  if (request.method !== "GET") return json({ ok: false, error: "Use GET." }, 405);
  const path = [].concat(params.path || []).join("/"), u = new URL(request.url);
  try {
    if (path === "search") {
      const q = (u.searchParams.get("q") || "").trim().slice(0, 40);
      if (q.length < 1) return json({ ok: true, results: [] });
      return json(await cached(request, "s/" + encodeURIComponent(q.toLowerCase()), 3600, () => search(q)));
    }
    if (path === "bars") {
      const type = u.searchParams.get("type") === "crypto" ? "crypto" : "stock";
      const s = (u.searchParams.get("s") || "").trim().toUpperCase();
      if (type === "crypto" ? !/^[A-Z0-9]{2,12}$/.test(s) : !/^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/.test(s)) return json({ ok: false, error: "Pick a symbol from the search list." }, 400);
      const body = await cached(request, `b/${type}/${s}`, 20, () => (type === "crypto" ? cryptoBars(s) : stockBars(s).catch((e) => ({ ok: false, error: `Couldn't get prices for ${s}: ${e.message}` }))));
      return json(body, body.ok ? 200 : 502);
    }
    return json({ ok: false, error: "Not found." }, 404);
  } catch (e) {
    return json({ ok: false, error: e.message || "Something went wrong." }, 500);
  }
}
