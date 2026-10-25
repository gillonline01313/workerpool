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
| `functions/api/b2b/*` | B2B applications: create, save, upload documents, submit (emails admin) |
| `tools/bc/` | BC Pathway Check: disclaimer, sign-up, CRS / FSW / BC PNP SIRS / RCIP community scores, 2026 draws (draw data at the top of the script) |
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
