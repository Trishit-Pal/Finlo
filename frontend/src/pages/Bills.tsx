import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { Bill } from '../types';
import { BILL_FREQUENCIES } from '../types';
import {
  Plus, X, Check, AlertTriangle,
  Clock, CheckCircle2, Bell, Trash2, Receipt, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameMonth, isToday, addMonths, subMonths
} from 'date-fns';

const CATEGORIES = [
  'Food & Dining', 'Transport', 'Groceries', 'Shopping', 'Health',
  'Utilities', 'Entertainment', 'Education', 'Travel', 'EMI/Loan',
  'Rent', 'Savings', 'Miscellaneous',
];

type ViewMode = 'list' | 'calendar';

export const Bills: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [calMonth, setCalMonth] = useState(new Date());
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'overdue'>('all');
  const [form, setForm] = useState({
    name: '', amount: '', is_variable: false, due_date: format(new Date(), 'yyyy-MM-dd'),
    frequency: 'monthly', category: '', reminder_lead_days: '3',
    auto_create_expense: false, description: '',
  });

  const fetchBills = async () => {
    try {
      const res = await api.get('/bills');
      setBills(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBills(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/bills', {
      name: form.name,
      amount: parseFloat(form.amount),
      is_variable: form.is_variable,
      due_date: form.due_date,
      frequency: form.frequency,
      category: form.category || null,
      reminder_lead_days: parseInt(form.reminder_lead_days),
      auto_create_expense: form.auto_create_expense,
      description: form.description || null,
    });
    setShowModal(false);
    setForm({ name: '', amount: '', is_variable: false, due_date: format(new Date(), 'yyyy-MM-dd'), frequency: 'monthly', category: '', reminder_lead_days: '3', auto_create_expense: false, description: '' });
    fetchBills();
  };

  const handleMarkPaid = async (id: string) => {
    await api.post(`/bills/${id}/mark-paid`);
    fetchBills();
  };

  const handleMarkUnpaid = async (id: string) => {
    await api.post(`/bills/${id}/mark-unpaid`);
    fetchBills();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/bills/${id}`);
    fetchBills();
  };

  const today = new Date().toISOString().split('T')[0];

  const getStatus = (b: Bill): 'paid' | 'overdue' | 'upcoming' => {
    if (b.is_paid) return 'paid';
    if (b.due_date < today) return 'overdue';
    return 'upcoming';
  };

  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      const status = getStatus(b);
      if (filter === 'all') return true;
      if (filter === 'unpaid') return status !== 'paid';
      if (filter === 'paid') return status === 'paid';
      if (filter === 'overdue') return status === 'overdue';
      return true;
    });
  }, [bills, filter]);

  const statusConfig = {
    paid: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2, label: 'Paid' },
    overdue: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle, label: 'Overdue' },
    upcoming: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Clock, label: 'Upcoming' },
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

  // Calendar helpers
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);
  const billsByDate = useMemo(() => {
    const map: Record<string, Bill[]> = {};
    bills.forEach(b => {
      if (!map[b.due_date]) map[b.due_date] = [];
      map[b.due_date].push(b);
    });
    return map;
  }, [bills]);

  const unpaidTotal = bills.filter(b => !b.is_paid).reduce((s, b) => s + b.amount, 0);
  const overdueCount = bills.filter(b => getStatus(b) === 'overdue').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bills & Reminders</h1>
          <p className="text-sm mt-0.5 text-muted">Track recurring bills and due dates</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'list' ? 'text-foreground bg-primary/15' : 'text-muted'}`}>List</button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'calendar' ? 'text-foreground bg-primary/15' : 'text-muted'}`}>Calendar</button>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Add Bill
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Unpaid Total', value: fmt(unpaidTotal), color: '#fb7185' },
          { label: 'Overdue', value: overdueCount, color: '#ef4444' },
          { label: 'Total Bills', value: bills.length, color: '#818cf8' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-panel p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <Receipt size={15} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{loading ? '—' : value}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'unpaid', 'overdue', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'text-foreground bg-primary/10 border border-primary/20' : 'text-muted hover:text-foreground'}`}
          >{f}</button>
        ))}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-lg rounded-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">New Bill</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Bill Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Rent, Netflix..." required />
                </div>
                <div>
                  <label className="label-text">Amount (₹)</label>
                  <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="input-field" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label-text">Frequency</label>
                  <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className="input-field">
                    {BILL_FREQUENCIES.map(freq => <option key={freq.value} value={freq.value}>{freq.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input-field">
                    <option value="">Select</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Remind Before (days)</label>
                  <select value={form.reminder_lead_days} onChange={e => setForm(f => ({ ...f, reminder_lead_days: e.target.value }))} className="input-field">
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label-text">Description (optional)</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Notes..." />
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input type="checkbox" checked={form.is_variable} onChange={e => setForm(f => ({ ...f, is_variable: e.target.checked }))} className="rounded" />
                  Variable amount
                </label>
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input type="checkbox" checked={form.auto_create_expense} onChange={e => setForm(f => ({ ...f, auto_create_expense: e.target.checked }))} className="rounded" />
                  Auto-create expense on paid
                </label>
              </div>
              <button type="submit" className="btn-primary w-full">Add Bill</button>
            </form>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-white/5"><ChevronLeft size={16} /></button>
            <h3 className="text-sm font-semibold text-foreground">{format(calMonth, 'MMMM yyyy')}</h3>
            <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-white/5"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-xs text-muted py-2 font-medium">{d}</div>
            ))}
            {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayBills = billsByDate[dateStr] || [];
              const hasBills = dayBills.length > 0;
              const hasOverdue = dayBills.some(b => !b.is_paid && dateStr < today);
              return (
                <div
                  key={dateStr}
                  className={`relative p-2 rounded-lg text-center text-xs min-h-[48px] transition-all ${
                    isToday(day) ? 'ring-1 ring-primary/30' : ''
                  } ${!isSameMonth(day, calMonth) ? 'opacity-30' : ''}`}
                  style={{ background: hasBills ? 'rgba(99,102,241,0.06)' : 'transparent' }}
                >
                  <span className={`${isToday(day) ? 'text-primary font-bold' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </span>
                  {hasBills && (
                    <div className="flex justify-center gap-0.5 mt-1">
                      {dayBills.slice(0, 3).map((b, i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: b.is_paid ? '#22c55e' : hasOverdue ? '#ef4444' : '#f59e0b' }}
                          title={`${b.name}: ${fmt(b.amount)}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="p-4 text-center text-muted">Loading...</div>
          ) : filteredBills.length === 0 ? (
            <div className="p-12 text-center">
              <Bell size={28} className="mx-auto mb-3 opacity-20 text-muted" />
              <p className="text-sm text-muted">No bills found</p>
            </div>
          ) : (
            <div>
              {filteredBills.map(b => {
                const status = getStatus(b);
                const cfg = statusConfig[status];
                const StatusIcon = cfg.icon;
                return (
                  <div key={b.id} className="flex items-center justify-between px-3 sm:px-5 py-3.5 sm:py-4 group" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                        <StatusIcon size={14} style={{ color: cfg.color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                        </div>
                        <p className="text-xs text-muted truncate">
                          {b.category || 'Uncategorized'} · Due {format(parseISO(b.due_date), 'MMM d')}
                          <span className="hidden sm:inline"> · {BILL_FREQUENCIES.find(f => f.value === b.frequency)?.label || b.frequency}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
                      <span className="text-sm font-semibold" style={{ color: status === 'paid' ? '#22c55e' : '#fb7185' }}>
                        {fmt(b.amount)}
                      </span>
                      {!b.is_paid ? (
                        <button onClick={() => handleMarkPaid(b.id)} className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-success/10 transition-all" title="Mark paid">
                          <Check size={14} />
                        </button>
                      ) : (
                        <button onClick={() => handleMarkUnpaid(b.id)} className="p-1.5 rounded-lg text-muted hover:text-warning hover:bg-warning/10 transition-all" title="Mark unpaid">
                          <X size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 text-muted hover:text-danger hover:bg-danger/10 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
