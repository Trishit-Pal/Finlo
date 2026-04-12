# Finlo Gap Analysis (Phase 1 Checkpoint)

## 1. What Exists

### Frontend (React + Vite + Tailwind)
- Routing with protected app shell and auth screens is in place.
- Existing pages: landing, dashboard, upload, receipt review, transactions, budgets, bills, debts, savings, analytics, help, settings.
- Google OAuth initiation exists through Supabase client and backend OAuth callback exchange.
- Upload UI already accepts `PDF`, `JPG/JPEG`, `PNG`, `WEBP` and sends to backend.
- Receipt review-before-save flow exists (`/review/:id`) before confirmation.
- Theme + utility design tokens/components already exist (glass cards, button/input primitives).

### Backend (FastAPI + SQLAlchemy + Alembic)
- JWT auth, refresh endpoint, email/password signup/signin, OTP reset, OAuth callback endpoint.
- Core modules exist for transactions, budgets, receipts, categories, bills, debts, savings.
- OCR adapter supports image OCR + PDF text extraction/fallback OCR.
- Regex parser + optional LLM fallback already implemented for receipts.
- Encrypted storage service for uploaded binaries exists (AES-GCM at object layer).
- Security middleware exists (headers, CORS, rate-limit baseline, structured errors).
- Baseline tests and CI pipeline exist for backend and frontend.

### Data / Supabase
- Core tables for users, expenses/transactions, budgets, receipts, etc. exist.
- Supabase schema + RLS policy scripts exist.

## 2. What Is Missing vs Requested Scope

### Landing + Design Consistency
- Current landing page does not fully match requested section hierarchy:
  - missing explicit account-linking narrative,
  - trust/privacy/legal emphasis is not strong enough,
  - FAQ/help section on landing is minimal.
- UI language consistency is partial; profile/auth/budget/upload pages vary in patterns and behavior.

### Google Sign-In Profile Bootstrap + Immutability
- No dedicated first-login profile bootstrap for immutable fields.
- `username` field does not exist as a first-class immutable domain field.
- `date_of_birth` is currently editable via `/auth/me` with no lock.
- No source metadata (`manual | google | migration | admin`) for immutable profile fields.
- No DB-level immutability guard (triggers/checks) for username/DOB.

### AI Bill Scanning Pipeline
- File type/size validation exists, but no deterministic duplicate-detection stage.
- Parser does not consistently extract:
  - due date,
  - recurring indicator,
  - account/card suffix,
  - category suggestion as explicit field.
- Provider abstraction is partial (OCR abstraction exists, structuring abstraction is implicit).
- Confidence exists but not fully surfaced as field-level + duplicate context in review UX.

### Budget Rule Engine
- Budgets can currently be patched unlimited times.
- No monthly one-edit rule, no edit counters, no version snapshots/history table.
- No explicit concurrency/race handling for simultaneous budget edits.

### Multi-User Actions + Consent/Auditability
- Core user-scoped CRUD is present, but no dedicated immutable/audit logs for sensitive actions.
- No explicit consent logging layer for ingestion/integration features.

### Transaction Ingestion Feasibility / Reality
- Direct card/bank/UPI fetching is not implemented (and cannot be safely faked).
- CSV import exists; no explicit consent requirement tied to ingestion action.
- No formal feasibility matrix doc yet.

### Security Hardening
- Good baseline exists, but gaps remain:
  - immutable-field tamper resistance at DB layer,
  - consent/audit logs for regulated-like actions,
  - duplicate-processing/idempotency protections for receipt confirmation and ingestion,
  - stricter upload hardening path coverage.

## 3. Risky Areas

1. **Schema migration safety**
- Existing migration style mixes metadata-driven and batch operations; adding triggers/history tables must remain backward-safe for SQLite + PostgreSQL.

2. **Auth/profile contract changes**
- Adding immutable `username` and source metadata impacts frontend `User` typing, settings forms, and OAuth bootstrap behavior.

3. **Receipt pipeline changes**
- Introducing duplicate detection and additional extracted fields changes upload + review + confirm contracts and tests.

4. **Budget edit governance**
- One-edit rule and versioning can break current budget UX if frontend is not updated in lockstep.

5. **Integration expectations**
- User asks for bank/card/UPI fetching; real-world limits (compliance/provider/API access) require explicit scope boundaries and feature flags.

## 4. Recommended Implementation Order

1. Additive DB migration layer:
- immutable profile fields + source metadata,
- budget edit counters + snapshot history,
- receipt metadata for duplicate detection and enriched extraction,
- consent and audit log tables.

2. Backend rules first (source-of-truth):
- immutability enforcement in auth/profile API + DB triggers,
- budget single-edit logic + concurrency guard,
- receipt duplicate detection + enriched parsing + idempotency controls,
- consent capture and ingestion option endpoints.

3. Frontend integration:
- profile bootstrap flow + immutable UX states,
- updated landing section hierarchy and trust/privacy emphasis,
- updated review/upload/budget UI for new backend contract.

4. Tests and validation:
- new backend integration tests for immutability, budget edit limit, duplicate detection, consent flow.

5. Documentation + rollout:
- integration feasibility matrix,
- security review + feature flag rollout plan.

## 5. Feature Flags Needed

- `FEATURE_TRANSACTION_SYNC_EXPERIMENTAL` (default `false`)
  - gates non-manual ingestion pathways beyond CSV/PDF statement import.
- `FEATURE_BANK_AGGREGATOR_CONNECT` (default `false`)
  - protects any future aggregator integration.
- `FEATURE_EMAIL_STATEMENT_PARSE` (default `false`)
  - deferred until compliance + parser hardening.

## 6. Checkpoint Conclusion

- Audit completed across frontend, backend, auth, DB schema, APIs, storage, env setup, tests, and deployment config.
- Project has strong baseline; requested outcomes require additive schema + policy-layer upgrades more than full rewrites.
- Major refactor will proceed in controlled phases with backend-source-of-truth enforcement, then frontend adaptation.
