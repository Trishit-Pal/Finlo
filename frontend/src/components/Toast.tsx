import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'undo';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  onUndo?: () => void;
  duration?: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: string, options?: { onUndo?: () => void; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  undo: Undo2,
};

const COLORS = {
  success: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)', text: '#34d399' },
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', text: '#fb7185' },
  info: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.25)', text: '#818cf8' },
  undo: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24' },
};

let idCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback((type: ToastType, message: string, options?: { onUndo?: () => void; duration?: number }) => {
    const id = `toast-${++idCounter}`;
    const duration = options?.duration ?? (type === 'undo' ? 5000 : 3000);
    setToasts(prev => [...prev.slice(-4), { id, type, message, onUndo: options?.onUndo, duration }]);

    const timer = setTimeout(() => removeToast(id), duration);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-[100] flex flex-col gap-2 sm:max-w-sm">
        {toasts.map(t => {
          const Icon = ICONS[t.type];
          const colors = COLORS[t.type];
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-slide-up"
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <Icon size={16} style={{ color: colors.text }} className="flex-shrink-0" />
              <p className="text-sm text-foreground flex-1">{t.message}</p>
              {t.type === 'undo' && t.onUndo && (
                <button
                  onClick={() => { t.onUndo?.(); removeToast(t.id); }}
                  className="text-xs font-semibold px-2 py-1 rounded-lg transition-all hover:bg-white/10"
                  style={{ color: colors.text }}
                >
                  Undo
                </button>
              )}
              <button onClick={() => removeToast(t.id)} className="p-0.5 text-muted hover:text-foreground">
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
