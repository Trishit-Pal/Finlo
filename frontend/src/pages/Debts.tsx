import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Debt } from '../types';
import { DEBT_TYPES } from '../types';
import { Plus, X, Landmark, CreditCard, Users, ArrowDownRight, Check, Trash2, IndianRupee } from 'lucide-react';
import { format } from 'date-fns';

const typeIcons: Record<string, React.ReactNode> = {
  personal_loan: <Landmark size={16} />,
  credit_card: <CreditCard size={16} />,
  owed_to: <ArrowDownRight size={16} />,
  owed_by: <Users size={16} />,
};

const typeColors: Record<string, string> = {
  personal_loan: '#6366f1',
  credit_card: '#f97316',
  owed_to: '#ef4444',
  owed_by: '#22c55e',
};

export const Debts: React.FC = () => {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [payModal, setPayModal] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [summary, setSummary] = useState({ total_outstanding: 0, monthly_emi_total: 0, active_count: 0 });
  const [form, setForm] = useState({
    name: '', type: 'personal_loan', total_amount: '', remaining_balance: '',
    interest_rate: '', emi_amount: '', next_due_date: '', lender_name: '',
  });

  const fetch = async () => {
    try {
      const [debtsRes, sumRes] = await Promise.all([
        api.get('/debts'),
        api.get('/debts/summary'),
      ]);
      setDebts(debtsRes.data || []);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/debts', {
      name: form.name,
      type: form.type,
      total_amount: parseFloat(form.total_amount),
      remaining_balance: parseFloat(form.remaining_balance || form.total_amount),
      interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
      emi_amount: form.emi_amount ? parseFloat(form.emi_amount) : null,
      next_due_date: form.next_due_date || null,
      lender_name: form.lender_name || null,
    });
    setShowModal(false);
    setForm({ name: '', type: 'personal_loan', total_amount: '', remaining_balance: '', interest_rate: '', emi_amount: '', next_due_date: '', lender_name: '' });
    fetch();
  };

  const handlePay = async () => {
    if (!payModal || !payAmount) return;
    await api.post(`/debts/${payModal}/payment`, { amount: parseFloat(payAmount) });
    setPayModal(null);
    setPayAmount('');
    fetch();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/debts/${id}`);
    fetch();
  };

  const handleSettle = async (id: string) => {
    await api.patch(`/debts/${id}`, { is_settled: true });
    fetch();
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Debts & Loans</h1>
          <p className="text-sm mt-0.5 text-muted">Track loans, credit cards, and IOUs</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Add Debt
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total Outstanding', value: fmt(summary.total_outstanding), color: '#fb7185' },
          { label: 'Monthly EMI', value: fmt(summary.monthly_emi_total), color: '#f59e0b' },
          { label: 'Active Debts', value: summary.active_count, color: '#818cf8' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-panel p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <IndianRupee size={15} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{loading ? '—' : value}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-md rounded-2xl p-6 animate-slide-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">New Debt / Loan</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="label-text">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Home Loan, Friend IOU..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="input-field">
                    {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Total Amount (₹)</label>
                  <input type="number" min="1" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} className="input-field" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Remaining (₹)</label>
                  <input type="number" min="0" value={form.remaining_balance} onChange={e => setForm(f => ({ ...f, remaining_balance: e.target.value }))} className="input-field" placeholder="Same as total" />
                </div>
                <div>
                  <label className="label-text">Interest Rate (%)</label>
                  <input type="number" step="0.1" min="0" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} className="input-field" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">EMI Amount (₹)</label>
                  <input type="number" min="0" value={form.emi_amount} onChange={e => setForm(f => ({ ...f, emi_amount: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label-text">Next Due Date</label>
                  <input type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} className="input-field" />
                </div>
              </div>
              <div>
                <label className="label-text">Lender / Borrower Name</label>
                <input value={form.lender_name} onChange={e => setForm(f => ({ ...f, lender_name: e.target.value }))} className="input-field" placeholder="Bank, Friend name..." />
              </div>
              <button type="submit" className="btn-primary w-full">Add Debt</button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setPayModal(null); }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold text-foreground mb-4">Log Payment</h3>
            <input type="number" min="1" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount (₹)" className="input-field mb-3" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setPayModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handlePay} className="btn-primary flex-1">Log Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* Debt List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="glass-panel p-5 skeleton h-24 rounded-xl" />)}
        </div>
      ) : debts.length === 0 ? (
        <div className="glass-panel p-12 text-center" style={{ borderStyle: 'dashed' }}>
          <Landmark size={32} className="mx-auto mb-3 opacity-20 text-muted" />
          <p className="text-sm text-muted">No debts or loans tracked yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {debts.map(d => {
            const paidPct = ((d.total_amount - d.remaining_balance) / d.total_amount) * 100;
            const color = typeColors[d.type] || '#6b7280';
            return (
              <div key={d.id} className="glass-panel p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
                      {typeIcons[d.type]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{d.name}</p>
                      <p className="text-xs text-muted">
                        {DEBT_TYPES.find(t => t.value === d.type)?.label}
                        {d.lender_name && ` · ${d.lender_name}`}
                        {d.next_due_date && ` · Due ${format(new Date(d.next_due_date), 'MMM d')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.is_settled ? (
                      <span className="badge-success text-xs">Settled</span>
                    ) : (
                      <>
                        <button onClick={() => setPayModal(d.id)} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all">Pay</button>
                        <button onClick={() => handleSettle(d.id)} className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-success/10"><Check size={13} /></button>
                      </>
                    )}
                    <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg text-muted sm:opacity-0 sm:group-hover:opacity-100 hover:text-danger hover:bg-danger/10"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground font-medium">{fmt(d.total_amount - d.remaining_balance)} paid</span>
                    <span className="text-muted">of {fmt(d.total_amount)}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(paidPct, 100)}%`, background: color, boxShadow: `0 0 8px ${color}40` }} />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>Remaining: {fmt(d.remaining_balance)}</span>
                  {d.emi_amount && <span>EMI: {fmt(d.emi_amount)}/mo</span>}
                  {d.interest_rate && <span>{d.interest_rate}% p.a.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
