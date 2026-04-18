import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, PiggyBank, Settings,
  LogOut, Upload, Wallet, ChevronRight, ArrowLeftRight,
  BarChart3, Menu, Bell, CalendarRange, Landmark, Target, HelpCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Upload', path: '/upload', icon: Upload },
  { name: 'Receipts', path: '/receipts', icon: Receipt },
  { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
  { name: 'Bills', path: '/bills', icon: Bell },
  { name: 'Budgets', path: '/budgets', icon: PiggyBank },
  { name: 'Debts', path: '/debts', icon: Landmark },
  { name: 'Savings', path: '/savings', icon: Target },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'Summary', path: '/summary', icon: CalendarRange },
  { name: 'Help', path: '/help', icon: HelpCircle },
  { name: 'Settings', path: '/settings', icon: Settings },
];

const SidebarContent: React.FC<{
  user: any;
  logout: () => void;
  pathname: string;
  onNavigate?: () => void;
}> = ({ user, logout, pathname, onNavigate }) => {
  const initials = user?.full_name
    ? user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email ? user.email.slice(0, 2).toUpperCase() : 'FN';

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
            }}
          >
            <Wallet size={16} />
          </div>
          <span
            className="text-sm font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #818cf8, #c4b5fd)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Finlo
          </span>
        </div>
      </div>

      <div className="px-3 mb-2"><div className="divider" /></div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={onNavigate}
              className={`nav-item ${active ? 'active' : ''} group`}
            >
              <Icon
                size={17}
                className={`nav-icon flex-shrink-0 transition-colors ${active ? 'text-primary' : 'text-muted group-hover:text-foreground'}`}
              />
              <span className="flex-1">{item.name}</span>
              {active && <ChevronRight size={14} className="text-primary/60" />}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-3 pb-4">
        <div className="divider mb-3" />
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-200"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff' }}
          >
            {initials}
          </div>
          <span className="text-xs truncate text-muted">
            {user?.full_name || user?.email}
          </span>
        </div>
        <button onClick={logout} className="nav-item w-full hover:text-danger hover:bg-danger/10 group">
          <LogOut size={17} className="group-hover:text-danger transition-colors" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex w-60 flex-shrink-0 flex-col fixed inset-y-0 left-0 z-30"
        style={{
          background: 'rgba(13,13,18,0.98)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <SidebarContent user={user} logout={logout} pathname={location.pathname} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-60 z-50 animate-slide-in-right"
            style={{
              background: 'rgba(13,13,18,0.98)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <SidebarContent
              user={user}
              logout={logout}
              pathname={location.pathname}
              onNavigate={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-60 overflow-hidden">
        {/* Mobile top bar */}
        <header
          className="md:hidden sticky top-0 z-20 flex items-center h-14 px-4"
          style={{
            background: 'rgba(13,13,18,0.9)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <button className="text-foreground mr-3" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="text-sm font-medium text-foreground">
            {navItems.find(i => i.path === location.pathname)?.name || 'Finlo'}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-8 md:px-8 md:py-10 animate-fade-in">
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer
          className="px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between text-xs gap-2"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
            color: 'rgba(136,136,153,0.6)',
          }}
        >
          <span>&copy; {new Date().getFullYear()} Finlo</span>
          <span
            className="hidden sm:inline"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 500,
            }}
          >
            Personal Expense Tracker
          </span>
        </footer>
      </div>
    </div>
  );
};
