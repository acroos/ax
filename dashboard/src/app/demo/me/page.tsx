export const runtime = "edge";

import Link from "next/link";
import { getMockMyMetrics } from "@/lib/mock/data";
import type { SparklinePoint } from "@/lib/db";
import { METRIC_DEFS } from "@/lib/metric-defs";
import { SectionDivider } from "@/components/section-divider";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { ClientTooltip } from "@/components/client-tooltip";
import { RangeToggle, type Range } from "@/components/range-toggle";

const METRIC_INFO = Object.fromEntries(METRIC_DEFS.map((d) => [d.slug, d]));
const VALID_RANGES: Range[] = ["7d", "30d", "90d"];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

function MetricCard({
  label,
  value,
  detail,
  tooltip,
  href,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
  href?: string;
  delta?: string;
  sparkline?: SparklinePoint[];
}) {
  const card = (
    <Card
      className={`group gap-0 p-5 transition-colors ${
        href ? "hover:border-primary/30 hover:bg-accent/40 cursor-pointer" : ""
      }`}
    >
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
            <Sparkline data={sparkline} className="h-full w-full" />
          )}
        </div>
        {detail && (
          <div className="mt-2 text-[12px] text-muted-foreground">{detail}</div>
        )}
        {tooltip && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-card from-60% to-transparent pt-8 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <p className="text-[12px] leading-relaxed text-muted-foreground/70">
              {tooltip}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function fmt(n: number | null, decimals = 1): string {
  if (n === null) return "\u2014";
  return n.toFixed(decimals);
}
function fmtPct(n: number | null): string {
  if (n === null) return "\u2014";
  return `${Math.round(n * 100)}%`;
}
function fmtCost(n: number | null): string {
  if (n === null) return "\u2014";
  return `$${n.toFixed(2)}`;
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
  const metricHref = (slug: string) => `/demo/metrics/${slug}`;
  const tip = (slug: string) => {
    const def = METRIC_INFO[slug];
    return def ? { tooltip: def.tooltip } : {};
  };

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
          {data.totalPRs} finalized PR
          {data.totalPRs !== 1 && "s"} in past {range}
        </p>
      </div>

      {data.totalPRs === 0 ? (
        <div className="flex h-[60vh] items-center justify-center">
          <div className="space-y-3 text-center">
            <h2 className="text-lg font-medium text-foreground">
              No finalized PRs yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Metrics appear once your pull requests are merged or closed.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Output Quality */}
          <div className="mb-8">
            <SectionDivider label="Output Quality" />
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Avg Post-Open Commits" value={fmt(m("post-open-commits"))} delta={fmtDelta(m("post-open-commits"), prior("post-open-commits"), (n) => fmt(n), range)} sparkline={spark("post-open-commits")} detail="Lower is better" href={metricHref("post-open-commits")} {...tip("post-open-commits")} />
              <MetricCard label="CI Success Rate" value={fmtPct(m("ci-success-rate"))} delta={fmtDelta(m("ci-success-rate"), prior("ci-success-rate"), fmtPct, range)} sparkline={spark("ci-success-rate")} detail="First-run pass rate" href={metricHref("ci-success-rate")} {...tip("ci-success-rate")} />
              <MetricCard label="Avg Line Revisit Rate" value={fmt(m("line-revisit-rate"), 2)} delta={fmtDelta(m("line-revisit-rate"), prior("line-revisit-rate"), (n) => fmt(n, 2), range)} sparkline={spark("line-revisit-rate")} detail="Cross-PR file overlap" href={metricHref("line-revisit-rate")} {...tip("line-revisit-rate")} />
            </div>
          </div>

          {/* Prompt Efficiency */}
          <div className="mb-8">
            <SectionDivider label="Prompt Efficiency" />
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Avg Iteration Depth" value={fmt(m("iteration-depth"), 0)} delta={fmtDelta(m("iteration-depth"), prior("iteration-depth"), (n) => fmt(n, 0), range)} sparkline={spark("iteration-depth")} detail="Human-agent turn pairs" href={metricHref("iteration-depth")} {...tip("iteration-depth")} />
              <MetricCard label="Avg Token Cost" value={fmtCost(m("token-cost-per-pr"))} delta={fmtDelta(m("token-cost-per-pr"), prior("token-cost-per-pr"), fmtCost, range)} sparkline={spark("token-cost-per-pr")} detail={data.sessionDataCount > 0 ? `${data.sessionDataCount} of ${data.totalPRs} PRs with session data` : undefined} href={metricHref("token-cost-per-pr")} {...tip("token-cost-per-pr")} />
              <MetricCard label="Avg Cache Hit Rate" value={fmtPct(m("cache-hit-rate"))} delta={fmtDelta(m("cache-hit-rate"), prior("cache-hit-rate"), fmtPct, range)} sparkline={spark("cache-hit-rate")} detail="Prompt cache utilization" href={metricHref("cache-hit-rate")} {...tip("cache-hit-rate")} />
            </div>
          </div>

          {/* Agent Behavior */}
          <div className="mb-8">
            <SectionDivider label="Agent Behavior" />
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Avg Sidechain Rate" value={fmtPct(m("sidechain-rate"))} delta={fmtDelta(m("sidechain-rate"), prior("sidechain-rate"), fmtPct, range)} sparkline={spark("sidechain-rate")} detail="Dead-end reasoning paths" href={metricHref("sidechain-rate")} {...tip("sidechain-rate")} />
              <MetricCard label="Avg Re-Read Rate" value={fmt(m("re-read-rate"), 2)} delta={fmtDelta(m("re-read-rate"), prior("re-read-rate"), (n) => fmt(n, 2), range)} sparkline={spark("re-read-rate")} detail="File read redundancy" href={metricHref("re-read-rate")} {...tip("re-read-rate")} />
              <MetricCard label="Avg Autonomy Score" value={fmt(m("autonomy-score"), 1)} delta={fmtDelta(m("autonomy-score"), prior("autonomy-score"), (n) => fmt(n, 1), range)} sparkline={spark("autonomy-score")} detail="Agent independence ratio" href={metricHref("autonomy-score")} {...tip("autonomy-score")} />
            </div>
          </div>
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
