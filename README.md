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
| `schema.sql` | Database tables |

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

## Next phases

- Real accounts (sign-up, sign-in, password reset) instead of device-only sign-in.
- Resume file storage (currently only the file name is saved).
- Admin email on each new profile or interest registration.
- Privacy policy and terms pages.
