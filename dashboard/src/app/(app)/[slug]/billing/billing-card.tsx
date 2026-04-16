"use client";

import { useState } from "react";
import type { BillingInfo } from "@/lib/db";

function UsageBar({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number | null;
}) {
  const isUnlimited = max === null;
  const pct = isUnlimited ? 0 : max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const atLimit = !isUnlimited && current >= (max ?? 0);

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[13px]">
        <span className="text-text-secondary">{label}</span>
        <span className={atLimit ? "text-orange-400 font-medium" : "text-text-tertiary"}>
          {current} / {isUnlimited ? "Unlimited" : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              atLimit ? "bg-orange-400" : "bg-accent"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  if (plan === "pro") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/15 text-accent border border-accent/25">
        Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-text-secondary border border-border-subtle">
      Free
    </span>
  );
}

const PRO_FEATURES = [
  { key: "seat_pricing", label: "$20 per seat / month" },
  { key: "compare_developers", label: "Developer comparison" },
  { key: "export_data", label: "Data export" },
  { key: "priority_support", label: "Priority support" },
  { key: "max_repos", label: "Unlimited repositories" },
  { key: "history_days", label: "Full historical data" },
];

function formatDollars(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function BillingCard({
  billing,
  slug,
  isAdmin,
}: {
  billing: BillingInfo;
  slug: string;
  isAdmin: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFree = billing.plan.name === "free";
  const isPro = billing.plan.name === "pro";
  const caps = billing.plan.capabilities;
  const sub = billing.subscription;
  const willCancel = sub?.cancel_at_period_end;

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/billing/checkout`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start checkout");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/billing/portal`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to open billing portal");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Current Plan</h2>
            <div className="flex items-center gap-2.5 mt-2">
              <PlanBadge plan={billing.plan.name} />
              {willCancel && (
                <span className="text-xs text-yellow-400">
                  Cancels at period end
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <div>
              {isFree ? (
                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="px-4 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Upgrade to Pro"}
                </button>
              ) : (
                <button
                  onClick={handleManage}
                  disabled={loading}
                  className="px-4 py-2 bg-surface-2 hover:bg-surface-2/80 text-text-primary text-sm font-medium rounded-lg border border-border-subtle transition-colors disabled:opacity-50"
                >
                  {loading ? "Loading..." : "Manage Billing"}
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {sub && (
          <div className="space-y-1.5">
            {isPro && (
              <div className="text-sm text-text-primary">
                {sub.quantity} {sub.quantity === 1 ? "seat" : "seats"}
                <span className="text-text-tertiary"> · </span>
                {formatDollars(sub.quantity * sub.seat_price_cents)}/month
              </div>
            )}
            <div className="text-xs text-text-tertiary">
              {sub.status === "active" && !willCancel && (
                <>Next billing date: {new Date(sub.current_period_end).toLocaleDateString()}</>
              )}
              {sub.status === "past_due" && (
                <span className="text-orange-400">Payment past due — please update your payment method.</span>
              )}
              {willCancel && (
                <span className="text-yellow-400">
                  Access continues until {new Date(sub.current_period_end).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Usage</h2>
        <div className="space-y-3">
          <UsageBar
            label="Team members"
            current={billing.usage.members}
            max={typeof caps.max_members === "number" ? caps.max_members : null}
          />
          <UsageBar
            label="Repositories"
            current={billing.usage.repos}
            max={typeof caps.max_repos === "number" ? caps.max_repos : null}
          />
        </div>
      </div>

      {/* Feature comparison (free plan only) */}
      {isFree && (
        <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
          <h2 className="text-sm font-medium text-text-primary">
            Included with Pro
          </h2>
          <ul className="space-y-2.5">
            {PRO_FEATURES.map((f) => (
              <li key={f.key} className="flex items-center gap-2.5 text-[13px]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent flex-shrink-0">
                  <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-text-secondary">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
