import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Budget } from '../types';
import { PiggyBank, Plus, Trash2, Target, TrendingDown, AlertTriangle, X, Edit3, History, Save, Ban } from 'lucide-react';

const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transport', 'Entertainment',
  'Shopping', 'Healthcare', 'Utilities', 'Travel', 'Education', 'Other',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface NewBudget {
  category: string;
  limit_amount: number;
  month: number;
  year: number;
  rollover_enabled: boolean;
  is_percentage: boolean;
}

type BudgetHistoryEntry = {
  id: string;
  version: number;
  change_reason: string;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export const Budgets: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [historyBudget, setHistoryBudget] = useState<Budget | null>(null);
  const [historyItems, setHistoryItems] = useState<BudgetHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [form, setForm] = useState<NewBudget>({
    category: CATEGORIES[0],
    limit_amount: 5000,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    rollover_enabled: false,
    is_percentage: false,
  });
  const [editForm, setEditForm] = useState({
    limit_amount: 0,
    soft_alert: 0.8,
    hard_alert: 1.0,
    rollover_enabled: false,
    is_percentage: false,
  });

  const fetchBudgets = async () => {
    try {
      const res = await api.get('/budgets');
      setBudgets(res.data?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBudgets(); }, []);

  const handleCreate = async () => {
    if (!form.category || form.limit_amount <= 0) {
      setError('Please fill in all fields correctly.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/budgets', form);
      setShowForm(false);
      await fetchBudgets();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to create budget.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/budgets/${id}`);
      setBudgets(prev => prev.filter(b => b.id !== id));
    } catch (e) { console.error(e); }
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setEditForm({
      limit_amount: budget.limit_amount,
      soft_alert: budget.soft_alert,
      hard_alert: budget.hard_alert,
      rollover_enabled: budget.rollover_enabled,
      is_percentage: budget.is_percentage,
    });
    setError('');
    setShowEditForm(true);
  };

  const handleEditSave = async () => {
    if (!editingBudget) return;
    if (editForm.limit_amount <= 0) {
      setError('Limit amount must be greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/budgets/${editingBudget.id}`, editForm);
      setShowEditForm(false);
      setEditingBudget(null);
      await fetchBudgets();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to update budget.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (budget: Budget) => {
    setShowHistory(true);
    setHistoryBudget(budget);
    setHistoryLoading(true);
    setHistoryItems([]);
    try {
      const res = await api.get(`/budgets/${budget.id}/history`);
      setHistoryItems(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getBarColor = (level: string) => {
    if (level === 'hard') return { bar: '#f43f5e', glow: 'rgba(244,63,94,0.3)' };
    if (level === 'soft') return { bar: '#f59e0b', glow: 'rgba(245,158,11,0.3)' };
    return { bar: '#10b981', glow: 'rgba(16,185,129,0.3)' };
  };

  const totalBudgeted = budgets.reduce((a, b) => a + b.limit_amount, 0);
  const totalSpent = budgets.reduce((a, b) => a + (b.spent || 0), 0);
  const overBudget = budgets.filter(b => b.alert_level === 'hard').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budgets</h1>
          <p className="text-sm mt-0.5 text-muted">
            Set spending limits and track your progress
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} />
          New Budget
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total Budgeted', value: `₹${totalBudgeted.toLocaleString('en-IN')}`, icon: Target, color: '#818cf8' },
          { label: 'Total Spent', value: `₹${totalSpent.toLocaleString('en-IN')}`, icon: TrendingDown, color: '#fbbf24' },
          { label: 'Over Budget', value: overBudget, icon: AlertTriangle, color: overBudget > 0 ? '#fb7185' : '#34d399' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-panel p-4 flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}18`, border: `1px solid ${color}30` }}
            >
              <Icon size={15} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{loading ? '—' : value}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 animate-slide-up"
            style={{
              background: '#13131a',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">Create Budget</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/5 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {error && (
              <div
                className="mb-4 p-3 rounded-xl text-sm"
                style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185' }}
              >
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label-text">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="input-field"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">Monthly Limit (₹)</label>
                <input
                  type="number"
                  min={1}
                  value={form.limit_amount}
                  onChange={e => setForm(p => ({ ...p, limit_amount: Number(e.target.value) }))}
                  className="input-field"
                  placeholder="5000"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Month</label>
                  <select
                    value={form.month}
                    onChange={e => setForm(p => ({ ...p, month: Number(e.target.value) }))}
                    className="input-field"
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Year</label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input type="checkbox" checked={form.rollover_enabled} onChange={e => setForm(p => ({ ...p, rollover_enabled: e.target.checked }))} className="rounded" />
                Rollover unused budget
              </label>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Creating...' : 'Create Budget'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditForm && editingBudget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowEditForm(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 animate-slide-up"
            style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">Edit Budget (one-time monthly)</h2>
              <button onClick={() => setShowEditForm(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/5">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185' }}>
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label-text">Monthly Limit (₹)</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.limit_amount}
                  onChange={e => setEditForm((p) => ({ ...p, limit_amount: Number(e.target.value) }))}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Soft Alert (0-1)</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={editForm.soft_alert}
                    onChange={e => setEditForm((p) => ({ ...p, soft_alert: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-text">Hard Alert (0-1)</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={editForm.hard_alert}
                    onChange={e => setEditForm((p) => ({ ...p, hard_alert: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input type="checkbox" checked={editForm.rollover_enabled} onChange={e => setEditForm((p) => ({ ...p, rollover_enabled: e.target.checked }))} className="rounded" />
                Rollover unused budget
              </label>
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input type="checkbox" checked={editForm.is_percentage} onChange={e => setEditForm((p) => ({ ...p, is_percentage: e.target.checked }))} className="rounded" />
                Limit is percentage based
              </label>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleEditSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <Save size={13} />
                {saving ? 'Saving...' : 'Save one-time edit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && historyBudget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowHistory(false); }}
        >
          <div className="w-full max-w-xl rounded-2xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Budget History · {historyBudget.category}</h2>
              <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/5">
                <X size={16} />
              </button>
            </div>
            {historyLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((idx) => <div key={idx} className="skeleton h-14 rounded-xl" />)}</div>
            ) : historyItems.length === 0 ? (
              <p className="text-sm text-muted">No history available.</p>
            ) : (
              <div className="space-y-2">
                {historyItems.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-foreground">Version {entry.version}</p>
                      <span className="text-xs text-muted">{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs mt-1 text-muted">Reason: {entry.change_reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel p-5 space-y-4">
              <div className="flex justify-between">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-4 w-16 rounded" />
              </div>
              <div className="skeleton h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div
          className="glass-panel p-12 text-center"
          style={{ borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <PiggyBank size={32} className="mx-auto mb-3 opacity-20 text-muted" />
          <p className="text-sm text-muted mb-4">No budgets yet. Create one to start tracking your spending.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-2 mx-auto">
            <Plus size={14} /> Create First Budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map(b => {
            const pct = Math.min(((b.spent || 0) / b.limit_amount) * 100, 100);
            const { bar, glow } = getBarColor(b.alert_level);
            return (
              <div key={b.id} className="glass-panel p-5 group hover:-translate-y-0.5 transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-sm text-foreground">{b.category}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {MONTHS[b.month - 1]} {b.year}
                    </p>
                    <p className="text-xs text-muted mt-1">Version {b.version} · {b.edit_count}/1 edit used</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.alert_level === 'hard' && (
                      <span className="badge-danger text-xs">Over Budget</span>
                    )}
                    {b.alert_level === 'soft' && (
                      <span className="badge-warning text-xs">80% Used</span>
                    )}
                    <button
                      onClick={() => openHistory(b)}
                      className="p-1.5 rounded-lg text-muted sm:opacity-0 sm:group-hover:opacity-100 hover:text-foreground hover:bg-white/10 transition-all"
                      title="Version history"
                    >
                      <History size={13} />
                    </button>
                    <button
                      onClick={() => openEdit(b)}
                      disabled={!b.can_edit}
                      className="p-1.5 rounded-lg text-muted sm:opacity-0 sm:group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                      title={b.can_edit ? 'Edit budget' : 'Monthly edit already used'}
                    >
                      {b.can_edit ? <Edit3 size={13} /> : <Ban size={13} />}
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="p-1.5 rounded-lg text-muted sm:opacity-0 sm:group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground font-medium">₹{(b.spent || 0).toLocaleString('en-IN')} spent</span>
                    <span className="text-muted">of ₹{b.limit_amount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${pct}%`, background: bar, boxShadow: `0 0 8px ${glow}` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-muted">
                  <span>{pct.toFixed(0)}% used</span>
                  <span style={{ color: b.remaining < 0 ? '#fb7185' : '#34d399' }}>
                    {b.remaining < 0 ? `₹${Math.abs(b.remaining).toLocaleString('en-IN')} over` : `₹${(b.remaining || 0).toLocaleString('en-IN')} left`}
                  </span>
                </div>
                {!b.can_edit && (
                  <p className="text-xs mt-2" style={{ color: '#fbbf24' }}>
                    Edit limit reached for this month.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
