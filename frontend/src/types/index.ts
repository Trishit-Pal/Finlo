// ── Auth ─────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  currency?: string;
  settings?: Record<string, any>;
  profile?: UserProfile | null;
};

export type UserProfile = {
  username?: string | null;
  username_source?: 'manual' | 'google' | 'migration' | 'admin' | null;
  date_of_birth?: string | null;
  date_of_birth_source?: 'manual' | 'google' | 'migration' | 'admin' | null;
  city?: string | null;
  address?: string | null;
  country?: string | null;
  monthly_budget_inr?: number | null;
  monthly_income?: number | null;
  mobile_number?: string | null;
  is_username_editable?: boolean;
  is_date_of_birth_editable?: boolean;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  user: User;
};

export type PasswordValidation = {
  minLength: boolean;
  hasDigits: boolean;
  hasAlpha: boolean;
  isValid: boolean;
};

// ── Categories ──────────────────────────────────────────────────────────────

export type Category = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  is_archived: boolean;
  is_default: boolean;
};

// ── Transactions / Expenses ─────────────────────────────────────────────────

export type Transaction = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category?: string | null;
  category_id?: string | null;
  category_confidence?: number | null;
  payment_mode?: string | null;
  tags?: string[];
  is_recurring?: boolean;
  recurrence_frequency?: string | null;
  source: string;
  receipt_id?: string | null;
  notes?: string | null;
};

// ── Receipts ────────────────────────────────────────────────────────────────

export type ReceiptItem = {
  name: string;
  price?: number | null;
  quantity?: number | null;
  category?: string | null;
  confidence?: number | null;
};

export type ParsedReceipt = {
  merchant?: string | null;
  date?: string | null;
  due_date?: string | null;
  total?: number | null;
  tax?: number | null;
  currency: string;
  category_suggestion?: string | null;
  recurring_indicator?: boolean;
  account_suffix?: string | null;
  parser_provider?: string | null;
  items: ReceiptItem[];
  field_confidence: Record<string, number>;
};

export type Receipt = {
  id: string;
  merchant?: string | null;
  date?: string | null;
  due_date?: string | null;
  total?: number | null;
  tax?: number | null;
  currency: string;
  items?: ReceiptItem[];
  ocr_confidence?: number | null;
  source_hash?: string | null;
  duplicate_of_receipt_id?: string | null;
  duplicate_confidence?: number | null;
  category_suggestion?: string | null;
  recurring_indicator?: boolean;
  account_suffix?: string | null;
  parser_provider?: string | null;
  status: string;
  created_at: string;
};

// ── Bills & Reminders ───────────────────────────────────────────────────────

export type Bill = {
  id: string;
  name: string;
  amount: number;
  is_variable: boolean;
  due_date: string;
  frequency: string;
  category?: string | null;
  category_id?: string | null;
  reminder_lead_days: number;
  is_paid: boolean;
  auto_create_expense: boolean;
  description?: string | null;
  created_at: string;
};

// ── Budgets ─────────────────────────────────────────────────────────────────

export type Budget = {
  id: string;
  month: number;
  year: number;
  category: string;
  category_id?: string | null;
  limit_amount: number;
  is_percentage: boolean;
  rollover_enabled: boolean;
  soft_alert: number;
  hard_alert: number;
  spent: number;
  remaining: number;
  alert_level: 'ok' | 'soft' | 'hard';
  edit_count: number;
  version: number;
  last_edited_at?: string | null;
  can_edit: boolean;
};

// ── Debts & Loans ───────────────────────────────────────────────────────────

export type Debt = {
  id: string;
  name: string;
  type: 'personal_loan' | 'credit_card' | 'owed_to' | 'owed_by';
  total_amount: number;
  remaining_balance: number;
  interest_rate?: number | null;
  emi_amount?: number | null;
  next_due_date?: string | null;
  lender_name?: string | null;
  is_settled: boolean;
  created_at: string;
};

// ── Savings Goals ───────────────────────────────────────────────────────────

export type SavingsGoal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
  created_at: string;
};

// ── Coach / Suggestions ─────────────────────────────────────────────────────

export type CoachAction = {
  text: string;
  weekly_savings?: number | null;
  rationale?: string | null;
  source_receipts: string[];
};

export type CoachOutput = {
  summary: string;
  actions: CoachAction[];
  estimated_savings?: number | null;
  confidence?: number | null;
};

export type Suggestion = {
  id: string;
  summary?: string | null;
  actions?: CoachAction[];
  estimated_savings?: number | null;
  confidence?: number | null;
  status: string;
  created_at: string;
};

// ── Feedback ────────────────────────────────────────────────────────────────

export type FeedbackEntry = {
  id: string;
  screen?: string | null;
  rating?: number | null;
  text?: string | null;
  feature_request?: string | null;
  is_bug_report: boolean;
  upvotes: number;
  created_at: string;
};

// ── Monthly Summary ─────────────────────────────────────────────────────────

export type MonthlySummary = {
  month: number;
  year: number;
  total_income: number;
  total_expenses: number;
  category_breakdown: Record<string, number>;
  top_places: Record<string, number>;
};

// ── Theme ───────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

// ── Payment Modes ───────────────────────────────────────────────────────────

export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'net_banking', label: 'Net Banking' },
] as const;

export const BILL_FREQUENCIES = [
  { value: 'once', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
] as const;

export const DEBT_TYPES = [
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'owed_to', label: 'Owed To (I owe)' },
  { value: 'owed_by', label: 'Owed By (They owe me)' },
] as const;
