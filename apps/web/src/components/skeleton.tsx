import { Skeleton, TableSkeleton } from "@/brand/ui-kit";

export { Skeleton, TableSkeleton };

/** KPI-card shaped placeholder. */
export function StatSkeleton() {
  return (
    <div role="status" aria-busy="true" className="rounded-xl border border-border/80 bg-card p-4 shadow-kx-1">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
    </div>
  );
}
