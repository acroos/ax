import fs from "fs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import pathUtil from "path";

import { Markdown } from "@/components/markdown";
import { RangeToggle, type Range } from "@/components/range-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getMockMyPRs, getMockMySessions } from "@/lib/mock/data";
import { MetricDetailBody, BooleanPanel } from "@/components/metric-detail-content";
import { getMetricDef } from "@/lib/metric-defs";
import {
  extractPRValues,
  extractSessionValues,
  filterByRange,
  filterSessionsByRange,
  type PRValue,
  type SessionValue,
} from "@/lib/metric-utils";

const metricsDir = pathUtil.join(process.cwd(), "..", "docs", "metrics");

const VALID_RANGES: Range[] = ["7d", "30d", "90d"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DemoMyMetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { metric } = await params;
  const { range: rangeParam } = await searchParams;
  const range: Range = VALID_RANGES.includes(rangeParam as Range)
    ? (rangeParam as Range)
    : "30d";
  const def = getMetricDef(metric);

  if (!def) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-medium text-foreground">
            Metric not found
          </h2>
          <p className="text-sm text-muted-foreground">
            No metric with slug{" "}
            <code className="text-primary">{metric}</code>
          </p>
        </div>
      </div>
    );
  }

  let docContent = "";
  try {
    const filePath = pathUtil.join(metricsDir, `${def.docSlug}.md`);
    docContent = fs.readFileSync(filePath, "utf-8");
  } catch {
    // Doc file missing — not critical
  }

  const isSession = def.source === "session";
  const allValues = isSession
    ? extractSessionValues(getMockMySessions(), def)
    : extractPRValues(getMockMyPRs(), def);
  const values = isSession
    ? filterSessionsByRange(allValues as SessionValue[], range)
    : filterByRange(allValues as PRValue[], range);

  return (
    <div>
      <Link
        href="/demo/me"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Back to My Dashboard
      </Link>

      <div className="mb-6 mt-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              {def.label}
            </h1>
            <Badge variant="outline" className="text-muted-foreground">
              {def.category}
            </Badge>
          </div>
          <RangeToggle current={range} />
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {values.length} {isSession ? "session" : "PR"}{values.length !== 1 && "s"} with data in past{" "}
          {range}
          {allValues.length > values.length && (
            <span className="text-muted-foreground/60">
              {" "}
              ({allValues.length} total)
            </span>
          )}
        </p>
      </div>

      {def.valueType === "boolean" ? (
        <BooleanPanel values={allValues as PRValue[]} def={def} />
      ) : values.length === 0 ? (
        <div className="mb-6 flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground">
          No data for this metric in the selected period.
        </div>
      ) : (
        <MetricDetailBody
          values={values}
          allValues={allValues}
          def={def}
          range={range}
        />
      )}

      {docContent && (
        <Card className="p-6">
          <CardContent className="p-0">
            <h2 className="mb-4 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              About This Metric
            </h2>
            <Markdown content={docContent} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
