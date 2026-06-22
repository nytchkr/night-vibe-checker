import type { BusynessSource } from "@/types";

type Props = {
  source: BusynessSource | null | undefined;
  computedAt?: string | null;
};

export function BusynessBadge({ source, computedAt = null }: Props) {
  const label = source ?? null;
  void computedAt;

  if (label === "live" || label === "crowd") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold text-[#F4F5F8]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.75)]" />
        LIVE
      </span>
    );
  }

  if (label === "forecast") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#9CA2AE]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#646B79]" />
        FORECAST
      </span>
    );
  }

  return null;
}

export default BusynessBadge;
