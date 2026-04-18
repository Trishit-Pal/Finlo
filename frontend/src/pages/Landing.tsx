import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Handshake,
  Lock,
  Menu,
  PiggyBank,
  Shield,
  Sparkles,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';

const sectionCards = [
  {
    icon: Handshake,
    title: 'Connect with consent',
    text: 'Start with manual tracking today. Add statement import only when you explicitly approve it.',
    accent: '#14b8a6',
  },
  {
    icon: TrendingUp,
    title: 'Track spend clearly',
    text: 'See where money goes every day with timeline views, category breakdowns, and trend snapshots.',
    accent: '#6366f1',
  },
  {
    icon: PiggyBank,
    title: 'Budget monthly with guardrails',
    text: 'Create monthly limits and manage one controlled update per budget for audit-friendly financial discipline.',
    accent: '#f59e0b',
  },
  {
    icon: FileSearch,
    title: 'Scan bills with AI',
    text: 'Upload PDF or image bills, review extraction confidence, and approve before saving any transaction.',
    accent: '#8b5cf6',
  },
];

const privacyPoints = [
  'Sensitive profile fields are immutable after first set/import.',
  'Financial actions are tracked with audit events for accountability.',
  'Uploads validate size/type and avoid storing raw data unless explicitly enabled.',
  'No storage of CVV or full card numbers. Consent is mandatory for ingestion.',
];

const faqs = [
  {
    q: 'Can Finlo directly fetch my bank or UPI history?',
    a: 'Direct universal UPI/card pull is not broadly available in this stack. Finlo prioritizes explicit consent and safe alternatives like statement imports.',
  },
  {
    q: 'Do I need to trust AI output blindly?',
    a: 'No. Every scanned bill goes through a review-before-save step with confidence hints and editable fields.',
  },
  {
    q: 'What happens to my profile identity fields?',
    a: 'Username and date of birth are locked after first set/import to preserve integrity and prevent silent identity drift.',
  },
];

const LandingNav: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const anchors = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'actions', label: 'User Actions' },
      { id: 'privacy', label: 'Trust & Privacy' },
      { id: 'faq', label: 'FAQ' },
    ],
    []
  );

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileOpen(false);
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6"
      style={{
        background: 'rgba(13,13,18,0.88)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="mx-auto max-w-6xl h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
          >
            <Wallet size={18} />
          </div>
          <span
            className="text-lg font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg,#818cf8,#c4b5fd)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Finlo
          </span>
        </div>

        <div className="hidden md:flex items-center gap-7">
          {anchors.map((a) => (
            <button key={a.id} onClick={() => scrollTo(a.id)} className="text-sm text-muted hover:text-foreground transition-colors">
              {a.label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-muted hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link to="/login" className="btn-primary text-sm px-4 py-2">
            Get Started
          </Link>
        </div>

        <button className="md:hidden text-foreground" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden pb-3 space-y-1">
          {anchors.map((a) => (
            <button
              key={a.id}
              onClick={() => scrollTo(a.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-white/5"
            >
              {a.label}
            </button>
          ))}
          <div className="grid grid-cols-2 gap-2 px-1 pt-2">
            <Link to="/login" className="btn-secondary text-center text-sm py-2">Sign In</Link>
            <Link to="/login" className="btn-primary text-center text-sm py-2">Get Started</Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export const Landing: React.FC = () => {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <LandingNav />

      <div
        className="absolute top-[-12%] left-[-6%] w-[40rem] h-[40rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 60%)', filter: 'blur(60px)' }}
      />
      <div
        className="absolute bottom-[-15%] right-[-8%] w-[42rem] h-[42rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.12) 0%, transparent 60%)', filter: 'blur(70px)' }}
      />

      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-28 sm:pt-32 pb-16 sm:pb-20">
          <div className="glass-panel p-6 sm:p-10 lg:p-12 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-80 h-80 rounded-full pointer-events-none" style={{ background: 'rgba(99,102,241,0.1)', filter: 'blur(70px)' }} />
            <div className="relative z-10 grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 badge-primary text-xs mb-4">
                  <Sparkles size={12} />
                  Secure Expense Tracking
                </div>
                <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight">
                  One place to track spending, budgets, and bills with confidence.
                </h1>
                <p className="mt-4 text-sm sm:text-base text-muted max-w-xl">
                  Finlo helps you import, scan, review, and organize expenses while keeping consent, security, and transparency front and center.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Link to="/login" className="btn-primary flex items-center justify-center gap-2 px-6 py-3">
                    Start Free
                    <ArrowRight size={16} />
                  </Link>
                  <a href="#overview" className="btn-secondary px-6 py-3 text-center">Explore features</a>
                </div>
                <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-success" />No card required</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-success" />Review-before-save flow</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-success" />Audit-friendly actions</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sectionCards.map(({ icon: Icon, title, text, accent }) => (
                  <div key={title} className="glass-panel-hover p-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}>
                      <Icon size={16} style={{ color: accent }} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="overview" className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-panel p-6 sm:p-7">
              <p className="text-xs uppercase tracking-wide text-primary mb-2">Product Overview</p>
              <h2 className="text-2xl font-bold">Track every rupee with structure</h2>
              <p className="text-sm text-muted mt-3 leading-relaxed">
                Manage receipts, transactions, bills, and summaries in one consistent workflow built for mobile and desktop. From quick entries to deep category analysis, Finlo keeps things clear and actionable.
              </p>
            </div>
            <div className="glass-panel p-6 sm:p-7">
              <p className="text-xs uppercase tracking-wide text-primary mb-2">Linking & Imports</p>
              <h2 className="text-2xl font-bold">Safe connection model</h2>
              <p className="text-sm text-muted mt-3 leading-relaxed">
                Use statement import today. Consent is captured before any ingestion workflow. Higher-risk account linking remains feature-gated until provider and compliance requirements are met.
              </p>
            </div>
          </div>
        </section>

        <section id="actions" className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="text-center mb-7">
            <h2 className="text-2xl sm:text-3xl font-bold">Core user actions, one consistent experience</h2>
            <p className="text-sm text-muted mt-2">Create budgets, track expenses, upload bills, review transactions, and manage profile settings from a shared UI language.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="glass-panel p-5">
              <Upload size={18} className="text-primary mb-3" />
              <p className="font-semibold">Scan and review bills</p>
              <p className="text-xs text-muted mt-1.5">PDF, JPG, PNG, and WebP support with extraction confidence and duplicate checks.</p>
            </div>
            <div className="glass-panel p-5">
              <PiggyBank size={18} className="text-warning mb-3" />
              <p className="font-semibold">Monthly budget controls</p>
              <p className="text-xs text-muted mt-1.5">Create a monthly budget and use one guarded edit window with backend validation.</p>
            </div>
            <div className="glass-panel p-5">
              <Lock size={18} className="text-success mb-3" />
              <p className="font-semibold">Profile integrity</p>
              <p className="text-xs text-muted mt-1.5">Username and date of birth are immutable after first set or trusted import.</p>
            </div>
          </div>
        </section>

        <section id="privacy" className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="glass-panel p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} className="text-primary" />
              <h2 className="text-2xl font-bold">Trust, privacy, and control</h2>
            </div>
            <p className="text-sm text-muted mb-5 max-w-3xl">
              Finlo is designed to minimize sensitive exposure, enforce explicit consent, and preserve an auditable chain of user actions.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {privacyPoints.map((point) => (
                <div key={point} className="p-3 rounded-xl text-sm text-muted" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {point}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold">FAQ and support</h2>
            <p className="text-sm text-muted mt-2">Quick answers before you sign in.</p>
          </div>
          <div className="space-y-3">
            {faqs.map((item, idx) => {
              const open = openFaq === idx;
              return (
                <div key={item.q} className="glass-panel overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(open ? -1 : idx)}
                    className="w-full flex items-center justify-between text-left px-4 py-4"
                  >
                    <span className="text-sm font-medium text-foreground">{item.q}</span>
                    <ChevronDown size={16} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <p className="text-sm text-muted px-4 pb-4">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-20">
          <div className="glass-panel p-8 sm:p-10 text-center" style={{ border: '1px solid rgba(99,102,241,0.2)' }}>
            <h2 className="text-2xl sm:text-3xl font-bold">Ready to start?</h2>
            <p className="text-sm text-muted mt-2">Build healthier money habits with secure tracking, clear budgets, and confident reviews.</p>
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 mt-6 px-7 py-3">
              Create your account
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-4 sm:px-6 py-6 text-xs text-muted border-t border-white/5">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Finlo. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link to="/help" className="hover:text-foreground transition-colors">Help</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <a href="#privacy" className="hover:text-foreground transition-colors">Privacy posture</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
