import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { Debt } from "@/types";
import { DEBT_TYPES } from "@/types";
import {
  Plus,
  Landmark,
  CreditCard,
  Users,
  ArrowDownRight,
  Check,
  Trash2,
  IndianRupee,
} from "lucide-react";
import { format } from "date-fns";
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

const typeIcons: Record<string, React.ReactNode> = {
  personal_loan: <Landmark size={18} />,
  credit_card: <CreditCard size={18} />,
  owed_to: <ArrowDownRight size={18} />,
  owed_by: <Users size={18} />,
};

const typeClasses: Record<string, string> = {
  personal_loan: "bg-primary/10 text-primary border-primary/20",
  credit_card: "bg-warning/10 text-warning border-warning/20",
  owed_to: "bg-destructive/10 text-destructive border-destructive/20",
  owed_by: "bg-success/10 text-success border-success/20",
};

const typeProgressClasses: Record<string, string> = {
  personal_loan: "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]",
  credit_card: "bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.4)]",
  owed_to: "bg-destructive shadow-[0_0_8px_hsl(var(--destructive)/0.4)]",
  owed_by: "bg-success shadow-[0_0_8px_hsl(var(--success)/0.4)]",
};

export const Debts: React.FC = () => {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [payModal, setPayModal] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [summary, setSummary] = useState({
    total_outstanding: 0,
    monthly_emi_total: 0,
    active_count: 0,
  });
  const [form, setForm] = useState({
    name: "",
    type: "personal_loan",
    total_amount: "",
    remaining_balance: "",
    interest_rate: "",
    emi_amount: "",
    next_due_date: "",
    lender_name: "",
  });

  const fetch = async () => {
    try {
      const [debtsRes, sumRes] = await Promise.all([
        api.get("/debts"),
        api.get("/debts/summary"),
      ]);
      setDebts(debtsRes.data || []);
      setSummary(sumRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/debts", {
      name: form.name,
      type: form.type,
      total_amount: parseFloat(form.total_amount),
      remaining_balance: parseFloat(
        form.remaining_balance || form.total_amount,
      ),
      interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
      emi_amount: form.emi_amount ? parseFloat(form.emi_amount) : null,
      next_due_date: form.next_due_date || null,
      lender_name: form.lender_name || null,
    });
    setShowModal(false);
    setForm({
      name: "",
      type: "personal_loan",
      total_amount: "",
      remaining_balance: "",
      interest_rate: "",
      emi_amount: "",
      next_due_date: "",
      lender_name: "",
    });
    fetch();
  };

  const handlePay = async () => {
    if (!payModal || !payAmount) return;
    await api.post(`/debts/${payModal}/payment`, {
      amount: parseFloat(payAmount),
    });
    setPayModal(null);
    setPayAmount("");
    fetch();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/debts/${id}`);
    fetch();
  };

  const handleSettle = async (id: string) => {
    await api.patch(`/debts/${id}`, { is_settled: true });
    fetch();
  };

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Debts & Loans</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            Track loans, credit cards, and IOUs
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowModal(true)}>
          <Plus size={16} /> <span className="hidden sm:inline">Add Debt</span>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total Outstanding",
            value: fmt(summary.total_outstanding),
            icon: IndianRupee,
            colorClass:
              "bg-destructive/10 text-destructive border-destructive/20",
          },
          {
            label: "Monthly EMI",
            value: fmt(summary.monthly_emi_total),
            icon: CreditCard,
            colorClass: "bg-warning/10 text-warning border-warning/20",
          },
          {
            label: "Active Debts",
            value: summary.active_count,
            icon: Landmark,
            colorClass: "bg-primary/10 text-primary border-primary/20",
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

      {/* Create Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md sm:max-w-lg glass-card border-border/40 text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">New Debt / Loan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                className="glass-panel"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Home Loan, Friend IOU..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="glass-panel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    {DEBT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Total Amount (₹)</Label>
                <Input
                  className="glass-panel"
                  type="number"
                  min="1"
                  value={form.total_amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, total_amount: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Remaining (₹)</Label>
                <Input
                  className="glass-panel"
                  type="number"
                  min="0"
                  value={form.remaining_balance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      remaining_balance: e.target.value,
                    }))
                  }
                  placeholder="Same as total"
                />
              </div>
              <div className="space-y-2">
                <Label>Interest Rate (%)</Label>
                <Input
                  className="glass-panel"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.interest_rate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, interest_rate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>EMI Amount (₹)</Label>
                <Input
                  className="glass-panel"
                  type="number"
                  min="0"
                  value={form.emi_amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, emi_amount: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Next Due Date</Label>
                <Input
                  className="glass-panel"
                  type="date"
                  value={form.next_due_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, next_due_date: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Lender / Borrower Name</Label>
              <Input
                className="glass-panel"
                value={form.lender_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lender_name: e.target.value }))
                }
                placeholder="Bank, Friend name..."
              />
            </div>
            <div className="pt-2 border-t border-border/40">
              <Button type="submit" className="w-full gap-2">
                <Plus size={16} /> Add Debt
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog
        open={!!payModal}
        onOpenChange={(o) => {
          if (!o) setPayModal(null);
        }}
      >
        <DialogContent className="max-w-sm glass-card border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle>Log Payment</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Label>Amount</Label>
            <Input
              className="glass-panel"
              type="number"
              min="1"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="Amount (₹)"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setPayModal(null)}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handlePay}>
              Log Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Debt List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass-card border-border/40">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : debts.length === 0 ? (
        <Card className="glass-card border-border/40 border-dashed bg-transparent shadow-none">
          <CardContent className="p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 border border-border/40">
              <Landmark size={28} className="text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">
              No debts or loans tracked yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Keep all your liabilities organized in one place.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {debts.map((d) => {
            const paidPct =
              ((d.total_amount - d.remaining_balance) / d.total_amount) * 100;
            const configClass = typeClasses[d.type] || "bg-muted border-border";
            const progressClass =
              typeProgressClasses[d.type] || "bg-muted-foreground";
            return (
              <Card
                key={d.id}
                className="glass-card border-border/40 group hover:-translate-y-1 hover:border-primary/20 hover:shadow-md transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-5 gap-4 sm:gap-0">
                    <div className="flex items-center gap-4">
                      <div
                        className={clsx(
                          "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border",
                          configClass,
                        )}
                      >
                        {typeIcons[d.type]}
                      </div>
                      <div>
                        <p className="text-base font-bold text-foreground mb-1">
                          {d.name}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground flex flex-wrap items-center gap-1.5">
                          {DEBT_TYPES.find((t) => t.value === d.type)?.label}
                          {d.lender_name && (
                            <>
                              <span className="opacity-50">&bull;</span>{" "}
                              {d.lender_name}
                            </>
                          )}
                          {d.next_due_date && (
                            <>
                              <span className="opacity-50">&bull;</span> Due{" "}
                              {format(new Date(d.next_due_date), "MMM d, yyyy")}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto ml-16 sm:ml-0">
                      {d.is_settled ? (
                        <span className="px-2.5 py-1 rounded bg-success/10 text-success border border-success/20 text-[10px] font-bold uppercase tracking-wider">
                          Settled
                        </span>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 bg-background hover:bg-muted"
                            onClick={() => setPayModal(d.id)}
                          >
                            Pay
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:bg-success/10 hover:text-success"
                            onClick={() => handleSettle(d.id)}
                            title="Settle"
                          >
                            <Check size={16} />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(d.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  <div className="mb-4 bg-muted/20 p-4 rounded-xl border border-border/40">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-foreground font-bold">
                        {fmt(d.total_amount - d.remaining_balance)}{" "}
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider ml-1">
                          paid
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        of {fmt(d.total_amount)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary/60 overflow-hidden">
                      <div
                        className={clsx(
                          "h-full rounded-full transition-all duration-1000 ease-out",
                          progressClass,
                        )}
                        style={{ width: `${Math.min(paidPct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-between gap-4 text-xs font-semibold px-1">
                    <span className="text-foreground">
                      Remaining: {fmt(d.remaining_balance)}
                    </span>
                    {d.emi_amount && (
                      <span className="text-muted-foreground">
                        EMI:{" "}
                        <span className="text-foreground">
                          {fmt(d.emi_amount)}/mo
                        </span>
                      </span>
                    )}
                    {d.interest_rate && (
                      <span className="text-muted-foreground">
                        Rate:{" "}
                        <span className="text-foreground">
                          {d.interest_rate}% p.a.
                        </span>
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
