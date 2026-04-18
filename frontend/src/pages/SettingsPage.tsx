import React, { useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemeMode } from "../types";
import {
  User,
  Bell,
  Shield,
  Palette,
  Save,
  Check,
  LogOut,
  Phone,
  MapPin,
  Globe,
  Mail,
  Calendar,
  AlertCircle,
  IndianRupee,
  Lock,
  Monitor,
  Sun,
  Moon,
  Database,
  Trash2,
  Download,
  Eye,
  Info,
  Tag,
  Sparkles,
  Plus,
  Archive,
  Edit3,
  Link2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

type Section =
  | "profile"
  | "security"
  | "notifications"
  | "categories"
  | "data"
  | "integrations"
  | "display"
  | "privacy"
  | "about";

type IngestionOption = {
  key: string;
  label: string;
  status: "implemented" | "partial" | "blocked" | "gated";
  reason: string;
  requires_consent: boolean;
  feature_flag?: string | null;
};

type UserConsent = {
  id: string;
  consent_type:
    | "statement_import"
    | "aggregator_link"
    | "email_parse"
    | "sms_parse";
  scope: string;
  status: "granted" | "revoked";
  metadata?: Record<string, unknown> | null;
  granted_at?: string | null;
  revoked_at?: string | null;
};

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Japan",
  "Singapore",
  "Brazil",
  "South Africa",
  "UAE",
  "Netherlands",
  "Sweden",
  "Switzerland",
  "New Zealand",
  "Other",
];

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "data", label: "Data & Backup", icon: Database },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "display", label: "Display", icon: Palette },
  { id: "privacy", label: "Privacy", icon: Eye },
  { id: "about", label: "About", icon: Info },
];

export const SettingsPage: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<Section>("profile");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>(
    {},
  );

  const [profile, setProfile] = useState({
    full_name: user?.full_name || "",
    email: user?.email || "",
    username: user?.profile?.username || "",
    date_of_birth: user?.profile?.date_of_birth || "",
    city: user?.city || user?.profile?.city || "",
    address: user?.profile?.address || "",
    country: user?.profile?.country || "",
    monthly_budget_inr: user?.profile?.monthly_budget_inr || "",
    mobile_number: user?.profile?.mobile_number || "",
  });

  const [prefs, setPrefs] = useState({
    monthly_income: user?.settings?.monthly_income || "",
    currency: user?.settings?.currency || user?.currency || "INR",
    budget_alerts: user?.settings?.budget_alerts !== false,
    bill_reminders: user?.settings?.bill_reminders !== false,
    coach_tips: user?.settings?.coach_tips !== false,
    quiet_hours_start: user?.settings?.quiet_hours_start || "22:00",
    quiet_hours_end: user?.settings?.quiet_hours_end || "08:00",
    cloud_ai_opt_in: user?.settings?.cloud_ai_opt_in || false,
  });

  const [pinForm, setPinForm] = useState({
    current: "",
    newPin: "",
    confirm: "",
  });
  const [pinError, setPinError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [categories, setCategories] = useState<
    {
      id: string;
      name: string;
      icon?: string;
      color?: string;
      is_archived: boolean;
      is_default: boolean;
    }[]
  >([]);
  const [catLoading, setCatLoading] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [catForm, setCatForm] = useState({
    name: "",
    icon: "",
    color: "#2dd4bf",
  });
  const [showArchived, setShowArchived] = useState(false);
  const [integrationOptions, setIntegrationOptions] = useState<
    IngestionOption[]
  >([]);
  const [integrationNotes, setIntegrationNotes] = useState<string[]>([]);
  const [consents, setConsents] = useState<UserConsent[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  const usernameLocked = user?.profile?.is_username_editable === false;
  const dobLocked = user?.profile?.is_date_of_birth_editable === false;
  const usernameSource = user?.profile?.username_source || "manual";
  const dobSource = user?.profile?.date_of_birth_source || "manual";

  const validateProfile = (): boolean => {
    const errs: Record<string, string> = {};
    if (!profile.full_name) errs.full_name = "Full name is required";
    if (
      !usernameLocked &&
      (!profile.username || profile.username.trim().length < 3)
    ) {
      errs.username = "Username must be at least 3 characters";
    }
    if (!profile.date_of_birth && !dobLocked)
      errs.date_of_birth = "Date of birth is required";
    if (!profile.city) errs.city = "City is required";
    setProfileErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (section === "profile" && !validateProfile()) return;
    setSaving(true);
    setSaveError("");
    try {
      await api.patch(
        "/auth/me",
        {
          full_name: profile.full_name,
          profile: {
            username: profile.username?.trim() || null,
            date_of_birth: profile.date_of_birth || null,
            city: profile.city || null,
            address: profile.address || null,
            country: profile.country,
            monthly_budget_inr: Number(profile.monthly_budget_inr) || null,
            mobile_number: profile.mobile_number,
          },
          settings: {
            monthly_income: prefs.monthly_income,
            currency: prefs.currency,
            budget_alerts: prefs.budget_alerts,
            bill_reminders: prefs.bill_reminders,
            coach_tips: prefs.coach_tips,
            quiet_hours_start: prefs.quiet_hours_start,
            quiet_hours_end: prefs.quiet_hours_end,
            cloud_ai_opt_in: prefs.cloud_ai_opt_in,
          },
        },
        {
          headers: {
            "X-Profile-Source": "manual",
          },
        },
      );
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setSaveError(
        e?.response?.data?.message ||
          e?.response?.data?.detail ||
          "Failed to save settings",
      );
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleSetPin = () => {
    if (pinForm.newPin.length < 4 || pinForm.newPin.length > 6) {
      setPinError("PIN must be 4-6 digits");
      return;
    }
    if (pinForm.newPin !== pinForm.confirm) {
      setPinError("PINs do not match");
      return;
    }
    let h = 0;
    for (let i = 0; i < pinForm.newPin.length; i++)
      h = ((h << 5) - h + pinForm.newPin.charCodeAt(i)) | 0;
    localStorage.setItem("finlo_pin_hash", String(h));
    setPinForm({ current: "", newPin: "", confirm: "" });
    setPinError("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClearPin = () => {
    localStorage.removeItem("finlo_pin_hash");
    sessionStorage.removeItem("finlo_locked");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const fetchCategories = async () => {
    setCatLoading(true);
    try {
      const res = await api.get(`/categories?include_archived=${showArchived}`);
      setCategories(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setCatLoading(false);
    }
  };

  React.useEffect(() => {
    if (section === "categories") fetchCategories();
  }, [section, showArchived]);

  const loadIntegrations = async () => {
    setIntegrationsLoading(true);
    try {
      const [optionsRes, consentRes] = await Promise.all([
        api.get("/integrations/transaction-ingestion/options"),
        api.get("/integrations/consents"),
      ]);
      setIntegrationOptions(optionsRes.data?.options || []);
      setIntegrationNotes(optionsRes.data?.security_notes || []);
      setConsents(consentRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIntegrationsLoading(false);
    }
  };

  React.useEffect(() => {
    if (section === "integrations") loadIntegrations();
  }, [section]);

  const isConsentGranted = (consentType: UserConsent["consent_type"]) =>
    consents.some(
      (c) => c.consent_type === consentType && c.status === "granted",
    );

  const setConsent = async (
    consentType: UserConsent["consent_type"],
    nextGranted: boolean,
  ) => {
    try {
      await api.post("/integrations/consents", {
        consent_type: consentType,
        scope: "transactions",
        status: nextGranted ? "granted" : "revoked",
        metadata: { source: "settings" },
      });
      await loadIntegrations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCategory = async () => {
    if (!catForm.name.trim()) return;
    try {
      if (editingCat) {
        await api.patch(`/categories/${editingCat}`, {
          name: catForm.name,
          icon: catForm.icon || null,
          color: catForm.color,
        });
      } else {
        await api.post("/categories", {
          name: catForm.name,
          icon: catForm.icon || null,
          color: catForm.color,
        });
      }
      setShowCatForm(false);
      setEditingCat(null);
      setCatForm({ name: "", icon: "", color: "#2dd4bf" });
      fetchCategories();
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchiveCategory = async (id: string, archive: boolean) => {
    await api.patch(`/categories/${id}`, { is_archived: archive });
    fetchCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    await api.delete(`/categories/${id}`);
    fetchCategories();
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await api.get("/auth/me/export");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finlo-data-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.delete("/auth/me");
      logout();
    } catch (e) {
      console.error(e);
    }
  };

  const hasPin = !!localStorage.getItem("finlo_pin_hash");

  const Toggle = ({
    checked,
    onChange,
    id,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    id: string;
  }) => (
    <label
      htmlFor={id}
      className="relative inline-flex items-center cursor-pointer flex-shrink-0"
    >
      <input
        type="checkbox"
        id={id}
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div
        className={clsx(
          "w-10 h-5 rounded-full transition-all duration-200 relative border border-transparent peer-focus:ring-2 peer-focus:ring-primary/40",
          checked
            ? "bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
            : "bg-muted/80",
        )}
      >
        <div
          className="absolute top-[1.5px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
      </div>
    </label>
  );

  const FieldError = ({ field }: { field: string }) => {
    if (!profileErrors[field]) return null;
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-bold mt-1.5 text-destructive uppercase tracking-wider">
        <AlertCircle size={11} />
        {profileErrors[field]}
      </p>
    );
  };

  const RequiredStar = () => <span className="text-destructive ml-0.5">*</span>;

  const showSaveBtn = [
    "profile",
    "notifications",
    "display",
    "privacy",
  ].includes(section);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Settings
        </h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          Manage your account, security, and preferences
        </p>
      </div>

      {saveError && (
        <div className="p-4 rounded-xl text-sm font-semibold shadow-sm bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2.5 animate-slide-up">
          <AlertCircle size={18} className="flex-shrink-0" />
          {saveError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold w-full text-left transition-all tracking-tight",
                section === s.id
                  ? "text-primary bg-primary/10 border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border border-transparent",
              )}
            >
              <s.icon
                size={16}
                className={section === s.id ? "text-primary" : "opacity-70"}
              />
              {s.label}
            </button>
          ))}
          <div className="pt-3 mt-3 border-t border-border/40">
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold w-full text-left text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all border border-transparent tracking-tight"
            >
              <LogOut size={16} className="opacity-70" /> Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="md:col-span-3">
          <Card className="glass-card border-border/40 shadow-sm">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Profile */}
              {section === "profile" && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col sm:flex-row items-center gap-5 pb-6 border-b border-border/40">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold bg-gradient-to-br from-primary to-indigo-500 text-white shadow-[0_0_20px_hsl(var(--primary)/0.3)] shadow-primary/20 border border-primary/20 flex-shrink-0">
                      {(user?.full_name || user?.email || "U")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="font-bold text-xl text-foreground tracking-tight">
                        {user?.full_name || "Your Name"}
                      </p>
                      <p className="text-sm font-medium text-muted-foreground mt-0.5">
                        {user?.email}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl flex items-start gap-3 text-xs font-medium bg-primary/5 border border-primary/20 leading-relaxed shadow-sm">
                    <AlertCircle
                      size={16}
                      className="text-primary flex-shrink-0 mt-0.5"
                    />
                    <span className="text-foreground/80">
                      Fields marked with{" "}
                      <span className="text-destructive font-bold">*</span> are
                      required. Username and date of birth are locked after
                      first setup.
                    </span>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <User size={14} className="opacity-70" />
                        Full Name
                        <RequiredStar />
                      </Label>
                      <Input
                        className="glass-panel h-11"
                        value={profile.full_name}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            full_name: e.target.value,
                          }))
                        }
                        placeholder="Your full name"
                      />
                      <FieldError field="full_name" />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <User size={14} className="opacity-70" />
                        Username
                        <RequiredStar />
                      </Label>
                      <div className="relative">
                        <Input
                          value={profile.username}
                          onChange={(e) =>
                            setProfile((p) => ({
                              ...p,
                              username: e.target.value,
                            }))
                          }
                          placeholder="Your username"
                          className={clsx(
                            "glass-panel h-11 transition-all",
                            usernameLocked
                              ? "opacity-60 cursor-not-allowed pr-10 bg-muted/30 border-dashed"
                              : "",
                          )}
                          disabled={usernameLocked}
                        />
                        {usernameLocked && (
                          <Lock
                            size={14}
                            className="absolute right-4 top-3.5 text-muted-foreground"
                          />
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Source: {usernameSource}
                      </p>
                      <FieldError field="username" />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <Mail size={14} className="opacity-70" />
                        Email Address
                      </Label>
                      <Input
                        value={profile.email}
                        readOnly
                        disabled
                        className="h-11 opacity-60 cursor-not-allowed bg-muted/30 border-dashed"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-semibold">
                          <Calendar size={14} className="opacity-70" />
                          Date of Birth
                          <RequiredStar />
                        </Label>
                        <div className="relative">
                          <Input
                            type="date"
                            value={profile.date_of_birth}
                            onChange={(e) =>
                              setProfile((p) => ({
                                ...p,
                                date_of_birth: e.target.value,
                              }))
                            }
                            className={clsx(
                              "glass-panel h-11",
                              dobLocked
                                ? "opacity-60 cursor-not-allowed pr-10 bg-muted/30 border-dashed"
                                : "",
                            )}
                            disabled={dobLocked}
                          />
                          {dobLocked && (
                            <Lock
                              size={14}
                              className="absolute right-4 top-3.5 text-muted-foreground"
                            />
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Source: {dobSource}
                        </p>
                        <FieldError field="date_of_birth" />
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-semibold">
                          <MapPin size={14} className="opacity-70" />
                          City
                          <RequiredStar />
                        </Label>
                        <Input
                          className="glass-panel h-11"
                          value={profile.city}
                          onChange={(e) => {
                            setProfile((p) => ({ ...p, city: e.target.value }));
                            setProfileErrors((pe) => ({ ...pe, city: "" }));
                          }}
                          placeholder="Your city"
                        />
                        <FieldError field="city" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <Phone size={14} className="opacity-70" />
                        Mobile Number
                      </Label>
                      <Input
                        className="h-11 opacity-60 cursor-not-allowed bg-muted/30 border-dashed"
                        type="tel"
                        value={profile.mobile_number}
                        readOnly
                        disabled
                        placeholder="+91 98765 43210"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <Globe size={14} className="opacity-70" />
                        Country
                      </Label>
                      <Select
                        value={profile.country || "Select"}
                        onValueChange={(v) =>
                          setProfile((p) => ({
                            ...p,
                            country: v === "Select" ? "" : v,
                          }))
                        }
                      >
                        <SelectTrigger className="glass-panel h-11">
                          <SelectValue placeholder="Select a country" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Select">Select</SelectItem>
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <IndianRupee size={14} className="opacity-70" />
                        Monthly Income{" "}
                        <span className="opacity-50 font-normal">
                          (optional, encrypted)
                        </span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-4 top-3 text-sm font-bold text-muted-foreground">
                          ₹
                        </span>
                        <Input
                          className="glass-panel h-11 pl-9"
                          type="number"
                          min={0}
                          value={prefs.monthly_income}
                          onChange={(e) =>
                            setPrefs((p) => ({
                              ...p,
                              monthly_income: e.target.value,
                            }))
                          }
                          placeholder="e.g. 50000"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        Default Currency
                      </Label>
                      <Select
                        value={prefs.currency}
                        onValueChange={(v) =>
                          setPrefs((p) => ({ ...p, currency: v }))
                        }
                      >
                        <SelectTrigger className="glass-panel h-11 font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "INR",
                            "USD",
                            "EUR",
                            "GBP",
                            "CAD",
                            "AUD",
                            "JPY",
                            "CHF",
                            "SGD",
                          ].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Security */}
              {section === "security" && (
                <div className="space-y-6 animate-fade-in">
                  <div className="p-5 rounded-2xl flex items-start gap-4 bg-primary/5 border border-primary/20 shadow-sm">
                    <Shield size={24} className="text-primary flex-shrink-0" />
                    <div>
                      <p className="text-base font-bold text-foreground">
                        Session PIN Lock
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Protect your financial data. After 5 minutes of
                        inactivity, the app locks and requires your PIN.
                      </p>
                    </div>
                  </div>

                  {hasPin ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between p-5 rounded-2xl bg-card border border-border/60 shadow-sm transition-all hover:border-success/30">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center border border-success/20">
                            <Lock size={18} className="text-success" />
                          </div>
                          <div>
                            <p className="text-base font-bold text-foreground">
                              PIN Lock Active
                            </p>
                            <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-1">
                              Your session is protected
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md bg-success text-success-foreground shadow-sm">
                          Enabled
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 font-semibold"
                        onClick={handleClearPin}
                      >
                        Remove PIN Lock
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-5 border border-border/60 p-6 rounded-2xl bg-muted/10 shadow-sm">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">
                          New PIN{" "}
                          <span className="text-muted-foreground font-normal">
                            (4-6 digits)
                          </span>
                        </Label>
                        <Input
                          className="glass-panel h-11 text-lg tracking-widest font-mono placeholder:tracking-normal placeholder:font-sans"
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={pinForm.newPin}
                          onChange={(e) =>
                            setPinForm((f) => ({
                              ...f,
                              newPin: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          placeholder="Enter PIN"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">
                          Confirm PIN
                        </Label>
                        <Input
                          className="glass-panel h-11 text-lg tracking-widest font-mono placeholder:tracking-normal placeholder:font-sans"
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={pinForm.confirm}
                          onChange={(e) =>
                            setPinForm((f) => ({
                              ...f,
                              confirm: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          placeholder="Confirm PIN"
                        />
                      </div>
                      {pinError && (
                        <p className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20">
                          {pinError}
                        </p>
                      )}
                      <Button
                        onClick={handleSetPin}
                        className="w-full h-11 font-bold shadow-md"
                      >
                        Enable PIN Protection
                      </Button>
                    </div>
                  )}

                  <div className="pt-6 mt-6 border-t border-border/40 space-y-4">
                    <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
                      Security Status
                    </h4>
                    <div className="grid gap-3">
                      {[
                        {
                          label: "Data Encryption",
                          desc: "AES-256 at rest, TLS 1.3 in transit",
                          status: "Active",
                        },
                        {
                          label: "JWT Authentication",
                          desc: "Signed tokens with auto-refresh",
                          status: "Active",
                        },
                        {
                          label: "E2E Encryption",
                          desc: "Financial fields encrypted end-to-end",
                          status: "Active",
                        },
                      ].map(({ label, desc, status }) => (
                        <div
                          key={label}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 sm:gap-0 rounded-xl bg-card border border-border/40 shadow-sm hover:border-primary/20 transition-all"
                        >
                          <div>
                            <p className="text-sm font-bold text-foreground">
                              {label}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground mt-0.5">
                              {desc}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-success/10 text-success border border-success/20 w-fit">
                            {status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {section === "notifications" && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid gap-4">
                    {[
                      {
                        id: "budget-alerts",
                        label: "Budget Alerts",
                        desc: "Notify at 80% and 100% of budget limits",
                        value: prefs.budget_alerts,
                        onChange: (v: boolean) =>
                          setPrefs((p) => ({ ...p, budget_alerts: v })),
                      },
                      {
                        id: "bill-reminders",
                        label: "Bill Reminders",
                        desc: "Reminders before bill due dates",
                        value: prefs.bill_reminders,
                        onChange: (v: boolean) =>
                          setPrefs((p) => ({ ...p, bill_reminders: v })),
                      },
                      {
                        id: "coach-tips",
                        label: "AI Coach Tips",
                        desc: "Personalized spending suggestions",
                        value: prefs.coach_tips,
                        onChange: (v: boolean) =>
                          setPrefs((p) => ({ ...p, coach_tips: v })),
                      },
                    ].map(({ id, label, desc, value, onChange }) => (
                      <div
                        key={id}
                        className="flex items-center justify-between p-5 rounded-2xl bg-card border border-border/40 shadow-sm hover:border-primary/20 transition-all"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Bell size={16} className="text-primary" />
                          </div>
                          <div>
                            <p className="text-base font-bold text-foreground">
                              {label}
                            </p>
                            <p className="text-sm font-medium text-muted-foreground mt-0.5">
                              {desc}
                            </p>
                          </div>
                        </div>
                        <Toggle id={id} checked={value} onChange={onChange} />
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 mt-6 border-t border-border/40">
                    <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
                      Quiet Hours
                    </h4>
                    <div className="p-5 rounded-2xl bg-muted/10 border border-border/60 shadow-sm">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">
                            Start Time
                          </Label>
                          <Input
                            className="glass-panel h-11 font-medium"
                            type="time"
                            value={prefs.quiet_hours_start}
                            onChange={(e) =>
                              setPrefs((p) => ({
                                ...p,
                                quiet_hours_start: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">
                            End Time
                          </Label>
                          <Input
                            className="glass-panel h-11 font-medium"
                            type="time"
                            value={prefs.quiet_hours_end}
                            onChange={(e) =>
                              setPrefs((p) => ({
                                ...p,
                                quiet_hours_end: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <Moon size={14} className="opacity-70" /> No
                        notifications during quiet hours
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories */}
              {section === "categories" && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border/40 shadow-sm">
                    <p className="text-sm font-medium text-muted-foreground leading-relaxed max-w-lg">
                      Manage your expense categories. Default categories can be
                      archived but not deleted.
                    </p>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={showArchived}
                          onChange={(e) => setShowArchived(e.target.checked)}
                          className="rounded border-border/60 text-primary focus:ring-primary h-4 w-4"
                        />
                        Show archived
                      </label>
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowCatForm(true);
                          setEditingCat(null);
                          setCatForm({ name: "", icon: "", color: "#3b82f6" });
                        }}
                        className="gap-2 h-9 ml-auto sm:ml-0 shadow-sm"
                      >
                        <Plus size={14} /> Add New
                      </Button>
                    </div>
                  </div>

                  <Dialog open={showCatForm} onOpenChange={setShowCatForm}>
                    <DialogContent className="max-w-sm p-6 glass-card border-border/60 shadow-xl sm:rounded-2xl">
                      <DialogHeader className="mb-4">
                        <DialogTitle className="text-xl font-bold">
                          {editingCat ? "Edit Category" : "New Category"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">
                            Category Name
                          </Label>
                          <Input
                            className="glass-panel h-11"
                            value={catForm.name}
                            onChange={(e) =>
                              setCatForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                            placeholder="e.g. Subscriptions"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">
                              Icon{" "}
                              <span className="font-normal opacity-70">
                                (lucide)
                              </span>
                            </Label>
                            <Input
                              className="glass-panel h-11"
                              value={catForm.icon}
                              onChange={(e) =>
                                setCatForm((f) => ({
                                  ...f,
                                  icon: e.target.value,
                                }))
                              }
                              placeholder="e.g. coffee"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">
                              Color Hex
                            </Label>
                            <div className="flex items-center gap-3">
                              <label className="relative cursor-pointer">
                                <div
                                  className="w-11 h-11 rounded-lg border-2 border-border/60 shadow-inner"
                                  style={{ backgroundColor: catForm.color }}
                                />
                                <input
                                  type="color"
                                  value={catForm.color}
                                  onChange={(e) =>
                                    setCatForm((f) => ({
                                      ...f,
                                      color: e.target.value,
                                    }))
                                  }
                                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                />
                              </label>
                              <Input
                                className="glass-panel h-11 font-mono text-sm uppercase tracking-wider"
                                value={catForm.color}
                                onChange={(e) =>
                                  setCatForm((f) => ({
                                    ...f,
                                    color: e.target.value,
                                  }))
                                }
                                placeholder="#3B82F6"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="pt-2">
                          <Button
                            onClick={handleCreateCategory}
                            className="w-full h-11 font-bold shadow-md"
                          >
                            {editingCat ? "Save Changes" : "Create Category"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Category List */}
                  {catLoading ? (
                    <div className="grid gap-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton
                          key={i}
                          className="h-[72px] w-full rounded-2xl border border-border/40"
                        />
                      ))}
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-border/60 rounded-2xl bg-card/40">
                      <Tag
                        size={32}
                        className="mx-auto mb-4 text-muted-foreground opacity-30"
                      />
                      <p className="text-base font-bold text-foreground">
                        No categories found
                      </p>
                      <p className="text-sm font-medium text-muted-foreground mt-1">
                        Initialize with our recommended defaults.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() =>
                          api
                            .post("/categories/init")
                            .then(() => fetchCategories())
                        }
                        className="mt-5 font-bold shadow-sm"
                      >
                        Initialize Defaults
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          className={clsx(
                            "flex items-center justify-between p-4 rounded-2xl group transition-all duration-300 border bg-card shadow-sm",
                            cat.is_archived
                              ? "opacity-60 border-dashed"
                              : "border-border/40 hover:border-border/80 hover:shadow-card-hover",
                          )}
                        >
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{
                                background: `${cat.color || "#6b7280"}15`,
                                border: `1px solid ${cat.color || "#6b7280"}30`,
                                boxShadow: `0 0 10px ${cat.color || "#6b7280"}10`,
                              }}
                            >
                              <Tag
                                size={16}
                                style={{ color: cat.color || "#6b7280" }}
                              />
                            </div>
                            <div className="min-w-0 pr-2">
                              <p className="text-sm font-bold text-foreground truncate">
                                {cat.name}
                              </p>
                              <p className="text-[11px] font-bold mt-0.5 uppercase tracking-wider text-muted-foreground">
                                {cat.is_default ? "Default" : "Custom"}
                                {cat.is_archived && (
                                  <span className="text-warning">
                                    {" "}
                                    &bull; Archived
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg bg-card border border-border/40 hover:bg-muted/50 shadow-sm"
                              onClick={() => {
                                setEditingCat(cat.id);
                                setCatForm({
                                  name: cat.name,
                                  icon: cat.icon || "",
                                  color: cat.color || "#2dd4bf",
                                });
                                setShowCatForm(true);
                              }}
                            >
                              <Edit3 size={14} className="text-foreground" />
                            </Button>
                            {cat.is_archived ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg bg-card border border-border/40 hover:text-success hover:bg-success/10 shadow-sm"
                                onClick={() =>
                                  handleArchiveCategory(cat.id, false)
                                }
                                title="Restore"
                              >
                                <CheckCircle2 size={14} />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg bg-card border border-border/40 hover:text-warning hover:bg-warning/10 shadow-sm"
                                onClick={() =>
                                  handleArchiveCategory(cat.id, true)
                                }
                                title="Archive"
                              >
                                <Archive size={14} />
                              </Button>
                            )}
                            {!cat.is_default && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg bg-card border border-border/40 hover:text-destructive hover:bg-destructive/10 shadow-sm"
                                onClick={() => handleDeleteCategory(cat.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Data & Backup */}
              {section === "data" && (
                <div className="space-y-5 animate-fade-in">
                  <div className="p-6 rounded-2xl bg-card border border-border/40 shadow-sm transition-all hover:border-primary/20">
                    <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0">
                          <Download size={20} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-base font-bold text-foreground tracking-tight">
                            Export All Data
                          </p>
                          <p className="text-sm font-medium text-muted-foreground mt-1 leading-relaxed">
                            Download a complete backup of your transactional
                            data, categories, and settings in JSON format.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleExportData}
                        disabled={exporting}
                        className="w-full sm:w-auto h-11 font-bold shadow-sm whitespace-nowrap min-w-[120px]"
                      >
                        {exporting ? "Exporting..." : "Download JSON"}
                      </Button>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-destructive/5 border border-destructive/20 transition-all hover:bg-destructive/10">
                    <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center border border-destructive/30 flex-shrink-0 shadow-sm">
                          <Trash2 size={20} className="text-destructive" />
                        </div>
                        <div>
                          <p className="text-base font-bold text-destructive tracking-tight">
                            Danger Zone: Delete Account
                          </p>
                          <p className="text-sm font-medium text-destructive/80 mt-1 leading-relaxed">
                            Permanently delete your account along with all
                            entered data. This action is irreversible.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full sm:w-auto h-11 font-bold shadow-md whitespace-nowrap min-w-[120px]"
                      >
                        Delete Account
                      </Button>
                    </div>
                  </div>

                  <Dialog
                    open={showDeleteConfirm}
                    onOpenChange={setShowDeleteConfirm}
                  >
                    <DialogContent className="max-w-sm p-6 glass-card border-border/60 shadow-xl sm:rounded-2xl">
                      <DialogHeader className="mb-4">
                        <DialogTitle className="text-xl font-bold text-destructive">
                          Delete Account
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-5">
                        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                          <p className="text-sm font-semibold text-destructive leading-relaxed">
                            This action is permanent and cannot be undone. All
                            your data will be permanently erased.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-bold text-foreground">
                            Type{" "}
                            <strong className="text-destructive tracking-widest bg-destructive/10 px-2 py-0.5 rounded">
                              DELETE
                            </strong>{" "}
                            to confirm
                          </Label>
                          <Input
                            className="glass-panel h-11 text-center font-bold tracking-widest uppercase"
                            value={deleteConfirmText}
                            onChange={(e) =>
                              setDeleteConfirmText(e.target.value)
                            }
                            placeholder="DELETE"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <Button
                            variant="outline"
                            className="h-11 font-semibold"
                            onClick={() => {
                              setShowDeleteConfirm(false);
                              setDeleteConfirmText("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            className="h-11 font-bold shadow-md"
                            disabled={deleteConfirmText !== "DELETE"}
                            onClick={handleDeleteAccount}
                          >
                            Delete Forever
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {/* Integrations */}
              {section === "integrations" && (
                <div className="space-y-6 animate-fade-in">
                  <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 shadow-sm flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-background flex items-center justify-center border border-primary/20 flex-shrink-0 shadow-sm">
                      <Link2 size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-foreground tracking-tight">
                        Transaction Ingestion Permissions
                      </p>
                      <p className="text-sm font-medium text-muted-foreground mt-1 leading-relaxed">
                        Enable only the flows you want. Finlo records explicit
                        consent and does not store CVV or full card details.
                      </p>
                    </div>
                  </div>

                  {integrationsLoading ? (
                    <div className="grid gap-4">
                      {[1, 2, 3].map((idx) => (
                        <Skeleton
                          key={idx}
                          className="h-20 w-full rounded-2xl border border-border/40"
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4">
                        {integrationOptions.map((option) => {
                          const colorVar =
                            option.status === "implemented"
                              ? "--success"
                              : option.status === "partial"
                                ? "--warning"
                                : option.status === "gated"
                                  ? "--primary"
                                  : "--destructive";

                          return (
                            <div
                              key={option.key}
                              className="p-5 rounded-2xl bg-card border border-border/40 shadow-sm transition-all hover:border-border/80"
                            >
                              <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                                <div>
                                  <p className="text-base font-bold text-foreground tracking-tight">
                                    {option.label}
                                  </p>
                                  <p className="text-sm font-medium text-muted-foreground mt-1">
                                    {option.reason}
                                  </p>
                                </div>
                                <span
                                  className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md shadow-sm"
                                  style={{
                                    color: `hsl(var(${colorVar}))`,
                                    background: `hsl(var(${colorVar}) / 0.1)`,
                                    border: `1px solid hsl(var(${colorVar}) / 0.2)`,
                                  }}
                                >
                                  {option.status.replace("-", " ")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-6 mt-6 border-t border-border/40 space-y-4">
                        <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
                          Consent Controls
                        </h4>
                        <div className="grid gap-3">
                          {[
                            {
                              key: "statement_import",
                              label: "Statement import (CSV/PDF)",
                            },
                            {
                              key: "aggregator_link",
                              label: "Bank aggregator linking",
                            },
                            {
                              key: "email_parse",
                              label: "Email statement parsing",
                            },
                            { key: "sms_parse", label: "SMS parsing (mobile)" },
                          ].map(({ key, label }) => {
                            const granted = isConsentGranted(
                              key as UserConsent["consent_type"],
                            );
                            return (
                              <div
                                key={key}
                                className="flex items-center justify-between p-4 rounded-xl bg-muted/10 border border-border/60 transition-all hover:bg-muted/30"
                              >
                                <div className="flex items-center gap-3.5">
                                  {granted ? (
                                    <div className="w-8 h-8 rounded-full bg-success/10 flex flex-shrink-0 items-center justify-center border border-success/20">
                                      <CheckCircle2
                                        size={16}
                                        className="text-success"
                                      />
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-muted/40 flex flex-shrink-0 items-center justify-center border border-border/60">
                                      <XCircle
                                        size={16}
                                        className="text-muted-foreground"
                                      />
                                    </div>
                                  )}
                                  <span className="text-sm font-semibold text-foreground">
                                    {label}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant={granted ? "outline" : "default"}
                                  onClick={() =>
                                    setConsent(
                                      key as UserConsent["consent_type"],
                                      !granted,
                                    )
                                  }
                                  className={clsx(
                                    "h-9 px-4 font-bold tracking-tight w-[90px]",
                                    granted
                                      ? "text-warning hover:text-warning border-warning/30 hover:bg-warning/10"
                                      : "shadow-sm",
                                  )}
                                >
                                  {granted ? "Revoke" : "Grant"}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {integrationNotes.length > 0 && (
                        <div className="pt-2 space-y-3">
                          {integrationNotes.map((note) => (
                            <div
                              key={note}
                              className="text-xs font-medium text-muted-foreground p-4 rounded-xl bg-muted/30 border border-border/40 leading-relaxed shadow-sm"
                            >
                              {note}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="p-4 rounded-xl flex items-start gap-4 bg-secondary/30 border border-secondary/50 shadow-sm mt-6">
                        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center border border-border/60 flex-shrink-0">
                          <FileSpreadsheet size={16} className="text-primary" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground leading-relaxed pt-0.5">
                          Statement import requires explicit{" "}
                          <strong className="text-foreground tracking-tight">
                            statement import consent
                          </strong>
                          . Once granted, you can navigate to the Transactions
                          page to upload CSVs securely.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Display */}
              {section === "display" && (
                <div className="space-y-8 animate-fade-in">
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
                      Theme Preference
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        {
                          mode: "light" as ThemeMode,
                          icon: Sun,
                          label: "Light",
                        },
                        {
                          mode: "dark" as ThemeMode,
                          icon: Moon,
                          label: "Dark",
                        },
                        {
                          mode: "system" as ThemeMode,
                          icon: Monitor,
                          label: "System",
                        },
                      ].map(({ mode, icon: Icon, label }) => (
                        <button
                          key={mode}
                          onClick={() => setTheme(mode)}
                          className={clsx(
                            "p-6 rounded-2xl flex flex-col items-center justify-center transition-all bg-card border shadow-sm",
                            theme === mode
                              ? "ring-2 ring-primary border-transparent bg-primary/5 shadow-md shadow-primary/10"
                              : "border-border/40 hover:border-border/80 hover:bg-muted/10",
                          )}
                        >
                          <div
                            className={clsx(
                              "w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors",
                              theme === mode
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted/50 text-muted-foreground border border-border/60",
                            )}
                          >
                            <Icon size={24} />
                          </div>
                          <p
                            className={clsx(
                              "text-base font-bold",
                              theme === mode
                                ? "text-primary"
                                : "text-foreground",
                            )}
                          >
                            {label}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-5 rounded-2xl bg-muted/20 border border-border/60 shadow-sm">
                    <h4 className="text-sm font-bold text-foreground mb-2">
                      Number Format Settings
                    </h4>
                    <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                      Currency format styling automatically aligns with your
                      selected default currency in Profile settings. Selecting
                      INR utilizes the Indian numbering system.
                    </p>
                  </div>
                </div>
              )}

              {/* Privacy */}
              {section === "privacy" && (
                <div className="space-y-8 animate-fade-in">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 rounded-2xl bg-primary/5 border border-primary/20 shadow-sm gap-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-background flex flex-shrink-0 items-center justify-center border border-primary/30 shadow-sm">
                        <Sparkles size={20} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-foreground tracking-tight">
                          Cloud AI Summary
                        </p>
                        <p className="text-sm font-medium text-muted-foreground mt-1 leading-relaxed max-w-xl">
                          Opt-in to securely send anonymised category totals for
                          generating natural-language spending summaries. Finlo
                          never transmits merchant names or PII.
                        </p>
                      </div>
                    </div>
                    <Toggle
                      id="cloud-ai"
                      checked={prefs.cloud_ai_opt_in}
                      onChange={(v) =>
                        setPrefs((p) => ({ ...p, cloud_ai_opt_in: v }))
                      }
                    />
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-foreground uppercase tracking-wider pl-1">
                      Built-in Privacy Features
                    </h4>
                    <div className="grid gap-3">
                      {[
                        {
                          label: "Data Anonymization",
                          desc: "Personal identifiers are completely stripped prior to statistical processing.",
                        },
                        {
                          label: "Local OCR Processing",
                          desc: "Bill images are solely processed on-device. Images are never uploaded.",
                        },
                        {
                          label: "Secure Inputs",
                          desc: "Financial input fields strictly block clipboard access limiting data leakage.",
                        },
                      ].map(({ label, desc }) => (
                        <div
                          key={label}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 px-5 rounded-2xl bg-card border border-border/40 shadow-sm gap-3 transition-colors hover:border-border/80"
                        >
                          <div>
                            <p className="text-[15px] font-bold text-foreground">
                              {label}
                            </p>
                            <p className="text-[13px] font-medium text-muted-foreground mt-0.5">
                              {desc}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-success/10 text-success border border-success/20 px-3 py-1 rounded-md shadow-sm w-fit">
                            <CheckCircle2 size={12} className="text-success" />{" "}
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              Active
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* About */}
              {section === "about" && (
                <div className="space-y-8 animate-fade-in max-w-lg mx-auto pb-6">
                  <div className="text-center py-8">
                    <div className="w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto mb-6 bg-gradient-to-br from-primary to-indigo-600 shadow-[0_10px_30px_hsl(var(--primary)/0.3)] border-4 border-background">
                      <IndianRupee
                        size={42}
                        className="text-white"
                        strokeWidth={2.5}
                      />
                    </div>
                    <h2 className="text-3xl font-bold text-foreground tracking-tight">
                      Finlo
                    </h2>
                    <p className="text-base font-semibold text-primary mt-1.5 uppercase tracking-widest">
                      Personal Finance Coach
                    </p>
                    <p className="text-sm font-medium text-muted-foreground mt-3 bg-muted/40 inline-block px-3 py-1 rounded-full border border-border/60">
                      Version 2.0.0-production
                    </p>
                  </div>

                  <div className="border border-border/40 rounded-2xl overflow-hidden bg-card shadow-sm">
                    {[
                      {
                        label: "Architecture",
                        value: "React + TypeScript SPA",
                      },
                      { label: "Database", value: "Supabase PostgreSQL" },
                      { label: "Security", value: "AES-256 & TLS 1.3" },
                      { label: "Design", value: "shadcn/ui + TailwindCSS" },
                    ].map(({ label, value }, i) => (
                      <div
                        key={label}
                        className={clsx(
                          "flex items-center justify-between p-4 px-5",
                          i !== 3 && "border-b border-border/40",
                        )}
                      >
                        <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                          {label}
                        </span>
                        <span className="text-sm font-bold text-foreground text-right">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="text-center mt-8">
                    <p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-1.5">
                      Built with <span className="text-rose-500">♥</span> for
                      financial freedom.
                    </p>
                  </div>
                </div>
              )}

              {/* Save Button */}
              {showSaveBtn && (
                <div className="flex justify-end pt-6 mt-2 border-t border-border/40">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="min-w-[160px] h-11 gap-2 font-bold shadow-md"
                  >
                    {saved ? (
                      <>
                        <Check size={18} /> Settings Saved
                      </>
                    ) : saving ? (
                      <>Saving...</>
                    ) : (
                      <>
                        <Save size={18} /> Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
