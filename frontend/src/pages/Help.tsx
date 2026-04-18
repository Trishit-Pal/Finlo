import React, { useState } from 'react';
import { api } from '../services/api';
import {
  HelpCircle, MessageSquare, Bug, Lightbulb, Star,
  ChevronDown, ChevronUp, Send, Check, RotateCcw
} from 'lucide-react';

const FAQ_ITEMS = [
  { q: 'How do I add an expense?', a: 'Tap the "+" button on the Dashboard or go to Transactions and click "Add Transaction". Fill in the amount, merchant, category, payment mode, and date.' },
  { q: 'How does bill scanning work?', a: 'Go to Upload, take a photo or upload an image of your bill. Our OCR engine extracts the total, merchant, and date automatically. Review the parsed data and save.' },
  { q: 'How are budgets tracked?', a: 'Set monthly budgets per category in the Budgets tab. Progress bars show green (0-70%), amber (70-90%), and red (>90%). You get alerts at 80% and 100%.' },
  { q: 'Is my financial data secure?', a: 'Yes. All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Financial fields use column-level encryption. Bill images are processed on-device and never stored on servers.' },
  { q: 'What is the AI Summary feature?', a: 'An optional feature that sends anonymised category totals (no merchant names or personal data) to generate a natural-language spending summary. You can opt in/out in Settings > Privacy.' },
  { q: 'How do I track debts and loans?', a: 'Go to Debts & Loans tab. Add personal loans, credit cards, or IOUs. Log payments to reduce balances. View total outstanding and monthly EMI at a glance.' },
  { q: 'Can I export my data?', a: 'Yes. Go to Analytics/Reports and click Export. You can download your transactions as CSV or PDF. Data is encrypted before download.' },
  { q: 'How does the session lock work?', a: 'Set a 4-6 digit PIN in Settings > Security. After 5 minutes of inactivity, the app locks and requires your PIN to re-enter.' },
  { q: 'What currencies are supported?', a: 'INR is the default. You can change your currency in Settings > Preferences. Supported: INR, USD, EUR, GBP, CAD, AUD, JPY, CHF, SGD.' },
  { q: 'How do savings goals work?', a: 'Create goals with a target amount and optional deadline. Add contributions over time. The app shows daily savings needed to reach your target on time.' },
];

type Tab = 'faq' | 'bug' | 'feature' | 'feedback';

export const Help: React.FC = () => {
  const [tab, setTab] = useState<Tab>('faq');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [bugForm, setBugForm] = useState({ text: '', screen: '' });
  const [featureForm, setFeatureForm] = useState({ text: '' });
  const [feedbackForm, setFeedbackForm] = useState({ screen: '', rating: 0, text: '' });

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/feedback', {
      text: bugForm.text,
      screen: bugForm.screen || null,
      is_bug_report: true,
      classification: 'Bug',
    });
    setBugForm({ text: '', screen: '' });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleFeatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/feedback', {
      feature_request: featureForm.text,
      classification: 'FeatureRequest',
    });
    setFeatureForm({ text: '' });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/feedback', {
      screen: feedbackForm.screen || null,
      rating: feedbackForm.rating || null,
      text: feedbackForm.text || null,
    });
    setFeedbackForm({ screen: '', rating: 0, text: '' });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const tabs = [
    { id: 'faq' as Tab, label: 'FAQ', icon: HelpCircle },
    { id: 'bug' as Tab, label: 'Report Bug', icon: Bug },
    { id: 'feature' as Tab, label: 'Feature Request', icon: Lightbulb },
    { id: 'feedback' as Tab, label: 'Feedback', icon: MessageSquare },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Help & Support</h1>
        <p className="text-sm mt-0.5 text-muted">FAQs, bug reports, and feedback</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSubmitted(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'text-foreground' : 'text-muted hover:text-foreground'
            }`}
            style={{
              background: tab === t.id ? 'rgba(99,102,241,0.1)' : 'transparent',
              border: tab === t.id ? '1px solid rgba(99,102,241,0.15)' : '1px solid transparent',
            }}
          >
            <t.icon size={15} style={{ color: tab === t.id ? '#818cf8' : undefined }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Restart Onboarding */}
      <button
        onClick={async () => {
          await api.patch('/auth/me', { settings: { onboarding_completed: false } });
          window.location.href = '/dashboard';
        }}
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg text-muted border border-white/10 hover:text-foreground hover:bg-white/5 transition-all"
      >
        <RotateCcw size={13} /> Restart Onboarding Guide
      </button>

      {/* Success Banner */}
      {submitted && (
        <div className="p-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#34d399' }}>
          <Check size={16} /> Thank you! Your submission has been received.
        </div>
      )}

      {/* FAQ */}
      {tab === 'faq' && (
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="glass-panel overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-medium text-foreground pr-4">{item.q}</span>
                {expandedFaq === i ? <ChevronUp size={16} className="text-muted flex-shrink-0" /> : <ChevronDown size={16} className="text-muted flex-shrink-0" />}
              </button>
              {expandedFaq === i && (
                <div className="px-5 pb-4 animate-fade-in">
                  <p className="text-sm text-muted leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bug Report */}
      {tab === 'bug' && (
        <form onSubmit={handleBugSubmit} className="glass-panel p-6 space-y-4">
          <div>
            <label className="label-text">Which screen has the issue?</label>
            <input value={bugForm.screen} onChange={e => setBugForm(f => ({ ...f, screen: e.target.value }))} className="input-field" placeholder="e.g. Dashboard, Bills, etc." />
          </div>
          <div>
            <label className="label-text">Describe the bug</label>
            <textarea value={bugForm.text} onChange={e => setBugForm(f => ({ ...f, text: e.target.value }))} className="input-field min-h-[120px] resize-y" placeholder="What happened? What did you expect to happen?" required />
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Send size={14} /> Submit Bug Report
          </button>
        </form>
      )}

      {/* Feature Request */}
      {tab === 'feature' && (
        <form onSubmit={handleFeatureSubmit} className="glass-panel p-6 space-y-4">
          <div>
            <label className="label-text">What feature would you like?</label>
            <textarea value={featureForm.text} onChange={e => setFeatureForm(f => ({ ...f, text: e.target.value }))} className="input-field min-h-[120px] resize-y" placeholder="Describe the feature you'd like to see..." required />
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Lightbulb size={14} /> Submit Feature Request
          </button>
        </form>
      )}

      {/* Micro-Feedback */}
      {tab === 'feedback' && (
        <form onSubmit={handleFeedbackSubmit} className="glass-panel p-6 space-y-4">
          <div>
            <label className="label-text">Screen (optional)</label>
            <input value={feedbackForm.screen} onChange={e => setFeedbackForm(f => ({ ...f, screen: e.target.value }))} className="input-field" placeholder="e.g. Dashboard, Analytics..." />
          </div>
          <div>
            <label className="label-text">Rating</label>
            <div className="flex gap-2 mt-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFeedbackForm(f => ({ ...f, rating: n }))}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: feedbackForm.rating >= n ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${feedbackForm.rating >= n ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    color: feedbackForm.rating >= n ? '#818cf8' : '#888899',
                  }}
                >
                  <Star size={16} fill={feedbackForm.rating >= n ? '#818cf8' : 'none'} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-text">Comments (optional)</label>
            <textarea value={feedbackForm.text} onChange={e => setFeedbackForm(f => ({ ...f, text: e.target.value }))} className="input-field min-h-[80px] resize-y" placeholder="Any additional thoughts..." />
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Send size={14} /> Submit Feedback
          </button>
        </form>
      )}
    </div>
  );
};
