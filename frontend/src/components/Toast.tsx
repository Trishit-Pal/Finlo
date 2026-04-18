import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from "lucide-react";

type ToastType = "success" | "error" | "info" | "undo";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  onUndo?: () => void;
  duration?: number;
}

interface ToastContextType {
  toast: (
    type: ToastType,
    message: string,
    options?: { onUndo?: () => void; duration?: number },
  ) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  undo: Undo2,
};

const COLORS = {
  success: {
    bg: "hsl(152 76% 36% / 0.12)",
    border: "hsl(152 76% 36% / 0.28)",
    text: "hsl(152 76% 50%)",
  },
  error: {
    bg: "hsl(var(--destructive) / 0.12)",
    border: "hsl(var(--destructive) / 0.28)",
    text: "hsl(var(--destructive))",
  },
  info: {
    bg: "hsl(var(--primary) / 0.12)",
    border: "hsl(var(--primary) / 0.28)",
    text: "hsl(var(--primary))",
  },
  undo: {
    bg: "hsl(38 92% 50% / 0.12)",
    border: "hsl(38 92% 50% / 0.28)",
    text: "hsl(38 92% 55%)",
  },
};

let idCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (
      type: ToastType,
      message: string,
      options?: { onUndo?: () => void; duration?: number },
    ) => {
      const id = `toast-${++idCounter}`;
      const duration = options?.duration ?? (type === "undo" ? 5000 : 3000);
      setToasts((prev) => [
        ...prev.slice(-4),
        { id, type, message, onUndo: options?.onUndo, duration },
      ]);

      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-[100] flex flex-col gap-2 sm:max-w-sm">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          const colors = COLORS[t.type];
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-slide-up backdrop-blur-md"
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                backdropFilter: "blur(12px)",
              }}
            >
              <Icon
                size={16}
                style={{ color: colors.text }}
                className="flex-shrink-0"
              />
              <p className="text-sm text-foreground flex-1 font-medium">
                {t.message}
              </p>
              {t.type === "undo" && t.onUndo && (
                <button
                  onClick={() => {
                    t.onUndo?.();
                    removeToast(t.id);
                  }}
                  className="text-xs font-semibold px-2 py-1 rounded-lg transition-all hover:bg-white/10"
                  style={{ color: colors.text }}
                >
                  Undo
                </button>
              )}
              <button
                onClick={() => removeToast(t.id)}
                className="p-0.5 text-muted hover:text-foreground"
              >
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
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};
