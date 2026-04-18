import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallbackText?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in React Error Boundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="glass-panel p-8 max-w-md w-full text-center animate-fade-in relative overflow-hidden">
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
              style={{
                background: "rgba(244,63,94,0.08)",
                filter: "blur(40px)",
              }}
            />

            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: "rgba(244,63,94,0.1)",
                border: "1px solid rgba(244,63,94,0.2)",
              }}
            >
              <AlertTriangle size={28} className="text-danger" />
            </div>

            <h1 className="text-xl font-bold text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-muted mb-8 leading-relaxed">
              {this.props.fallbackText ||
                "An unexpected error occurred while loading this view. Please try refreshing."}
            </p>

            <button
              onClick={() => window.location.reload()}
              className="btn-primary w-full flex justify-center items-center gap-2 py-3"
            >
              <RefreshCcw size={16} />
              Reload Application
            </button>
            <div className="mt-4 p-3 bg-black/40 rounded-lg border border-white/5 text-left overflow-x-auto">
              <p className="text-xs text-danger/80 font-mono">
                {this.state.error?.message || "Unknown Error"}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
