"use client";

import { Component, type ReactNode } from "react";

// Per-section error boundary. Used to scope fetch failures (or any render
// error in an async child) to a single Suspense island without taking down
// the whole page. Pair with <Suspense> so the fallback shows only after the
// underlying async work has actually thrown.
//
// Usage:
//   <SectionErrorBoundary fallback={<div>No data yet</div>}>
//     <Suspense fallback={<SkeletonMetricCategory count={6} />}>
//       <AsyncCategorySection promise={metricsPromise} />
//     </Suspense>
//   </SectionErrorBoundary>
interface Props {
  fallback: ReactNode;
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

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
