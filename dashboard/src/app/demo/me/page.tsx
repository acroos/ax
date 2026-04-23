import Link from "next/link";
import { useId } from "react";
import { getMockMyMetrics } from "@/lib/mock/data";
import type { SparklinePoint } from "@/lib/db";
import {
  CATEGORIES,
  DISPLAYED_METRICS,
  formatMetricValue,
} from "@/lib/metric-defs";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { RangeToggle, type Range } from "@/components/range-toggle";
const VALID_RANGES: Range[] = ["7d", "30d", "90d"];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

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
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-card from-60% to-transparent pt-8 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
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

export default async function DemoMyOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";

  const days = RANGE_DAYS[range];
  const data = getMockMyMetrics(days);

  const m = (slug: string) => data.metrics[slug]?.current ?? null;
  const prior = (slug: string) => data.metrics[slug]?.prior ?? null;
  const spark = (slug: string) => data.metrics[slug]?.sparkline;
  const metricHref = (slug: string) => `/demo/me/metrics/${slug}?range=${range}`;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
            My Dashboard
          </h1>
          <RangeToggle current={range} />
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {data.totalSessions} session
          {data.totalSessions !== 1 && "s"}
          {data.totalPRs > 0 && (
            <>, {data.totalPRs} finalized PR
            {data.totalPRs !== 1 && "s"}</>
          )} in past {range}
        </p>
      </div>

      {data.totalPRs === 0 && data.totalSessions === 0 ? (
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
      ) : (
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
      )}

      <div className="mt-6">
        <Link
          href="/demo/me/prs"
          className="text-[13px] text-primary transition-colors hover:underline"
        >
          View all my pull requests →
        </Link>
      </div>
    </div>
  );
}
