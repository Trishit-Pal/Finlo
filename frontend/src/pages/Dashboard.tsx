import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Sparkles,
  Check,
  X,
  Plus,
  IndianRupee,
  CreditCard,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Receipt,
} from "lucide-react";
import type { Suggestion, Bill, CoachAction } from "@/types";
import clsx from "clsx";

/** Animated number counter hook */
const useCountUp = (end: number, duration = 800, enabled = true) => {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || end === 0) {
      const id = requestAnimationFrame(() => setValue(end));
      return () => cancelAnimationFrame(id);
    }
    const start = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (end - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration, enabled]);

  return value;
};

type Timeframe = "today" | "week" | "month" | "year";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border/60 rounded-xl px-3 py-2.5 shadow-lg">
        <p className="text-muted-foreground text-xs font-medium mb-1">
          {label}
        </p>
        <p className="text-primary font-bold text-sm">
          ₹{payload[0].value?.toLocaleString("en-IN")}
        </p>
      </div>
    );
  }
  return null;
};

const SkeletonCard = () => (
  <Card className="glass-card border-border/40">
    <CardContent className="p-5 space-y-3">
      <Skeleton className="h-4 w-28 rounded-md" />
      <Skeleton className="h-9 w-40 rounded-md" />
    </CardContent>
  </Card>
);

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("month");
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [dashRes, billsRes] = await Promise.all([
          api.get("/coach/dashboard", { params: { timeframe } }),
          api.get("/bills/upcoming/next7days").catch(() => ({ data: [] })),
        ]);
        setData(dashRes.data);
        setUpcomingBills(billsRes.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [timeframe]);

  const handleSuggestion = async (id: string, action: string) => {
    try {
      await api.post(`/coach/suggestions/${id}/respond`, { action });
      setData((prev: any) => ({
        ...prev,
        coach_suggestions: prev.coach_suggestions.filter(
          (s: Suggestion) => s.id !== id,
        ),
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const totalSpent =
    data?.totals_by_category?.reduce((a: number, c: any) => a + c.total, 0) ||
    0;
  const totalSavings =
    data?.coach_suggestions?.reduce(
      (a: number, c: Suggestion) => a + (c.estimated_savings || 0),
      0,
    ) || 0;
  const activeBudgets = data?.budget_status?.length || 0;

  const animatedSpent = useCountUp(totalSpent, 900, !loading);
  const animatedSavings = useCountUp(totalSavings, 900, !loading);
  const animatedBudgets = useCountUp(activeBudgets, 600, !loading);
  const animatedBills = useCountUp(upcomingBills.length, 600, !loading);
  const topCategories = (data?.totals_by_category || [])
    .sort((a: any, b: any) => b.total - a.total)
    .slice(0, 3);

  const trendUp =
    data?.weekly_trend?.length >= 2
      ? data.weekly_trend[data.weekly_trend.length - 1]?.total >
        data.weekly_trend[data.weekly_trend.length - 2]?.total
      : false;

  const timeframes: { key: Timeframe; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-24 sm:pb-6">
      {/* Header + Timeframe Selector */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm mt-1 text-muted-foreground">
            Your financial overview at a glance
          </p>
        </div>
        <Tabs
          value={timeframe}
          onValueChange={(v) => setTimeframe(v as Timeframe)}
          className="w-full sm:w-auto overflow-x-auto scroolbar-hide"
        >
          <TabsList className="h-10 flex-nowrap sm:flex-wrap justify-start gap-1 p-1 bg-muted/50 border border-border/40">
            {timeframes.map((tf) => (
              <TabsTrigger
                key={tf.key}
                value={tf.key}
                className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {tf.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            {/* Total Spend */}
            <Card className="glass-card border-border/40 animate-stagger-1 hover:border-primary/20 transition-all duration-300 cursor-default group hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 bg-primary/10 border border-primary/20 text-primary">
                    <IndianRupee size={18} />
                  </div>
                  <div
                    className={clsx(
                      "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
                      trendUp
                        ? "bg-destructive/10 text-destructive"
                        : "bg-success/10 text-success",
                    )}
                  >
                    {trendUp ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}
                    vs last period
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
                    Total Spend
                  </p>
                  <p className="text-3xl font-extrabold text-foreground tracking-tight animate-number-pop">
                    {fmt(animatedSpent)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/40 animate-stagger-2 hover:border-success/20 transition-all duration-300 cursor-default group hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 bg-success/10 border border-success/20 text-success">
                    <Target size={18} />
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
                    Active Budgets
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold text-foreground tracking-tight animate-number-pop">
                      {animatedBudgets}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {activeBudgets === 1 ? "category" : "categories"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/40 animate-stagger-3 hover:border-warning/20 transition-all duration-300 cursor-default group hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 bg-warning/10 border border-warning/20 text-warning">
                    <Calendar size={18} />
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
                    Upcoming Bills
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold text-foreground tracking-tight animate-number-pop">
                      {animatedBills}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      due in 7d
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/40 animate-stagger-4 hover:border-primary/30 transition-all duration-300 cursor-default relative overflow-hidden group shadow-sm">
              <div className="absolute top-[-30%] right-[-20%] w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary/20 transition-colors duration-500" />
              <CardContent className="p-5 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 bg-primary/15 border border-primary/25 text-primary">
                    <Sparkles size={18} />
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-xs font-bold tracking-wider text-primary uppercase mb-1 drop-shadow-sm">
                    Potential Savings
                  </p>
                  <p className="text-3xl font-extrabold text-foreground tracking-tight animate-number-pop">
                    {fmt(animatedSavings)}
                  </p>
                  <p className="text-xs font-medium mt-1 text-primary/80">
                    from {data?.coach_suggestions?.length || 0} AI insights
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Spend Trend Sparkline */}
          <Card className="glass-card border-border/40 shadow-sm animate-scale-in hover:border-border/80 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <TrendingUp size={16} />
                  </div>
                  Spending Trend
                </CardTitle>
                {data?.weekly_trend?.length > 0 && (
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground border border-border/50">
                    {data.weekly_trend.length} weeks
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[220px] w-full rounded-xl" />
              ) : (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data?.weekly_trend || []}
                      margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
                    >
                      <defs>
                        <linearGradient
                          id="spendGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="100%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="week"
                        stroke="transparent"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis
                        stroke="transparent"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                        tickFormatter={(val) => `₹${val}`}
                      />
                      <Tooltip
                        content={<CustomTooltip />}
                        cursor={{
                          stroke: "hsl(var(--muted-foreground)/0.2)",
                          strokeWidth: 1,
                          strokeDasharray: "4 4",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        fill="url(#spendGradient)"
                        dot={{
                          fill: "hsl(var(--background))",
                          stroke: "hsl(var(--primary))",
                          strokeWidth: 2,
                          r: 4,
                        }}
                        activeDot={{
                          r: 6,
                          fill: "hsl(var(--primary))",
                          strokeWidth: 0,
                          className: "animate-pulse",
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-border/40 shadow-sm hover:border-border/80 transition-colors">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Target size={16} />
                </div>
                Budget Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-5">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {data?.budget_status?.map(
                    (b: {
                      budget_id: string;
                      category: string;
                      spent: number;
                      limit: number;
                      percent: number;
                      alert: string;
                    }) => {
                      const pct = Math.min(b.percent, 100);
                      const isHard = b.alert === "hard";
                      const isSoft = b.alert === "soft";
                      const colorClass = isHard
                        ? "bg-destructive shadow-[0_0_10px_hsl(var(--destructive)/0.3)]"
                        : isSoft
                          ? "bg-warning shadow-[0_0_10px_hsl(var(--warning)/0.3)]"
                          : "bg-success shadow-[0_0_10px_hsl(var(--success)/0.3)]";

                      return (
                        <div key={b.budget_id} className="group cursor-default">
                          <div className="flex items-center justify-between text-sm mb-2.5">
                            <span className="font-semibold text-foreground">
                              {b.category}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                {fmt(b.spent)}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                / {fmt(b.limit)}
                              </span>
                            </div>
                          </div>
                          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary/60">
                            <div
                              className={clsx(
                                "h-full rounded-full transition-all duration-1000 ease-out",
                                colorClass,
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                  {(!data?.budget_status ||
                    data.budget_status.length === 0) && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 border border-border/40">
                        <Target
                          size={28}
                          className="text-muted-foreground/60"
                        />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        No active budgets
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Set up budgets to track your spending limits.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 col) */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="glass-card border-border/40 shadow-sm hover:border-border/80 transition-colors">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <CreditCard size={16} />
                </div>
                Top Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-5">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-8 w-full rounded-md" />
                  ))}
                </div>
              ) : topCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No spending data available
                </p>
              ) : (
                <div className="space-y-5">
                  {topCategories.map(
                    (cat: { category?: string; total: number }, i: number) => {
                      const pct =
                        totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
                      const barColors = [
                        "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]",
                        "bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.4)]",
                        "bg-info shadow-[0_0_8px_hsl(var(--info)/0.4)]",
                      ];
                      const textColors = [
                        "text-primary",
                        "text-warning",
                        "text-info",
                      ];
                      return (
                        <div
                          key={cat.category || i}
                          className="group cursor-default"
                        >
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="font-semibold text-foreground flex items-center gap-2">
                              <span
                                className={clsx(
                                  "w-2 h-2 rounded-full",
                                  barColors[i] || "bg-muted-foreground",
                                )}
                              />
                              {cat.category || "Uncategorized"}
                            </span>
                            <div className="text-right">
                              <p className="font-bold">{fmt(cat.total)}</p>
                              <p
                                className={clsx(
                                  "text-[10px] font-bold tracking-wider uppercase",
                                  textColors[i] || "text-muted-foreground",
                                )}
                              >
                                {pct.toFixed(0)}%
                              </p>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                            <div
                              className={clsx(
                                "h-full rounded-full transition-all duration-1000",
                                barColors[i] || "bg-muted-foreground",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Bills */}
          <Card className="glass-card border-border/40 shadow-sm hover:border-warning/20 transition-colors">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-warning/10 text-warning">
                  <Receipt size={16} />
                </div>
                Upcoming Bills
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingBills.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-border/60 rounded-xl bg-muted/10">
                  <p className="text-sm text-muted-foreground font-medium">
                    No bills due in next 7 days
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingBills.slice(0, 5).map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-background hover:bg-muted/30 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-0.5">
                          {b.name}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <Calendar size={12} className="opacity-70" />{" "}
                          {b.due_date}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-destructive px-2 py-1 bg-destructive/10 rounded-md border border-destructive/20">
                        {fmt(b.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Coach Insights */}
          <div>
            <div className="flex items-center gap-2 mb-4 px-1">
              <Sparkles size={18} className="text-primary" />
              <h3 className="text-sm font-bold text-foreground">AI Insights</h3>
            </div>
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i} className="glass-card border-border/40">
                    <CardContent className="p-5 space-y-4">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-8 w-full rounded-md mt-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {data?.coach_suggestions?.map((s: Suggestion) => (
                  <Card
                    key={s.id}
                    className="glass-card border-border/50 relative overflow-hidden animate-slide-up shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-indigo-400" />
                    <CardContent className="p-5 pl-6">
                      <p className="text-sm font-medium leading-relaxed mb-4 text-foreground/90">
                        {s.summary}
                      </p>
                      {s.actions && s.actions.length > 0 && (
                        <div className="space-y-2.5 mb-4">
                          {s.actions.map((action: CoachAction, i: number) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg text-xs border border-border/60 bg-muted/30"
                            >
                              <p className="font-semibold text-foreground mb-1">
                                {action.text}
                              </p>
                              {action.weekly_savings ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-success/15 text-success font-bold text-[10px] uppercase tracking-wider">
                                  <TrendingUp size={10} /> Save{" "}
                                  {fmt(action.weekly_savings)}/wk
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 gap-1.5 font-semibold"
                          onClick={() => handleSuggestion(s.id, "accepted")}
                        >
                          <Check size={14} /> Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5 font-semibold hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                          onClick={() => handleSuggestion(s.id, "rejected")}
                        >
                          <X size={14} /> Dismiss
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!data?.coach_suggestions ||
                  data.coach_suggestions.length === 0) && (
                  <Card className="glass-card border-border/40 border-dashed bg-transparent shadow-none">
                    <CardContent className="p-8 text-center">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                        <Sparkles
                          size={20}
                          className="text-primary opacity-80"
                        />
                      </div>
                      <p className="text-sm font-semibold text-foreground mb-1">
                        No pending insights
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Upload receipts for personalized AI coaching advice.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <Button
        type="button"
        size="icon"
        onClick={() => navigate("/transactions")}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-30 h-14 w-14 rounded-2xl shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 animate-scale-in border border-primary/40 bg-primary text-primary-foreground focus:ring-4 focus:ring-primary/20"
        title="Add transaction"
      >
        <Plus size={28} />
      </Button>
    </div>
  );
};
