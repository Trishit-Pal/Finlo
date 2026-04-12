import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, Sparkles, Check, X, Plus,
  IndianRupee, CreditCard, Target, ArrowUpRight, ArrowDownRight,
  Calendar, Receipt
} from 'lucide-react';
import type { Suggestion, Bill } from '../types';

/** Animated number counter hook */
const useCountUp = (end: number, duration = 800, enabled = true) => {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || end === 0) { setValue(end); return; }
    const start = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (end - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [end, duration, enabled]);

  return value;
};

type Timeframe = 'today' | 'week' | 'month' | 'year';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>{label}</p>
        <p style={{ color: '#818cf8', fontWeight: 600, fontSize: '14px' }}>
          ₹{payload[0].value?.toLocaleString('en-IN')}
        </p>
      </div>
    );
  }
  return null;
};

const SkeletonCard = () => (
  <div className="glass-panel p-5 space-y-3">
    <div className="skeleton h-3 w-24 rounded" />
    <div className="skeleton h-8 w-36 rounded" />
  </div>
);

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [dashRes, billsRes] = await Promise.all([
          api.get('/coach/dashboard', { params: { timeframe } }),
          api.get('/bills/upcoming/next7days').catch(() => ({ data: [] })),
        ]);
        setData(dashRes.data);
        setUpcomingBills(billsRes.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [timeframe]);

  const handleSuggestion = async (id: string, action: string) => {
    try {
      await api.post(`/coach/suggestions/${id}/respond`, { action });
      setData((prev: any) => ({
        ...prev,
        coach_suggestions: prev.coach_suggestions.filter((s: Suggestion) => s.id !== id),
      }));
    } catch (e) { console.error(e); }
  };

  const totalSpent = data?.totals_by_category?.reduce((a: number, c: any) => a + c.total, 0) || 0;
  const totalSavings = data?.coach_suggestions?.reduce((a: number, c: Suggestion) => a + (c.estimated_savings || 0), 0) || 0;
  const activeBudgets = data?.budget_status?.length || 0;

  const animatedSpent = useCountUp(totalSpent, 900, !loading);
  const animatedSavings = useCountUp(totalSavings, 900, !loading);
  const animatedBudgets = useCountUp(activeBudgets, 600, !loading);
  const animatedBills = useCountUp(upcomingBills.length, 600, !loading);
  const topCategories = (data?.totals_by_category || [])
    .sort((a: any, b: any) => b.total - a.total)
    .slice(0, 3);

  const trendUp = data?.weekly_trend?.length >= 2
    ? data.weekly_trend[data.weekly_trend.length - 1]?.total > data.weekly_trend[data.weekly_trend.length - 2]?.total
    : false;

  const timeframes: { key: Timeframe; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Timeframe Selector */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm mt-0.5 text-muted">Your financial overview at a glance</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {timeframes.map(tf => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timeframe === tf.key ? 'text-foreground' : 'text-muted hover:text-foreground'
              }`}
              style={{
                background: timeframe === tf.key ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: timeframe === tf.key ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            {/* Total Spend */}
            <div className="stat-card animate-stagger-1 hover:shadow-glow-sm transition-shadow duration-300 cursor-default group">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <IndianRupee size={17} style={{ color: '#818cf8' }} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${trendUp ? 'text-danger' : 'text-success'}`}>
                  {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  vs last period
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xs text-muted mb-1 font-medium tracking-wide uppercase">Total Spend</p>
                <p className="text-2xl font-bold text-foreground animate-number-pop">{fmt(animatedSpent)}</p>
              </div>
            </div>

            {/* Balance / Active Budgets */}
            <div className="stat-card animate-stagger-2 hover:shadow-glow-sm transition-shadow duration-300 cursor-default group">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <Target size={17} style={{ color: '#34d399' }} />
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xs text-muted mb-1 font-medium tracking-wide uppercase">Active Budgets</p>
                <p className="text-2xl font-bold text-foreground animate-number-pop">{animatedBudgets}</p>
                <p className="text-xs text-muted mt-0.5">
                  {activeBudgets === 0 ? 'No budgets set' : `tracking ${activeBudgets} categories`}
                </p>
              </div>
            </div>

            {/* Upcoming Bills */}
            <div className="stat-card animate-stagger-3 hover:shadow-glow-sm transition-shadow duration-300 cursor-default group">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Calendar size={17} style={{ color: '#fbbf24' }} />
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xs text-muted mb-1 font-medium tracking-wide uppercase">Upcoming Bills</p>
                <p className="text-2xl font-bold text-foreground animate-number-pop">{animatedBills}</p>
                <p className="text-xs text-muted mt-0.5">due in next 7 days</p>
              </div>
            </div>

            {/* Potential Savings */}
            <div className="stat-card animate-stagger-4 hover:shadow-glow transition-shadow duration-300 cursor-default relative overflow-hidden group" style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.18)' }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at top right, rgba(99,102,241,0.1), transparent 60%)' }} />
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <Sparkles size={17} style={{ color: '#818cf8' }} />
                </div>
              </div>
              <div className="pt-1">
                <p className="text-xs mb-1 font-medium tracking-wide uppercase" style={{ color: '#818cf8' }}>Potential Savings</p>
                <p className="text-2xl font-bold text-foreground animate-number-pop">{fmt(animatedSavings)}</p>
                <p className="text-xs mt-0.5" style={{ color: '#818cf8' }}>from {data?.coach_suggestions?.length || 0} suggestions</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Left Column (3 cols) */}
        <div className="lg:col-span-3 space-y-6">

          {/* Spend Trend Sparkline */}
          <div className="glass-panel p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp size={16} style={{ color: '#818cf8' }} />
                Spending Trend
              </h3>
              {data?.weekly_trend?.length > 0 && (
                <span className="badge-primary text-xs">{data.weekly_trend.length} weeks</span>
              )}
            </div>
            {loading ? (
              <div className="skeleton h-48 rounded-xl" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.weekly_trend || []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" stroke="transparent" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="transparent" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5} fill="url(#spendGradient)" dot={{ fill: '#6366f1', strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: '#818cf8', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top 3 Categories */}
          <div className="glass-panel p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <CreditCard size={16} style={{ color: '#818cf8' }} />
              Top Categories
            </h3>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-6 rounded" />)}
              </div>
            ) : topCategories.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No spending data yet</p>
            ) : (
              <div className="space-y-4">
                {topCategories.map((cat: any, i: number) => {
                  const pct = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
                  const colors = ['#6366f1', '#f59e0b', '#14b8a6'];
                  return (
                    <div key={cat.category || i}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-foreground">{cat.category || 'Uncategorized'}</span>
                        <span className="text-muted">{fmt(cat.total)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: colors[i] || '#6b7280' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Budget Status */}
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Target size={16} style={{ color: '#818cf8' }} />
                Budget Status
              </h3>
            </div>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-8 rounded" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {data?.budget_status?.map((b: any) => {
                  const pct = Math.min(b.percent, 100);
                  const color = b.alert === 'hard' ? '#f43f5e' : b.alert === 'soft' ? '#f59e0b' : '#10b981';
                  return (
                    <div key={b.budget_id}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-foreground">{b.category}</span>
                        <span className="text-muted">{fmt(b.spent)} / {fmt(b.limit)}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}40` }} />
                      </div>
                      {b.alert !== 'none' && (
                        <p className="text-xs mt-1" style={{ color }}>
                          {b.alert === 'hard' ? 'Budget exceeded!' : 'Approaching limit'}
                        </p>
                      )}
                    </div>
                  );
                })}
                {(!data?.budget_status || data.budget_status.length === 0) && (
                  <div className="text-center py-6">
                    <Target size={24} className="mx-auto mb-2 text-muted opacity-40" />
                    <p className="text-sm text-muted">No active budgets</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (2 cols) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Upcoming Bills */}
          <div className="glass-panel p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Receipt size={16} style={{ color: '#fbbf24' }} />
              Upcoming Bills
            </h3>
            {upcomingBills.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No bills due in the next 7 days</p>
            ) : (
              <div className="space-y-2">
                {upcomingBills.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <p className="text-sm font-medium text-foreground">{b.name}</p>
                      <p className="text-xs text-muted">Due {b.due_date}</p>
                    </div>
                    <span className="text-sm font-semibold text-danger">{fmt(b.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coach Insights */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} style={{ color: '#818cf8' }} />
              <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="glass-panel p-5 space-y-3">
                    <div className="skeleton h-3 w-full rounded" />
                    <div className="skeleton h-3 w-3/4 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {data?.coach_suggestions?.map((s: Suggestion) => (
                  <div key={s.id} className="glass-panel p-4 relative overflow-hidden animate-slide-up">
                    <div className="absolute top-0 left-0 w-0.5 h-full rounded-r" style={{ background: 'linear-gradient(180deg, #818cf8, #6366f1)' }} />
                    <p className="text-sm leading-relaxed mb-3 pl-2 text-muted">{s.summary}</p>
                    {s.actions && s.actions.length > 0 && (
                      <div className="space-y-1.5 mb-3 pl-2">
                        {s.actions.map((action: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="font-medium text-foreground">{action.text}</p>
                            {action.weekly_savings && <span className="badge-success text-xs mt-1 inline-block">Save ~₹{action.weekly_savings}/wk</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pl-2">
                      <button onClick={() => handleSuggestion(s.id, 'accepted')} className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs"><Check size={12} /> Accept</button>
                      <button onClick={() => handleSuggestion(s.id, 'rejected')} className="btn-danger flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs"><X size={12} /> Dismiss</button>
                    </div>
                  </div>
                ))}
                {(!data?.coach_suggestions || data.coach_suggestions.length === 0) && (
                  <div className="glass-panel p-6 text-center" style={{ borderStyle: 'dashed' }}>
                    <Sparkles size={24} className="mx-auto mb-2 opacity-30" style={{ color: '#818cf8' }} />
                    <p className="text-sm text-muted">Upload receipts for AI coaching advice</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => navigate('/transactions')}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg z-30 transition-all duration-200 hover:scale-110 active:scale-95 animate-scale-in hover:shadow-glow-lg"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
        }}
        title="Add transaction"
      >
        <Plus size={24} className="text-white" />
      </button>
    </div>
  );
};
