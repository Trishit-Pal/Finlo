-- Migration: Align Schema with Backend Models + Add Triggers (Corrected Types)
-- Applied on: 2026-04-12

-- ── 1. Add missing columns to existing tables ───────────────────────────────

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_source text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth_source text;
CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);

-- Budgets
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS edit_count integer DEFAULT 0;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

-- Receipts (Using UUID for FKs to match existing receipts.id type)
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS duplicate_of_receipt_id uuid REFERENCES receipts(id) ON DELETE SET NULL;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS duplicate_confidence double precision;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS due_date text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS category_suggestion text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS recurring_indicator boolean DEFAULT false;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS account_suffix text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS parser_provider text;
CREATE INDEX IF NOT EXISTS ix_receipts_source_hash ON receipts(source_hash);

-- ── 2. Create new tables ───────────────────────────────────────────────────

-- Budget Versions (Snapshots) - Using UUID
CREATE TABLE IF NOT EXISTS budget_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month integer NOT NULL,
    year integer NOT NULL,
    category text NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL DEFAULT '{}',
    change_reason text NOT NULL DEFAULT 'update',
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_budget_versions_budget_version ON budget_versions(budget_id, version);

-- User Consents (Privacy/Compliance) - Using UUID
CREATE TABLE IF NOT EXISTS user_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type text NOT NULL,
    scope text NOT NULL DEFAULT 'transactions',
    status text NOT NULL DEFAULT 'granted',
    metadata jsonb DEFAULT '{}',
    granted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_user_consents_unique_scope ON user_consents(user_id, consent_type, scope);

-- NOTE: audit_logs already exists with a different schema from a previous attempt.
-- We will add the missing columns to adapt it to the planned schema if necessary,
-- or just ensure it exists. The existing schema is:
-- id, user_id, action, table_name, record_id, old_values, new_values, changed_fields, ip_address, user_agent, created_at
-- Our planned schema in models.py:
-- id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at
-- We'll add resource_type and metadata aliases to the existing table to support both.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- ── 3. Add Triggers ─────────────────────────────────────────────────────────

-- Trigger Function: Enforce Immutability
CREATE OR REPLACE FUNCTION enforce_immutable_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Username
    IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
        RAISE EXCEPTION 'Field "username" is immutable once set';
    END IF;
    
    -- Date of Birth (Special check if stored as DATE in DB but handled as TEXT in app)
    IF OLD.date_of_birth IS NOT NULL AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
        RAISE EXCEPTION 'Field "date_of_birth" is immutable once set';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to users
DROP TRIGGER IF EXISTS tr_users_immutable ON users;
CREATE TRIGGER tr_users_immutable
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_immutable_fields();

-- Trigger Function: Updated At
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to users & consents
DROP TRIGGER IF EXISTS tr_users_updated_at ON users;
CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS tr_user_consents_updated_at ON user_consents;
CREATE TRIGGER tr_user_consents_updated_at BEFORE UPDATE ON user_consents FOR EACH ROW EXECUTE FUNCTION update_timestamp();
