# Finlo — Production Deployment Steps
> Delete this file after completing all steps.
> All code changes are already committed. This is purely your action checklist.

---

## Before You Start

Open a password manager. Every secret you generate below must be saved there permanently.
Some keys (PII_ENCRYPTION_KEY, STORAGE_ENCRYPTION_KEY) can **never** be rotated after
data exists without a full database migration.

---

## Phase 1 — Generate Secrets (5 min, terminal only)

Run each command, copy the output into your password manager under "Finlo Production Secrets".

### 1.1 JWT_SECRET
```bash
openssl rand -hex 32
```
Save as → `JWT_SECRET`

### 1.2 PII_ENCRYPTION_KEY
```bash
cd C:/Users/trish/OneDrive/Desktop/Projects/ExpenseTrackerApp/backend
.venv/Scripts/python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Save as → `PII_ENCRYPTION_KEY`
> **Warning:** If you lose this key, all encrypted mobile numbers in the database become permanently unreadable.

### 1.3 STORAGE_ENCRYPTION_KEY
```bash
openssl rand -hex 32
```
Save as → `STORAGE_ENCRYPTION_KEY`
> **Warning:** If you lose this key, all uploaded receipt images become permanently unreadable.

### 1.4 CRON_SECRET
```bash
openssl rand -hex 32
```
Save as → `CRON_SECRET`

---

## Phase 2 — Supabase Dashboard (15 min)

Go to → **[app.supabase.com](https://app.supabase.com)** → select your project.

### 2.1 Enable pgvector extension
> Database → Extensions → search "vector" → toggle ON

Must be done **before** running Alembic migrations or they will fail.

### 2.2 Collect your API keys
> Settings → API

Copy and save:
| Label in dashboard | Save as env var |
|---|---|
| Project URL | `SUPABASE_URL` |
| `anon` `public` key | `SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |
| JWT Secret | `SUPABASE_JWT_SECRET` |

### 2.3 Get your database connection string
> Settings → Database → Connection string → Session pooler tab (port 6543)

Copy the URI. Replace `[YOUR-PASSWORD]` with your DB password.
Save as → `DATABASE_URL`

Format:
```
postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

### 2.4 Set Auth redirect URLs
> Authentication → URL Configuration

- **Site URL** → `https://YOUR-APP.vercel.app`
- **Redirect URLs** → Add `https://YOUR-APP.vercel.app/**`

### 2.5 Apply RLS policies *(critical — protects user data isolation)*
> SQL Editor → New query

Paste the **entire contents** of this file and click Run:
```
supabase/rls_policies.sql
```

Then paste and run this second file:
```
supabase/migrations/20260412_align_schema.sql
```

**Verify:** Table Editor → click each table → confirm "RLS enabled" badge is shown.

---

## Phase 3 — Google OAuth (10 min)

Go to → **[console.cloud.google.com](https://console.cloud.google.com)**

### 3.1 Create OAuth 2.0 credentials
> APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
> - Application type: **Web application**
> - Name: `Finlo Production`
> - Authorized JavaScript origins:
>   - `https://YOUR-APP.vercel.app`
> - Authorized redirect URIs:
>   - `https://YOUR-APP.vercel.app/auth/callback`
>   - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

Click Create. Copy both values:
- Client ID → save as `OAUTH_GOOGLE_CLIENT_ID`
- Client Secret → save as `OAUTH_GOOGLE_CLIENT_SECRET`

### 3.2 Enable Google provider in Supabase
> Supabase → Authentication → Providers → Google → Enable

Paste in `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET` from above.
Click Save.

---

## Phase 4 — Redis via Upstash (5 min)

Go to → **[upstash.com](https://upstash.com)** → Create account → Create Database

- Type: Redis
- Region: same region as your Render backend (e.g., `us-east-1`)
- Enable TLS: YES

Copy the connection URL from the dashboard.
Save as → `REDIS_URL`

Format:
```
rediss://default:<password>@<region>.upstash.io:6379
```

---

## Phase 5 — Object Storage (10 min)

### Option A — AWS S3 (recommended for scale)

**Step 5A.1** — Go to [aws.amazon.com](https://aws.amazon.com) → S3 → Create bucket
- Name: `finance-receipts`
- Region: same as backend
- Block all public access: **ON**

**Step 5A.2** — IAM → Users → Create user → Attach policy: `AmazonS3FullAccess`
> (Scope to just the `finance-receipts` bucket ARN for least privilege)

**Step 5A.3** — Create access key for the IAM user. Save:
```
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_ACCESS_KEY=<IAM access key ID>
STORAGE_SECRET_KEY=<IAM secret access key>
STORAGE_BUCKET=finance-receipts
STORAGE_REGION=us-east-1
```

### Option B — Supabase Storage (simpler, already have Supabase)

> Supabase → Storage → New bucket
- Name: `finance-receipts`
- Public: **OFF** (private)

> Settings → Storage → S3 credentials → Generate new credentials

Save:
```
STORAGE_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
STORAGE_ACCESS_KEY=<storage access key ID>
STORAGE_SECRET_KEY=<storage secret>
STORAGE_BUCKET=finance-receipts
STORAGE_REGION=us-east-1
```

---

## Phase 6 — Twilio SMS OTP (15 min)

This enables real SMS for password-reset OTP. Skip if you want to disable OTP at launch.

### 6.1 Create Twilio account
Go to → **[twilio.com](https://www.twilio.com)** → Sign up

### 6.2 Get a phone number
> Console → Phone Numbers → Get a Phone Number
> Choose a number with SMS capability.

### 6.3 Collect credentials
> Console Dashboard → copy:
- Account SID → save as `TWILIO_ACCOUNT_SID`
- Auth Token → save as `TWILIO_AUTH_TOKEN`
- Your phone number → save as `TWILIO_FROM_NUMBER` (format: `+14155551234`)

### 6.4 Set env vars
```
OTP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=<from above>
TWILIO_AUTH_TOKEN=<from above>
TWILIO_FROM_NUMBER=<from above>
```

> If skipping Twilio for now: leave `OTP_PROVIDER=mock` but be aware OTP codes will appear in server logs.

---

## Phase 7 — Sentry Error Monitoring (optional, 5 min)

Go to → **[sentry.io](https://sentry.io)** → Create account → New Project → Python → FastAPI

Copy the DSN from the setup page.
Save as → `SENTRY_DSN`

Format: `https://<key>@<org>.ingest.sentry.io/<project-id>`

---

## Phase 8 — Gemini API Key for AI Features (5 min)

Go to → **[ai.google.dev](https://ai.google.dev)** → Get API key → Create API key in new project

Save as:
```
LLM_PROVIDER_KEY=<your-key>
EMBEDDING_PROVIDER_KEY=<your-key>   # same key is fine
LLM_PROVIDER_MODEL=gemini-2.0-flash
LLM_PROVIDER_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
EMBEDDING_PROVIDER_MODEL=text-embedding-004
EMBEDDING_PROVIDER_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```

---

## Phase 9 — Deploy Backend to Render (20 min)

Go to → **[render.com](https://render.com)** → New → Web Service → Connect GitHub repo

### 9.1 Service settings
| Field | Value |
|---|---|
| Root directory | `backend` |
| Environment | `Python 3` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Pre-deploy command | `alembic upgrade head` |
| Plan | Starter ($7/mo) minimum for always-on |

### 9.2 Add ALL environment variables under Environment tab

Copy every value you saved in Phases 1–8:

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Phase 2.3 |
| `JWT_SECRET` | Phase 1.1 |
| `PII_ENCRYPTION_KEY` | Phase 1.2 |
| `STORAGE_ENCRYPTION_KEY` | Phase 1.3 |
| `CRON_SECRET` | Phase 1.4 |
| `BACKEND_CORS_ORIGINS` | `https://YOUR-APP.vercel.app` |
| `SUPABASE_URL` | Phase 2.2 |
| `SUPABASE_ANON_KEY` | Phase 2.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 2.2 |
| `SUPABASE_JWT_SECRET` | Phase 2.2 |
| `OAUTH_GOOGLE_CLIENT_ID` | Phase 3.1 |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Phase 3.1 |
| `REDIS_URL` | Phase 4 |
| `STORAGE_ENDPOINT` | Phase 5 |
| `STORAGE_ACCESS_KEY` | Phase 5 |
| `STORAGE_SECRET_KEY` | Phase 5 |
| `STORAGE_BUCKET` | `finance-receipts` |
| `STORAGE_REGION` | `us-east-1` |
| `OTP_PROVIDER` | `twilio` (or `mock` if skipping Phase 6) |
| `TWILIO_ACCOUNT_SID` | Phase 6.3 |
| `TWILIO_AUTH_TOKEN` | Phase 6.3 |
| `TWILIO_FROM_NUMBER` | Phase 6.3 |
| `SENTRY_DSN` | Phase 7 |
| `LLM_PROVIDER_KEY` | Phase 8 |
| `EMBEDDING_PROVIDER_KEY` | Phase 8 |
| `LLM_PROVIDER_MODEL` | `gemini-2.0-flash` |
| `LLM_PROVIDER_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `EMBEDDING_PROVIDER_MODEL` | `text-embedding-004` |
| `EMBEDDING_PROVIDER_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |

### 9.3 Deploy
Click "Create Web Service". Watch the deploy log.

First deploy runs `alembic upgrade head` automatically (all 7 migrations). Confirm you see:
```
INFO  [alembic.runtime.migration] Running upgrade ... -> ..., <migration name>
```
7 times, then the uvicorn startup line.

### 9.4 Promote yourself to admin
After the service is live and you've created your account via the app:

Option A — Supabase SQL Editor:
```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

Option B — psql via DATABASE_URL:
```bash
psql "postgresql+asyncpg://..." -c "UPDATE users SET is_admin=true WHERE email='your@email.com';"
```

### 9.5 Save your Render Deploy Hook URL
> Render → your service → Settings → Deploy Hooks → Create hook
> Copy URL → save as `RENDER_DEPLOY_HOOK_URL` (needed for Phase 11)

---

## Phase 10 — Deploy Frontend to Vercel (10 min)

Go to → **[vercel.com](https://vercel.com)** → Add New → Project → Import from GitHub

### 10.1 Project settings
| Field | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `dist` |

### 10.2 Add environment variables
> Settings → Environment Variables → add all three:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://YOUR-BACKEND.onrender.com` |
| `VITE_SUPABASE_URL` | Phase 2.2 |
| `VITE_SUPABASE_ANON_KEY` | Phase 2.2 |
| `VITE_POSTHOG_KEY` | optional — from posthog.com |

### 10.3 Redeploy
After adding env vars: Deployments → "..." → Redeploy (env vars only inject at build time).

### 10.4 Save your Vercel deploy hook
> Vercel → Project → Settings → Git → Deploy Hooks → Add hook → name it "GitHub Actions"
> Copy the URL. The ID is the last path segment: `.../v1/integrations/deploy/<ID>`
> Save as `VERCEL_DEPLOY_HOOK_ID`

---

## Phase 11 — Wire GitHub Actions CI/CD (10 min)

Go to → **GitHub → your repo → Settings → Secrets and variables → Actions**

Add three repository secrets:

| Secret name | Value |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Phase 9.5 |
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens → Create token |
| `VERCEL_DEPLOY_HOOK_ID` | Phase 10.4 |

From now on: every push to `main` that passes all CI checks will automatically deploy
to both Render (backend) and Vercel (frontend).

---

## Phase 12 — Set Up Daily Cron Job (5 min)

The `/cron/bill-reminders` endpoint must run daily at 8 AM IST (2:30 AM UTC).

### Option A — Render Cron Job (same account, easiest)
> Render → New → Cron Job
- Command: `curl -X POST https://YOUR-BACKEND.onrender.com/cron/bill-reminders -H "x-cron-secret: <CRON_SECRET>"`
- Schedule: `30 2 * * *` (2:30 AM UTC = 8 AM IST)

### Option B — GitHub Actions Schedule
Add to `.github/workflows/ci.yml`:
```yaml
  cron-daily:
    name: Daily Bill Reminders
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Trigger bill reminders
        run: |
          curl -X POST ${{ secrets.BACKEND_URL }}/cron/bill-reminders \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```
And add to the `on:` block:
```yaml
  schedule:
    - cron: '30 2 * * *'
```
Add `BACKEND_URL` and `CRON_SECRET` as GitHub Actions secrets.

### Option C — Upstash QStash (recommended, free tier)
> [upstash.com](https://upstash.com) → QStash → Create schedule
- URL: `https://YOUR-BACKEND.onrender.com/cron/bill-reminders`
- Method: POST
- Headers: `x-cron-secret: <CRON_SECRET>`
- Schedule: `30 2 * * *`

---

## Phase 13 — Post-Deploy Verification (10 min)

Run each check from your local terminal after all services are live:

### 13.1 Backend health
```bash
curl https://YOUR-BACKEND.onrender.com/health
# Expected: {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```

### 13.2 Swagger is hidden (production mode)
```bash
curl -o /dev/null -w "%{http_code}" https://YOUR-BACKEND.onrender.com/docs
# Expected: 404
```

### 13.3 CORS is locked down
```bash
curl -H "Origin: https://evil.com" https://YOUR-BACKEND.onrender.com/health -I
# Expected: NO Access-Control-Allow-Origin header in response
```

### 13.4 Cron endpoint works
```bash
curl -X POST https://YOUR-BACKEND.onrender.com/cron/bill-reminders \
  -H "x-cron-secret: <your CRON_SECRET>"
# Expected: {"notifications_created":0,"snapshots":0,...}
```

### 13.5 Frontend loads and Supabase auth works
- Open `https://YOUR-APP.vercel.app` in browser
- Sign up with email → confirm OTP arrives (or check logs if still on mock)
- Sign in → dashboard loads with no console errors
- Try Google sign-in

### 13.6 Receipt upload works
- Log in → Transactions → Add → upload a receipt image
- Confirm it saves without error (tests object storage + encryption)

### 13.7 AI coach works
- Navigate to any AI suggestion feature
- Confirm response is generated (tests LLM_PROVIDER_KEY)

---

## Quick Reference — Full Secrets List

| Variable | Phase | Status |
|---|---|---|
| `JWT_SECRET` | 1.1 | generate |
| `PII_ENCRYPTION_KEY` | 1.2 | generate (permanent) |
| `STORAGE_ENCRYPTION_KEY` | 1.3 | generate (permanent) |
| `CRON_SECRET` | 1.4 | generate |
| `SUPABASE_URL` | 2.2 | Supabase dashboard |
| `SUPABASE_ANON_KEY` | 2.2 | Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | 2.2 | Supabase dashboard |
| `SUPABASE_JWT_SECRET` | 2.2 | Supabase dashboard |
| `DATABASE_URL` | 2.3 | Supabase dashboard |
| `OAUTH_GOOGLE_CLIENT_ID` | 3.1 | GCP console |
| `OAUTH_GOOGLE_CLIENT_SECRET` | 3.1 | GCP console |
| `REDIS_URL` | 4 | Upstash dashboard |
| `STORAGE_ENDPOINT` | 5 | AWS/Supabase |
| `STORAGE_ACCESS_KEY` | 5 | AWS/Supabase |
| `STORAGE_SECRET_KEY` | 5 | AWS/Supabase |
| `TWILIO_ACCOUNT_SID` | 6.3 | Twilio console |
| `TWILIO_AUTH_TOKEN` | 6.3 | Twilio console |
| `TWILIO_FROM_NUMBER` | 6.3 | Twilio console |
| `SENTRY_DSN` | 7 | sentry.io |
| `LLM_PROVIDER_KEY` | 8 | ai.google.dev |
| `EMBEDDING_PROVIDER_KEY` | 8 | ai.google.dev |
| `RENDER_DEPLOY_HOOK_URL` | 9.5 | Render dashboard |
| `VERCEL_TOKEN` | 11 | Vercel account settings |
| `VERCEL_DEPLOY_HOOK_ID` | 10.4 | Vercel project settings |

---

## Known Acceptable Gaps

These are documented limitations that do not block launch:

| Gap | Status | Impact |
|---|---|---|
| 4 npm high-severity vulns | No upstream fix available | Dev-only build tools, zero runtime exposure |
| FCM push notifications | Not implemented | Bill alerts are in-app only, no mobile push |
| PostHog analytics | Optional | Leave `VITE_POSTHOG_KEY` blank to skip |

---

*Delete this file after completing all phases.*
