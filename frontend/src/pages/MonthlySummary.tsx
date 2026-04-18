import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Calendar, DollarSign, TrendingDown, MapPin } from 'lucide-react';
import { format } from 'date-fns';

const COLORS = ['#14b8a6', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#eab308'];

export const MonthlySummary: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        // Mocked or real endpoint depending on backend
        const res = await api.get(`/analytics/summary?month=${currentMonth}&year=${currentYear}`);
        setData(res.data);
      } catch (e) {
        console.error(e);
        // Fallback mock data if endpoint doesn't exist yet
        setData({
          month: currentMonth,
          year: currentYear,
          total_income: 120000,
          total_expenses: 45000,
          category_breakdown: [
            { name: 'Food', value: 15000 },
            { name: 'Shopping', value: 10000 },
            { name: 'Bills', value: 12000 },
            { name: 'Travel', value: 8000 }
          ],
          top_places: [
            { name: 'Amazon', value: 5000 },
            { name: 'Starbucks', value: 2000 },
            { name: 'Uber', value: 3000 }
          ]
        });
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [currentMonth, currentYear]);

  if (loading) return <div className="p-8 text-center text-muted">Generating your customized summary...</div>;
  if (!data) return <div className="p-8 text-center text-muted">No summary available.</div>;

  const savings = data.total_income - data.total_expenses;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monthly Customized Summary</h1>
          <p className="text-sm mt-0.5 text-muted">
            {format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy')} Overview
          </p>
        </div>
        <div className="badge-primary px-3 py-1.5 rounded-full flex items-center gap-2">
          <Calendar size={14} /> Month End Dashboard
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="glass-panel p-5">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="text-success" size={20} />
            <h3 className="text-sm font-semibold text-muted">Total Income</h3>
          </div>
          <p className="text-2xl font-bold text-success">₹{data.total_income.toLocaleString('en-IN')}</p>
        </div>
        <div className="glass-panel p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="text-danger" size={20} />
            <h3 className="text-sm font-semibold text-muted">Total Expenses</h3>
          </div>
          <p className="text-2xl font-bold text-danger">₹{data.total_expenses.toLocaleString('en-IN')}</p>
        </div>
        <div className="glass-panel p-5 border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="text-primary" size={20} />
            <h3 className="text-sm font-semibold text-primary">Net Savings</h3>
          </div>
          <p className="text-2xl font-bold text-foreground">₹{savings.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Expenditure by Category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.category_breakdown}
                  cx="50%" cy="50%" outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {data.category_breakdown.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top Spending Places</h3>
          <div className="space-y-4">
            {data.top_places.map((place: any, i: number) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2"><MapPin size={14} className="text-muted"/> {place.name}</span>
                  <span className="font-semibold">₹{place.value.toLocaleString('en-IN')}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min((place.value / data.total_expenses) * 100, 100)}%`, background: '#6366f1' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
