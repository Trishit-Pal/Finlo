import React, { useState } from "react";
import { api } from "@/services/api";
import {
  HelpCircle,
  MessageSquare,
  Bug,
  Lightbulb,
  Star,
  ChevronDown,
  ChevronUp,
  Send,
  Check,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import clsx from "clsx";

const FAQ_ITEMS = [
  {
    q: "How do I add an expense?",
    a: 'Tap the "+" button on the Dashboard or go to Transactions and click "Add Transaction". Fill in the amount, merchant, category, payment mode, and date.',
  },
  {
    q: "How does bill scanning work?",
    a: "Go to Upload, take a photo or upload an image of your bill. Our OCR engine extracts the total, merchant, and date automatically. Review the parsed data and save.",
  },
  {
    q: "How are budgets tracked?",
    a: "Set monthly budgets per category in the Budgets tab. Progress bars show green (0-70%), amber (70-90%), and red (>90%). You get alerts at 80% and 100%.",
  },
  {
    q: "Is my financial data secure?",
    a: "Yes. All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Financial fields use column-level encryption. Bill images are processed on-device and never stored on servers.",
  },
  {
    q: "What is the AI Summary feature?",
    a: "An optional feature that sends anonymised category totals (no merchant names or personal data) to generate a natural-language spending summary. You can opt in/out in Settings > Privacy.",
  },
  {
    q: "How do I track debts and loans?",
    a: "Go to Debts & Loans tab. Add personal loans, credit cards, or IOUs. Log payments to reduce balances. View total outstanding and monthly EMI at a glance.",
  },
  {
    q: "Can I export my data?",
    a: "Yes. Go to Analytics/Reports and click Export. You can download your transactions as CSV or PDF. Data is encrypted before download.",
  },
  {
    q: "How does the session lock work?",
    a: "Set a 4-6 digit PIN in Settings > Security. After 5 minutes of inactivity, the app locks and requires your PIN to re-enter.",
  },
  {
    q: "What currencies are supported?",
    a: "INR is the default. You can change your currency in Settings > Preferences. Supported: INR, USD, EUR, GBP, CAD, AUD, JPY, CHF, SGD.",
  },
  {
    q: "How do savings goals work?",
    a: "Create goals with a target amount and optional deadline. Add contributions over time. The app shows daily savings needed to reach your target on time.",
  },
];

type Tab = "faq" | "bug" | "feature" | "feedback";

export const Help: React.FC = () => {
  const [tab, setTab] = useState<Tab>("faq");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [bugForm, setBugForm] = useState({ text: "", screen: "" });
  const [featureForm, setFeatureForm] = useState({ text: "" });
  const [feedbackForm, setFeedbackForm] = useState({
    screen: "",
    rating: 0,
    text: "",
  });

  const handleSuccess = () => {
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/feedback", {
      text: bugForm.text,
      screen: bugForm.screen || null,
      is_bug_report: true,
      classification: "Bug",
    });
    setBugForm({ text: "", screen: "" });
    handleSuccess();
  };

  const handleFeatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/feedback", {
      feature_request: featureForm.text,
      classification: "FeatureRequest",
    });
    setFeatureForm({ text: "" });
    handleSuccess();
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/feedback", {
      screen: feedbackForm.screen || null,
      rating: feedbackForm.rating || null,
      text: feedbackForm.text || null,
    });
    setFeedbackForm({ screen: "", rating: 0, text: "" });
    handleSuccess();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Help & Support</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            FAQs, bug reports, and feedback
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs hover:bg-muted/50"
          onClick={async () => {
            await api.patch("/auth/me", {
              settings: { onboarding_completed: false },
            });
            window.location.href = "/dashboard";
          }}
        >
          <RotateCcw size={14} /> Restart Onboarding
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as Tab);
          setSubmitted(false);
        }}
        className="w-full"
      >
        <TabsList className="h-10 w-full sm:w-auto flex-nowrap bg-muted/50 border border-border/40 p-1 overflow-x-auto scrollbar-hide">
          <TabsTrigger
            value="faq"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <HelpCircle size={14} className="hidden sm:block" /> FAQ
          </TabsTrigger>
          <TabsTrigger
            value="bug"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Bug size={14} className="hidden sm:block" /> Bug Report
          </TabsTrigger>
          <TabsTrigger
            value="feature"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Lightbulb size={14} className="hidden sm:block" /> Feature
          </TabsTrigger>
          <TabsTrigger
            value="feedback"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <MessageSquare size={14} className="hidden sm:block" /> Feedback
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Success Banner */}
      {submitted && (
        <div className="p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-slide-up bg-success/10 border border-success/20 text-success shadow-sm">
          <Check size={18} className="flex-shrink-0" />
          Thank you! Your submission has been received.
        </div>
      )}

      <div className="mt-6 flex-1 w-full animate-scale-in">
        {/* FAQ */}
        {tab === "faq" && (
          <div className="space-y-4">
            <Card className="glass-card border-border/40 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {FAQ_ITEMS.map((item, i) => (
                    <div key={i}>
                      <button
                        onClick={() =>
                          setExpandedFaq(expandedFaq === i ? null : i)
                        }
                        className={clsx(
                          "w-full flex items-center justify-between px-6 py-4 text-left transition-colors focus:outline-none focus-visible:bg-muted/10",
                          expandedFaq === i
                            ? "bg-muted/10"
                            : "hover:bg-muted/5",
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground pr-4 tracking-tight">
                          {item.q}
                        </span>
                        {expandedFaq === i ? (
                          <ChevronUp
                            size={16}
                            className="text-primary flex-shrink-0"
                          />
                        ) : (
                          <ChevronDown
                            size={16}
                            className="text-muted-foreground flex-shrink-0"
                          />
                        )}
                      </button>
                      {expandedFaq === i && (
                        <div className="px-6 pb-5 pt-1 animate-fadeIn bg-muted/5">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {item.a}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bug Report */}
        {tab === "bug" && (
          <Card className="glass-card border-border/40 shadow-sm">
            <CardContent className="p-6">
              <form onSubmit={handleBugSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Which screen has the issue?</Label>
                  <Input
                    className="glass-panel"
                    value={bugForm.screen}
                    onChange={(e) =>
                      setBugForm((f) => ({ ...f, screen: e.target.value }))
                    }
                    placeholder="e.g. Dashboard, Bills, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Describe the bug</Label>
                  <Textarea
                    value={bugForm.text}
                    onChange={(e) =>
                      setBugForm((f) => ({ ...f, text: e.target.value }))
                    }
                    className="glass-panel min-h-[120px]"
                    placeholder="What happened? What did you expect to happen?"
                    required
                  />
                </div>
                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full h-11 gap-2 font-medium"
                  >
                    <Send size={16} /> Submit Bug Report
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Feature Request */}
        {tab === "feature" && (
          <Card className="glass-card border-border/40 shadow-sm">
            <CardContent className="p-6">
              <form onSubmit={handleFeatureSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>What feature would you like?</Label>
                  <Textarea
                    value={featureForm.text}
                    onChange={(e) =>
                      setFeatureForm((f) => ({ ...f, text: e.target.value }))
                    }
                    className="glass-panel min-h-[120px]"
                    placeholder="Describe the feature you'd like to see..."
                    required
                  />
                </div>
                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full h-11 gap-2 font-medium"
                  >
                    <Lightbulb size={16} /> Submit Feature Request
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Micro-Feedback */}
        {tab === "feedback" && (
          <Card className="glass-card border-border/40 shadow-sm">
            <CardContent className="p-6">
              <form onSubmit={handleFeedbackSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Screen (optional)</Label>
                  <Input
                    className="glass-panel"
                    value={feedbackForm.screen}
                    onChange={(e) =>
                      setFeedbackForm((f) => ({ ...f, screen: e.target.value }))
                    }
                    placeholder="e.g. Dashboard, Analytics..."
                  />
                </div>
                <div className="space-y-3">
                  <Label>How would you rate your experience?</Label>
                  <div className="flex gap-3 mt-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setFeedbackForm((f) => ({ ...f, rating: n }))
                        }
                        className={clsx(
                          "w-12 h-12 rounded-xl flex items-center justify-center transition-all bg-card border focus:outline-none focus:ring-2 focus:ring-primary/20",
                          feedbackForm.rating >= n
                            ? "border-primary bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.2)]"
                            : "border-border/60 hover:border-primary/40 hover:bg-muted/20",
                        )}
                      >
                        <Star
                          size={20}
                          className={clsx(
                            "transition-transform",
                            feedbackForm.rating >= n
                              ? "text-primary fill-primary scale-110"
                              : "text-muted-foreground",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Comments (optional)</Label>
                  <Textarea
                    value={feedbackForm.text}
                    onChange={(e) =>
                      setFeedbackForm((f) => ({ ...f, text: e.target.value }))
                    }
                    className="glass-panel min-h-[100px]"
                    placeholder="Any additional thoughts..."
                  />
                </div>
                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full h-11 gap-2 font-medium"
                  >
                    <Send size={16} /> Submit Feedback
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
