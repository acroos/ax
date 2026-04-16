import Link from "next/link";

const features = [
  { name: "Core metrics (10 metrics)", free: true, pro: true },
  { name: "GitHub integration & webhooks", free: true, pro: true },
  { name: "90-day PR backfill", free: true, pro: true },
  { name: "Team members", free: "1", pro: "Unlimited" },
  { name: "Repositories", free: "2", pro: "Unlimited" },
  { name: "History retention", free: "30 days", pro: "Unlimited" },
  { name: "Data export", free: false, pro: true },
  { name: "Priority support", free: false, pro: true },
];

export default function PlansPage() {
  return (
    <div className="max-w-[900px] mx-auto px-6 py-20">
      <div className="mb-12">
        <h1 className="text-[28px] font-semibold text-text-primary mb-3">Plans</h1>
        <p className="text-[15px] text-text-secondary max-w-[480px]">
          Start free with core metrics for a single developer. Upgrade to Pro
          when your team is ready to measure together.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-16">
        {/* Free */}
        <div className="bg-surface-1 rounded-xl border border-border-subtle p-6">
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-text-primary">Free</h2>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[32px] font-semibold text-text-primary">$0</span>
              <span className="text-[13px] text-text-tertiary">forever</span>
            </div>
            <p className="mt-2 text-[13px] text-text-secondary">
              Core metrics for individual developers. No credit card required.
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full text-center px-4 py-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-primary font-medium text-[13px] transition-colors border border-border-subtle"
          >
            Get Started
          </Link>
        </div>

        {/* Pro */}
        <div className="bg-surface-1 rounded-xl border border-accent/30 p-6">
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-text-primary">Pro</h2>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[32px] font-semibold text-text-primary">$20</span>
              <span className="text-[13px] text-text-tertiary">/ member / month</span>
            </div>
            <p className="mt-2 text-[13px] text-text-secondary">
              Unlimited team members, full history, and advanced features.
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full text-center px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-[13px] transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>

      {/* Feature comparison table */}
      <div>
        <h2 className="text-[15px] font-medium text-text-primary mb-4">
          Feature comparison
        </h2>
        <div className="bg-surface-1 rounded-xl border border-border-subtle overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px] border-b border-border-subtle">
            <div className="px-5 py-3 text-[12px] font-medium text-text-tertiary uppercase tracking-wider">
              Feature
            </div>
            <div className="px-5 py-3 text-[12px] font-medium text-text-tertiary uppercase tracking-wider text-center">
              Free
            </div>
            <div className="px-5 py-3 text-[12px] font-medium text-text-tertiary uppercase tracking-wider text-center">
              Pro
            </div>
          </div>
          {features.map((f, i) => (
            <div
              key={f.name}
              className={`grid grid-cols-[1fr_120px_120px] ${
                i < features.length - 1 ? "border-b border-border-subtle" : ""
              }`}
            >
              <div className="px-5 py-3 text-[13px] text-text-secondary">
                {f.name}
              </div>
              <div className="px-5 py-3 text-[13px] text-center">
                <FeatureValue value={f.free} />
              </div>
              <div className="px-5 py-3 text-[13px] text-center">
                <FeatureValue value={f.pro} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline-block text-green">
        <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (value === false) {
    return <span className="text-text-tertiary">&mdash;</span>;
  }
  return <span className="text-text-secondary">{value}</span>;
}
