import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { Check, AlertTriangle, Plus, Trash2, ArrowRight, ShieldAlert, Sparkles, Link2 } from 'lucide-react';
import { api } from '../services/api';
import type { ParsedReceipt, Receipt } from '../types';
import clsx from 'clsx';

const ConfidenceBadge = ({ conf }: { conf?: number }) => {
  if (conf === undefined || conf > 0.8) return null;
  const isLow = conf < 0.6;
  return (
    <div
      className={clsx(
        'absolute right-2.5 top-2.5 flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium',
        isLow
          ? 'bg-danger/10 text-danger border border-danger/20'
          : 'bg-warning/10 text-warning border border-warning/20'
      )}
    >
      <AlertTriangle size={10} />
      {Math.round(conf * 100)}%
    </div>
  );
};

const EMPTY_RECEIPT: ParsedReceipt = {
  merchant: '',
  date: '',
  due_date: '',
  total: 0,
  tax: 0,
  currency: 'INR',
  category_suggestion: '',
  recurring_indicator: false,
  account_suffix: '',
  parser_provider: '',
  items: [],
  field_confidence: {},
};

export const Review: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!location.state?.parsed);
  const [error, setError] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<number>(location.state?.confidence || 0);
  const [duplicateOfReceiptId, setDuplicateOfReceiptId] = useState<string | null>(location.state?.duplicate_of_receipt_id || null);
  const [duplicateConfidence, setDuplicateConfidence] = useState<number | null>(location.state?.duplicate_confidence || null);

  const initialParsed: ParsedReceipt = useMemo(() => location.state?.parsed || EMPTY_RECEIPT, [location.state]);

  const { register, control, handleSubmit, reset } = useForm<ParsedReceipt>({
    defaultValues: initialParsed,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    const loadReceipt = async () => {
      if (location.state?.parsed || !id) return;
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get<Receipt>(`/receipts/${id}`);
        const parsedFromReceipt: ParsedReceipt = {
          merchant: data.merchant || '',
          date: data.date || '',
          due_date: data.due_date || '',
          total: data.total || 0,
          tax: data.tax || 0,
          currency: data.currency || 'INR',
          category_suggestion: data.category_suggestion || '',
          recurring_indicator: data.recurring_indicator || false,
          account_suffix: data.account_suffix || '',
          parser_provider: data.parser_provider || '',
          items: data.items || [],
          field_confidence: {},
        };
        reset(parsedFromReceipt);
        setOcrConfidence(data.ocr_confidence || 0);
        setDuplicateOfReceiptId(data.duplicate_of_receipt_id || null);
        setDuplicateConfidence(data.duplicate_confidence || null);
      } catch (err: any) {
        setError(err?.response?.data?.detail || 'Unable to load receipt details.');
      } finally {
        setLoading(false);
      }
    };

    loadReceipt();
  }, [id, location.state, reset]);

  const onSubmit = async (data: ParsedReceipt) => {
    if (!id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/confirm', { receipt_id: id, edits: data });
      navigate('/transactions');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to confirm receipt');
      setSubmitting(false);
    }
  };

  const getConfColor = (conf: number) => {
    if (conf >= 0.8) return '#34d399';
    if (conf >= 0.6) return '#fbbf24';
    return '#fb7185';
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in space-y-4">
        <div className="skeleton h-10 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Receipt</h1>
          <p className="text-sm mt-0.5 text-muted">Confirm or edit extracted fields before saving.</p>
        </div>
        {ocrConfidence > 0 && (
          <div
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm"
            style={{
              background: `rgba(${ocrConfidence >= 0.8 ? '16,185,129' : ocrConfidence >= 0.6 ? '245,158,11' : '244,63,94'},0.1)`,
              border: `1px solid rgba(${ocrConfidence >= 0.8 ? '16,185,129' : ocrConfidence >= 0.6 ? '245,158,11' : '244,63,94'},0.2)`,
            }}
          >
            <Sparkles size={14} style={{ color: getConfColor(ocrConfidence) }} />
            <span style={{ color: getConfColor(ocrConfidence) }}>
              Extraction confidence: <strong>{Math.round(ocrConfidence * 100)}%</strong>
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl text-sm animate-slide-up" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185' }}>
          <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {duplicateOfReceiptId && (
        <div className="flex items-start gap-3 p-4 rounded-xl text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', color: '#fbbf24' }}>
          <Link2 size={15} className="flex-shrink-0 mt-0.5" />
          <div>
            <p>Possible duplicate detected for receipt <strong>{duplicateOfReceiptId}</strong>.</p>
            {typeof duplicateConfidence === 'number' && <p className="text-xs mt-1">Confidence: {Math.round(duplicateConfidence * 100)}%</p>}
          </div>
        </div>
      )}

      {ocrConfidence > 0 && ocrConfidence < 0.6 && (
        <div className="flex items-start gap-3 p-4 rounded-xl text-sm" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', color: '#fbbf24' }}>
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          Low confidence extraction. Please review all fields carefully before confirming.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="glass-panel p-6">
          <h2 className="text-sm font-semibold text-foreground mb-5">Receipt details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="relative">
              <label className="label-text">Merchant Name</label>
              <input {...register('merchant')} className="input-field" placeholder="Store or merchant" />
              <ConfidenceBadge conf={initialParsed.field_confidence?.merchant} />
            </div>
            <div className="relative">
              <label className="label-text">Date</label>
              <input type="date" {...register('date')} className="input-field" />
              <ConfidenceBadge conf={initialParsed.field_confidence?.date} />
            </div>
            <div>
              <label className="label-text">Due Date</label>
              <input type="date" {...register('due_date')} className="input-field" />
            </div>
            <div>
              <label className="label-text">Category Suggestion</label>
              <input {...register('category_suggestion')} className="input-field" placeholder="e.g. Utilities" />
            </div>
            <div className="relative">
              <label className="label-text">Total Amount</label>
              <input type="number" step="0.01" {...register('total', { valueAsNumber: true })} className="input-field" placeholder="0.00" />
              <ConfidenceBadge conf={initialParsed.field_confidence?.total} />
            </div>
            <div className="relative">
              <label className="label-text">Tax</label>
              <input type="number" step="0.01" {...register('tax', { valueAsNumber: true })} className="input-field" placeholder="0.00" />
              <ConfidenceBadge conf={initialParsed.field_confidence?.tax} />
            </div>
            <div>
              <label className="label-text">Currency</label>
              <select {...register('currency')} className="input-field">
                {['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD'].map((currencyCode) => (
                  <option key={currencyCode} value={currencyCode}>{currencyCode}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text">Account/Card Suffix</label>
              <input {...register('account_suffix')} className="input-field" maxLength={4} placeholder="Last 4 digits" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" {...register('recurring_indicator')} className="rounded" />
            Mark as recurring bill
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-foreground">Line items</h2>
            <button
              type="button"
              onClick={() => append({ name: '', price: 0, quantity: 1, category: '' })}
              className="flex items-center gap-1.5 text-xs font-medium transition-colors px-3 py-1.5 rounded-lg"
              style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <Plus size={13} /> Add Item
            </button>
          </div>

          <div className="space-y-3">
            {fields.length === 0 && (
              <div className="text-center py-8 rounded-xl text-sm text-muted" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
                No line items extracted. Add items manually if needed.
              </div>
            )}
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-3 p-4 rounded-xl animate-fade-in" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex-1 space-y-3">
                  <input {...register(`items.${index}.name`)} placeholder="Item name" className="input-field text-sm" />
                  <div className="grid grid-cols-3 gap-3">
                    <input type="number" step="0.01" {...register(`items.${index}.price`, { valueAsNumber: true })} placeholder="Price" className="input-field text-sm py-2" />
                    <input type="number" step="0.01" {...register(`items.${index}.quantity`, { valueAsNumber: true })} placeholder="Qty" className="input-field text-sm py-2" />
                    <input {...register(`items.${index}.category`)} placeholder="Category" className="input-field text-sm py-2" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-2 rounded-lg transition-all duration-200 mt-0.5 flex-shrink-0 text-muted hover:text-danger hover:bg-danger/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" id="review-confirm-btn" disabled={submitting} className="btn-primary flex items-center gap-2 px-8 py-3">
            {submitting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <Check size={16} />
                Confirm and save
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
