import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { SavingsGoal } from '../types';
import { Plus, X, Trash2, Target, PiggyBank, TrendingUp } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';

export const SavingsGoals: React.FC = () => {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [contributeModal, setContributeModal] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [form, setForm] = useState({ name: '', target_amount: '', deadline: '' });

  const fetch = async () => {
    try {
      const res = await api.get('/savings');
      setGoals(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/savings', {
      name: form.name,
      target_amount: parseFloat(form.target_amount),
      deadline: form.deadline || null,
    });
    setShowModal(false);
    setForm({ name: '', target_amount: '', deadline: '' });
    fetch();
  };

  const handleContribute = async () => {
    if (!contributeModal || !contributeAmount) return;
    await api.post(`/savings/${contributeModal}/contribute`, { amount: parseFloat(contributeAmount) });
    setContributeModal(null);
    setContributeAmount('');
    fetch();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/savings/${id}`);
    fetch();
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.current_amount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Savings Goals</h1>
          <p className="text-sm mt-0.5 text-muted">Track your savings targets and progress</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> New Goal
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total Target', value: fmt(totalTarget), icon: Target, color: '#818cf8' },
          { label: 'Total Saved', value: fmt(totalSaved), icon: PiggyBank, color: '#22c55e' },
          { label: 'Active Goals', value: goals.length, icon: TrendingUp, color: '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-panel p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
              <Icon size={15} style={{ color }} />
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
              <h2 className="text-base font-semibold text-foreground">New Savings Goal</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label-text">Goal Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Emergency Fund, Vacation..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Target Amount (₹)</label>
                  <input type="number" min="1" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label className="label-text">Deadline (optional)</label>
                  <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} className="input-field" />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full">Create Goal</button>
            </form>
          </div>
        </div>
      )}

      {/* Contribute Modal */}
      {contributeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setContributeModal(null); }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold text-foreground mb-4">Add Contribution</h3>
            <input type="number" min="1" value={contributeAmount} onChange={e => setContributeAmount(e.target.value)} placeholder="Amount (₹)" className="input-field mb-3" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setContributeModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleContribute} className="btn-primary flex-1">Contribute</button>
            </div>
          </div>
        </div>
      )}

      {/* Goals Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="glass-panel p-5 skeleton h-36 rounded-xl" />)}
        </div>
      ) : goals.length === 0 ? (
        <div className="glass-panel p-12 text-center" style={{ borderStyle: 'dashed' }}>
          <PiggyBank size={32} className="mx-auto mb-3 opacity-20 text-muted" />
          <p className="text-sm text-muted">No savings goals yet. Set one to start saving!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map(g => {
            const pct = Math.min((g.current_amount / g.target_amount) * 100, 100);
            const isComplete = g.current_amount >= g.target_amount;
            const daysLeft = g.deadline ? differenceInDays(parseISO(g.deadline), new Date()) : null;
            const dailyNeeded = daysLeft && daysLeft > 0 ? (g.target_amount - g.current_amount) / daysLeft : null;

            return (
              <div key={g.id} className="glass-panel p-5 group hover:-translate-y-0.5 transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{g.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {g.deadline ? `Due ${format(parseISO(g.deadline), 'MMM d, yyyy')}` : 'No deadline'}
                      {daysLeft !== null && daysLeft > 0 && ` · ${daysLeft} days left`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isComplete ? (
                      <span className="badge-success text-xs">Complete!</span>
                    ) : (
                      <button onClick={() => setContributeModal(g.id)} className="text-xs px-2.5 py-1 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-all">+ Add</button>
                    )}
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg text-muted sm:opacity-0 sm:group-hover:opacity-100 hover:text-danger hover:bg-danger/10"><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-foreground font-medium">{fmt(g.current_amount)} saved</span>
                    <span className="text-muted">of {fmt(g.target_amount)}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${pct}%`,
                        background: isComplete ? '#22c55e' : '#818cf8',
                        boxShadow: `0 0 8px ${isComplete ? 'rgba(34,197,94,0.4)' : 'rgba(129,140,248,0.4)'}`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-xs text-muted">
                  <span>{pct.toFixed(0)}% complete</span>
                  {dailyNeeded && dailyNeeded > 0 && (
                    <span className="text-primary">Save {fmt(Math.ceil(dailyNeeded))}/day to reach goal</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
