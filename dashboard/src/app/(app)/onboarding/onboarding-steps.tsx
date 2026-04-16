"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Mark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  displayName: string;
  orgSlug: string;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
      <code className="select-all break-all font-mono text-xs text-foreground">
        {code}
      </code>
      <CopyButton text={code} />
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-colors ${
            i + 1 === current
              ? "bg-primary"
              : i + 1 < current
                ? "bg-primary/40"
                : "bg-muted"
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
    return () => {
      cancelled = true;
    };
  }, [step, apiKey, loading]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg space-y-8">
        <StepIndicator current={step} total={totalSteps} />

        {step === 1 && (
          <div className="space-y-6 text-center">
            <Mark className="mx-auto size-12 text-foreground" />
            <div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">
                Welcome, {displayName}
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                AX measures how effectively you work with AI coding agents.
                Let&apos;s get your CLI connected.
              </p>
            </div>
            <Button size="lg" onClick={() => setStep(2)}>
              Get Started
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Your API Key
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;ll need this to connect the CLI
              </p>
            </div>

            <Card className="p-6">
              <CardContent className="space-y-4 p-0">
                {loading && (
                  <p className="text-xs text-muted-foreground">
                    Loading your key...
                  </p>
                )}

                {!loading && apiKey && (
                  <div className="space-y-3 rounded-lg bg-muted p-4">
                    <code className="block select-all break-all font-mono text-xs text-foreground">
                      {apiKey}
                    </code>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-notice">
                        Save this key — you won&apos;t see it again
                      </p>
                      <CopyButton text={apiKey} />
                    </div>
                  </div>
                )}

                {!loading && !apiKey && (
                  <p className="text-xs text-muted-foreground">
                    Your key has already been revealed. You can generate a new one in{" "}
                    <a href="/settings" className="text-primary hover:underline">
                      Settings
                    </a>
                    .
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button size="lg" onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-serif text-xl font-semibold text-foreground">
                Install the CLI
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Two commands and you&apos;re done
              </p>
            </div>

            <Card className="p-6">
              <CardContent className="space-y-5 p-0">
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    1. Install AX
                  </h3>
                  <CodeBlock code="brew install acroos/tap/ax" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    2. Connect to your team
                  </h3>
                  <CodeBlock
                    code={`ax init --api-key ${apiKey || "<your-api-key>"}`}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button size="lg" onClick={() => setStep(4)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-success/15">
              <Check className="size-6 text-success" aria-hidden />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">
                You&apos;re all set
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Push your first session data with{" "}
                <code className="font-mono text-xs text-foreground">ax push</code>{" "}
                from any repo, and your metrics will appear on the dashboard.
              </p>
            </div>
            <Button size="lg" asChild>
              <a href={`/${orgSlug}`}>Go to Dashboard</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
