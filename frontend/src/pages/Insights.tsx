import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import {
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  IndianRupee,
  Percent,
} from "lucide-react";
import type { Insight, TrendData, InsightSeverity } from "@/types";
import clsx from "clsx";

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  {
    icon: React.ReactNode;
    bg: string;
    border: string;
    text: string;
    badge: string;
  }
> = {
  info: {
    icon: <Lightbulb className="w-4 h-4" />,
    bg: "bg-blue-500/8",
    border: "border-blue-500/20",
    text: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-400",
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    bg: "bg-amber-500/8",
    border: "border-amber-500/20",
    text: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-400",
  },
  critical: {
    icon: <AlertCircle className="w-4 h-4" />,
    bg: "bg-red-500/8",
    border: "border-red-500/20",
    text: "text-red-400",
    badge: "bg-red-500/15 text-red-400",
  },
  positive: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400",
  },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p
          key={p.name}
          style={{ color: p.color }}
          className="flex justify-between gap-4"
        >
          <span>{p.name}:</span>
          <span className="font-semibold">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

export const Insights: React.FC = () => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [insRes, trendRes] = await Promise.all([
        api.get("/insights"),
        api.get("/insights/trends?months=6"),
      ]);
      setInsights(insRes.data);
      setTrends(trendRes.data);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.get("/insights?refresh=true");
      setInsights(res.data);
    } catch {
      /* empty */
    }
    setRefreshing(false);
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.post(`/insights/${id}/dismiss`);
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch {
      /* empty */
    }
  };

  const criticalCount = insights.filter(
    (i) => i.severity === "critical",
  ).length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in pb-10">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
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
          <h1 className="text-2xl font-bold text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Data-driven analysis of your spending patterns
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          size="sm"
          variant="outline"
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{" "}
          Refresh
        </Button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card border-border/40">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Lightbulb className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Insights</p>
              <p className="text-lg font-bold text-foreground">
                {insights.length}
              </p>
            </div>
          </CardContent>
        </Card>
        {trends && (
          <>
            <Card className="glass-card border-border/40">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <IndianRupee className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Avg Daily Spend
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {fmt(trends.avg_daily_spend)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-border/40">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div
                  className={clsx(
                    "p-2 rounded-lg",
                    (trends.savings_rate ?? 0) >= 20
                      ? "bg-emerald-500/10"
                      : "bg-amber-500/10",
                  )}
                >
                  <Percent
                    className={clsx(
                      "w-4 h-4",
                      (trends.savings_rate ?? 0) >= 20
                        ? "text-emerald-400"
                        : "text-amber-400",
                    )}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Savings Rate</p>
                  <p className="text-lg font-bold text-foreground">
                    {trends.savings_rate != null
                      ? `${trends.savings_rate}%`
                      : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        <Card className="glass-card border-border/40">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Alerts</p>
              <p className="text-lg font-bold text-foreground">
                {criticalCount + warningCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income vs Expense Trend Chart */}
      {trends && trends.months.length > 1 && (
        <Card className="glass-card border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Income vs Expense Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trends.months}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="expenseGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border) / 0.3)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke="#34d399"
                    fill="url(#incomeGrad)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    name="Expense"
                    stroke="#f87171"
                    fill="url(#expenseGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insight Cards */}
      {insights.length === 0 ? (
        <Card className="glass-card border-border/40">
          <CardContent className="p-12 flex flex-col items-center text-center gap-3">
            <div className="p-4 rounded-2xl bg-muted/30">
              <Lightbulb className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">No insights yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Add more transactions and click Refresh to generate spending
              insights.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Sort: critical first, then warning, info, positive */}
          {[...insights]
            .sort((a, b) => {
              const order: Record<string, number> = {
                critical: 0,
                warning: 1,
                info: 2,
                positive: 3,
              };
              return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
            })
            .map((insight) => {
              const cfg =
                SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
              return (
                <Card
                  key={insight.id}
                  className={clsx(
                    "border transition-all duration-200 hover:shadow-md",
                    cfg.bg,
                    cfg.border,
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={clsx("p-2 rounded-lg mt-0.5", cfg.badge)}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span
                                className={clsx(
                                  "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                                  cfg.badge,
                                )}
                              >
                                {insight.severity}
                              </span>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {insight.type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <h3 className="font-semibold text-sm text-foreground">
                              {insight.title}
                            </h3>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => handleDismiss(insight.id)}
                          >
                            <X size={14} />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {insight.explanation}
                        </p>
                        {insight.recommendation && (
                          <p
                            className={clsx(
                              "text-xs mt-2 font-medium",
                              cfg.text,
                            )}
                          >
                            {insight.recommendation}
                          </p>
                        )}
                      </div>
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
