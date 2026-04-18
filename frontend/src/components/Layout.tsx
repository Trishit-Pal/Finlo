import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  PiggyBank,
  Settings,
  LogOut,
  Upload,
  Wallet,
  ChevronRight,
  ArrowLeftRight,
  BarChart3,
  Menu,
  Bell,
  CalendarRange,
  Landmark,
  Target,
  HelpCircle,
  CreditCard,
  Lightbulb,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Upload", path: "/upload", icon: Upload },
  { name: "Receipts", path: "/receipts", icon: Receipt },
  { name: "Transactions", path: "/transactions", icon: ArrowLeftRight },
  { name: "Import Data", path: "/import", icon: FileSpreadsheet },
  { name: "Accounts", path: "/accounts", icon: CreditCard },
  { name: "Bills", path: "/bills", icon: Bell },
  { name: "Budgets", path: "/budgets", icon: PiggyBank },
  { name: "Debts", path: "/debts", icon: Landmark },
  { name: "Savings", path: "/savings", icon: Target },
  { name: "Analytics", path: "/analytics", icon: BarChart3 },
  { name: "Insights", path: "/insights", icon: Lightbulb },
  { name: "Summary", path: "/summary", icon: CalendarRange },
  { name: "Help", path: "/help", icon: HelpCircle },
  { name: "Settings", path: "/settings", icon: Settings },
];

const SidebarContent: React.FC<{
  user: unknown;
  logout: () => void;
  pathname: string;
  onNavigate?: () => void;
}> = ({ user, logout, pathname, onNavigate }) => {
  const u = user as { full_name?: string; email?: string } | null;
  const initials = u?.full_name
    ? u.full_name
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : u?.email
      ? u.email.slice(0, 2).toUpperCase()
      : "FN";

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0 bg-primary shadow-glow-sm">
            <Wallet size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-gradient">Finlo</span>
          </span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={onNavigate}
              className={`nav-item ${active ? "active" : ""} group`}
            >
              <Icon
                size={17}
                className={`nav-icon flex-shrink-0 transition-colors ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
              />
              <span className="flex-1">{item.name}</span>
              {active && <ChevronRight size={14} className="text-primary/60" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border/40 space-y-2">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-muted/40">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-primary text-primary-foreground">
            {initials}
          </div>
          <span className="text-xs truncate text-muted-foreground">
            {u?.full_name || u?.email}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut size={16} />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col fixed inset-y-0 left-0 z-30 glass-card border-r border-border/40">
        <SidebarContent
          user={user}
          logout={logout}
          pathname={location.pathname}
        />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-60 z-50 glass-card border-r border-border/40 animate-slide-in-right">
            <SidebarContent
              user={user}
              logout={logout}
              pathname={location.pathname}
              onNavigate={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-screen lg:ml-60 overflow-hidden">
        <header className="lg:hidden sticky top-0 z-20 glass-card border-b border-border/40 h-14 flex items-center px-4">
          <button
            type="button"
            className="text-foreground mr-3 p-1 rounded-md hover:bg-muted/50"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-sm font-medium text-foreground">
            {navItems.find((i) => i.path === location.pathname)?.name ||
              "Finlo"}
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-8 md:px-8 md:py-10 animate-fade-in">
            <Outlet />
          </div>
        </main>

        <footer className="px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between text-xs gap-2 border-t border-border/40 text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Finlo</span>
          <span className="hidden sm:inline font-medium text-gradient">
            Personal Expense Tracker
          </span>
        </footer>
      </div>
    </div>
  );
};
