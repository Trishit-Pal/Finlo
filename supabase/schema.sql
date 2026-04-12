-- Finlo Expense Tracker — Supabase Schema
-- Run this in Supabase SQL Editor to set up all tables

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ── Users ────────────────────────────────────────────────────────────────────
create table if not exists users (
    id text primary key default gen_random_uuid()::text,
    email text unique not null,
    hashed_password text,
    oauth_provider text,
    oauth_sub text,
    username text unique,
    username_source text,
    full_name text,
    avatar_url text,
    date_of_birth text,
    date_of_birth_source text,
    city text,
    address text,
    country text,
    currency text default 'INR',
    mobile_number text,
    mobile_number_hash text,
    monthly_income text,  -- encrypted via pgp_sym_encrypt
    monthly_budget_inr double precision,
    settings jsonb default '{}',
    is_admin boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists ix_users_username on users(username);

create index if not exists ix_users_email on users(email);
create index if not exists ix_users_mobile_hash on users(mobile_number_hash);

-- ── Categories ──────────────────────────────────────────────────────────────
create table if not exists categories (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    name text not null,
    icon text,
    color text,
    is_archived boolean default false,
    is_default boolean default false,
    created_at timestamptz default now()
);

create unique index if not exists ix_categories_user_name on categories(user_id, name);

-- ── Receipts ────────────────────────────────────────────────────────────────
create table if not exists receipts (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    merchant text,
    date text,
    total double precision,
    tax double precision,
    currency text default 'INR',
    items jsonb default '[]',
    ocr_confidence double precision,
    raw_image_url text,
    source_hash text,
    duplicate_of_receipt_id text references receipts(id) on delete set null,
    duplicate_confidence double precision,
    due_date text,
    category_suggestion text,
    recurring_indicator boolean default false,
    account_suffix text,
    parser_provider text,
    source text default 'upload',
    status text default 'pending',
    raw_ocr_text text,
    field_confidence jsonb default '{}',
    created_at timestamptz default now()
);

create index if not exists ix_receipts_source_hash on receipts(source_hash);

create index if not exists ix_receipts_user on receipts(user_id);

-- ── Transactions (Expenses) ─────────────────────────────────────────────────
create table if not exists transactions (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    date text not null,
    merchant text not null,
    amount double precision not null,
    category text,
    category_id text references categories(id) on delete set null,
    category_confidence double precision,
    payment_mode text,  -- cash/upi/card/net_banking
    tags jsonb default '[]',
    is_recurring boolean default false,
    recurrence_frequency text,  -- daily/weekly/monthly/yearly
    source text default 'manual',
    receipt_id text references receipts(id) on delete set null,
    notes text,
    created_at timestamptz default now()
);

create index if not exists ix_transactions_user on transactions(user_id);
create index if not exists ix_transactions_user_date on transactions(user_id, date);

-- ── Bills & Reminders ───────────────────────────────────────────────────────
create table if not exists bills (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    name text not null,
    amount double precision not null,
    is_variable boolean default false,
    due_date text not null,
    frequency text default 'monthly',
    category text,
    category_id text references categories(id) on delete set null,
    reminder_lead_days integer default 3,
    is_paid boolean default false,
    auto_create_expense boolean default false,
    description text,
    created_at timestamptz default now()
);

create index if not exists ix_bills_user on bills(user_id);

-- ── Budgets ─────────────────────────────────────────────────────────────────
create table if not exists budgets (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    month integer not null,
    year integer not null,
    category text not null,
    category_id text references categories(id) on delete set null,
    limit_amount double precision not null,
    is_percentage boolean default false,
    rollover_enabled boolean default false,
    soft_alert double precision default 0.8,
    hard_alert double precision default 1.0,
    edit_count integer default 0,
    version integer default 1,
    last_edited_at timestamptz,
    created_at timestamptz default now()
);

create index if not exists ix_budgets_user_month on budgets(user_id, month, year);

-- ── Debts & Loans ───────────────────────────────────────────────────────────
create table if not exists debts (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    name text not null,
    type text not null,  -- personal_loan/credit_card/owed_to/owed_by
    total_amount double precision not null,
    remaining_balance double precision not null,
    interest_rate double precision,
    emi_amount double precision,
    next_due_date text,
    lender_name text,
    is_settled boolean default false,
    created_at timestamptz default now()
);

create index if not exists ix_debts_user on debts(user_id);

-- ── Savings Goals ───────────────────────────────────────────────────────────
create table if not exists savings_goals (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    name text not null,
    target_amount double precision not null,
    current_amount double precision default 0,
    deadline text,
    created_at timestamptz default now()
);

create index if not exists ix_savings_goals_user on savings_goals(user_id);

-- ── Suggestions (Coach) ─────────────────────────────────────────────────────
create table if not exists suggestions (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    receipt_ids jsonb default '[]',
    categories jsonb default '[]',
    summary text,
    actions jsonb default '[]',
    estimated_savings double precision,
    confidence double precision,
    status text default 'pending',
    user_edit text,
    created_at timestamptz default now(),
    responded_at timestamptz
);

create index if not exists ix_suggestions_user on suggestions(user_id);

-- ── Feedback ────────────────────────────────────────────────────────────────
create table if not exists feedback (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    screen text,
    rating integer,
    text text,
    feature_request text,
    is_bug_report boolean default false,
    classification text,
    top_improvements jsonb default '[]',
    priority text,
    upvotes integer default 0,
    processed boolean default false,
    created_at timestamptz default now()
);

create index if not exists ix_feedback_user on feedback(user_id);

-- ── OTP Tokens ──────────────────────────────────────────────────────────────
create table if not exists otp_tokens (
    id text primary key default gen_random_uuid()::text,
    mobile_number text not null,
    otp_hash text not null,
    expires_at timestamptz not null,
    used boolean default false,
    created_at timestamptz default now()
);

create index if not exists ix_otp_mobile on otp_tokens(mobile_number);

-- ── Embeddings ──────────────────────────────────────────────────────────────
create table if not exists embeddings (
    id text primary key default gen_random_uuid()::text,
    parent_id text not null,
    vector jsonb not null,
    type text not null,
    metadata jsonb default '{}',
    created_at timestamptz default now()
);

create index if not exists ix_embeddings_parent_type on embeddings(parent_id, type);

-- ── Budget Versions ─────────────────────────────────────────────────────────
create table if not exists budget_versions (
    id text primary key default gen_random_uuid()::text,
    budget_id text not null references budgets(id) on delete cascade,
    user_id text not null references users(id) on delete cascade,
    month integer not null,
    year integer not null,
    category text not null,
    version integer not null,
    snapshot jsonb not null default '{}',
    change_reason text not null default 'update',
    created_at timestamptz default now()
);

create index if not exists ix_budget_versions_budget_version on budget_versions(budget_id, version);

-- ── User Consents ────────────────────────────────────────────────────────────
create table if not exists user_consents (
    id text primary key default gen_random_uuid()::text,
    user_id text not null references users(id) on delete cascade,
    consent_type text not null,
    scope text not null default 'transactions',
    status text not null default 'granted',
    metadata jsonb default '{}',
    granted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create unique index if not exists ix_user_consents_unique_scope on user_consents(user_id, consent_type, scope);

-- ── Audit Logs ───────────────────────────────────────────────────────────────
create table if not exists audit_logs (
    id text primary key default gen_random_uuid()::text,
    user_id text references users(id) on delete set null,
    action text not null,
    resource_type text not null,
    resource_id text,
    ip_address text,
    user_agent text,
    metadata jsonb default '{}',
    created_at timestamptz default now()
);

create index if not exists ix_audit_logs_user on audit_logs(user_id);
create index if not exists ix_audit_logs_action_created on audit_logs(action, created_at);
