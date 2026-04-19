import {
  SkeletonPageHeader,
  SkeletonMetricCategory,
} from "@/components/skeleton";

export default function TeamOverviewLoading() {
  return (
    <div>
      <SkeletonPageHeader />
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
      <SkeletonMetricCategory count={3} />
    </div>
  );
}
