import { Badge } from "@/components/ui/badge";

// Changelog entries. Add new entries at the top.
const entries: {
  date: string;
  title: string;
  description: string;
  tag: "feature" | "fix" | "improvement";
}[] = [
  {
    date: "2026-04-16",
    title: "Metric set streamlined to 10",
    description:
      "Removed metrics that weren't pulling their weight: first-pass acceptance, test coverage, diff churn, messages/PR, self-correction rate, context efficiency, error recovery, and all planning metrics. The dashboard now focuses on 10 higher-signal metrics across three categories.",
    tag: "improvement",
  },
  {
    date: "2026-04-15",
    title: "Stripe webhook idempotency",
    description:
      "Webhook events are now processed idempotently, preventing duplicate billing state changes from retried deliveries.",
    tag: "fix",
  },
  {
    date: "2026-04-14",
    title: "Prevent duplicate checkout sessions",
    description:
      "Billing upgrades now guard against creating multiple Stripe checkout sessions when double-clicking the upgrade button.",
    tag: "fix",
  },
  {
    date: "2026-04-14",
    title: "Invite acceptance respects member limits",
    description:
      "Accepting an org invite now correctly checks the plan's member cap before granting access.",
    tag: "fix",
  },
  {
    date: "2026-04-13",
    title: "Session invalidation on membership changes",
    description:
      "Active sessions are now revoked when a member is removed from an org or when an org downgrades from Pro to Free.",
    tag: "improvement",
  },
  {
    date: "2026-04-13",
    title: "Cache invalidation after billing changes",
    description:
      "Dashboard data now refreshes immediately after plan upgrades — no more stale capability states.",
    tag: "fix",
  },
];

const tagClassNames: Record<(typeof entries)[number]["tag"], string> = {
  feature: "bg-info text-info-foreground",
  fix: "bg-attention text-attention-foreground",
  improvement: "bg-success text-success-foreground",
};

const tagLabels = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-[700px] px-6 py-20">
      <div className="mb-12">
        <h1 className="mb-3 font-serif text-[32px] font-semibold text-foreground">
          Changelog
        </h1>
        <p className="text-[15px] text-muted-foreground">
          What&apos;s new, fixed, and improved in AX.
        </p>
      </div>

      <div className="space-y-0">
        {entries.map((entry) => (
          <div
            key={`${entry.date}-${entry.title}`}
            className="relative border-l border-border pb-8 pl-6 last:pb-0"
          >
            {/* Timeline dot */}
            <div className="absolute left-0 top-1 -translate-x-[5px] size-2 rounded-full border-2 border-border bg-muted" />

            <div className="mb-1.5 flex items-center gap-2.5">
              <time className="font-serif text-[13px] italic text-muted-foreground">
                {entry.date}
              </time>
              <Badge
                className={`rounded-full border-transparent px-2 py-0 text-[10px] ${tagClassNames[entry.tag]}`}
              >
                {tagLabels[entry.tag]}
              </Badge>
            </div>
            <h3 className="mb-1 text-[15px] font-medium text-foreground">
              {entry.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {entry.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
