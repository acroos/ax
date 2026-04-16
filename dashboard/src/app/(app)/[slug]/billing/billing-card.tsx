"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import type { BillingInfo } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
        <span className="text-muted-foreground">{label}</span>
        <span className={atLimit ? "font-medium text-attention" : "text-muted-foreground"}>
          {current} / {isUnlimited ? "Unlimited" : max}
        </span>
      </div>
      {!isUnlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  if (plan === "pro") {
    return <Badge>Pro</Badge>;
  }
  return <Badge variant="secondary">Free</Badge>;
}

const PRO_FEATURES = [
  { key: "seat_pricing", label: "$20 per seat / month" },
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
      <Card className="gap-5 p-6">
        <CardContent className="space-y-5 p-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-foreground">Current Plan</h2>
              <div className="mt-2 flex items-center gap-2.5">
                <PlanBadge plan={billing.plan.name} />
                {willCancel && (
                  <span className="text-xs text-notice">
                    Cancels at period end
                  </span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div>
                {isFree ? (
                  <Button onClick={handleUpgrade} disabled={loading}>
                    {loading ? "Loading..." : "Upgrade to Pro"}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleManage} disabled={loading}>
                    {loading ? "Loading..." : "Manage Billing"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {sub && (
            <div className="space-y-1.5">
              {isPro && (
                <div className="text-sm text-foreground">
                  {sub.quantity} {sub.quantity === 1 ? "seat" : "seats"}
                  <span className="text-muted-foreground"> · </span>
                  {formatDollars(sub.quantity * sub.seat_price_cents)}/month
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {sub.status === "active" && !willCancel && (
                  <>Next billing date: {new Date(sub.current_period_end).toLocaleDateString()}</>
                )}
                {sub.status === "past_due" && (
                  <span className="text-attention">Payment past due — please update your payment method.</span>
                )}
                {willCancel && (
                  <span className="text-notice">
                    Access continues until {new Date(sub.current_period_end).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage */}
      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-sm font-medium text-foreground">Usage</h2>
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
        </CardContent>
      </Card>

      {/* Feature comparison (free plan only) */}
      {isFree && (
        <Card className="p-6">
          <CardContent className="space-y-4 p-0">
            <h2 className="text-sm font-medium text-foreground">
              Included with Pro
            </h2>
            <ul className="space-y-2.5">
              {PRO_FEATURES.map((f) => (
                <li key={f.key} className="flex items-center gap-2.5 text-[13px]">
                  <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                  <span className="text-muted-foreground">{f.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
