function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gradient-to-r from-white/5 via-white/20 to-white/5 ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonVenueDetail() {
  return (
    <div className="min-h-screen bg-[#0A0A0E] pb-56" role="status" aria-label="Loading venue">
      <div className="w-full border-b border-white/[0.06] bg-[#0A0A0E]">
        <div className="relative h-[200px] w-full overflow-hidden bg-white/10">
          <SkeletonBlock className="h-full w-full rounded-none" />
          <div className="absolute left-4 top-4 h-11 w-11 rounded-full bg-white/10" aria-hidden="true" />
          <div className="absolute right-4 top-4 flex gap-2" aria-hidden="true">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div className="h-11 w-11 rounded-full bg-white/10" />
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 pb-6 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-6 w-24 rounded-full" />
            <SkeletonBlock className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonBlock className="mt-4 h-9 w-3/4 rounded-lg" />
          <SkeletonBlock className="mt-3 h-4 w-5/6" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />

          <div className="mt-5 grid gap-3">
            <SkeletonBlock className="h-12 w-full rounded-full" />
            <SkeletonBlock className="h-12 w-full rounded-full" />
          </div>

          <SkeletonBlock className="mt-4 h-20 w-full rounded-2xl" />
        </div>
      </div>

      <div className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-lg gap-3 overflow-hidden px-4 py-3">
          <SkeletonBlock className="h-24 min-w-[9.5rem] rounded-2xl" />
          <SkeletonBlock className="h-24 min-w-[13rem] rounded-2xl" />
          <SkeletonBlock className="h-24 min-w-[9.5rem] rounded-2xl" />
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-4 py-5">
        <SkeletonBlock className="h-24 w-full rounded-2xl" />
        <div className="space-y-4">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-40 w-full rounded-2xl" />
          <SkeletonBlock className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
