# Supabase Setup

This project uses a hybrid backend:
- Supabase Auth + Postgres
- FastAPI business APIs

## Apply schema and policies

Run these scripts in Supabase SQL Editor in order:
1. `schema.sql`
2. `rls_policies.sql`

## Notes
- Keep service-role key only in backend secret store.
- Frontend must use anon key only.
- If JWT validation is local in backend, set `SUPABASE_JWT_SECRET`.
