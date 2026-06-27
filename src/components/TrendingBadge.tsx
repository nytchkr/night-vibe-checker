export function TrendingBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F0568C] to-[#8B6CFF] px-2 py-0.5 text-xs font-black leading-none text-white shadow-[0_0_12px_rgba(240,86,140,0.28)] ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#14141A] venue-trending-dot" aria-hidden="true" />
      🔥 Trending
    </span>
  );
}

export default TrendingBadge;
