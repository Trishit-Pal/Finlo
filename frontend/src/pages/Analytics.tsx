import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend
} from 'recharts';
import {
  BarChart3, TrendingUp, Download, FileText,
  IndianRupee, ArrowUpRight, Sparkles, AlertTriangle
} from 'lucide-react';

const COLORS = ['#6366f1', '#f59e0b', '#14b8a6', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#22c55e', '#6b7280'];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color || '#818cf8', fontSize: '13px', fontWeight: 600 }}>
          {p.name}: ₹{Number(p.value).toLocaleString('en-IN')}
        </p>
      ))}
    </div>
  );
};

type Tab = 'summary' | 'categories' | 'trends';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

export const Analytics: React.FC = () => {
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/analytics');
        if (res.data) {
          setCategoryData(res.data.category_breakdown || []);
          setMonthlyData(res.data.monthly_trend || []);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchAnalytics();
  }, []);

  const handleExport = async (type: 'csv' | 'pdf') => {
    try {
      const res = await api.get(`/transactions/export?format=${type}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `finlo-report.${type}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

  // Summary computations
  const totalExpenses = monthlyData.reduce((s, m) => s + (m.expenses || 0), 0);
  const totalIncome = monthlyData.reduce((s, m) => s + (m.income || 0), 0);
  const monthCount = monthlyData.length || 1;
  const avgDaily = totalExpenses / (monthCount * 30);
  const highestMonth = monthlyData.reduce((max, m) => (m.expenses || 0) > (max.expenses || 0) ? m : max, { expenses: 0 });
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  // Category MoM change
  const categoryWithChange = categoryData.map(c => ({
    ...c,
    change: c.prev_value ? ((c.value - c.prev_value) / c.prev_value) * 100 : null,
  }));

  // Anomaly detection (simple: >2x average)
  const avgMonthly = totalExpenses / monthCount;
  const anomalies = monthlyData.filter(m => (m.expenses || 0) > avgMonthly * 1.5);

  const savingsData = monthlyData.map(m => ({
    ...m,
    savings: (m.income || 0) - (m.expenses || 0),
  }));

  const tabs = [
    { id: 'summary' as Tab, label: 'Summary' },
    { id: 'categories' as Tab, label: 'Categories' },
    { id: 'trends' as Tab, label: 'Trends' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-sm mt-0.5 text-muted">Visual breakdown of your spending patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-white/10 text-muted hover:text-foreground hover:bg-white/5 transition-all">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-white/10 text-muted hover:text-foreground hover:bg-white/5 transition-all">
            <FileText size={13} /> PDF
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.id ? 'text-foreground bg-primary/15 border border-primary/20' : 'text-muted'}`}
          >{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid lg:grid-cols-2 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className={`glass-panel p-6 ${i === 3 ? 'lg:col-span-2' : ''}`}>
              <div className="skeleton h-4 w-40 rounded mb-4" />
              <div className="skeleton h-64 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : monthlyData.length === 0 && categoryData.length === 0 ? (
        <div className="glass-panel p-16 text-center" style={{ borderStyle: 'dashed' }}>
          <BarChart3 size={32} className="mx-auto mb-3 opacity-20 text-muted" />
          <p className="text-sm text-muted">Add transactions to see your spending analytics here.</p>
        </div>
      ) : (
        <>
          {/* Summary View */}
          {tab === 'summary' && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Spend', value: fmt(totalExpenses), icon: IndianRupee, color: '#fb7185' },
                  { label: 'Avg Daily', value: fmt(Math.round(avgDaily)), icon: TrendingUp, color: '#f59e0b' },
                  { label: 'Highest Month', value: fmt(highestMonth.expenses || 0), icon: ArrowUpRight, color: '#ef4444', sub: highestMonth.month },
                  { label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, icon: Sparkles, color: savingsRate > 20 ? '#22c55e' : '#f59e0b' },
                ].map(({ label, value, icon: Icon, color, sub }) => (
                  <div key={label} className="glass-panel p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <span className="text-xs text-muted font-medium uppercase">{label}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{value}</p>
                    {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>

              {/* Income vs Expenses */}
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Income vs Expenses</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Income" />
                      <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Insight Cards */}
              {anomalies.length > 0 && (
                <div className="glass-panel p-5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                    <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                    Spending Anomalies
                  </h3>
                  <div className="space-y-2">
                    {anomalies.map((m, i) => (
                      <div key={i} className="p-3 rounded-xl text-sm" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <span className="text-foreground font-medium">{m.month}:</span>
                        <span className="text-muted"> Spending of {fmt(m.expenses)} is {((m.expenses / avgMonthly - 1) * 100).toFixed(0)}% above your average ({fmt(Math.round(avgMonthly))})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Categories View */}
          {tab === 'categories' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Spending by Category</h3>
                {categoryData.length === 0 ? (
                  <p className="text-muted text-sm text-center py-20">No expenses this period</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                          {categoryData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => fmt(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Category Breakdown</h3>
                <div className="space-y-3">
                  {categoryWithChange.sort((a, b) => b.value - a.value).map((c, i) => {
                    const total = categoryData.reduce((s: number, x: any) => s + x.value, 0);
                    const pct = total > 0 ? (c.value / total) * 100 : 0;
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="font-medium text-foreground">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">{fmt(c.value)} ({pct.toFixed(0)}%)</span>
                            {c.change !== null && (
                              <span className={`text-xs ${c.change > 0 ? 'text-danger' : 'text-success'}`}>
                                {c.change > 0 ? '+' : ''}{c.change.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Trends View */}
          {tab === 'trends' && (
            <div className="space-y-6">
              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Expense Trend</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="expenses" fill="#6366f1" radius={[4, 4, 0, 0]} name="Expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Savings Trend</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={savingsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="savings" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 4, fill: '#14b8a6' }} activeDot={{ r: 6 }} name="Savings" />
                      <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Expenses" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
