import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, AuthResponse } from '../types';
import { api, getStoredToken, clearStoredTokens, setStoredTokens } from '../services/api';
import { identifyUser, resetUser } from '../services/posthog';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  setAuth: (data: AuthResponse) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      clearStoredTokens();
      setUser(null);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      await refreshUser();
      setLoading(false);
    };

    initAuth();

    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const setAuth = (data: AuthResponse) => {
    setStoredTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    identifyUser(data.user.id, { email: data.user.email });
  };

  const logout = () => {
    clearStoredTokens();
    setUser(null);
    resetUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, setAuth, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
