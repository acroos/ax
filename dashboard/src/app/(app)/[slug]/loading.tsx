import {
  SkeletonPageHeader,
  SkeletonMetricCategory,
} from "@/components/skeleton";

// Mirrors /[slug]/page.tsx:
// header + Output Quality (6) + Prompt Efficiency (5) + Agent Behavior (6)
// We omit the optional Planning Effectiveness row (only shown when data exists).
export default function OrgOverviewLoading() {
  return (
    <div>
      <SkeletonPageHeader />
      <SkeletonMetricCategory count={6} />
      <SkeletonMetricCategory count={5} />
      <SkeletonMetricCategory count={6} />
    </div>
  );
}
