# Deployment and Security Runbook (Free Tier)

## 1) Vercel (Frontend)
- Import repository in Vercel.
- Set project root to `frontend`.
- Configure env vars:
  - `VITE_API_URL`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Enable Preview Deployments for non-main branches.

## 2) Supabase (Auth + Postgres)
- Create a new free project.
- Set strong database password.
- Run SQL scripts:
  - `supabase/schema.sql`
  - `supabase/rls_policies.sql`
- Configure Auth providers (email, optional Google OAuth).
- Keep `service_role` key only on backend secrets.

## 3) Cloudflare (DNS + Security)
- Add domain to Cloudflare and switch nameservers.
- Enable proxy (orange cloud) for frontend and API hostnames.
- SSL/TLS mode: `Full (strict)`.
- Enable WAF managed rules.
- Add rate limiting:
  - `/auth/*` (strict)
  - upload routes (`/receipts/*` or equivalent)
- Add Turnstile challenge to signup/signin/reset/upload forms.

## 4) Rollout checklist
- Stage first on preview environment.
- Validate:
  - `GET /health`
  - signup/signin/signout
  - receipt upload
  - dashboard load
- Promote to production after smoke checks pass.

## 5) Rollback
- Keep previous stable backend image tag.
- Keep previous Vercel deployment.
- Revert DNS record or disable recent WAF/rate-limit rule if blocking valid traffic.
