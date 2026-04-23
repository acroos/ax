import Link from "next/link";
import { getMockMyMetrics } from "@/lib/mock/data";
import { OverviewMetricsGrid } from "@/components/overview-metrics-grid";
import { RangeToggle, type Range } from "@/components/range-toggle";
const VALID_RANGES: Range[] = ["7d", "30d", "90d"];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

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
        <OverviewMetricsGrid
          metrics={data.metrics}
          range={range}
          metricHref={(slug) => `/demo/me/metrics/${slug}?range=${range}`}
        />
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
