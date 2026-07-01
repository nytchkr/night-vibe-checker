function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/[0.06] ${className}`} aria-hidden="true" />;
}

export default function SkeletonCard() {
  return (
    <div
      className="relative flex min-h-[236px] overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.035] p-4 shadow-lg shadow-black/10 backdrop-blur-sm sm:h-[126px] sm:min-h-0 sm:flex-row sm:items-center"
      role="status"
      aria-label="Loading venue card"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">Loading venue card</span>
      <div className="relative flex w-full flex-col gap-3 sm:flex-row sm:items-center">
        <SkeletonBlock className="aspect-video w-full shrink-0 rounded-xl sm:h-[72px] sm:w-[72px] sm:aspect-auto" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SkeletonBlock className="h-4 w-44 max-w-[70%] rounded" />
                <SkeletonBlock className="h-5 w-16 shrink-0 rounded-full" />
              </div>
              <SkeletonBlock className="h-5 w-20 shrink-0 rounded-full" />
            </div>
            <SkeletonBlock className="h-3 w-24 rounded" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-5 w-20 rounded-full" />
              <SkeletonBlock className="h-4 w-12 rounded" />
            </div>
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-6 w-28 rounded-full" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SkeletonBlock className="h-4 w-56 max-w-full rounded" />
            <SkeletonBlock className="h-4 w-28 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
