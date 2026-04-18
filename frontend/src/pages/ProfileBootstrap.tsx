import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Lock,
  User as UserIcon,
  Calendar,
  MapPin,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import clsx from "clsx";

export const ProfileBootstrap: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.profile?.username || "");
  const [dateOfBirth, setDateOfBirth] = useState(
    user?.profile?.date_of_birth || "",
  );
  const [city, setCity] = useState(user?.profile?.city || user?.city || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const usernameLocked = user?.profile?.is_username_editable === false;
  const dobLocked = user?.profile?.is_date_of_birth_editable === false;

  const canSubmit = useMemo(() => {
    const hasUsername = usernameLocked
      ? !!user?.profile?.username
      : username.trim().length >= 3;
    const hasDob = dobLocked ? !!user?.profile?.date_of_birth : !!dateOfBirth;
    return hasUsername && hasDob;
  }, [
    usernameLocked,
    dobLocked,
    user?.profile?.username,
    user?.profile?.date_of_birth,
    username,
    dateOfBirth,
  ]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError("");
    try {
      await api.patch("/auth/me", {
        profile: {
          username: usernameLocked ? user?.profile?.username : username.trim(),
          date_of_birth: dobLocked ? user?.profile?.date_of_birth : dateOfBirth,
          city: city || null,
        },
      });
      await refreshUser();
      navigate("/dashboard");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Unable to save profile details.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none" />

      <Card className="w-full max-w-lg glass-card border-border/40 animate-slide-up mx-auto relative z-10 shadow-2xl shadow-primary/5 sm:rounded-[32px]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-400 to-primary" />
        <CardHeader className="pb-6 pt-10 px-8 sm:px-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br from-primary to-indigo-500 shadow-lg shadow-primary/30">
            <Sparkles size={28} className="text-white" />
          </div>
          <CardTitle className="text-3xl font-extrabold text-foreground tracking-tight">
            Complete Profile
          </CardTitle>
          <p className="text-sm font-medium text-muted-foreground mt-2 leading-relaxed">
            Initialize your secure Finlo foundation. We require a username and
            your date of birth to proceed.
          </p>
        </CardHeader>
        <CardContent className="px-8 sm:px-10 pb-10">
          <div className="mb-8 p-4 rounded-xl text-[13px] font-medium bg-primary/10 border border-primary/20 text-foreground flex items-start gap-4 shadow-sm">
            <Lock size={18} className="text-primary flex-shrink-0" />
            <p className="leading-relaxed opacity-90">
              Username and date of birth become permanently{" "}
              <strong className="font-bold">locked</strong> after the first
              setup to guarantee data integrity and auditability.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl text-sm font-semibold shadow-sm bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3 animate-fade-in">
              <AlertCircle size={18} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <UserIcon size={14} className="opacity-70" /> Username
              </Label>
              <div className="relative">
                <Input
                  className={clsx(
                    "glass-panel h-12 font-medium tracking-wide",
                    usernameLocked
                      ? "pr-10 opacity-70 cursor-not-allowed bg-muted/30 border-dashed"
                      : "hover:border-primary/40",
                  )}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
                  disabled={usernameLocked}
                  placeholder="e.g. alexander"
                  required={!usernameLocked}
                />
                {usernameLocked && (
                  <Lock
                    size={14}
                    className="absolute right-4 top-4 text-muted-foreground"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Calendar size={14} className="opacity-70" /> Date of Birth
              </Label>
              <div className="relative">
                <Input
                  type="date"
                  className={clsx(
                    "glass-panel h-12 font-medium tracking-wide",
                    dobLocked
                      ? "pr-10 opacity-70 cursor-not-allowed bg-muted/30 border-dashed"
                      : "hover:border-primary/40",
                  )}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  disabled={dobLocked}
                  required={!dobLocked}
                />
                {dobLocked && (
                  <Lock
                    size={14}
                    className="absolute right-4 top-4 text-muted-foreground"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <MapPin size={14} className="opacity-70" /> City{" "}
                <span className="opacity-60 text-xs font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                className="glass-panel h-12 font-medium hover:border-primary/40"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Mumbai"
              />
            </div>

            <Button
              className="w-full h-12 text-base font-bold gap-2 mt-4 shadow-lg"
              type="submit"
              disabled={saving || !canSubmit}
            >
              {saving ? "Initializing..." : "Continue to Dashboard"}
              {!saving && <CheckCircle2 size={18} />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
