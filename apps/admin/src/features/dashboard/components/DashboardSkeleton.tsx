import { Skeleton } from "@woobe/ui";

/** First-load placeholder mirroring the real layout (KPI grid, a large chart, two-up panels) so nothing jumps when data arrives. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        <Skeleton className="col-span-2 h-28 lg:col-span-3" />
        <Skeleton className="col-span-2 h-28 lg:col-span-3" />
        <Skeleton className="h-28 lg:col-span-2" />
        <Skeleton className="h-28 lg:col-span-2" />
        <Skeleton className="h-28 lg:col-span-2" />
        <Skeleton className="h-24 lg:col-span-4" />
        <Skeleton className="h-24 lg:col-span-4" />
        <Skeleton className="col-span-2 h-24 lg:col-span-4" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-64" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
