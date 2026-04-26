"use client";

import { useState, useEffect } from "react";
import { Check, BookOpen, ArrowRight, ExternalLink } from "lucide-react";

import { getInstallUrl, createInvite } from "./actions";
import { CopyButton } from "@/components/copy-button";
import { Mark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  displayName: string;
  orgSlug: string;
  orgName: string;
  isAdmin: boolean;
}

// Admin steps: welcome, github, cli, invite, done
// Member steps: welcome, cli, done
type AdminStep = "welcome" | "github" | "cli" | "invite" | "done";
type MemberStep = "welcome" | "cli" | "done";
type Step = AdminStep | MemberStep;

const ADMIN_STEPS: AdminStep[] = ["welcome", "github", "cli", "invite", "done"];
const MEMBER_STEPS: MemberStep[] = ["welcome", "cli", "done"];

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

function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
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

// --- Step Components ---

function WelcomeStep({
  displayName,
  orgName,
  isAdmin,
  onNext,
}: {
  displayName: string;
  orgName: string;
  isAdmin: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <Mark className="mx-auto size-12 text-foreground" />
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {isAdmin
            ? `Welcome, ${displayName}`
            : `Welcome to ${orgName}`}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {isAdmin
            ? "AX measures how effectively your team works with AI coding agents. Let\u2019s get everything connected."
            : "Let\u2019s get your environment connected so your metrics flow into the team\u2019s dashboard."}
        </p>
      </div>
      <Button size="lg" onClick={onNext}>
        Get Started
      </Button>
    </div>
  );
}

function GitHubStep({
  orgSlug,
  onNext,
}: {
  orgSlug: string;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInstall() {
    setLoading(true);
    setError(null);
    try {
      const result = await getInstallUrl(orgSlug);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (result.install_url) {
        window.open(result.install_url, "_blank", "noopener,noreferrer");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-serif text-xl font-semibold text-foreground">
          Connect GitHub
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is how AX receives pull request data
        </p>
      </div>

      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <p className="text-xs leading-relaxed text-muted-foreground">
            The AX GitHub App listens for pull request events, reviews, and CI
            results. Once installed, AX backfills up to 90 days of PR history
            so you see metrics right away.
          </p>

          <Button onClick={handleInstall} disabled={loading}>
            {loading ? "Opening..." : "Install GitHub App"}
            <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
          </Button>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <p className="text-[11px] text-muted-foreground">
            This opens GitHub in a new tab. After installing, come back here
            and continue. You can always install later from Org Settings.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-3">
        <Button size="lg" onClick={onNext}>
          Next
        </Button>
        <button
          type="button"
          onClick={onNext}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function CLIStep({
  apiKey,
  loading,
  onNext,
}: {
  apiKey: string | null;
  loading: boolean;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-serif text-xl font-semibold text-foreground">
          Install the CLI
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The CLI sends session data from your local environment
        </p>
      </div>

      <Card className="p-6">
        <CardContent className="space-y-5 p-0">
          {/* API Key */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Your API Key
            </h3>
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
                Your key has already been revealed. You can generate a new one
                in{" "}
                <a href="/settings" className="text-primary hover:underline">
                  Account Settings
                </a>
                .
              </p>
            )}
          </div>

          {/* Install commands */}
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
        <Button size="lg" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}

function InviteStep({
  orgSlug,
  onNext,
}: {
  orgSlug: string;
  onNext: () => void;
}) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

    setCreating(true);
    setError(null);
    setInviteLink(null);

    const result = await createInvite(orgSlug, username.trim(), role);

    if (result.error) {
      setError(result.error);
    } else if (result.link) {
      setInviteLink(result.link);
      setInvitedUsers((prev) => [...prev, username.trim()]);
      setUsername("");
    }
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-serif text-xl font-semibold text-foreground">
          Invite your team
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Metrics get better with more contributors
        </p>
      </div>

      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <form onSubmit={handleCreate} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="invite-username"
                className="text-[11px] text-muted-foreground"
              >
                GitHub username
              </Label>
              <Input
                id="invite-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="octocat"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="invite-role"
                className="text-[11px] text-muted-foreground"
              >
                Role
              </Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="invite-role" size="sm" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member" className="text-xs">
                    member
                  </SelectItem>
                  <SelectItem value="admin" className="text-xs">
                    admin
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={creating || !username.trim()}
            >
              {creating ? "Sending..." : "Send Invite"}
            </Button>
          </form>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {inviteLink && (
            <div className="space-y-2 rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                Invite created. Share this link:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all break-all font-mono text-xs text-foreground">
                  {inviteLink}
                </code>
                <CopyButton text={inviteLink} />
              </div>
            </div>
          )}

          {invitedUsers.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Invited: {invitedUsers.map((u) => `@${u}`).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-3">
        <Button size="lg" onClick={onNext}>
          {invitedUsers.length > 0 ? "Continue" : "Next"}
        </Button>
        {invitedUsers.length === 0 && (
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

function DoneStep({
  orgSlug,
  isAdmin,
}: {
  orgSlug: string;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-success/15">
        <Check className="size-6 text-success" aria-hidden />
      </div>
      <div>
        <h2 className="font-serif text-xl font-semibold text-foreground">
          You&apos;re all set
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {isAdmin
            ? "Your data is on its way. Metrics will appear once pull requests are merged or closed \u2014 this usually takes a few minutes if you have recent PR history."
            : "Your session data will start flowing in. Metrics update as pull requests are merged or closed."}
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-3">
        <a
          href="/docs"
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                Explore the metrics
              </p>
              <p className="text-xs text-muted-foreground">
                Learn what each metric measures and why it matters
              </p>
            </div>
          </div>
          <ArrowRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </a>
      </div>

      <Button size="lg" variant="outline" asChild>
        <a href={`/${orgSlug}`}>Go to Dashboard</a>
      </Button>
    </div>
  );
}

// --- Main Component ---

export function OnboardingSteps({
  displayName,
  orgSlug,
  orgName,
  isAdmin,
}: Props) {
  const steps = isAdmin ? ADMIN_STEPS : MEMBER_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  const currentStep: Step = steps[stepIndex];

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  // Fetch the API key when we reach the CLI step.
  // Do NOT depend on apiKeyLoading: setting it inside this effect would
  // re-run the effect and its cleanup would cancel the in-flight fetch
  // before it could store the key, leaving the UI stuck on "Loading...".
  useEffect(() => {
    if (currentStep !== "cli" || apiKey !== null) return;

    let cancelled = false;
    setApiKeyLoading(true);
    fetch("/api/v1/api_key/reveal")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.key) setApiKey(data.key);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setApiKeyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentStep, apiKey]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg space-y-8 px-4">
        <StepIndicator current={stepIndex + 1} total={steps.length} />

        {currentStep === "welcome" && (
          <WelcomeStep
            displayName={displayName}
            orgName={orgName}
            isAdmin={isAdmin}
            onNext={goNext}
          />
        )}

        {currentStep === "github" && (
          <GitHubStep orgSlug={orgSlug} onNext={goNext} />
        )}

        {currentStep === "cli" && (
          <CLIStep apiKey={apiKey} loading={apiKeyLoading} onNext={goNext} />
        )}

        {currentStep === "invite" && (
          <InviteStep orgSlug={orgSlug} onNext={goNext} />
        )}

        {currentStep === "done" && (
          <DoneStep orgSlug={orgSlug} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  );
}
