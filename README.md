# WorkerPool

Website for **workerpool.ca**: free candidate profiles for temporary residents in Canada and foreign workers abroad, plus employer and licensed-partner interest. Hosted on Cloudflare Pages with Pages Functions and a D1 database. No paid analytics or third-party trackers.

## What's here

| Path | What it is |
|---|---|
| `index.html` | Home page |
| `apply/index.html` | Candidate questionnaire (`/apply/`, `/apply/#signin`) |
| `admin/index.html` | Admin dashboard (`/admin/`): analytics, candidates, employer interest |
| `assets/wpa.js` | First-party visit tracking |
| `functions/api/collect.js` | Saves page visits |
| `functions/api/interest.js` | Saves employer and partner interest |
| `functions/api/submit.js` | Saves candidate profiles |
| `functions/api/admin/[[path]].js` | Admin data API, protected by `ADMIN_KEY` |
| `functions/api/auth/*` | Accounts: sign up, sign in, sign out, forgot and reset password |
| `functions/api/profile.js` | Saves a candidate's questionnaire as they go |
| `functions/api/resume.js` | Resume upload and removal (private R2 storage) |
| `b2b/` | B2B Data Entry client portal: application type, information sheet, document checklist |
| `assets/b2b-config.js` | Application types, info sheet sections and document checklists (edit here to add types) |
| `functions/api/b2b/*` | B2B applications: create, save, upload documents, submit (emails admin), reopen a submitted application for edits (emails admin to hold processing; resubmit sends an "Updated" email) |
| `tools/bc/`, `tools/ab/`, `tools/mb/` | Pathway Checks for BC, Alberta and Manitoba: disclaimer, optional consent to share with a licensed RCIC, sign-up, then CRS / FSW / provincial EOI (BC PNP SIRS, AAIP, MPNP) / RCIP community scores and 2026 draws. Built from `tools/src/` with `python3 tools/src/build.py` |
| `tools/noc/` | NOC Requirements Checker (`/tools/noc/`): search all 516 NOC 2021 unit groups by code or job title; filter employment requirements by level (must have / usually / may be required), type (education, experience, training, licensing) and province. Data is `tools/noc/noc-2021.json`, built from Statistics Canada's NOC 2021 V1.0 elements file. Link to a NOC directly with `/tools/noc/#64410` |
| `tools/profile-scanner/` | Profile Scanner (`/tools/profile-scanner/`): visitors upload a passport, language test, work letters or pay stubs, education documents and optional notes; the page fills in the CRS factors, shows the score under the November 2026 rules, compares it with recent draws and lists strengths, weaknesses and how many points each improvement is worth. Scoring is the same as the Pathway Check tools. Logic is in `scanner.js` (bump its `?v=` when you change it) |
| `functions/api/tools/scan.js` | Reads one document at a time with Cloudflare Workers AI and returns the facts. Never stores anything: no file, text or result goes to D1, R2, logs or email. Keeps only anonymous counters (`scan_rate` table, created automatically) to limit each visitor to 40 documents an hour and the site to 5,000 a day |
| `tools/wages/` | Median Wage Checker (`/tools/wages/`): job title (designation) or NOC code, province and city → Job Bank low, median and high wage, a table of every region in the province plus Canada, and links to Job Bank's wage page for that title and area. Cities map to economic regions in `places.js` (add a town there). Data in `tools/wages/data/` is rebuilt every Monday by `.github/workflows/wages.yml` (`scripts/wages/build.mjs`) from ESDC's open "Wages" data, picking the newest year automatically, plus Job Bank's job titles. Hourly wages below a province's current minimum wage are raised to it, as Job Bank does; update `scripts/wages/minimum-wages.json` when a province announces a new rate (it applies automatically from its date); run it any time from GitHub → Actions → Median wage data → Run workflow |
| `functions/api/tools/assessment.js` | Saves an assessment the candidate agreed to share (one per province per account) and emails the admin |
| `assets/chat.js` | Live chat widget (on the home page; add the same script tag to any other page) |
| `functions/api/chat-file.js` | Live chat file upload and download for visitors |
| `functions/api/chat.js` | Live chat for visitors. Live 8:00 to 23:00 Edmonton time daily; outside those hours it takes a message plus email |
| `assets/ticker.js` | "Hot & New" ticker under the home page header (add `<div id="hn"></div>` plus the script tag to show it on any other page) |
| `functions/api/news.js`, `functions/_news.js` | Ticker feed, click counting, starter items and trending order |
| `forum/` | Discussion forum (`/forum/`): topics in Temporary residence, Permanent residence, every Provincial Nominee Program, each RCIP and FCIP community, and Jobs (job seekers and employers, by province and city). Every topic shows when it was opened and every reply the exact date and time it was received (shown in the reader's time zone). Posts can't be edited, only removed, and a removed post keeps its number and time |
| `functions/_forum.js` | Forum categories, provinces and cities (edit here to add a category or town; keep existing ids) |
| `functions/api/forum.js` | Forum API: read topics, join with a username, start topics, reply, report, remove own posts. Rate limits: 5 topics and 30 posts an hour per member |
| `news/` | All updates page (`/news/`), linked from the ticker |
| `express-entry-2026/` | Express Entry November 2026 guide: choosing a NOC, high-wage NOC checker (IRCC list, 186 NOCs), experience and job offer points, calculator. NOC list is in the page's script (`const NOC`) |
| `privacy/`, `terms/`, `reset/` | Privacy policy, terms of use, password reset page |
| `schema.sql` | All database tables (`schema-accounts.sql` adds just the account tables) |

## Deploy on Cloudflare (one time)

1. **Create the database.** Cloudflare dashboard → Storage & Databases → D1 → Create → name it `workerpool-db`. Open it → Console → paste all of `schema.sql` → Execute.
2. **Create the site.** Workers & Pages → Create → Pages → Connect to Git → choose `gillonline01313/workerpool`.
   - Framework preset: None. Build command: leave empty. Build output directory: `/`.
   - Save and Deploy.
3. **Connect the database.** Your Pages project → Settings → Bindings → Add → D1 database → Variable name `DB` → database `workerpool-db`. Save.
4. **Set the admin key.** Settings → Variables and Secrets → Add → Type: Secret → Name `ADMIN_KEY` → a long random password only you know. Save.
5. **Redeploy** so steps 3 and 4 take effect: Deployments → latest → Retry deployment.
6. **Add the domain.** Custom domains → Set up a custom domain → `workerpool.ca` (and `www.workerpool.ca`).

Then open `https://workerpool.ca/admin/` and enter your admin key.

## Resume storage

Cloudflare → R2 Object Storage → Create bucket `workerpool-resumes` (keep it private; no public access). Then Pages project → Settings → Bindings → Add → R2 bucket → Variable name `RESUMES` → bucket `workerpool-resumes`. Run `schema-resumes.sql` in the D1 console once, then redeploy.

## B2B Data Entry portal

Run `schema-b2b.sql` in the D1 console once. Documents use the same R2 bucket as resumes (`RESUMES` binding), under `b2b/`.

## Live chat

Run `schema-chat.sql` in the D1 console once. Replies happen in the admin dashboard under **Live chat** (it checks for new messages every 5 seconds while open, and shows an unread count on the tab and in the browser tab title). `ADMIN_EMAIL` gets an email for each new chat, every message sent outside live hours, and after 10 quiet minutes on an ongoing chat. If a visitor has left the page when you reply and they gave an email, your reply is emailed to them too. Both sides can share files (PDF, JPG, PNG, DOC, DOCX up to 10 MB; visitors up to 25 per chat), stored privately in the `RESUMES` R2 bucket under `chat/`. Visitors can only open files in their own conversation. Visitors can also leave a **voice note** (up to 2 minutes) from the mic button beside the chat button or inside the chat; it joins their conversation, emails `ADMIN_EMAIL` every time, and plays in the Live chat tab (with a download link). Same hours as chat: outside 8:00 to 23:00 an email is required. Recordings are stored in the same R2 bucket under `chat/` (`functions/api/chat-voice.js`). The site's `_headers` allow the microphone on workerpool.ca only. When you change `assets/chat.js`, bump the `?v=` number on its script tags (home, `/news/`, `/express-entry-2026/`). To change the hours, edit `CHAT_OPEN`/`CHAT_CLOSE` in `functions/_lib.js` and `OPEN`/`CLOSE` in `assets/chat.js`.

## Profile Scanner

Needs a Workers AI binding: Pages project → Settings → Bindings → Add → **Workers AI** → Variable name `AI`. Save, then redeploy. Workers AI bills per use; one scan of 6 documents costs well under a cent, and the first 10,000 "neurons" a day are free.

**Payments ($9.99 CAD Scanner Pass: 30 days, up to 25 document reads, unlimited rescans).** The scanner only reads documents for visitors with a pass; the free example stays open to everyone.

1. Stripe dashboard → Developers → API keys → copy the **Secret key** (`sk_live_…`; use `sk_test_…` first to try it with Stripe's test card 4242 4242 4242 4242).
2. Pages project → Settings → Variables and Secrets → Add → Type **Secret** → Name `STRIPE_SECRET_KEY` → paste the key. Save and redeploy.
3. Optional: `STRIPE_TAX` = `on` to have Stripe Tax add GST/HST at checkout (turn on Stripe Tax and add your GST number in Stripe first).
4. Optional: `SCANNER_FREE` = `on` opens the scanner to everyone without a pass.

No webhook is needed: `functions/api/scanner/[[path]].js` confirms each payment with Stripe when the buyer returns. Buyers who lose access press **Already paid?** and get their link by email (needs `RESEND_API_KEY`). Promotion codes you create in Stripe work at checkout. The admin dashboard's **Scanner passes** tab shows sales, revenue and documents read, and **+ Free pass** creates a link that unlocks the scanner for a client. Passes live in the `scan_passes` table (created automatically): an ID, dates, amount and a document counter only. **Price and coupons:** admin dashboard → **Scanner passes**. **Change price** sets the website price (minimum $0.50; stored in the `scan_settings` table). **+ New coupon** creates a code with any discount from 1% to 100%, an optional use limit, expiry date and note; each coupon has a **Copy link** that opens the scanner with the discount applied (`/tools/profile-scanner/?coupon=CODE`). Coupons can be edited, paused, resumed or deleted, and a use is counted when its payment is confirmed (a 100% coupon unlocks without Stripe). Coupons and the admin price apply to website checkout only; the Android app's price is set in Google Play Console. The pass length and document limit are in `functions/_scanpass.js` (`PASS`).

## Android app (Google Play)

`android/` is a Trusted Web Activity: the app opens https://workerpool.ca full screen (package `ca.workerpool.app`), so every website change appears in the app straight away. GitHub Actions (`.github/workflows/android.yml`) builds it whenever `android/` changes, or on demand from the Actions tab → Android app → Run workflow.

- **Signing.** `android/upload-keystore.p12` is the upload key (alias `upload`). Add its password as the GitHub repository secret `ANDROID_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). With the secret set, each build publishes a GitHub release with the signed `.aab` (upload this to Play Console) and `.apk`. Keep a copy of the password and the key file somewhere safe; Google Play needs the same upload key for every update.
- **App links.** `/.well-known/assetlinks.json` (`functions/.well-known/assetlinks.json.js`) lists the upload key. After the first upload, copy Play Console → Test and release → App integrity → App signing key certificate → SHA-256 fingerprint into the Cloudflare variable `ANDROID_CERT_SHA256`. Without it, the app shows a browser address bar.
- **Google Play Billing.** Inside the app the Profile Scanner is sold through Google Play (in-app product `scanner_pass`, a one-time consumable) instead of Stripe. `POST /api/scanner/play` checks each purchase with the Google Play Developer API, issues the pass and consumes the purchase. It needs the Cloudflare secret `GOOGLE_PLAY_SERVICE_ACCOUNT` (the JSON key of a Google Cloud service account with the Google Play Android Developer API enabled, invited in Play Console → Users and permissions with "View financial data" and "Manage orders and subscriptions").
- **Store listing assets:** `android/store/icon-512.png` and `android/store/feature-graphic.png`. Account deletion link for the Data safety form: https://workerpool.ca/privacy/#delete-account

## Hot & New ticker

Run `schema-news.sql` in the D1 console once. Manage items in the admin dashboard under **Hot & New**: add (headline, summary, label Hot/New/Trending/Update, link, optional pin and auto-hide date), edit, **Archive** to take an item off the site, **Restore** to bring it back, and delete archived items for good. Until the first item is saved, the site shows 8 starter items about the November 2026 Express Entry changes; the **Add starter items** button saves them so you can edit or archive them. Pinned items lead the ticker; the rest are ranked by clicks weighted toward newer posts, and the two most-clicked items (10+ clicks) get a Trending label automatically. When you change `assets/ticker.js`, bump the `?v=` number on its script tags.

## Discussion forum

Run `schema-forum.sql` in the D1 console once. Members join on the forum with a username, email and password (or sign in with an existing WorkerPool account and pick a username the first time). They can sign in with either their username or their email. Moderate in the admin dashboard under **Forum**: review reports (each new report also emails `ADMIN_EMAIL`), pin, lock or hide topics, remove or restore posts, and ban members from posting. To add a category or a town, edit `functions/_forum.js`; never change an id that already has topics.

## Pathway Check tools

Run `schema-assessments.sql` in the D1 console once. Assessments a candidate agrees to share appear on the admin page under **Shared assessments**, and the first share from each candidate emails `ADMIN_EMAIL`.

To update draws or rules, edit `tools/src/prov_bc.js`, `prov_ab.js` or `prov_mb.js` (province data and scoring) or `tools/src/template.html` (shared form, Express Entry and RCIP), then run `python3 tools/src/build.py` and commit the regenerated `tools/*/index.html`.

## Email

- **Receiving** (admin@, hello@, privacy@workerpool.ca): Cloudflare → workerpool.ca → Email → Email Routing. Forward each address to your own inbox. Also add **noreply@workerpool.ca** (or turn on the catch-all) so any reply sent straight to that address still reaches you instead of bouncing.
- **Sending** (password resets, new-lead alerts): a free Resend account. Add workerpool.ca in Resend, add the DNS records it shows to Cloudflare, then create an API key.

## Settings (Pages project → Settings → Variables and Secrets)

| Name | Type | Value |
|---|---|---|
| `ADMIN_KEY` | Secret | Your admin dashboard password |
| `RESEND_API_KEY` | Secret | API key from Resend |
| `ADMIN_EMAIL` | Text | Where new-lead alerts go, e.g. admin@workerpool.ca |
| `MAIL_FROM` | Text | `WorkerPool <noreply@workerpool.ca>` |
| `REPLY_TO` | Text | Optional. Where replies to site emails go (defaults to `ADMIN_EMAIL`), e.g. your personal email |
| `SITE_URL` | Text | `https://workerpool.ca` |

Redeploy after changing settings.

## Next phases

- Delete and export tools on the admin page for privacy requests.
