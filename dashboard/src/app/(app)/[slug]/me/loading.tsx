import {
  SkeletonPageHeader,
  SkeletonMetricCategory,
} from "@/components/skeleton";

export default function MyOverviewLoading() {
  return (
    <div>
      <SkeletonPageHeader />
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
    </div>
  );
}
