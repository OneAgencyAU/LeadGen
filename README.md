# SA Lead Generation & Email Automation

Automated cold outreach system for ONE AGENCY / toolr.ai. Runs Tuesday–Friday at 8:00am Adelaide time, scrapes SA businesses from Google Maps, qualifies them by web presence, generates personalised emails via Claude, and pushes drafts to Gmail for manual review.

**Nothing is sent automatically. Alex reviews and sends every draft manually.**

---

## How it works

1. **Scrape** — Apify Google Maps Scraper finds SA businesses across trades, automotive, hospitality, and professional services
2. **Deduplicate** — Supabase table ensures no business is ever contacted twice
3. **Qualify** — each business is checked: no website, broken site, not mobile-friendly, or pre-2016
4. **Match portfolio** — Google Sheets portfolio is loaded; closest matching project referenced in the email
5. **Generate** — Claude writes a short, warm, Australian-voiced cold email personalised to the business
6. **Draft** — Email lands in alex@toolr.ai Gmail inbox as a draft by 8:30am, ready to review

---

## Setup

### 1. Supabase

Create a new Supabase project (or use an existing ONE AGENCY project). Run the migration:

```sql
-- In the Supabase SQL editor:
-- paste contents of supabase/migrations/001_initial.sql
```

### 2. Google Sheets — Portfolio

Set up a Google Sheet with these columns:
| A | B | C | D |
|---|---|---|---|
| Business / Project Name | Niche / Industry | Website URL | Description (optional) |

Share the sheet with your service account email (e.g. `leadgen@your-project.iam.gserviceaccount.com`).

### 3. Gmail OAuth2 — one-time setup (run locally)

Before deploying to Railway, run this once on your local machine to get the refresh token:

```bash
# Set env vars first
export GMAIL_CLIENT_ID=your-client-id
export GMAIL_CLIENT_SECRET=your-client-secret

npm run setup-gmail
```

Visit the URL it prints, authorise as `alex@toolr.ai`, then copy the `GMAIL_REFRESH_TOKEN` it returns and add it to Railway.

**Google Cloud setup required:**
- Enable Gmail API in your Google Cloud project
- Create OAuth 2.0 credentials (Desktop app type)
- Add `http://localhost:3000/oauth2callback` as an authorised redirect URI

### 4. Railway deployment

1. Create a new Railway project and connect this repo
2. Add all environment variables from `.env.example`
3. Set `TZ=Australia/Adelaide` — this is critical for the cron to fire at the right time
4. Deploy — Railway will run `npm start` which starts the cron scheduler

Railway free tier keeps Node.js processes alive for always-on services. If you hit sleep limits, upgrade to the Hobby plan ($5/month).

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `APIFY_API_KEY` | Apify API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (not anon key) |
| `GMAIL_CLIENT_ID` | Google OAuth2 client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN` | Long-lived refresh token (from setup script) |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT` | Full service account JSON (single env var) |
| `PORTFOLIO_SHEET_ID` | Google Sheet ID from the portfolio sheet URL |
| `TZ` | `Australia/Adelaide` — required for correct cron timing |
| `DAILY_LEAD_CAP` | `20` — change this single value to scale volume |

---

## Running manually

To trigger a pipeline run immediately (useful for testing):

```bash
node src/run.js
```

---

## Scaling

Volume is controlled by `DAILY_LEAD_CAP`:

| Phase | Cap | When |
|-------|-----|------|
| 1 | 20/day | Initial — validate tone, track replies |
| 2 | 50/day | Once reply rate confirmed positive |
| 3 | 100+/day | Expand categories/geo as needed |

---

## Data schema

See `supabase/migrations/001_initial.sql` for the full schema.

Key table: `scraped_businesses`
- Every business ever scraped is stored — deduplication is permanent
- `status` tracks: `scraped → qualified / not_qualified / no_email → emailed`

---

## Notes on Gmail auth

The `GMAIL_REFRESH_TOKEN` is a long-lived token that allows the app to create drafts on behalf of `alex@toolr.ai` without user interaction. It does not expire unless:
- You revoke it in Google Account settings
- The OAuth2 app is deleted
- It goes unused for 6+ months

If the token expires, re-run `npm run setup-gmail` locally and update the Railway env var.
