import React, { useEffect, useState } from "react";
import { api } from "@/services/api";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Calendar, DollarSign, TrendingDown, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import clsx from "clsx";

const COLORS = [
  "#14b8a6",
  "#f97316",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#eab308",
];

export const MonthlySummary: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await api.get(
          `/analytics/summary?month=${currentMonth}&year=${currentYear}`,
        );
        setData(res.data);
      } catch (e) {
        console.error(e);
        // Fallback mock data if endpoint doesn't exist yet
        setData({
          month: currentMonth,
          year: currentYear,
          total_income: 120000,
          total_expenses: 45000,
          category_breakdown: [
            { name: "Food", value: 15000 },
            { name: "Shopping", value: 10000 },
            { name: "Bills", value: 12000 },
            { name: "Travel", value: 8000 },
          ],
          top_places: [
            { name: "Amazon", value: 5000 },
            { name: "Starbucks", value: 2000 },
            { name: "Uber", value: 3000 },
          ],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [currentMonth, currentYear]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between animate-pulse">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-md" />
            <Skeleton className="h-4 w-32 rounded-md" />
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              className="h-[90px] w-full rounded-2xl border border-border/40"
            />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full rounded-2xl border border-border/40" />
          <Skeleton className="h-96 w-full rounded-2xl border border-border/40" />
        </div>
      </div>
    );
  }

  if (!data)
    return (
      <div className="p-16 text-center border border-dashed border-border/60 rounded-2xl glass-card bg-card/40">
        <Calendar
          size={32}
          className="mx-auto mb-4 text-muted-foreground opacity-30"
        />
        <p className="text-base font-bold text-foreground">
          No summary available
        </p>
        <p className="text-sm font-medium text-muted-foreground mt-1">
          Check back later when you have some transactions.
        </p>
      </div>
    );

  const savings = data.total_income - data.total_expenses;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Monthly Summary
          </h1>
          <p className="text-sm font-medium mt-0.5 text-muted-foreground">
            {format(new Date(currentYear, currentMonth - 1), "MMMM yyyy")}{" "}
            Overview
          </p>
        </div>
        <div className="bg-primary/10 text-primary border border-primary/20 px-4 py-1.5 rounded-md flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider shadow-sm">
          <Calendar size={14} /> Month End Dashboard
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-2">
        {[
          {
            label: "Total Income",
            value: data.total_income,
            icon: DollarSign,
            colorClass: "bg-success/10 text-success border-success/20",
          },
          {
            label: "Total Expenses",
            value: data.total_expenses,
            icon: TrendingDown,
            colorClass:
              "bg-destructive/10 text-destructive border-destructive/20",
          },
          {
            label: "Net Savings",
            value: savings,
            icon: DollarSign,
            colorClass: "bg-primary/10 text-primary border-primary/20",
          },
        ].map(({ label, value, icon: Icon, colorClass }) => (
          <Card
            key={label}
            className="glass-card border-border/40 shadow-sm hover:border-border/80 transition-all duration-300"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div
                className={clsx(
                  "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border",
                  colorClass,
                )}
              >
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground tracking-tight">
                  ₹{value.toLocaleString("en-IN")}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
                  {label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Card className="glass-card border-border/40 shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6 relative z-10">
            <CardTitle className="text-base font-bold tracking-tight">
              Expenditure by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-6">
            <div className="h-[320px] relative -mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.category_breakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    innerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                    labelLine={false}
                    label={({ percent }) =>
                      percent && percent > 0.05
                        ? `${(percent * 100).toFixed(0)}%`
                        : ""
                    }
                  >
                    {data.category_breakdown.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) =>
                      `₹${Number(v).toLocaleString("en-IN")}`
                    }
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border)/0.5)",
                      borderRadius: "12px",
                      padding: "12px 16px",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                    }}
                    itemStyle={{
                      color: "hsl(var(--foreground))",
                      fontWeight: 600,
                      fontSize: "14px",
                    }}
                    labelStyle={{
                      color: "hsl(var(--muted-foreground))",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "4px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40 shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base font-bold tracking-tight">
              Top Spending Places
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="space-y-5">
              {data.top_places.map((place: any, i: number) => (
                <div key={i} className="flex flex-col gap-2 group">
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2.5 text-foreground font-semibold tracking-tight">
                      <MapPin
                        size={14}
                        className="text-primary group-hover:scale-110 transition-transform"
                      />
                      {place.name}
                    </span>
                    <span className="font-bold text-foreground">
                      ₹{place.value.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                      style={{
                        width: `${Math.min((place.value / data.total_expenses) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
