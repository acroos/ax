import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LandingPage() {
  const user = await getCurrentUser();

  if (user) {
    const defaultOrg = user.organizations[0]?.slug;
    redirect(defaultOrg ? `/${defaultOrg}` : "/onboarding");
  }

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-[1100px] px-6 pt-24 pb-20">
        <div className="max-w-[680px]">
          <h1 className="font-serif text-[40px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
            Are your AI coding workflows actually working?
          </h1>
          <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted-foreground">
            AX measures what matters — cost per PR, iteration depth, CI success,
            and more metrics that tell you if your agentic coding is getting
            better.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/login">Get Started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">View Docs</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-[1100px] px-6 py-16">
          <p className="mb-6 text-center text-[13px] font-medium text-muted-foreground">
            Your dashboard at a glance
          </p>
          <div className="overflow-hidden rounded-xl border border-border shadow-lg">
            <img
              src="/dashboard-preview.png"
              alt="AX dashboard showing metric cards across Output Quality, Prompt Efficiency, and Agent Behavior categories"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-[1100px] px-6 py-20">
          <p className="mb-3 text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
            10 metrics across 3 categories
          </p>
          <h2 className="mb-12 max-w-[480px] font-serif text-[26px] font-semibold leading-snug text-foreground">
            Understand every dimension of your AI coding workflow
          </h2>

          <div className="grid grid-cols-3 gap-4">
            <MetricCategory
              title="Output Quality"
              description="Is the code your agent produces actually good? CI success, post-open commits, review cycle time, and line revisit rate."
              metrics={[
                "Post-Open Commits",
                "CI Success Rate",
                "Line Revisit Rate",
                "Review Cycle Time",
              ]}
            />
            <MetricCategory
              title="Prompt Efficiency"
              description="Are you getting results with fewer interactions and less cost? Token spend, iteration depth, and cache utilization."
              metrics={[
                "Iteration Depth",
                "Token Cost per PR",
                "Cache Hit Rate",
                "Unmerged Token Spend",
              ]}
            />
            <MetricCategory
              title="Agent Behavior"
              description="How well is the agent navigating problems? Backtracking, redundant reads, and autonomy."
              metrics={["Sidechain Rate", "Re-Read Rate", "Autonomy Score"]}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-[1100px] px-6 py-20">
          <p className="mb-3 text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
            How it works
          </p>
          <h2 className="mb-12 max-w-[480px] font-serif text-[26px] font-semibold leading-snug text-foreground">
            Three steps, five minutes
          </h2>

          <div className="grid grid-cols-3 gap-6">
            <Step
              number={1}
              title="Install the CLI"
              description="One command to install, one to connect. AX hooks into Claude Code's session lifecycle automatically."
              code="brew install acroos/tap/ax"
            />
            <Step
              number={2}
              title="Connect GitHub"
              description="Install the AX GitHub App on your org. We receive webhook events and backfill up to 90 days of PR history."
            />
            <Step
              number={3}
              title="See your metrics"
              description="Push session data from any repo. Your dashboard populates with metrics as PRs are opened, reviewed, and merged."
            />
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-[1100px] px-6 py-20 text-center">
          <h2 className="mb-3 font-serif text-[26px] font-semibold text-foreground">
            Free to start, scales with your team
          </h2>
          <p className="mx-auto mb-8 max-w-[420px] text-[15px] text-muted-foreground">
            Core metrics and GitHub integration included on the free plan.
            Upgrade for unlimited team members and data export.
          </p>
          <Button variant="outline" asChild>
            <Link href="/plans">View Plans</Link>
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-[1100px] px-6 py-16 text-center">
          <h2 className="mb-3 font-serif text-[26px] font-semibold text-foreground">
            Start measuring what matters
          </h2>
          <p className="mx-auto mb-6 max-w-[400px] text-[15px] text-muted-foreground">
            Sign in with GitHub and push your first session data in under five
            minutes.
          </p>
          <Button size="lg" asChild>
            <Link href="/login">Get Started</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function MetricCategory({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  metrics: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">{title}</CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {metrics.map((m) => (
            <Badge key={m} variant="secondary" className="font-normal">
              {m}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Step({
  number,
  title,
  description,
  code,
}: {
  number: number;
  title: string;
  description: string;
  code?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent">
          <span className="text-[12px] font-semibold text-accent-foreground">
            {number}
          </span>
        </div>
        <CardTitle className="text-[15px]">{title}</CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      {code && (
        <CardContent>
          <div className="rounded-lg bg-muted px-3 py-2">
            <code className="font-mono text-[12px] text-muted-foreground">
              {code}
            </code>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
