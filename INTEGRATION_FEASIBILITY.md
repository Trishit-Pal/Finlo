# INTEGRATION_FEASIBILITY.md

## Scope
This assessment covers realistic transaction ingestion options for:
- Credit/debit card expenses
- Bank account transactions
- UPI-related flows

The implementation intentionally avoids claiming unsupported direct rails.

## Feasibility Matrix

| Option | Feasibility | Current Status in Finlo | Consent Requirement | Notes |
|---|---|---|---|---|
| CSV statement import | High | Implemented | Required (`statement_import`) | Backend import endpoint enforces explicit consent before ingestion. |
| PDF statement import | Medium | Partial | Required (`statement_import`) | OCR/parser pipeline supports PDF extraction but issuer-specific normalization is still variable. |
| Bank aggregator (provider API) | Medium (with contracts/compliance) | Not implemented (feature-gated) | Required (`aggregator_link`) | Needs provider onboarding, tokenized account linking, legal/compliance controls. |
| Direct card network pull | Low | Not implemented | Required | Not available as a generic direct consumer pull path in this stack. |
| Direct UPI transaction pull | Low | Not implemented | Required | No universal secure public API path for direct end-user UPI feed pull here. |
| Email statement parsing | Medium | Not implemented (feature-gated) | Required (`email_parse`) | Requires mailbox-scope OAuth + secure parsing pipeline hardening. |
| SMS parsing (mobile device) | Medium | Partial concept only | Required (`sms_parse`) | Feasible on-device in Android with runtime permission; not part of web backend ingestion. |
| Manual entry | High | Implemented | Not required | Baseline fallback always available. |
| Receipt scan (PDF/image) -> draft expense | High | Implemented | Not required | Upload + extraction + review-before-save is active. |

## Implemented in This Upgrade

1. Consent model and APIs
- Added `user_consents` table and service methods.
- Added consent endpoints at `/integrations/consents`.
- Added ingestion options endpoint at `/integrations/transaction-ingestion/options`.

2. Safe gating of imports
- CSV import now requires explicit `statement_import` consent.
- Integration options expose realistic capability status (`implemented`, `partial`, `gated`, `blocked`).

3. Frontend consent controls
- Added Integrations settings section to review options and grant/revoke consent scopes.
- Added transaction CSV import UX with consent-first flow.

## Blocked / Not Feasible Without External Dependencies

1. Direct UPI/card universal ingestion
- Blocked by ecosystem/API/compliance realities for this architecture.
- Not implemented and not faked.

2. Production-grade aggregator linking
- Requires external provider contract, consent UX/legal text, token lifecycle handling, and compliance checks.

## Safest Fallback Approach

1. Primary:
- Manual transaction entry
- CSV statement import (with explicit consent)
- Receipt scan upload + review-before-save

2. Secondary (feature-flagged roadmap):
- Aggregator link pilots only behind `FEATURE_BANK_AGGREGATOR_CONNECT`
- Email parse pilots only behind `FEATURE_EMAIL_STATEMENT_PARSE`

## Recommended Third-Party Integration Direction

1. Bank account aggregation (India-focused)
- Account Aggregator-compatible providers (requires contract/compliance onboarding)
- Maintain tokenized access only; no raw credential storage.

2. Multi-region optional alternative
- Regulated aggregator providers (where legally supported for target geography).

3. Non-negotiable data boundaries
- Never store CVV.
- Never store full PAN/card number.
- Keep explicit consent and revocation logs per ingestion scope.
