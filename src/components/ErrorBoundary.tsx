"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-900">
              {this.props.fallbackTitle || "發生錯誤 / Something went wrong"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              {this.props.fallbackMessage || "請重新載入頁面，或聯繫客服。\nPlease reload or contact support."}
            </p>
            {this.state.error ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2 font-mono text-xs text-slate-400 break-all">
                {this.state.error.message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-[1.3rem] bg-[var(--brand-ink)] px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              重新載入 / Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
