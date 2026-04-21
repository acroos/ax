"use client";

import { Component, type ReactNode } from "react";

// Per-section error boundary. Scopes fetch failures (or any render error in
// an async child) to a single Suspense island without taking down the whole
// page. Shows an inline error message with a retry button on failure.
//
// Usage:
//   <SectionErrorBoundary>
//     <Suspense fallback={<SkeletonMetricCategory count={6} />}>
//       <AsyncCategorySection promise={metricsPromise} />
//     </Suspense>
//   </SectionErrorBoundary>
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Log to the browser console so the failure isn't silent during dev.
    // Production telemetry (Sentry, etc.) can hook in here later.
    // eslint-disable-next-line no-console
    console.error("Section error:", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-border bg-muted/50 px-6 py-12">
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Something went wrong &mdash; try refreshing.
            </p>
            <button
              onClick={this.handleRetry}
              className="text-sm font-medium text-primary transition-colors hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
