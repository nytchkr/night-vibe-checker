import SkeletonCard from "@/components/SkeletonCard";

export default function ExploreLoading() {
  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] px-4 pb-24 pt-10 text-white" role="status" aria-label="Loading...">
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[50px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.045]" />
          <div className="h-[50px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.045]" />
        </div>
        <div className="mt-4 h-10 w-52 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-5 h-12 w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.06]" />
        <div className="mt-3 flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 min-w-24 animate-pulse rounded-full bg-white/[0.06]" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );
}
