import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import {
  Wallet,
  Target,
  Receipt,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
} from "lucide-react";

type Step = 0 | 1 | 2;

const STEPS = [
  {
    icon: Wallet,
    title: "Welcome to Finlo",
    subtitle: "Your AI-powered personal expense tracker",
    description:
      "Track expenses, set budgets, scan receipts, and get smart saving suggestions — all in one place.",
    color: "#5eead4",
  },
  {
    icon: Target,
    title: "Set Your First Budget",
    subtitle: "Start tracking your spending limits",
    description:
      "Set a monthly budget to keep your spending in check. You can always adjust it later in Settings.",
    color: "#34d399",
    hasInput: true,
    inputType: "budget" as const,
  },
  {
    icon: Receipt,
    title: "Add Your First Expense",
    subtitle: "Or upload a receipt to auto-fill",
    description:
      "Manually enter transactions or snap a photo of your receipt — our OCR does the rest.",
    color: "#f59e0b",
  },
];

interface OnboardingProps {
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    if (step === 1 && budgetAmount) {
      setSaving(true);
      try {
        const now = new Date();
        await api.post("/budgets", {
          category: "Overall",
          limit_amount: parseFloat(budgetAmount),
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          rollover_enabled: false,
          is_percentage: false,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    }

    if (step < 2) {
      setStep((step + 1) as Step);
    } else {
      await completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    try {
      await api.patch("/auth/me", { settings: { onboarding_completed: true } });
    } catch (e) {
      console.error(e);
    }
    onComplete();
    navigate("/dashboard");
  };

  const handleSkip = async () => {
    await completeOnboarding();
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Background glows */}
      <div
        className="fixed top-0 left-1/3 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${current.color}12 0%, transparent 70%)`,
          filter: "blur(60px)",
          transition: "background 0.5s",
        }}
      />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-0 right-0 flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          Skip <X size={14} />
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "24px" : "8px",
                background:
                  i === step ? current.color : "rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="text-center mb-8" key={step}>
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-slide-up"
            style={{
              background: `${current.color}15`,
              border: `1px solid ${current.color}30`,
              boxShadow: `0 8px 32px ${current.color}20`,
            }}
          >
            <Icon size={36} style={{ color: current.color }} />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2 animate-fade-in">
            {current.title}
          </h2>
          <p
            className="text-sm font-medium mb-3 animate-fade-in"
            style={{ color: current.color }}
          >
            {current.subtitle}
          </p>
          <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto animate-fade-in">
            {current.description}
          </p>
        </div>

        {/* Budget Input (Step 2) */}
        {step === 1 && (
          <div className="glass-panel p-5 mb-6 animate-slide-up">
            <label className="label-text mb-2 block">
              Monthly Budget (optional)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-medium text-muted">
                ₹
              </span>
              <input
                type="number"
                min={0}
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="e.g. 30000"
                className="input-field pl-8 text-lg"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted mt-2">
              You can always change this in Budgets later
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="btn-secondary flex items-center gap-2 px-4 py-3"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-base"
            style={{
              background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)`,
              boxShadow: `0 4px 20px ${current.color}40`,
            }}
          >
            {saving ? (
              "Saving..."
            ) : step === 2 ? (
              <>
                <Check size={18} /> Get Started
              </>
            ) : (
              <>
                Continue <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
