import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
  context: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: '' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[VANGUARD ERROR BOUNDARY]', error, info);
    this.setState({ errorInfo: info.componentStack || '' });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-tac-bg p-6">
          <div className="w-full max-w-2xl rounded-lg border border-red-800/70 bg-tac-panel p-7 text-center">
            <AlertOctagon className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h1 className="text-xl font-black uppercase tracking-widest text-red-400">
              {this.props.context} ENCOUNTERED A FATAL ERROR
            </h1>
            <p className="mt-2 text-xs text-slate-400">
              The application has stopped rather than continuing in an inconsistent state. Your settings and
              profile data are preserved in local storage.
            </p>

            <div className="mt-4 max-h-40 overflow-auto rounded border border-tac-border bg-slate-950 p-3 text-left">
              <div className="font-mono text-[11px] font-bold text-red-300">
                {this.state.error?.name}: {this.state.error?.message}
              </div>
              {this.state.errorInfo && (
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-slate-500">
                  {this.state.errorInfo.slice(0, 1200)}
                </pre>
              )}
            </div>

            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: '' });
                  this.props.onReset();
                }}
                className="inline-flex items-center gap-2 rounded bg-cyan-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-cyan-500"
              >
                <RefreshCw className="h-4 w-4" /> RECOVER SESSION
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded border border-tac-border bg-tac-panel2 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:border-cyan-600"
              >
                RELOAD APPLICATION
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
