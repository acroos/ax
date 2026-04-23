import {
  SkeletonPageHeader,
  SkeletonMetricCategory,
} from "@/components/skeleton";

// Mirrors /[slug]/page.tsx:
// header + Delivery + Session Effectiveness + Adoption Maturity
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
