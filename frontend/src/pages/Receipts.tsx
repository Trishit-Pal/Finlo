import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Receipt } from '../types';
import { Receipt as ReceiptIcon, Search, Clock, CheckCircle, ChevronRight, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const STATUS_BADGE: Record<string, React.ReactElement> = {
  confirmed: <span className="badge-success">Confirmed</span>,
  pending:   <span className="badge-warning">Pending</span>,
  reviewed:  <span className="badge-primary">Reviewed</span>,
};

const ReceiptSkeleton = () => (
  <div className="glass-panel p-4 flex items-center gap-4">
    <div className="skeleton w-10 h-10 rounded-xl" />
    <div className="flex-1 space-y-2">
      <div className="skeleton h-3 w-40 rounded" />
      <div className="skeleton h-2.5 w-24 rounded" />
    </div>
    <div className="skeleton h-5 w-16 rounded-full" />
    <div className="skeleton h-5 w-14 rounded" />
  </div>
);

export const Receipts: React.FC = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('all');

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/receipts');
        setReceipts(res.data?.items || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const filtered = receipts.filter(r => {
    const matchSearch = !search ||
      r.merchant?.toLowerCase().includes(search.toLowerCase()) ||
      r.date?.includes(search);
    const matchFilter = filter === 'all' || r.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-sm mt-0.5 text-muted">
            All your uploaded and processed receipts
          </p>
        </div>
        <Link to="/upload" className="btn-primary flex items-center gap-2 text-sm">
          <ReceiptIcon size={15} />
          New Receipt
        </Link>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3.5 top-3 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by merchant or date..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 text-sm"
          />
        </div>

        {/* Status filter */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {(['all', 'pending', 'confirmed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 capitalize"
              style={{
                background: filter === f ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: filter === f ? '#818cf8' : '#888899',
                border: filter === f ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total', value: receipts.length, icon: ReceiptIcon, color: '#818cf8' },
          { label: 'Pending', value: receipts.filter(r => r.status === 'pending').length, icon: Clock, color: '#fbbf24' },
          { label: 'Confirmed', value: receipts.filter(r => r.status === 'confirmed').length, icon: CheckCircle, color: '#34d399' },
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

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <ReceiptSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div
            className="glass-panel p-12 text-center"
            style={{ borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <ReceiptIcon size={32} className="mx-auto mb-3 opacity-20 text-muted" />
            <p className="text-sm text-muted">
              {search || filter !== 'all' ? 'No receipts match your filters.' : 'No receipts yet. Upload your first one!'}
            </p>
            {!search && filter === 'all' && (
              <Link to="/upload" className="btn-primary inline-flex items-center gap-2 text-sm mt-4">
                Upload Receipt
              </Link>
            )}
          </div>
        ) : (
          filtered.map(r => (
            <Link
              key={r.id}
              to={`/review/${r.id}`}
              className="glass-panel-hover p-4 flex items-center gap-4 cursor-pointer group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.15)' }}
              >
                <ReceiptIcon size={18} style={{ color: '#818cf8' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">
                  {r.merchant || 'Unknown Merchant'}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {r.date || 'No date'} · {r.currency}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {r.category_suggestion || 'Uncategorized'}
                  {r.recurring_indicator ? ' · recurring' : ''}
                  {r.parser_provider ? ` · ${r.parser_provider}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {r.duplicate_of_receipt_id && (
                  <span className="badge-warning flex items-center gap-1">
                    <Link2 size={10} />
                    Dup
                  </span>
                )}
                {STATUS_BADGE[r.status] || <span className="badge-primary capitalize">{r.status}</span>}
                <span className="text-sm font-semibold text-foreground">
                  {r.total != null ? `${r.currency} ${r.total.toFixed(2)}` : '—'}
                </span>
                <ChevronRight
                  size={16}
                  className="text-muted group-hover:text-foreground transition-colors"
                />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};
