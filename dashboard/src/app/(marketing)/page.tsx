import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LandingPage() {
  const user = await getCurrentUser();

  if (user) {
    const defaultOrg = user.organizations[0]?.slug;
    redirect(defaultOrg ? `/${defaultOrg}` : "/onboarding");
  }

  return (
    <div>
      {/* Hero */}
      <section className="max-w-[1100px] mx-auto px-6 pt-24 pb-20">
        <div className="max-w-[680px]">
          <h1 className="text-[40px] font-semibold text-text-primary leading-[1.15] tracking-[-0.02em]">
            Are your AI coding workflows actually working?
          </h1>
          <p className="mt-5 text-[17px] text-text-secondary leading-relaxed max-w-[560px]">
            AX measures what matters — cost per PR, first-pass acceptance,
            self-correction rate, and 13 more metrics that tell you if your
            agentic coding is getting better.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-[14px] transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/docs"
              className="px-5 py-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-primary font-medium text-[14px] transition-colors border border-border-subtle"
            >
              View Docs
            </Link>
          </div>
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="border-t border-border-subtle bg-surface-0/30">
        <div className="max-w-[1100px] mx-auto px-6 py-16">
          <p className="text-[13px] font-medium text-text-tertiary text-center mb-6">
            Your dashboard at a glance
          </p>
          <div className="rounded-xl border border-border-subtle overflow-hidden shadow-2xl shadow-black/40">
            <img
              src="/dashboard-preview.png"
              alt="AX dashboard showing metric cards across Output Quality, Prompt Efficiency, Agent Behavior, and Planning Effectiveness categories"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 py-20">
          <h2 className="text-[13px] font-medium text-accent uppercase tracking-wider mb-3">
            16 metrics across 4 categories
          </h2>
          <p className="text-[22px] font-semibold text-text-primary mb-12 max-w-[480px] leading-snug">
            Understand every dimension of your AI coding workflow
          </p>

          <div className="grid grid-cols-2 gap-4">
            <MetricCategory
              title="Output Quality"
              description="Is the code your agent produces actually good? First-pass acceptance rate, CI success, diff churn, and more."
              metrics={["First-Pass Acceptance Rate", "Post-Open Commits", "CI Success Rate", "Diff Churn"]}
            />
            <MetricCategory
              title="Prompt Efficiency"
              description="Are you getting results with fewer interactions and less cost? Token spend, message count, iteration depth."
              metrics={["Token Cost per PR", "Messages per PR", "Iteration Depth", "Unmerged Token Spend"]}
            />
            <MetricCategory
              title="Agent Behavior"
              description="How well is the agent navigating problems? Self-correction patterns, context usage, error recovery."
              metrics={["Self-Correction Rate", "Context Efficiency", "Error Recovery Efficiency"]}
            />
            <MetricCategory
              title="Planning Effectiveness"
              description="Does planning up front actually help? Coverage, deviation, and scope creep detection."
              metrics={["Plan-to-Implementation Coverage", "Plan Deviation Score", "Scope Creep Detection"]}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 py-20">
          <h2 className="text-[13px] font-medium text-accent uppercase tracking-wider mb-3">
            How it works
          </h2>
          <p className="text-[22px] font-semibold text-text-primary mb-12 max-w-[480px] leading-snug">
            Three steps, five minutes
          </p>

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
      <section className="border-t border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 py-20 text-center">
          <h2 className="text-[22px] font-semibold text-text-primary mb-3">
            Free to start, scales with your team
          </h2>
          <p className="text-[15px] text-text-secondary mb-8 max-w-[420px] mx-auto">
            Core metrics and GitHub integration included on the free plan.
            Upgrade for unlimited team members, developer comparison, and data export.
          </p>
          <Link
            href="/plans"
            className="px-5 py-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-primary font-medium text-[14px] transition-colors border border-border-subtle"
          >
            View Plans
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border-subtle bg-surface-0/30">
        <div className="max-w-[1100px] mx-auto px-6 py-16 text-center">
          <h2 className="text-[22px] font-semibold text-text-primary mb-3">
            Start measuring what matters
          </h2>
          <p className="text-[15px] text-text-secondary mb-6 max-w-[400px] mx-auto">
            Sign in with GitHub and push your first session data in under five minutes.
          </p>
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-[14px] transition-colors"
          >
            Get Started
          </Link>
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
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-5">
      <h3 className="text-[15px] font-medium text-text-primary mb-1.5">{title}</h3>
      <p className="text-[13px] text-text-secondary leading-relaxed mb-4">
        {description}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {metrics.map((m) => (
          <span
            key={m}
            className="text-[11px] text-text-tertiary bg-surface-2 rounded px-2 py-0.5"
          >
            {m}
          </span>
        ))}
      </div>
    </div>
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
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-5">
      <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center mb-3">
        <span className="text-accent text-[12px] font-semibold">{number}</span>
      </div>
      <h3 className="text-[15px] font-medium text-text-primary mb-1.5">{title}</h3>
      <p className="text-[13px] text-text-secondary leading-relaxed">
        {description}
      </p>
      {code && (
        <div className="mt-3 bg-surface-2 rounded-lg px-3 py-2">
          <code className="text-[12px] font-mono text-text-secondary">{code}</code>
        </div>
      )}
    </div>
  );
}
