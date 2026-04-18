# Finlo – End-to-End Test Playbook

> **Claude-executable top-to-bottom.** Run each section in order for a full stack pass.
> Section 7 (Test Inventory) is auto-generated — do not edit manually.

---

## Quick Start

```bash
# From repo root — run all automated checks in order
cd backend && alembic upgrade head
cd backend && python -m pytest app/tests/ -q
ruff check backend/app
cd ../frontend && npm audit --audit-level=high
npx tsc --noEmit && npm run lint && npm run build
```

---

## Prerequisites

| Requirement | Check |
|---|---|
| Python 3.11+ | `python --version` |
| Node 18+ | `node --version` |
| Backend deps | `cd backend && pip install -r requirements.txt` |
| Frontend deps | `cd frontend && npm install` |
| Env vars | Copy `.env.example` → `.env` and fill required keys |

**Minimum env vars for local testing (SQLite path):**
```
DATABASE_URL=sqlite+aiosqlite:///./financecoach.db
JWT_SECRET=any-long-secret-string-min-32-chars
ENVIRONMENT=test
STORAGE_ENCRYPTION_KEY=<64 hex chars — any 64-char hex string>
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=test-bucket
REDIS_URL=redis://localhost:6379/0
```

---

## 1. Database Layer

### Apply migrations
```bash
cd backend
alembic upgrade head
```

**Expected:** All migrations apply cleanly (exit 0). No `ERROR` lines in output.

### Verify key tables exist (SQLite)
```bash
sqlite3 financecoach.db ".tables"
```

Expected tables: `users`, `transactions`, `categories`, `budgets`, `bills`,
`debts`, `savings_goals`, `recurring_rules`, `accounts`, `balance_snapshots`,
`notifications`, `insights`, `feedback`, `audit_logs`, `refresh_tokens`.

### Verify idempotent (second run is a no-op)
```bash
alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade ... -> ...` lines
OR `INFO  [alembic.runtime.migration] No new upgrade steps.`

---

## 2. Backend Tests

### Full suite
```bash
cd backend
python -m pytest app/tests/ -q
```

Expected: all tests pass, 0 errors. See §7 for live count.

### Per-module commands

> **Note:** Test counts below are a snapshot. §7 has the live auto-generated count.

| File | Snapshot count | Command |
|---|---|---|
| `test_accounts_insights_notifications.py` | 3 | `pytest app/tests/test_accounts_insights_notifications.py -v` |
| `test_analytics.py` | 9 | `pytest app/tests/test_analytics.py -v` |
| `test_auth_oauth_security.py` | 2 | `pytest app/tests/test_auth_oauth_security.py -v` |
| `test_bills.py` | 12 | `pytest app/tests/test_bills.py -v` |
| `test_categories.py` | 10 | `pytest app/tests/test_categories.py -v` |
| `test_categorizer.py` | 12 | `pytest app/tests/test_categorizer.py -v` |
| `test_coach.py` | 11 | `pytest app/tests/test_coach.py -v` |
| `test_debts.py` | 14 | `pytest app/tests/test_debts.py -v` |
| `test_health.py` | 1 | `pytest app/tests/test_health.py -v` |
| `test_http_retry.py` | 9 | `pytest app/tests/test_http_retry.py -v` |
| `test_integration.py` | 17 | `pytest app/tests/test_integration.py -v` |
| `test_parser.py` | 17 | `pytest app/tests/test_parser.py -v` |
| `test_profile_budget_receipt_security.py` | 4 | `pytest app/tests/test_profile_budget_receipt_security.py -v` |
| `test_provider_pool.py` | 11 | `pytest app/tests/test_provider_pool.py -v` |
| `test_recurring.py` | 17 | `pytest app/tests/test_recurring.py -v` |
| `test_savings.py` | 12 | `pytest app/tests/test_savings.py -v` |
| `test_security_hardening.py` | 18 | `pytest app/tests/test_security_hardening.py -v` |
| `test_transactions_io.py` | 13 | `pytest app/tests/test_transactions_io.py -v` |

### With coverage report
```bash
cd backend
python -m pytest app/tests/ --cov=app --cov-report=term-missing -q
```

---

## 3. Security Gates

### Backend lint
```bash
cd backend
ruff check app
```

Expected: exit 0, no errors. Rules: E, F, W, I (per `pyproject.toml`).

### Frontend dependency audit
```bash
cd frontend
npm audit --audit-level=high
```

Expected: exit 0, 0 high/critical vulnerabilities.

### Optional: pip-audit (install separately)
```bash
pip install pip-audit
cd backend
pip-audit -r requirements.txt
```

---

## 4. Frontend Validation

```bash
cd frontend

# 1. TypeScript type-check (must be 0 errors)
npx tsc --noEmit

# 2. ESLint (must be 0 errors; style warnings OK)
npm run lint

# 3. Production build — tsc -b + Vite → dist/
npm run build
```

Expected: all three commands exit 0. Build artifact at `frontend/dist/`.

---

## 5. API Smoke Tests

Start the backend dev server:
```bash
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Then in a second terminal (copy the `access_token` value after signin into `$TOKEN`):

```bash
BASE=http://localhost:8000

# ── Health (no auth) ───────────────────────────────────────────────────────────
curl -s $BASE/health | python -m json.tool
# Expected: 200  {"status":"ok", "db":"ok", ...}

# ── Register ───────────────────────────────────────────────────────────────────
curl -s -X POST $BASE/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"SmokePw123!","full_name":"Smoke Tester"}' \
  | python -m json.tool
# Expected: 201  {access_token, refresh_token, user}

# ── Sign in ────────────────────────────────────────────────────────────────────
TOKEN=$(curl -s -X POST $BASE/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"SmokePw123!"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# ── Current user profile ───────────────────────────────────────────────────────
curl -s $BASE/auth/me -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: 200  {id, email, full_name, ...}

# ── Create transaction ─────────────────────────────────────────────────────────
TXN_ID=$(curl -s -X POST $BASE/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-04-17","merchant":"Smoke Cafe","amount":350,"category":"Food & Dining","type":"expense"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
# Expected: 201  transaction object

# ── List transactions ──────────────────────────────────────────────────────────
curl -s "$BASE/transactions?limit=5" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: 200  array containing the transaction above

# ── CSV export ─────────────────────────────────────────────────────────────────
curl -s "$BASE/transactions/export" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/txns.csv && head -2 /tmp/txns.csv
# Expected: 200  CSV with header row (date,merchant,amount,...)

# ── Create budget ──────────────────────────────────────────────────────────────
curl -s -X POST $BASE/budgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"Food & Dining","limit_amount":5000,"period":"monthly"}' \
  | python -m json.tool
# Expected: 201

# ── Analytics overview ─────────────────────────────────────────────────────────
curl -s "$BASE/analytics" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: 200  {categories:[...], monthly_trend:[...]}

# ── Coach suggestions ──────────────────────────────────────────────────────────
curl -s "$BASE/coach/suggestions" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: 200  array (may be empty without LLM key)

# ── Notifications unread count ─────────────────────────────────────────────────
curl -s "$BASE/notifications/unread-count" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: 200  {"unread_count": 0}

# ── Savings goals list ─────────────────────────────────────────────────────────
curl -s "$BASE/savings" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: 200  array

# ── Delete account (cleanup) ───────────────────────────────────────────────────
curl -s -X DELETE $BASE/auth/me \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 or 204
```

---

## 6. E2E User Flows

These flows describe the exact API call sequence Claude should execute to verify each
feature end-to-end. Run against a live server or adapt to the `auth_client` pytest fixture.

### Flow 1 — Register → Profile → Delete
```
POST /auth/signup  {email, password, full_name}           → 201
GET  /auth/me                                              → 200  {email, full_name}
DELETE /auth/me                                            → 200
GET  /auth/me                                              → 401  (token invalidated)
```

### Flow 2 — Transaction Lifecycle
```
POST /transactions  {date, merchant, amount, category, type}   → 201  note {id}
GET  /transactions                                              → 200  list contains new txn
PATCH /transactions/{id}  {merchant: "Updated Merchant"}        → 200  updated object
GET  /transactions?category=Food+%26+Dining                     → 200  filtered list
GET  /transactions/export                                        → 200  text/csv
DELETE /transactions/{id}                                        → 200
```

### Flow 3 — Bill → Mark Paid → Expense Auto-Created
```
POST /bills  {name, amount:500, due_date, frequency:"monthly",
              auto_create_expense:true}                         → 201  note {id}
GET  /bills/{id}                                                → 200  is_paid=false
POST /bills/{id}/mark-paid                                      → 200
GET  /transactions                                              → 200  new expense in list (amount=500)
POST /bills/{id}/mark-unpaid                                    → 200  is_paid=false
DELETE /bills/{id}                                              → 200
```

### Flow 4 — Savings Goal → Contribute → Clamp at Target
```
POST /savings  {name:"Emergency Fund", target_amount:1000,
                current_amount:0}                               → 201  note {id}
POST /savings/{id}/contribute  {amount:600}                     → 200  current_amount=600
POST /savings/{id}/contribute  {amount:600}                     → 200  current_amount=1000 (clamped)
DELETE /savings/{id}                                            → 200
```

### Flow 5 — Analytics + HTML Report
```
POST /transactions ×3  (Food & Dining, Transport, Groceries)
GET  /analytics                                                 → 200  categories non-empty
GET  /analytics/summary                                         → 200  {total_expenses, ...}
GET  /analytics/report                                          → 200  Content-Type: text/html
```

---

## 7. Test Inventory

> Auto-generated by `scripts/gen_test_manifest.py`.
> Regenerates automatically on every Write/Edit via `.claude/settings.json` PostToolUse hook.
> Do not edit this section manually.

<!-- TEST-INVENTORY-START -->
_Auto-generated 2026-04-18_


### `test_accounts_insights_notifications.py` — 3 tests

- `test_account_crud_and_net_worth`
- `test_insights_generation_budget_overrun_and_trends`
- `test_bill_reminder_dispatch_and_read_markers`

### `test_analytics.py` — 9 tests

- `test_overview_empty_schema`
- `test_overview_aggregates_categories`
- `test_monthly_trend_has_six_months`
- `test_monthly_summary_structure`
- `test_monthly_summary_aggregates_transactions`
- `test_monthly_summary_top_places`
- `test_monthly_summary_invalid_month`
- `test_report_returns_html`
- `test_report_invalid_year`

### `test_auth_oauth_security.py` — 2 tests

- `test_google_oauth_rejects_audience_mismatch`
- `test_oauth_callback_requires_verified_supabase_identity`

### `test_bills.py` — 12 tests

- `test_create_and_list`
- `test_get_single`
- `test_get_not_found`
- `test_update_bill`
- `test_invalid_frequency`
- `test_delete_bill`
- `test_mark_paid_and_unpaid`
- `test_mark_paid_creates_transaction` — auto_create_expense=True must create a transaction on mark-paid.
- `test_mark_paid_no_duplicate_transaction` — Calling mark-paid a second time (after unpay) must not double-create.
- `test_upcoming_next7days`
- `test_upcoming_excludes_paid`
- `test_list_filter_paid`

### `test_categories.py` — 10 tests

- `test_init_creates_13_defaults`
- `test_init_idempotent`
- `test_create_and_list`
- `test_create_missing_name`
- `test_update_category`
- `test_update_not_found`
- `test_archive_via_update`
- `test_delete_unused_category`
- `test_delete_linked_category_archives_instead` — Deleting a category that has linked transactions must archive, not delete.
- `test_delete_not_found`

### `test_categorizer.py` — 12 tests

- `test_lookup_walmart`
- `test_lookup_starbucks`
- `test_lookup_uber`
- `test_lookup_netflix`
- `test_lookup_unknown_returns_none`
- `test_lookup_case_insensitive`
- `test_all_lookup_values_have_valid_categories`
- `test_categorize_walmart`
- `test_categorize_starbucks`
- `test_categorize_unknown_falls_back` — Unknown merchant without LLM key should return 'Other' with low confidence.
- `test_categorize_returns_dict`
- `test_categorize_items_list`

### `test_coach.py` — 11 tests

- `test_mock_coach_output_keys`
- `test_mock_coach_output_summary_length`
- `test_mock_coach_actions_count`
- `test_mock_coach_action_structure`
- `test_mock_coach_confidence_range`
- `test_mock_coach_estimated_savings_positive`
- `test_heuristic_classify_bug`
- `test_heuristic_classify_feature`
- `test_heuristic_classify_praise`
- `test_heuristic_classify_ux`
- `test_heuristic_classify_low_rating_escalates_priority`

### `test_debts.py` — 14 tests

- `test_create_and_list`
- `test_invalid_type`
- `test_update_debt`
- `test_update_not_found`
- `test_delete`
- `test_payment_reduces_balance`
- `test_payment_settles_at_zero`
- `test_overpayment_clamps_to_zero`
- `test_payment_zero_rejected`
- `test_payment_not_found`
- `test_schedule_with_interest`
- `test_schedule_zero_interest`
- `test_schedule_not_found`
- `test_summary`

### `test_health.py` — 1 tests

- `test_health_endpoint`

### `test_http_retry.py` — 9 tests

- `test_retry_call_returns_on_first_success`
- `test_retry_call_retries_on_retryable_error`
- `test_retry_call_does_not_retry_on_non_retryable`
- `test_retry_call_gives_up_after_max_attempts`
- `test_retry_call_propagates_cancel`
- `test_parse_retry_after_numeric`
- `test_parse_retry_after_missing_or_bad`
- `test_http_request_with_retry_retries_503_then_succeeds`
- `test_http_request_with_retry_passes_4xx_through` — A 404 should NOT be retried — it's a logic error, not transient.

### `test_integration.py` — 17 tests

- `test_health_check`
- `test_signup_and_signin`
- `test_signup_duplicate_email`
- `test_get_me`
- `test_create_transaction`
- `test_list_transactions`
- `test_transaction_filter_by_category`
- `test_delete_transaction`
- `test_create_budget`
- `test_budget_duplicate_rejected`
- `test_update_budget`
- `test_submit_feedback`
- `test_feedback_with_feature_request`
- `test_dashboard`
- `test_get_suggestions`
- `test_admin_requires_admin_role`
- `test_admin_analytics`

### `test_parser.py` — 17 tests

- `test_extract_date_iso`
- `test_extract_date_slash_format`
- `test_extract_date_written_format`
- `test_extract_date_missing`
- `test_extract_total`
- `test_extract_tax`
- `test_extract_total_missing`
- `test_extract_merchant_whole_foods`
- `test_extract_merchant_trader_joes`
- `test_extract_items_whole_foods`
- `test_extract_items_confidence`
- `test_extract_currency_usd`
- `test_extract_currency_default`
- `test_parse_receipt_whole_foods`
- `test_parse_receipt_trader_joes`
- `test_parse_receipt_field_confidence_keys`
- `test_parse_receipt_model_dump`

### `test_profile_budget_receipt_security.py` — 4 tests

- `test_profile_immutable_username_and_dob`
- `test_budget_edit_once_and_history`
- `test_statement_import_requires_explicit_consent`
- `test_receipt_duplicate_detection_and_confirm_idempotency`

### `test_provider_pool.py` — 11 tests

- `test_from_csv_dedupes_and_preserves_order`
- `test_from_values_filters_empty`
- `test_empty_pool_is_falsy`
- `test_borrow_rotates_round_robin`
- `test_borrow_raises_when_pool_empty`
- `test_failure_quarantines_key_and_rotates_to_next`
- `test_classify_rate_limit_vs_auth_vs_generic`
- `test_all_keys_exhausted_raises`
- `test_mark_success_resets_failure_window`
- `test_quarantine_extends_ttl_not_resets`
- `test_healthy_count_reflects_expired_quarantines`

### `test_recurring.py` — 17 tests

- `test_list_empty`
- `test_create_and_list`
- `test_create_minimal`
- `test_create_invalid_frequency`
- `test_create_invalid_type`
- `test_create_negative_amount`
- `test_delete`
- `test_delete_not_found`
- `test_get_single`
- `test_get_single_not_found`
- `test_patch_label_and_amount`
- `test_patch_frequency`
- `test_patch_deactivate`
- `test_patch_invalid_frequency`
- `test_patch_not_found`
- `test_detect_candidates`
- `test_detect_single_month_excluded`

### `test_savings.py` — 12 tests

- `test_create_and_list`
- `test_create_minimal`
- `test_zero_target_rejected`
- `test_update_goal`
- `test_update_not_found`
- `test_delete`
- `test_delete_not_found`
- `test_contribute_increases_amount`
- `test_contribute_clamps_at_target`
- `test_contribute_zero_rejected`
- `test_contribute_not_found`
- `test_multiple_contributions`

### `test_security_hardening.py` — 18 tests

- `test_refresh_token_rejected_as_access_token` — Refresh JWT must not work as Authorization header.
- `test_access_token_rejected_after_password_change` — Access tokens issued before password_changed_at must be rejected.
- `test_access_token_accepted_after_password_change_if_newer` — Access tokens issued after password change must still work.
- `test_refresh_rotation_issues_new_pair` — A valid refresh token returns new access+refresh and revokes the old one.
- `test_refresh_replay_revokes_entire_family` — Replaying an already-revoked refresh token must cascade-revoke the family.
- `test_refresh_with_expired_token_rejected`
- `test_refresh_with_unknown_jti_rejected`
- `test_signin_lockout_after_failures` — After 5 failed logins, the 6th attempt should return 429.
- `test_otp_max_attempts_invalidates_token` — After OTP_MAX_ATTEMPTS wrong guesses the token should be marked used.
- `test_otp_success_sets_password_changed_at` — Successful OTP reset must stamp password_changed_at on the user.
- `test_bill_reminder_creates_notification`
- `test_bill_reminder_dedup` — Running dispatch twice must not duplicate the notification.
- `test_notification_mark_read`
- `test_create_expense_decreases_account_balance`
- `test_create_income_increases_account_balance`
- `test_delete_transaction_reverses_balance`
- `test_transfer_adjusts_both_accounts`
- `test_csv_export_sanitizes_formula_injection` — Merchant names starting with =, +, -, @ must be prefixed in CSV output.

### `test_transactions_io.py` — 13 tests

- `test_export_returns_csv`
- `test_export_empty_is_header_only`
- `test_export_filter_by_category`
- `test_export_formula_injection_sanitized` — Merchant starting with '=' must be prefixed with a quote in export.
- `test_export_date_range`
- `test_import_requires_consent`
- `test_import_wrong_content_type` — Run this before bulk imports to avoid hitting the 5/min rate limit.
- `test_import_basic`
- `test_import_dedup_skips_identical_rows`
- `test_import_reimport_same_file_fully_deduped`
- `test_import_flexible_date_format`
- `test_cron_bill_reminders_returns_cleanup_stats`
- `test_cron_requires_admin`


**Total: 192 tests across 18 files**
<!-- TEST-INVENTORY-END -->
