import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-20">
      <div className="mb-12">
        <h1 className="mb-3 font-serif text-[32px] font-semibold text-foreground">
          Getting Started
        </h1>
        <p className="max-w-[520px] text-[15px] text-muted-foreground">
          Connect your CLI, install the GitHub App, and start seeing metrics
          in under five minutes.
        </p>
      </div>

      <div className="space-y-6">
        <SetupStep number={1} title="Sign in to the dashboard">
          <p>
            <Link href="/login" className="text-primary hover:underline">
              Sign in with GitHub
            </Link>{" "}
            to create your account. AX requests read-only access to your
            profile and email — no repository access is granted through OAuth.
          </p>
        </SetupStep>

        <SetupStep number={2} title="Copy your API key">
          <p>
            After signing in, you&apos;ll be guided through onboarding where
            your API key is displayed. Copy it — it&apos;s only shown once.
            You can rotate it later from{" "}
            <strong className="font-medium text-foreground">
              Account Settings
            </strong>
            .
          </p>
        </SetupStep>

        <SetupStep number={3} title="Install and connect the CLI">
          <p>Install AX via Homebrew:</p>
          <CodeBlock>brew install acroos/tap/ax</CodeBlock>
          <p>Then connect it to your account:</p>
          <CodeBlock>ax init --api-key YOUR_API_KEY</CodeBlock>
          <p>
            This validates your key, writes a config file to{" "}
            <InlineCode>~/.ax/config.json</InlineCode>, and installs a Claude
            Code <InlineCode>SessionEnd</InlineCode> hook that automatically
            pushes session data when you finish working.
          </p>
        </SetupStep>

        <SetupStep number={4} title="Push your first data">
          <p>Push session data from any git repository:</p>
          <CodeBlock>ax push --repo .</CodeBlock>
          <p>Or push data for all discovered repos at once:</p>
          <CodeBlock>ax push --all</CodeBlock>
        </SetupStep>

        <SetupStep number={5} title="Install the GitHub App">
          <p>
            Navigate to{" "}
            <strong className="font-medium text-foreground">Org Settings</strong>{" "}
            in the dashboard and click{" "}
            <strong className="font-medium text-foreground">
              Install GitHub App
            </strong>
            . This grants AX access to webhook events (PRs opened, merged,
            closed) and triggers a 90-day historical backfill of your existing
            PRs.
          </p>
          <p>
            This is a one-time step per GitHub organization. Only an org admin
            needs to do it.
          </p>
        </SetupStep>

        <SetupStep number={6} title="View your metrics">
          <p>Once data flows in, your dashboard populates automatically. Explore:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[14px] text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Overview</strong>
              {" "}— Aggregate metrics at a glance
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Pull Requests
              </strong>
              {" "}— Per-PR metric breakdown
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Metric Drill-Down
              </strong>
              {" "}— Trends and distributions for each metric
            </li>
          </ul>
        </SetupStep>

        <SetupStep number={7} title="Invite your team" optional>
          <p>
            From{" "}
            <strong className="font-medium text-foreground">Org Settings</strong>
            , generate invite links for your team. Each link is single-use.
            Invited members sign in with GitHub and are automatically added to
            your organization.
          </p>
          <p>
            The free plan supports 1 member.{" "}
            <Link href="/plans" className="text-primary hover:underline">
              Upgrade to Pro
            </Link>{" "}
            for unlimited team members.
          </p>
        </SetupStep>
      </div>

      <div className="mt-16">
        <h2 className="mb-4 font-serif text-[22px] font-semibold text-foreground">
          Troubleshooting
        </h2>
        <Card className="gap-0 overflow-hidden p-0">
          <CardContent className="divide-y divide-border p-0">
            <TroubleshootItem
              question="CLI says 401 Unauthorized"
              answer="Your API key may have been rotated. Generate a new one from Account Settings and run ax init again."
            />
            <TroubleshootItem
              question="PRs aren't showing up"
              answer="Make sure the GitHub App is installed on the correct org and the repo is connected. PRs must be in a terminal state (merged or closed) for metrics to compute."
            />
            <TroubleshootItem
              question="Session data not appearing after push"
              answer="Confirm your CLI is configured with ax init. Session data is matched to PRs by branch name — make sure you're working on a branch that has (or will have) an associated PR."
            />
            <TroubleshootItem
              question="GitHub App installation failed"
              answer="You need admin permissions on the GitHub organization. Ask an org admin to complete the installation from the Org Settings page."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SetupStep({
  number,
  title,
  children,
  optional,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent">
          <span className="text-[12px] font-semibold text-accent-foreground">
            {number}
          </span>
        </div>
        <div className="flex-1 space-y-2.5">
          <h3 className="flex items-center gap-2 text-[15px] font-medium leading-none text-foreground">
            {title}
            {optional && (
              <Badge variant="secondary" className="font-normal">
                Optional
              </Badge>
            )}
          </h3>
          <div className="space-y-2.5 text-[14px] leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted px-3.5 py-2.5">
      <code className="font-mono text-[13px] text-muted-foreground">
        {children}
      </code>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}

function TroubleshootItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="px-5 py-4">
      <h4 className="mb-1 text-[14px] font-medium text-foreground">
        {question}
      </h4>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {answer}
      </p>
    </div>
  );
}
