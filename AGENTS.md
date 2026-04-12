# AGENTS.md — Finlo (Personal Expense Tracker)

## Project Identity

**Finlo** — personal expense tracker with Android app + web app + Supabase backend.
- Android: Kotlin + Jetpack Compose + Room/SQLCipher + WorkManager + ML Kit + Hilt + Retrofit + Coil
- Web: React 18 + TypeScript + Vite + Tailwind CSS + Recharts + Supabase JS + Workbox
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions) + pgcrypto
- Push: FCM. Analytics: Firebase (non-PII). Errors: Sentry. CI/CD: GitHub Actions + Fastlane + Vercel.

## Auth

- Sign-up: OTP (Twilio), Google SSO, Email+Password
- Login: Biometric (BiometricPrompt), 4-6 digit PIN, Google SSO
- Session: auto-expire 5 min inactivity, re-auth on resume
- Android: PIN in Keystore, JWTs in Keystore (never SharedPreferences), token rotation on auth events
- Web: PIN session lock via sessionStorage timer, no biometric

## Security Rules

- Device: AES-256 via Android Keystore, Room DB encrypted with SQLCipher, key from PIN via PBKDF2
- Transit: TLS 1.3, certificate pinning on Android
- Server: RLS on all tables, financial fields encrypted via pgcrypto (pgp_sym_encrypt per-user key)
- Bill images: on-device ML Kit OCR only, deleted after parse, never stored server-side
- FLAG_SECURE on all financial screens, no clipboard on financial inputs
- E2E encryption indicator in Security settings

## Database Schema (Supabase PostgreSQL + pgcrypto)

All tables have RLS (user accesses own rows only). Encrypt amount/merchant/note in expenses.

| Table | Key Columns |
|---|---|
| users | id, name, dob, city, currency(INR default), monthly_income(encrypted), created_at |
| expenses | id, user_id, amount, category_id, merchant, note, date, payment_mode, tags, is_recurring, recurrence_frequency, created_at |
| categories | id, user_id, name, icon, color, is_archived |
| budgets | id, user_id, category_id(nullable=overall), limit_amount, period, rollover_enabled |
| bills | id, user_id, name, amount, is_variable, due_date, frequency, category_id, reminder_lead_days, is_paid, auto_create_expense |
| debts | id, user_id, name, type, total_amount, remaining_balance, interest_rate, emi_amount, next_due_date, lender_name, is_settled |
| savings_goals | id, user_id, name, target_amount, current_amount, deadline |
| feedback | id, user_id, screen, rating, text, created_at |

## App Modules

### Dashboard
Timeframe tabs (Today/Week/Month/Year). Widgets: today's spend, balance, sparkline trend, top 3 categories with % bars, upcoming bills (7d, max 5), FAB "+".

### Expense Entry
Manual entry (amount, category, merchant, note, date, payment_mode, tags). Bill scan/upload via ML Kit OCR → pre-fill → review → save → delete image. Recurring expenses with frequency + reminders. List: chronological, search, filter, sort. Swipe edit/delete with undo. Bulk select.

### Default Categories
Food & Dining, Transport, Groceries, Shopping, Health, Utilities, Entertainment, Education, Travel, EMI/Loan, Rent, Savings, Miscellaneous. Custom categories with icon+color. Archive (not delete) if linked.

### Reports
Summary (total, avg daily, highest, savings rate). Category donut + MoM change + drill-down. Trend bar/line + anomalies + YoY. Export PDF/CSV (encrypted). AI insight cards (local rule engine).

### Budget Manager
Overall + per-category limits (absolute or % income). Rollover toggle. Progress bars: green 0-70%, amber 70-90%, red >90%. Push at 80%/100%. Projected overspend text. Optional lock on limit hit.

### Smart Saving Suggestions (WorkManager weekly)
Spend pattern alerts, subscription audit, savings goal nudge, city benchmark (bundled JSON). Opt-in cloud AI: anonymised category totals → Gemini API free tier → NL summary.

### Bills & Reminders
Entry with lead time (1/3/7d), auto-mark-paid toggle. FCM push + in-app banner + optional email digest. Calendar view with due date dots. Mark-paid auto-creates expense. WorkManager 8AM daily check.

### Debt & Loan Tracker
Types: personal loan, credit card, owed to/by. Summary card (total outstanding, monthly EMI, payoff date). EMI logging → balance reduces → links to expense. Payoff planner. Friend/family IOU.

### Settings
Profile, Security (PIN/biometric/sessions/E2E), Notifications (per-type/quiet hours), Categories, Data & Backup (Google Drive/restore/export/delete account), Display (theme/number format INR), Privacy (cloud AI opt-in/out), About.

### Help & Support
Bundled FAQ (offline). 3-step onboarding (skippable, re-accessible). Bug report + screenshot → backend or Zoho Desk. Feature request with upvote. Rating prompt (after 10 sessions or 30d, max 1/90d). Per-screen micro-feedback (1-5 stars + text).

## AI Agents

| Agent | Trigger | Runtime | Details |
|---|---|---|---|
| OCR Parse | Bill photo/upload | On-device (ML Kit v2) | Extract total, merchant, date, line items. Confidence scores. Zero network. |
| Insight Engine | Weekly WorkManager | Local Kotlin | Current month vs 3-month avg per category. Deterministic, offline. |
| Cloud AI Assistant | User taps "Generate AI Summary" | Edge Function → Gemini | Anonymised category totals only. Opt-in. Revocable. |
| Bill Reminder | Daily 8AM WorkManager | Local | Check bills/debts due within lead window → FCM push. |

## Profile
Fields: full name (req), DOB (req), city (req), monthly income (opt, encrypted), currency (req, INR default), profile photo (opt, local only, never synced).

## Web App
Full feature parity. Responsive 320px-1440px. Supabase Auth (Google OAuth, Email+Password, OTP). Service Worker offline via Workbox. IndexedDB cache (localforage + custom AES wrapper).

## Conventions

- All PKs are UUIDs
- Currency default: INR
- Error shape: `{"status": "error", "code": "...", "message": "...", "details": {...}}`
- No PII in logs or analytics
- Android: Hilt DI, Retrofit for API, Coil for images, Room+SQLCipher for local DB
- Web: Strict TypeScript, shared types in `src/types/`, Tailwind utility-first, Recharts for charts
- Backend: Supabase Edge Functions in TypeScript/Deno
- Deployment: Vercel (web), Render/container (if needed), GitHub Actions CI
