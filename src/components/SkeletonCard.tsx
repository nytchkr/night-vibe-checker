export default function SkeletonCard() {
  return (
    <div
      className="relative flex min-h-[236px] overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.035] p-4 shadow-lg shadow-black/10 backdrop-blur-sm sm:min-h-[126px] sm:flex-row sm:items-center"
      role="status"
      aria-label="Loading venue card"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" aria-hidden="true" />
      <div className="relative flex w-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="aspect-video w-full shrink-0 rounded-xl bg-white/[0.08] sm:h-[72px] sm:w-[72px] sm:aspect-auto" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-44 rounded bg-white/[0.12]" />
              <div className="h-3 w-24 rounded bg-white/[0.08]" />
            </div>
            <div className="h-6 w-20 shrink-0 rounded-full bg-white/[0.08]" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-white/[0.08]" />
            <div className="h-6 w-20 rounded-full bg-white/[0.08]" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="h-3 w-56 max-w-full rounded bg-white/[0.07]" />
            <div className="h-5 w-28 rounded-full bg-white/[0.07]" />
          </div>
        </div>
      </div>
    </div>
  );
}
