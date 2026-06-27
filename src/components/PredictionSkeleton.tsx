"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PredictionSkeleton() {
  return (
    <section
      className="gpu-layer rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4"
      role="status"
      aria-label="Loading..."
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-[150px]" />
      </div>

      <div className="mt-4 space-y-3">
        <Skeleton className="h-[78px] w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-[68px] rounded-2xl" />
          <Skeleton className="h-[68px] rounded-2xl" />
        </div>
      </div>

      <Skeleton className="mt-4 h-[11px] w-[180px]" />
    </section>
  );
}

export default PredictionSkeleton;
