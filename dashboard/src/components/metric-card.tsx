import Link from "next/link";
import { useId } from "react";
import type { SparklinePoint } from "@/lib/db";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

export function fmt(n: number | null, decimals = 1): string {
  if (n === null) return "\u2014";
  return n.toFixed(decimals);
}

export function fmtPct(n: number | null): string {
  if (n === null) return "\u2014";
  return `${Math.round(n * 100)}%`;
}

export function fmtCost(n: number | null): string {
  if (n === null) return "\u2014";
  return `$${n.toFixed(2)}`;
}

export function fmtHours(n: number | null): string {
  if (n === null) return "\u2014";
  return n < 1 ? `${Math.round(n * 60)} min` : `${n.toFixed(1)} hrs`;
}

export function fmtRate(n: number | null): string {
  if (n === null) return "\u2014";
  return `${n.toFixed(1)}/wk`;
}

export function fmtDelta(
  current: number | null,
  prior: number | null,
  formatter: (n: number | null) => string,
  rangeLabel: string,
): string | undefined {
  if (current === null || prior === null) return undefined;
  const diff = current - prior;
  if (Math.abs(diff) < 0.005) return undefined;
  const arrow = diff > 0 ? "\u2191" : "\u2193";
  return `${arrow} ${formatter(Math.abs(diff))} vs prior ${rangeLabel}`;
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

export function MetricCard({
  label,
  value,
  tooltip,
  href,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  tooltip?: string;
  href?: string;
  delta?: string;
  sparkline?: SparklinePoint[];
}) {
  const descriptionId = useId();

  const cardContent = (
    <CardContent className="relative p-0">
      <div className="mb-3 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mb-1 font-serif text-[28px] font-medium leading-none tracking-tight text-foreground [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
      </div>
      {delta && (
        <div className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {delta}
        </div>
      )}
      <div className="mt-4 h-16 w-full">
        {sparkline && sparkline.length > 0 && (
          <Sparkline data={sparkline} className="h-full w-full" label={label} />
        )}
      </div>
      {tooltip && (
        <div
          id={descriptionId}
          className="pointer-events-none absolute -inset-x-5 -bottom-5 rounded-b-xl bg-gradient-to-t from-card from-75% to-transparent px-5 pb-5 pt-8 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <p className="text-[12px] leading-relaxed text-muted-foreground/70">
            {tooltip}
          </p>
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block"
        aria-describedby={tooltip ? descriptionId : undefined}
      >
        <Card className="gap-0 p-5 transition-colors hover:border-primary/30 hover:bg-accent/40 cursor-pointer">
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card
      className="group gap-0 p-5 transition-colors"
      tabIndex={0}
      aria-describedby={tooltip ? descriptionId : undefined}
    >
      {cardContent}
    </Card>
  );
}
