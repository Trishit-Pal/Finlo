import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  BarChart3,
  TrendingUp,
  Download,
  FileText,
  IndianRupee,
  ArrowUpRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import clsx from "clsx";

const COLORS = [
  "#2dd4bf",
  "#f59e0b",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#6b7280",
];

type TooltipPayload = { name?: string; value?: number; color?: string };

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) => {
  if (!active || !payload) return null;
  return (
    <div
      className="glass-card shadow-lg border border-border/40 rounded-xl"
      style={{
        padding: "10px 14px",
      }}
    >
      <p className="text-muted-foreground text-xs font-semibold mb-1 uppercase tracking-wider">
        {label}
      </p>
      {payload.map((p) => (
        <p
          key={p.name}
          style={{ color: p.color || "#5eead4" }}
          className="text-sm font-bold"
        >
          {p.name}: ₹{Number(p.value).toLocaleString("en-IN")}
        </p>
      ))}
    </div>
  );
};

type Tab = "summary" | "categories" | "trends";

type MonthlyRow = { month: string; income?: number; expenses?: number };
type CategoryRow = { name: string; value: number; prev_value?: number | null };

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

export const Analytics: React.FC = () => {
  const [categoryData, setCategoryData] = useState<CategoryRow[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get("/analytics");
        if (res.data) {
          setCategoryData(res.data.category_breakdown || []);
          setMonthlyData(res.data.monthly_trend || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const handleExport = async (type: "csv" | "pdf") => {
    try {
      const res = await api.get(`/transactions/export?format=${type}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `finlo-report.${type}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const totalExpenses = monthlyData.reduce((s, m) => s + (m.expenses || 0), 0);
  const totalIncome = monthlyData.reduce((s, m) => s + (m.income || 0), 0);
  const monthCount = monthlyData.length || 1;
  const avgDaily = totalExpenses / (monthCount * 30);
  const highestMonth = monthlyData.reduce(
    (max, m) => ((m.expenses || 0) > (max.expenses || 0) ? m : max),
    { month: "", expenses: 0 } as MonthlyRow,
  );
  const savingsRate =
    totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  const categoryWithChange = categoryData.map((c) => ({
    ...c,
    change: c.prev_value
      ? ((c.value - c.prev_value) / c.prev_value) * 100
      : null,
  }));

  const avgMonthly = totalExpenses / monthCount;
  const anomalies = monthlyData.filter(
    (m) => (m.expenses || 0) > avgMonthly * 1.5,
  );

  const savingsData = monthlyData.map((m) => ({
    ...m,
    savings: (m.income || 0) - (m.expenses || 0),
  }));

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Reports & Analytics
          </h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            Visual breakdown of your spending patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            className="gap-2 text-xs"
          >
            <Download size={14} />{" "}
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("pdf")}
            className="gap-2 text-xs"
          >
            <FileText size={14} />{" "}
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="w-full"
      >
        <TabsList className="h-10 w-full sm:w-auto flex-nowrap bg-muted/50 border border-border/40 p-1 overflow-x-auto scrollbar-hide">
          <TabsTrigger
            value="summary"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Summary
          </TabsTrigger>
          <TabsTrigger
            value="categories"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Categories
          </TabsTrigger>
          <TabsTrigger
            value="trends"
            className="flex-1 sm:flex-none text-xs font-medium px-4 py-1.5 rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            Trends
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid lg:grid-cols-2 gap-6">
          {[1, 2, 3].map((i) => (
            <Card
              key={i}
              className={`glass-card border-border/40 ${i === 3 ? "lg:col-span-2" : ""}`}
            >
              <CardContent className="p-6">
                <Skeleton className="h-4 w-40 mb-4" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : monthlyData.length === 0 && categoryData.length === 0 ? (
        <Card className="glass-card border-border/40 border-dashed bg-transparent shadow-none">
          <CardContent className="p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4 border border-border/40">
              <BarChart3 size={32} className="text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">
              No analytics data available yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Add transactions to start seeing your spending breakdown here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="animate-scale-in">
          {tab === "summary" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: "Total Spend",
                    value: fmt(totalExpenses),
                    icon: IndianRupee,
                    colorClass:
                      "text-destructive bg-destructive/10 border-destructive/20",
                  },
                  {
                    label: "Avg Daily",
                    value: fmt(Math.round(avgDaily)),
                    icon: TrendingUp,
                    colorClass: "text-warning bg-warning/10 border-warning/20",
                  },
                  {
                    label: "Highest Month",
                    value: fmt(highestMonth.expenses || 0),
                    icon: ArrowUpRight,
                    colorClass: "text-primary bg-primary/10 border-primary/20",
                    sub: highestMonth.month,
                  },
                  {
                    label: "Savings Rate",
                    value: `${savingsRate.toFixed(1)}%`,
                    icon: Sparkles,
                    colorClass:
                      savingsRate > 20
                        ? "text-success bg-success/10 border-success/20"
                        : "text-warning bg-warning/10 border-warning/20",
                  },
                ].map(({ label, value, icon: Icon, colorClass, sub }) => (
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
                          {value}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {label}
                          </span>
                          {sub && (
                            <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded border bg-muted/40 text-foreground border-border/60">
                              {sub}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="glass-card border-border/40 shadow-sm">
                <CardHeader className="pb-4 pt-6 px-6">
                  <CardTitle className="text-base font-bold tracking-tight">
                    Income vs Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6 pb-6">
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border) / 0.5)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => `₹${val / 1000}k`}
                          dx={-10}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ fill: "hsl(var(--muted)/0.2)" }}
                        />
                        <Legend
                          wrapperStyle={{
                            paddingTop: "20px",
                            fontSize: "13px",
                            fontWeight: 500,
                          }}
                          iconType="circle"
                        />
                        <Bar
                          dataKey="income"
                          fill="hsl(var(--success))"
                          radius={[4, 4, 0, 0]}
                          name="Income"
                          maxBarSize={40}
                        />
                        <Bar
                          dataKey="expenses"
                          fill="hsl(var(--destructive))"
                          radius={[4, 4, 0, 0]}
                          name="Expenses"
                          maxBarSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {anomalies.length > 0 && (
                <Card className="glass-card border-border/40 shadow-sm">
                  <CardHeader className="pb-3 pt-5 px-6">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-warning/10 text-warning border border-warning/20 flex items-center justify-center">
                        <AlertTriangle size={14} />
                      </div>
                      Spending Anomalies
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-6 pb-6">
                    {anomalies.map((m, i) => (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-warning/20 bg-warning/5 p-4 transition-colors hover:bg-warning/10"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-md bg-background text-foreground border border-border/40 font-bold text-sm tracking-tight">
                            {m.month}
                          </span>
                          <span className="text-sm text-muted-foreground font-medium flex gap-1">
                            Spending{" "}
                            <span className="font-bold text-foreground">
                              {fmt(m.expenses || 0)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto pl-12 sm:pl-0">
                          <span className="text-xs font-bold px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/20 uppercase tracking-wider">
                            +{" "}
                            {(
                              ((m.expenses || 0) / avgMonthly - 1) *
                              100
                            ).toFixed(0)}
                            % above avg
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {tab === "categories" && (
            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <Card className="glass-card border-border/40 shadow-sm">
                <CardHeader className="pb-4 pt-6 px-6 relative z-10">
                  <CardTitle className="text-base font-bold tracking-tight">
                    Spending by Category
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-6">
                  {categoryData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[340px] text-muted-foreground">
                      <BarChart3 size={32} className="opacity-20 mb-3" />
                      <p className="text-sm font-medium">
                        No expenses this period
                      </p>
                    </div>
                  ) : (
                    <div className="h-[340px] relative -mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={120}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                            label={({ percent }) =>
                              percent && percent > 0.05
                                ? `${(percent * 100).toFixed(0)}%`
                                : ""
                            }
                            labelLine={false}
                          >
                            {categoryData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card border-border/40 shadow-sm">
                <CardHeader className="pb-4 pt-6 px-6">
                  <CardTitle className="text-base font-bold tracking-tight">
                    Category Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="space-y-5">
                    {categoryWithChange
                      .sort((a, b) => b.value - a.value)
                      .map((c, i) => {
                        const total = categoryData.reduce(
                          (s, x) => s + x.value,
                          0,
                        );
                        const pct = total > 0 ? (c.value / total) * 100 : 0;
                        return (
                          <div key={c.name} className="group">
                            <div className="flex items-center justify-between text-sm mb-2">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-3 h-3 rounded-[4px] shadow-sm transform group-hover:scale-110 transition-transform"
                                  style={{
                                    background: COLORS[i % COLORS.length],
                                  }}
                                />
                                <span className="font-semibold text-foreground tracking-tight">
                                  {c.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className="font-bold text-foreground">
                                    {fmt(c.value)}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-1.5 font-medium w-9 inline-block text-right">
                                    {pct.toFixed(0)}%
                                  </span>
                                </div>
                                {c.change !== null && (
                                  <span
                                    className={clsx(
                                      "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider min-w-[40px] text-center border",
                                      c.change > 0
                                        ? "bg-destructive/10 text-destructive border-destructive/20"
                                        : "bg-success/10 text-success border-success/20",
                                    )}
                                  >
                                    {c.change > 0 ? "+" : ""}
                                    {c.change.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-secondary/50 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  background: COLORS[i % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "trends" && (
            <div className="space-y-6">
              <Card className="glass-card border-border/40 shadow-sm">
                <CardHeader className="pb-4 pt-6 px-6">
                  <CardTitle className="text-base font-bold tracking-tight">
                    Monthly Expense Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6 pb-6">
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border) / 0.5)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => `₹${val / 1000}k`}
                          dx={-10}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ fill: "hsl(var(--muted)/0.2)" }}
                        />
                        <Bar
                          dataKey="expenses"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                          name="Expenses"
                          maxBarSize={50}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-border/40 shadow-sm">
                <CardHeader className="pb-4 pt-6 px-6">
                  <CardTitle className="text-base font-bold tracking-tight">
                    Savings Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6 pb-6">
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={savingsData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border) / 0.5)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => `₹${val / 1000}k`}
                          dx={-10}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{
                            stroke: "hsl(var(--muted-foreground)/0.2)",
                            strokeWidth: 1,
                            strokeDasharray: "4 4",
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            paddingTop: "20px",
                            fontSize: "13px",
                            fontWeight: 500,
                          }}
                          iconType="circle"
                        />
                        <Line
                          type="monotone"
                          dataKey="savings"
                          stroke="hsl(var(--success))"
                          strokeWidth={3}
                          dot={{
                            r: 4,
                            fill: "hsl(var(--success))",
                            strokeWidth: 0,
                          }}
                          activeDot={{
                            r: 6,
                            stroke: "hsl(var(--background))",
                            strokeWidth: 2,
                          }}
                          name="Net Savings"
                        />
                        <Line
                          type="monotone"
                          dataKey="expenses"
                          stroke="hsl(var(--destructive))"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{
                            r: 5,
                            stroke: "hsl(var(--background))",
                            strokeWidth: 2,
                          }}
                          name="Expenses"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
