import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] px-4 pb-24 pt-5 text-white" role="status" aria-label="Loading...">
      <div className="mx-auto w-full max-w-lg space-y-7">
        <section className="flex items-center gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-[18px]" />
          ))}
        </section>

        <Skeleton className="h-36 rounded-[18px]" />
        <Skeleton className="h-20 rounded-[18px]" />

        <section className="space-y-2">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-[16px]" />
          ))}
        </section>

        <section className="space-y-2">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-[16px]" />
          ))}
        </section>
      </div>
    </div>
  );
}
