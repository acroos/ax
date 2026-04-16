// Changelog entries. Add new entries at the top.
const entries: { date: string; title: string; description: string; tag: "feature" | "fix" | "improvement" }[] = [
  {
    date: "2026-04-16",
    title: "Metric set streamlined to 10",
    description: "Removed metrics that weren't pulling their weight: first-pass acceptance, test coverage, diff churn, messages/PR, self-correction rate, context efficiency, error recovery, and all planning metrics. The dashboard now focuses on 10 higher-signal metrics across three categories.",
    tag: "improvement",
  },
  {
    date: "2026-04-15",
    title: "Stripe webhook idempotency",
    description: "Webhook events are now processed idempotently, preventing duplicate billing state changes from retried deliveries.",
    tag: "fix",
  },
  {
    date: "2026-04-14",
    title: "Prevent duplicate checkout sessions",
    description: "Billing upgrades now guard against creating multiple Stripe checkout sessions when double-clicking the upgrade button.",
    tag: "fix",
  },
  {
    date: "2026-04-14",
    title: "Invite acceptance respects member limits",
    description: "Accepting an org invite now correctly checks the plan's member cap before granting access.",
    tag: "fix",
  },
  {
    date: "2026-04-13",
    title: "Session invalidation on membership changes",
    description: "Active sessions are now revoked when a member is removed from an org or when an org downgrades from Pro to Free.",
    tag: "improvement",
  },
  {
    date: "2026-04-13",
    title: "Cache invalidation after billing changes",
    description: "Dashboard data now refreshes immediately after plan upgrades — no more stale capability states.",
    tag: "fix",
  },
];

const tagStyles = {
  feature: "bg-accent/10 text-accent border-accent/20",
  fix: "bg-red-muted text-red border-red/20",
  improvement: "bg-green-muted text-green border-green/20",
};

const tagLabels = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
};

export default function ChangelogPage() {
  return (
    <div className="max-w-[700px] mx-auto px-6 py-20">
      <div className="mb-12">
        <h1 className="text-[28px] font-semibold text-text-primary mb-3">
          Changelog
        </h1>
        <p className="text-[15px] text-text-secondary">
          What&apos;s new, fixed, and improved in AX.
        </p>
      </div>

      <div className="space-y-0">
        {entries.map((entry) => (
          <div
            key={`${entry.date}-${entry.title}`}
            className="relative pl-6 pb-8 border-l border-border-subtle last:pb-0"
          >
            {/* Timeline dot */}
            <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-surface-3 border-2 border-border -translate-x-[5px]" />

            <div className="flex items-center gap-2.5 mb-1.5">
              <time className="text-[12px] text-text-tertiary font-mono">
                {entry.date}
              </time>
              <span
                className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${tagStyles[entry.tag]}`}
              >
                {tagLabels[entry.tag]}
              </span>
            </div>
            <h3 className="text-[15px] font-medium text-text-primary mb-1">
              {entry.title}
            </h3>
            <p className="text-[13px] text-text-secondary leading-relaxed">
              {entry.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
