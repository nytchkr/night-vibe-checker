"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PredictionSkeleton() {
  return (
    <section
      className="rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4"
      role="status"
      aria-label="Loading AI forecast"
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-20 bg-white/10" />
        <Skeleton className="h-5 w-[150px] bg-white/10" />
      </div>

      <div className="mt-4 space-y-3">
        <Skeleton className="h-[78px] w-full rounded-2xl bg-[#8B6CFF]/10" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-[68px] rounded-2xl bg-white/10" />
          <Skeleton className="h-[68px] rounded-2xl bg-white/10" />
        </div>
      </div>

      <Skeleton className="mt-4 h-[11px] w-[180px] bg-white/10" />
    </section>
  );
}

export default PredictionSkeleton;
