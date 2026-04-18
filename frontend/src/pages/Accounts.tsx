import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Landmark,
  Wallet,
  CreditCard,
  Banknote,
  HandCoins,
  Plus,
  TrendingUp,
  TrendingDown,
  EyeOff,
  ArrowUpDown,
  IndianRupee,
} from "lucide-react";
import type { Account, NetWorth } from "@/types";
import { ACCOUNT_TYPES } from "@/types";
import clsx from "clsx";

const ICON_MAP: Record<string, React.ReactNode> = {
  bank: <Landmark className="w-5 h-5" />,
  cash: <Banknote className="w-5 h-5" />,
  wallet: <Wallet className="w-5 h-5" />,
  credit_card: <CreditCard className="w-5 h-5" />,
  loan: <HandCoins className="w-5 h-5" />,
};

const TYPE_COLORS: Record<string, string> = {
  bank: "from-blue-500/20 to-blue-600/5 border-blue-500/30",
  cash: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30",
  wallet: "from-violet-500/20 to-violet-600/5 border-violet-500/30",
  credit_card: "from-amber-500/20 to-amber-600/5 border-amber-500/30",
  loan: "from-rose-500/20 to-rose-600/5 border-rose-500/30",
};

const ICON_BG: Record<string, string> = {
  bank: "bg-blue-500/15 text-blue-400",
  cash: "bg-emerald-500/15 text-emerald-400",
  wallet: "bg-violet-500/15 text-violet-400",
  credit_card: "bg-amber-500/15 text-amber-400",
  loan: "bg-rose-500/15 text-rose-400",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);

export const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snapshotDialog, setSnapshotDialog] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "bank",
    institution_label: "",
    last4: "",
    opening_balance: "",
  });
  const [snapshotForm, setSnapshotForm] = useState({
    balance: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [acctRes, nwRes] = await Promise.all([
        api.get("/accounts?active_only=false"),
        api.get("/accounts/net-worth"),
      ]);
      setAccounts(acctRes.data);
      setNetWorth(nwRes.data);
    } catch {
      /* empty */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fetchData();
    });
    return () => cancelAnimationFrame(frame);
  }, [fetchData]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (editingAccount) {
        await api.patch(`/accounts/${editingAccount.id}`, {
          name: form.name,
          institution_label: form.institution_label || null,
          last4: form.last4 || null,
        });
      } else {
        await api.post("/accounts", {
          name: form.name,
          type: form.type,
          institution_label: form.institution_label || null,
          last4: form.last4 || null,
          opening_balance: parseFloat(form.opening_balance) || 0,
        });
      }
      setDialogOpen(false);
      setEditingAccount(null);
      fetchData();
    } catch {
      /* empty */
    }
    setSaving(false);
  };

  const handleSnapshot = async () => {
    if (!snapshotDialog) return;
    setSaving(true);
    try {
      await api.post(`/accounts/${snapshotDialog}/snapshots`, {
        date: snapshotForm.date,
        balance: parseFloat(snapshotForm.balance) || 0,
        notes: snapshotForm.notes || null,
      });
      setSnapshotDialog(null);
      fetchData();
    } catch {
      /* empty */
    }
    setSaving(false);
  };

  const openEdit = (a: Account) => {
    setEditingAccount(a);
    setForm({
      name: a.name,
      type: a.type,
      institution_label: a.institution_label || "",
      last4: a.last4 || "",
      opening_balance: "",
    });
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditingAccount(null);
    setForm({
      name: "",
      type: "bank",
      institution_label: "",
      last4: "",
      opening_balance: "",
    });
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in pb-10">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your bank accounts, wallets, and credit lines
          </p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus size={16} /> Add Account
        </Button>
      </div>

      {/* Net Worth Summary */}
      {netWorth && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Total Assets
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {fmt(netWorth.total_assets)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-destructive/10">
                  <TrendingDown className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Total Liabilities
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {fmt(netWorth.total_liabilities)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={clsx(
                    "p-2.5 rounded-xl",
                    netWorth.net_worth >= 0
                      ? "bg-emerald-500/10"
                      : "bg-destructive/10",
                  )}
                >
                  <IndianRupee
                    className={clsx(
                      "w-5 h-5",
                      netWorth.net_worth >= 0
                        ? "text-emerald-400"
                        : "text-destructive",
                    )}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Net Worth
                  </p>
                  <p
                    className={clsx(
                      "text-lg font-bold",
                      netWorth.net_worth >= 0
                        ? "text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {fmt(netWorth.net_worth)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account Cards */}
      {accounts.length === 0 ? (
        <Card className="glass-card border-border/40">
          <CardContent className="p-12 flex flex-col items-center text-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <Wallet className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">No accounts yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add your bank accounts, cash wallets, and credit cards to track
              balances and net worth.
            </p>
            <Button onClick={openAdd} size="sm" className="mt-2 gap-1.5">
              <Plus size={14} /> Add Your First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <Card
              key={a.id}
              className={clsx(
                "border bg-gradient-to-br transition-all duration-300 hover:shadow-lg hover:scale-[1.01] cursor-pointer",
                TYPE_COLORS[a.type],
                !a.is_active && "opacity-50",
              )}
              onClick={() => openEdit(a)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={clsx("p-2.5 rounded-xl", ICON_BG[a.type])}>
                      {ICON_MAP[a.type]}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {a.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label}
                        {a.last4 && ` •••• ${a.last4}`}
                      </p>
                    </div>
                  </div>
                  {!a.is_active && (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                <div className="mt-4">
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">
                    Current Balance
                  </p>
                  <p
                    className={clsx(
                      "text-xl font-bold",
                      a.type === "credit_card" || a.type === "loan"
                        ? a.current_balance > 0
                          ? "text-destructive"
                          : "text-emerald-400"
                        : a.current_balance >= 0
                          ? "text-foreground"
                          : "text-destructive",
                    )}
                  >
                    {fmt(a.current_balance)}
                  </p>
                </div>

                {a.institution_label && (
                  <p className="text-xs text-muted-foreground mt-2 truncate">
                    {a.institution_label}
                  </p>
                )}

                <div className="flex justify-end mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSnapshotDialog(a.id);
                      setSnapshotForm({
                        balance: String(a.current_balance),
                        date: new Date().toISOString().slice(0, 10),
                        notes: "",
                      });
                    }}
                  >
                    <ArrowUpDown size={12} /> Record Balance
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md glass-card">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit Account" : "Add Account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Account Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. HDFC Savings"
                className="mt-1.5"
              />
            </div>
            {!editingAccount && (
              <div>
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Institution (optional)</Label>
              <Input
                value={form.institution_label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, institution_label: e.target.value }))
                }
                placeholder="e.g. HDFC Bank"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Last 4 Digits (optional)</Label>
              <Input
                value={form.last4}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last4: e.target.value.slice(0, 4) }))
                }
                placeholder="1234"
                maxLength={4}
                className="mt-1.5"
              />
            </div>
            {!editingAccount && (
              <div>
                <Label>Opening Balance (₹)</Label>
                <Input
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, opening_balance: e.target.value }))
                  }
                  placeholder="0"
                  className="mt-1.5"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || saving}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Balance Snapshot Dialog */}
      <Dialog
        open={!!snapshotDialog}
        onOpenChange={() => setSnapshotDialog(null)}
      >
        <DialogContent className="sm:max-w-md glass-card">
          <DialogHeader>
            <DialogTitle>Record Balance Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={snapshotForm.date}
                onChange={(e) =>
                  setSnapshotForm((f) => ({ ...f, date: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Balance (₹)</Label>
              <Input
                type="number"
                value={snapshotForm.balance}
                onChange={(e) =>
                  setSnapshotForm((f) => ({ ...f, balance: e.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={snapshotForm.notes}
                onChange={(e) =>
                  setSnapshotForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="e.g. After salary credit"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapshotDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSnapshot} disabled={saving}>
              {saving ? "Saving..." : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
