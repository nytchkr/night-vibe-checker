function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonVenueDetail() {
  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] pb-56" role="status" aria-label="Loading..." aria-live="polite" aria-atomic="true">
      <span className="sr-only">Loading...</span>
      <div className="w-full border-b border-white/[0.06] bg-[#0A0A0E]">
        <div className="relative min-h-[340px] w-full overflow-hidden bg-white/[0.06] sm:min-h-[420px]">
          <SkeletonBlock className="absolute inset-0 h-full w-full rounded-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-[#0A0A0E]" aria-hidden="true" />
          <div className="absolute left-4 top-4 h-11 w-11 animate-pulse rounded-full bg-white/[0.06]" aria-hidden="true" />
          <div className="absolute right-4 top-4 flex gap-2" aria-hidden="true">
            <div className="h-11 w-11 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-11 w-11 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <SkeletonBlock className="h-7 w-20 rounded-full" />
              <SkeletonBlock className="h-7 w-14 rounded-full" />
              <SkeletonBlock className="h-8 w-32 rounded-full" />
            </div>
            <SkeletonBlock className="mt-4 h-11 w-4/5 max-w-[22rem] rounded-lg" />
            <SkeletonBlock className="mt-3 h-4 w-5/6 max-w-[24rem]" />
            <div className="mt-3 flex gap-2">
              <SkeletonBlock className="h-7 w-24 rounded-full" />
              <SkeletonBlock className="h-7 w-28 rounded-full" />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 pb-6 pt-5">
          <div className="mt-5 grid gap-3">
            <SkeletonBlock className="h-12 w-full rounded-full" />
            <SkeletonBlock className="h-12 w-full rounded-full" />
          </div>

          <SkeletonBlock className="mt-4 h-[78px] w-full rounded-2xl" />
        </div>
      </div>

      <div className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-lg gap-3 overflow-hidden px-4 py-3">
          <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-4 w-8" />
            </div>
            <SkeletonBlock className="mt-4 h-3 w-full rounded-full" />
            <SkeletonBlock className="mt-2 h-3 w-2/3 rounded-full" />
          </div>
          <div className="min-w-[13rem] rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3">
            <SkeletonBlock className="h-3 w-16" />
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
              <SkeletonBlock className="h-full w-1/2 rounded-none" />
              <SkeletonBlock className="h-full w-1/2 rounded-none" />
            </div>
            <div className="mt-3 flex justify-between">
              <SkeletonBlock className="h-3 w-12" />
              <SkeletonBlock className="h-3 w-12" />
            </div>
          </div>
          <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.06] p-3">
            <SkeletonBlock className="h-3 w-14" />
            <SkeletonBlock className="mt-4 h-5 w-24" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-4 py-5">
        <SkeletonBlock className="h-[76px] w-full rounded-2xl" />
        <div className="space-y-4">
          <SkeletonBlock className="h-4 w-24" />
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <SkeletonBlock className="h-3 w-full rounded-full" />
            <SkeletonBlock className="mt-2 h-3 w-2/3 rounded-full" />
            <SkeletonBlock className="mt-4 h-12 w-full rounded-full" />
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.06] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
              <SkeletonBlock className="h-full w-1/2 rounded-none" />
              <SkeletonBlock className="h-full w-1/2 rounded-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
