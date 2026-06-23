import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { reportRenderError } from "./ErrorReporter";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    reportRenderError(error, info.componentStack ?? "");
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md mx-auto p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-6">
              An unexpected error occurred. Try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Reload
            </button>
            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-xs text-muted-foreground/50 cursor-pointer hover:text-muted-foreground">
                  Error details
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-card border border-border text-xs text-muted-foreground overflow-auto max-h-40">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack?.split("\n").slice(0, 8).join("\n")}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
