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
import { Sparkline } from "@/components/sparkline";
import type { SparklinePoint } from "@/lib/db";

/* Static sparkline data for preview metric cards */
const sp = (values: number[]): SparklinePoint[] =>
  values.map((v, i) => ({ t: String(i), v }));

const SPARKLINES = {
  ciSuccess: sp([
    0.78, 0.82, 0.85, 0.8, 0.88, 0.83, 0.86, 0.79, 0.84, 0.82, 0.87, 0.83,
  ]),
  postOpen: sp([2, 1, 1, 2, 1, 0, 2, 1, 1, 3, 1, 1]),
  tokenCost: sp([
    1.52, 1.18, 1.35, 0.94, 1.62, 1.22, 1.08, 1.45, 1.3, 1.15, 1.38, 1.28,
  ]),
  cacheHit: sp([
    0.68, 0.71, 0.74, 0.7, 0.73, 0.69, 0.75, 0.72, 0.71, 0.76, 0.73, 0.72,
  ]),
  autonomy: sp([6.5, 7.0, 7.4, 6.8, 7.3, 7.1, 7.6, 6.9, 7.2, 7.5, 7.0, 7.2]),
  sidechain: sp([
    0.15, 0.13, 0.1, 0.14, 0.11, 0.13, 0.09, 0.12, 0.14, 0.11, 0.1, 0.12,
  ]),
};

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
            Are your AI coding workflows working?
          </h1>
          <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted-foreground">
            AX measures what matters — how independently your agent works, how
            many back-and-forths it takes, how much rework lands after a pull
            request opens — so you know if your agentic coding is getting
            better.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/demo">Explore Demo</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">View Docs</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Delivery */}
      <FeatureSection
        eyebrow="Delivery"
        heading="Is work shipping smoothly?"
        body="Cycle time, throughput, and post-open rework."
        metrics={[
          "Task Cycle Time",
          "PR Throughput",
          "Post-Open Commits",
        ]}
        cards={[
          {
            label: "Avg Post-Open Commits",
            value: "1.4",
            sparkline: SPARKLINES.postOpen,
          },
          {
            label: "CI Success Rate",
            value: "83%",
            sparkline: SPARKLINES.ciSuccess,
          },
        ]}
      />

      {/* Session Effectiveness */}
      <FeatureSection
        eyebrow="Session Effectiveness"
        heading="Are your agent sessions productive?"
        body="Iteration depth, context usage, and autonomy."
        metrics={[
          "Iteration Depth",
          "Peak Context Window",
          "Autonomy Score",
        ]}
        cards={[
          {
            label: "Avg Autonomy Score",
            value: "7.2",
            sparkline: SPARKLINES.autonomy,
          },
          {
            label: "Avg Cache Hit Rate",
            value: "72%",
            sparkline: SPARKLINES.cacheHit,
          },
        ]}
        reverse
      />

      {/* Adoption Maturity */}
      <FeatureSection
        eyebrow="Adoption Maturity"
        heading="How deeply is your team using agent capabilities?"
        body="Tool usage, delegation patterns, and review thoroughness."
        metrics={["Skill & Tool Usage", "Subagent Delegation", "Rubber Stamp Rate"]}
        cards={[
          {
            label: "Avg Token Cost",
            value: "$1.28",
            sparkline: SPARKLINES.tokenCost,
          },
          {
            label: "Avg Sidechain Rate",
            value: "12%",
            sparkline: SPARKLINES.sidechain,
          },
        ]}
      />

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
              title="Create an account"
              description="Sign in with GitHub to create your org. Invite your team and get set up in seconds."
            />
            <Step
              number={2}
              title="Connect GitHub"
              description="Install the AX GitHub App on your org. We receive webhook events and backfill up to 90 days of PR history."
            />
            <Step
              number={3}
              title="Connect the CLI"
              description="Install the CLI and run ax init to link your local environment. AX hooks into Claude Code's session lifecycle automatically."
              code="brew install acroos/tap/ax && ax init"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-[1100px] px-6 py-16 text-center">
          <h2 className="mb-3 font-serif text-[26px] font-semibold text-foreground">
            Free to start, scales with your team
          </h2>
          <p className="mx-auto mb-6 max-w-[420px] text-[15px] text-muted-foreground">
            Core metrics and GitHub integration included on the free plan.
            Upgrade for unlimited team members and data export.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/login">Get Started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/plans">View Plans</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureSection({
  eyebrow,
  heading,
  body,
  metrics,
  cards,
  reverse = false,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  metrics: string[];
  cards: {
    label: string;
    value: string;
    sparkline: SparklinePoint[];
  }[];
  reverse?: boolean;
}) {
  return (
    <section className="border-t border-border">
      <div
        className={`mx-auto flex max-w-[1100px] items-center gap-16 px-6 py-20 ${reverse ? "flex-row-reverse" : ""}`}
      >
        <div className="flex-1">
          <p className="mb-3 text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mb-4 max-w-[400px] font-serif text-[26px] font-semibold leading-snug text-foreground">
            {heading}
          </h2>
          <p className="mb-6 max-w-[400px] text-[15px] leading-relaxed text-muted-foreground">
            {body}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {metrics.map((m) => (
              <Badge key={m} variant="secondary" className="font-normal">
                {m}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          {cards.map((card) => (
            <PreviewCard key={card.label} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewCard({
  label,
  value,
  sparkline,
}: {
  label: string;
  value: string;
  sparkline: SparklinePoint[];
}) {
  return (
    <Card className="gap-0 p-5">
      <CardContent className="p-0">
        <div className="mb-3 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mb-1 font-serif text-[28px] font-medium leading-none tracking-tight text-foreground [font-variant-numeric:lining-nums_tabular-nums]">
          {value}
        </div>
        <Sparkline data={sparkline} className="mt-4 h-12 w-full" label={label} />
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
