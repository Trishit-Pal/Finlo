import React, { useState, useEffect, useMemo } from "react";
import { api } from "@/services/api";
import type { Bill } from "@/types";
import { BILL_FREQUENCIES } from "@/types";
import {
  Plus,
  Check,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  Trash2,
  Receipt,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import clsx from "clsx";

const CATEGORIES = [
  "Food & Dining",
  "Transport",
  "Groceries",
  "Shopping",
  "Health",
  "Utilities",
  "Entertainment",
  "Education",
  "Travel",
  "EMI/Loan",
  "Rent",
  "Savings",
  "Miscellaneous",
];

const NONE = "__none__";

export const Bills: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calMonth, setCalMonth] = useState(new Date());
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid" | "overdue">(
    "all",
  );
  const [form, setForm] = useState({
    name: "",
    amount: "",
    is_variable: false,
    due_date: format(new Date(), "yyyy-MM-dd"),
    frequency: "monthly",
    category: "",
    reminder_lead_days: "3",
    auto_create_expense: false,
    description: "",
  });

  const fetchBills = async () => {
    try {
      const res = await api.get("/bills");
      setBills(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/bills", {
      name: form.name,
      amount: parseFloat(form.amount),
      is_variable: form.is_variable,
      due_date: form.due_date,
      frequency: form.frequency,
      category: form.category || null,
      reminder_lead_days: parseInt(form.reminder_lead_days),
      auto_create_expense: form.auto_create_expense,
      description: form.description || null,
    });
    setShowModal(false);
    setForm({
      name: "",
      amount: "",
      is_variable: false,
      due_date: format(new Date(), "yyyy-MM-dd"),
      frequency: "monthly",
      category: "",
      reminder_lead_days: "3",
      auto_create_expense: false,
      description: "",
    });
    fetchBills();
  };

  const handleMarkPaid = async (id: string) => {
    await api.post(`/bills/${id}/mark-paid`);
    fetchBills();
  };

  const handleMarkUnpaid = async (id: string) => {
    await api.post(`/bills/${id}/mark-unpaid`);
    fetchBills();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/bills/${id}`);
    fetchBills();
  };

  const today = new Date().toISOString().split("T")[0];

  const getStatus = (b: Bill): "paid" | "overdue" | "upcoming" => {
    if (b.is_paid) return "paid";
    if (b.due_date < today) return "overdue";
    return "upcoming";
  };

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const status = getStatus(b);
      if (filter === "all") return true;
      if (filter === "unpaid") return status !== "paid";
      if (filter === "paid") return status === "paid";
      if (filter === "overdue") return status === "overdue";
      return true;
    });
  }, [bills, filter]);

  const statusConfig = {
    paid: {
      colorClass: "text-success",
      bgClass: "bg-success/10",
      borderClass: "border-success/20",
      icon: CheckCircle2,
      label: "Paid",
    },
    overdue: {
      colorClass: "text-destructive",
      bgClass: "bg-destructive/10",
      borderClass: "border-destructive/20",
      icon: AlertTriangle,
      label: "Overdue",
    },
    upcoming: {
      colorClass: "text-warning",
      bgClass: "bg-warning/10",
      borderClass: "border-warning/20",
      icon: Clock,
      label: "Upcoming",
    },
  };

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

  // Calendar helpers
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);
  const billsByDate = useMemo(() => {
    const map: Record<string, Bill[]> = {};
    bills.forEach((b) => {
      if (!map[b.due_date]) map[b.due_date] = [];
      map[b.due_date].push(b);
    });
    return map;
  }, [bills]);

  const unpaidTotal = bills
    .filter((b) => !b.is_paid)
    .reduce((s, b) => s + b.amount, 0);
  const overdueCount = bills.filter((b) => getStatus(b) === "overdue").length;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Bills & Reminders
          </h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            Track recurring bills and due dates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "list" | "calendar")}
            className="hidden sm:block"
          >
            <TabsList className="h-10 bg-muted/50 border border-border/40">
              <TabsTrigger
                value="list"
                className="text-xs px-4 py-1.5 font-medium rounded-md"
              >
                List
              </TabsTrigger>
              <TabsTrigger
                value="calendar"
                className="text-xs px-4 py-1.5 font-medium rounded-md"
              >
                Calendar
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} />{" "}
            <span className="hidden sm:inline">Add Bill</span>
          </Button>
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) => setView(v as "list" | "calendar")}
        className="sm:hidden -mt-2"
      >
        <TabsList className="h-9 w-full bg-muted/50 border border-border/40">
          <TabsTrigger
            value="list"
            className="flex-1 text-xs px-4 py-1 font-medium rounded-md"
          >
            List View
          </TabsTrigger>
          <TabsTrigger
            value="calendar"
            className="flex-1 text-xs px-4 py-1 font-medium rounded-md"
          >
            Calendar
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Unpaid Total",
            value: fmt(unpaidTotal),
            icon: Receipt,
            colorClass:
              "bg-destructive/10 text-destructive border-destructive/20",
          },
          {
            label: "Overdue",
            value: overdueCount,
            icon: AlertTriangle,
            colorClass: "bg-warning/10 text-warning border-warning/20",
          },
          {
            label: "Total Bills",
            value: bills.length,
            icon: Bell,
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

      {/* Filter Tabs */}
      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as typeof filter)}
        className="w-full overflow-x-auto scroolbar-hide"
      >
        <TabsList className="h-10 w-auto flex-nowrap bg-muted/50 border border-border/40 p-1 justify-start">
          {(["all", "unpaid", "overdue", "paid"] as const).map((f) => (
            <TabsTrigger
              key={f}
              value={f}
              className="text-xs font-medium capitalize px-4 py-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {f}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Create Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md sm:max-w-lg glass-card border-border/40 text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">New Bill</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bill Name</Label>
                <Input
                  className="glass-panel"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Rent, Netflix..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input
                  className="glass-panel"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  className="glass-panel"
                  type="date"
                  value={form.due_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, due_date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, frequency: v }))
                  }
                >
                  <SelectTrigger className="glass-panel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    {BILL_FREQUENCIES.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category || NONE}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v === NONE ? "" : v }))
                  }
                >
                  <SelectTrigger className="glass-panel">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    <SelectItem value={NONE}>Select</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Remind Before</Label>
                <Select
                  value={form.reminder_lead_days}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, reminder_lead_days: v }))
                  }
                >
                  <SelectTrigger className="glass-panel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                className="glass-panel"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Notes..."
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-2">
              <label className="flex flex-1 items-center gap-2.5 text-sm text-foreground cursor-pointer font-medium p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={form.is_variable}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_variable: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-muted-foreground bg-transparent"
                />
                Variable amount
              </label>
              <label className="flex flex-1 items-center gap-2.5 text-sm text-foreground cursor-pointer font-medium p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={form.auto_create_expense}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auto_create_expense: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-muted-foreground bg-transparent"
                />
                Auto-create expense
              </label>
            </div>
            <div className="pt-2 border-t border-border/40">
              <Button type="submit" className="w-full gap-2">
                <Plus size={16} /> Add Bill
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Calendar View */}
      {view === "calendar" && (
        <Card className="glass-card border-border/40 shadow-sm animate-scale-in">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 bg-muted/30 border-border/60 hover:bg-muted/60"
                onClick={() => setCalMonth(subMonths(calMonth, 1))}
              >
                <ChevronLeft size={18} />
              </Button>
              <h3 className="text-base font-bold text-foreground tracking-tight">
                {format(calMonth, "MMMM yyyy")}
              </h3>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 bg-muted/30 border-border/60 hover:bg-muted/60"
                onClick={() => setCalMonth(addMonths(calMonth, 1))}
              >
                <ChevronRight size={18} />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="text-center text-xs text-muted-foreground py-2 font-semibold uppercase tracking-wider"
                >
                  {d}
                </div>
              ))}
              {Array.from({ length: startDow }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayBills = billsByDate[dateStr] || [];
                const hasBills = dayBills.length > 0;
                const hasOverdue = dayBills.some(
                  (b) => !b.is_paid && dateStr < today,
                );

                return (
                  <div
                    key={dateStr}
                    className={clsx(
                      "relative p-2 rounded-xl text-center text-xs min-h-[50px] sm:min-h-[64px] border border-transparent transition-all",
                      isToday(day)
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "",
                      !isSameMonth(day, calMonth)
                        ? "opacity-30"
                        : "hover:border-border/60 hover:bg-muted/20",
                      hasBills ? "bg-muted/40" : "",
                    )}
                  >
                    <span
                      className={clsx(
                        "font-medium",
                        isToday(day)
                          ? "text-primary font-bold text-sm"
                          : "text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {hasBills && (
                      <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
                        {dayBills.slice(0, 3).map((b, i) => (
                          <div
                            key={i}
                            className={clsx(
                              "w-2 h-2 rounded-full",
                              b.is_paid
                                ? "bg-success shadow-[0_0_6px_hsl(var(--success)/0.4)]"
                                : hasOverdue
                                  ? "bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.4)]"
                                  : "bg-warning shadow-[0_0_6px_hsl(var(--warning)/0.4)]",
                            )}
                            title={`${b.name}: ${fmt(b.amount)}`}
                          />
                        ))}
                        {dayBills.length > 3 && (
                          <div
                            className="w-2 h-2 rounded-full bg-muted-foreground/50 border border-border flex items-center justify-center text-[8px]"
                            title={`${dayBills.length - 3} more`}
                          >
                            +
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {view === "list" && (
        <Card className="glass-card border-border/40 overflow-hidden shadow-sm animate-scale-in">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-5 py-4 border-b border-border/40"
                  >
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-10 h-10 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32 rounded" />
                        <Skeleton className="h-3 w-48 rounded" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 border border-border/40">
                  <Bell size={28} className="text-muted-foreground/60" />
                </div>
                <p className="text-base font-semibold text-foreground mb-1">
                  No bills found
                </p>
                <p className="text-sm text-muted-foreground">
                  Add a bill to start tracking due dates.
                </p>
              </div>
            ) : (
              <div>
                {filteredBills.map((b) => {
                  const status = getStatus(b);
                  const cfg = statusConfig[status];
                  const StatusIcon = cfg.icon;
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 group border-b border-border/40 last:border-0 transition-colors hover:bg-muted/30 gap-4 sm:gap-0"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <div
                          className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                            cfg.bgClass,
                            cfg.colorClass,
                            cfg.borderClass,
                          )}
                        >
                          <StatusIcon size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm sm:text-base font-semibold text-foreground truncate">
                              {b.name}
                            </p>
                            <span
                              className={clsx(
                                "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border",
                                cfg.bgClass,
                                cfg.colorClass,
                                cfg.borderClass,
                              )}
                            >
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground truncate">
                            {b.category || "Uncategorized"}{" "}
                            <span className="mx-1.5 opacity-50">&bull;</span>{" "}
                            Due {format(parseISO(b.due_date), "MMM d, yyyy")}
                            <span className="hidden sm:inline">
                              {" "}
                              <span className="mx-1.5 opacity-50">
                                &bull;
                              </span>{" "}
                              {BILL_FREQUENCIES.find(
                                (f) => f.value === b.frequency,
                              )?.label || b.frequency}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto pl-14 sm:pl-0">
                        <span
                          className={clsx(
                            "text-base font-bold",
                            status === "paid"
                              ? "text-success"
                              : "text-foreground",
                          )}
                        >
                          {fmt(b.amount)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {!b.is_paid ? (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 bg-success/10 border-success/20 text-success hover:bg-success hover:text-success-foreground"
                              onClick={() => handleMarkPaid(b.id)}
                              title="Mark paid"
                            >
                              <Check size={16} />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 bg-warning/10 border-warning/20 text-warning hover:bg-warning hover:text-warning-foreground"
                              onClick={() => handleMarkUnpaid(b.id)}
                              title="Mark unpaid"
                            >
                              <X size={16} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(b.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
