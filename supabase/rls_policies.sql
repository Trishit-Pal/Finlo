-- Finlo — Row Level Security Policies
-- All user-owned tables: user can only access own rows

-- ── Enable RLS ──────────────────────────────────────────────────────────────
alter table if exists users enable row level security;
alter table if exists categories enable row level security;
alter table if exists receipts enable row level security;
alter table if exists transactions enable row level security;
alter table if exists bills enable row level security;
alter table if exists budgets enable row level security;
alter table if exists debts enable row level security;
alter table if exists savings_goals enable row level security;
alter table if exists suggestions enable row level security;
alter table if exists feedback enable row level security;
alter table if exists otp_tokens enable row level security;
alter table if exists embeddings enable row level security;

-- ── Users: read/update own profile ──────────────────────────────────────────
drop policy if exists users_select_own on users;
create policy users_select_own on users for select to authenticated
    using (id::text = auth.uid()::text);

drop policy if exists users_update_own on users;
create policy users_update_own on users for update to authenticated
    using (id::text = auth.uid()::text)
    with check (id::text = auth.uid()::text);

-- ── Generic owner policies (user_id = auth.uid()) ──────────────────────────

-- Categories
drop policy if exists categories_owner_all on categories;
create policy categories_owner_all on categories for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Receipts
drop policy if exists receipts_owner_all on receipts;
create policy receipts_owner_all on receipts for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Transactions
drop policy if exists transactions_owner_all on transactions;
create policy transactions_owner_all on transactions for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Bills
drop policy if exists bills_owner_all on bills;
create policy bills_owner_all on bills for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Budgets
drop policy if exists budgets_owner_all on budgets;
create policy budgets_owner_all on budgets for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Debts
drop policy if exists debts_owner_all on debts;
create policy debts_owner_all on debts for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Savings Goals
drop policy if exists savings_goals_owner_all on savings_goals;
create policy savings_goals_owner_all on savings_goals for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Suggestions
drop policy if exists suggestions_owner_all on suggestions;
create policy suggestions_owner_all on suggestions for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Feedback
drop policy if exists feedback_owner_all on feedback;
create policy feedback_owner_all on feedback for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Budget Versions
alter table if exists budget_versions enable row level security;
drop policy if exists budget_versions_owner_all on budget_versions;
create policy budget_versions_owner_all on budget_versions for all to authenticated
    using (budget_id::text in (
        select id::text from budgets where user_id::text = auth.uid()::text
    ))
    with check (budget_id::text in (
        select id::text from budgets where user_id::text = auth.uid()::text
    ));

-- User Consents
alter table if exists user_consents enable row level security;
drop policy if exists user_consents_owner_all on user_consents;
create policy user_consents_owner_all on user_consents for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Audit Logs (read-only for own user, no direct writes from client)
alter table if exists audit_logs enable row level security;
drop policy if exists audit_logs_select_own on audit_logs;
create policy audit_logs_select_own on audit_logs for select to authenticated
    using (user_id::text = auth.uid()::text);

<<<<<<< HEAD
=======
-- ── Accounts & Finance Intelligence ─────────────────────────────────────────

-- Accounts
alter table if exists accounts enable row level security;
drop policy if exists accounts_owner_all on accounts;
create policy accounts_owner_all on accounts for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Balance Snapshots
alter table if exists balance_snapshots enable row level security;
drop policy if exists balance_snapshots_owner_all on balance_snapshots;
create policy balance_snapshots_owner_all on balance_snapshots for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Import Batches
alter table if exists import_batches enable row level security;
drop policy if exists import_batches_owner_all on import_batches;
create policy import_batches_owner_all on import_batches for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Recurring Rules
alter table if exists recurring_rules enable row level security;
drop policy if exists recurring_rules_owner_all on recurring_rules;
create policy recurring_rules_owner_all on recurring_rules for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

-- Insights
alter table if exists insights enable row level security;
drop policy if exists insights_owner_all on insights;
create policy insights_owner_all on insights for all to authenticated
    using (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);

>>>>>>> 5b6ef39 (New Attempt)
-- ── System-managed tables: deny direct access ──────────────────────────────
drop policy if exists embeddings_deny_all on embeddings;
create policy embeddings_deny_all on embeddings for all to authenticated
    using (false);

drop policy if exists otp_tokens_deny_all on otp_tokens;
create policy otp_tokens_deny_all on otp_tokens for all to authenticated
    using (false);
