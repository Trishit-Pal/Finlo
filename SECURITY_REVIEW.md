# SECURITY_REVIEW.md

## Summary
This review covers security hardening completed during the Finlo upgrade scope: auth/profile integrity, upload safety, consent/auditability, transaction ingestion safeguards, and budget/receipt data integrity controls.

## Completed Security Improvements

### 1. Immutable profile identity fields
- Added immutable profile fields and metadata:
  - `users.username`
  - `users.username_source`
  - `users.date_of_birth_source`
- Enforced set-once semantics at multiple layers:
  - Frontend lock state (profile bootstrap/settings)
  - API conflict checks (`/auth/me`)
  - DB-level triggers (SQLite + PostgreSQL) to block mutation after set

### 2. Consent logging and enforcement
- Added `user_consents` table with grant/revoke timestamps.
- Added consent APIs for explicit scope control.
- Enforced consent for statement imports (`/transactions/import`).
- Added integrations options endpoint to avoid misleading unsupported capabilities.

### 3. Auditability
- Added `audit_logs` table.
- Added best-effort audit event logging on critical operations:
  - profile updates
  - budget create/update/delete
  - receipt upload/confirm/delete
  - transaction create/update/delete/import
  - consent updates
- Sensitive metadata keys are masked before audit persistence (`password`, tokens, card-sensitive keys).

### 4. Upload hardening and receipt integrity
- Enforced upload MIME/type restrictions and max size limits.
- Added source hashing and duplicate detection (`receipts.source_hash`).
- Added duplicate linkage metadata (`duplicate_of_receipt_id`, `duplicate_confidence`).
- Kept review-before-save confirmation flow.

### 5. Receipt processing integrity
- Added enriched extraction fields:
  - `due_date`
  - `category_suggestion`
  - `recurring_indicator`
  - `account_suffix`
  - `parser_provider`
- Confirm flow is idempotent for transaction creation per receipt (prevents duplicate transaction insertion from repeated confirms).

### 6. Budget data integrity and governance
- Added budget governance fields:
  - `edit_count`
  - `version`
  - `last_edited_at`
- Added `budget_versions` snapshots for audit/history.
- Enforced one-edit-per-month-budget-row rule in backend source of truth.
- Added row-lock path (`FOR UPDATE` on non-SQLite) to reduce concurrent edit race windows.

### 7. Config/feature-flag hardening
- Added feature flags for risky ingestion paths:
  - `FEATURE_TRANSACTION_SYNC_EXPERIMENTAL`
  - `FEATURE_BANK_AGGREGATOR_CONNECT`
  - `FEATURE_EMAIL_STATEMENT_PARSE`
- Added flags to `.env.example`.

## Validation Evidence

### Backend tests
- Full backend suite passed after changes:
  - `62 passed`
- Added targeted tests for:
  - immutable username/DOB lock behavior
  - budget one-edit rule + history
  - consent-gated CSV import
  - receipt duplicate detection + confirm idempotency

### Frontend checks
- TypeScript build check passed: `npx tsc -b`
- `vite build` could not be completed in this environment due `spawn EPERM` from toolchain process spawning, not TypeScript errors.

## Remaining Risks / Gaps

1. Provider-side compliance dependencies
- Bank aggregator and email parsing remain gated because production-safe rollout requires provider contracts/legal/compliance controls.

2. Rate-limit granularity
- Global + endpoint limits exist; ingestion endpoints may need stricter per-user/per-scope throttling in production.

3. Log retention and monitoring policy
- Audit logs are persisted, but retention/SIEM export policies should be defined by environment and compliance requirements.

4. Frontend build environment issue
- `vite build` currently blocked by host permission issue (`spawn EPERM`) and should be re-validated in CI/clean environment.

## Recommended Next Hardening Steps

1. Add background anomaly checks
- Repeated duplicate upload attempts
- Suspicious import frequency spikes

2. Add stricter validation contracts
- Optional regex/date normalization guardrails for profile and receipt dates.

3. Harden runtime observability
- Centralized alerting on auth conflicts, consent revocations, and import failures.

4. Add DB migration smoke tests in CI
- Ensure trigger behavior parity between SQLite test and PostgreSQL production environments.
