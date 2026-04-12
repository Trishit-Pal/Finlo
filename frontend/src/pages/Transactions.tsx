import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { PAYMENT_MODES } from '../types';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, X, Download, Search, Filter, Repeat, Edit3, FileSpreadsheet, UploadCloud, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', icon: '🍔', color: '#f97316' },
  { name: 'Transport', icon: '🚗', color: '#3b82f6' },
  { name: 'Groceries', icon: '🛒', color: '#f59e0b' },
  { name: 'Shopping', icon: '🛍️', color: '#ec4899' },
  { name: 'Health', icon: '🏥', color: '#ef4444' },
  { name: 'Utilities', icon: '💡', color: '#eab308' },
  { name: 'Entertainment', icon: '🎮', color: '#8b5cf6' },
  { name: 'Education', icon: '📚', color: '#06b6d4' },
  { name: 'Travel', icon: '✈️', color: '#14b8a6' },
  { name: 'EMI/Loan', icon: '🏦', color: '#6366f1' },
  { name: 'Rent', icon: '🏠', color: '#a855f7' },
  { name: 'Savings', icon: '🐷', color: '#22c55e' },
  { name: 'Miscellaneous', icon: '📌', color: '#6b7280' },
  { name: 'Salary', icon: '💰', color: '#22c55e' },
  { name: 'Freelance', icon: '💻', color: '#14b8a6' },
];

export const Transactions: React.FC = () => {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [importConsentGranted, setImportConsentGranted] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({
    type: 'expense', amount: '', merchant: '', category: '',
    date: format(new Date(), 'yyyy-MM-dd'), payment_mode: '', tags: '',
    is_recurring: false, recurrence_frequency: '',
  });

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      setTransactions(res.data?.items || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTransactions(); }, []);

  const loadStatementConsent = async () => {
    setConsentLoading(true);
    try {
      const res = await api.get('/integrations/consents');
      const hasConsent = (res.data || []).some((c: any) => c.consent_type === 'statement_import' && c.status === 'granted');
      setImportConsentGranted(hasConsent);
    } catch (e) {
      console.error(e);
    } finally {
      setConsentLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/transactions/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'finlo-transactions.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

  const openImportModal = async () => {
    setShowImportModal(true);
    setImportFile(null);
    setImportResult(null);
    await loadStatementConsent();
  };

  const grantImportConsent = async () => {
    try {
      await api.post('/integrations/consents', {
        consent_type: 'statement_import',
        scope: 'transactions',
        status: 'granted',
        metadata: { source: 'transactions_import' },
      });
      setImportConsentGranted(true);
      toast('success', 'Statement import consent granted');
    } catch (e) {
      toast('error', 'Failed to grant consent');
    }
  };

  const handleImportCsv = async () => {
    if (!importFile) return;
    if (!importConsentGranted) {
      toast('error', 'Grant statement import consent first');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await api.post('/transactions/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      toast('success', `Imported ${res.data.imported} rows`);
      await fetchTransactions();
    } catch (e: any) {
      const message = e?.response?.data?.detail || e?.response?.data?.message || 'Import failed';
      toast('error', message);
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [String(message)],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const payload = {
      merchant: form.merchant,
      amount: parseFloat(form.amount),
      category: form.category || null,
      date: form.date,
      payment_mode: form.payment_mode || null,
      tags,
      is_recurring: form.is_recurring,
      recurrence_frequency: form.is_recurring ? (form.recurrence_frequency || 'monthly') : null,
      notes: form.type === 'income' ? 'income' : undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/transactions/${editingId}`, payload);
        toast('success', 'Transaction updated');
      } else {
        await api.post('/transactions', payload);
        toast('success', 'Transaction added');
      }
    } catch (e) {
      toast('error', 'Failed to save transaction');
      return;
    }
    setShowModal(false);
    setEditingId(null);
    setForm({ type: 'expense', amount: '', merchant: '', category: '', date: format(new Date(), 'yyyy-MM-dd'), payment_mode: '', tags: '', is_recurring: false, recurrence_frequency: '' });
    fetchTransactions();
  };

  const handleEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      type: t.notes === 'income' ? 'income' : 'expense',
      amount: String(t.amount),
      merchant: t.merchant || '',
      category: t.category || '',
      date: t.date,
      payment_mode: t.payment_mode || '',
      tags: (t.tags || []).join(', '),
      is_recurring: t.is_recurring || false,
      recurrence_frequency: t.recurrence_frequency || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    // Soft delete: remove from UI immediately, delay actual deletion for undo
    const deletedItem = transactions.find(t => t.id === id);
    setTransactions(prev => prev.filter(t => t.id !== id));

    toast('undo', 'Transaction deleted', {
      onUndo: () => {
        // Restore the item
        if (deletedItem) {
          setTransactions(prev => [...prev, deletedItem].sort((a, b) => b.date.localeCompare(a.date)));
        }
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      },
      duration: 5000,
    });

    // Actually delete after 5s if no undo
    undoTimerRef.current = setTimeout(async () => {
      try {
        await api.delete(`/transactions/${id}`);
      } catch (e) {
        // If server delete fails, restore
        if (deletedItem) setTransactions(prev => [...prev, deletedItem]);
        toast('error', 'Failed to delete transaction');
      }
    }, 5000);
  };

  const filtered = transactions.filter(t => {
    if (searchQuery && !t.merchant?.toLowerCase().includes(searchQuery.toLowerCase()) && !t.category?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPayment && t.payment_mode !== filterPayment) return false;
    return true;
  });

  const income = filtered.filter(t => t.notes === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = filtered.filter(t => t.notes !== 'income').reduce((s, t) => s + Number(t.amount), 0);
  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-sm mt-0.5 text-muted">Track your income and expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openImportModal} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-white/10 text-muted hover:text-foreground hover:bg-white/5 transition-all">
            <FileSpreadsheet size={15} /> Import CSV
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-white/10 text-muted hover:text-foreground hover:bg-white/5 transition-all">
            <Download size={15} /> Export
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Add Transaction
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Income', value: income, icon: ArrowUpRight, color: '#34d399' },
          { label: 'Expenses', value: expenses, icon: ArrowDownRight, color: '#fb7185' },
          { label: 'Balance', value: income - expenses, color: income - expenses >= 0 ? '#34d399' : '#fb7185', icon: income - expenses >= 0 ? ArrowUpRight : ArrowDownRight },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-panel p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <Icon size={15} style={{ color }} />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{fmt(value)}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-2.5 text-muted" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search merchants, categories..." className="input-field pl-9 text-sm" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all flex-shrink-0 ${showFilters ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted border border-white/10 hover:text-foreground'}`}>
          <Filter size={14} /> <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field text-sm flex-1">
            <option value="">All Categories</option>
            {DEFAULT_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="input-field text-sm flex-1">
            <option value="">All Payment Modes</option>
            {PAYMENT_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">{editingId ? 'Edit Transaction' : 'New Transaction'}</h2>
              <button onClick={() => { setShowModal(false); setEditingId(null); }} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="input-field">
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div>
                  <label className="label-text">Amount (₹)</label>
                  <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="input-field" required />
                </div>
              </div>
              <div>
                <label className="label-text">Merchant / Description</label>
                <input value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} className="input-field" placeholder="Restaurant, Store, etc." required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input-field">
                    <option value="">Select</option>
                    {DEFAULT_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input-field" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Payment Mode</label>
                  <select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))} className="input-field">
                    <option value="">Select</option>
                    {PAYMENT_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Tags (comma-separated)</label>
                  <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} className="input-field" placeholder="food, weekend" />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} className="rounded" />
                  <Repeat size={13} /> Recurring
                </label>
                {form.is_recurring && (
                  <select value={form.recurrence_frequency} onChange={e => setForm(f => ({ ...f, recurrence_frequency: e.target.value }))} className="input-field text-sm w-32">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                )}
              </div>
              <button type="submit" className="btn-primary w-full">{editingId ? 'Save Changes' : 'Add Transaction'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={(e) => { if (e.target === e.currentTarget) setShowImportModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Import statement CSV</h2>
              <button onClick={() => setShowImportModal(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
            </div>

            <div className="p-3 rounded-xl mb-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.16)' }}>
              <p className="text-xs text-muted">
                Consent is mandatory for statement imports. Finlo stores transaction details only and does not store CVV/full card details.
              </p>
            </div>

            <div className="mb-4 p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                {importConsentGranted ? <CheckCircle2 size={14} className="text-success" /> : <FileSpreadsheet size={14} className="text-muted" />}
                <span className="text-sm text-foreground">Statement import consent</span>
              </div>
              <button
                onClick={grantImportConsent}
                disabled={importConsentGranted || consentLoading}
                className="text-xs px-3 py-1.5 rounded-lg border border-success/30 text-success disabled:opacity-40"
              >
                {importConsentGranted ? 'Granted' : consentLoading ? 'Checking...' : 'Grant'}
              </button>
            </div>

            <div className="space-y-3">
              <label className="label-text">Choose CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="input-field"
              />
              <button
                onClick={handleImportCsv}
                disabled={!importFile || importing || !importConsentGranted}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <UploadCloud size={14} />
                {importing ? 'Importing...' : 'Import transactions'}
              </button>
            </div>

            {importResult && (
              <div className="mt-4 p-3 rounded-xl text-xs space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-foreground">Imported: {importResult.imported}</p>
                <p className="text-muted">Skipped: {importResult.skipped}</p>
                {importResult.errors.length > 0 && (
                  <div className="pt-1">
                    {importResult.errors.slice(0, 5).map((errorText) => (
                      <p key={errorText} style={{ color: '#fb7185' }}>{errorText}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="glass-panel overflow-hidden">
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-lg" />
                  <div className="space-y-1.5"><div className="skeleton h-3 w-32 rounded" /><div className="skeleton h-2.5 w-24 rounded" /></div>
                </div>
                <div className="skeleton h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted">No transactions found.</p>
          </div>
        ) : (
          <div>
            {filtered.map(t => {
              const isIncome = t.notes === 'income';
              return (
                <div key={t.id} className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-3.5 transition-colors hover:bg-white/[0.02] group" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <span className="text-base sm:text-lg flex-shrink-0">{DEFAULT_CATEGORIES.find(c => c.name === t.category)?.icon || '📌'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{t.merchant || 'Untitled'}</p>
                        {t.is_recurring && <Repeat size={11} className="text-primary flex-shrink-0" />}
                        {t.payment_mode && <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-muted hidden sm:inline">{PAYMENT_MODES.find(p => p.value === t.payment_mode)?.label || t.payment_mode}</span>}
                      </div>
                      <p className="text-xs text-muted truncate">
                        {t.category || 'Uncategorized'} · {format(new Date(t.date), 'MMM d')}
                        <span className="hidden sm:inline">, {format(new Date(t.date), 'yyyy')}</span>
                        {t.tags?.length > 0 && <span className="hidden sm:inline"> · {t.tags.join(', ')}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
                    <span className={`text-sm font-semibold ${isIncome ? 'text-success' : 'text-danger'}`}>
                      {isIncome ? '+' : '-'}{fmt(t.amount)}
                    </span>
                    <button onClick={() => handleEdit(t)} className="p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 text-muted hover:text-primary hover:bg-primary/10 transition-all">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 text-muted hover:text-danger hover:bg-danger/10 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
