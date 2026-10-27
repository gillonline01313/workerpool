// Flight Deal Finder: cheapest international fares, including the cheap combinations that normal
// searches don't show. Prices come from the Travelpayouts (Aviasales) Data API: fares that Aviasales
// users found in the last 48 hours, so they're a strong guide, and the booking page shows the live price.
// Needs TP_TOKEN (API token) and TP_MARKER (partner id, so bookings earn commission).
import { sendEmail } from "./_lib.js";

const API = "https://api.travelpayouts.com";
export const CUR = "cad";

/* ---------- hub airports used to build self-transfer (separate ticket) routes ---------- */
// [code, city, lat, lon]
export const HUBS = [
  ["YVR", "Vancouver", 49.19, -123.18], ["YYC", "Calgary", 51.13, -114.01], ["YYZ", "Toronto", 43.68, -79.63], ["YUL", "Montréal", 45.47, -73.74],
  ["SEA", "Seattle", 47.45, -122.31], ["SFO", "San Francisco", 37.62, -122.38], ["LAX", "Los Angeles", 33.94, -118.41], ["DEN", "Denver", 39.86, -104.67],
  ["DFW", "Dallas", 32.9, -97.04], ["ORD", "Chicago", 41.98, -87.9], ["ATL", "Atlanta", 33.64, -84.43], ["JFK", "New York", 40.64, -73.78],
  ["MIA", "Miami", 25.8, -80.29], ["MEX", "Mexico City", 19.44, -99.07], ["BOG", "Bogotá", 4.7, -74.15], ["GRU", "São Paulo", -23.43, -46.47],
  ["KEF", "Reykjavík", 63.99, -22.62], ["DUB", "Dublin", 53.42, -6.27], ["LHR", "London", 51.47, -0.45], ["CDG", "Paris", 49.01, 2.55],
  ["AMS", "Amsterdam", 52.31, 4.76], ["FRA", "Frankfurt", 50.04, 8.56], ["MUC", "Munich", 48.35, 11.79], ["ZRH", "Zurich", 47.46, 8.55],
  ["MAD", "Madrid", 40.47, -3.56], ["LIS", "Lisbon", 38.77, -9.13], ["IST", "Istanbul", 41.26, 28.74], ["HEL", "Helsinki", 60.32, 24.96],
  ["CAI", "Cairo", 30.12, 31.41], ["ADD", "Addis Ababa", 8.98, 38.8], ["NBO", "Nairobi", -1.32, 36.93], ["JNB", "Johannesburg", -26.14, 28.24],
  ["DXB", "Dubai", 25.25, 55.36], ["DOH", "Doha", 25.27, 51.61], ["AUH", "Abu Dhabi", 24.43, 54.65], ["DEL", "Delhi", 28.56, 77.1],
  ["BOM", "Mumbai", 19.09, 72.87], ["CMB", "Colombo", 7.18, 79.88], ["BKK", "Bangkok", 13.69, 100.75], ["KUL", "Kuala Lumpur", 2.75, 101.71],
  ["SIN", "Singapore", 1.36, 103.99], ["HKG", "Hong Kong", 22.31, 113.91], ["TPE", "Taipei", 25.08, 121.23], ["MNL", "Manila", 14.51, 121.02],
  ["ICN", "Seoul", 37.46, 126.44], ["NRT", "Tokyo", 35.77, 140.39], ["PVG", "Shanghai", 31.14, 121.81], ["SYD", "Sydney", -33.94, 151.18],
];
const rad = (d) => (d * Math.PI) / 180;
export function km(a, b) {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// Hubs that sit roughly on the way (detour under 35%), best first.
export function hubsBetween(o, d, max = 10, skip = []) {
  const direct = km(o, d);
  return HUBS.filter((h) => !skip.includes(h[0]))
    .map((h) => ({ h, extra: (km(o, [h[2], h[3]]) + km([h[2], h[3]], d)) / direct }))
    .filter((x) => x.extra < 1.35 && km(o, [x.h[2], x.h[3]]) > 250 && km([x.h[2], x.h[3]], d) > 250)
    .sort((a, b) => a.extra - b.extra).slice(0, max).map((x) => x.h);
}

/* ---------- Travelpayouts calls (cached 30 minutes at the edge) ---------- */
async function tp(env, path, params, ttl = 1800) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  if (env.TP_MARKET && !u.searchParams.has("market")) u.searchParams.set("market", env.TP_MARKET);
  const cacheKey = new Request(u.toString());
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit.json(); }
  u.searchParams.set("token", env.TP_TOKEN);
  const r = await fetch(u, { headers: { "Accept-Encoding": "gzip, deflate", "X-Access-Token": env.TP_TOKEN } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error((j && (j.error || j.message)) || "Price service error " + r.status);
  if (cache) await cache.put(cacheKey, new Response(JSON.stringify(j), { headers: { "content-type": "application/json", "cache-control": "max-age=" + ttl } }));
  return j;
}
const safe = (p) => p.catch((e) => ({ error: e.message, data: [] }));
const rows = (j) => (j && Array.isArray(j.prices) ? j.prices : Array.isArray(j && j.data) ? j.data : j && j.data && typeof j.data === "object" ? Object.values(j.data) : []);

// Place lookup (city or airport) with coordinates. No token needed.
export async function places(term, locale = "en") {
  const u = `https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(term)}&locale=${locale}&types[]=city&types[]=airport`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(u);
  let j = cache && (await cache.match(key).then((r) => r && r.json()));
  if (!j) {
    const r = await fetch(u);
    j = await r.json().catch(() => []);
    if (cache && Array.isArray(j)) await cache.put(key, new Response(JSON.stringify(j), { headers: { "content-type": "application/json", "cache-control": "max-age=604800" } }));
  }
  return (Array.isArray(j) ? j : []).slice(0, 8).map((p) => ({
    code: p.code, type: p.type, name: p.name, city: p.city_name || p.name, country: p.country_name || "",
    lat: p.coordinates ? +p.coordinates.lat : null, lon: p.coordinates ? +p.coordinates.lon : null,
  }));
}
async function place(code) {
  const hub = HUBS.find((h) => h[0] === code);
  if (hub) return { code, city: hub[1], lat: hub[2], lon: hub[3] };
  const p = (await places(code)).find((x) => x.code === code) || null;
  return p;
}

/* ---------- links that earn commission ---------- */
const ddmm = (d) => d.slice(8, 10) + d.slice(5, 7);
export function bookLink(env, { from, to, depart, ret, link }) {
  const base = link ? "https://www.aviasales.com" + (link.startsWith("/") ? link : "/search/" + link)
    : `https://www.aviasales.com/search/${from}${ddmm(depart)}${to}${ret ? ddmm(ret) : ""}1`;
  const u = new URL(base);
  u.searchParams.set("currency", CUR);
  u.searchParams.set("locale", "en");
  if (env.TP_MARKER) u.searchParams.set("marker", env.TP_MARKER);
  return u.toString();
}

/* ---------- time helpers ---------- */
const at = (s) => Date.parse(s); // departure_at carries its own UTC offset
const arrival = (f) => at(f.departure_at) + 60000 * (+f.duration_to || +f.duration || 0);
const day = (s) => String(s || "").slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const flight = (env, f, extra = {}) => ({
  from: f.origin_airport || f.origin, to: f.destination_airport || f.destination, depart: f.departure_at, ret: f.return_at || null,
  price: Math.round(+f.price), airline: f.airline || "", flight: f.flight_number ? (f.airline || "") + f.flight_number : "",
  stops: f.transfers ?? null, stopsBack: f.return_transfers ?? null, minutes: +f.duration_to || +f.duration || null,
  book: bookLink(env, { from: f.origin, to: f.destination, depart: day(f.departure_at), ret: f.return_at ? day(f.return_at) : null, link: f.link }),
  ...extra,
});

/* ---------- the search ---------- */
// q = { from, to, depart: YYYY-MM-DD, ret?: YYYY-MM-DD }
export async function search(env, q, { hubs: hubCount = 10 } = {}) {
  const { from, to, depart, ret } = q;
  const month = depart.slice(0, 7);
  const [po, pd] = await Promise.all([place(from), place(to)]);

  const base = { currency: CUR, origin: from, destination: to };
  const calls = {
    exact: tp(env, "/aviasales/v3/prices_for_dates", { ...base, departure_at: depart, return_at: ret || "", one_way: ret ? "false" : "true", sorting: "price", limit: 30 }),
    month: tp(env, "/aviasales/v3/grouped_prices", { ...base, group_by: "departure_at", departure_at: month, ...(ret ? { min_trip_duration: Math.max(1, dayDiff(depart, ret) - 3), max_trip_duration: dayDiff(depart, ret) + 3 } : {}) }),
    nearby: tp(env, "/v2/prices/nearest-places-matrix", { ...base, depart_date: month, return_date: ret ? ret.slice(0, 7) : "", flexibility: 3, distance: 6, limit: 12, show_to_affiliates: "true" }),
  };
  if (ret) {
    calls.owOut = tp(env, "/aviasales/v3/prices_for_dates", { ...base, departure_at: depart, one_way: "true", sorting: "price", limit: 30 });
    calls.owBack = tp(env, "/aviasales/v3/prices_for_dates", { currency: CUR, origin: to, destination: from, departure_at: ret, one_way: "true", sorting: "price", limit: 30 });
  }
  const hubs = po && pd && po.lat != null && pd.lat != null ? hubsBetween([po.lat, po.lon], [pd.lat, pd.lon], hubCount, [from, to]) : [];
  for (const h of hubs) {
    calls["l1_" + h[0]] = tp(env, "/aviasales/v3/prices_for_dates", { currency: CUR, origin: from, destination: h[0], departure_at: depart, one_way: "true", sorting: "price", limit: 30 });
    calls["l2_" + h[0]] = tp(env, "/aviasales/v3/prices_for_dates", { currency: CUR, origin: h[0], destination: to, departure_at: month, one_way: "true", sorting: "price", limit: 300 });
  }
  const keys = Object.keys(calls);
  const got = await Promise.all(keys.map((k) => safe(calls[k])));
  const R = Object.fromEntries(keys.map((k, i) => [k, got[i]]));
  if (keys.every((k) => R[k].error)) throw new Error(R.exact.error || "The price service didn't answer.");

  // 1. Regular tickets on the chosen date
  const tickets = rows(R.exact).filter((f) => day(f.departure_at) === depart && (!ret || day(f.return_at) === ret))
    .map((f) => flight(env, f, { kind: "ticket" })).sort((a, b) => a.price - b.price);
  const best = tickets[0] || null;

  // 2. Price calendar for the month (cheapest per day), and what's "normal" for this route
  const cal = rows(R.month).map((f) => ({ date: day(f.departure_at), price: Math.round(+f.price), stops: f.transfers ?? null, ret: f.return_at ? day(f.return_at) : null }))
    .filter((c) => c.date.startsWith(month) && c.price > 0).sort((a, b) => a.date.localeCompare(b.date));
  const sorted = cal.map((c) => c.price).sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const cheapDays = cal.filter((c) => c.date !== depart && Math.abs(dayDiff(depart, c.date)) <= 3 && best && c.price < best.price)
    .sort((a, b) => a.price - b.price).slice(0, 3)
    .map((c) => ({ kind: "day", date: c.date, ret: c.ret, price: c.price, save: best ? best.price - c.price : null, book: bookLink(env, { from, to, depart: c.date, ret: c.ret }) }));

  // 3. Nearby airports (fly from or to a neighbouring city)
  const near = [];
  for (const n of rows(R.nearby).flatMap((x) => (Array.isArray(x) ? x : [x]))) {
    if (!n || !n.value || (n.origin === from && n.destination === to)) continue;
    const price = Math.round(+n.value);
    if (best && price >= best.price) continue;
    near.push({ kind: "nearby", from: n.origin, to: n.destination, date: day(n.depart_date), ret: n.return_date ? day(n.return_date) : null, price, stops: n.number_of_changes ?? null,
      save: best ? best.price - price : null, book: bookLink(env, { from: n.origin, to: n.destination, depart: day(n.depart_date), ret: n.return_date ? day(n.return_date) : null }) });
  }
  near.sort((a, b) => a.price - b.price);

  // 4. Self-transfer: two separate tickets through a hub (outbound). For a return trip the cheapest
  //    one-way home is added, so the total compares like for like with a return ticket.
  const owBack = ret ? rows(R.owBack).filter((f) => day(f.departure_at) === ret).sort((x, y) => x.price - y.price)[0] : null;
  const combos = [];
  for (const h of (ret && !owBack ? [] : hubs)) {
    const l1 = rows(R["l1_" + h[0]]).filter((f) => day(f.departure_at) === depart);
    const l2 = rows(R["l2_" + h[0]]).filter((f) => { const d = day(f.departure_at); return d === depart || d === addDays(depart, 1); });
    for (const a of l1) for (const b of l2) {
      const gap = (at(b.departure_at) - arrival(a)) / 60000;
      if (!(gap >= 180 && gap <= 22 * 60)) continue; // 3h minimum to re-check bags; under a day
      if ((a.destination_airport || h[0]) !== (b.origin_airport || h[0])) continue; // same airport, no cross-town transfer
      combos.push({ kind: "self", via: h[0], viaCity: h[1], price: Math.round(+a.price + +b.price + (owBack ? +owBack.price : 0)), layover: Math.round(gap),
        legs: [flight(env, a), flight(env, b)], back: owBack ? flight(env, owBack) : null });
    }
  }
  combos.sort((x, y) => x.price - y.price);
  const seen = new Set();
  const selfTransfer = combos.filter((c) => (seen.has(c.via) ? false : seen.add(c.via))).filter((c) => !best || c.price < best.price).slice(0, 4)
    .map((c) => ({ ...c, save: best ? best.price - c.price : null }));

  // 5. Two one-way tickets instead of a return
  let twoOneWays = null;
  if (ret) {
    const o = rows(R.owOut).filter((f) => day(f.departure_at) === depart).sort((a, b) => a.price - b.price)[0];
    const b = owBack;
    if (o && b) {
      const price = Math.round(+o.price + +b.price);
      if (!best || price < best.price) twoOneWays = { kind: "oneways", price, save: best ? best.price - price : null, legs: [flight(env, o), flight(env, b)] };
    }
  }

  const options = [best && { ...best, label: "Cheapest regular ticket" }, ...selfTransfer, twoOneWays, ...cheapDays, ...near].filter(Boolean);
  const cheapest = options.reduce((m, o) => (!m || o.price < m.price ? o : m), null);
  return {
    q: { from, to, depart, ret: ret || null }, currency: CUR.toUpperCase(),
    places: { from: po, to: pd }, hubsChecked: hubs.map((h) => h[0]),
    best, cheapest, typical,
    deal: cheapest && typical ? Math.round(100 - (100 * cheapest.price) / typical) : null, // % under the month's typical price
    tickets: tickets.slice(0, 8), selfTransfer, twoOneWays, cheapDays, nearby: near.slice(0, 4), calendar: cal,
    checked: new Date().toISOString(),
  };
}
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/* ---------- alerts ---------- */
export async function ensureAlertTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS flight_alerts (id TEXT PRIMARY KEY, token TEXT NOT NULL, origin TEXT NOT NULL, dest TEXT NOT NULL,
    depart TEXT NOT NULL, ret TEXT, target INTEGER, baseline INTEGER, last_price INTEGER, notified_price INTEGER, email TEXT, email_ok INTEGER NOT NULL DEFAULT 0,
    tg_chat TEXT, push TEXT, created TEXT NOT NULL, checked TEXT, notified TEXT, active INTEGER NOT NULL DEFAULT 1, label TEXT)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS flight_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`).run();
}
export async function setting(env, k, make) {
  const r = await env.DB.prepare(`SELECT v FROM flight_settings WHERE k = ?1`).bind(k).first();
  if (r) return r.v;
  if (!make) return null;
  const v = await make();
  await env.DB.prepare(`INSERT OR IGNORE INTO flight_settings (k, v) VALUES (?1, ?2)`).bind(k, v).run();
  return (await env.DB.prepare(`SELECT v FROM flight_settings WHERE k = ?1`).bind(k).first()).v;
}
// When an alert should fire. A target price wins; otherwise "a very good deal" means 15% under the
// price when the alert was set, and each later alert needs a further 5% drop.
export function shouldNotify(a, price) {
  if (!price) return false;
  const last = a.notified_price;
  if (a.target) return price <= a.target && (!last || price <= last * 0.97);
  return a.baseline && price <= a.baseline * 0.85 && (!last || price <= last * 0.95);
}
export const money = (n) => "$" + Math.round(n).toLocaleString("en-CA");
export function describe(r) {
  const c = r.cheapest;
  if (!c) return null;
  const how = c.kind === "self" ? `two tickets via ${c.viaCity} (self-transfer)` : c.kind === "oneways" ? "two one-way tickets" : c.kind === "day" ? `flying on ${c.date}`
    : c.kind === "nearby" ? `${c.from} → ${c.to}` : c.stops === 0 ? "non-stop" : c.stops != null ? `${c.stops} stop${c.stops === 1 ? "" : "s"}` : "";
  return { price: c.price, how, link: c.book || (c.legs && c.legs[0].book) };
}

/* ---------- Telegram ---------- */
export async function telegram(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
export async function tgSecret(env) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wp-flights|" + env.TELEGRAM_BOT_TOKEN));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
// Registers the bot's webhook once, and returns the bot's @username.
export async function tgBot(env, origin) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const name = await setting(env, "tg_username");
  const hook = origin + "/api/flights/telegram";
  if (name && (await setting(env, "tg_hook")) === hook) return name;
  const me = await telegram(env, "getMe", {});
  if (!me.ok) return null;
  const set = await telegram(env, "setWebhook", { url: hook, secret_token: await tgSecret(env), allowed_updates: ["message"] });
  if (!set.ok) return null;
  await env.DB.prepare(`INSERT OR REPLACE INTO flight_settings (k, v) VALUES ('tg_username', ?1), ('tg_hook', ?2)`).bind(me.result.username, hook).run();
  return me.result.username;
}

/* ---------- Web Push (browsers and the Android app), RFC 8291 + VAPID RFC 8292 ---------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const te = new TextEncoder();
// The site's VAPID key pair is made once and kept in D1 (no setup needed).
export async function vapid(env) {
  const v = await setting(env, "vapid", async () => {
    const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
    const pub = b64u(await crypto.subtle.exportKey("raw", k.publicKey));
    return JSON.stringify({ jwk, pub });
  });
  return JSON.parse(v);
}
async function hkdf(salt, ikm, info, bits) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bits));
}
export async function sendPush(env, sub, payload) {
  const { jwk, pub } = await vapid(env);
  const endpoint = new URL(sub.endpoint);
  // VAPID token
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(te.encode(JSON.stringify({ aud: endpoint.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:" + (env.ADMIN_EMAIL || "admin@workerpool.ca") })));
  const signKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signKey, te.encode(head + "." + claims)));
  // Encrypt (aes128gcm)
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), uaPub, asPub), 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 96);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(te.encode(JSON.stringify(payload)), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  const body = cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
  const r = await fetch(sub.endpoint, { method: "POST", body, headers: {
    Authorization: `vapid t=${head}.${claims}.${sig}, k=${pub}`, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" } });
  return r.status; // 201 sent; 404/410 subscription gone
}

/* ---------- send one alert's message on every channel it has ---------- */
export async function notify(env, origin, a, r, d) {
  const route = `${a.origin} → ${a.dest}`;
  const when = a.ret ? `${a.depart} to ${a.ret}` : a.depart;
  const manage = `${origin}/tools/flights/?alert=${a.id}.${a.token}`;
  const title = `Flight deal: ${route} ${money(d.price)} CAD`;
  const line = `${route} (${when}) is now ${money(d.price)} CAD${d.how ? ", " + d.how : ""}${r.typical ? `. Usual price this month: about ${money(r.typical)}.` : "."}`;
  let sent = 0;
  if (a.email && a.email_ok) {
    if (await sendEmail(env, a.email, title, `${line}\n\nSee the deal: ${origin}/tools/flights/?from=${a.origin}&to=${a.dest}&depart=${a.depart}${a.ret ? "&ret=" + a.ret : ""}\nBook: ${d.link}\n\nPrices change quickly; the booking page shows the live price.\nChange or stop this alert: ${manage}`)) sent++;
  }
  if (a.tg_chat && env.TELEGRAM_BOT_TOKEN) {
    const t = await telegram(env, "sendMessage", { chat_id: a.tg_chat, text: `✈️ ${title}\n${line}\n\nBook: ${d.link}\n\nStop alerts: ${manage}`, disable_web_page_preview: true });
    if (t.ok) sent++;
  }
  if (a.push) {
    try {
      const st = await sendPush(env, JSON.parse(a.push), { title, body: line, url: `/tools/flights/?from=${a.origin}&to=${a.dest}&depart=${a.depart}${a.ret ? "&ret=" + a.ret : ""}` });
      if (st === 404 || st === 410) await env.DB.prepare(`UPDATE flight_alerts SET push = NULL WHERE id = ?1`).bind(a.id).run();
      else if (st < 300) sent++;
    } catch (e) { console.warn("push failed", e.message); }
  }
  return sent;
}
