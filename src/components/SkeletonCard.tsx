export default function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.035] p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" aria-hidden="true" />
      <div className="relative mb-2 h-4 w-3/4 rounded bg-gradient-to-r from-white/[0.06] via-white/[0.14] to-white/[0.06]" />
      <div className="relative mb-3 h-3 w-1/2 rounded bg-gradient-to-r from-white/[0.05] via-white/[0.12] to-white/[0.05]" />
      <div className="flex gap-2">
        <div className="relative h-6 w-16 rounded-full bg-gradient-to-r from-white/[0.05] via-white/[0.12] to-white/[0.05]" />
        <div className="relative h-6 w-20 rounded-full bg-gradient-to-r from-white/[0.05] via-white/[0.12] to-white/[0.05]" />
      </div>
    </div>
  );
}
