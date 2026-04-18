import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ABTestProvider } from './context/ABTestContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionLock } from './components/SessionLock';
import { Onboarding } from './components/Onboarding';
import { ToastProvider } from './components/Toast';
import { AuthForm } from './components/AuthForm';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Upload } from './pages/Upload';
import { Review } from './pages/Review';
import { Receipts } from './pages/Receipts';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { Analytics } from './pages/Analytics';
import { Bills } from './pages/Bills';
import { Debts } from './pages/Debts';
import { SavingsGoals } from './pages/SavingsGoals';
import { MonthlySummary } from './pages/MonthlySummary';
import { Help } from './pages/Help';
import { SettingsPage } from './pages/SettingsPage';
import { NotFound } from './pages/NotFound';
import { ProfileBootstrap } from './pages/ProfileBootstrap';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary, #0d0d12)' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full animate-spin"
            style={{
              border: '2px solid rgba(99,102,241,0.2)',
              borderTopColor: '#6366f1',
            }}
          />
          <p className="text-xs text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

const AppContent = () => {
  const { user } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(() => {
    return user?.settings?.onboarding_completed === true;
  });

  // Show onboarding for new users who haven't completed it
  const needsProfileBootstrap = !!user && (!user.profile?.username || !user.profile?.date_of_birth);
  const needsOnboarding = user && !onboardingDone && !user.settings?.onboarding_completed;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <AuthForm />} />

      {/* Protected App */}
      <Route element={
        <ProtectedRoute>
          {needsProfileBootstrap ? (
            <ProfileBootstrap />
          ) : needsOnboarding ? (
            <Onboarding onComplete={() => setOnboardingDone(true)} />
          ) : (
            <SessionLock><Layout /></SessionLock>
          )}
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/review/:id" element={<Review />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/debts" element={<Debts />} />
        <Route path="/savings" element={<SavingsGoals />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/summary" element={<MonthlySummary />} />
        <Route path="/help" element={<Help />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export const App = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ABTestProvider>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </ABTestProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </BrowserRouter>
);

export default App;
