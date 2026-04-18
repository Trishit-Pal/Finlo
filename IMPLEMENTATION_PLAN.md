# Finlo Implementation Plan (Phase 1 Checkpoint)

## Scope Commitments

- Preserve existing functionality; prefer additive changes.
- Enforce critical rules at backend/database source of truth.
- Use feature flags for risky or partially feasible integrations.
- Do not claim unsupported direct UPI/card/bank capabilities.

## Phase Plan

### Phase 2: Landing + UI Consistency
1. Refactor landing to single responsive structure:
   - hero,
   - product overview,
   - user actions,
   - budgeting,
   - AI bill scanning,
   - trust/privacy/legal emphasis,
   - CTA + FAQ/help.
2. Introduce/standardize shared UI tokens/components for consistency across:
   - auth,
   - dashboard,
   - profile/settings,
   - budgets,
   - upload/review.
3. Keep accessibility/performance constraints:
   - semantic headings/landmarks,
   - focus-visible states,
   - reduced heavy effects on mobile.

### Phase 3: Auth + Profile Immutability
1. Add DB fields for immutable profile data and source metadata:
   - `username`,
   - `username_source`,
   - `date_of_birth_source`.
2. Add DB-level guard (trigger-based, where feasible) to prevent updates once set.
3. Backend profile update logic:
   - allow set-once behavior,
   - reject later mutation with clear conflict error.
4. Google OAuth bootstrap:
   - import only available profile fields (name/avatar/email),
   - never assume DOB; set only if provider explicitly returns one.
5. Frontend bootstrap flow:
   - force first-login completion for required immutable fields,
   - render immutable fields as locked after first set/import.

### Phase 4: AI Bill Scanning Pipeline
1. Harden upload pipeline:
   - MIME/size enforcement,
   - secure file handling,
   - hash generation for duplicate detection.
2. Extend extraction contract:
   - merchant,
   - amount,
   - date,
   - due date,
   - category suggestion,
   - recurring indicator,
   - account/card suffix (if present),
   - confidence metadata.
3. Duplicate detection:
   - exact hash match + metadata heuristics.
4. Preserve review-before-save workflow with duplicate warning context.
5. Keep OCR/AI provider boundaries clean via service abstraction.

### Phase 5: Budget Rule Engine
1. Add budget governance fields:
   - edit count,
   - last edited at,
   - version.
2. Add snapshot/version history table for budget edits.
3. Enforce one edit per month (backend source of truth).
4. Handle timezone + rollover + concurrent update attempts.
5. Update frontend budget UX to reflect lock status and edit availability.

### Phase 6: Transaction Ingestion Feasibility + Safe Options
1. Add explicit consent logging model/API.
2. Implement realistic ingestion paths only:
   - CSV statement import (existing),
   - PDF statement parse (safe draft/review flow).
3. Add ingestion options endpoint with capability flags.
4. Document non-feasible direct rails (bank/card/UPI) without supported provider/compliance path.

### Phase 7: Security Hardening
1. Add audit logging for critical actions:
   - profile immutable-field set,
   - budget edit attempts/denials,
   - upload/confirm flows,
   - ingestion consent events.
2. Strengthen input validation and duplicate/idempotency protections.
3. Ensure masked/safe logging and no sensitive leakage in errors.
4. Add/update env docs for new flags and secrets.

### Phase 8: Final Validation
1. Update and run backend tests.
2. Run frontend lint/build.
3. Verify migration safety and rollout order.
4. Produce final docs:
   - `SECURITY_REVIEW.md`,
   - `INTEGRATION_FEASIBILITY.md`.

## Migration/Rollout Order

1. Deploy additive DB migration first.
2. Deploy backend with backward-compatible response extensions.
3. Deploy frontend consuming new fields/endpoints.
4. Enable experimental ingestion features only via feature flags.

## Feature Flags

- `FEATURE_TRANSACTION_SYNC_EXPERIMENTAL=false`
- `FEATURE_BANK_AGGREGATOR_CONNECT=false`
- `FEATURE_EMAIL_STATEMENT_PARSE=false`

## Testing Strategy

- Backend integration tests:
  - immutable username/DOB lock,
  - OAuth bootstrap behavior,
  - budget one-edit rule + edge cases,
  - receipt duplicate detection metadata,
  - consent/audit endpoints.
- Frontend:
  - build/lint pass,
  - manual route checks for landing/bootstrap/upload/budget/settings flows.

## Checkpoint Status

- Audit complete.
- Plan defined.
- Proceeding to implementation with additive schema + backend enforcement first.
