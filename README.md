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
| `functions/api/tools/assessment.js` | Saves an assessment the candidate agreed to share (one per province per account) and emails the admin |
| `assets/chat.js` | Live chat widget (on the home page; add the same script tag to any other page) |
| `functions/api/chat.js` | Live chat for visitors. Live 8:00 to 23:00 Edmonton time daily; outside those hours it takes a message plus email |
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

Run `schema-chat.sql` in the D1 console once. Replies happen in the admin dashboard under **Live chat** (it checks for new messages every 5 seconds while open, and shows an unread count on the tab and in the browser tab title). `ADMIN_EMAIL` gets an email for each new chat, every message sent outside live hours, and after 10 quiet minutes on an ongoing chat. If a visitor has left the page when you reply and they gave an email, your reply is emailed to them too. To change the hours, edit `CHAT_OPEN`/`CHAT_CLOSE` in `functions/_lib.js` and `OPEN`/`CLOSE` in `assets/chat.js`.

## Pathway Check tools

Run `schema-assessments.sql` in the D1 console once. Assessments a candidate agrees to share appear on the admin page under **Shared assessments**, and the first share from each candidate emails `ADMIN_EMAIL`.

To update draws or rules, edit `tools/src/prov_bc.js`, `prov_ab.js` or `prov_mb.js` (province data and scoring) or `tools/src/template.html` (shared form, Express Entry and RCIP), then run `python3 tools/src/build.py` and commit the regenerated `tools/*/index.html`.

## Email

- **Receiving** (admin@, hello@, privacy@workerpool.ca): Cloudflare → workerpool.ca → Email → Email Routing. Forward each address to your own inbox.
- **Sending** (password resets, new-lead alerts): a free Resend account. Add workerpool.ca in Resend, add the DNS records it shows to Cloudflare, then create an API key.

## Settings (Pages project → Settings → Variables and Secrets)

| Name | Type | Value |
|---|---|---|
| `ADMIN_KEY` | Secret | Your admin dashboard password |
| `RESEND_API_KEY` | Secret | API key from Resend |
| `ADMIN_EMAIL` | Text | Where new-lead alerts go, e.g. admin@workerpool.ca |
| `MAIL_FROM` | Text | `WorkerPool <noreply@workerpool.ca>` |
| `SITE_URL` | Text | `https://workerpool.ca` |

Redeploy after changing settings.

## Next phases

- Delete and export tools on the admin page for privacy requests.
