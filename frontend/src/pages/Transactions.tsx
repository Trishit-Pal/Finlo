import React, { useEffect, useState, useRef } from "react";
import { api } from "@/services/api";
import { useToast } from "@/components/Toast";
import { PAYMENT_MODES } from "@/types";
import {
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Search,
  Filter,
  Repeat,
  Edit3,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  Activity,
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
import { cn } from "@/lib/utils";
import clsx from "clsx";

const ALL = "__all__";
const NONE = "__none__";

const DEFAULT_CATEGORIES = [
  { name: "Food & Dining", icon: "🍔", color: "#f97316" },
  { name: "Transport", icon: "🚗", color: "#3b82f6" },
  { name: "Groceries", icon: "🛒", color: "#f59e0b" },
  { name: "Shopping", icon: "🛍️", color: "#ec4899" },
  { name: "Health", icon: "🏥", color: "#ef4444" },
  { name: "Utilities", icon: "💡", color: "#eab308" },
  { name: "Entertainment", icon: "🎮", color: "#8b5cf6" },
  { name: "Education", icon: "📚", color: "#06b6d4" },
  { name: "Travel", icon: "✈️", color: "#14b8a6" },
  { name: "EMI/Loan", icon: "🏦", color: "#2dd4bf" },
  { name: "Rent", icon: "🏠", color: "#a855f7" },
  { name: "Savings", icon: "🐷", color: "#22c55e" },
  { name: "Miscellaneous", icon: "📌", color: "#6b7280" },
  { name: "Salary", icon: "💰", color: "#22c55e" },
  { name: "Freelance", icon: "💻", color: "#14b8a6" },
];

export const Transactions: React.FC = () => {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [importConsentGranted, setImportConsentGranted] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    merchant: "",
    category: "",
    date: format(new Date(), "yyyy-MM-dd"),
    payment_mode: "",
    tags: "",
    is_recurring: false,
    recurrence_frequency: "",
  });

  const fetchTransactions = async () => {
    try {
      const res = await api.get("/transactions");
      setTransactions(res.data?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const loadStatementConsent = async () => {
    setConsentLoading(true);
    try {
      const res = await api.get("/integrations/consents");
      const hasConsent = (res.data || []).some(
        (c: { consent_type?: string; status?: string }) =>
          c.consent_type === "statement_import" && c.status === "granted",
      );
      setImportConsentGranted(hasConsent);
    } catch (e) {
      console.error(e);
    } finally {
      setConsentLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get("/transactions/export", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "finlo-transactions.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const openImportModal = async () => {
    setShowImportModal(true);
    setImportFile(null);
    setImportResult(null);
    await loadStatementConsent();
  };

  const grantImportConsent = async () => {
    try {
      await api.post("/integrations/consents", {
        consent_type: "statement_import",
        scope: "transactions",
        status: "granted",
        metadata: { source: "transactions_import" },
      });
      setImportConsentGranted(true);
      toast("success", "Statement import consent granted");
    } catch {
      toast("error", "Failed to grant consent");
    }
  };

  const handleImportCsv = async () => {
    if (!importFile) return;
    if (!importConsentGranted) {
      toast("error", "Grant statement import consent first");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await api.post("/transactions/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      toast("success", `Imported ${res.data.imported} rows`);
      await fetchTransactions();
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { detail?: string; message?: string } };
      };
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Import failed";
      toast("error", message);
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [String(message)],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = form.tags
      ? form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const payload = {
      merchant: form.merchant,
      amount: parseFloat(form.amount),
      category: form.category || null,
      date: form.date,
      payment_mode: form.payment_mode || null,
      tags,
      is_recurring: form.is_recurring,
      recurrence_frequency: form.is_recurring
        ? form.recurrence_frequency || "monthly"
        : null,
      notes: form.type === "income" ? "income" : undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/transactions/${editingId}`, payload);
        toast("success", "Transaction updated");
      } else {
        await api.post("/transactions", payload);
        toast("success", "Transaction added");
      }
    } catch {
      toast("error", "Failed to save transaction");
      return;
    }
    setShowModal(false);
    setEditingId(null);
    setForm({
      type: "expense",
      amount: "",
      merchant: "",
      category: "",
      date: format(new Date(), "yyyy-MM-dd"),
      payment_mode: "",
      tags: "",
      is_recurring: false,
      recurrence_frequency: "",
    });
    fetchTransactions();
  };

  const handleEdit = (t: Record<string, unknown>) => {
    setEditingId(String(t.id));
    setForm({
      type: t.notes === "income" ? "income" : "expense",
      amount: String(t.amount),
      merchant: (t.merchant as string) || "",
      category: (t.category as string) || "",
      date: t.date as string,
      payment_mode: (t.payment_mode as string) || "",
      tags: ((t.tags as string[]) || []).join(", "),
      is_recurring: t.is_recurring === true,
      recurrence_frequency: (t.recurrence_frequency as string) || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const deletedItem = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));

    toast("undo", "Transaction deleted", {
      onUndo: () => {
        if (deletedItem) {
          setTransactions((prev) =>
            [...prev, deletedItem].sort((a, b) =>
              String(b.date).localeCompare(String(a.date)),
            ),
          );
        }
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      },
      duration: 5000,
    });

    undoTimerRef.current = setTimeout(async () => {
      try {
        await api.delete(`/transactions/${id}`);
      } catch {
        if (deletedItem) setTransactions((prev) => [...prev, deletedItem]);
        toast("error", "Failed to delete transaction");
      }
    }, 5000);
  };

  const filtered = transactions.filter((t) => {
    if (
      searchQuery &&
      !String(t.merchant || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) &&
      !String(t.category || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
      return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPayment && t.payment_mode !== filterPayment) return false;
    return true;
  });

  const income = filtered
    .filter((t) => t.notes === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = filtered
    .filter((t) => t.notes !== "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = income - expenses;
  const isPositiveBalance = balance >= 0;

  const fmt = (n: number) =>
    `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const closeModal = (open: boolean) => {
    setShowModal(open);
    if (!open) setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            Track your income and expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openImportModal}
            className="gap-2 hidden sm:flex"
          >
            <FileSpreadsheet size={15} /> Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2"
          >
            <Download size={15} /> Export
          </Button>
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="gap-2"
          >
            <Plus size={16} />{" "}
            <span className="hidden sm:inline">Add Transaction</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Income",
            value: income,
            icon: ArrowUpRight,
            colorClass: "bg-success/10 text-success border-success/20",
          },
          {
            label: "Expenses",
            value: expenses,
            icon: ArrowDownRight,
            colorClass:
              "bg-destructive/10 text-destructive border-destructive/20",
          },
          {
            label: "Net Balance",
            value: balance,
            colorClass: isPositiveBalance
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-destructive/10 text-destructive border-destructive/20",
            icon: isPositiveBalance ? ArrowUpRight : ArrowDownRight,
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
                  {loading ? "—" : fmt(value)}
                </p>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
                  {label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full min-w-0">
          <Search
            size={16}
            className="absolute left-3 top-3 text-muted-foreground pointer-events-none z-10"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search merchants, categories..."
            className="pl-10 h-10 glass-panel w-full"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "gap-2 flex-shrink-0 h-10 flex-1 sm:flex-none glass-panel",
              showFilters && "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <Filter size={16} />{" "}
            <span className="hidden sm:inline">Filters</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openImportModal}
            className="gap-2 h-10 flex-1 sm:hidden glass-panel"
          >
            <FileSpreadsheet size={16} /> Import
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-3 animate-fade-in p-3 rounded-xl border border-border/40 bg-muted/20">
          <Select
            value={filterCategory || ALL}
            onValueChange={(v) => setFilterCategory(v === ALL ? "" : v)}
          >
            <SelectTrigger className="flex-1 glass-panel">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="glass-panel">
              <SelectItem value={ALL}>All Categories</SelectItem>
              {DEFAULT_CATEGORIES.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterPayment || ALL}
            onValueChange={(v) => setFilterPayment(v === ALL ? "" : v)}
          >
            <SelectTrigger className="flex-1 glass-panel">
              <SelectValue placeholder="All payment modes" />
            </SelectTrigger>
            <SelectContent className="glass-panel">
              <SelectItem value={ALL}>All Payment Modes</SelectItem>
              {PAYMENT_MODES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Dialog open={showModal} onOpenChange={closeModal}>
        <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto glass-card border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingId ? "Edit Transaction" : "New Transaction"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="glass-panel focus:ring-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-amount">Amount (₹)</Label>
                <Input
                  id="tx-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="glass-panel text-lg font-semibold"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-merchant">Merchant / Description</Label>
              <Input
                id="tx-merchant"
                className="glass-panel"
                value={form.merchant}
                onChange={(e) =>
                  setForm((f) => ({ ...f, merchant: e.target.value }))
                }
                placeholder="Restaurant, Store, Salary etc."
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <SelectContent className="glass-panel max-h-60">
                    <SelectItem value={NONE}>Select</SelectItem>
                    {DEFAULT_CATEGORIES.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        <div className="flex items-center gap-2">
                          <span>{c.icon}</span> <span>{c.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-date">Date</Label>
                <Input
                  className="glass-panel"
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select
                  value={form.payment_mode || NONE}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      payment_mode: v === NONE ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="glass-panel">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    <SelectItem value={NONE}>Select</SelectItem>
                    {PAYMENT_MODES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-tags">Tags (comma-separated)</Label>
                <Input
                  id="tx-tags"
                  className="glass-panel"
                  value={form.tags}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  placeholder="food, weekend, vacation"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
              <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer font-medium p-3 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors w-full sm:w-auto">
                <input
                  type="checkbox"
                  checked={form.is_recurring}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_recurring: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-muted-foreground bg-transparent"
                />
                <Repeat size={16} className="opacity-70" /> Recurring
              </label>
              {form.is_recurring && (
                <Select
                  value={form.recurrence_frequency || "monthly"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, recurrence_frequency: v }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-40 glass-panel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel">
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="pt-4 border-t border-border/40">
              <Button type="submit" className="w-full h-11 text-base gap-2">
                {editingId ? (
                  <>
                    <Edit3 size={16} /> Save Changes
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Add Transaction
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto glass-card border-border/40 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Import Statement (CSV)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground flex gap-3 items-start">
              <Activity
                className="shrink-0 mt-0.5 text-primary opacity-80"
                size={18}
              />
              <p>
                Consent is mandatory for statement imports. Finlo stores
                transaction details only and does not store nor process CVV/full
                card details.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      importConsentGranted
                        ? "bg-success/20 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {importConsentGranted ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <FileSpreadsheet size={16} />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-foreground d-block">
                      Statement Import Consent
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {importConsentGranted
                        ? "Consent active"
                        : "Required to proceed"}
                    </p>
                  </div>
                </div>
                <Button
                  variant={importConsentGranted ? "outline" : "default"}
                  size="sm"
                  onClick={grantImportConsent}
                  disabled={importConsentGranted || consentLoading}
                  className={clsx(
                    importConsentGranted &&
                      "text-success border-success/30 bg-success/5 pointer-events-none",
                  )}
                >
                  {importConsentGranted
                    ? "Granted"
                    : consentLoading
                      ? "Checking..."
                      : "Grant Access"}
                </Button>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Choose CSV file</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="glass-panel file:text-primary file:font-medium file:bg-transparent file:border-0 cursor-pointer h-12 pt-2.5"
                  />
                </div>
              </div>
              <Button
                onClick={handleImportCsv}
                disabled={!importFile || importing || !importConsentGranted}
                className="w-full h-11 gap-2"
              >
                <UploadCloud size={16} />
                {importing
                  ? "Importing Statements..."
                  : "Confirm & Import Transactions"}
              </Button>
            </div>

            {importResult && (
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm space-y-2 animate-scale-in">
                <p className="text-emerald-500 font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} /> Import Complete
                </p>
                <div className="grid grid-cols-2 gap-4 mt-2 mb-1">
                  <div className="bg-background/50 rounded-lg p-2 border border-border/40">
                    <p className="text-xs text-muted-foreground mb-0.5 text-center">
                      Imported
                    </p>
                    <p className="text-xl font-bold text-foreground text-center">
                      {importResult.imported}
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2 border border-border/40">
                    <p className="text-xs text-muted-foreground mb-0.5 text-center">
                      Skipped
                    </p>
                    <p className="text-xl font-bold text-foreground text-center">
                      {importResult.skipped}
                    </p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="pt-3 border-t border-border/40 mt-3">
                    <p className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1.5">
                      <Activity size={12} /> Errors encountered
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      {importResult.errors.slice(0, 5).map((errorText) => (
                        <li
                          key={errorText}
                          className="text-xs text-muted-foreground"
                        >
                          {errorText}
                        </li>
                      ))}
                    </ul>
                    {importResult.errors.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        + {importResult.errors.length - 5} more errors
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="glass-card border-border/40 overflow-hidden shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 7 }).map((_, i) => (
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
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 border border-border/40">
                <Activity size={28} className="text-muted-foreground/60" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">
                No transactions found.
              </p>
              <p className="text-sm text-muted-foreground">
                Start by adding your first transaction above.
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((t) => {
                const isIncome = t.notes === "income";
                return (
                  <div
                    key={String(t.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 transition-colors hover:bg-muted/30 group border-b border-border/40 last:border-0 gap-4 sm:gap-0"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-shrink-0 items-center justify-center bg-muted/40 border border-border/40 text-xl sm:text-2xl shadow-sm">
                        {DEFAULT_CATEGORIES.find((c) => c.name === t.category)
                          ?.icon || "📌"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm sm:text-base font-semibold text-foreground truncate">
                            {String(t.merchant || "Untitled")}
                          </p>
                          {t.is_recurring === true ? (
                            <div title="Recurring">
                              <Repeat
                                size={14}
                                className="text-primary flex-shrink-0 ml-1"
                              />
                            </div>
                          ) : null}
                          {t.payment_mode ? (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border bg-background border-border/60 text-muted-foreground hidden sm:inline ml-1 shadow-sm">
                              {PAYMENT_MODES.find(
                                (p) => p.value === t.payment_mode,
                              )?.label || String(t.payment_mode)}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs font-medium text-muted-foreground truncate">
                          {String(t.category || "Uncategorized")}{" "}
                          <span className="mx-1.5 opacity-50">&bull;</span>{" "}
                          {format(new Date(String(t.date)), "MMM d, yyyy")}
                          {Array.isArray(t.tags) &&
                            (t.tags as string[]).length > 0 && (
                              <span className="hidden sm:inline">
                                {" "}
                                <span className="mx-1.5 opacity-50">
                                  &bull;
                                </span>{" "}
                                {(t.tags as string[]).join(", ")}
                              </span>
                            )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto pl-14 sm:pl-0">
                      <span
                        className={clsx(
                          "text-base font-bold",
                          isIncome ? "text-success" : "text-foreground",
                        )}
                      >
                        {isIncome ? "+" : "-"}
                        {fmt(Number(t.amount))}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => handleEdit(t)}
                        >
                          <Edit3 size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(String(t.id))}
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
    </div>
  );
};
