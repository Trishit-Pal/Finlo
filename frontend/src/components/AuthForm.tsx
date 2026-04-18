import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Mail,
  Lock,
  User as UserIcon,
  AlertCircle,
  Wallet,
  ArrowRight,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { PasswordValidation } from "../types";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
  full_name: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const validatePassword = (pw: string): PasswordValidation => {
  const digitCount = (pw.match(/\d/g) || []).length;
  return {
    minLength: pw.length >= 10,
    hasDigits: digitCount >= 2,
    hasAlpha: /[a-zA-Z]/.test(pw),
    isValid: pw.length >= 10 && digitCount >= 2 && /[a-zA-Z]/.test(pw),
  };
};

const PasswordRule = ({ met, text }: { met: boolean; text: string }) => (
  <div className="flex items-center gap-2 text-xs">
    {met ? (
      <CheckCircle2 size={13} className="text-success flex-shrink-0" />
    ) : (
      <XCircle
        size={13}
        className="flex-shrink-0"
        style={{ color: "#fb7185" }}
      />
    )}
    <span style={{ color: met ? "#34d399" : "#fb7185" }}>{text}</span>
  </div>
);

export const AuthForm: React.FC = () => {
  const [authMode, setAuthMode] = useState<
    "login" | "signup" | "forgot_request" | "forgot_reset"
  >("login");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [livePassword, setLivePassword] = useState("");
  const [resetMobile, setResetMobile] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const pwValidation = useMemo(
    () => validatePassword(livePassword),
    [livePassword],
  );

  const onSubmit = async (data: FormData) => {
    setError("");
    setSuccessMsg("");

    if (authMode === "signup" && !pwValidation.isValid) {
      setError("Password does not meet all requirements.");
      return;
    }

    try {
      if (authMode === "login" || authMode === "signup") {
        const endpoint = authMode === "login" ? "/auth/signin" : "/auth/signup";
        const response = await api.post(endpoint, data);
        setAuth(response.data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "An error occurred during authentication",
      );
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    try {
      await api.post("/auth/forgot-password/request-otp", {
        mobile_number: resetMobile,
      });
      setSuccessMsg("OTP sent to your mobile number (see backend console).");
      setAuthMode("forgot_reset");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error requesting OTP");
    }
  };

  const handleOtpReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    const form = e.currentTarget;
    const otp = (form.elements.namedItem("otp") as HTMLInputElement).value;
    const new_password = (
      form.elements.namedItem("new_password") as HTMLInputElement
    ).value;

    if (new_password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    try {
      await api.post("/auth/forgot-password/reset-with-otp", {
        mobile_number: resetMobile,
        otp,
        new_password,
      });
      setSuccessMsg("Password successfully reset! You can now log in.");
      setAuthMode("login");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error resetting password");
    }
  };

  const handleGoogleOAuth = async () => {
    if (!supabase) {
      setError(
        "Google sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
      );
      return;
    }
    setOauthLoading(true);
    setError("");
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (oauthError) setError(oauthError.message);
    } catch {
      setError("Failed to start Google sign-in");
    } finally {
      setOauthLoading(false);
    }
  };

  // Handle Supabase OAuth callback (hash tokens from redirect)
  React.useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    const handleOAuthCallback = async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session?.access_token) {
        try {
          // Exchange Supabase session for our backend JWT
          const res = await api.post("/auth/oauth/callback", {
            provider: "google",
            access_token: session.access_token,
            email: session.user?.email,
            full_name:
              session.user?.user_metadata?.full_name ||
              session.user?.user_metadata?.name,
            avatar_url: session.user?.user_metadata?.avatar_url,
            date_of_birth:
              session.user?.user_metadata?.birthdate ||
              session.user?.user_metadata?.date_of_birth ||
              null,
          });
          setAuth(res.data);
        } catch (err: any) {
          setError(err.response?.data?.detail || "OAuth sign-in failed");
        }
      }
    };
    handleOAuthCallback();
  }, []);

  const toggle = () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
    setError("");
    setSuccessMsg("");
    setLivePassword("");
    reset();
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4 bg-background">
      <div
        className="fixed top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(168 72% 48% / 0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="fixed bottom-0 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(190 80% 50% / 0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="w-full max-w-sm animate-slide-up relative z-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm mb-6 transition-colors text-muted hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to home
        </button>

        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-primary text-primary-foreground shadow-glow-sm">
            <Wallet size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient">
            Finlo
          </h1>
          <p className="text-xs mt-1 text-muted">Personal Expense Tracker</p>
        </div>

        <div className="rounded-xl p-7 glass-card border-border/40 shadow-xl">
          {/* Tab Toggle - Only show if not in forgot password flow constraint */}
          {(authMode === "login" || authMode === "signup") && (
            <div className="flex items-center mb-6 p-1 rounded-xl bg-muted/50 border border-border/40">
              {["Sign In", "Sign Up"].map((label, i) => {
                const active =
                  (i === 0 && authMode === "login") ||
                  (i === 1 && authMode === "signup");
                return (
                  <button
                    key={label}
                    onClick={() => {
                      if (!active) toggle();
                    }}
                    className="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200"
                    style={{
                      background: active
                        ? "hsl(168 72% 48% / 0.15)"
                        : "transparent",
                      color: active ? "#5eead4" : "#888899",
                      border: active
                        ? "1px solid hsl(168 72% 48% / 0.2)"
                        : "1px solid transparent",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mb-5">
            <h2 className="text-lg font-semibold text-foreground">
              {authMode === "login" && "Welcome back"}
              {authMode === "signup" && "Create account"}
              {authMode === "forgot_request" && "Forgot Password"}
              {authMode === "forgot_reset" && "Reset Password"}
            </h2>
            <p className="text-sm mt-0.5 text-muted">
              {authMode === "login" && "Sign in to access your dashboard"}
              {authMode === "signup" && "Start your financial journey today"}
              {authMode === "forgot_request" &&
                "Enter your mobile number to receive an authorization code."}
              {authMode === "forgot_reset" &&
                "Enter the OTP and your new secure password."}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-sm animate-fade-in bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-sm animate-fade-in bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <p>{successMsg}</p>
            </div>
          )}

          {/* OTP FORMS */}
          {authMode === "forgot_request" && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div>
                <label className="label-text">
                  Mobile Number (Format: +1234567890)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={resetMobile}
                    onChange={(e) => setResetMobile(e.target.value)}
                    placeholder="+1234567890"
                    className="input-field px-4"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-2"
              >
                Send OTP <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className="w-full text-center text-xs text-primary mt-2 hover:text-primary/80"
              >
                Cancel
              </button>
            </form>
          )}

          {authMode === "forgot_reset" && (
            <form onSubmit={handleOtpReset} className="space-y-4">
              <div>
                <label className="label-text">Authorization Code (OTP)</label>
                <div className="relative">
                  <input
                    type="text"
                    name="otp"
                    placeholder="123456"
                    className="input-field px-4 text-center tracking-widest font-mono text-lg"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label-text">New Password</label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3.5 top-3 text-muted pointer-events-none"
                  />
                  <input
                    name="new_password"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••••"
                    className="input-field pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-3 text-muted hover:text-foreground"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-2"
              >
                Reset Password <CheckCircle2 size={16} />
              </button>
            </form>
          )}

          {/* STANDARD AUTH FORMS */}
          {(authMode === "login" || authMode === "signup") && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {authMode === "signup" && (
                <div className="animate-slide-up">
                  <label className="label-text">Full Name</label>
                  <div className="relative">
                    <UserIcon
                      size={15}
                      className="absolute left-3.5 top-3 text-muted pointer-events-none"
                    />
                    <input
                      {...register("full_name")}
                      placeholder="Jane Doe"
                      className="input-field pl-10"
                    />
                  </div>
                  {errors.full_name && (
                    <p className="text-xs mt-1.5 text-rose-400">
                      {errors.full_name.message}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="label-text">Email Address</label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3.5 top-3 text-muted pointer-events-none"
                  />
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="you@example.com"
                    className="input-field pl-10"
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="text-xs mt-1.5 text-rose-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="label-text">Password</label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3.5 top-3 text-muted pointer-events-none"
                  />
                  <input
                    {...register("password")}
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••••"
                    className="input-field pl-10 pr-10"
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    onChange={(e) => {
                      setValue("password", e.target.value);
                      setLivePassword(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-3 text-muted hover:text-foreground"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && authMode === "login" && (
                  <p className="text-xs mt-1.5 text-rose-400">
                    {errors.password.message}
                  </p>
                )}

                {authMode === "signup" && (
                  <div className="mt-3 p-3 rounded-xl space-y-1.5 animate-fade-in bg-white/5 border border-white/5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Info size={12} className="text-primary" />
                      <span className="text-xs font-medium text-primary">
                        Password requirements
                      </span>
                    </div>
                    <PasswordRule
                      met={pwValidation.minLength}
                      text="At least 10 characters long"
                    />
                    <PasswordRule
                      met={pwValidation.hasDigits}
                      text="Contains at least 2 digits (0-9)"
                    />
                    <PasswordRule
                      met={pwValidation.hasAlpha}
                      text="Contains alphabetic characters (a-z)"
                    />
                  </div>
                )}

                {authMode === "login" && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setAuthMode("forgot_request")}
                      className="text-xs text-primary hover:text-primary/80"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                id="auth-submit-btn"
                disabled={
                  isSubmitting ||
                  (authMode === "signup" &&
                    !pwValidation.isValid &&
                    livePassword.length > 0)
                }
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-1"
              >
                {isSubmitting
                  ? "Processing..."
                  : authMode === "login"
                    ? "Sign In"
                    : "Create Account"}
                {!isSubmitting && <ArrowRight size={16} />}
              </button>
            </form>
          )}

          <div className="my-5 relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/5" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs bg-card/95 text-muted">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={handleGoogleOAuth}
              disabled={oauthLoading}
              className="btn-secondary flex items-center justify-center gap-2 py-2.5 hover:bg-white/10 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {oauthLoading ? "Connecting..." : "Continue with Google"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-6 text-muted/40">
          © {new Date().getFullYear()} Finlo. All rights reserved.
        </p>
      </div>
    </div>
  );
};
