import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { Receipt } from "@/types";
import {
  Receipt as ReceiptIcon,
  Search,
  Clock,
  CheckCircle,
  ChevronRight,
  Link2,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import clsx from "clsx";

const STATUS_BADGE: Record<string, React.ReactElement> = {
  confirmed: (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">
      Confirmed
    </span>
  ),
  pending: (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning border border-warning/20">
      Pending
    </span>
  ),
  reviewed: (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
      Reviewed
    </span>
  ),
};

export const Receipts: React.FC = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed">("all");

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get("/receipts");
        setReceipts(res.data?.items || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const filtered = receipts.filter((r) => {
    const matchSearch =
      !search ||
      r.merchant?.toLowerCase().includes(search.toLowerCase()) ||
      r.date?.includes(search);
    const matchFilter = filter === "all" || r.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receipts</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            All your uploaded and processed receipts
          </p>
        </div>
        <Button size="sm" className="gap-2" asChild>
          <Link to="/upload">
            <Plus size={16} />{" "}
            <span className="hidden sm:inline">Upload Receipt</span>
            <span className="sm:hidden">Upload</span>
          </Link>
        </Button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Total Receipts",
            value: receipts.length,
            icon: ReceiptIcon,
            colorClass: "bg-primary/10 text-primary border-primary/20",
          },
          {
            label: "Pending Review",
            value: receipts.filter((r) => r.status === "pending").length,
            icon: Clock,
            colorClass: "bg-warning/10 text-warning border-warning/20",
          },
          {
            label: "Confirmed",
            value: receipts.filter((r) => r.status === "confirmed").length,
            icon: CheckCircle,
            colorClass: "bg-success/10 text-success border-success/20",
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

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full min-w-0">
          <Search
            size={16}
            className="absolute left-3 top-3 text-muted-foreground pointer-events-none z-10"
          />
          <Input
            type="text"
            placeholder="Search by merchant or date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 glass-panel w-full"
          />
        </div>
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as typeof filter)}
          className="w-full sm:w-auto overflow-x-auto scrollbar-hide"
        >
          <TabsList className="h-10 w-full flex-nowrap bg-muted/50 border border-border/40 p-1 justify-start">
            {(["all", "pending", "confirmed"] as const).map((f) => (
              <TabsTrigger
                key={f}
                value={f}
                className="flex-1 sm:flex-none text-xs font-medium capitalize px-4 py-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      <Card className="glass-card border-border/40 overflow-hidden shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-5 py-4 border-b border-border/40 last:border-0"
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
                <ReceiptIcon size={28} className="text-muted-foreground/60" />
              </div>
              <p className="text-base font-semibold text-foreground mb-1">
                {search || filter !== "all"
                  ? "No receipts match your filters."
                  : "No receipts yet."}
              </p>
              {!search && filter === "all" && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload your first receipt to automatically extract data.
                  </p>
                  <Button size="sm" className="gap-2" asChild>
                    <Link to="/upload">
                      <Plus size={16} /> Upload Receipt
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  to={`/review/${r.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 transition-colors hover:bg-muted/30 group border-b border-border/40 last:border-0 gap-4 sm:gap-0"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-shrink-0 items-center justify-center bg-primary/10 text-primary border border-primary/20 shadow-sm">
                      <ReceiptIcon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm sm:text-base text-foreground truncate flex items-center gap-2 mb-0.5">
                        {r.merchant || "Unknown Merchant"}
                        {r.duplicate_of_receipt_id && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/20 flex flex-shrink-0 items-center gap-1 shadow-sm">
                            <Link2 size={10} /> Dup
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground truncate">
                        {r.date || "No date"}
                        <span className="mx-1.5 opacity-50">&bull;</span>{" "}
                        {r.category_suggestion || "Uncategorized"}
                        {r.parser_provider && (
                          <>
                            <span className="hidden sm:inline">
                              <span className="mx-1.5 opacity-50">&bull;</span>
                              Parsed by {r.parser_provider}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto pl-14 sm:pl-0">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-foreground">
                        {r.total != null
                          ? `${r.currency || "₹"} ${r.total.toFixed(2)}`
                          : "—"}
                      </span>
                      <div className="hidden sm:block">
                        {STATUS_BADGE[r.status] || (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border/60 capitalize">
                            {r.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={18}
                      className="text-muted-foreground group-hover:text-primary transition-colors"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
