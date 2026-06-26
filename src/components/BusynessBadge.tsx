import type { BusynessSource } from "@/types";

type Props = {
  source: BusynessSource | null | undefined;
  computedAt?: string | null;
};

export function BusynessBadge({ source, computedAt = null }: Props) {
  const label = source ?? null;
  void computedAt;

  if (label === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold text-[#F4F5F8] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.75)]" />
        LIVE
      </span>
    );
  }

  if (label === "forecast") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#9CA2AE] backdrop-blur-sm transition-all duration-200 ease-out">
        <span className="h-1.5 w-1.5 rounded-full bg-[#646B79]" />
        FORECAST
      </span>
    );
  }

  if (label === "crowd") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#9CA2AE] backdrop-blur-sm transition-all duration-200 ease-out">
        <span className="h-1.5 w-1.5 rounded-full bg-[#8B6CFF]" />
        CROWD
      </span>
    );
  }

  return null;
}

export default BusynessBadge;
