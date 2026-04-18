import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const sectionCards = [
  {
    icon: Handshake,
    title: "Connect with consent",
    text: "Start with manual tracking today. Add statement import only when you explicitly approve it.",
    accent: "hsl(var(--primary))",
  },
  {
    icon: TrendingUp,
    title: "Track spend clearly",
    text: "See where money goes every day with timeline views, category breakdowns, and trend snapshots.",
    accent: "hsl(var(--primary))",
  },
  {
    icon: PiggyBank,
    title: "Budget monthly with guardrails",
    text: "Create monthly limits and manage one controlled update per budget for audit-friendly financial discipline.",
    accent: "hsl(var(--warning))",
  },
  {
    icon: FileSearch,
    title: "Scan bills with AI",
    text: "Upload PDF or image bills, review extraction confidence, and approve before saving any transaction.",
    accent: "hsl(var(--info))",
  },
];

const privacyPoints = [
  "Sensitive profile fields are immutable after first set/import.",
  "Financial actions are tracked with audit events for accountability.",
  "Uploads validate size/type and avoid storing raw data unless explicitly enabled.",
  "No storage of CVV or full card numbers. Consent is mandatory for ingestion.",
];

const faqs = [
  {
    q: "Can Finlo directly fetch my bank or UPI history?",
    a: "Direct universal UPI/card pull is not broadly available in this stack. Finlo prioritizes explicit consent and safe alternatives like statement imports.",
  },
  {
    q: "Do I need to trust AI output blindly?",
    a: "No. Every scanned bill goes through a review-before-save step with confidence hints and editable fields.",
  },
  {
    q: "What happens to my profile identity fields?",
    a: "Username and date of birth are locked after first set/import to preserve integrity and prevent silent identity drift.",
  },
];

const LandingNav: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const anchors = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "actions", label: "User Actions" },
      { id: "privacy", label: "Trust & Privacy" },
      { id: "faq", label: "FAQ" },
    ],
    [],
  );

  const scrollTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 bg-background/80 backdrop-blur-lg border-b border-border/40">
      <div className="mx-auto max-w-6xl h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-primary-foreground shadow-sm"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.8))",
            }}
          >
            <Wallet size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-400">
            Finlo
          </span>
        </div>

        <div className="hidden md:flex items-center gap-7">
          {anchors.map((a) => (
            <button
              key={a.id}
              onClick={() => scrollTo(a.id)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </Link>
          <Button asChild size="sm">
            <Link to="/login">Get Started</Link>
          </Button>
        </div>

        <button
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden pb-4 pt-2 space-y-1 bg-background border-t border-border/40 mt-1">
          {anchors.map((a) => (
            <button
              key={a.id}
              onClick={() => scrollTo(a.id)}
              className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              {a.label}
            </button>
          ))}
          <div className="grid grid-cols-2 gap-3 px-4 pt-4 mt-2 border-t border-border/20">
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Sign In</Link>
            </Button>
            <Button asChild className="w-full">
              <Link to="/login">Get Started</Link>
            </Button>
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

      {/* Decorative Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-32 sm:pt-40 pb-20 sm:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6 border border-primary/20">
                <Sparkles size={14} />
                Secure Expense Tracking
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight">
                Track spending, budgets, and bills with{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-400">
                  confidence.
                </span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed">
                Finlo helps you import, scan, review, and organize expenses
                while keeping consent, security, and transparency front and
                center.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Button
                  asChild
                  size="lg"
                  className="h-14 px-8 text-base shadow-lg shadow-primary/25"
                >
                  <Link to="/login" className="gap-2">
                    Start for free <ArrowRight size={18} />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 text-base"
                >
                  <a href="#overview">Explore features</a>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-success" />
                  No credit card required
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-success" />
                  Review-before-save
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-success" />
                  Data stays private
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:pl-8">
              {sectionCards.map(({ icon: Icon, title, text, accent }) => (
                <Card
                  key={title}
                  className="glass-card hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  <CardContent className="p-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                      style={{
                        background: `color-mix(in srgb, ${accent} 15%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
                      }}
                    >
                      <Icon size={20} style={{ color: accent }} />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                      {title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {text}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          id="overview"
          className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24"
        >
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            <Card className="glass-card border-border/40 hover:border-primary/20 transition-colors">
              <CardContent className="p-8 sm:p-10">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primary mb-3">
                  Product Overview
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                  Track every rupee with structure
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Manage receipts, transactions, bills, and summaries in one
                  consistent workflow built for mobile and desktop. From quick
                  entries to deep category analysis, Finlo keeps things clear
                  and actionable.
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/40 hover:border-primary/20 transition-colors">
              <CardContent className="p-8 sm:p-10">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primary mb-3">
                  Linking & Imports
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                  Safe connection model
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Use statement import today. Consent is captured before any
                  ingestion workflow. Higher-risk account linking remains
                  feature-gated until provider and compliance requirements are
                  met.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          id="actions"
          className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 bg-card/30 border-y border-border/40"
        >
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Core user actions, one consistent experience
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground">
              Create budgets, track expenses, upload bills, review transactions,
              and manage profile settings from a shared UI language.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            <Card className="glass-card border-border/40 group hover:border-primary/30 transition-all">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Upload size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  Scan and review bills
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  PDF, JPG, PNG, and WebP support with extraction confidence and
                  duplicate checks.
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/40 group hover:border-warning/30 transition-all">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-xl bg-warning/10 text-warning flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <PiggyBank size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  Monthly budget controls
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Create a monthly budget and use one guarded edit window with
                  backend validation.
                </p>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/40 group hover:border-success/30 transition-all">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Lock size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3">
                  Profile integrity
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Username and date of birth are immutable after first set or
                  trusted import.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          id="privacy"
          className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24"
        >
          <Card className="glass-card border-border/40 overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-[300px] h-[300px] rounded-full bg-primary/5 blur-[80px] pointer-events-none" />
            <CardContent className="p-8 md:p-12 relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Shield size={28} className="text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">
                  Trust, privacy, and control
                </h2>
              </div>
              <p className="text-lg text-muted-foreground mb-10 max-w-3xl leading-relaxed">
                Finlo is designed to minimize sensitive exposure, enforce
                explicit consent, and preserve an auditable chain of user
                actions.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 lg:gap-6">
                {privacyPoints.map((point) => (
                  <div
                    key={point}
                    className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border/40"
                  >
                    <CheckCircle2
                      size={20}
                      className="text-success flex-shrink-0 mt-0.5"
                    />
                    <span className="text-sm md:text-base font-medium">
                      {point}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          id="faq"
          className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24"
        >
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              FAQ and support
            </h2>
            <p className="text-lg text-muted-foreground">
              Quick answers before you sign in.
            </p>
          </div>
          <div className="space-y-4">
            {faqs.map((item, idx) => {
              const open = openFaq === idx;
              return (
                <Card
                  key={item.q}
                  className={`glass-card overflow-hidden transition-all duration-300 ${open ? "border-primary/40 shadow-sm" : "border-border/40"}`}
                >
                  <button
                    onClick={() => setOpenFaq(open ? -1 : idx)}
                    className="w-full flex items-center justify-between text-left p-5 sm:p-6 focus:outline-none"
                  >
                    <span className="text-base sm:text-lg font-semibold text-foreground pr-4">
                      {item.q}
                    </span>
                    <div
                      className={`p-1.5 rounded-full bg-muted/50 transition-transform duration-300 flex-shrink-0 ${open ? "rotate-180 bg-primary/10 text-primary" : "text-muted-foreground"}`}
                    >
                      <ChevronDown size={20} />
                    </div>
                  </button>
                  <div
                    className={`transition-all duration-300 overflow-hidden ${open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
                  >
                    <p className="text-base text-muted-foreground px-5 sm:px-6 pb-5 sm:pb-6 leading-relaxed bg-muted/10 pt-2">
                      {item.a}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-24 sm:pb-32 pt-8">
          <Card className="border-border/40 text-center relative overflow-hidden bg-gradient-to-b from-card to-card/50 shadow-xl shadow-primary/5">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-indigo-500/10 pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-400 to-primary" />
            <CardContent className="p-10 sm:p-14 lg:p-16 relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
                Ready to take control?
              </h2>
              <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                Build healthier money habits with secure tracking, clear
                budgets, and confident reviews. Join Finlo today.
              </p>
              <Button
                asChild
                size="lg"
                className="h-14 px-10 text-base shadow-lg shadow-primary/25 rounded-full"
              >
                <Link to="/login" className="gap-2">
                  Create your free account <ArrowRight size={18} />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="px-4 sm:px-6 py-8 border-t border-border/40 bg-card/30">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-primary" />
            <span className="font-semibold tracking-tight text-foreground">
              Finlo
            </span>
          </div>
          <p className="text-sm font-medium text-muted-foreground text-center md:text-left">
            &copy; {new Date().getFullYear()} Finlo. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6">
            <Link
              to="/help"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Help & Support
            </Link>
            <a
              href="#privacy"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Posture
            </a>
            <Link
              to="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
