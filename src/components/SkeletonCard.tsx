function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/[0.06] ${className}`} aria-hidden="true" />;
}

export default function SkeletonCard() {
  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.035] shadow-lg shadow-black/10 backdrop-blur-sm"
      role="status"
      aria-label="Loading venue card"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">Loading venue card</span>
      <SkeletonBlock className="aspect-[4/3] w-full" />
      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-3/4 rounded" />
          <SkeletonBlock className="h-3 w-full rounded" />
          <SkeletonBlock className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-4 w-24 rounded" />
          <SkeletonBlock className="h-3 w-12 rounded" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-6 w-28 rounded-full" />
          <SkeletonBlock className="h-1 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
