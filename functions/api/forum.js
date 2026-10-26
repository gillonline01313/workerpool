// Discussion forum. Reading is public; posting needs a WorkerPool account with a forum username.
// Every topic keeps the date and time it was opened, and every post the exact date and time it was received (UTC, shown in the reader's time zone).
import { json, str, isEmail, readJson, id, hashPassword, createSession, getUser, sha256hex, sendEmail } from "../_lib.js";
import { META, getCat, isCityLoc, validLoc, checkUsername } from "../_forum.js";

const PAGE_TOPICS = 25, PAGE_POSTS = 40;
const TOPICS_PER_HOUR = 5, POSTS_PER_HOUR = 30, GAP_SECONDS = 15, MAX_LINKS = 3;
const NOT_READY = "The forum isn't set up yet. Run schema-forum.sql in the D1 console.";

async function me(request, env) {
  const u = await getUser(request, env);
  if (!u) return { u: null, f: null };
  const f = await env.DB.prepare(`SELECT * FROM forum_users WHERE user_id = ?1`).bind(u.id).first();
  return { u, f };
}
const meOut = ({ u, f }) => ({ signedIn: !!u, username: f ? f.username : null, banned: !!(f && f.banned) });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), q = url.searchParams;
  if (q.get("view") === "meta") return new Response(JSON.stringify({ ok: true, ...META }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
  try {
    if (q.get("view") === "me") return json({ ok: true, me: meOut(await me(request, env)) });
    if (q.get("view") === "home") {
      const counts = await env.DB.prepare(
        `SELECT cat, COUNT(*) AS topics, SUM(replies) AS replies, MAX(last_post) AS last FROM forum_topics WHERE status != 'hidden' GROUP BY cat`).all();
      const prov = await env.DB.prepare(
        `SELECT cat, substr(loc, 1, instr(loc, ':') - 1) AS prov, COUNT(*) AS topics FROM forum_topics WHERE status != 'hidden' AND loc IS NOT NULL GROUP BY cat, prov`).all();
      const recent = await env.DB.prepare(`SELECT ${TOPIC_COLS} FROM forum_topics WHERE status != 'hidden' ORDER BY last_post DESC LIMIT 12`).all();
      return json({ ok: true, me: meOut(await me(request, env)), counts: counts.results, prov: prov.results, recent: recent.results });
    }
    const topicId = q.get("topic");
    if (topicId) {
      const t = await env.DB.prepare(`SELECT ${TOPIC_COLS} FROM forum_topics WHERE id = ?1 AND status != 'hidden'`).bind(str(topicId, 64)).first();
      if (!t) return json({ ok: false, error: "This topic doesn't exist or was removed." }, 404);
      const page = Math.max(1, parseInt(q.get("page")) || 1);
      const posts = await env.DB.prepare(
        `SELECT id, n, username, CASE WHEN status = 'live' THEN body ELSE '' END AS body, created, status, removed_at, removed_by
         FROM forum_posts WHERE topic_id = ?1 ORDER BY n LIMIT ?2 OFFSET ?3`).bind(t.id, PAGE_POSTS, (page - 1) * PAGE_POSTS).all();
      const who = await me(request, env);
      if (page === 1) await logView(request, env, t.id, who, q);
      return json({ ok: true, me: meOut(who), topic: t, posts: posts.results, page, pages: Math.max(1, Math.ceil((t.replies + 1) / PAGE_POSTS)) });
    }
    const search = str(q.get("q"), 80);
    if (search) {
      const like = "%" + search.replace(/[%_\\]/g, (m) => "\\" + m) + "%";
      const r = await env.DB.prepare(
        `SELECT ${TOPIC_COLS} FROM forum_topics t WHERE status != 'hidden' AND (title LIKE ?1 ESCAPE '\\'
           OR EXISTS (SELECT 1 FROM forum_posts p WHERE p.topic_id = t.id AND p.status = 'live' AND p.body LIKE ?1 ESCAPE '\\'))
         ORDER BY last_post DESC LIMIT 50`).bind(like).all();
      return json({ ok: true, me: meOut(await me(request, env)), topics: r.results });
    }
    const cat = getCat(q.get("cat") || "");
    if (!cat) return json({ ok: false, error: "Pick a forum." }, 400);
    const loc = q.get("loc") || "";
    const page = Math.max(1, parseInt(q.get("page")) || 1), order = q.get("sort") === "new" ? "created DESC" : "pinned DESC, last_post DESC";
    let where = `cat = ?1 AND status != 'hidden'`, binds = [cat.id];
    if (cat.loc && loc && validLoc(loc)) {
      if (loc.includes(":")) { where += ` AND loc = ?2`; binds.push(loc); }
      else { where += ` AND loc LIKE ?2`; binds.push(loc + ":%"); }
    }
    const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM forum_topics WHERE ${where}`).bind(...binds).first();
    const r = await env.DB.prepare(`SELECT ${TOPIC_COLS} FROM forum_topics WHERE ${where} ORDER BY ${order} LIMIT ${PAGE_TOPICS} OFFSET ${(page - 1) * PAGE_TOPICS}`).bind(...binds).all();
    return json({ ok: true, me: meOut(await me(request, env)), topics: r.results, page, pages: Math.max(1, Math.ceil((total ? total.n : 0) / PAGE_TOPICS)), total: total ? total.n : 0 });
  } catch (e) {
    return json({ ok: false, error: NOT_READY }, 500);
  }
}
// One row per topic view (page 1 opens), for the admin's view details. Signed-in members are linked to their account;
// everyone else is shown by approximate location, device and time. No IP address is stored.
function parseUA(ua) {
  const u = ua || "";
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|curl|wget|python|axios/i.test(u)) return { dev: "Bot", os: "", browser: (u.match(/([A-Za-z]*bot[A-Za-z]*|Headless\w*|facebookexternalhit)/i) || ["Bot"])[0] };
  const dev = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(u) ? "Tablet" : /Mobi|iPhone|iPod|Android/i.test(u) ? "Mobile" : "Desktop";
  let os = "Other", m;
  if ((m = u.match(/(?:iPhone|CPU) OS (\d+)/))) os = (/iPad/.test(u) ? "iPadOS " : "iOS ") + m[1];
  else if ((m = u.match(/Android (\d+(?:\.\d+)?)/))) os = "Android " + m[1];
  else if (/Windows NT 10/.test(u)) os = "Windows 10/11";
  else if ((m = u.match(/Windows NT ([\d.]+)/))) os = "Windows " + m[1];
  else if (/Mac OS X/.test(u)) os = "macOS";
  else if (/CrOS/.test(u)) os = "ChromeOS";
  else if (/Linux/.test(u)) os = "Linux";
  let browser = "Other";
  if ((m = u.match(/Edg(?:A|iOS)?\/(\d+)/))) browser = "Edge " + m[1];
  else if ((m = u.match(/(?:OPR|Opera)\/(\d+)/))) browser = "Opera " + m[1];
  else if ((m = u.match(/SamsungBrowser\/(\d+)/))) browser = "Samsung Internet " + m[1];
  else if (/FBAN|FBAV|FB_IAB/.test(u)) browser = "Facebook app";
  else if (/Instagram/.test(u)) browser = "Instagram app";
  else if (/WhatsApp/.test(u)) browser = "WhatsApp";
  else if ((m = u.match(/(?:Firefox|FxiOS)\/(\d+)/))) browser = "Firefox " + m[1];
  else if ((m = u.match(/(?:Chrome|CriOS)\/(\d+)/))) browser = "Chrome " + m[1];
  else if ((m = u.match(/Version\/(\d+).*Safari/))) browser = "Safari " + m[1];
  return { dev, os, browser };
}
async function logView(request, env, topicId, who, q) {
  await env.DB.prepare(`UPDATE forum_topics SET views = views + 1 WHERE id = ?1`).bind(topicId).run();
  try {
    const cf = request.cf || {}, ua = request.headers.get("user-agent") || "", d = parseUA(ua);
    const vid = /^[a-z0-9]{6,24}$/.test(q.get("vid") || "") ? q.get("vid") : "";
    const lang = (request.headers.get("accept-language") || "").split(",")[0];
    await env.DB.prepare(
      `INSERT INTO forum_views (topic_id, t, user_id, username, vid, country, region, city, tz, dev, os, browser, lang, screen, ua)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
    ).bind(topicId, new Date().toISOString(), who.u ? who.u.id : null, who.f ? who.f.username : null, vid,
      str(cf.country, 4), str(cf.region, 60), str(cf.city, 60), str(q.get("tz") || cf.timezone || "", 60),
      d.dev, d.os, d.browser, str(lang, 16), str(q.get("scr") || "", 12).replace(/[^0-9x]/g, ""), str(ua, 300)).run();
  } catch (e) { /* forum_views not created yet: the count above still works */ }
}
const TOPIC_COLS = `id, cat, loc, title, username, created, last_post, last_user, replies, views, status, pinned`;

export async function onRequestPost({ request, env }) {
  const b = await readJson(request, 20000);
  if (!b) return json({ ok: false, error: "Invalid request." }, 400);
  try {
    if (b.action === "signup") return signup(request, env, b);
    const m = await me(request, env);
    if (!m.u) return json({ ok: false, error: "Sign in to take part.", signin: true }, 401);
    if (b.action === "username") return setUsername(env, m, b);
    if (!m.f) return json({ ok: false, error: "Choose a forum username first.", needUsername: true }, 403);
    if (m.f.banned) return json({ ok: false, error: "Your forum account can't post. Email hello@workerpool.ca if you think this is a mistake." }, 403);
    if (b.action === "topic") return newTopic(request, env, m, b);
    if (b.action === "reply") return reply(request, env, m, b);
    if (b.action === "report") return report(env, m, b);
    if (b.action === "remove") return removeOwn(env, m, b);
    return json({ ok: false, error: "Not found." }, 404);
  } catch (e) {
    return json({ ok: false, error: NOT_READY }, 500);
  }
}

async function usernameTaken(env, name) {
  return !!(await env.DB.prepare(`SELECT 1 FROM forum_users WHERE username_lc = ?1`).bind(name.toLowerCase()).first());
}

// New account straight from the forum: username, email and password.
async function signup(request, env, b) {
  const username = str(b.username, 20), email = str(b.email, 120).toLowerCase(), pass = typeof b.password === "string" ? b.password : "";
  const bad = checkUsername(username);
  if (bad) return json({ ok: false, error: bad }, 400);
  if (!isEmail(email)) return json({ ok: false, error: "Enter a valid email address. It stays private and is only used to reset your password." }, 400);
  if (pass.length < 8 || pass.length > 200) return json({ ok: false, error: "Password needs at least 8 characters." }, 400);
  if (await usernameTaken(env, username)) return json({ ok: false, error: "That username is taken. Try another." }, 409);
  if (await env.DB.prepare(`SELECT id FROM users WHERE email = ?1`).bind(email).first())
    return json({ ok: false, error: "An account with this email already exists. Sign in with it instead, then pick your username." }, 409);
  const uid = id(), now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, name, phone, pass_hash, created, step, profile, fail_count, locked_until) VALUES (?1, ?2, ?3, '', ?4, ?5, 'basics', ?6, 0, '')`)
      .bind(uid, email, username, await hashPassword(pass), now, JSON.stringify({ email, jobs: [], source: "forum" })),
    env.DB.prepare(`INSERT INTO forum_users (user_id, username, username_lc, created) VALUES (?1, ?2, ?3, ?4)`).bind(uid, username, username.toLowerCase(), now),
  ]);
  const cookie = await createSession(env, uid);
  return new Response(JSON.stringify({ ok: true, me: { signedIn: true, username, banned: false } }), { headers: { "content-type": "application/json", "set-cookie": cookie } });
}

// Existing WorkerPool accounts pick a username the first time they use the forum. It can't be changed later.
async function setUsername(env, m, b) {
  if (m.f) return json({ ok: false, error: "You already have a username: " + m.f.username }, 409);
  const username = str(b.username, 20), bad = checkUsername(username);
  if (bad) return json({ ok: false, error: bad }, 400);
  if (await usernameTaken(env, username)) return json({ ok: false, error: "That username is taken. Try another." }, 409);
  await env.DB.prepare(`INSERT INTO forum_users (user_id, username, username_lc, created) VALUES (?1, ?2, ?3, ?4)`)
    .bind(m.u.id, username, username.toLowerCase(), new Date().toISOString()).run();
  return json({ ok: true, me: { signedIn: true, username, banned: false } });
}

// Shared checks for anything a member posts: length, links, flood and duplicate protection.
async function postCheck(env, m, body, isTopic) {
  if (body.length < 10) return "Write at least a sentence (10 characters or more).";
  if ((body.match(/https?:\/\//gi) || []).length > MAX_LINKS) return `Posts can include up to ${MAX_LINKS} links.`;
  const hourAgo = new Date(Date.now() - 36e5).toISOString();
  const last = await env.DB.prepare(`SELECT body, created FROM forum_posts WHERE user_id = ?1 ORDER BY id DESC LIMIT 1`).bind(m.u.id).first();
  if (last && Date.now() - Date.parse(last.created) < GAP_SECONDS * 1000) return "You're posting very fast. Wait a few seconds and try again.";
  if (last && last.body.trim() === body.trim()) return "You already posted that message.";
  const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM forum_posts WHERE user_id = ?1 AND created > ?2`).bind(m.u.id, hourAgo).first();
  if (n && n.n >= POSTS_PER_HOUR) return "You've reached the hourly posting limit. Try again in a little while.";
  if (isTopic) {
    const t = await env.DB.prepare(`SELECT COUNT(*) AS n FROM forum_topics WHERE user_id = ?1 AND created > ?2`).bind(m.u.id, hourAgo).first();
    if (t && t.n >= TOPICS_PER_HOUR) return `You can open up to ${TOPICS_PER_HOUR} topics an hour. Try again later.`;
  }
  return "";
}
const ipHash = (request) => sha256hex("forum:" + (request.headers.get("cf-connecting-ip") || ""));

async function newTopic(request, env, m, b) {
  const cat = getCat(str(b.cat, 40));
  if (!cat) return json({ ok: false, error: "Pick a category for your topic." }, 400);
  const loc = cat.loc ? str(b.loc, 60) : null;
  if (cat.loc && !isCityLoc(loc)) return json({ ok: false, error: "Pick the province and city or town this topic is about." }, 400);
  const title = str(b.title, 150).replace(/\s+/g, " "), body = str(b.body, 8000);
  if (title.length < 8) return json({ ok: false, error: "Give your topic a clear title (8 characters or more)." }, 400);
  const bad = await postCheck(env, m, body, true);
  if (bad) return json({ ok: false, error: bad }, 400);
  const tid = id(), now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO forum_topics (id, cat, loc, title, user_id, username, created, last_post, last_user, replies, views, status, pinned) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?6, 0, 0, 'open', 0)`)
      .bind(tid, cat.id, loc, title, m.u.id, m.f.username, now),
    env.DB.prepare(`INSERT INTO forum_posts (topic_id, n, user_id, username, body, created, ip_hash) VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(tid, m.u.id, m.f.username, body, now, await ipHash(request)),
    env.DB.prepare(`UPDATE forum_users SET posts = posts + 1 WHERE user_id = ?1`).bind(m.u.id),
  ]);
  return json({ ok: true, id: tid, created: now });
}

async function reply(request, env, m, b) {
  const t = await env.DB.prepare(`SELECT * FROM forum_topics WHERE id = ?1`).bind(str(b.topic, 64)).first();
  if (!t || t.status === "hidden") return json({ ok: false, error: "This topic doesn't exist or was removed." }, 404);
  if (t.status === "locked") return json({ ok: false, error: "This topic is locked. Start a new topic instead." }, 403);
  const body = str(b.body, 8000), bad = await postCheck(env, m, body, false);
  if (bad) return json({ ok: false, error: bad }, 400);
  const now = new Date().toISOString();
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT INTO forum_posts (topic_id, n, user_id, username, body, created, ip_hash)
      SELECT ?1, COALESCE(MAX(n), 0) + 1, ?2, ?3, ?4, ?5, ?6 FROM forum_posts WHERE topic_id = ?1`)
      .bind(t.id, m.u.id, m.f.username, body, now, await ipHash(request)),
    env.DB.prepare(`UPDATE forum_topics SET replies = replies + 1, last_post = ?1, last_user = ?2 WHERE id = ?3`).bind(now, m.f.username, t.id),
    env.DB.prepare(`UPDATE forum_users SET posts = posts + 1 WHERE user_id = ?1`).bind(m.u.id),
  ]);
  const p = await env.DB.prepare(`SELECT id, n, created FROM forum_posts WHERE id = ?1`).bind(res[0].meta.last_row_id).first();
  return json({ ok: true, post: p, pages: Math.max(1, Math.ceil(p.n / PAGE_POSTS)) });
}

async function report(env, m, b) {
  const pid = parseInt(b.post) || 0, reason = str(b.reason, 300);
  const p = await env.DB.prepare(`SELECT p.*, t.title FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id WHERE p.id = ?1`).bind(pid).first();
  if (!p) return json({ ok: false, error: "Post not found." }, 404);
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO forum_reports (post_id, user_id, reason, created) VALUES (?1, ?2, ?3, ?4)`)
    .bind(pid, m.u.id, reason, new Date().toISOString()).run();
  if (r.meta && r.meta.changes)
    await sendEmail(env, env.ADMIN_EMAIL, `Forum report: "${p.title}"`,
      `${m.f.username} reported post #${p.n} by ${p.username} in "${p.title}".\n\nReason: ${reason || "(none given)"}\n\nPost:\n${p.body.slice(0, 1500)}\n\nReview it in the admin dashboard: ${env.SITE_URL || "https://workerpool.ca"}/admin/ (Forum tab)`);
  return json({ ok: true });
}

// Members can remove their own posts. The post keeps its number and time and shows as "removed by the author".
async function removeOwn(env, m, b) {
  const pid = parseInt(b.post) || 0;
  const r = await env.DB.prepare(`UPDATE forum_posts SET status = 'removed', removed_at = ?1, removed_by = 'author' WHERE id = ?2 AND user_id = ?3 AND status = 'live'`)
    .bind(new Date().toISOString(), pid, m.u.id).run();
  if (!r.meta || !r.meta.changes) return json({ ok: false, error: "You can only remove your own posts." }, 403);
  return json({ ok: true });
}
