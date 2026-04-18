import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { Budget } from "@/types";
import {
  PiggyBank,
  Plus,
  Trash2,
  Target,
  TrendingDown,
  AlertTriangle,
  Edit3,
  History,
  Save,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

const CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Entertainment",
  "Shopping",
  "Healthcare",
  "Utilities",
  "Travel",
  "Education",
  "Other",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface NewBudget {
  category: string;
  limit_amount: number;
  month: number;
  year: number;
  rollover_enabled: boolean;
  is_percentage: boolean;
}

type BudgetHistoryEntry = {
  id: string;
  version: number;
  change_reason: string;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export const Budgets: React.FC = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [historyBudget, setHistoryBudget] = useState<Budget | null>(null);
  const [historyItems, setHistoryItems] = useState<BudgetHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [form, setForm] = useState<NewBudget>({
    category: CATEGORIES[0],
    limit_amount: 5000,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    rollover_enabled: false,
    is_percentage: false,
  });
  const [editForm, setEditForm] = useState({
    limit_amount: 0,
    soft_alert: 0.8,
    hard_alert: 1.0,
    rollover_enabled: false,
    is_percentage: false,
  });

  const fetchBudgets = async () => {
    try {
      const res = await api.get("/budgets");
      setBudgets(res.data?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, []);

  const handleCreate = async () => {
    if (!form.category || form.limit_amount <= 0) {
      setError("Please fill in all fields correctly.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/budgets", form);
      setShowForm(false);
      await fetchBudgets();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || "Failed to create budget.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/budgets/${id}`);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setEditForm({
      limit_amount: budget.limit_amount,
      soft_alert: budget.soft_alert,
      hard_alert: budget.hard_alert,
      rollover_enabled: budget.rollover_enabled,
      is_percentage: budget.is_percentage,
    });
    setError("");
    setShowEditForm(true);
  };

  const handleEditSave = async () => {
    if (!editingBudget) return;
    if (editForm.limit_amount <= 0) {
      setError("Limit amount must be greater than 0.");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/budgets/${editingBudget.id}`, editForm);
      setShowEditForm(false);
      setEditingBudget(null);
      await fetchBudgets();
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { detail?: string; message?: string } };
      };
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Failed to update budget.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (budget: Budget) => {
    setShowHistory(true);
    setHistoryBudget(budget);
    setHistoryLoading(true);
    setHistoryItems([]);
    try {
      const res = await api.get(`/budgets/${budget.id}/history`);
      setHistoryItems(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const totalBudgeted = budgets.reduce((a, b) => a + b.limit_amount, 0);
  const totalSpent = budgets.reduce((a, b) => a + (b.spent || 0), 0);
  const overBudget = budgets.filter((b) => b.alert_level === "hard").length;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Budgets</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            Set spending limits and track your progress
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
          <Plus size={15} />
          New Budget
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total Budgeted",
            value: `₹${totalBudgeted.toLocaleString("en-IN")}`,
            icon: Target,
            colorClass: "bg-primary/10 text-primary border-primary/20",
          },
          {
            label: "Total Spent",
            value: `₹${totalSpent.toLocaleString("en-IN")}`,
            icon: TrendingDown,
            colorClass: "bg-warning/10 text-warning border-warning/20",
          },
          {
            label: "Over Budget",
            value: overBudget,
            icon: AlertTriangle,
            colorClass:
              overBudget > 0
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-success/10 text-success border-success/20",
          },
        ].map(({ label, value, icon: Icon, colorClass }) => (
          <Card
            key={label}
            className="glass-card border-border/40 hover:border-primary/20 transition-all duration-300"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div
                className={clsx(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                  colorClass,
                )}
              >
                <Icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tracking-tight">
                  {loading ? "—" : value}
                </p>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
                  {label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(o) => {
          setShowForm(o);
          if (!o) setError("");
        }}
      >
        <DialogContent className="max-w-md sm:max-w-lg glass-card border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">Create Budget</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-5">
            {error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex gap-2 items-center">
                <AlertTriangle size={16} />
                {error}
              </div>
            ) : null}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
                >
                  <SelectTrigger className="glass-panel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-limit">Monthly Limit (₹)</Label>
                <Input
                  id="budget-limit"
                  type="number"
                  min={1}
                  className="glass-panel"
                  value={form.limit_amount || ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      limit_amount: Number(e.target.value),
                    }))
                  }
                  placeholder="5000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={String(form.month)}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, month: Number(v) }))
                    }
                  >
                    <SelectTrigger className="glass-panel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-panel">
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget-year">Year</Label>
                  <Input
                    id="budget-year"
                    type="number"
                    className="glass-panel"
                    value={form.year}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, year: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer font-medium p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={form.rollover_enabled}
                onChange={(e) =>
                  setForm((p) => ({ ...p, rollover_enabled: e.target.checked }))
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary border-muted-foreground bg-transparent"
              />
              Rollover unused budget
            </label>
          </div>
          <div className="flex gap-3 pt-4 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 gap-2"
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? "Creating..." : "Create Budget"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditForm && !!editingBudget}
        onOpenChange={(o) => {
          setShowEditForm(o);
          if (!o) {
            setEditingBudget(null);
            setError("");
          }
        }}
      >
        <DialogContent className="max-w-md sm:max-w-lg glass-card border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Edit Budget (one-time monthly)
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-5">
            {error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex gap-2 items-center">
                <AlertTriangle size={16} />
                {error}
              </div>
            ) : null}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-limit">Monthly Limit (₹)</Label>
                <Input
                  id="edit-limit"
                  type="number"
                  min={1}
                  className="glass-panel"
                  value={editForm.limit_amount || ""}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      limit_amount: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="soft-alert">Soft Alert (0-1)</Label>
                  <Input
                    id="soft-alert"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="glass-panel"
                    value={editForm.soft_alert}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        soft_alert: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hard-alert">Hard Alert (0-1)</Label>
                  <Input
                    id="hard-alert"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="glass-panel"
                    value={editForm.hard_alert}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        hard_alert: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer font-medium p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={editForm.rollover_enabled}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        rollover_enabled: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-muted-foreground bg-transparent"
                  />
                  Rollover unused budget
                </label>
                <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer font-medium p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={editForm.is_percentage}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        is_percentage: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded text-primary focus:ring-primary border-muted-foreground bg-transparent"
                  />
                  Limit is percentage based
                </label>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowEditForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 gap-1.5"
              disabled={saving}
              onClick={handleEditSave}
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save one-time edit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showHistory && !!historyBudget}
        onOpenChange={(o) => {
          setShowHistory(o);
          if (!o) setHistoryBudget(null);
        }}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto glass-card border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Budget History ·{" "}
              <span className="text-primary">{historyBudget?.category}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((idx) => (
                  <Skeleton key={idx} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border/60 rounded-xl bg-muted/10">
                <p className="text-sm text-muted-foreground font-medium">
                  No history available.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyItems.map((entry) => (
                  <Card
                    key={entry.id}
                    className="border-border/40 bg-background/50 hover:bg-background transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-foreground">
                          Version {entry.version}
                        </p>
                        <span className="text-xs font-medium text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm mt-1 text-muted-foreground">
                        Reason: {entry.change_reason}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="glass-card border-border/40">
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <Card className="glass-card border-border/40 border-dashed bg-transparent shadow-none">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 border border-border/40">
              <PiggyBank size={32} className="text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">
              No budgets yet.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Create one to start tracking your spending.
            </p>
            <Button
              className="gap-2 mx-auto"
              onClick={() => setShowForm(true)}
              size="lg"
            >
              <Plus size={16} /> Create First Budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {budgets.map((b) => {
            const pct = Math.min(((b.spent || 0) / b.limit_amount) * 100, 100);
            const isHard = b.alert_level === "hard";
            const isSoft = b.alert_level === "soft";
            const colorClass = isHard
              ? "bg-destructive shadow-[0_0_10px_hsl(var(--destructive)/0.3)]"
              : isSoft
                ? "bg-warning shadow-[0_0_10px_hsl(var(--warning)/0.3)]"
                : "bg-success shadow-[0_0_10px_hsl(var(--success)/0.3)]";
            const badgeClass = isHard
              ? "bg-destructive/10 text-destructive border-destructive/20"
              : isSoft
                ? "bg-warning/10 text-warning border-warning/20"
                : "bg-success/10 text-success border-success/20";

            return (
              <Card
                key={b.id}
                className="glass-card border-border/40 group hover:-translate-y-1 hover:border-primary/20 hover:shadow-md transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <p className="font-bold text-base text-foreground mb-1 flex items-center gap-2">
                        {b.category}
                        {b.alert_level === "hard" && (
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-destructive/10 text-destructive border border-destructive/20">
                            Over Budget
                          </span>
                        )}
                        {b.alert_level === "soft" && (
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-warning/10 text-warning border border-warning/20">
                            80% Used
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        {MONTHS[b.month - 1]} {b.year} · Version {b.version}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => openHistory(b)}
                        title="Version history"
                      >
                        <History size={16} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={clsx(
                          "h-8 w-8",
                          b.can_edit
                            ? "text-muted-foreground hover:text-warning hover:bg-warning/10"
                            : "text-muted-foreground/30",
                        )}
                        disabled={!b.can_edit}
                        onClick={() => openEdit(b)}
                        title={
                          b.can_edit
                            ? "Edit budget"
                            : "Monthly edit already used"
                        }
                      >
                        {b.can_edit ? <Edit3 size={16} /> : <Ban size={16} />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(b.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-foreground font-bold text-lg">
                        ₹{(b.spent || 0).toLocaleString("en-IN")}{" "}
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest ml-1">
                          spent
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        of ₹{b.limit_amount.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={clsx(
                          "h-full rounded-full transition-all duration-1000 ease-out",
                          colorClass,
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs font-medium pt-1">
                    <span className="text-muted-foreground uppercase tracking-wider">
                      {pct.toFixed(0)}% used
                    </span>
                    <span
                      className={clsx(
                        "px-2 py-1 rounded-md border",
                        badgeClass,
                      )}
                    >
                      {b.remaining < 0
                        ? `₹${Math.abs(b.remaining).toLocaleString("en-IN")} over`
                        : `₹${(b.remaining || 0).toLocaleString("en-IN")} left`}
                    </span>
                  </div>
                  {!b.can_edit && (
                    <p className="text-xs font-medium mt-3 text-warning">
                      Edit limit reached for this month.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
