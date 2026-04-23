export const runtime = "edge";

import Link from "next/link";
import { Suspense } from "react";
import { getMyMetricsAsync } from "@/lib/db";
import type { AggregateMetrics, SparklinePoint } from "@/lib/db";
import {
  CATEGORIES,
  DISPLAYED_METRICS,
  formatMetricValue,
} from "@/lib/metric-defs";
import { Skeleton, SkeletonMetricCategory } from "@/components/skeleton";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { ClientTooltip } from "@/components/client-tooltip";
import { RangeToggle, type Range } from "@/components/range-toggle";

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

function MetricCard({
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
  const card = (
    <Card
      className={`gap-0 p-5 transition-colors ${
        href ? "hover:border-primary/30 hover:bg-accent/40 cursor-pointer" : ""
      }`}
    >
      <CardContent className="p-0">
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
      </CardContent>
    </Card>
  );

  const tipped = tooltip ? (
    <ClientTooltip content={<p>{tooltip}</p>} side="top" className="max-w-[280px]">
      {card}
    </ClientTooltip>
  ) : (
    card
  );

  return href ? (
    <Link href={href} className="block">
      {tipped}
    </Link>
  ) : (
    tipped
  );
}

function fmtDelta(
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

export default async function MyOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  const metricsPromise = getMyMetricsAsync(slug, range);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            My Dashboard
          </h1>
          <RangeToggle current={range} />
        </div>
        <Suspense fallback={<Skeleton className="mt-1 h-4 w-64" />}>
          <MySubtitle metricsPromise={metricsPromise} range={range} />
        </Suspense>
      </div>

      <SectionErrorBoundary>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <MyMetricsBody
            metricsPromise={metricsPromise}
            slug={slug}
            range={range}
          />
        </Suspense>
      </SectionErrorBoundary>

      <div className="mt-6">
        <Link
          href={`/${slug}/me/prs`}
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all my pull requests →
        </Link>
      </div>
    </div>
  );
}

async function MySubtitle({
  metricsPromise,
  range,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  range: Range;
}) {
  let metrics: AggregateMetrics | null = null;
  try {
    metrics = await metricsPromise;
  } catch {
    // Metrics body's error boundary will show "No data yet"
  }
  return (
    <p className="mt-1 text-[13px] text-muted-foreground">
      {metrics !== null && (
        <>
          {metrics.totalSessions} session
          {metrics.totalSessions !== 1 && "s"}
          {metrics.totalPRs > 0 && (
            <>, {metrics.totalPRs} finalized PR
            {metrics.totalPRs !== 1 && "s"}</>
          )} in past {range}
        </>
      )}
    </p>
  );
}

function OverviewMetricsSkeleton() {
  return (
    <>
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
    </>
  );
}

function NoDataState() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="space-y-3 text-center">
        <h2 className="text-lg font-medium text-foreground">
          No data yet
        </h2>
        <p className="text-sm text-muted-foreground">
          Metrics appear once you push session data or your pull requests are merged or closed.
        </p>
      </div>
    </div>
  );
}

async function MyMetricsBody({
  metricsPromise,
  slug,
  range,
}: {
  metricsPromise: Promise<AggregateMetrics>;
  slug: string;
  range: Range;
}) {
  const data = await metricsPromise;
  if (data.totalPRs === 0 && data.totalSessions === 0) return <NoDataState />;

  const m = (metricSlug: string) => data.metrics[metricSlug]?.current ?? null;
  const prior = (metricSlug: string) => data.metrics[metricSlug]?.prior ?? null;
  const spark = (metricSlug: string) => data.metrics[metricSlug]?.sparkline;

  const metricHref = (metricSlug: string) =>
    `/${slug}/me/metrics/${metricSlug}?range=${range}`;

  return (
    <>
      {CATEGORIES.map((category) => {
        const categoryMetrics = DISPLAYED_METRICS.filter(
          (d) => d.category === category,
        );
        if (categoryMetrics.length === 0) return null;

        return (
          <div key={category} className="mb-8">
            <SectionDivider label={category} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryMetrics.map((def) => {
                const current = m(def.slug);
                const priorVal = prior(def.slug);
                const formatter = (n: number | null) =>
                  n === null ? "\u2014" : formatMetricValue(n, def);

                return (
                  <MetricCard
                    key={def.slug}
                    label={def.label}
                    value={formatter(current)}
                    delta={fmtDelta(current, priorVal, formatter, range)}
                    sparkline={spark(def.slug)}
                    href={metricHref(def.slug)}
                    tooltip={def.tooltip}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
