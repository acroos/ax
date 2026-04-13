"use client";

import { useState, useEffect } from "react";
import { CopyButton } from "@/components/copy-button";

interface Props {
  displayName: string;
  orgSlug: string;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between bg-surface-0 rounded-lg p-3">
      <code className="text-xs text-text-primary font-mono break-all select-all">
        {code}
      </code>
      <CopyButton text={code} />
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i + 1 === current ? "bg-accent" : i + 1 < current ? "bg-accent/40" : "bg-surface-3"
          }`}
        />
      ))}
    </div>
  );
}

export function OnboardingSteps({ displayName, orgSlug }: Props) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const totalSteps = 4;

  useEffect(() => {
    if (step !== 2 || apiKey !== null || loading) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/v1/api_key/reveal")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.key) setApiKey(data.key);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [step, apiKey, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-void">
      <div className="w-full max-w-lg space-y-8">
        <StepIndicator current={step} total={totalSteps} />

        {step === 1 && (
          <div className="space-y-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto">
              <span className="text-white font-bold text-xl tracking-tight">ax</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">
                Welcome, {displayName}
              </h1>
              <p className="mt-2 text-sm text-text-secondary max-w-sm mx-auto">
                AX measures how effectively you work with AI coding agents.
                Let&apos;s get your CLI connected.
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-text-primary">Your API Key</h2>
              <p className="mt-1 text-sm text-text-secondary">
                You&apos;ll need this to connect the CLI
              </p>
            </div>

            <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
              {loading && (
                <p className="text-xs text-text-tertiary">Loading your key...</p>
              )}

              {!loading && apiKey && (
                <div className="bg-surface-0 rounded-lg p-4 space-y-3">
                  <code className="block text-xs text-text-primary font-mono break-all select-all">
                    {apiKey}
                  </code>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-amber font-medium">
                      Save this key — you won&apos;t see it again
                    </p>
                    <CopyButton text={apiKey} />
                  </div>
                </div>
              )}

              {!loading && !apiKey && (
                <p className="text-xs text-text-tertiary">
                  Your key has already been revealed. You can generate a new one in{" "}
                  <a href="/settings" className="text-accent hover:underline">Settings</a>.
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-text-primary">Install the CLI</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Two commands and you&apos;re done
              </p>
            </div>

            <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-5">
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-text-secondary">1. Install AX</h3>
                <CodeBlock code="brew install acroos/tap/ax" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-medium text-text-secondary">2. Connect to your team</h3>
                <CodeBlock
                  code={`ax init --api-key ${apiKey || "<your-api-key>"}`}
                />
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setStep(4)}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-green/20 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-green">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">You&apos;re all set</h2>
              <p className="mt-2 text-sm text-text-secondary max-w-sm mx-auto">
                Push your first session data with <code className="text-accent font-mono text-xs">ax push</code> from
                any repo, and your metrics will appear on the dashboard.
              </p>
            </div>
            <a
              href={`/${orgSlug}`}
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
