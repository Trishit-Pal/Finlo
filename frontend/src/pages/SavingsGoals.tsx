import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { SavingsGoal } from "@/types";
import { Plus, Trash2, Target, PiggyBank, TrendingUp } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
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
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

export const SavingsGoals: React.FC = () => {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [contributeModal, setContributeModal] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    deadline: "",
  });

  const fetch = async () => {
    try {
      const res = await api.get("/savings");
      setGoals(res.data || []);
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
    await api.post("/savings", {
      name: form.name,
      target_amount: parseFloat(form.target_amount),
      deadline: form.deadline || null,
    });
    setShowModal(false);
    setForm({ name: "", target_amount: "", deadline: "" });
    fetch();
  };

  const handleContribute = async () => {
    if (!contributeModal || !contributeAmount) return;
    await api.post(`/savings/${contributeModal}/contribute`, {
      amount: parseFloat(contributeAmount),
    });
    setContributeModal(null);
    setContributeAmount("");
    fetch();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/savings/${id}`);
    fetch();
  };

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.current_amount, 0);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Savings Goals</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            Track your savings targets and progress
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2 shadow-sm"
          onClick={() => setShowModal(true)}
        >
          <Plus size={16} /> <span className="hidden sm:inline">New Goal</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total Target",
            value: fmt(totalTarget),
            icon: Target,
            colorClass: "text-primary bg-primary/10 border-primary/20",
          },
          {
            label: "Total Saved",
            value: fmt(totalSaved),
            icon: PiggyBank,
            colorClass: "text-success bg-success/10 border-success/20",
          },
          {
            label: "Active Goals",
            value: goals.length,
            icon: TrendingUp,
            colorClass: "text-warning bg-warning/10 border-warning/20",
          },
        ].map(({ label, value, icon: Icon, colorClass }) => (
          <Card
            key={label}
            className="glass-card border-border/40 hover:border-primary/20 transition-all duration-300 shadow-sm"
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
        <DialogContent className="max-w-md p-6 glass-card border-border/60 shadow-xl sm:rounded-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold">
              New Savings Goal
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Goal Name</Label>
              <Input
                className="glass-panel h-11"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Emergency Fund, Vacation..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Target Amount (₹)
                </Label>
                <Input
                  className="glass-panel h-11"
                  type="number"
                  min="1"
                  value={form.target_amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, target_amount: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Deadline (optional)
                </Label>
                <Input
                  className="glass-panel h-11"
                  type="date"
                  value={form.deadline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deadline: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-md"
              >
                Create Goal
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contribute Modal */}
      <Dialog
        open={!!contributeModal}
        onOpenChange={(o) => {
          if (!o) setContributeModal(null);
        }}
      >
        <DialogContent className="max-w-sm p-6 glass-card border-border/60 shadow-xl sm:rounded-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold">
              Add Contribution
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Amount to Contribute
              </Label>
              <Input
                className="glass-panel h-11 text-lg"
                type="number"
                min="1"
                value={contributeAmount}
                onChange={(e) => setContributeAmount(e.target.value)}
                placeholder="₹0.00"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-11 font-semibold glass-panel hover:bg-muted/50"
                onClick={() => setContributeModal(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 font-semibold shadow-md"
                onClick={handleContribute}
                disabled={
                  !contributeAmount || parseFloat(contributeAmount) <= 0
                }
              >
                Contribute
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Goals Grid */}
      <div className="animate-scale-in">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="glass-card border-border/40 shadow-sm">
                <CardContent className="p-6 space-y-5">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32 rounded" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-16 rounded" />
                      <Skeleton className="h-3 w-16 rounded" />
                    </div>
                    <Skeleton className="h-2.5 w-full rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : goals.length === 0 ? (
          <Card className="glass-card border-border/40 border-dashed bg-transparent shadow-none">
            <CardContent className="p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                <PiggyBank size={32} className="text-primary/80" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">
                No savings goals yet.
              </p>
              <p className="text-sm text-muted-foreground mb-5">
                Set a goal to start building your savings habit.
              </p>
              <Button
                size="sm"
                className="gap-2 shadow-sm"
                onClick={() => setShowModal(true)}
              >
                <Plus size={16} /> Create First Goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map((g) => {
              const pct = Math.min(
                (g.current_amount / g.target_amount) * 100,
                100,
              );
              const isComplete = g.current_amount >= g.target_amount;
              const daysLeft = g.deadline
                ? differenceInDays(parseISO(g.deadline), new Date())
                : null;
              const dailyNeeded =
                daysLeft && daysLeft > 0
                  ? (g.target_amount - g.current_amount) / daysLeft
                  : null;

              return (
                <Card
                  key={g.id}
                  className="glass-card border-border/40 group hover:border-primary/30 hover:shadow-card-hover transition-all duration-300"
                >
                  <CardContent className="p-6 relative">
                    <div className="absolute top-4 right-4 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(g.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div className="mb-6 pr-8">
                      <p className="text-lg font-bold text-foreground tracking-tight leading-tight">
                        {g.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {g.deadline
                            ? `Due ${format(parseISO(g.deadline), "MMM d, yyyy")}`
                            : "No deadline"}
                        </p>
                        {daysLeft !== null && daysLeft > 0 && !isComplete && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted/50 text-foreground border border-border/60">
                            {daysLeft} days left
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mb-5">
                      <div className="flex justify-between items-baseline mb-2">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-foreground tracking-tight">
                            {fmt(g.current_amount)}
                          </span>
                          <span className="text-sm font-medium text-muted-foreground">
                            saved
                          </span>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full border border-border/40">
                          of {fmt(g.target_amount)}
                        </span>
                      </div>

                      <div className="h-2.5 w-full rounded-full bg-secondary/60 overflow-hidden border border-border/40">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out relative"
                          style={{
                            width: `${pct}%`,
                            background: isComplete
                              ? "hsl(var(--success))"
                              : "hsl(var(--primary))",
                          }}
                        >
                          <div
                            className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite] -skew-x-12"
                            style={{ transform: "translateX(-100%)" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={clsx(
                            "text-sm font-bold",
                            isComplete ? "text-success" : "text-foreground",
                          )}
                        >
                          {pct.toFixed(0)}% complete
                        </span>
                        {dailyNeeded && dailyNeeded > 0 && !isComplete ? (
                          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                            Save {fmt(Math.ceil(dailyNeeded))}/day
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {isComplete ? "Goal Achieved!" : "Keep going!"}
                          </span>
                        )}
                      </div>
                      {isComplete ? (
                        <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center border border-success/20">
                          <Target size={14} className="text-success" />
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs font-semibold px-3 glass-panel hover:bg-primary/5 hover:text-primary hover:border-primary/30"
                          onClick={() => setContributeModal(g.id)}
                        >
                          <Plus size={13} /> Add
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
